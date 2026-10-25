"""Six frozen synthetic startup cases; subprocess deadline includes interpreter startup."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
CASES = ('fifo', 'directory', 'socket', 'new', 'empty', 'reopen')
WORKER = '''
import json, sys
from finevidence.review_ledger import ReviewLedger, ReviewError
try:
    ledger = ReviewLedger(sys.argv[1], 'Synthetic path operator')
    print(json.dumps({'outcome':'accepted', 'empty':ledger.list()['records'] == []}))
except ReviewError as error:
    print(json.dumps({'outcome':str(error), 'empty':False}))
except Exception as error:
    print(json.dumps({'outcome':type(error).__name__, 'empty':False}))
'''


def evaluate():
    rows = []
    for name in CASES:
        with tempfile.TemporaryDirectory(prefix='fe-path-') as temporary:
            directory = Path(temporary) / 'private'
            directory.mkdir(mode=0o700)
            path = directory / 'reviews.sqlite'
            sock = None
            try:
                if name == 'fifo': os.mkfifo(path, 0o600)
                elif name == 'directory': path.mkdir(mode=0o700)
                elif name == 'socket':
                    sock = socket.socket(socket.AF_UNIX)
                    sock.bind(str(path))
                    path.chmod(0o600)
                elif name == 'empty': path.touch(mode=0o600)
                elif name == 'reopen':
                    subprocess.run([sys.executable, '-c', WORKER, str(directory)], cwd=ROOT,
                                   check=True, capture_output=True, timeout=3)
                before = path.lstat() if path.exists() else None
                refusal = name in CASES[:3]
                before_bytes = path.read_bytes() if name == 'reopen' else None
                started = time.perf_counter()
                try:
                    child = subprocess.run([sys.executable, '-c', WORKER, str(directory)], cwd=ROOT,
                                           capture_output=True, text=True, timeout=3)
                    result = json.loads(child.stdout) if child.returncode == 0 else {'outcome':'child_failed'}
                except subprocess.TimeoutExpired:
                    result = {'outcome':'timeout'}
                seconds = time.perf_counter() - started
                after = path.lstat()
                preserved = before is None or (before.st_ino, before.st_mode) == (after.st_ino, after.st_mode)
                if before_bytes is not None: preserved = preserved and path.read_bytes() == before_bytes
                passed = preserved and (result['outcome'] == 'REVIEW_STORE_PATH' if refusal
                                        else result['outcome'] == 'accepted' and result.get('empty') is True)
                rows.append(dict(name=name, expected_refusal=refusal, outcome=result['outcome'],
                                 original_preserved=preserved, passed=passed, seconds=seconds))
            finally:
                if sock is not None: sock.close()
    return dict(classification='KNOWN_DEFECT_SYNTHETIC_DEVELOPMENT',
                code_sha=subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
                working_tree_dirty=bool(subprocess.check_output(['git','status','--porcelain'], cwd=ROOT).strip()),
                total=len(rows), passed=sum(r['passed'] for r in rows),
                expected_refusal_total=3, expected_refusal_passed=sum(r['passed'] for r in rows[:3]),
                regular_control_total=3, regular_control_passed=sum(r['passed'] for r in rows[3:]),
                model_calls=0, reported_tokens=0, unknown_usage_calls=0, hidden_cases=0,
                real_quality_labels=0, deadline_seconds=3, rows=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = evaluate()
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    return 0 if report['passed'] == report['total'] else 1


if __name__ == '__main__': raise SystemExit(main())
