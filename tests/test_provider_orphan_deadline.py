"""A real transport worker must enforce its deadline without a parent watchdog."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest

from finevidence import provider
from tls_provider_fixture import TLSPeer


class OrphanDeadlineTests(unittest.TestCase):
    def test_unavailable_timer_refuses_before_network(self):
        with TLSPeerContext() as peer:
            envelope = json.dumps({'settings': {
                k: os.environ[k] for k in ('FINEVIDENCE_API_KEY', 'FINEVIDENCE_API_BASE',
                                           'FINEVIDENCE_MODEL', 'SSL_CERT_FILE')},
                'messages': [], 'deadline': time.monotonic() + 2}).encode()
            # Simulate a Python platform without the Unix interval timer in the
            # actual child, not by replacing the provider's transport.
            command = [sys.executable, '-I', '-c',
                'import runpy,signal,sys; del signal.setitimer; '
                'runpy.run_path(sys.argv[1],run_name="__main__")',
                str(Path(provider.__file__).resolve())]
            completed = subprocess.run(command, input=envelope, capture_output=True, timeout=3)
            self.assertEqual(completed.returncode, 0)
            self.assertEqual(json.loads(completed.stdout), {'error': 'MODEL_WORKER'})
            self.assertEqual(peer.requests, [])
            self.assertEqual(peer.accepted, 0, 'no TLS connection without deadline enforcement')

    def test_worker_deadline_survives_absent_watchdog_and_inherited_signal_state(self):
        for inherited_mask in (False, True):
            with self.subTest(inherited_mask=inherited_mask), TLSPeerContext() as peer:
                peer.mode = 'body-trickle'; peer.duration = 3
                command = [sys.executable, '-I', str(Path(provider.__file__).resolve())]
                if inherited_mask:
                    # exec preserves ignored dispositions and the blocked signal mask.
                    # Avoid preexec_fn in this multithreaded real-TLS test process.
                    command = [sys.executable, '-I', '-c',
                        'import os,signal,sys; '
                        'signal.signal(signal.SIGALRM,signal.SIG_IGN); '
                        'signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGALRM}); '
                        'os.execv(sys.executable,[sys.executable,"-I",sys.argv[1]])', command[-1]]
                started = time.monotonic()
                envelope = json.dumps({'settings': {
                    k: os.environ[k] for k in ('FINEVIDENCE_API_KEY', 'FINEVIDENCE_API_BASE',
                                               'FINEVIDENCE_MODEL', 'SSL_CERT_FILE')},
                    'messages': [], 'deadline': started + .8}).encode()
                worker = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                          stderr=subprocess.DEVNULL)
                try:
                    # This timeout is only a failing-test escape hatch. No ModelProvider
                    # parent timer, signal handler or cleanup may make this test pass.
                    try:
                        output, _ = worker.communicate(envelope, timeout=1.6)
                    except subprocess.TimeoutExpired:
                        self.fail('transport worker outlived its own absolute deadline')
                    self.assertLess(time.monotonic() - started, 1.6)
                    self.assertEqual(len(peer.requests), 1, 'real TLS request; no retry')
                    self.assertNotEqual(worker.returncode, 0, 'late response cannot succeed')
                    self.assertEqual(output, b'', 'no late success or private diagnostics')
                finally:
                    if worker.poll() is None: worker.kill()
                    worker.communicate()


class TLSPeerContext:
    def __enter__(self):
        self.peer = TLSPeer()
        self.environment = self.peer.environment()
        self.environment.__enter__()
        return self.peer

    def __exit__(self, *args):
        self.environment.__exit__(*args)
        self.peer.close()


if __name__ == '__main__': unittest.main()
