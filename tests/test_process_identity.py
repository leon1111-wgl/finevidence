"""Recorded launch observations must not authorize a guessed PID identity."""
import select
import subprocess
import sys
import unittest
from unittest.mock import patch

from scripts import evaluate_provider_exit as judge


class ProcessIdentityTests(unittest.TestCase):
    def result(self, command='(python3.12)', parent=100, start='Thu Oct 29 09:02:36 2026', code=0, error=''):
        text = f'{parent} S {start} {command}\n' if command is not None else ''
        return subprocess.CompletedProcess(['ps'], code, text, error)

    def test_recorded_placeholder_resolves_to_complete_identity(self):
        results = [self.result(), self.result(), self.result('/usr/bin/Python -c synthetic')]
        with patch.object(judge.subprocess, 'run', side_effect=results):
            try:
                actual = judge.process_identity(123)
            except RuntimeError as error:
                self.fail(f'valid launch observation was refused: {error}')
        self.assertEqual(actual, (100, 'S', 'Thu Oct 29 09:02:36 2026 -c synthetic'))

    def test_persistent_placeholder_is_bounded_and_unverified(self):
        with patch.object(judge.subprocess, 'run', return_value=self.result()) as probe:
            with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                judge.process_identity(123)
        self.assertEqual(probe.call_count, 3, 'exactly three bounded observations, no guessed identity')

    def test_parent_or_start_change_never_authorizes_cleanup(self):
        for changed in [self.result('/bin/Python -c synthetic', parent=101),
                        self.result('/bin/Python -c synthetic', start='Thu Oct 29 09:02:37 2026')]:
            with self.subTest(changed=changed.stdout):
                with patch.object(judge.subprocess, 'run', side_effect=[self.result(), changed]):
                    with patch.object(judge.os, 'kill') as kill:
                        self.assertEqual(judge.cleanup_workers({123:'Thu Oct 29 09:02:36 2026 -c synthetic'}),
                                         ['worker_cleanup_unverified'])
                        kill.assert_not_called()

    def test_confirmed_exit_after_placeholder_is_absence(self):
        with patch.object(judge.subprocess, 'run', side_effect=[self.result(), self.result(None, code=1)]):
            try: actual = judge.process_identity(123)
            except RuntimeError as error: self.fail(f'confirmed exit was refused: {error}')
        self.assertIsNone(actual)

    def test_diagnostic_after_placeholder_remains_unverified(self):
        with patch.object(judge.subprocess, 'run', side_effect=[self.result(), self.result('/bin/Python -c synthetic', error='private diagnostic')]):
            with self.assertRaisesRegex(RuntimeError, '^process_observation$'):
                judge.process_identity(123)

    def test_unrecognized_no_argument_command_is_not_retried(self):
        for command in ['python3.12', '/bin/sleep', '(unrelated)', '(python3.12)extra']:
            with self.subTest(command=command):
                with patch.object(judge.subprocess, 'run', return_value=self.result(command)) as probe:
                    with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                        judge.process_identity(123)
                    self.assertEqual(probe.call_count, 1)

    def test_complete_command_keeps_single_probe_fast_path(self):
        with patch.object(judge.subprocess, 'run', return_value=self.result('/bin/Python -c synthetic')) as probe:
            self.assertEqual(judge.process_identity(123)[2], 'Thu Oct 29 09:02:36 2026 -c synthetic')
        self.assertEqual(probe.call_count, 1)

    def test_probe_timeout_does_not_signal_an_unverified_process(self):
        with patch.object(judge.subprocess, 'run', side_effect=subprocess.TimeoutExpired('ps', 2)) as probe:
            with patch.object(judge.os, 'kill') as kill:
                self.assertEqual(judge.cleanup_workers({123:'known'}), ['worker_cleanup_unverified'])
                kill.assert_not_called()
        self.assertEqual(probe.call_count, 1)

    def test_retry_shares_original_two_second_observation_budget(self):
        now = [10]
        def delayed_probe(*args, **kwargs):
            now[0] = 13
            return self.result()
        with patch.object(judge.time, 'monotonic', side_effect=lambda: now[0]):
            with patch.object(judge.time, 'sleep'):
                with patch.object(judge.subprocess, 'run', side_effect=delayed_probe) as probe:
                    with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                        judge.process_identity(123)
        self.assertEqual(probe.call_count, 1, 'no fresh timeout after observation budget expires')

    def test_actual_owned_cleanup_after_recorded_transient(self):
        worker = subprocess.Popen([sys.executable, '-c', 'import time; print("ready",flush=True); time.sleep(30)'], stdout=subprocess.PIPE, text=True)
        try:
            self.assertTrue(select.select([worker.stdout], [], [], 3)[0])
            self.assertEqual(worker.stdout.readline().strip(), 'ready')
            identity = judge.process_identity(worker.pid)[2]
            real_run = subprocess.run; injected = []
            def transient(command, **kwargs):
                result = real_run(command, **kwargs)
                if command[-1] == 'ppid=,stat=,lstart=,command=' and not injected:
                    fields = result.stdout.strip().split(None, 7)
                    self.assertEqual(len(fields), 8)
                    result.stdout = ' '.join(fields[:7]) + ' (python3.12)\n'
                    injected.append(True)
                return result
            with patch.object(judge.subprocess, 'run', side_effect=transient):
                errors = judge.cleanup_workers({worker.pid:identity})
            self.assertEqual(errors, [])
            worker.wait(timeout=3)
            self.assertIsNotNone(worker.returncode)
            self.assertEqual(len(injected), 1)
        finally:
            if worker.poll() is None: worker.kill()
            worker.wait(timeout=3); worker.stdout.close()


if __name__ == '__main__': unittest.main()
