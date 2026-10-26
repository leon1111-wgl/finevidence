"""An unavailable OS observation is not proof that a network worker exited."""
import os
import subprocess
import sys
import time
import threading
import unittest
from unittest.mock import patch

from scripts.evaluate_provider_exit import alive, cleanup_workers, wait_startup


class ExitEvaluationTests(unittest.TestCase):
    def startup_child(self, script):
        child = subprocess.Popen([sys.executable, '-c', script], stdout=subprocess.PIPE, text=True)
        def cleanup():
            if child.poll() is None: child.kill()
            child.wait(timeout=3); child.stdout.close()
        self.addCleanup(cleanup)
        return child

    def test_slow_startup_is_separate_from_provider_deadline(self):
        child = self.startup_child('import time; time.sleep(8.2); print("FinEvidence: ready", flush=True)')
        wait_startup(child)

    def test_never_ready_still_has_an_explicit_startup_bound(self):
        child = self.startup_child('import time; time.sleep(30)')
        started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'server_start'): wait_startup(child, timeout=.1)
        self.assertLess(time.monotonic() - started, .8)

    def test_early_exit_is_not_successful_startup(self):
        child = self.startup_child('raise SystemExit(1)')
        with self.assertRaisesRegex(RuntimeError, 'server_exit_before_ready'): wait_startup(child, timeout=1)

    def test_partial_banner_cannot_block_past_startup_deadline(self):
        child = self.startup_child('import sys,time; sys.stdout.write("FinEvidence:"); sys.stdout.flush(); time.sleep(30)')
        escape = threading.Timer(1, child.kill)
        escape.start()
        try:
            started = time.monotonic()
            with self.assertRaisesRegex(RuntimeError, 'server_start'): wait_startup(child, timeout=.2)
            self.assertLess(time.monotonic() - started, .8, 'escape timer must not make this pass')
        finally: escape.cancel(); escape.join()

    def test_wrong_banner_is_not_ready(self):
        child = self.startup_child('print("unrelated output", flush=True)')
        with self.assertRaisesRegex(RuntimeError, 'server_banner'): wait_startup(child, timeout=1)

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
