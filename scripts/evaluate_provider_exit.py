"""Four fixed offline server-exit faults against actual HTTP/Agent/TLS processes.

No external provider or model. About 90 seconds, with production 15/45-second
budgets unchanged. --implementation-root runs the same judge against a baseline.
Every first result is persisted; a surviving child is killed only AFTER judging.
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import select
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
PLAN = [
    {'id': 'interrupt-first', 'signal': 'SIGINT', 'calls': 1, 'budget': 15},
    {'id': 'kill-first', 'signal': 'SIGKILL', 'calls': 1, 'budget': 15},
    {'id': 'terminate-first', 'signal': 'SIGTERM', 'calls': 1, 'budget': 15},
    {'id': 'kill-remaining', 'signal': 'SIGKILL', 'calls': 4, 'budget': 45},
]


def state(pid):
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='],
                            capture_output=True, text=True, timeout=2)
    status = result.stdout.strip()
    if result.returncode == 0 and status and not result.stderr:
        return status
    if result.returncode == 1 and not status and not result.stderr:
        return ''  # ps confirms the PID no longer exists.
    raise RuntimeError('process_observation')


def alive(pid):
    status = state(pid)
    # Linux PID 1 can delay reaping an orphan zombie, which owns no sockets.
    return bool(status) and not status.startswith('Z')


def children(pid):
    rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid='], text=True, timeout=2)
    return [int(row.split()[0]) for row in rows.splitlines()
            if len(row.split()) == 2 and int(row.split()[1]) == pid]


def cleanup_workers(workers):
    errors = []
    for pid in workers:
        try:
            if alive(pid):
                try: os.kill(pid, signal.SIGKILL)
                except ProcessLookupError: pass
            deadline = time.monotonic() + 3
            while alive(pid) and time.monotonic() < deadline: time.sleep(.05)
            if alive(pid): errors.append('worker_still_live')
        except Exception:
            # Do not infer death or target an unverified/reused PID. The saved
            # row retains its worker PID for recovery instead of claiming clean.
            errors.append('worker_cleanup_unverified')
    return errors


def run_case(case, implementation, peer):
    row = dict(case, tolerance_seconds=.75, model_audit=None,
               usage_status='unknown: server exits before returning an audit')
    peer.mode = 'body-trickle'; peer.duration = 18
    if case['calls'] == 4:
        decisions = [('get_financial_facts', {}), ('search_documents', {'query': 'revenue'}),
                     ('search_documents', {'query': 'cost'}), ('finish', {})]
        peer.plan = [('body-trickle', duration, json.dumps({'model': 'SYNTHETIC_TLS_FIXTURE',
            'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({
                'tool': tool, 'arguments': arguments})}}], 'usage': {'total_tokens': 0}}).encode())
            for duration, (tool, arguments) in zip((14, 14, 14, 10), decisions)]
    server = None; workers = []; client = None; started = None
    try:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        with peer.environment():
            server = subprocess.Popen([sys.executable, '-m', 'finevidence.server', '--port', str(port)],
                cwd=implementation, env=os.environ.copy(), stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True)
        if not select.select([server.stdout], [], [], 8)[0]: raise RuntimeError('server_start')
        if not server.stdout.readline().startswith('FinEvidence:'): raise RuntimeError('server_banner')
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        try:
            connection.request('GET', '/runtime.json')
            csrf = json.loads(connection.getresponse().read())['csrf']
        finally: connection.close()

        def query():
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=50)
            try:
                connection.request('POST', '/api/run', json.dumps({'operation': 'agent',
                    'company': 'Aurora Orchard', 'year': 2024, 'query': 'synthetic exit fault'}),
                    {'Content-Type': 'application/json', 'X-FinEvidence-CSRF': csrf})
                response = connection.getresponse()
                row['client_status'] = response.status; response.read()
            except Exception as error: row['client_error_type'] = type(error).__name__
            finally: connection.close()

        started = time.monotonic()
        client = threading.Thread(target=query, daemon=True); client.start()
        ready_limit = started + (44 if case['calls'] == 4 else 5)
        while len(peer.requests) < case['calls'] and time.monotonic() < ready_limit: time.sleep(.01)
        if len(peer.requests) != case['calls']: raise RuntimeError('TLS_request_count')
        workers = children(server.pid)
        if len(workers) != 1: raise RuntimeError('worker_count')
        row['worker_pid'] = workers[0]
        row['signal_seconds'] = round(time.monotonic() - started, 6)
        server.send_signal(getattr(signal, case['signal']))
        row['server_returncode'] = server.wait(timeout=3)
        limit = started + case['budget'] + row['tolerance_seconds']
        while alive(workers[0]) and time.monotonic() < limit: time.sleep(.05)
        row['observed_seconds'] = round(time.monotonic() - started, 6)
        row['worker_state'] = state(workers[0])
        row['worker_live'] = alive(workers[0])
        row['established_socket'] = None
        if shutil.which('lsof'):
            sockets = subprocess.run(['lsof', '-nP', '-a', '-p', str(workers[0]),
                '-iTCP', '-sTCP:ESTABLISHED'], capture_output=True, text=True, timeout=3)
            if sockets.returncode not in (0, 1): raise RuntimeError('socket_observation')
            row['established_socket'] = 'ESTABLISHED' in sockets.stdout
        client.join(timeout=3)
        expected_exit = 0 if case['signal'] == 'SIGINT' else -int(getattr(signal, case['signal']))
        row['passed'] = (not row['worker_live'] and row['established_socket'] is not True
                         and row['observed_seconds'] <= case['budget'] + row['tolerance_seconds']
                         and row['server_returncode'] == expected_exit
                         and 'client_status' not in row and 'client_error_type' in row)
    except Exception as error:
        row['harness_error_type'] = type(error).__name__
        row['harness_phase'] = str(error) if isinstance(error, RuntimeError) else 'unavailable'
        row['passed'] = False
    finally:
        row['tls_requests'] = len(peer.requests)
        errors = cleanup_workers(workers)
        if server:
            try:
                if server.poll() is None: server.kill()
                server.wait(timeout=3); server.stdout.close()
            except Exception: errors.append('server_cleanup_unverified')
        try:
            if client:
                client.join(timeout=3)
                if client.is_alive(): errors.append('client_still_live')
        except Exception: errors.append('client_cleanup_unverified')
        try: peer.close()
        except Exception: errors.append('peer_cleanup_unverified')
        row['cleanup_errors'] = errors
        row['cleanup_no_live_workers'] = not any(e.startswith('worker_') for e in errors)
        row['passed'] = row.get('passed', False) and not errors
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--implementation-root', type=Path, default=ROOT)
    args = parser.parse_args(); implementation = args.implementation_root.resolve()
    sys.path.insert(0, str(ROOT / 'tests'))
    from tls_provider_fixture import TLSPeer
    result = {'classification': 'OFFLINE_SYNTHETIC_SERVER_EXIT_DEVELOPMENT', 'judge_version': 2,
        'sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=implementation, text=True).strip(),
        'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=implementation)),
        'provider_sha256': hashlib.sha256((implementation/'finevidence/provider.py').read_bytes()).hexdigest(),
        'plan_sha256': hashlib.sha256(json.dumps(PLAN, sort_keys=True).encode()).hexdigest(),
        'planned': len(PLAN), 'completed': 0, 'passed': 0, 'external_requests': 0,
        'real_model_calls': 0, 'hidden_cases': 0, 'real_financial_labels': 0, 'rows': []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    def save(): args.output.write_text(json.dumps(result, indent=2) + '\n')
    save()
    for case in PLAN:
        row = run_case(case, implementation, TLSPeer())
        result['rows'].append(row); result['completed'] += 1; result['passed'] += int(row['passed'])
        save(); print(json.dumps(row), flush=True)
    return 0 if result['passed'] == result['planned'] else 1


if __name__ == '__main__': raise SystemExit(main())
