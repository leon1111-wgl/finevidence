# Local provider request deadlines

The model adapter now owns a disposable subprocess for each call. The Agent
passes the smaller of15 seconds and its remaining45-second budget. The parent
uses one monotonic deadline across interpreter startup, request exchange and
result collection; on expiry it terminates and reaps the local worker, closes
its pipes, and only then returns MODEL_TIMEOUT. The HTTP handler's existing
finally block releases its request slot. No retry or successful fallback occurs.

This addresses a measured limitation of the old synchronous urllib adapter:
a peer that kept writing below the per-operation timeout could hold the request
past the intended elapsed budget. The old runbook described checkpoint behavior;
this is an E3 reliability enhancement, not evidence of a broken remote-cancellation
promise. Historical audit outputs retain their original judge and outcomes.

## Boundary and data flow

1. The parent validates configuration/request size, calculates the deadline and
   starts the current Python executable with isolated mode (`-I`).
2. A private stdin pipe carries the configured endpoint/key, messages, CA path
   and deadline. Secrets and prompts never enter command arguments or files;
   FINEVIDENCE environment entries are removed from the child environment.
   Ordinary proxy/OS settings remain supported. This is process isolation for
   lifecycle ownership, not an adversarial sandbox or OS-user secrecy boundary.
3. The child builds the same TLS-verifying, no-redirect transport. It accepts at
   most24,000 request bytes, reads at most65,537 upstream bytes to detect the
   65,536-byte response limit, and validates completion/content/usage as before.
4. Only validated content/model/usage or a fixed error code returns over stdout.
   Stderr is discarded; raw provider errors and bodies are not surfaced. The
   private envelope/response limit is131,072 bytes: escaped non-BMP content may
   be larger than its UTF-8 upstream representation. Worker failure is
   MODEL_WORKER, without raw exceptions.
5. The parent rejects any result received after the deadline and always reaps
   the worker. Missing usage on a timed-out/failed call remains unknown, never0.
   Previously received usage in a multi-call Agent is preserved.

The existing four-slot loopback server bounds concurrently active requests.
An authored HTTP integration test starts four slow TLS calls, observes a fifth
request rejected with429, waits for four422 MODEL_TIMEOUT results with no answer,
then acquires all four slots and calculates the same synthetic30.00% margin.
The per-call budget is scaled to2 seconds in that integration test; the separate
six-case evaluation exercises the actual15/45-second production settings.

## Limits

- Local socket/worker cleanup does not prove the remote provider canceled its
  work or stopped billing. Browser cancellation still does not cancel a backend
  request; the backend completes or reaches its own deadline. Browser wait is50s.
- Process creation, OS scheduling and process reaping are not hard-real-time
  operations. Elapsed times include small cleanup overhead; no exact millisecond
  guarantee or production SLA is claimed. Parent adapter configuration occurs
  before complete(), and deterministic tool execution retains checkpoint checks.
- One interpreter and TLS context per call adds startup cost. Preserve observed
  timings, including the fast control, instead of claiming faster ordinary calls.
- The subprocess handles networking/parsing only. It has no arbitrary model-selected
  shell/SQL/URL tools; the Agent's decision allowlist is unchanged.

Python documents blocking-operation [urlopen timeouts](https://docs.python.org/3.12/library/urllib.request.html#urllib.request.urlopen)
and explicit kill/wait cleanup for [Popen.communicate](https://docs.python.org/3.12/library/subprocess.html#subprocess.Popen.communicate)
(checked2026-10-26). These support the design, not a remote-spend guarantee.

## Reproduce and interpretation

```sh
python3 -m unittest discover -s tests -p 'test_provider*.py' -v
python3 scripts/evaluate_provider_deadline.py --output deadline.json
# Compare an unchanged temporary checkout with exactly the same plan/judge:
python3 scripts/evaluate_provider_deadline.py --implementation-root /path/to/baseline --output baseline.json
```

The fixed six-case plan uses real local TLS and synthetic protocol responses,
zero external providers/models. Cases: fast control; silent response; scaled slow
body;18-second body with15-second budget;50-second first Agent response with15-second
call budget; three14-second tool decisions followed by a10-second finish response,
which must stop at the remaining Agent budget. Each plan runs once in order.
The last two cases expect MODEL_TIMEOUT from the active provider deadline; this
is a new explicit judge and is not substituted into the original five-case audit.
A2-second worker startup/crash fixture is separate from these six measurements.

Initial four new test methods produced three failed methods/four failed assertions
on the unchanged adapter, with normal TLS/redirect/size behavior passing. Expanded
tests then found the new IPC limit rejected6,000 non-BMP characters; a larger bounded
IPC envelope fixed it without relaxing the upstream limit. A separate test initially
omitted the required MeteredProvider timeout argument; that harness error and its
correction are preserved. These are engineering development regressions, not six
financial tasks, hidden cases, real-report quality or measured analyst savings.
Historical live-model7/8, FE-013, E2 human/source review and finalE7 remain open.
