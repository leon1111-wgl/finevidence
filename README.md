# FinEvidence

[![Offline regression](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml/badge.svg)](https://github.com/leon1111-wgl/finevidence/actions/workflows/ci.yml)

An enterprise-oriented financial evidence application: trace source passages, review facts and build bounded AI workflows. **Currently implemented: offline retrieval and source-linked synthetic gross-margin calculations.** Real-report ingestion, human fact review, a model-driven Agent and the reviewer interface remain tracked work.

## Run the current version

Python 3.12; the current implementation has no third-party runtime dependencies.

```bash
git clone https://github.com/leon1111-wgl/finevidence.git
cd finevidence
python3 -m venv --without-pip .venv
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m finevidence import aurora_2024.json harbor_2024.json
.venv/bin/python -m finevidence query "revenue" --company "Aurora Orchard" --year 2024 --top-k 1 --json
.venv/bin/python -m finevidence calculate gross-margin --company "Aurora Orchard" --year 2024 --json
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
- Four typed synthetic facts, explicit units/period/currency/basis/scope, original-source rechecks and deterministic Decimal gross margin.
- 70 local engineering tests; GitHub Actions checks the same suite on Linux and macOS with Python 3.12.

All companies, amounts and statements in the sample corpus are fictional. `page_kind=synthetic` is **not** a PDF physical page. Engineering tests do not establish real financial question-answering quality.

## Response contract

`schema_version`, `trace_id`, `mode`, `status`, `answer`, `claims`, `citations`, `calculations`, `limitations`.

Each citation contains its document/chunk identity, filename, source SHA256, company/year, page kind, exact excerpt and score. Retrieval-only mode leaves `answer` null and both `claims` and `calculations` empty. BM25 scores are ranking signals, not confidence probabilities. Citation structure does not prove semantic support.

`--json` provides structured runtime errors, including missing/invalid index, invalid query and filter values. Invalid command syntax (unknown flags or non-integer argparse arguments) uses the standard CLI usage error on stderr. Successful retrieval and no-match return exit code 0; invalid input or source/index failure returns 2.

## Synthetic financial calculation

The `calculate gross-margin` command requires imported source documents and an exact company/calendar-year selection. Aurora Orchard gives `36 million / 120 million = 0.3`, displayed as `30.00%`; Harbor Lantern gives `25.00%`. Omit `--json` to see the inputs, formula and original paragraph in the terminal.

The JSON mode is `synthetic_calculation`. It includes typed `facts`, exact string-encoded normalized values, a deterministic `calc_id`, input fact IDs, formula, ratio unit, rounding policy, citations and a **templated** synthetic answer. This is a fixed workflow, not model inference. Replaying identical facts and policy retains the calculation ID and gets a new request ID; no history is persisted.

Values must be bounded fixed-point decimal strings, not floats, exponent notation, null or NaN. Explicit scales of 1, thousand, million or billion are normalized before division. Company, dates, report type, currency, accounting basis and consolidation scope must agree. Zero revenue returns `ZERO_DENOMINATOR`; negative revenue is outside the current policy and returns `NEGATIVE_REVENUE`; negative gross profit is allowed. Division uses an isolated 50-significant-digit Decimal context; only display percentages are quantized to two decimals using half-even rounding. Recurring decimals are precision-limited, not claimed exact.

Facts are authored test fixtures (`verification_status=synthetic_fixture`, `verified_by=null`), **not human-verified financial facts**. The loader checks the original bytes against the imported snapshot and fact hash, report year/company, and exact page paragraph. The version-controlled manifest is trusted for numeric transcription; these checks do not independently establish semantic correctness or authenticate a coordinated edit of all files. Real/human-verified statuses are refused until a review workflow exists.

Missing operands return `FACTS_NOT_FOUND` rather than falling back to another company/year. Invalid manifests, incompatible facts, unverified facts and source drift have separate error codes and return no answer/calculation (exit 2). SQLite lookup, year-over-year change and percentage-point change remain subsequent E1 work. See [the calculation contract](docs/FINANCIAL_CALCULATIONS.md).

## Code map

| File | Responsibility |
|---|---|
| `finevidence/cli.py` | CLI parsing and presentation |
| `finevidence/workflow.py` | Shared query workflow, filters and response contract |
| `finevidence/documents.py` | Source validation, snapshot and page-preserving chunks |
| `finevidence/retrieval.py` | Tokenization and BM25 scoring |
| `finevidence/facts.py` | Typed fixture validation, selection and original-source checks |
| `finevidence/finance.py` | Comparable-input validation and Decimal gross margin |
| `tests/test_cli.py` | Real CLI integration and boundary tests |
| `tests/test_finance*.py` | Literal arithmetic oracles and source-linked calculation boundaries |

The generated `data/index.json` is ignored by Git. It is an import snapshot; source edits do not silently replace existing records. To intentionally rebuild, back up the index and re-import the sources. Queries do not write history.

The offline JSON index has a **1 MiB (1,048,576-byte) UTF-8 storage limit**, including formatting and its final newline. Both reading and writing enforce this limit: oversized input or a batch that would exceed it returns `INDEX_LIMIT` without replacing the existing index. Nonregular index files and broken index links return `INDEX_INVALID`; a genuinely absent index retains `INDEX_MISSING` for queries and can be created by import. On POSIX, nonblocking open followed by descriptor type validation rejects a FIFO without waiting for a writer.

Isolated Unicode surrogate characters in source text, stored document metadata and financial fact text are rejected; valid non-BMP characters are preserved. Financial text validation returns `INVALID_FACT` before calculation or serialization. Invalid source filenames retain `INVALID_PATH`, as do source link cycles. These input checks preserve the original text rather than dropping bad characters. See [input boundaries and regression evidence](docs/INPUT_BOUNDARIES.md).

This release adds explicit fictional period/basis/scope wording to the two source paragraphs, so their hashes change. An old index is intentionally rejected for calculation. Use a fresh clone, or move the old index outside the checkout as a backup and re-import. Do not manually patch hashes to bypass drift checks.

## Engineering direction and limits

The business goal is to help analysts review document evidence and reproducible financial calculations. The design favors a modular Python application, deterministic tools and a bounded single Agent. See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [status](docs/STATUS.md), [review queue](docs/REVIEW_QUEUE.md) and [hiring-requirement mapping](docs/HIRING_MAP.md).

This is not a production banking system, investment recommendation engine or trading system. There are no live users, uptime promises, paid model calls, real-report accuracy claims or production compliance claims. Company/year filters are not authorization. The request ID is not full persistent tracing. Concurrent index writers, cryptographic snapshot authenticity and multilingual/semantic retrieval are not supported.

The final interface pass targets a restrained enterprise research workspace: clear typography, neutral colors, readable tables, source review and understandable failures. It will be evaluated in a real browser after the underlying workflow is complete.

## Contribution transparency

Implementation and documentation have been assisted by Codex. Automated tests show observed program behavior, not the author's independent mastery. See [contributions](docs/CONTRIBUTIONS.md). Personal build/interview notes are maintained separately from this public code repository.
