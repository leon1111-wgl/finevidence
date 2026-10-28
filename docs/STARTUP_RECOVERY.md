# Recoverable workbench startup

FE-023, observed on ec0e6a2, 2026-10-24. This change recovers the application
startup boundary; it does not diagnose the underlying network connection failure.

## Failure and user action

A failed static dependency previously prevented `app.mjs` from executing at all.
The page stayed at “正在校验资料”, with a disabled run button and hidden retry.
The existing data-fetch timeout inside `initialize()` could not handle this case.

`index.html` now provides a native “重新加载工作台” link before an initially inert
workbench. It remains usable even when the bootstrap file is missing or JavaScript
is disabled. Disabled JavaScript still needs to be enabled by the user; a reload
link does not substitute for a JavaScript runtime.

`bootstrap.mjs` has no static imports. It dynamically loads the business entry,
reports `STARTUP_LOAD_FAILED` on rejection and `STARTUP_TIMEOUT` after an eight-second
application wait. It never retries automatically. The user checks connectivity and
activates the native link to navigate to a fresh document, avoiding reuse of the
failed document's module graph. A persistent missing resource still requires a
fixed deployment; reloading cannot repair missing server files.

Saved review records are not deleted. On successful startup, the existing
source-fingerprint check and deterministic recalculation restore compatible notes
and checked citation IDs. Unsaved PDF draft lists remain transient and must be
prepared again after document navigation. Export important work before reloading.

## Lifecycle and trust boundary

1. HTML renders a recovery link and keeps the workbench inert.
2. The dependency-free bootstrap starts its clock and imports `app.mjs`.
3. Only a still-pending, in-deadline success calls `startWorkbench()`.
4. `startWorkbench()` binds the existing UI once and starts data validation. The
   bootstrap releases the inert boundary; data loading keeps calculation controls
   disabled until the existing validation completes.
5. Failed imports leave the workbench inert and expose an alert with the native
   link. A successful but late import also leaves this state unchanged.

Business module evaluation now only defines functions/state. It neither binds the
UI nor starts network work. Native `import()` cannot be canceled; rejecting its
late success is an application lifecycle guard, not network cancellation. The
elapsed-time check also rejects late success if browser timer scheduling delays the
timeout callback. Eight seconds is not a hard real-time guarantee in a suspended
or blocked browser. The bootstrap file itself has no independent running watchdog;
HTML supplies the recovery fallback in that case.

The Python server serves the bootstrap only through its fixed asset allowlist.
CSP remains same-origin; no inline handlers, eval, credentials, uploads, model
requests or dependencies are added. Data-fetch errors retain the separate existing
“重新加载资料” action, which does not navigate the document.

## Reproducible acceptance

```sh
python3 scripts/build_web.py
python3 -m http.server 8776 --bind 127.0.0.1 --directory web
# In another terminal, with the existing Playwright environment:
BASE_URL=http://127.0.0.1:8776/ node tests/browser-startup.cjs
# Repeat against python3 -m finevidence.server at port 8765.
```

The fixed plan has eight scenarios × two viewports (1440 and 390 pixels): healthy
startup, dependency request abort, entry HTTP 404, invalid entry syntax, delayed
dependency resolved after the actual deadline, missing bootstrap, disabled
JavaScript, and bundle-fetch failure with its existing retry. All scenarios run
in new browser contexts. Failed startup is followed by keyboard reload; saved
notes, selected/checked evidence, the actual downloaded review and the 30.00%
synthetic calculation must remain consistent. The late-dependency case waits for
actual module evaluation before checking that nothing started. Repeated start
calls cannot restore twice. Model requests are blocked and counted by the test.

Before the fix, this same 16-scenario contract passed 4/16 (healthy and bundle-only
controls) and failed 12/16. The additional server test returned 404 for the missing
bootstrap. Initial post-fix local static and Python browser runs pass 16/16 each;
subsequent verification strengthens late-evaluation/navigation synchronization
without changing scenarios, deadlines or outcome assertions. First failures remain
in local release evidence. These are synthetic fault recovery checks, not model
accuracy, independent financial labels, saved staff time, or competitor benchmarks.
The original independent review's 4/8 snapshot remains historical; the recovery
control now lives above the inert workbench rather than at the old data-retry button.

`pnpm test:browser` includes this suite for static and Python surfaces in CI. Local,
exact-commit remote CI and deployed-byte/browser checks are distinct release gates.
The original live-model 7/8 and FE-013 remain unchanged; this iteration makes zero
paid calls and does not close real-source rights, semantic review or final E7.

Full local verification also retained a separate first static currency-suite
startup timeout: 0/60 business cases attempted, process exit1, while the Python
currency suite passed60/60. One unchanged static rerun with additional startup
observation passed60/60; it did not reproduce the timeout, so its cause remains
unknown. No timeout, case assertion or application code was changed to obtain
that rerun. Do not report the original full local invocation as all green or
claim this startup recovery change fixes every transport failure.


## Cross-release HTTP cache compatibility (FE-023 follow-up)

The independent review reproduced two incompatible startup conventions at the
same URL: ec0e6a2 HTML executed app.mjs directly, while 0428af8 HTML expected an
exported start function. A fresh document could reuse an older cached app. This
was a controlled Chrome cache reproduction, not a measured public outage rate.

The build now renders index.html from index.template.html and puts the complete
module graph, CSS, PDF library/Worker, demo, bundle and its manifest in
assets/<digest>/. The digest covers the commit, template and all asset bytes,
including dirty child changes; relative module/Worker URLs stay in that graph.
The business entry is workbench.mjs. Its manifest and bundle resolve relative to
its own module URL, while runtime.json and api/run still resolve at the document
root so Python session credentials are never copied into static assets.

app.mjs remains a dependency-free compatibility entry for cached legacy HTML.
It validates the current manifest's digest and loads only that same-origin graph.
For direct-entry legacy pages it supplies a bounded inert loading state and
explicit keyboard recovery; for the previous bootstrap it exports the guarded,
idempotent business start. The stable bootstrap URL also resolves the graph when
requested by old HTML. Late imports do not start legacy or modern workbenches.
There is no automatic navigation, provider retry, cache clearing or model call.

Recovery uses a fresh document query on explicit activation. The static link
includes the build identity and works even when bootstrap is unavailable; a
running bootstrap refreshes that link's query. This does not repair an unavailable
server or revoke already-cached historical bytes. Two historical artifacts that
remain entirely cached cannot be retroactively changed. Old version directories
are not retained in a new deployment; an uncached removed child fails visibly
and requires explicit document reload. Do not rebuild a directory while serving
it; build before starting the local server or deploy the complete Pages artifact.

Reproduce: python3 scripts/build_web.py, then node tests/browser-cache.cjs.
This suite needs git history for ec0e6a2 and 0428af8 (CI fetch-depth: 0). It uses a
local max-age=600 HTTP server and the real browser cache, without Playwright
routing, with fixed 18 authored cases at 1440/390px. Cases cover both old entries,
cached-app upgrades, fresh bootstrap on old HTML, absent/invalid manifests,
actual eight-second late completion, and missing-version keyboard reload.
It checks saved notes/citation checks/actual export, 30.00% and the real lazy PDF
library/Worker. It does not contact a provider. The server is intentionally local
and synthetic: the same suite is not evidence of natural public failure frequency.

The earlier unchanged two-width cache probe was reproduced at 0428af8: controls
2/2, upgrades 0/2, cached app requests 1→1. The corresponding cached-ec0e6a2
upgrade cases now pass 2/2. The new full fixed plan passes18/18 locally. These are
cache/recovery task denominators, not financial quality, hidden tasks, user time
saved or a competitor comparison. Preserve the original historical live7/8.

First startup regression after this change was static15/16, with one initial
readiness timeout; Python16/16. That run overlapped other local build/test work,
so it is not evidence for a specific transport cause. Its logs/screenshots are
retained. Final validation runs only after the build finishes; no deadlines or
outcome assertions were loosened. FE-023 remains pending independent closure.


Visual review of the legacy failure state found the lower status still said
loading. Adding a non-contradiction assertion retained the same18 scenarios but
exposed6 failures (12/18); the compatibility failure handler now resets the
runtime and data status as well. First results and screenshots remain retained.
The first full static currency run completed22/60 with38 not_run after a later
context's initialization timed out; real-source static handoff was3/4, with its
failed case timing out before file selection. These are separate from the earlier
startup15/16 and are not described as financial numeric failures.


Final affected checks after the status correction: cache18/18; startup16/16 on
static and Python; Python base14/14. Full Python browser command set and real
pending handoff4/4 pass. One diagnostic pass of unchanged static currency cases
with extra startup observations passed60/60; static real pending handoff4/4.
No failure recurred in those diagnostic passes, so the earlier transport cause
remains unknown. Final local Python189/189 (21.269s), JS201/201. The initial
full36-command run had34 successful commands and2 failures; do not call that
original invocation all green. All failed evidence remains in local materials.

For an already-open historical page whose main modules remain cached but lazy
PDF assets have been removed, a document reload may also be needed; reselecting
the same PDF cannot recreate removed deployment files. There is no offline or
unlimited old-version availability guarantee.

## Anchored startup failure visibility (2026-10-28)

An existing P3 review suggestion reproduced with `#source-heading`: the document
scrolls to the original-text area while the failed startup explanation and reload
link remain above the viewport. The native reload action already worked when
located. `bootstrap.fail()` now makes its explanation programmatically focusable,
focuses it once, then brings the startup panel into view without animation. One
forward Tab reaches the same native reload link. Successful startup does not move
focus or scroll; the pending guard still prevents late modules from starting or
repeating this transition. No new navigation handler, automatic retry or storage
write is introduced.

The frozen six-case plan is healthy/entry503/dependency8s-timeout at1440/390px.
Known-path acceptance changes2/6 to6/6: failure explanation/link in view0/4→4/4,
healthy anchor/focus controls2/2 unchanged. The candidate's four explicit keyboard
recoveries preserve saved notes/checkmarks and actual JSON downloads. Baseline
failed visibility assertions before attempting recovery, so it does not establish
that the older link could not recover. All six successful candidate flows export
30.00% and the original synthetic source. Four separate immediate503 controls at
source/PDF anchors pass4/4; these are additional engineering controls, not extra
independent reports. See [first results and source/plan hashes](validation/startup-focus-2026-10-28.json).

The first harness attempt changed only the fragment and never reloaded the
document; its2/6/timeouts remain recorded as a test error. A distinct query now
forces document navigation; the valid baseline/candidate use exactly the same
judge, waits and six cases. Each ran once. This is authored synthetic development
evidence, not a hidden set or measured analyst-time saving. Timings include
intentional8s faults, setup and recovery. No paid/model call or human financial label.
Historical live7/8/FE-013, real-sourceE2, natural transport errors and finalE7 remain
open. Without bootstrap execution (missing script/disabledJS), the static fallback
still works but cannot perform this programmatic focus/scroll action. Screen-reader
speech was not measured; browser DOM focus, viewport and real Tab/Enter were checked.

Reproduce after `python3 scripts/build_web.py` with `pnpm test:startup-focus`.
Set BASE_URL to a static or Python workbench and BROWSER_ARTIFACTS to a new output
directory. Results checkpoint all six rows and retain first failures; do not rerun
to select a passing score. The plan is also part of test:browser on both CI surfaces.

Local verification retained an unrelated first Python run:273 methods, one error
in test_actual_cleanup_terminates_the_owned_worker, where process_identity
rejected an incomplete command-argument observation. No Python production/test
code was changed. A fixed12-child diagnostic observed valid immediate and
post-readiness identities12/12 each, so it did not reproduce or establish the
original cause. The first failure is not overwritten or claimed fixed; a separate
complete verification and exact-release CI are required before publication.

The separately recorded second full local Python run passed273/273 in73.832s;
the first273-method/one-error result above remains unresolved. JS246/246, existing
startup16/16, base14/14, retry7/7, restoration6/6, export-keyboard2/2 and cache18/18
passed. These are engineering regressions, separate from the six-case improvement
and the fixed financial eight-task baseline. Exact-release CI follows publication.
