"""Accelerated synthetic input-deadline regression, separate from model budgets."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from finevidence.server import Handler, make_server
from scripts.evaluate_request_body import RUN, TOKEN, exchange, record_body


class RequestBodyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = make_server(port=0, review_directory=Path(self.tmp.name)/'reviews',
                                  reviewer='Synthetic reviewer', review_token=TOKEN)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.deadline = patch('finevidence.server.BODY_TIMEOUT_SECONDS', .3, create=True)
        self.deadline.start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.server.workspace.close()
        self.worker.join(); self.deadline.stop(); self.tmp.cleanup()

    def paths(self):
        record = exchange(self.server, '/api/reviews', record_body())['result']
        return [('/api/run', RUN), ('/api/reviews', record_body()),
                ('/api/reviews/revoke', dict(request_id=str(uuid4()),
                    record_id=record['record_id'], reason='Synthetic correction'))]

    def test_buffered_and_fragmented_normal_bodies_execute_exactly_once(self):
        for interval in [0, .03]:
            for path, body in self.paths():
                with self.subTest(path=path, interval=interval):
                    r = exchange(self.server, path, body, interval)
                    self.assertEqual(r['http_status'], 200)
                    if path == '/api/run':
                        self.assertEqual(r['result']['calculations'][0]['display'], '30.00%')
                    elif path.endswith('/revoke'):
                        self.assertEqual(r['result']['state'], 'revoked')
        records = self.server.review_ledger.list()['records']
        self.assertEqual(len(records), 4)

    def test_continued_input_times_out_without_late_run_record_or_revoke(self):
        for path, body in self.paths():
            with self.subTest(path=path), \
                 patch.object(self.server.workspace, 'run', wraps=self.server.workspace.run) as run, \
                 patch.object(self.server.review_ledger, 'mutate', wraps=self.server.review_ledger.mutate) as mutate:
                before = self.server.review_ledger.list()
                r = exchange(self.server, path, body, .11)
                self.assertEqual(r['http_status'], 408)
                self.assertEqual(r['result']['status'], 'REQUEST_TIMEOUT')
                self.assertFalse(r['result']['answer'])
                for key in ['facts', 'citations', 'calculations']: self.assertEqual(r['result'][key], [])
                self.assertGreaterEqual(r['seconds'], .25)
                self.assertLess(r['seconds'], 1)
                run.assert_not_called(); mutate.assert_not_called()
                self.assertEqual(before, self.server.review_ledger.list())

    def test_incomplete_agent_input_never_starts_provider(self):
        with patch('finevidence.server.run_agent') as agent:
            r = exchange(self.server, '/api/run', {**RUN, 'operation': 'agent'}, .11)
            self.assertEqual(r['http_status'], 408)
            agent.assert_not_called()

    def test_silent_sender_deadline(self):
        r = exchange(self.server, '/api/run', RUN, .4)
        self.assertEqual(r['http_status'], 408)
        self.assertLess(r['seconds'], .6)

    def test_eof_is_invalid_input_and_does_not_mutate(self):
        before = self.server.review_ledger.list()
        for path, body in [('/api/run', RUN), ('/api/reviews', record_body())]:
            r = exchange(self.server, path, body, partial=True)
            self.assertEqual(r['http_status'], 400)
            self.assertEqual(r['result']['status'], 'INVALID_REQUEST')
        self.assertEqual(before, self.server.review_ledger.list())

    def test_auth_and_size_gates_precede_body_read(self):
        for path, body, headers, status in [
            ('/api/run', RUN, {'X-FinEvidence-CSRF': 'wrong'}, 403),
            ('/api/reviews', record_body(), {'Authorization': 'Bearer wrong'}, 401),
            ('/api/run', RUN, {'Content-Length': '16385'}, 413),
            ('/api/reviews', record_body(), {'Content-Length': '32769'}, 413)]:
            with self.subTest(path=path, status=status):
                self.assertEqual(exchange(self.server, path, body, headers=headers)['http_status'], status)

    def test_four_timeouts_release_all_slots_for_following_calculation(self):
        reached = threading.Event()
        lock = threading.Lock()
        count = 0
        acquire = self.server.slots.acquire
        def tracked(*args, **kwargs):
            nonlocal count
            acquired = acquire(*args, **kwargs)
            if acquired:
                with lock:
                    count += 1
                    if count == 4: reached.set()
            return acquired
        with patch('finevidence.server.BODY_TIMEOUT_SECONDS', .5), \
             patch.object(self.server.slots, 'acquire', side_effect=tracked), \
             ThreadPoolExecutor(max_workers=4) as pool:
            pending = [pool.submit(exchange, self.server, '/api/run', RUN, .2) for _ in range(4)]
            self.assertTrue(reached.wait(2), 'Four actual requests must hold slots')
            self.assertEqual(exchange(self.server, '/api/run', RUN)['http_status'], 429)
            self.assertEqual([p.result()['http_status'] for p in pending], [408]*4)
        r = exchange(self.server, '/api/run', RUN)
        self.assertEqual(r['http_status'], 200)
        self.assertEqual(r['result']['calculations'][0]['display'], '30.00%')
        acquired = [self.server.slots.acquire(blocking=False) for _ in range(4)]
        for ok in acquired:
            if ok: self.server.slots.release()
        self.assertEqual(acquired, [True]*4)

    def test_deadline_checks_final_chunk_and_restores_write_timeout(self):
        # Deterministic scheduler boundary: the final raw read returns after deadline.
        handler = object.__new__(Handler)
        handler.connection = Mock()
        handler.connection.gettimeout.return_value = 5
        handler.rfile = Mock()
        handler.rfile.read1.return_value = b'{}'
        with patch('finevidence.server.time.monotonic', side_effect=[0, .1, .31]):
            with self.assertRaises(TimeoutError): handler._read_body(2)
        self.assertEqual(handler.connection.settimeout.call_args.args, (5,))


if __name__ == '__main__': unittest.main()
