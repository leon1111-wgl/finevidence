# Keep the orphan-worker test dependent on its OS timer

The direct-worker test must observe a real TLS request and then autonomous
SIGALRM termination with empty output. It has no ModelProvider parent watchdog.
A safe socket timeout is a failed outcome for this specific timer-coverage test.

## Observed competition

The old peer split a three-second body into six chunks: a nominal 0.6-second
gap. The worker passes the remaining absolute budget as the socket timeout.
Interpreter/TLS setup reduces that wait, so it can become shorter than the
fixture gap. Socket error output and OS termination can then compete near the
same deadline; a safe error does not identify which mechanism enforced it.

A six-case local TLS diagnostic plan varied ordinary/inherited signal state,
no delay/0.35-second delayed transport setup, and a disabled-timer negative
control. With delayed setup the observed socket wait was about 0.39 seconds.
One armed case emitted MODEL_TIMEOUT before exiting by SIGALRM; both disabled
cases returned MODEL_TIMEOUT with exit0. No remote API or actual secret was used.
This establishes a controlled competing-timeout mechanism. Old macOS CI did not
record setup/socket event timing, so it does not establish that run's exact order.

## Minimal correction and stronger checks

Only the orphan scenario requests 61 chunks over the same three seconds, giving
nominal 0.05-second gaps. Other TLS evaluations keep their original six chunks.
The worker's 0.8-second absolute deadline and 1.6-second failing escape remain;
production code and 15/45-second limits are unchanged. The original nonzero-exit
assertion is strengthened to exactly -SIGALRM. Empty output, one real request,
no cleanup intervention and verified reaping/pipe closure remain required.

Two added contracts execute actual isolated workers with 0.35-second delayed
transport setup, each under ordinary and inherited ignored/blocked signal state:

- Timer present: require -SIGALRM, empty output, no cleanup intervention.
- Timer removed only in the disposable test child: require the original judge
  to fail at its escape hatch, with the child still active beforehand. Cleanup
  is recorded but cannot count as deadline success.

The new methods first failed0/2 and then passed2/2. At the four configuration
level, correct observations change1/4 to4/4: armed cases1/2 to2/2 and negative
controls0/2 to2/2. These overlapping denominators must not be summed. The original
safe-error negative controls continue to fail the target test. There is no
assertion relaxation, acceptance of protocol errors, or retry-until-green.

This fixture reduces competing idle-timeout coverage; it cannot eliminate
arbitrary OS scheduling delays. Failure remains visible if setup never reaches
HTTP, streaming stalls, the signal fails, or the worker needs cleanup.

## Reproduction and limits

```sh
python3 -m unittest discover -s tests -p '*orphan*.py' -v
python3 -m unittest discover -s tests -v
```

[First results](validation/orphan-stream-2026-10-31.json) retain sanitized
observations, timings, plan hashes and failures. Full original local logs remain
in the local Chinese evidence archive. A passing negative-control test means it
successfully detected a deliberately broken timer, not that the broken worker
satisfied its deadline. Exact-release CI/Pages must be checked independently.

Python documents socket timeout operations in [socket.settimeout](https://docs.python.org/3.12/library/socket.html#socket.socket.settimeout)
and Unix alarm timers in [signal.setitimer](https://docs.python.org/3.12/library/signal.html#signal.setitimer)
(accessed 2026-10-31). Documentation supports the mechanics; measured records
establish this fixture's behavior. No production uptime, financial accuracy,
analyst time saving or remote billing cancellation is measured. Historical live
model7/8, FE-013, source/human-review E2 and finalE7 remain open.
