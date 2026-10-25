# Bounded review-store path validation

2026-10-26 Taipei; FE-027/P3. A configured local ledger whose reviews.sqlite was
an owner-private FIFO hung inside SQLite opening. A directory raised an unhandled
IsADirectoryError; a Unix socket raised OSError. SQLite busy timeout applies to
lock contention, so it did not bound these filesystem operations.

## Change and scope

ReviewLedger now opens with O_NONBLOCK in addition to O_NOFOLLOW and existing
creation/read-write flags, then checks S_ISREG on the opened descriptor before
SQLite sees the path. An open failure or nonregular descriptor raises the stable
REVIEW_STORE_PATH error. CLI startup exits2, emits preservation guidance, and
never automatically unlinks/replaces the path. Existing owner/mode/symlink rules,
read-only schema validation, transactions and explicit copy recovery are unchanged.

The private directory and local machine owner remain trust boundaries. This is
not a defense against a hostile same-user process replacing the path after the
check, filesystem device stalls, every sidecar-file type or all possible OS I/O
failures. No public exploit, data loss or total startup-time guarantee is claimed.

## Frozen regression and first failures

Before the production change, three new regression methods failed. The six-case
subprocess plan was frozen before repair, with a3second deadline per invocation.
Baseline c7f498e:3/6, expected refusals0/3, regular controls3/3. FIFO hit the
3.004020second timeout; directory/socket returned IsADirectoryError/OSError.
All original path identities/types were retained. The CLI returned1 with a
traceback rather than the required2 and typed refusal.

After repair the unchanged plan is6/6: refusals3/3 and controls3/3. Refusal
elapsed times were0.042773,0.046304,0.044446seconds, including interpreter startup.
Each is a single local observation, not a latency benchmark or SLO. Controls cover
absent/new, existing empty and reopened v1 regular files. Reopened bytes are
unchanged; the broader schema suite separately exercises records/revocation/replay.

Raw [baseline](validation/review-path-red-2026-10-26.json) and
[fixed](validation/review-path-green-2026-10-26.json) reports retain all outcomes.
Their code_sha is the parent commit; working_tree_dirty marks added probes and,
for the fixed report, the pending production changes. This is a known-defect
synthetic development matrix, not a hidden set, real financial quality metric,
user study or model comparison. Model calls/tokens/unknown-use calls are all0;
real semantic labels and hidden cases are0. Historical live model7/8 and FE-013
remain open. No paid model rerun.

```sh
python3 -m unittest discover -s tests -p test_review_store_path.py -v
python3 scripts/evaluate_review_path.py --output review-path-result.json
python3 scripts/evaluate_review_store.py --output review-store-result.json
python3 scripts/evaluate_review_recovery.py --output review-recovery-result.json
```

Local full Python235/235 and JavaScript213/213 passed. Separate store-schema
cases5/5, actual interrupted-transaction recovery2/2, Chrome ledger14/14,
correction18/18 and recovered-history4/4 passed. These are engineering
regressions, not additional financial task successes.

CI is configured to run the bounded path matrix on Linux and macOS. A mock assertion also verifies
that an actual FIFO never reaches sqlite3.connect; real subprocess cases avoid
letting a regression hang the test process. CLI coverage checks no traceback,
private directory or test secret appears in the refusal diagnostic. Exact remote
CI and deployed-asset verification belong to the release record, not this plan.

Implementation and probes were Codex-assisted; no user-authored change or human
financial verification is inferred. Interview question: why are SQLite lock
timeouts insufficient, and why check the descriptor instead of only Path.is_file?

Local default Python base14/14, retry7/7 and startup16/16 passed. The restore
suite retained a first5/6: retry-filters-stale-citation timed out at a30second
ready wait after exporting a correct result. One same-case, unchanged-deadline
diagnostic with network instrumentation passed1/1. The failure screenshot shows
STARTUP_LOAD_FAILED; root cause remains unknown. This default server has the
ledger disabled, and earlier releases also retained startup failures. The new
path guard is not claimed to fix them; the diagnostic does not replace5/6.
Two official historical PDFs through local prepare/receive/source/ledger-export
flow passed4/4 (2files×2widths), with missing semantics still null/pending and
no human approval or real-quality labels.
