"""Categorical OS evidence must explain a failure without exporting process text."""
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from scripts import evaluate_provider_exit as judge
from tls_provider_fixture import TLSPeer


class ProcessDiagnosticsTests(unittest.TestCase):
    def assert_diagnostic(self, call, result, stage, reason, **fields):
        with patch.object(judge.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, '^process_observation$') as caught:
                call()
        diagnostic = getattr(caught.exception, 'diagnostic', None)
        self.assertIsNotNone(diagnostic, 'failure must retain a categorical observation')
        self.assertEqual(diagnostic['stage'], stage)
        self.assertEqual(diagnostic['reason'], reason)
        for key, value in fields.items(): self.assertEqual(diagnostic[key], value)
        encoded = json.dumps(diagnostic)
        self.assertNotIn('PRIVATE', encoded)
        self.assertNotIn('/Users/', encoded)

    def test_state_diagnostic_excludes_raw_output(self):
        self.assert_diagnostic(lambda: judge.state(123),
            subprocess.CompletedProcess(['ps'], 2, 'PRIVATE /Users/private', 'PRIVATE TOKEN'),
            'state', 'invalid_result', returncode=2, stderr_present=True)

    def test_census_distinguishes_invalid_duplicate_and_missing_parent(self):
        for output, reason in [('PRIVATE malformed row', 'invalid_rows'),
                               ('1 0\n1 0\n', 'duplicate_pid'), ('1 0\n', 'missing_parent')]:
            with self.subTest(reason=reason):
                self.assert_diagnostic(lambda: judge.children(123, require_parent=True),
                    subprocess.CompletedProcess(['ps'], 0, output, ''), 'children', reason)

    def test_identity_rejection_distinguishes_fields_and_command(self):
        for output, reason in [('PRIVATE malformed', 'invalid_fields'),
            ('100 S Thu Oct 29 09:02:36 2026 /Users/PRIVATE', 'incomplete_command')]:
            with self.subTest(reason=reason):
                self.assert_diagnostic(lambda: judge.process_identity(123),
                    subprocess.CompletedProcess(['ps'], 0, output, ''), 'identity', reason, attempt=1)

    def test_placeholder_exhaustion_keeps_bound_and_metadata(self):
        self.assert_diagnostic(lambda: judge.process_identity(123),
            subprocess.CompletedProcess(['ps'], 0, '100 S Thu Oct 29 09:02:36 2026 (python3.12)', ''),
            'identity', 'placeholder_exhausted', attempt=3)

    def test_timeout_is_classified_without_changing_failure_into_exit(self):
        with patch.object(judge.subprocess, 'run', side_effect=subprocess.TimeoutExpired('PRIVATE command', 2)):
            with self.assertRaisesRegex(RuntimeError, '^process_observation$') as caught:
                judge.state(123)
        diagnostic = getattr(caught.exception, 'diagnostic', None)
        self.assertEqual(diagnostic, {'stage': 'state', 'reason': 'timeout'})

    def test_real_case_preserves_failure_and_sanitized_diagnostic(self):
        # Fail only the child census; startup/runtime requests use a real local server.
        real_run = subprocess.run
        def bad_census(command, **kwargs):
            if command == ['ps', '-axo', 'pid=,ppid=']:
                return subprocess.CompletedProcess(command, 0, 'PRIVATE partial row', '')
            return real_run(command, **kwargs)
        with patch.object(judge.subprocess, 'run', side_effect=bad_census):
            row = judge.run_case(judge.PLAN[0], Path(__file__).resolve().parents[1], TLSPeer())
        self.assertFalse(row['passed'])
        self.assertEqual(row['harness_phase'], 'process_observation')
        self.assertEqual(row.get('process_observation'), {
            'stage': 'children', 'reason': 'invalid_rows', 'returncode': 0,
            'stderr_present': False, 'row_count': 1})
        self.assertFalse(row['cleanup_no_live_workers'])
        self.assertNotIn('PRIVATE', json.dumps(row))


if __name__ == '__main__': unittest.main()
