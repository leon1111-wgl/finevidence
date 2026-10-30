"""Actual loopback requests: reject ambiguous scope before work or model use."""
import http.client
import json
import threading
import time
import unittest
from unittest.mock import patch

from finevidence.server import make_server
from tests.test_workbench import Decisions, action

CANARY = 'SYNTHETIC_REQUEST_CANARY'
NORMAL = '{"operation":"gross-margin","company":"Aurora Orchard","year":2024,"query":""}'
DUPLICATES = [
    ('company', NORMAL.replace('"company":', '"company":"Harbor Lantern","company":')),
    ('year', NORMAL.replace('"year":', '"year":2023,"year":')),
    ('operation', NORMAL.replace('"operation":', '"operation":"revenue-growth","operation":')),
    ('query', NORMAL.replace('"query":', '"query":"'+CANARY+'","query":')),
    ('equal-year', NORMAL.replace('"year":', '"year":2024,"year":')),
    ('escaped-operation', NORMAL.replace('"operation":', r'"operati\u006fn":"search","operation":')),
    ('escaped-company', NORMAL.replace('"company":', r'"comp\u0061ny":"Harbor Lantern","company":')),
    ('three-queries', NORMAL.replace('"query":', '"query":"one","query":"two","query":')),
]


class RunJsonKeyTests(unittest.TestCase):
    def setUp(self):
        self.server = make_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close()
        self.server.workspace.close(); self.thread.join()

    def request(self, raw, csrf=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            conn.request('POST', '/api/run', raw.encode(), {'Content-Type':'application/json',
                         'X-FinEvidence-CSRF':self.server.csrf if csrf is None else csrf})
            response = conn.getresponse(); body = json.loads(response.read())
            return response.status, body
        finally: conn.close()

    def assert_invalid(self, status, body):
        self.assertEqual(status, 400)
        self.assertEqual(body['status'], 'INVALID_REQUEST')
        self.assertIsNone(body['answer'])
        for key in ('facts', 'calculations', 'citations', 'claims'): self.assertEqual(body[key], [])
        self.assertNotIn(CANARY, json.dumps(body))
        self.assertNotIn('model', body)

    def test_duplicate_scope_and_operation_names_never_execute(self):
        for name, raw in DUPLICATES:
            with self.subTest(name=name), patch.object(self.server.workspace, 'run', wraps=self.server.workspace.run) as run:
                status, body = self.request(raw)
                self.assert_invalid(status, body)
                run.assert_not_called()

    def test_overwritten_operation_cannot_start_a_model(self):
        raw = NORMAL.replace('"operation":"gross-margin"', '"operation":"gross-margin","operation":"agent"').replace('"query":""', '"query":"毛利率"')
        provider = Decisions([action('calculate_metric', {'metric':'gross-margin'}), action('finish')])
        with patch('finevidence.agent.ModelProvider', return_value=provider) as factory:
            status, body = self.request(raw)
            self.assert_invalid(status, body)
            factory.assert_not_called()
            self.assertEqual(provider.calls, 0)

    def test_unique_escaped_names_and_key_like_query_text_are_valid(self):
        raw = NORMAL.replace('"operation"', r'"operati\u006fn"').replace('"company"', r'"comp\u0061ny"')
        status, body = self.request(raw)
        self.assertEqual(status, 200)
        self.assertEqual(body['calculations'][0]['display'], '30.00%')
        expected = self.server.workspace.run('gross-margin', 'Aurora Orchard', 2024)
        for key in ('facts', 'calculations', 'citations'): self.assertEqual(body[key], expected[key])
        query = '{"year":2023,"year":2024} revenue'
        status, body = self.request(json.dumps({'operation':'search', 'company':'Aurora Orchard', 'year':2024, 'query':query}))
        self.assertEqual(status, 200)
        self.assertEqual(body['citations'], self.server.workspace.run('search', 'Aurora Orchard', 2024, query)['citations'])

    def test_distinct_extra_names_and_invalid_types_remain_invalid(self):
        for raw in [NORMAL.replace('"year":', '"Year":2024,"year":'),
                    NORMAL.replace('2024', 'NaN'), NORMAL.replace('2024', 'true'),
                    NORMAL.replace('"query":""', '"query":{"x":1,"x":2}'), '{']:
            with self.subTest(raw=raw): self.assert_invalid(*self.request(raw))

    def test_authentication_gate_still_precedes_parsing(self):
        status, body = self.request(DUPLICATES[0][1], csrf='wrong')
        self.assertEqual(status, 403)
        self.assertEqual(body['status'], 'ORIGIN_REJECTED')

    def test_rejected_requests_release_slots_and_next_request_is_independent(self):
        statuses = [self.request(DUPLICATES[0][1])[0] for _ in range(4)]
        self.assertEqual(statuses, [400]*4)
        deadline = time.monotonic()+1; acquired = []
        try:
            for _ in range(4): acquired.append(self.server.slots.acquire(timeout=max(0, deadline-time.monotonic())))
            self.assertEqual(acquired, [True]*4)
        finally:
            for ok in acquired:
                if ok: self.server.slots.release()
        status, body = self.request(NORMAL)
        self.assertEqual(status, 200)
        self.assertEqual(body['calculations'][0]['display'], '30.00%')


if __name__ == '__main__': unittest.main()
