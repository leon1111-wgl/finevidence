# Local request-body deadline

An interrupted or slowly transmitted calculation/review request must not retain
one of the four local processing slots indefinitely. On `dc426d6`, a valid body
sent in five chunks at 1.6-second intervals still executed after 6.4 seconds:
the socket's five-second inactivity timeout restarted on subsequent raw reads.
This also allowed a delayed review record or revocation to take effect.

`Handler._read_body` now applies a five-second monotonic deadline to the complete
body of `/api/run`, `/api/reviews` and `/api/reviews/revoke`, after validation and
slot acquisition. Every `read1` uses the remaining time; the final chunk is also
checked. Expired input returns HTTP 408 / `REQUEST_TIMEOUT` without business
execution. Premature EOF remains HTTP 400. The previous socket timeout is restored
before response writing; the existing `finally` releases the slot. Input limits
remain 16 KiB for calculations and 32 KiB for review mutations. Authentication,
CSRF, Origin and content-type gates remain in place.

Python documents that `BufferedIOBase.read` may issue multiple raw reads, while
`read1` issues at most one. `socket.settimeout` bounds socket operations. These
interfaces motivate the explicit outer deadline; the observed bug is established
by the loopback reproduction, not documentation alone. Official sources accessed
2026-10-28: [buffered reads](https://docs.python.org/3.12/library/io.html#io.BufferedIOBase.read1)
and [socket timeouts](https://docs.python.org/3.12/library/socket.html#socket.socket.settimeout).

## Frozen known-defect evaluation

Five cases, one pass per revision, default five-second budget, real loopback HTTP,
synthetic financial data and synthetic review declarations. No provider/model
calls, tokens or unknown-usage calls; no hidden tasks, real-report tasks or new
human financial labels. The acceptance allows one second of observation overhead,
not an extra second of input budget. The sender attempts its scheduled remaining
chunks after the first response before side effects are checked.

| Case | Before status / seconds | After status / seconds | Business calls before → after |
| --- | --- | --- | --- |
| Normal calculation | 200 / 0.002184 | 200 / 0.001843 | 1 → 1 |
| Normal review record | 200 / 0.001951 | 200 / 0.001777 | 1 → 1 |
| Slow calculation | 200 / 6.413579 | 408 / 5.003012 | 1 → 0 |
| Slow review record | 200 / 6.427939 | 408 / 5.002537 | 1 → 0 |
| Slow revocation | 200 / 6.422593 | 408 / 5.002859 | 1 → 0 |

Known-case acceptance changes **2/5 → 5/5**; deadline refusals **0/3 → 3/3**;
normal controls remain **2/2**, including exact `30.00%`. Both rejected mutation
requests leave the ledger unchanged. These are input availability and side-effect
contracts, not financial-accuracy gains or measured analyst time savings.
The fixed eight financial tasks remain a separate evaluation.

Raw results: [before](validation/request-body-before-2026-10-28.json) and
[after](validation/request-body-after-2026-10-28.json). Both identify base SHA;
the candidate additionally records its tracked production diff hash. The first
probe used the unsupported `gross_margin` operation and produced 1/5 with two
422s. Its complete local report is retained; only that fixture spelling was
corrected to `gross-margin` before any production change. It is not a claimed
product improvement. Initial JavaScript checks were launched before generated
`bundle.json` existed; those two missing-file failures are retained and checks
must follow the build. An interrupted full Python run has no pass claim.

## Reproduction and boundaries

```sh
python -m unittest discover -s tests -p test_request_body.py -v
python scripts/evaluate_request_body.py --output /tmp/request-body.json
```

Eight focused test methods also cover fragmented/buffered success, EOF,
authentication/size refusal, no Agent invocation, four simultaneous timeouts
followed by a successful calculation, and a final chunk crossing the deadline.
Negative unit tests use accelerated 0.3/0.5-second budgets; normal network controls, the standalone evaluation and
Linux/macOS CI step use the unmodified five-second budget. An incomplete Agent
input reaches only a mocked Agent in the red test, never a live provider.

This deadline starts at body admission. Request-line/header reads still use
inactivity timeouts, and the threaded server has no global connection/thread cap.
This is not a general Slowloris/production DoS defense. Model transport budgets,
financial rules, browser GET modules and static Pages behavior are unchanged.
Natural browser module connection resets have no established causal connection
to this body-input defect and remain open. FE-013/historical live-model 7/8,
E2 and final E7 are also unchanged. Independent release review is still required.

Local complete regression: Python273/273 in73.455s; JavaScript246/246 in173.41925ms after build. Fixed synthetic financial tasks8/8 (numeric/source6/6 each, refusal2/2). Actual local Chrome desktop/narrow: keyboard export2/2, base14/14, retry7/7, startup16/16, restoration6/6. These are separate denominators. Exact-release CI and deployed verification are recorded by the release run.


## First release CI failure

The first release `0db0f3b`, Actions run40649298480, failed the macOS Python suite:
normal fragmented calculation and record controls returned408 under the test-only
0.3-second budget; the resulting record count was3 instead of4. All273 methods
ran in84.908s with three failure entries. Nominal four30ms sleeps do not guarantee
120ms end-to-end delivery; the log does not establish the exact network or
scheduler contribution. This is preserved as the first release failure.

Only the successful-input test now uses the real five-second production budget,
while still requiring200, exact30.00%, and exact ledger counts/revocation. Negative
accelerated deadlines and the five-case default-budget refusal evaluator are
unchanged. Production code and its five-second limit are unchanged. This avoids
claiming that normal network scheduling must fit a test-only300ms limit; it does
not relax the production deadline or the three expected408 outcomes.
