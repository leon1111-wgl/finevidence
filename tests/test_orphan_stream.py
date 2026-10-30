"""The orphan fixture must exercise the OS timer, not a competing socket timeout."""
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import test_provider_orphan_deadline as orphan

METHOD = 'test_worker_deadline_survives_absent_watchdog_and_inherited_signal_state'


class OrphanStreamTests(unittest.TestCase):
    def observe_with_delayed_setup(self, disable_timer):
        # Delay only this disposable child's TLS setup. Keep the real transport,
        # absolute .8s budget, original exec/mask wrapper and 1.6s escape hatch.
        # Removing setitimer is a negative control: the fixture must still be
        # streaming when the escape hatch expires, not return a socket error.
        source = ('import runpy,signal,time\n'
                  f'scope=runpy.run_path({str(Path(orphan.provider.__file__).resolve())!r})\n'
                  'transport=scope["_Transport"]; original=transport.__init__\n'
                  'def delayed(self,*args,**kwargs):\n'
                  ' original(self,*args,**kwargs); time.sleep(.35)\n'
                  'transport.__init__=delayed\n')
        if disable_timer:
            source += 'signal.setitimer=lambda *args: None\n'
        source += 'scope["_worker"]()\n'
        original_popen = subprocess.Popen
        worker_path = str(Path(orphan.provider.__file__).resolve())
        with tempfile.TemporaryDirectory(prefix='orphan-stream-control-') as directory:
            driver = Path(directory) / 'worker.py'
            driver.write_text(source)
            def launch(command, *args, **kwargs):
                if isinstance(command, list) and command[-1] == worker_path:
                    command = [*command[:-1], str(driver)]
                return original_popen(command, *args, **kwargs)
            case = orphan.OrphanDeadlineTests(METHOD)
            result = unittest.TestResult()
            with patch.object(orphan.subprocess, 'Popen', launch):
                case.run(result)
        self.assertEqual(result.errors, [])
        rows = getattr(case, 'orphan_observations', [])
        self.stream_observations = rows
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertEqual((row['tcp_accepted'], row['http_requests']), (1, 1))
            self.assertTrue(all(row['cleanup'].values()))
        return result, rows

    def test_delayed_setup_still_terminates_by_alarm_without_output(self):
        result, rows = self.observe_with_delayed_setup(False)
        self.assertTrue(result.wasSuccessful(), result.failures)
        for row in rows:
            self.assertEqual(row['returncode_before_cleanup'], -signal.SIGALRM)
            self.assertEqual(row['stdout_bytes'], 0)
            self.assertFalse(row['cleanup_intervened'])

    def test_disabling_timer_leaves_stream_active_until_failing_escape(self):
        result, rows = self.observe_with_delayed_setup(True)
        self.assertFalse(result.wasSuccessful())
        self.assertEqual(len(result.failures), 2)
        for row in rows:
            self.assertEqual(row['failure_code'], 'ORPHAN_WATCHDOG_EXPIRED')
            self.assertIsNone(row['returncode_before_cleanup'])
            self.assertIsNone(row['safe_error'])
            self.assertTrue(row['cleanup_intervened'])


if __name__ == '__main__': unittest.main()
