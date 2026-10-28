"""Known synthetic request-body deadline cases; real loopback HTTP, no model."""
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finevidence.server import make_server

TOKEN = 'synthetic-body-deadline-' + 'x' * 40
RUN = dict(operation='gross-margin', company='Aurora Orchard', year=2024, query='')


def record_body():
    return dict(request_id=str(uuid4()), observation='needs_changes', note='Synthetic observation',
        draft=dict(classification='SYNTHETIC_DEMO_UNVERIFIED', review_status='pending_human_review',
            verified_by=None, financial_calculation_eligible=False, company='SYNTHETIC Example',
            title='Synthetic report', source_url=None, metric='revenue', raw_value='120',
            normalized_value='120000000', unit_scale='1000000', currency='USD', period='2024',
            basis='IFRS', scope='consolidated', provenance=dict(file_name='synthetic.pdf',
                file_sha256='a'*64, page=1, page_kind='pdf_physical', excerpt='Revenue 120',
                excerpt_start=0, excerpt_end=11, offset_unit='utf16_code_unit',
                parser=dict(name='PDF.js', version='5.4.624'))))


def exchange(server, path, body, interval=0, headers=None, partial=False):
    """Five chunks; capture first response, then finish sender to expose late effects."""
    raw = json.dumps(body).encode()
    port = server.server_address[1]
    fields = {'Host': f'127.0.0.1:{port}', 'Content-Type': 'application/json',
              'Content-Length': str(len(raw)), 'X-FinEvidence-CSRF': server.csrf,
              'Authorization': 'Bearer ' + TOKEN}
    fields.update(headers or {})
    sock = socket.create_connection(('127.0.0.1', port), timeout=10)
    request = f'POST {path} HTTP/1.0\r\n' + ''.join(f'{k}: {v}\r\n' for k, v in fields.items()) + '\r\n'
    chunks = [raw[len(raw)*i//5:len(raw)*(i+1)//5] for i in range(5)]
    started = time.monotonic()
    sock.sendall(request.encode())
    errors = []

    def send():
        try:
            for index, chunk in enumerate(chunks[:1] if partial else chunks):
                if index: time.sleep(interval)
                sock.sendall(chunk)
            if partial: sock.shutdown(socket.SHUT_WR)
        except OSError as exc:
            errors.append(type(exc).__name__)

    sender = threading.Thread(target=send, daemon=True)
    sender.start()
    try:
        response = http.client.HTTPResponse(sock)
        response.begin()
        result = json.loads(response.read())
        seconds = time.monotonic() - started
        return {'http_status': response.status, 'result': result,
                'seconds': round(seconds, 6), 'sender_errors': errors}
    finally:
        sender.join(timeout=8)
        sock.close()
        if sender.is_alive(): raise RuntimeError('Synthetic sender did not finish')


def evaluate(output):
    report = {'protocol': 'REQUEST_BODY_V1', 'dataset': 'SYNTHETIC_KNOWN_DEFECT',
              'hidden_tasks': 0, 'real_report_tasks': 0, 'model_calls': 0,
              'reported_tokens': 0, 'calls_with_unknown_usage': 0,
              'budget_seconds': 5, 'observation_tolerance_seconds': 1,
              'chunk_interval_seconds': 1.6, 'planned_complete_body_seconds': 6.4,
              'code_sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'tracked_diff_sha256': hashlib.sha256(subprocess.check_output(['git', 'diff', 'HEAD'], cwd=ROOT)).hexdigest(),
              'cases': []}
    plan = [('normal-run', '/api/run', RUN, 0, False),
            ('normal-record', '/api/reviews', record_body(), 0, False),
            ('slow-run', '/api/run', RUN, 1.6, True),
            ('slow-record', '/api/reviews', record_body(), 1.6, True),
            ('slow-revoke', '/api/reviews/revoke', None, 1.6, True)]
    report['planned_cases'] = [row[0] for row in plan]
    def save():
        report['passed'] = sum(row['passed'] for row in report['cases'])
        report['total'] = len(plan)
        Path(output).write_text(json.dumps(report, indent=2) + '\n')
    save()
    with tempfile.TemporaryDirectory() as tmp:
        server = make_server(port=0, review_directory=Path(tmp)/'reviews',
                             reviewer='Synthetic reviewer', review_token=TOKEN)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with patch.object(server.workspace, 'run', wraps=server.workspace.run) as run, \
                 patch.object(server.review_ledger, 'mutate', wraps=server.review_ledger.mutate) as mutate:
                receipt = None
                for name, path, body, interval, refusal in plan:
                    if body is None:
                        body = dict(request_id=str(uuid4()), record_id=receipt['record_id'], reason='Synthetic correction')
                    before_calls = run.call_count + mutate.call_count
                    before = server.review_ledger.list()
                    row = {'id': name, **exchange(server, path, body, interval)}
                    row['business_calls'] = run.call_count + mutate.call_count - before_calls
                    row['ledger_unchanged'] = before == server.review_ledger.list()
                    if refusal:
                        row['passed'] = (row['http_status'] == 408 and row['result']['status'] == 'REQUEST_TIMEOUT'
                            and not row['result']['answer'] and not row['result']['facts']
                            and not row['result']['calculations'] and not row['result']['citations']
                            and 4.8 <= row['seconds'] <= 6 and row['business_calls'] == 0 and row['ledger_unchanged'])
                    else:
                        row['passed'] = row['http_status'] == 200 and row['business_calls'] == 1
                        if path == '/api/run':
                            row['passed'] = row['passed'] and row['result']['calculations'][0]['display'] == '30.00%'
                        else: receipt = row['result']
                    report['cases'].append(row)
                    save()
                    print(json.dumps({k: row[k] for k in ('id', 'http_status', 'seconds', 'business_calls', 'passed')}), flush=True)
        finally:
            server.shutdown(); server.server_close(); server.workspace.close(); worker.join()
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    result = evaluate(parser.parse_args().output)
    sys.exit(0 if result['passed'] == result['total'] else 1)
