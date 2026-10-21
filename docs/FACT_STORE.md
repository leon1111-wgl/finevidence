# Synthetic fact snapshots and read-only lookup

Implemented 2026-10-21. This is a local synthetic snapshot backend for the existing three financial workflows. It is not a human review system, SQL agent, public database upload service or production data store.

## Run and compare

First import all four authored sources, then explicitly build the snapshot:

    python -m finevidence import aurora_2023.json aurora_2024.json harbor_2023.json harbor_2024.json
    python -m finevidence build-facts --json
    python -m finevidence calculate gross-margin-change --company "Aurora Orchard" --year 2024 --fact-store sqlite --json
    python -m finevidence calculate gross-margin-change --company "Aurora Orchard" --year 2024 --fact-store manifest --json

Both calculations return 5.00 pp with the same facts, citations and calculation ID. All three operations accept the backend option. The default remains manifest; it is an explicit reference workflow, not a fallback. The response identifies json_manifest or sqlite_snapshot in fact_store.

The build command writes data/facts.sqlite. Its response keeps the API schema_version at "1.0" and separately reports store_schema_version=1, fact_count=8, classification=SYNTHETIC and the original manifest's SHA256. It does not return a financial claim or mark anything reviewed.

## Build and publication

build_fact_store reads one bounded JSON manifest and one imported document snapshot, validates every fact and checks every referenced original. It preserves decimal inputs and unit scales as TEXT, page as INTEGER, and the nullable verifier. Fact identities and company/period/type/metric selectors are unique. No float conversion or SQL arithmetic is used.

A private, same-directory temporary database receives two tables: facts and metadata. Both the transaction and connection must finish before publication. A hard link publishes the completed file only when the target is absent. Concurrent builders cannot overwrite one another: one succeeds and the other returns FACT_STORE_EXISTS. Repeating the command also refuses an existing destination. Normal failures remove staging; an interrupted process can leave an uncommitted facts.*.tmp, which is never used as a snapshot.

This initial version intentionally has no in-place update, replacement flag or migration. To rebuild, first preserve the old snapshot outside the checkout and move it out of the fixed destination; then run the explicit build. Readers do not automatically rebuild when the manifest changes. The snapshot remains an independent artifact whose numeric transcription was trusted at build time. Its metadata fingerprint records origin; it is not a signature.

The publication protocol is a local no-replacement operation, not a power-loss guarantee. It has not been tested on network filesystems or as distributed coordination. Source validation/build is not a transaction across source files, index and database. Filesystem races from external mutation remain outside the local trusted-artifact contract.

## Reader boundaries

open_readonly_store accepts a regular, closed rollback-journal snapshot up to 1 MiB. Missing files are never created. Symlink files, FIFO/directory inputs, unsupported file headers and WAL/journal sidecars are refused. The CLI uses one fixed local destination; it exposes no SQL or database URI argument.

The reader uses an escaped file URI with mode=ro, plus query_only and an authorizer allowing only SELECT and reads of the two expected main tables. It denies writes, ATTACH, temp-table creation, pragma changes and SQL function execution. This is defense for fixed internal queries, not an API for executing arbitrary model SQL. Trusted in-process Python code can change connection callbacks; it is not an isolation boundary against such code.

The connection reads within one transaction, validates application/schema versions, exact supported table definitions, metadata and SQLite integrity. Schema mismatches fail rather than migrate. Every stored fact is reconstructed and validated; at most 32 rows are accepted. Company, periods and metric values are bound parameters. SQL structure and column names come from code; metrics remain an allowlist. The bounded snapshot also configures SQLite length/SQL limits, a VM instruction budget and zero lock wait. These controls are not a measured service latency/SLO or a sandbox for hostile database uploads.

For the selected facts, the shared workflow still checks the imported snapshot, original bytes, hashes, company/year and exact source page/paragraph. The pure Decimal calculations and their policies are unchanged. A stored synthetic_fixture label and null verifier remain mandatory for calculations; SQLite does not establish semantic correctness or human review.

The connection mechanism and binding APIs follow [Python 3.12 sqlite3](https://docs.python.org/3.12/library/sqlite3.html). [SQLite URI mode=ro](https://www.sqlite.org/uri.html) provides the read-only open mode; [query_only](https://www.sqlite.org/pragma.html#pragma_query_only) is an additional restriction, not a replacement for that open mode. We do not use immutable=1 or disable SQLite locks.

## Failure contract

| Condition | Status | Result |
|---|---|---|
| Snapshot absent | FACT_STORE_MISSING | Explicit build required; no manifest fallback |
| Existing build destination | FACT_STORE_EXISTS | Old snapshot preserved |
| File/header/schema/integrity/metadata failure | FACT_STORE_INVALID | No calculation or automatic repair |
| SQLite busy/locked read | FACT_STORE_BUSY | Immediate refusal; retry after the writer closes |
| Invalid stored fact | Existing INVALID_FACT / FACTS_INVALID / FACT_CONFLICT | No calculation |
| Incomplete company/year operands | FACTS_NOT_FOUND | No inference or alternative company/year |
| Selected fake review or source drift | FACT_UNVERIFIED / SOURCE_MISMATCH / existing source errors | No partial success |

Structured runtime failures exit 2 with null answer and empty facts, claims, calculations and citations. Build filesystem failures retain IO_ERROR through the existing CLI. Invalid command syntax remains argparse's stderr usage error. No database path, SQL statement or database error details are echoed by the reader's typed error messages.

## Executed engineering evidence

The initial 20 test methods failed on the absent module/CLI (24 assertions/subtests). After integration, tests exposed an accidentally removed property body and a missing result-helper parameter; those were corrected without weakening assertions.

Three additional regressions reproduced pre-release issues: a connection remained open after a controlled INSERT failure; a LIKE underscore wildcard hid a non-internal sqlitexextra table from schema checks; and the build result overwrote the API schema version with the database version. Explicit connection closing, literal-prefix GLOB filtering and separate version fields fix these cases. These are pre-release implementation defects, not incidents in the prior commit.

Final targeted suite: 23 passed in 2.298s. Full suite: 150 passed in 18.563s on macOS/Python 3.12.2. The prior 127 test methods are unchanged. Tests include six literal result/parity pairs, source drift, missing/corrupt schemas, malformed stored values, exact parameter selection, read-only execution, failed publication/connection cleanup, actual competing builders and lock refusal/recovery. Sixteen actual startup/query/build/calculation commands also passed, including all six backend comparisons and text output. These are synthetic engineering results, not real financial accuracy or model evaluation. Verify exact-commit CI separately.

Remaining work: real-report rights/ingestion and actual fact review, model/Agent boundaries, authorization, persistent traces, API/UI and E7 browser acceptance. Existing JSON and source limits are unchanged.
