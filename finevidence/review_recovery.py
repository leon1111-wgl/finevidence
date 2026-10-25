"""Offline, copy-only recovery of a stopped local review store (POSIX)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile
import time
from .review_ledger import ReviewError, fail, text, validate_store
from .service import ROOT

MAX_FILE_BYTES = 64 * 1024 * 1024
MAGIC = bytes.fromhex('d9d505f920a163d7')
MARKER = 'RECOVERY_INCOMPLETE'


def _private_directory(value):
    path = Path(value).expanduser()
    if path.is_symlink() or path.resolve().is_relative_to(ROOT.resolve()):
        fail('REVIEW_PRIVATE_DIRECTORY')
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        fail('REVIEW_PRIVATE_DIRECTORY')
    return path.resolve()


def _read_file(path):
    # Open nonblocking before fstat so a FIFO cannot hang a local recovery.
    try: fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        if path.is_symlink(): fail('REVIEW_PRIVATE_DIRECTORY')
        raise
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or before.st_mode & 0o077 or before.st_nlink != 1):
            fail('REVIEW_PRIVATE_DIRECTORY')
        if before.st_size > MAX_FILE_BYTES: fail('REVIEW_RECOVERY_TOO_LARGE')
        data = stream.read(MAX_FILE_BYTES + 1)
        after = os.fstat(stream.fileno())
        if len(data) > MAX_FILE_BYTES: fail('REVIEW_RECOVERY_TOO_LARGE')
        identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if identity(before) != identity(after) or len(data) != after.st_size:
            fail('REVIEW_RECOVERY_SOURCE_CHANGED')
        return data, identity(after)


def _snapshot(directory):
    # This is not a live SQLite backup. The caller must stop every writer first.
    # No connection is opened against the source, including on rejection.
    if (directory/MARKER).exists(): fail('REVIEW_RECOVERY_INCOMPLETE')
    for suffix in ('-wal', '-shm'):
        if os.path.lexists(directory/('reviews.sqlite'+suffix)):
            fail('REVIEW_RECOVERY_UNSUPPORTED')
    result = {'reviews.sqlite': _read_file(directory/'reviews.sqlite')}
    database = result['reviews.sqlite'][0]
    if len(database) < 100 or database[:16] != b'SQLite format 3\x00': fail('REVIEW_STORE_SCHEMA')
    if database[18:20] != b'\x01\x01': fail('REVIEW_RECOVERY_UNSUPPORTED')
    journal = directory/'reviews.sqlite-journal'
    if os.path.lexists(journal):
        result[journal.name] = _read_file(journal)
        data = result[journal.name][0]
        # SQLite stores the super-journal trailer with the same final magic.
        # Attached/multi-database transactions are outside this local v1 format.
        if len(data) <= 512 or data[:8] != MAGIC or data[-8:] == MAGIC:
            fail('REVIEW_RECOVERY_UNSUPPORTED')
    return result


def _recover_copy(directory, reviewer):
    # SQLite, not a home-grown page replayer, performs rollback only on the copy.
    db = sqlite3.connect(directory/'reviews.sqlite', timeout=1)
    deadline = time.monotonic() + 5
    db.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    try:
        db.execute('PRAGMA trusted_schema=OFF')
        if not validate_store(db, reviewer): fail('REVIEW_STORE_SCHEMA')
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]: fail('REVIEW_STORE_SCHEMA')
        if db.execute('PRAGMA foreign_key_check').fetchone() is not None: fail('REVIEW_STORE_SCHEMA')
    finally:
        db.close()


def _sync_directory(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def recover_review_store(source, reviewer, output_parent, *, stopped=False):
    """Return a separate restored directory; never modify/adopt the source."""
    if stopped is not True: fail('REVIEW_STOP_REQUIRED')
    reviewer = text(reviewer, 120)
    source = _private_directory(source); parent = _private_directory(output_parent)
    if parent == source or parent.is_relative_to(source): fail('REVIEW_PRIVATE_DIRECTORY')
    initial = _snapshot(source)
    directory = Path(tempfile.mkdtemp(prefix='review-recovered-', dir=parent))
    try:
        marker = directory/MARKER
        with marker.open('x') as stream:
            stream.write('Incomplete recovery. Keep the original database and journal.\n')
            stream.flush(); os.fsync(stream.fileno())
        _sync_directory(directory)
        for name, (data, _) in initial.items():
            fd = os.open(directory/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd,'wb') as stream:
                stream.write(data); stream.flush(); os.fsync(stream.fileno())
        _recover_copy(directory, reviewer)
        if _snapshot(source) != initial: fail('REVIEW_RECOVERY_SOURCE_CHANGED')
        recovered, _ = _read_file(directory/'reviews.sqlite')
        report = {'kind':'local_review_recovery', 'status':'REVIEW_RECOVERED_COPY',
                  'directory':str(directory), 'source_sha256':{name:hashlib.sha256(data).hexdigest() for name,(data,_) in initial.items()},
                  'recovered_sha256':hashlib.sha256(recovered).hexdigest(),
                  'financial_calculation_eligible':False,
                  'limits':'Stopped single-database rollback store only; no semantic or organization verification.'}
        with (directory/'recovery.json').open('x') as stream:
            stream.write(json.dumps(report,ensure_ascii=False,indent=2)+'\n'); stream.flush(); os.fsync(stream.fileno())
        marker.unlink(); _sync_directory(directory); _sync_directory(parent)
        return report
    except BaseException:
        # Only this newly allocated output is removed; the source is untouched.
        shutil.rmtree(directory)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output-parent', required=True)
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--stopped', action='store_true', help='Confirm every process writing the source has stopped')
    args = parser.parse_args(argv)
    try:
        report = recover_review_store(args.source,args.reviewer,args.output_parent,stopped=args.stopped)
    except (ReviewError, OSError, sqlite3.Error) as error:
        report = {'status':str(error) if isinstance(error,ReviewError) else 'REVIEW_RECOVERY_IO_ERROR',
                  'guidance':'Keep the original directory, database and journal together. Stop all writers; consult docs/LOCAL_REVIEW_LEDGER.md.'}
        print(json.dumps(report)); return 2
    print(json.dumps(report,ensure_ascii=False,indent=2)); return 0

if __name__ == '__main__': raise SystemExit(main())
