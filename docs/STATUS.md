# Capability status

Updated 2026-10-21. This is an enterprise-oriented portfolio in progress, not a production deployment.

## Implemented and locally verified

- Offline synthetic ingestion and BM25 retrieval; four documents / eight synthetic pages / sixteen chunks when all years are imported; exact company/year filters and source-linked JSON.
- Eight typed synthetic financial facts and complete CLI/shared-workflow paths for calendar-year gross margin, adjacent-year revenue growth and margin percentage-point change. Input facts, normalized values, formula, rounding policy, calculation ID and source citations remain visible.
- Source rechecks for calculation and retrieval: original bytes, imported snapshot, recorded hash, company/year and exact paragraph. Synthetic fixture status is distinct from human verification.
- Decimal arithmetic with explicit scale normalization, matching period/currency/basis/scope, zero/negative-revenue refusal and negative-profit support. Separate typed errors for incomplete facts, invalid manifests and source drift.
- 150 engineering tests passed in 18.563s on macOS / Python 3.12.2: `python -m unittest discover -s tests -v`. Twenty-three SQLite tests added; the prior 127 methods and assertions remain unchanged. Historical finance fixture adjustments remain documented in FINANCIAL_CALCULATIONS.
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

[GitHub Actions](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml) runs tests and import/query/calculation smoke on Linux and macOS, Python 3.12. Inspect the run for the exact commit before claiming remote success. Windows imports are explicitly unsupported until a locking backend is implemented; the missing-backend fail-closed branch is tested locally, not on a Windows runner. Other Python versions and Docker have not been validated.

## Not yet implemented / validated

Human-verified financial facts, real PDF ingestion, a live model adapter or bounded Agent, authentication/document authorization, API/UI, persistent traces, distributed writes and full workflow recovery, embeddings, real-data evaluation, containers and load/operational validation. E7 visual refinement remains scheduled after the complete business workflow.

The fixture manifest is trusted for numeric transcription. Structural source checks are not semantic verification or protection from coordinated edits of all trusted artifacts. Retrieval checks indexed originals, but cannot detect an entirely removed index entry or coordinated edits of every trusted artifact. No real-data accuracy or business-impact claims are available.

## Next work

FE-004 and FE-005 reproduced cases are fixed within their documented local boundaries. Local cooperative imports now contend explicitly; this is not full workflow checkpointing or distributed storage. The synthetic E1 arithmetic and parameterized read-only storage now work end to end. Next develop real-source ingestion and an actual fact review boundary; do not relabel fixtures as reviewed. Keep FE-001 open until the broader fact/finance path is complete. Public-report source permission and real-model service authorization remain separate prerequisites.
