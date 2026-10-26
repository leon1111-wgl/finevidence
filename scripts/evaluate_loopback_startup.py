"""Offline, first-attempt startup-to-calculation probe; no real model calls."""
import argparse
import http.client
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finevidence.server import make_server

CASES = ('native', 'slow-name-service', 'denied-name-service')
TARGET_SECONDS = 1.0


def run_case(case):
    row = {'case': case, 'passed': False, 'resolver_calls': 0,
           'startup_seconds': None, 'calculation_seconds': None,
           'display': None, 'source_years': [], 'failure': None}
    original = socket.gethostbyaddr

    def resolve(host):
        row['resolver_calls'] += 1
        if case == 'slow-name-service':
            time.sleep(2)
            raise socket.herror('synthetic name-service timeout')
        if case == 'denied-name-service':
            raise PermissionError('synthetic name-service denial')
        return original(host)

    server = None
    thread = None
    started = time.monotonic()
    try:
        with patch('socket.gethostbyaddr', resolve):
            server = make_server(port=0)
        row['startup_seconds'] = round(time.monotonic() - started, 6)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection(*server.server_address, timeout=3)
        try:
            connection.request('GET', '/api/session')
            response = connection.getresponse()
            if response.status != 200:
                raise ValueError('session_http')
            csrf = json.loads(response.read())['csrf']
            connection.request('POST', '/api/run', json.dumps({
                'operation': 'revenue-growth', 'company': 'Aurora Orchard',
                'year': 2024, 'query': '',
            }), {'Content-Type': 'application/json', 'X-FinEvidence-CSRF': csrf})
            response = connection.getresponse()
            result = json.loads(response.read())
            row['calculation_seconds'] = round(time.monotonic() - started, 6)
            row['display'] = result['calculations'][0]['display']
            row['source_years'] = sorted(c['year'] for c in result['citations'])
            row['passed'] = (response.status == 200 and row['display'] == '20.00%'
                             and row['source_years'] == [2023, 2024]
                             and row['calculation_seconds'] < TARGET_SECONDS)
        finally:
            connection.close()
    except Exception as error:
        row['failure'] = type(error).__name__  # No exception content or user data.
        row['startup_seconds'] = round(time.monotonic() - started, 6)
    finally:
        if server is not None:
            if thread is not None:
                server.shutdown()
                thread.join(3)
            server.server_close()
            server.workspace.close()
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--case', choices=CASES)
    args = parser.parse_args()
    if args.case:
        print(json.dumps(run_case(args.case)))
        return
    if args.output is None:
        parser.error('--output is required')
    report = {'schema_version': 1, 'classification': 'synthetic_engineering',
              'plan': list(CASES), 'total': 3, 'passed': 0, 'model_calls': 0,
              'target_seconds': TARGET_SECONDS, 'injected_delay_seconds': 2,
              'source_commit': subprocess.check_output(
                  ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'dirty_tree': bool(subprocess.check_output(
                  ['git', 'status', '--porcelain'], cwd=ROOT, text=True)),
              'python': sys.version.split()[0], 'results': []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        try:
            child = subprocess.run([sys.executable, __file__, '--case', case],
                                   cwd=ROOT, capture_output=True, text=True, timeout=10)
            row = json.loads(child.stdout) if child.returncode == 0 else {
                'case': case, 'passed': False, 'failure': 'child_exit'}
        except (subprocess.TimeoutExpired, ValueError):
            row = {'case': case, 'passed': False, 'failure': 'child_no_result'}
        report['results'].append(row)
        report['passed'] += int(row['passed'])
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    raise SystemExit(0 if report['passed'] == report['total'] else 1)


if __name__ == '__main__':
    main()
