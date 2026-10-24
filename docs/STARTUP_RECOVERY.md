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
