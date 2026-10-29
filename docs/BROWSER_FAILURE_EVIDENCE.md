# Browser fault-suite failure evidence

## Main-document failure evidence (2026-10-29)

The24c5d31 review retained natural top-level ERR_CONNECTION_CLOSED failures,
but the shared collector excluded the trusted workbench document itself. A
failed/destroyed document could therefore report HARNESS_ERROR with empty
resources. The network root cause remains unknown. This change addresses only
the missing diagnostic evidence, within the existing FE-028 investigation.

The collector now accepts the configured workbench path (and its directory
slash form) only for an actual main-frame navigation on the same origin. It
exports the fixed resource name main_document, existing HTTP status or safe
network-code mapping, and the caller's phase. URL, query, fragment and exception
text are not retained. Fetches, subframes, unrelated paths/origins and missing
frame identity are excluded. The existing16-event cap and unavailable-document
result remain; captured events survive page destruction. All existing observe
callers receive the field without a second error parser or production telemetry.

Six unit contracts change2/6→6/6. The frozen actual Chromium plan uses
root/Pages-like directories ×1440/390px ×HTTP503/connection-closed/healthy:
first4/12→12/12; main-document fault capture0/8→8/8, while explicit recovery,
30.00%, checked source and actual JSON downloads remain12/12 in both arms.
Closing the failed page before reading diagnostics verifies retention without
assuming a usable DOM. Recovery is a separate explicit navigation, never a
retry of a model request or a replacement for the original failure result.

Run python3 scripts/build_web.py, node --test tests/navigation-report.test.mjs,
and node tests/browser-navigation-report.cjs with installed Playwright/Chromium.
The browser command starts its own loopback static fixture; BASE_URL optionally
checks the deployed surface (six cases). It is included in test:review-report
and therefore the existing CI diagnostic step. Rows/checkpoints retain the
fixed denominator, not_run and the first failure. This does not retrofit the
older generic browser.cjs runner into per-case reporting, classify arbitrary
redirect destinations, or fix browser/OS/TLS transport.

[First results, timings and probe hashes](validation/navigation-diagnostics-2026-10-29.json)
are engineering evidence, not financial accuracy or staff-time savings. Zero
model calls, hidden cases or real financial labels. Historical live7/8/FE-013,
E2 and finalE7 remain open. Exact-release CI/public checks and independent
closure remain separate gates.


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

## FE-028: distinguish startup recovery from data retry (2026-10-26)

At62e533e, the local-review helper called the data button (`#retry`)
`startup_retry_visible`. The actual startup recovery link is `#startup-reload`
inside `#startup`. A runtime data failure and a module-graph failure therefore
reported opposite recovery states. The frozen eight observations (healthy,
runtime503, workbench503, catalog503 at two widths) had2/8 correct startup-link
states. The fixed helper has8/8. This corrects incident evidence, not the
application's retry behavior, financial output or unexplained transport failures.

Local review reports and their diagnostics now have `schema_version:2`.
Version2 removes the misleading field and exposes `startup_panel_visible`,
`startup_reload_visible` and `data_retry_visible` separately. Do not reinterpret
archived version1 `startup_retry_visible` as a startup link: it measured only the
data button's own `hidden` attribute. Historical reports are left unchanged;
the replay judge has an explicit version2 adapter. The PDF fault reporter's
separate schema is unchanged.

Visibility means a present element with layout rectangles, no `hidden` ancestor
and computed visibility other than hidden/collapse. It is a diagnostic layout
observation, not proof of viewport intersection, lack of occlusion, opacity or
clickability. The ledger retry uses the same rule. Twelve additional browser
controls cover visible, missing, self-hidden and ancestor hidden/display/visibility
states at both widths. Detached/closed-page capture remains explicitly unavailable
with the same1.5second limit; no DOM text is returned.

The fixed resource allowlist includes the six omitted current first-party
modules, including source-catalog. Fault recording changes4/6→6/6 in the same
matrix. A unit contract emits failures for every shipped first-party module so
new modules require an explicit safe-name decision. Runtime recording still
accepts only exact allowlisted names within the configured application origin
and directory, strips versioned prefixes/query strings, caps events at16 and
maps unknown network errors to a fixed code. It is a test utility, not arbitrary
path logging or persistent application telemetry.

Run `python3 scripts/build_web.py`, `pnpm test:review-diagnostics`, then
`pnpm test:review-report`. The latter includes the new browser matrix followed
by the existing privacy and intentional-child-failure contracts. New version2
contracts first failed0/8 and0/12 on the old helper; those denominators differ
from the original startup-only2/8 observation. No waits or recovery assertions
were weakened. These are authored development regressions, not hidden cases,
financial quality or quantified staff savings.

## Restoration runner checkpoints (2026-10-27)

At9c975c6, a natural restoration run first failed5/6 with a module connection
reset. A separate one-case diagnostic passed; neither identifies the original
failed navigation nor proves lost saved state. The restoration runner wrote only
at the end, and browser/context startup outside its case catch could lose all
structured results. This is the existing failure-evidence gap, not a new claim
that financial output or restoration metadata is wrong.

`tests/browser-restore.cjs` now uses the existing version2 redacted helper. Its
fixed six scenarios are checkpointed before browser launch, at each phase, after
failure and after cleanup. A failure still exits nonzero; independent cases still
run. `finished=false` with a running row means interruption, never a pass. Launch
failure leaves six not_run rows. Context failure preserves earlier results. The
report omits the base URL and raw exception strings. Success exports/screenshots
still contain only the suite's fixed synthetic fixture; do not run it against
private documents.

Phases distinguish initial navigation/readiness, calculation, saved review,
replay navigation/readiness, explicit retry, edited scope, recovery reload, export
and final verification navigation/readiness. The network observer records the
phase at event delivery (not request start), the last16 safe resource names and
fixed HTTP/network error codes, including api/run. Asynchronous responses can
arrive after goto resolves; both navigation and readiness are valid event phases
for the same document load. No URL, query, headers, body, notes, IDs or raw errors
are captured. Unexpected-failure screenshots use the existing layout-only mask;
unavailable capture remains explicit. Application budgets and assertions are
unchanged, including the30second readiness wait. This is test evidence, not a
production telemetry system or a fix for the unexplained socket failures.

Reproduce after build_web with the normal loopback server running:

```sh
pnpm test:restore
pnpm test:restore-report
```

The second command invokes the actual runner in six fresh subprocesses: launch
failure, third-context failure, module503 during initial/replay/verification
readiness, and SIGKILL during a persisted replay checkpoint. The three HTTP
faults occur on the390px case after two prior cases. Tests require the full plan,
prior-pass retention, exact failing phase, explicit not_run/unfinished states,
nonzero exit, bounded diagnostics and canary exclusion. The healthy restoration
control is a separate six-case denominator. CI uploads both reports on failure.
Disk failure/unwritable output and host loss may prevent a checkpoint; atomic
rename does not guarantee a final report after interruption.

## FE-028: preserve the deployment directory (2026-10-29 Taipei)

Review of43493cc found that Pages failures under /finevidence/ disappeared from
the resource array. The matcher only stripped a root /assets/<64hex>/ prefix,
and callers discarded the directory by passing origin. Error UI and recovery
still worked; this was missing diagnostic evidence, not a financial error.

observe(page, baseUrl, phase) now accepts the trusted application directory.
It checks exact origin and directory boundary before removing that prefix and
an optional versioned asset prefix. Bare origins remain valid for root hosting;
a directory without its final slash is normalized as a directory. Callers pass
BASE_URL (or their owned server URL), never an observed request URL. Unknown,
encoded names, neighboring applications and external origins remain excluded.
The resource allowlist, safe codes, sixteen-event bound and report schema2 stay
unchanged. A basename-only match would not enforce this boundary.

Two added unit contracts cover plain/versioned resources, HTTP/network events,
both directory spellings, thirteen rejected paths/origins, subsequent valid
events, the sixteen-event cap and private query exclusion. The six-test focused
suite first failed4/6 and then passed6/6.

The fixed real-Chrome plan is root/Pages-like directory ×1440/390px ×
503/abort/healthy:12 known development rows. Pages fault capture changes0/4→4/4;
healthy controls4/4 and all source/export flows12/12 remain valid in both arms.
The new full-base-URL contract changes4/12→12/12 overall. That denominator
also includes root URLs with a slash that the old origin-only API did not
accept; it must not be described as eight preexisting deployed failures.
Both complete first runs and per-case timings are preserved in
[validation/diagnostic-prefix-2026-10-29.json](validation/diagnostic-prefix-2026-10-29.json).
Total case time was5.594898s before and5.323683s after; this includes UI, screenshots
and downloads and is not an application latency or productivity benchmark.

Run pnpm test:review-report for the existing diagnostics, new prefix matrix,
privacy and intentional-failure reports. CI runs that command. For a live or
loopback target, set BASE_URL and run node tests/browser-review-prefix.cjs:
the configured deployment has six cases, actual keyboard recovery and actual
30.00% synthetic source-linked exports. Screenshots and checkpoints are kept
under BROWSER_ARTIFACTS/review-prefix. Controlled failures do not identify the
cause of earlier natural navigation/socket failures or process_observation.
No paid/model calls, hidden tasks or new real financial labels. Historical
live-model7/8, FE-013, E2 and finalE7 remain open.
