"""An unavailable OS observation is not proof that a network worker exited."""
import os
import subprocess
import sys
import unittest
from unittest.mock import patch

from scripts.evaluate_provider_exit import alive, cleanup_workers


class ExitEvaluationTests(unittest.TestCase):
    def test_actual_live_and_reaped_process_states(self):
        self.assertTrue(alive(os.getpid()))
        child = subprocess.Popen([sys.executable, '-c', 'pass'])
        child.wait(timeout=3)
        self.assertFalse(alive(child.pid))

    def test_failed_or_empty_process_probe_cannot_prove_exit(self):
        for code, output, error in ((2, '', 'probe failed'), (1, '', 'invalid PID'),
                                     (0, '', ''), (0, 'S', 'partial probe')):
            with self.subTest(code=code, output=output, error=error):
                result = subprocess.CompletedProcess(['ps'], code, output, error)
                with patch('scripts.evaluate_provider_exit.subprocess.run', return_value=result):
                    with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                        alive(os.getpid())

    def test_unavailable_cleanup_is_recorded_without_guessing_a_pid_target(self):
        with patch('scripts.evaluate_provider_exit.alive', side_effect=RuntimeError('private probe error')):
            with patch('scripts.evaluate_provider_exit.os.kill') as kill:
                self.assertEqual(cleanup_workers([12345]), ['worker_cleanup_unverified'])
                kill.assert_not_called()

    def test_actual_cleanup_terminates_the_owned_worker(self):
        worker = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        try:
            self.assertEqual(cleanup_workers([worker.pid]), [])
            self.assertIsNotNone(worker.poll())
        finally:
            if worker.poll() is None: worker.kill()
            worker.wait(timeout=3)


if __name__ == '__main__': unittest.main()
