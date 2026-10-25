"""Five frozen synthetic recovery cases from the bbb94fc independent review."""
import argparse
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finevidence.review_ledger import ReviewLedger, ReviewError

CASES = (
    ('unrelated-v0', 0, 'CREATE TABLE unrelated (id INTEGER)', True),
    ('unrelated-v1', 1, 'CREATE TABLE unrelated (id INTEGER)', True),
    ('malformed-records-v1', 1, 'CREATE TABLE records (wrong TEXT)', True),
    ('unknown-v2', 2, 'CREATE TABLE unrelated (id INTEGER)', True),
    ('blank-new', 0, '', False),
)


def evaluate():
    rows = []
    for name, version, ddl, refusal in CASES:
        with tempfile.TemporaryDirectory(prefix='fe-store-evaluation-') as temporary:
            directory = Path(temporary) / 'private'
            directory.mkdir(mode=0o700)
            path = directory / 'reviews.sqlite'
            db = sqlite3.connect(path)
            try:
                if ddl:
                    db.execute(ddl)
                db.execute(f'PRAGMA user_version={version}')
                db.commit()
            finally:
                db.close()
            path.chmod(0o600)
            before = path.read_bytes()
            started = time.perf_counter()
            try:
                ledger = ReviewLedger(directory, 'Synthetic audit operator')
                outcome = 'accepted'
                empty = ledger.list()['records'] == []
            except ReviewError as error:
                outcome, empty = str(error), False
            except Exception as error:
                # Exception type only; no operator text, paths or database content.
                outcome, empty = type(error).__name__, False
            seconds = time.perf_counter() - started
            unchanged = path.read_bytes() == before
            passed = (outcome == 'REVIEW_STORE_SCHEMA' and unchanged) if refusal else (outcome == 'accepted' and empty)
            rows.append(dict(name=name, expected_refusal=refusal, outcome=outcome,
                             original_bytes_unchanged=unchanged, passed=passed, seconds=seconds))
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
    return dict(classification='KNOWN_DEFECT_SYNTHETIC_DEVELOPMENT', code_sha=sha,
                working_tree_dirty=dirty, total=5, passed=sum(r['passed'] for r in rows),
                expected_refusal_total=4, expected_refusal_passed=sum(r['passed'] for r in rows if r['expected_refusal']),
                new_store_total=1, new_store_passed=int(rows[-1]['passed']),
                model_calls=0, reported_tokens=0, unknown_usage_calls=0,
                real_quality_labels=0, hidden_cases=0, rows=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = evaluate()
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}))
    return 0 if result['passed'] == result['total'] else 1


if __name__ == '__main__':
    sys.exit(main())
