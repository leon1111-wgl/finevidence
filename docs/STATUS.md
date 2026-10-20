# Capability status

Updated 2026-10-20. This is an enterprise-oriented portfolio in progress, not a production deployment.

## Implemented and locally verified

- Offline synthetic ingestion and BM25 retrieval; two documents / four synthetic pages / eight chunks; exact company/year filters and source-linked JSON.
- Four typed synthetic financial facts and a complete CLI/shared-workflow path for calendar-year gross margin. Input facts, normalized values, formula, rounding policy, calculation ID and source citations remain visible.
- Source rechecks for the calculation path: original bytes, imported snapshot, recorded hash, company/year and exact paragraph. Synthetic fixture status is distinct from human verification.
- Decimal arithmetic with explicit scale normalization, matching period/currency/basis/scope, zero/negative-revenue refusal and negative-profit support. Separate typed errors for incomplete facts, invalid manifests and source drift.
- 70 engineering tests passed on macOS 14.6.1 arm64 / Python 3.12.2: `python -m unittest discover -s tests -v`. Original 65 retained; five financial-text tests added. The original finance failures remain documented in FINANCIAL_CALCULATIONS.
- FE-009/010/011 input fixes: descriptor-checked, bounded index reads; matching 1 MiB read/write capacity; Unicode scalar validation; explicit source-path resolution errors. FIFO, malformed Unicode and source link cycles now return typed failures. Failed batches preserve the old index and remove temporary output. See INPUT_BOUNDARIES for actual red/green evidence and limits.
- FE-010 follow-up: the independent review of bebb865 found that fact basis/scope text could still crash calculation-ID encoding. FinancialFact now validates every supplied text field, including optional verifier identity, before selection/calculation/serialization. Invalid text returns INVALID_FACT; source filenames retain INVALID_PATH. Valid Unicode, verifier bounds and refusal of fabricated human verification remain covered. Targeted 29 tests passed in 3.045s; full 70 passed in 8.803s.
- Actual local smoke: Aurora Orchard 2024 = 30.00%; Harbor Lantern 2024 = 25.00%; Aurora 2023 = FACTS_NOT_FOUND, exit 2. All are fictional test inputs.

## Continuous verification

[GitHub Actions](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml) runs tests and import/query/calculation smoke on Linux and macOS, Python 3.12. Inspect the run for the exact commit before claiming remote success. Windows, other Python versions and Docker have not been validated.

## Not yet implemented / validated

Human-verified financial facts, read-only SQLite lookup, year-over-year and percentage-point calculations, real PDF ingestion, a live model adapter or bounded Agent, authentication/document authorization, API/UI, persistent traces, concurrent writes/recovery, embeddings, real-data evaluation, containers and load/operational validation. E7 visual refinement remains scheduled after the complete business workflow.

The fixture manifest is trusted for numeric transcription. Structural source checks are not semantic verification or protection from coordinated edits of all trusted artifacts. Ordinary retrieval retains the snapshot trust boundary. No real-data accuracy or business-impact claims are available.

## Next work

Next address FE-004 retrieval source/snapshot consistency. FE-005 concurrent lost updates remain open; serialize the complete read-modify-write operation before claiming multiwriter support. Then continue E1 with comparable-period revenue change and percentage-point change, explicitly handling negative prior values and period alignment; add parameterized read-only fact storage when consumed by the workflow. Keep FE-001 open until the broader fact/finance path is complete. Public-report source permission and real-model service authorization remain separate prerequisites.
