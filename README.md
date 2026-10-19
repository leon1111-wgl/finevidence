# FinEvidence

[![Offline regression](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml/badge.svg)](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml)

An enterprise-oriented financial evidence application: trace source passages, review facts and build bounded AI workflows. **Currently implemented: an offline retrieval foundation.** Financial calculations, real-report ingestion, a model-driven Agent and the reviewer interface are tracked work, not delivered claims.

## Run the current version

Python 3.12; the current implementation has no third-party runtime dependencies.

```bash
git clone https://github.com/leon1111-wgl/finevidence.git
cd finevidence
python3 -m venv --without-pip .venv
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m finevidence import aurora_2024.json harbor_2024.json
.venv/bin/python -m finevidence query "revenue" --company "Aurora Orchard" --year 2024 --top-k 1 --json
```

For a human-readable result, omit `--json`. A repeat import skips identical files. Filtered searches never fall back to other companies or years.

```bash
.venv/bin/python -m finevidence query "lamps" --company "Aurora Orchard" --json
```

The second query returns `NO_MATCH`, an empty citations list and `answer: null`.

## What is implemented

- Two clearly marked **SYNTHETIC** documents: two fictional companies, four synthetic pages, eight paragraphs.
- Bounded JSON ingestion, path containment, regular-file checks, duplicate/conflict detection and atomic snapshot writes.
- Page-preserving paragraph chunks, source IDs and import-time source SHA256.
- English BM25 retrieval with exact company/year metadata filters; deterministic ranking.
- A shared workflow and JSON response contract with request ID, status, original excerpts, citations and limitations.
- 27 local engineering tests; GitHub Actions checks the same suite on Linux and macOS with Python 3.12.

All companies, amounts and statements in the sample corpus are fictional. `page_kind=synthetic` is **not** a PDF physical page. Engineering tests do not establish real financial question-answering quality.

## Response contract

`schema_version`, `trace_id`, `mode`, `status`, `answer`, `claims`, `citations`, `calculations`, `limitations`.

Each citation contains its document/chunk identity, filename, source SHA256, company/year, page kind, exact excerpt and score. Retrieval-only mode leaves `answer` null and both `claims` and `calculations` empty. BM25 scores are ranking signals, not confidence probabilities. Citation structure does not prove semantic support.

`--json` provides structured runtime errors, including missing/invalid index, invalid query and filter values. Invalid command syntax (unknown flags or non-integer argparse arguments) uses the standard CLI usage error on stderr. Successful retrieval and no-match return exit code 0; invalid input or source/index failure returns 2.

## Code map

| File | Responsibility |
|---|---|
| `finevidence/cli.py` | CLI parsing and presentation |
| `finevidence/workflow.py` | Shared query workflow, filters and response contract |
| `finevidence/documents.py` | Source validation, snapshot and page-preserving chunks |
| `finevidence/retrieval.py` | Tokenization and BM25 scoring |
| `tests/test_cli.py` | Real CLI integration and boundary tests |

The generated `data/index.json` is ignored by Git. It is an import snapshot; source edits do not silently replace existing records. To intentionally rebuild, back up the index and re-import the sources. Queries do not write history.

## Engineering direction and limits

The business goal is to help analysts review document evidence and reproducible financial calculations. The design favors a modular Python application, deterministic tools and a bounded single Agent. See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [status](docs/STATUS.md), [review queue](docs/REVIEW_QUEUE.md) and [hiring-requirement mapping](docs/HIRING_MAP.md).

This is not a production banking system, investment recommendation engine or trading system. There are no live users, uptime promises, paid model calls, real-report accuracy claims or production compliance claims. Company/year filters are not authorization. The request ID is not full persistent tracing. Concurrent index writers, cryptographic snapshot authenticity and multilingual/semantic retrieval are not supported.

The final interface pass targets a restrained enterprise research workspace: clear typography, neutral colors, readable tables, source review and understandable failures. It will be evaluated in a real browser after the underlying workflow is complete.

## Contribution transparency

Implementation and documentation have been assisted by Codex. Automated tests show observed program behavior, not the author's independent mastery. See [contributions](docs/CONTRIBUTIONS.md). Personal build/interview notes are maintained separately from this public code repository.
