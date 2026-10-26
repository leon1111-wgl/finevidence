# Browser fault-suite failure evidence

FE-019 was reproduced at `8ee1830`: if the PDF fault suite failed during navigation or readiness, it exited 1 before writing its final JSON. A first-case startup failure lost all case records; a second-case startup failure also lost the preceding pass from the structured artifact. CI already rejected the failing run. This was an evidence/reporting defect, not incorrect financial output.

## Contract

`tests/browser-pdf-faults.cjs` now writes `pdf-faults/result.json` before browser startup, before each case, after each case and on finalization. A temporary file is renamed over the checkpoint. The four planned case names are present throughout. Each row has a status (`not_run`, `running`, `passed`, `failed`), a phase (`not_started`, `initialization`, `scenario`, `complete`, or `cleanup`) and a nullable `passed` value. `null` is not a pass.

The report records `total=4`, `attempted`, `passed`, `failed`, `not_run`, a per-run ID, `finished`, and an optional suite error. `finished=true` means the runner ended, not that the suite passed. Initialization failure stops subsequent PDF cases, which remain `not_run`; assertion failures retain the existing continue-through-other-cases behavior. Every incomplete or failed suite exits nonzero. The original readiness wait, PDF deadlines, failure assertions and successful four-case control are unchanged.

Failure diagnostics contain only boolean readiness fields, a page-error count and up to 16 allowlisted resource events with names/status codes. They exclude raw URLs, query strings, headers, bodies, DOM text, PDF content, prompts and exception messages. Capturing readiness is bounded to 1.5 seconds and may be unavailable. These observations help locate a stage; they do not prove the original cause of a past uncaptured public timeout.

The normal fixture-only timeout screenshot remains. This reporter is a local/CI test utility, not application telemetry or a persistent enterprise audit service. Checkpointing does not guarantee a final report after SIGKILL, browser-host failure, a missing/unwritable output directory or disk failure. An interrupted report with `finished=false` must not be treated as complete. Use a fresh artifact directory for an independent run and retain prior failures.

## Executable regression

```sh
python3 scripts/build_web.py
pnpm install --frozen-lockfile --ignore-scripts
# Use an installed Chromium via CHROME_PATH, or the project's Playwright browser.
pnpm test:browser-report
```

`tests/browser-pdf-report.cjs` starts an ephemeral loopback fixture server and invokes the actual PDF fault script as a subprocess twice:

1. First navigation: manifest returns 503. The child must exit 1 and report 0 passed / 1 failed / 3 not run, phase initialization.
2. First PDF case passes, second navigation gets invalid runtime JSON containing a private-content canary. The child must exit 1 and retain 1 passed / 1 failed / 2 not run. Neither report nor child output may echo the canary.

Both checks also observe a persisted unfinished checkpoint, a fixed denominator, bounded resource diagnostics and visible application retry state. The fixture counts document navigations rather than concurrent manifest/runtime requests so response arrival order cannot select the wrong fault. There are no application test hooks, live model calls or production changes. CI runs this contract once in addition to the unchanged static/Python browser suites.

## Measured scope

The same two report contracts first failed 0/2 on the unmodified runner because no final JSON existed. After the fix they pass 2/2; the child failures remain intentional failures. The independent review's original manifest-503 probe is a separate reproduction. The original normal PDF fault suite remains 4/4 on each local static/Python surface.

This measures retention of synthetic failure evidence. It is not financial accuracy, real-document extraction quality, a hidden-set score, analyst time saved or a competitor benchmark. The first live-model development result remains 7/8 with FE-013 open. The earlier public 18-second startup timeout remains unexplained; this change improves evidence for a future occurrence without claiming to have fixed its cause.

## Local review runner: phase and privacy contract (2026-10-26)

The independent audit of `543f4c2` retained a first-run 13/14 result: the 390px
`revoke-lost-response` case timed out at 6 seconds. Its raw exception did not say
whether initial load, reload, connection or revocation failed. A separate bounded
diagnostic passed; the original cause remains unknown. This change improves
future evidence, without treating the later pass as a correction of that failure.

`tests/browser-review-ledger.cjs` retains its fixed seven scenarios at 1440px and
390px, existing waits and assertions. It writes an atomic `review-ledger/result.json`
checkpoint before launch, before each phase, after a failure and after each case.
Rows distinguish `not_run`, `running`, `passed`, `failed`; the final report adds
`finished`, attempted counts, a run ID and an optional fixed suite error code.
A failed case still exits nonzero and subsequent independent cases still run.
A browser launch failure retains all 14 unattempted rows. Cleanup exceptions
cannot silently replace a case failure or a successful suite exit.

Phases distinguish initial readiness, reload readiness, connection, draft
preparation, save/retry, export, restart, revoke preparation/confirmation/retry,
and final assertions. The shared test helper captures only boolean UI state,
bounded record/page-error counts and the last 16 allowlisted HTTP errors or
failed requests. Paths are mapped to fixed names; query strings, response bodies,
headers, bearer values, drafts, notes, IDs, DOM text and raw exceptions are excluded.
Known network error codes such as `net::ERR_SOCKET_NOT_CONNECTED` are retained;
unknown strings become `OTHER_NETWORK_ERROR`. Readiness capture and the optional
failure screenshot each have a 1.5-second diagnostic limit, separate from the
unchanged application assertions. Unavailable diagnostics are explicit.

Failure screenshots preserve layout only: Playwright rectangles mask elements
with direct text nodes, inputs and media/canvas/embedded-document elements. The
initial style-based approach passed file-existence checks but visibly leaked
fixture text; it was rejected. A real screenshot pixel check under restrictive
CSP now tests text, input, textarea, canvas and SVG masks at both widths. The
ineffective style counterfactual fails 0/2; rectangle masking passes 2/2 (10/10
sampled regions). This is a fixed synthetic application harness, not a general
redaction service for arbitrary pages. Existing successful fixture screenshots
remain readable; do not run this suite against private source documents.

Run `python3 scripts/build_web.py`, then `pnpm test:review-ledger` and
`pnpm test:review-report`. The latter runs the privacy check and two real child
processes with test-only loopback response injection. For each child, seven cases
pass first; then either runtime loading or revocation returns 503 with a private
canary. The runner must retain 13 passed / 1 failed / 0 not run, the correct phase,
a 503 event, a masked screenshot, the prior-pass checkpoint, and exit 1. Both
report contracts failed against the original runner (0/2) and pass after the
change (2/2). HTTP injection uses a subprocess preload; application code has no
test hook. CI executes these checks once. There are no model calls or retries
until success. The ordinary local review suite remains 14/14.

These denominators measure synthetic incident evidence and screenshot privacy,
not financial correctness, analyst productivity or hidden-set generalization.
The original 13/14 and natural startup transport failures remain open. SIGKILL,
disk failure, a blocked process or unwritable output can still leave an unfinished
checkpoint; `finished=false` is never a completed run. Use a new artifact directory
for each attempt and preserve first failures.
