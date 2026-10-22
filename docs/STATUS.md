# Capability status

Updated 2026-10-22. This is an enterprise-oriented portfolio in progress, not a production deployment.

## Implemented and locally verified

- Offline synthetic ingestion and BM25 retrieval; four documents / eight synthetic pages / sixteen chunks when all years are imported; exact company/year filters and source-linked JSON.
- Eight typed synthetic financial facts and complete CLI/shared-workflow paths for calendar-year gross margin, adjacent-year revenue growth and margin percentage-point change. Input facts, normalized values, formula, rounding policy, calculation ID and source citations remain visible.
- Source rechecks for calculation and retrieval: original bytes, imported snapshot, recorded hash, company/year and exact paragraph. Synthetic fixture status is distinct from human verification.
- Decimal arithmetic with explicit scale normalization, matching period/currency/basis/scope, zero/negative-revenue refusal and negative-profit support. Separate typed errors for incomplete facts, invalid manifests and source drift.
- Historical baseline: 155 engineering tests passed in 19.239s on macOS / Python 3.12.2: `python -m unittest discover -s tests -v`. Five build-response regression methods added; the prior 150 tests remain unchanged. Historical finance fixture adjustments remain documented in FINANCIAL_CALCULATIONS.
- FE-009/010/011 input fixes: descriptor-checked, bounded index reads; matching 1 MiB read/write capacity; Unicode scalar validation; explicit source-path resolution errors. FIFO, malformed Unicode and source link cycles now return typed failures. Failed batches preserve the old index and remove temporary output. See INPUT_BOUNDARIES for actual red/green evidence and limits.
- FE-010 follow-up: the independent review of bebb865 found that fact basis/scope text could still crash calculation-ID encoding. FinancialFact now validates every supplied text field, including optional verifier identity, before selection/calculation/serialization. Invalid text returns INVALID_FACT; source filenames retain INVALID_PATH. Valid Unicode, verifier bounds and refusal of fabricated human verification remain covered. Targeted 29 tests passed in 3.045s; full 70 passed in 8.803s.
- FE-004: retrieval validates complete source/snapshot equality before company/year filtering, preserving legitimate NO_MATCH results and rejecting drift without citations. The prior 32-case review script was rerun: altered company/year/page/text/hash and unavailable sources now fail explicitly, including old metadata filters; existing Unicode controls remain valid.
- Annual growth requires positive prior revenue, nonnegative current revenue and adjacent complete calendar years with matching company/currency/basis/scope. Both sources and the absolute currency change are returned. Literal fixture expectations: Aurora +20.00%, Harbor -20.00%. All inputs are fictional.

- FE-005 cooperating-writer lost update is fixed: a stable POSIX sidecar lock covers read/validate/merge/replace. Contention returns INDEX_BUSY immediately; retry retains prior writes or skips duplicates. Real processes are tested at read, pre-replace and post-replace boundaries, including kill/retry, failed writes and malformed lock objects. See IMPORT_CONCURRENCY for platform and durability limits.
- FE-010 query-argument follow-up: shared retrieval validates question/company text before index access; direct search validates query text independently. Invalid text returns INVALID_QUERY/INVALID_COMPANY without echoing it. The previous ten failing review scenarios now return exit 2 and parseable UTF-8 JSON; valid non-BMP text and exact matching remain unchanged. This does not add translation or change source checks.

- Margin change requires four source-checked facts and returns current/prior margins plus an explicitly labelled percentage-point difference. Aurora gives 5.00 pp, Harbor -5.00 pp. Exact bounded cross-products avoid early rounding and cancellation; 100-digit Decimal division and half-even display are explicit. The 15 new tests first failed on missing functionality (59 assertions/subtests), then passed in 1.493s. A separate 1,014-case Fraction/integer-rounding comparison matched all selected synthetic inputs; this is not real-data evaluation.

## Read-only snapshot increment

An explicit build-facts command validates all synthetic facts and original sources, then publishes a complete new data/facts.sqlite without overwriting an existing snapshot. All three workflows accept --fact-store sqlite; the default manifest path remains a reference. SQLite uses mode=ro, query_only, restricted internal SELECTs and bound values. Stored values remain strings for Decimal; selected sources are rechecked on every calculation. No fallback, migration, implicit rebuild or fabricated review is added.

Twenty-three tests cover real CLI parity, no-result errors, read-only connections, schema/file limits, failed build cleanup, competing builders and lock refusal. Targeted 23 pass (2.298s), full 150 pass (18.563s); sixteen manual business commands and six backend comparisons pass. See [FACT_STORE](FACT_STORE.md) for actual development failures and trust limits. Exact-commit CI and fresh-clone evidence are checked after publication, not assumed here.

## Continuous verification

FE-012 is fixed locally: failed build-facts responses now retain the build mode and backend identity, including input and filesystem errors. The original mode assertion changes from failure to success; existing targets remain unchanged, and financial calculations retain synthetic_calculation. The five added methods first reproduced six failed assertions/subtests, then passed in 0.885s. See FACT_STORE for the corrected test-fixture mistake and precise scope. Verify the release commit and CI before treating local results as remote evidence.

[GitHub Actions](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml) runs tests and import/query/calculation smoke on Linux and macOS, Python 3.12. Inspect the run for the exact commit before claiming remote success. Windows imports are explicitly unsupported until a locking backend is implemented; the missing-backend fail-closed branch is tested locally, not on a Windows runner. Other Python versions and Docker have not been validated.

## Not yet implemented / validated

Human-verified financial facts, real PDF ingestion, authentication/document authorization, persistent server audit and checkpoint recovery, distributed writes, embeddings, real-data evaluation, containers and load/operational validation. The released sample UI has actual browser checks; this does not close the final E7 gate for future real-report and authorization flows.

The fixture manifest is trusted for numeric transcription. Structural source checks are not semantic verification or protection from coordinated edits of all trusted artifacts. Retrieval checks indexed originals, but cannot detect an entirely removed index entry or coordinated edits of every trusted artifact. No real-data accuracy or business-impact claims are available.

## Next work

FE-004 and FE-005 reproduced cases are fixed within their documented local boundaries. Local cooperative imports now contend explicitly; this is not full workflow checkpointing or distributed storage. The synthetic E1 arithmetic and parameterized read-only storage now work end to end. Next develop real-source ingestion and an actual fact review boundary; do not relabel fixtures as reviewed. Keep FE-001 open until the broader fact/finance path is complete. Public-report source permission and real-model service authorization remain separate prerequisites.

## 2026-10-21 workbench and live model increment

The same reviewer UI now runs as a public static sample application and a loopback Python application. It supports task/scope selection, source viewing, fixed-formula calculations, browser review notes, deterministic draft replay and JSON export. Static BM25/BigInt results match 24 generated Python workflow oracles. Public Pages never contains model credentials.

The local model loop uses the user-authorized MornAI endpoint and strict tool schemas. Actual browser requests completed Aurora revenue growth (20.00%, 2 calls, 1029 tokens, 4.407s) and Harbor margin change (-5.00 pp, 2 calls, 1051 tokens, 3.181s). A prior live request exposed a later search overwriting a calculation; a regression now preserves the calculation and all tool results. These are synthetic-data integration checks, not an accuracy benchmark. See WORKBENCH_RUNBOOK and validation evidence.

Local desktop/narrow screenshots and keyboard, loading, empty, error, retry, scope invalidation, source checks, export and replay were executed in real Chrome. Both static and Python modes passed 14 browser workflow checks. CI independently reruns Python, JS and Chromium before Pages deployment; inspect the exact published SHA and run before claiming remote verification.

Remaining scope: real-report rights/ingestion/review, explicit nonfinancial claim support, model holdout evaluation, organization permissions, persistent audit, true workflow recovery and hardened public backend deployment. Model timeout is socket timeout plus cumulative checkpoints, not remote cancellation or a spend guarantee.

## Quantified development-task result

176 local Python tests passed (21.380s), separate from business-task metrics. The first frozen eight-task live run completed 7/8, with 6/6 numeric and citation checks, 1/2 expected refusals, 15 requests and 7,471 reported tokens. A missing-prior-year request was blocked by the tool validator but failed the intended business refusal contract. Deterministic structured input completed 8/8. See [EVALUATION](EVALUATION.md) for denominators, exact evidence, unequal input modes, latency and limitations. No best-of-N result is reported.

The workbench release at 83ccc21 passed exact-commit GitHub CI and deployed-byte/browser verification. See [RELEASE_VALIDATION](RELEASE_VALIDATION.md); this is release evidence, separate from the 7/8 model-task result.

## 2026-10-22 decision-diagnostic increment

Safe fixed failure categories and model-call ordinals now survive one format repair, later transport failure and the local HTTP boundary. Twelve offline failure inputs have categorized output (0/12 on the previous version, 12/12 now), with no rejected content echoed. A 349-combination protocol comparison preserves acceptance and outer status codes. Full local suite: 181 tests, 20.523s. No paid model request was made. FE-013 remains open and the first live task result remains 7/8; this is observability improvement, not a measured quality increase. See [AGENT_DIAGNOSTICS](AGENT_DIAGNOSTICS.md).

## 2026-10-22 retry-state correction

FE-014 input edits now revoke the previous failure retry and hide its button. Seven browser state-transition checks first reproduced five failures, then passed locally; unchanged-request retries remain available. CI runs these checks in addition to the original fourteen workflow checks for static and Python modes. This is a UI reliability correction with no paid calls, model-policy change or new real-data claim. See [RETRY_STATE](RETRY_STATE.md); final release verification is separate from local results.

## 2026-10-22 draft-replay correction

Independent review verified FE-014's observed scope and found FE-015: a failed
draft replay followed by Retry dropped the restoration context and overwrote
notes/checked citations despite a correct calculation. Retry now carries that
context; input edits still revoke it. Six real-browser/local-Python scenarios
changed from 3/6 to 6/6, and the unchanged independent review script from 2/3 to
3/3. CI includes the six-case suite in the Python workbench job. Network faults
are injected offline; no model call, data change or real-data accuracy claim is
included. See [DRAFT_RECOVERY](DRAFT_RECOVERY.md). Independent closure and exact
release verification must be recorded separately; FE-013 remains open.

## 2026-10-22 evidence handoff increment

Public and local workbenches now expose a separate deterministic replay package, local file verification and downloadable field differences. The existing raw execution export is preserved. Verification recomputes from the current trusted synthetic corpus; imported facts cannot become trusted input. Authorship, approvals, real financial truth and model traces are explicitly unverified. See HANDOFF_RESEARCH for two-round official-source comparison and HANDOFF_REPLAY for the executable contract.

Local checks: 182 Python tests (23.104s), 30 JS tests including 24 Python parity oracles; 18/18 authored synthetic corruptions detected versus 0/18 by JSON parsing alone, and 10/10 valid controls accepted. This is not a competitor, hidden-set or real-data benchmark. FE-016 now returns structured 403 for non-ASCII CSRF headers (original audit 9/11 to 11/11), pending independent closure. FE-013 remains open; no paid inference, first live model result still 7/8. Verify exact remote CI/deployed commit separately.


## 2026-10-22 handoff file identity

The receiver now keeps the last attempted filename, a short digest and keyboard-expandable full SHA-256 next to its verdict. Reports carry the same untrusted filename and actual-byte digest. New/failed reads clear old identity results; canceled selection keeps the previous check. Export feedback no longer replaces the imported file verdict. This resolves the FE-017 usability suggestion locally; independent release review is pending. It adds no upload, draft persistence, authorship guarantee or model call.

Twenty real-browser checks per mode pass on static and Python surfaces, including six file-identification sequence/viewport combinations (0/6 to 6/6 against 9c469be). Python 182, JS 30 and fixed synthetic tasks 8/8 pass. Read HANDOFF_REPLAY for the initial fixture failure and exact denominators. FE-016 was independently closed on 9c469be (original HTTP 11/11 plus four business-entry checks). FE-013 remains open with historical live 7/8. Real-source rights/ingestion/human verification and organization permissions remain next major capability gaps, not completed by this UI improvement.
