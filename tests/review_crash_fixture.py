"""Test-only real SQLite process interruption. Never point this at user data."""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
from contextlib import contextmanager
from uuid import uuid4

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
from finevidence.review_ledger import ReviewLedger
from test_review_ledger import draft

OPERATOR = 'Synthetic crash operator'
MAGIC = bytes.fromhex('d9d505f920a163d7')


def interrupted_store(directory, action):
    ledger = ReviewLedger(directory, OPERATOR)
    original = dict(request_id=str(uuid4()), draft=draft(), observation='needs_changes', note='Committed control')
    active = ledger.mutate('record', original)
    second = dict(original, request_id=str(uuid4()), note='Previously revoked control')
    old = ledger.mutate('record', second)
    revoke = dict(request_id=str(uuid4()), record_id=old['record_id'], reason='Committed withdrawal')
    ledger.mutate('revoke', revoke)
    expected = ledger.list()
    body = (dict(original, request_id=str(uuid4()), note='意' * 2000)
            if action == 'record' else
            dict(request_id=str(uuid4()), record_id=active['record_id'], reason='Uncommitted withdrawal'))
    if action == 'record':
        body['draft'] = draft()
        body['draft']['provenance'].update(excerpt='120' + '财' * 3997, excerpt_end=4000)
    child = subprocess.Popen([sys.executable, __file__, str(directory), action], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        child.stdin.write(json.dumps(body)); child.stdin.close(); child.stdin = None
        ready, _, _ = select.select([child.stdout], [], [], 8)
        if not ready or child.stdout.readline().strip() != 'BEFORE_COMMIT':
            raise RuntimeError('Crash fixture did not reach COMMIT')
        child.kill(); child.communicate(timeout=5)
        assert child.returncode == -signal.SIGKILL
    finally:
        if child.poll() is None:
            child.kill(); child.communicate(timeout=5)
    journal = (Path(directory) / 'reviews.sqlite-journal').read_bytes()
    assert len(journal) > 512 and journal[:8] == MAGIC, 'Fixture must have a hot journal'
    return expected, original, revoke, body


if __name__ == '__main__':
    ledger = ReviewLedger(Path(sys.argv[1]), OPERATOR)
    normal = ledger.connection
    @contextmanager
    def connection():
        with normal() as db:
            db.execute('PRAGMA cache_size=1')
            def stop(op, name, *_):
                if op == 22 and name == 'COMMIT':
                    print('BEFORE_COMMIT', flush=True)
                    os.kill(os.getpid(), signal.SIGSTOP)
                return 0
            db.set_authorizer(stop)
            yield db
    ledger.connection = connection
    ledger.mutate(sys.argv[2], json.load(sys.stdin))
