# Capability status

Updated 2026-10-19. The original exercise-gated M0/M1 schedule has been replaced by continuous, evidence-based engineering toward the portfolio architecture.

## Implemented and locally verified

- Offline synthetic ingestion and BM25 retrieval; two documents / four synthetic pages / eight chunks.
- Exact company/year filters applied before ranking, with no cross-filter fallback.
- Shared retrieval workflow and a source-linked JSON response contract; explicit runtime failure states.
- 27 engineering tests passing on macOS 14.6.1 arm64 / Python 3.12.2. Command: `python -m unittest discover -s tests -v` inside the isolated environment.
- A regression test for the new JSON contract failed before implementation because the CLI flags did not exist, then passed after implementation; the previous 20 cases are retained.

## Continuous verification

[GitHub Actions](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml) runs the suite and import/query smoke on Linux and macOS. Inspect the result for the **specific commit** before asserting remote CI success. A workflow file or a pushed commit alone is not evidence of passing checks. Windows and other Python versions have not been validated.

## Not yet implemented / validated

Real PDF ingestion, human-verified financial facts, Decimal calculations, SQL tools, a live model adapter, bounded Agent execution, authentication and document authorization, API/UI, persistent traces, concurrency/recovery, embeddings, real-data evaluation, container and load/operational validation. Final interface refinement is explicitly scheduled after the working business flow.

No numerical financial quality, semantic-support accuracy, cost-saving or business-impact claims are available. A synthetic fixture or provider stub cannot close a real-data/model validation requirement.

## Next work

E1: deterministic financial operations with explicit comparability rules and source lineage. Consult REVIEW_QUEUE before choosing a task. Public-report source permission and real-model service authorization remain separate prerequisites; continue independent local engineering when those are unavailable.
