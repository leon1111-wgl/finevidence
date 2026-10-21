# Review drafts survive a failed replay

FE-015, observed on `6d8efe3`: after a saved review reloads, a failed local
HTTP replay leaves its original draft in browser storage. Clicking Retry then
recomputed the correct amount but cleared the notes and checked citations,
overwriting that draft and the exported review. A normal reload worked.

## Cause and correction

`initialize` passes the validated draft as `execute(request, { restore: draft })`.
The failure callback previously retained only `request`. It now also retains
`restore`, so each explicit retry can restore the same notes, selected source
and checked IDs after a successful deterministic replay. The existing filter
still intersects checked IDs with the current result. A changed corpus is still
rejected by `readDraft`; saved amounts are never trusted as calculation output.

Failed requests do not save an empty review. Changing company, year, task or
query still invokes `clearResult`, revoking the old retry and clearing the
visible review. A new submission cannot inherit the pending restoration. No
automatic retry or model call is added. This is browser-local recovery, not a
persistent server audit, authenticated approval or general Agent checkpoint.

## Executed regression and limits

Six fixed browser scenarios first passed 3/6 on the old implementation and then
6/6 with the correction. The three previously passing controls were ordinary
reload, editing scope after a failed restore, and reloading after the fault.
The failed cases were one retry, repeated failed retries, and filtering an
extra stale citation while retaining the valid review. The original independent
three-case review script changed from 2/3 to 3/3 without edits to its assertions.
These are engineering cases, not a hidden evaluation or measured user benefit.

The test uses real DOM events, localStorage, JSON downloads and the actual
Python HTTP/financial workflow. A browser route abort injects only network
failure; successful responses come from the real loopback server. It checks
notes, both checked IDs, selected source, exact 20.00%, exported review, later
reload, unchanged storage during failures, scope invalidation and no model
requests. The repeated-failure case runs at 390px and retries with Enter.

```sh
# Terminal 1 (Python 3.12, macOS/Linux)
python3 -m finevidence.server

# Terminal 2 (after the existing browser test dependency setup)
pnpm test:browser
pnpm test:restore
```

`test:restore` requires the Python workbench; it fails on a static page rather
than silently skipping fault coverage. `BASE_URL`, `BROWSER_ARTIFACTS` and
`CHROME_PATH` work as in the existing browser checks. CI runs it in the Python
workbench job. Static and public Pages keep their separate 14 workflow and
7 retry checks, including ordinary draft replay; do not describe a browser-only
calculation as a successful Python/network-failure test.

No live model evaluation was rerun. FE-013 and the original 7/8 synthetic
development-task result remain unchanged. Exact-commit CI and public asset
verification are separate release gates.
