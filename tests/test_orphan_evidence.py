"""Failure-evidence contracts; safe protocol errors are not deadline coverage."""
import json
import socket
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import test_provider_orphan_deadline as orphan

METHOD = 'test_worker_deadline_survives_absent_watchdog_and_inherited_signal_state'


class OrphanEvidenceTests(unittest.TestCase):
    def run_original(self):
        case = orphan.OrphanDeadlineTests(METHOD)
        result = unittest.TestResult()
        case.run(result)
        self.assertEqual(result.errors, [])
        rows = getattr(case, 'orphan_observations', [])
        self.assertEqual(len(rows), 2, 'retain both original signal configurations')
        return result, rows

    def test_real_protocol_errors_keep_failure_and_safe_classification(self):
        original_init = orphan.TLSPeer.__init__
        original_write = orphan.TLSPeer.write_chunks
        for fault, expected in [('http_503', 'MODEL_HTTP_503'),
                                ('truncated_body', 'MODEL_RESPONSE')]:
            with self.subTest(fault=fault):
                def initialize(peer):
                    original_init(peer)
                    if fault == 'http_503': peer.status = 503
                def write_chunks(peer, conn, data, duration):
                    if fault == 'truncated_body':
                        conn.sendall(b'{'); conn.shutdown(socket.SHUT_WR)
                    else: original_write(peer, conn, data, duration)
                with patch.object(orphan.TLSPeer, '__init__', initialize), \
                        patch.object(orphan.TLSPeer, 'write_chunks', write_chunks):
                    result, rows = self.run_original()
                self.assertFalse(result.wasSuccessful())
                self.assertEqual(len(result.failures), 2)
                for row in rows:
                    self.assertEqual(row['failure_code'], 'ORPHAN_SAFE_ERROR')
                    self.assertEqual(row['safe_error'], expected)
                    self.assertEqual(row['returncode_before_cleanup'], 0)
                    self.assertEqual(row['stdout_bytes'], 27)
                    self.assertFalse(row['result_present'])
                    self.assertEqual((row['tcp_accepted'], row['http_requests']), (1, 1))
                    self.assertFalse(row['cleanup_intervened'])
                    self.assertTrue(all(row['cleanup'].values()))
                self.assertNotIn('SYNTHETIC_LOCAL_ONLY', str(result.failures))

    def test_normal_real_workers_retain_autonomous_deadline_evidence(self):
        result, rows = self.run_original()
        self.assertTrue(result.wasSuccessful(), result.failures)
        self.assertEqual([r['inherited_mask'] for r in rows], [False, True])
        for row in rows:
            self.assertIsNone(row['failure_code'])
            self.assertIsNone(row['safe_error'])
            self.assertEqual(row['stdout_bytes'], 0)
            self.assertFalse(row['result_present'])
            self.assertFalse(row['cleanup_intervened'])
            self.assertTrue(all(row['cleanup'].values()))

    def judge(self, output=b'', *, requests=1, active=False, survives=False,
              timeout=False, assertion=False):
        # Test-only judge controls. They do not claim actual network/process coverage.
        case = orphan.OrphanDeadlineTests()
        self.assertTrue(hasattr(case, 'observe_orphan'), 'missing failure evidence scope')
        peer = SimpleNamespace(accepted=requests, requests=[{} for _ in range(requests)])
        child = SimpleNamespace(pid=123, returncode=None if active else -14,
                                stdin=SimpleNamespace(closed=False),
                                stdout=SimpleNamespace(closed=False))
        child.poll = lambda: child.returncode
        def kill(): child.returncode = None if survives else -9
        def communicate():
            child.stdin.closed = child.stdout.closed = not survives
            return b'', None
        child.kill = kill; child.communicate = communicate
        def lookup(*_):
            if not survives: raise ProcessLookupError()
        error = None
        with patch('os.kill', side_effect=lookup):
            try:
                with case.observe_orphan(peer, child, time.monotonic(), False) as capture:
                    capture['stdout'] = output
                    capture['timed_out'] = timeout
                    if assertion: raise AssertionError('PRIVATE_CANARY /private/path?key=secret')
            except AssertionError as exc:
                error = str(exc)
        self.assertIsNotNone(error, 'negative control must not pass after cleanup')
        row = case.orphan_observations[0]
        self.assertEqual(json.loads(error.split(': ', 1)[1]), row)
        self.assertNotIn('PRIVATE_CANARY', error)
        self.assertNotIn('/private/', error)
        self.assertLess(len(error), 1800)
        return row

    def test_missing_stage_and_duplicate_requests_remain_failed(self):
        for count, code in [(0, 'ORPHAN_STAGE_NOT_REACHED'), (2, 'ORPHAN_NETWORK_COUNT')]:
            with self.subTest(count=count):
                row = self.judge(requests=count)
                self.assertEqual(row['failure_code'], code)
                self.assertEqual(row['http_requests'], count)

    def test_watchdog_cleanup_does_not_make_an_active_worker_pass(self):
        row = self.judge(active=True, timeout=True, output=b'{"result":"PRIVATE_CANARY"}')
        self.assertEqual(row['failure_code'], 'ORPHAN_WATCHDOG_EXPIRED')
        self.assertIsNone(row['returncode_before_cleanup'])
        self.assertTrue(row['result_present'])
        self.assertTrue(row['cleanup_intervened'])
        self.assertTrue(all(row['cleanup'].values()))
        row = self.judge(active=True, survives=True)
        self.assertEqual(row['failure_code'], 'ORPHAN_CLEANUP_FAILED')
        self.assertFalse(row['cleanup']['process_gone'])

    def test_untrusted_output_is_classified_without_echoing_content(self):
        for data, code, result, safe in [
            (b'{"result":"PRIVATE_CANARY"}', 'ORPHAN_RESULT_OUTPUT', True, None),
            (b'{"error":"PRIVATE_CANARY"}', 'ORPHAN_UNEXPECTED_OUTPUT', False, None),
            (b'PRIVATE_CANARY\xff', 'ORPHAN_UNEXPECTED_OUTPUT', None, None),
            (b'PRIVATE_CANARY' * 1000, 'ORPHAN_UNEXPECTED_OUTPUT', None, None),
            (b'{"error":"MODEL_RESPONSE","details":"PRIVATE_CANARY"}',
             'ORPHAN_SAFE_ERROR', False, 'MODEL_RESPONSE'),
        ]:
            with self.subTest(code=code, length=len(data)):
                row = self.judge(output=data)
                self.assertEqual(row['failure_code'], code)
                self.assertEqual(row['result_present'], result)
                self.assertEqual(row['safe_error'], safe)
                self.assertEqual(row['stdout_bytes'], len(data))

    def test_earlier_assertion_is_not_lost_or_echoed(self):
        row = self.judge(assertion=True)
        self.assertEqual(row['failure_code'], 'ORPHAN_ASSERTION_FAILED')
        self.assertEqual(row['primary_failure'], 'assertion')


if __name__ == '__main__': unittest.main()
