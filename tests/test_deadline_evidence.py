"""Judge contracts; injected startup failure is not network-stage coverage."""
import json
import subprocess
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import test_provider_deadline as deadline

METHODS = (
    'test_body_and_header_trickle_have_total_deadline',
    'test_timeout_reaps_worker_and_connection_then_fast_request_works',
    'test_tls_handshake_stall_is_bounded',
)


class DeadlineEvidenceTests(unittest.TestCase):
    def test_delayed_start_reports_missing_stage_and_reaped_workers(self):
        original = subprocess.Popen
        def delayed(command, *args, **kwargs):
            if (isinstance(command, list) and len(command) == 3
                    and command[1] == '-I' and command[2].endswith('/finevidence/provider.py')):
                command = [command[0], '-I', '-c',
                           'import runpy,sys,time;time.sleep(.8);'
                           'runpy.run_path(sys.argv[1],run_name="__main__")', command[2]]
            return original(command, *args, **kwargs)
        for method, count in zip(METHODS, (2, 1, 1)):
            with self.subTest(method=method):
                case = deadline.ProviderDeadlineTests(method)
                result = unittest.TestResult()
                with patch('subprocess.Popen', side_effect=delayed):
                    case.run(result)
                self.assertFalse(result.wasSuccessful(), 'unreached network stage must still fail')
                self.assertEqual(result.errors, [])
                observations = getattr(case, 'deadline_observations', [])
                self.assertEqual(len(observations), count, 'retain each attempted call before failing')
                self.assertEqual(case.peer.accepted, 0)
                self.assertEqual(case.peer.requests, [])
                for row in observations:
                    self.assertEqual(row['failure_code'], 'DEADLINE_STAGE_NOT_REACHED')
                    self.assertFalse(row['network_stage_reached'])
                    self.assertEqual(row['tcp_accepted'], 0)
                    self.assertEqual(row['http_requests'], 0)
                    self.assertEqual(row['budget_seconds'], .6)
                    self.assertEqual(len(row['workers']), 1)
                    self.assertEqual(row['workers'][0], {
                        'reaped': True, 'process_gone': True,
                        'stdin_closed': True, 'stdout_closed': True})
                messages = '\n'.join(message for _, message in result.failures)
                self.assertIn('DEADLINE_STAGE_NOT_REACHED', messages)
                self.assertNotIn('SYNTHETIC_LOCAL_ONLY', messages)

    def observe_fake(self, *, requests=1, reaped=True, error=False):
        # Pure judge negative controls, not a network/model execution claim.
        case = deadline.ProviderDeadlineTests()
        case.peer = SimpleNamespace(accepted=0, requests=[], closed=threading.Event())
        case.deadline_observations = []
        self.assertTrue(hasattr(case, 'observe_deadline'), 'missing diagnostic scope')
        child = SimpleNamespace(pid=123, returncode=0 if reaped else None,
                                stdin=SimpleNamespace(closed=reaped),
                                stdout=SimpleNamespace(closed=reaped))
        def process_lookup(*_):
            if reaped: raise ProcessLookupError()
        with patch('subprocess.Popen', return_value=child), patch('os.kill', side_effect=process_lookup):
            try:
                with case.observe_deadline('http_request'):
                    subprocess.Popen(['synthetic-judge-canary'])
                    case.peer.accepted = requests
                    case.peer.requests = [{} for _ in range(requests)]
                    if error: raise AssertionError('PRIVATE_CANARY /private/path?key=secret')
            except AssertionError as exc:
                return case.deadline_observations, str(exc)
        self.fail('negative control incorrectly became successful')

    def test_unreaped_worker_remains_a_failure(self):
        rows, error = self.observe_fake(reaped=False)
        self.assertEqual(rows[0]['failure_code'], 'DEADLINE_CLEANUP_FAILED')
        self.assertFalse(rows[0]['workers'][0]['reaped'])
        self.assertIn('DEADLINE_CLEANUP_FAILED', error)

    def test_duplicate_request_remains_a_failure(self):
        rows, error = self.observe_fake(requests=2)
        self.assertEqual(rows[0]['failure_code'], 'DEADLINE_NETWORK_COUNT')
        self.assertEqual(rows[0]['http_requests'], 2)
        self.assertIn('DEADLINE_NETWORK_COUNT', error)

    def test_failure_details_are_bounded_and_do_not_echo_raw_assertions(self):
        rows, error = self.observe_fake(error=True)
        self.assertEqual(rows[0]['failure_code'], 'DEADLINE_ASSERTION_FAILED')
        self.assertTrue(rows[0]['network_stage_reached'])
        self.assertNotIn('PRIVATE_CANARY', error)
        self.assertNotIn('/private/', error)
        self.assertLess(len(error), 1500)
        self.assertEqual(json.loads(error.split(': ', 1)[1]), rows[0])


if __name__ == '__main__': unittest.main()
