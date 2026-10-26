"""Actual local HTTP -> Agent -> TLS worker lifecycle, no external model."""
import concurrent.futures
import http.client
import json
import threading
import time
import unittest
from unittest.mock import patch
from finevidence.provider import ModelProvider
from finevidence.server import make_server
from tls_provider_fixture import TLSPeer

class ProviderSlotTests(unittest.TestCase):
    def test_four_timed_out_agents_release_all_slots_without_late_answers(self):
        from scripts.build_web import build
        build()
        peer = TLSPeer(); self.addCleanup(peer.close); peer.mode = 'silent'
        server = make_server(port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        def close():
            server.shutdown(); server.server_close(); server.workspace.close(); thread.join()
        self.addCleanup(close)
        def request(operation):
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=6)
            try:
                conn.request('POST', '/api/run', json.dumps({'operation': operation,
                    'company': 'Aurora Orchard', 'year': 2024, 'query': 'revenue'}),
                    {'Content-Type': 'application/json', 'X-FinEvidence-CSRF': server.csrf})
                response = conn.getresponse()
                return response.status, json.loads(response.read())
            finally: conn.close()
        class ShortDeadlineProvider(ModelProvider):
            def complete(self, messages, timeout=15):
                # Only the fixture duration is scaled. Production defaults are unchanged.
                return super().complete(messages, timeout=min(timeout, 2))
        with peer.environment(), patch('finevidence.agent.ModelProvider', ShortDeadlineProvider):
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(request, 'agent') for _ in range(4)]
                deadline = time.monotonic() + 1.8
                while len(peer.requests) < 4 and time.monotonic() < deadline: time.sleep(.01)
                self.assertEqual(len(peer.requests), 4)
                status, result = request('gross-margin')
                self.assertEqual((status, result['status']), (429, 'SERVER_BUSY'))
                for future in futures:
                    status, result = future.result(timeout=4)
                    self.assertEqual((status, result['status']), (422, 'MODEL_TIMEOUT'))
                    self.assertIsNone(result['answer'])
                    self.assertEqual(result['calculations'], [])
                    self.assertEqual(result['model']['calls'], 1)
                    self.assertEqual(result['model']['calls_with_unknown_usage'], 1)
                    self.assertEqual(result['model']['usage'], {})
            self.assertTrue(all(server.slots.acquire(blocking=False) for _ in range(4)))
            self.assertFalse(server.slots.acquire(blocking=False))
            for _ in range(4): server.slots.release()
            status, result = request('gross-margin')
            self.assertEqual(status, 200)
            self.assertEqual(result['calculations'][0]['display'], '30.00%')
            self.assertEqual(len(peer.requests), 4, 'no network retry or late extra call')

if __name__ == '__main__': unittest.main()
