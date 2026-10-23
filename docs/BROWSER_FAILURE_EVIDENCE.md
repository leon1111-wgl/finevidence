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
