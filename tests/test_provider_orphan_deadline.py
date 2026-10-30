"""A real transport worker must enforce its deadline without a parent watchdog."""
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import time
import unittest
from contextlib import contextmanager

from finevidence import provider
from tls_provider_fixture import TLSPeer


class OrphanDeadlineTests(unittest.TestCase):
    @contextmanager
    def observe_orphan(self, peer, worker, started, inherited_mask):
        """Keep safe failure evidence without turning cleanup into deadline coverage."""
        capture = {'stdout': None, 'timed_out': False, 'completed_seconds': None}
        primary = None
        try:
            yield capture
        except AssertionError:
            primary = 'assertion'
        except Exception:
            primary = 'unexpected_exception'
        finally:
            before = worker.poll()
            intervened = before is None
            cleanup_error = False
            try:
                if intervened: worker.kill()
                worker.communicate()
            except Exception:
                cleanup_error = True
            try: os.kill(worker.pid, 0); gone = False
            except ProcessLookupError: gone = True
            except OSError: gone = False
            cleanup = {'reaped': worker.returncode is not None, 'process_gone': gone,
                       'stdin_closed': worker.stdin is not None and worker.stdin.closed,
                       'stdout_closed': worker.stdout is not None and worker.stdout.closed}
            output = capture['stdout']
            size = None if output is None else len(output)
            kind = 'unavailable' if output is None else 'empty' if not output else 'oversize'
            result_present = False if size == 0 else None
            safe_error = None
            if output and size <= 4096:
                try:
                    decoded = json.loads(output)
                    kind = 'object' if isinstance(decoded, dict) else 'non_object'
                    if isinstance(decoded, dict):
                        result_present = 'result' in decoded
                        if provider._safe_code(decoded.get('error')): safe_error = decoded['error']
                except (ValueError, RecursionError):
                    kind = 'malformed'
            tcp, http = peer.accepted, len(peer.requests)
            code = ('ORPHAN_CLEANUP_FAILED' if cleanup_error or not all(cleanup.values())
                    else 'ORPHAN_WATCHDOG_EXPIRED' if capture['timed_out'] or intervened
                    else 'ORPHAN_STAGE_NOT_REACHED' if tcp == 0 or http == 0
                    else 'ORPHAN_NETWORK_COUNT' if tcp != 1 or http != 1
                    else 'ORPHAN_RESULT_OUTPUT' if result_present
                    else 'ORPHAN_SAFE_ERROR' if safe_error
                    else 'ORPHAN_UNEXPECTED_OUTPUT' if size != 0
                    else 'ORPHAN_EXIT_ZERO' if before == 0
                    else 'ORPHAN_ASSERTION_FAILED' if primary == 'assertion'
                    else 'ORPHAN_TEST_ERROR' if primary else None)
            row = {'inherited_mask': inherited_mask, 'budget_seconds': .8,
                   'completed_seconds': capture['completed_seconds'],
                   'observation_seconds': round(time.monotonic() - started, 6),
                   'tcp_accepted': tcp, 'http_requests': http,
                   'returncode_before_cleanup': before, 'stdout_bytes': size,
                   'output_kind': kind, 'result_present': result_present,
                   'safe_error': safe_error, 'cleanup_intervened': intervened,
                   'cleanup': cleanup, 'cleanup_error': cleanup_error,
                   'primary_failure': primary, 'failure_code': code}
            if not hasattr(self, 'orphan_observations'): self.orphan_observations = []
            self.orphan_observations.append(row)
        if code:
            # No raw stdout, argv, PID, path, environment or exception text.
            raise self.failureException(code + ': ' + json.dumps(row, sort_keys=True)) from None

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
                # Keep inter-chunk gaps below the remaining socket wait even
                # after slow setup. Six chunks meant .6s gaps, which could
                # select a socket error before the OS alarm was observed.
                peer.chunk_count = 61
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
                with self.observe_orphan(peer, worker, started, inherited_mask) as capture:
                    # This timeout is only a failing-test escape hatch. No ModelProvider
                    # parent timer, signal handler or cleanup may make this test pass.
                    try:
                        output, _ = worker.communicate(envelope, timeout=1.6)
                    except subprocess.TimeoutExpired as exc:
                        capture['stdout'] = exc.output
                        capture['timed_out'] = True
                        self.fail('transport worker outlived its own absolute deadline')
                    capture['stdout'] = output
                    capture['completed_seconds'] = round(time.monotonic() - started, 6)
                    self.assertLess(time.monotonic() - started, 1.6)
                    self.assertEqual(len(peer.requests), 1, 'real TLS request; no retry')
                    self.assertEqual(worker.returncode, -signal.SIGALRM, 'OS alarm must terminate the worker')
                    self.assertEqual(output, b'', 'no late success or private diagnostics')


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
