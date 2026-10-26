# Exit-evaluation cleanup and FE-030

The bfc14df independent audit stalled a real loopback TLS handshake before an
HTTP request reached the peer. The exit judge failed with `TLS_request_count`,
but returned `cleanup_no_live_workers=true` while its transport worker and
established connection were still live at about 5.24 seconds. This was a P3
failure-cleanup/reporting defect, not a false financial answer or a recurrence
of the production 15-second deadline defect.

## Judge4 ownership and failure path

`run_case` records child process identities while waiting for the fixed request
count. `remember_workers` requires an intact process census containing the owned
parent. Empty, malformed, diagnostic-bearing or duplicate-PID output is not an
empty process tree. A missing live parent, or a parent that disappears during a
required final census, is unverified.

Before cleanup, `final_census` stops a still-running owned server with SIGSTOP,
waits for its stopped state within a separate two-second observation allowance,
and captures any last child. This prevents that server's request threads from
spawning a worker after the final enumeration. The server is then terminated;
it is never resumed. A deliberately exited server already has its last active
worker recorded before the test signal. Unexpected server exit is not accepted
as proof of a complete census.

Cleanup checks the recorded start time and command arguments again before
signalling a worker. It excludes executable argv0 because macOS Python changes
from its launcher to Python.app without changing the arguments or start time.
A changed/unreadable identity is `worker_cleanup_unverified`, with no guessed
signal target. Registry identities stay in memory; only tracked PIDs and fixed
error categories appear in the report. No credential or command content is
exported. This is a best-effort OS observation for owned test processes, not an
atomic PID capability or adversarial process-isolation guarantee.

After cleanup, the original failure phase and `passed=false` remain. An
unverified worker census makes `cleanup_no_live_workers=false`. Each completed
request keeps the same 15/45-second deadline and .75-second observation tolerance;
cleanup does not turn a failed exit test into a pass. The production provider,
financial tools, model permissions and browser UI are unchanged.

## Reproduction and evidence

```sh
python3 -m unittest discover -s tests -p test_provider_exit_evaluation.py -v
python3 scripts/evaluate_provider_exit.py --output exit.json
python3 scripts/evaluate_provider_deadline.py --output deadline.json
```

The actual HTTP/TLS handshake test independently observes owned worker PIDs,
requires the peer socket to close, and checks that no observed worker is live
when the judge reports clean. It preserves the expected `TLS_request_count`
failure and no financial/model result. A frozen independent probe changed
0/1 to 1/1 on this cleanup contract; [raw before/after evidence](validation/exit-cleanup-2026-10-27.json)
retains the first run. The probe's legacy exit0 means it reproduced the defect;
a fixed implementation therefore returns exit1 from that defect detector.
Interpret the captured worker/socket states, not that detector's exit alone.

Other regressions exercise unavailable process observations, changed identity,
partial census, a missing live parent and an actual parent death after STOP but
before census. The unrelated sleeper must survive a mismatched identity; the
owned matching worker must exit. These are engineering controls, not additional
financial tasks or human productivity measurements.

## Preserved failures and limits

- Initial focused regression: 9/12, with three failures (handshake leak,
  unverified census treated as clean, and changed identity not respected).
- First candidate: 11/12. The macOS launcher-to-Python.app exec made full-command
  identity too strict; the observed mismatch was retained before adjustment.
- Prepublication review found empty/partial census and a parent-exit race.
  Both first reproductions and subsequent controls are retained; they were
  fixed before publication, without changing the production worker timer.
- Python Chrome startup first run: 15/16; the 1440px healthy case timed out at
  the unchanged 12-second readiness bound. Its original output is retained.
  One separately instrumented diagnostic passed 1/1 in 963ms with no captured
  network failure. It does not identify or fix the first failure's root cause.
- This round makes zero real/paid-model calls and adds no hidden cases or human
  financial labels. Interrupted exchanges with no returned usage remain unknown.
  Historical real-model 7/8 and FE-013, E2 genuine review/admission, natural startup
  observations and final E7 remain open. Exact-release CI/Pages verification and
  independent FE-030 closure are separate gates.
