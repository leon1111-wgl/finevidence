"""An unavailable OS observation is not proof that a network worker exited."""
import os
from pathlib import Path
import signal
import select
import subprocess
import sys
import time
import threading
import unittest
from unittest.mock import patch

from scripts.evaluate_provider_exit import alive, cleanup_workers, wait_startup
from scripts import evaluate_provider_exit as judge
from tls_provider_fixture import TLSPeer


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
        with patch('scripts.evaluate_provider_exit.process_identity', side_effect=RuntimeError('private probe error')):
            with patch('scripts.evaluate_provider_exit.os.kill') as kill:
                self.assertEqual(cleanup_workers({12345: 'captured identity'}), ['worker_cleanup_unverified'])
                kill.assert_not_called()

    def test_actual_cleanup_terminates_the_owned_worker(self):
        worker = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        try:
            self.assertEqual(cleanup_workers({worker.pid: judge.process_identity(worker.pid)[2]}), [])
            self.assertIsNotNone(worker.poll())
        finally:
            if worker.poll() is None: worker.kill()
            worker.wait(timeout=3)


    def test_cleanup_refuses_a_changed_process_identity(self):
        worker = self.startup_child('import time; time.sleep(30)')
        errors = cleanup_workers({worker.pid: 'different-start-or-command'})
        self.assertIn('worker_cleanup_unverified', errors)
        self.assertIsNone(worker.poll(), 'a reused/unverified PID must not be killed')

    def test_failed_child_census_is_not_a_successful_cleanup(self):
        peer = TLSPeer()
        with patch.object(judge, 'children', side_effect=RuntimeError('process_observation')):
            row = judge.run_case(judge.PLAN[0], Path(__file__).resolve().parents[1], peer)
        self.assertFalse(row['passed'])
        self.assertFalse(row['cleanup_no_live_workers'])
        self.assertIn('worker_census_unverified', row['cleanup_errors'])

    def test_handshake_failure_cleans_worker_before_reporting_clean(self):
        # A real server and a TLS socket stalled before the HTTP request count.
        class StalledPeer(TLSPeer):
            def __setattr__(self, key, value):
                super().__setattr__(key, 'tls-stall' if key == 'mode' else value)
        repo = Path(__file__).resolve().parents[1]
        peer = StalledPeer(); servers = []; observed = {}; stop = threading.Event()
        real_popen = subprocess.Popen
        def launch(*args, **kwargs):
            child = real_popen(*args, **kwargs)
            if args and isinstance(args[0], list) and 'finevidence.server' in args[0]:
                servers.append(child)
            return child
        def observe():
            while not stop.wait(.03):
                if not servers: continue
                # Independent PPID/command observation, not the judge registry.
                rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,command='], text=True)
                for line in rows.splitlines():
                    fields = line.strip().split(None, 2)
                    if len(fields) == 3 and fields[1] == str(servers[0].pid) and str(repo/'finevidence/provider.py') in fields[2]:
                        observed[int(fields[0])] = fields[2]
        watcher = threading.Thread(target=observe); watcher.start()
        try:
            with patch.object(judge.subprocess, 'Popen', side_effect=launch):
                row = judge.run_case(judge.PLAN[0], repo, peer)
            self.assertEqual(row.get('harness_phase'), 'TLS_request_count')
            self.assertFalse(row['passed'])
            self.assertTrue(observed, 'fault must exercise a real worker')
            self.assertTrue(peer.closed.wait(.5), 'owned TLS socket must close before cleanup returns')
            for pid in observed: self.assertFalse(alive(pid), 'worker is still live after reported cleanup')
            self.assertTrue(row['cleanup_no_live_workers'])
            self.assertEqual(row['cleanup_errors'], [])
        finally:
            stop.set(); watcher.join(timeout=3)
            for pid, command in observed.items():
                actual = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
                if actual.returncode == 0 and actual.stdout.strip() == command:
                    try: os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError: pass
            for server in servers:
                if server.poll() is None: server.kill()
                server.wait(timeout=3)


    def test_ambiguous_child_census_cannot_prove_empty(self):
        for output, error in (('', ''), ('not a process row', ''),
                              ('1 0\ntruncated', ''), ('1 0\n', 'partial probe')):
            with self.subTest(output=output, error=error):
                result = subprocess.CompletedProcess(['ps'], 0, output, error)
                with patch('scripts.evaluate_provider_exit.subprocess.run', return_value=result):
                    with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                        judge.children(os.getpid())


    def test_live_parent_missing_from_census_is_unverified(self):
        real_run = subprocess.run
        def missing_parent(command, **kwargs):
            result = real_run(command, **kwargs)
            if command == ['ps', '-axo', 'pid=,ppid=']:
                result.stdout = '\n'.join(line for line in result.stdout.splitlines()
                                          if line.split()[0] != str(os.getpid())) + '\n'
            return result
        with patch('scripts.evaluate_provider_exit.subprocess.run', side_effect=missing_parent):
            with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                judge.children(os.getpid())


    def test_parent_exiting_during_final_census_is_unverified(self):
        parent = self.startup_child('import subprocess,sys,time; '
            'child=subprocess.Popen([sys.executable,"-c",'
            '\'import time; print("ready",flush=True); time.sleep(30)\'],stdout=subprocess.PIPE,text=True); '
            'child.stdout.readline(); print(child.pid,flush=True); time.sleep(30)')
        self.assertTrue(select.select([parent.stdout], [], [], 5)[0])
        worker = int(parent.stdout.readline())
        identity = judge.process_identity(worker)[2]
        real_run = subprocess.run
        def exit_before_census(command, **kwargs):
            if command == ['ps', '-axo', 'pid=,ppid=']:
                self.assertTrue(judge.state(parent.pid).startswith('T'))
                parent.kill(); parent.wait(timeout=3)
            return real_run(command, **kwargs)
        try:
            with patch('scripts.evaluate_provider_exit.subprocess.run', side_effect=exit_before_census):
                with self.assertRaisesRegex(RuntimeError, 'process_observation'):
                    judge.final_census(parent, {}, False)
        finally:
            self.assertEqual(cleanup_workers({worker: identity}), [])


if __name__ == '__main__': unittest.main()
