# Local provider request deadlines

The model adapter now owns a disposable subprocess for each call. The Agent
passes the smaller of15 seconds and its remaining45-second budget. The parent
uses one monotonic deadline across interpreter startup, request exchange and
result collection; on expiry it terminates and reaps the local worker, closes
its pipes, and only then returns MODEL_TIMEOUT. The HTTP handler's existing
finally block releases its request slot. No retry or successful fallback occurs.

The disposable child also arms its own operating-system timer from that same
absolute deadline before TLS setup. If the server exits while its daemon request
thread is waiting, this timer still terminates the child at the original budget.
It does not restart a fresh 15 seconds or require parent cleanup to execute.

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
3. The child restores the default SIGALRM disposition, unblocks it, and arms
   ITIMER_REAL from the remaining absolute deadline. These changes affect only
   the disposable child. The OS default termination action avoids waiting for a
   Python exception handler to run; the timer remains armed through stdout/exit.
   The child builds the same TLS-verifying, no-redirect transport. It accepts at
   most24,000 request bytes, reads at most65,537 upstream bytes to detect the
   65,536-byte response limit, and validates completion/content/usage as before.
4. Only validated content/model/usage or a fixed error code returns over stdout.
   Stderr is discarded; raw provider errors and bodies are not surfaced. The
   private envelope/response limit is131,072 bytes: escaped non-BMP content may
   be larger than its UTF-8 upstream representation. Worker failure is
   MODEL_WORKER, without raw exceptions.
5. A surviving parent rejects any result received after the deadline and reaps
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
- Server exit can leave an in-flight child running until its original deadline;
  immediate shutdown cancellation is not promised. On Linux, PID 1 may retain a
  dead orphan zombie briefly; it owns no connection. Parent-alive calls still
  explicitly kill/wait. Unix signal timers are required (Linux/macOS); missing
  support returns MODEL_WORKER before network I/O, without a silent fallback.
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
Python's [signal timer and handler documentation](https://docs.python.org/3.12/library/signal.html#signal.setitimer)
documents Unix availability, SIGALRM delivery and deferred Python-handler
execution (checked 2026-10-26). The worker uses the OS default action.

## Reproduce and interpretation

```sh
python3 -m unittest discover -s tests -p 'test_provider*.py' -v
python3 scripts/evaluate_provider_deadline.py --output deadline.json
python3 scripts/evaluate_provider_exit.py --output exit.json
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

## FE-029: server exit is a distinct lifecycle boundary

The independent 3f977c9 audit found both actual server SIGINT and SIGKILL left a
worker and established TLS connection alive at 16 seconds. A direct
KeyboardInterrupt inside ModelProvider had passed; it did not represent the
main server thread exiting while a daemon request thread owned the worker.
This is a reproduced P2 regression in the earlier parent-only implementation.

Before the fix, both direct-worker tests failed without a parent watchdog:
ordinary signal state and inherited ignored/blocked SIGALRM. Both now terminate
within their existing 0.8-second budget plus test tolerance. A separate actual
child with unavailable timer support returns MODEL_WORKER without opening TLS;
the baseline instead returned a response. The fixed four-case
server judge uses real HTTP/Agent/TLS, original 15/45-second budgets and body
chunks shorter than socket timeouts. It measures SIGINT/SIGKILL/SIGTERM on the
first call and SIGKILL after three 14-second tool responses. At 3f977c9 all four
workers remain active past budget; the candidate satisfies 4/4 at approximately
15.030/15.026/15.056/45.062 seconds. The harness only kills surviving workers
after judging and records cleanup separately. This measures bounded resource
retention after service exit, not financial accuracy or faster model inference.

The [first-run report](validation/provider-exit-2026-10-26.json) records both
versions, source/plan hashes, timing, connection states, usage limits and separate
normal controls. No server-exit case receives an audit: usage remains unknown.
CI runs the same four cases on Linux/macOS; exact CI results and independent
closure are separate from these local candidate results.


Prepublication review found a judge-v1 observation weakness: failed `ps` queries
could look like an absent PID. Four negative assertions reproduced it. Judge v2
requires confirmed live/absent observations and fails on unavailable diagnostics;
cleanup errors are retained and cannot turn into a pass. Four focused evaluator
contracts pass, including actual owned-worker termination. Historical v1 reports
remain intact; a separate v2 candidate run and exact-release CI check the hardened
judge. This change does not alter the production timer or the four-case plan.


The first published ac5dbce CI run failed on macOS: all four exit cases timed
out waiting for server startup at 8 seconds, before any TLS request. That job
passed Python 251/251 and the existing six deadlines; Ubuntu passed all four
exit cases. Browser/Pages jobs were skipped. The underlying startup delay is
unproven; another HTTP test in that macOS job took about 35 seconds.

Judge v3 gives server readiness its own bounded 60-second allowance and records
startup duration/exit status before cleanup. It reads available banner bytes
under one absolute deadline, so partial output cannot block indefinitely. The
15/45-second measurement still starts after readiness/runtime setup immediately
before POST; no transport budget or tolerance is increased. Five readiness
contracts cover delayed success, silence, partial output, early exit and a wrong
banner. The delayed/partial/exit first failures are retained. The first failed
CI run is not replaced with a successful rerun; the revised judge needs its own
commit and exact CI evidence.

Judge4's early worker registry, stopped-server final census and unverified cleanup
semantics are documented in [EXIT_EVALUATION_CLEANUP](EXIT_EVALUATION_CLEANUP.md).
This fixes FE-030 measurement/cleanup behavior; the production timer is unchanged.

## Test stage evidence, 2026-10-30

The original three subsecond regression methods count the worker's startup in
their 0.6-second calls. A timeout before a TCP accept cannot establish TLS or
HTTP cleanup behavior. Their scoped observer now retains expected stage,
TCP/HTTP count deltas, the fixture close event, worker count/reaped/process-gone
and pipe-closed booleans even if an earlier assertion fails. Failure output uses
fixed codes and bounded scalar JSON; it excludes argv, PID, prompt, keys, paths
and raw exception text. A separate original assertion may still print its own
ordinary unittest traceback. Only four worker summaries are retained; the full
worker count remains checked. Observation time includes the existing peer-close
wait, not just the provider call. The shared trickle close event is not a
per-connection EOF guarantee.

Missing target stage is `DEADLINE_STAGE_NOT_REACHED`, never a pass or skip.
A cleanup failure, duplicate/missing request or unexpected assertion/exception
also remains a failure. All original 0.6-second calls, 1.3-second elapsed checks,
connection/request assertions and 15/45-second production budgets remain.
Production code is byte-unchanged. The external unchanged review probe and new
contract test inject only 0.8 seconds before launching the actual worker.
They observe 0 TCP/HTTP and four reaped workers across three failed methods.
The outer contract is green only if those child methods are still red and their
diagnosis is complete; it does not add three passing network scenarios.

Run the two distinct checks:

```sh
python3 -m unittest discover -s tests -p test_deadline_evidence.py -v
python3 -m unittest discover -s tests -p test_provider_deadline.py -v
```

Four new contract methods contain three delayed-start scenarios and three mock
judge controls (unreaped worker, duplicate request, private assertion canary).
Initially all four methods failed; first implementation passed 3/4 because one
nested Popen tracker bypassed the observer. After chaining that tracker through
the observer, the unchanged contracts pass 4/4 and normal network methods 7/7.
The [first-result record](validation/deadline-stage-2026-10-30.json) preserves
timings, denominators and both original-probe outputs. These known engineering
controls measure diagnosis, not financial accuracy, real-report quality, hidden
performance or saved analyst time. The previous natural failures remain
unresolved; this controlled trigger does not establish their cause.

## Orphan failure classification, 2026-10-30

The direct-worker orphan regression previously stopped at `returncode != 0`,
before recording stdout. A worker can legitimately exit0 with a safe error
protocol object; the bare failure cannot distinguish it from a result. The
original macOS CI41002669637 failure is preserved and still lacks that evidence.

`OrphanDeadlineTests.observe_orphan` surrounds the original assertions and cleanup.
It retains output byte count, output kind, result-field presence (null if not
parsed), an allowlisted error code, original signal configuration, TCP/HTTP
counts, completed/observation time, pre-cleanup return code, cleanup intervention,
reaping/process absence and pipe closure. At most4096 output bytes are parsed;
no raw content, argv, PID, path, environment or exception text is emitted.
Unknown or oversized output stays unclassified and failed. Error text and
unknown fields are never copied. Completed time excludes cleanup; observation
time includes it. Neither is a product SLA or evidence of remote cancellation.

The scope always attempts the existing kill/communicate cleanup. It records
whether that cleanup intervened: a watchdog timeout cannot become a passing
orphan case just because the test subsequently killed the worker. Missing
network stage, duplicate requests, protocol errors, actual result fields,
unexpected output, cleanup failure and earlier assertions all remain failures.
The 0.8-second child deadline, 1.6-second test escape/elapsed assertions and
15/45-second production budgets are unchanged. No retries were added.

```sh
python3 -m unittest discover -s tests -p test_orphan_evidence.py -v
python3 -m unittest discover -s tests -p test_provider_orphan_deadline.py -v
```

Six contract methods include real TLS HTTP503 and truncated-body faults at two
signal configurations (four expected child failures), two normal configurations,
and ten pure judge negative controls: missing stage, duplicate request, watchdog
cleanup, surviving worker, result output, unknown error, malformed output,
oversized output, allowlisted error with private extra data, earlier assertion.
The doubles exercise only the diagnostic judge; they are not actual process or
network coverage. First contracts0/6 (12 subassertion failures), then6/6; normal
orphan file2/2. The unchanged external review probe independently retains the
four expected protocol failures with safe classification4/4, previously0/4.
Full first timings and usage boundaries are in the validation record. Passing
these contracts does not explain the earlier natural CI failure or close the
production timeout investigation.

### Request-body capacity observation discovered during regression

The first full local regression was298/299: the final request-body slot census
observed3/4 immediately after a successful response. A controlled0.2-second
pause after sending bytes reproduces the same assertion, showing that client
receipt precedes the handler's finally. The test now acquires all four slots
under one1-second observation deadline and releases its census acquisitions in
finally; request/model budgets and response predicates do not change. The
controlled healthy case changes0/1→1/1; intentionally omitted release remains
rejected1/1. The new contract1/1 and normal request-body file8/8 pass. This
repairs the observation race, not a demonstrated production capacity leak; the
first natural scheduling sequence was not recorded and is not reconstructed.

Run `python3 -m unittest discover -s tests -p test_request_slot_observation.py -v`.
The finite post-response pause is an explicit scheduler injection; the missing
release control must remain failed. Actual acquisition of all four slots is
the acceptance condition, not a sleep, semaphore private counter or mocked
release-call count. Production server code is unchanged.

### First CI classification and exception-chain correction

First publicatione722471 CI41019311798 attempt1 failed macOS299/300. The new
observation identified MODEL_TIMEOUT,26 output bytes,no result,one TCP/HTTP,
no cleanup intervention and reaped/closed worker at0.827159 seconds. This is
not late model success; OS/socket timer ordering remains unproven, and the
strict target case remains failed. It cannot retrospectively classify the
older CI41002669637 run, which lacked output evidence.

CI also exposed exception chaining: the first canary checked only `str(exc)`.
A full-traceback canary first fails0/1; explicit `raise ... from None` removes
the original private assertion context while retaining the safe failure and
cleanup evidence. Updated contracts pass6/6 and full local Python300/300.
The initial release and its CI failure remain in the record.
This corrects test diagnostics only; no protocol error is newly counted as
successful deadline coverage, and the original assertions/budgets remain.


## Full traceback privacy

The stage observer is a test diagnostic boundary. Python can render the original
exception even when the final message contains only safe fields. It now raises
`failureException` with explicit `from None`, matching the orphan observer.
This suppresses original context in standard formatted tracebacks; it is not
memory erasure or a promise to hide local filenames in ordinary stack frames.
Reproduction uses synthetic canaries; no actual credential exposure was observed.

Run `python3 -m unittest discover -s tests -p test_deadline_evidence.py -v`.
Tests inspect full `traceback.format_exception` for AssertionError and ValueError
with absent/present HTTP stage, preserving primary failure, fixed code, counts
and cleanup. Missing-stage, duplicate and unreaped controls remain failures.
Four new safe-traceback cases change0/4 to4/4; no production or budget change.
The first red and unchanged external probe are in the
[validation record](validation/deadline-traceback-2026-10-30.json).


## Orphan stream fixture correction (2026-10-31)

The original six-chunk orphan fixture could make its 0.6-second gap exceed the
remaining socket wait after setup. A delayed-setup real-TLS control exposed
competing socket errors; it does not reconstruct earlier CI event ordering.
That scenario now uses 61 chunks with nominal0.05-second gaps, the same3-second
body and0.8/1.6-second deadlines, and exactly-SIGALRM/empty-output assertions.
A disabled-timer control must remain active until the failing escape hatch.
Production transport/budgets and other fixture plans are unchanged. See
[the bounded correction and first evidence](ORPHAN_STREAM.md).
