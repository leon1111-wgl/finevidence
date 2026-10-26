"""Actual TLS/body deadlines and resource release, entirely offline."""
import os
import json
import subprocess
import time
import unittest
from unittest.mock import patch
from finevidence.provider import ModelProvider, ProviderError
from finevidence.agent import MeteredProvider
from tls_provider_fixture import TLSPeer

class ProviderDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.peer = TLSPeer(); self.addCleanup(self.peer.close)
        self.env = self.peer.environment(); self.env.__enter__(); self.addCleanup(self.env.__exit__, None, None, None)

    def test_body_and_header_trickle_have_total_deadline(self):
        for mode in ('body-trickle', 'header-trickle'):
            with self.subTest(mode=mode):
                self.peer.mode = mode; self.peer.duration = 2.5
                start = time.monotonic()
                with self.assertRaisesRegex(ProviderError, 'MODEL_TIMEOUT'):
                    ModelProvider().complete([], timeout=.6)
                self.assertLess(time.monotonic()-start, 1.3)
        self.assertEqual(len(self.peer.requests), 2, 'never automatically retry')

    def test_timeout_reaps_worker_and_connection_then_fast_request_works(self):
        self.peer.mode = 'silent'
        children = []; original = subprocess.Popen
        def launch(*args, **kwargs):
            child = original(*args, **kwargs); children.append(child); return child
        metered = MeteredProvider(ModelProvider())
        with patch('subprocess.Popen', side_effect=launch):
            with self.assertRaisesRegex(ProviderError, 'MODEL_TIMEOUT'):
                metered.complete([], timeout=.6)
        self.assertTrue(self.peer.closed.wait(1), 'peer must observe local connection close')
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].returncode, 'worker must be reaped, not left behind')
        with self.assertRaises(ProcessLookupError): os.kill(children[0].pid, 0)
        self.assertEqual(metered.audit()['calls_with_unknown_usage'], 1)
        self.assertEqual(metered.audit()['usage'], {})
        self.peer.mode = 'fast'
        result = ModelProvider().complete([], timeout=2)
        self.assertEqual(result['model'], 'SYNTHETIC_TLS_FIXTURE')
        self.assertEqual(result['usage'], {'total_tokens': 0})
        self.assertEqual(len(self.peer.requests), 2)

    def test_tls_handshake_stall_is_bounded(self):
        self.peer.mode = 'tls-stall'; start = time.monotonic()
        with self.assertRaisesRegex(ProviderError, 'MODEL_TIMEOUT'):
            ModelProvider().complete([], timeout=.6)
        self.assertLess(time.monotonic()-start, 1.3)
        self.assertTrue(self.peer.closed.wait(1))
        self.assertEqual(self.peer.requests, [])

    def test_real_tls_normal_limits_and_redirect_refusal(self):
        for status, body, expected in [(200, b'x'*65537, 'MODEL_OUTPUT_LIMIT'),
                                       (302, b'private-provider-body', 'MODEL_HTTP_302'),
                                       (401, b'private-provider-body', 'MODEL_HTTP_401')]:
            with self.subTest(status=status):
                self.peer.status = status; self.peer.body = body
                with self.assertRaisesRegex(ProviderError, expected) as caught:
                    ModelProvider().complete([], timeout=2)
                self.assertNotIn('private-provider-body', str(caught.exception))
                self.assertNotIn('SYNTHETIC_LOCAL_ONLY', str(caught.exception))
        self.assertEqual(len(self.peer.requests), 3, 'no redirect or retry')

    def test_maximum_unicode_content_survives_private_pipe(self):
        content = '\U0001f4ca' * 6000
        self.peer.body = json.dumps({'choices': [{'finish_reason': 'stop',
            'message': {'content': content}}]}, ensure_ascii=False).encode()
        result = ModelProvider().complete([], timeout=2)
        self.assertEqual(result['content'], content)

    def test_no_worker_for_expired_budget_or_oversize_input(self):
        provider = ModelProvider()
        with patch('subprocess.Popen') as launch:
            for timeout in (0, -1):
                with self.assertRaisesRegex(ProviderError, 'MODEL_TIMEOUT'):
                    provider.complete([], timeout=timeout)
            with self.assertRaisesRegex(ProviderError, 'MODEL_INPUT_LIMIT'):
                provider.complete([{'role': 'user', 'content': 'x'*24000}])
            launch.assert_not_called()

    def test_worker_start_failure_and_crash_are_safe_unknown_usage(self):
        metered = MeteredProvider(ModelProvider())
        with patch('subprocess.Popen', side_effect=OSError('private-launch-details')):
            with self.assertRaisesRegex(ProviderError, 'MODEL_WORKER') as error:
                metered.complete([], timeout=2)
        self.assertNotIn('private-launch-details', str(error.exception))
        original = subprocess.Popen; children = []
        def crash(*args, **kwargs):
            self.assertNotIn('SYNTHETIC_LOCAL_ONLY', repr(args))
            self.assertNotIn('FINEVIDENCE_API_KEY', kwargs['env'])
            child = original(*args, **kwargs); children.append(child)
            child.kill(); child.wait(); return child
        with patch('subprocess.Popen', side_effect=crash):
            with self.assertRaisesRegex(ProviderError, 'MODEL_WORKER'):
                metered.complete([], timeout=2)
        self.assertEqual(metered.audit()['calls_with_unknown_usage'], 2)
        self.assertEqual(metered.audit()['usage'], {})
        self.assertTrue(children[0].stdin.closed)
        self.assertTrue(children[0].stdout.closed)
        self.assertIsNotNone(children[0].returncode)

if __name__ == '__main__': unittest.main()
