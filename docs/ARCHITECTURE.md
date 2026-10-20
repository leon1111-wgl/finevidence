# Enterprise-oriented financial evidence application

Decision date: 2026-10-19. This is the target architecture and acceptance contract, not a statement that every component exists.

## Business workflow

A research analyst selects companies, reporting periods and imported reports; asks a factual or financial question; inspects cited source passages, verified input facts and deterministic calculations; exports a reproducible research brief. A reviewer can replay the same corpus/configuration and distinguish missing evidence, parse failure, unverified facts, incompatible accounting bases and model failure.

The initial financial scope is revenue, gross profit and gross margin, with year-over-year change and percentage-point change. No investment recommendations, trading accounts or forecasting claims.

The user's final interface pass (2026-10-19) calls for a minimal, human-friendly enterprise visual style: neutral colors, clear typography, balanced layout, compact tables and evidence panels. Design the actual reviewer workflow first; then check responsive, keyboard, loading, empty and error states in a real browser. Do not fill the screen with generic AI cards, gradients, decorative badges or marketing language.

## Design choices

Use a modular monolith first: one Python service layer shared by CLI, later FastAPI and a restrained reviewer-facing interface. Keep ingestion, retrieval, facts/calculations, orchestration and presentation separate. SQLite is sufficient for local metadata/facts/traces initially; adopt PostgreSQL only after a measured concurrency or operational requirement. A single bounded Agent follows a deterministic workflow baseline. Microservices, Kubernetes and multiple Agents are not prerequisites for credible engineering.

```mermaid
flowchart LR
  Source[Approved public reports] --> Import[Bounded ingestion and provenance]
  Import --> Evidence[Versioned pages and chunks]
  Import --> Review[Human fact verification]
  Review --> Facts[Read-only fact store]
  Client[CLI / API / reviewer UI] --> Service[Validated application service]
  Service --> Flow[Fixed workflow or bounded Agent]
  Flow --> Search[Search tool]
  Search --> Evidence
  Flow --> Read[Fact lookup tool]
  Read --> Facts
  Flow --> Calc[Decimal calculation tool]
  Flow --> Result[Claims, citations, calculations, limitations]
  Service --> Trace[Request and tool event trace]
```

## Contracts and trust boundaries

- Input documents and model responses are untrusted data. Enforce types, sizes, deadlines, canonical paths and allowed domains at ingestion. PDF parsing is sandboxed or isolated with a bounded worker when added.
- Document provenance: source URL, byte SHA256, company, report period/type, publication date, import time, parser version, 1-based physical page and optional printed page. Synthetic pages use a different page kind.
- Retrieval filters are query controls, **not authorization**. When authenticated document access is implemented, server-derived permissions must be intersected before retrieval and revalidated before returning citations; test cross-user leakage.
- Output contract: schema_version, trace_id, mode, status, answer, claims, citations, calculations, limitations. Retrieval-only mode keeps answer null and does not invent claims.
- Citation existence and excerpt matching establish structural provenance, not semantic support. Evaluate support separately with human labels.
- Fact contract includes raw/normalized values, Decimal-compatible encoding, unit scale, currency, period, accounting basis, consolidation scope, provenance and review status. Only verified facts enter formal real-data calculations. The current synthetic_calculation mode uses separately labelled synthetic_fixture records with verified_by=null; it cannot accept human_verified labels or establish real-data quality.
- Tools are search_documents, get_financial_facts and calculate_metric. Parameterized read-only SQL; no generated executable code. Agent limits cover iterations, total calls, elapsed time, provider timeout and at most one format-repair attempt.
- Provider errors, invalid JSON, budget exhaustion and refusals are typed outcomes, not silent fallback answers. Offline stubs are labeled. Secrets remain in environment/secret stores; no full prompts or raw private documents in telemetry.

## Enterprise acceptance gates

| Dimension | Required demonstrable evidence | Present state |
|---|---|---|
| Correctness | Source-linked results; arithmetic edge cases; explicit failures | Source-checked synthetic retrieval, Decimal gross margin and annual revenue growth; real review remains pending |
| Access boundaries | Authentication + server-side document authorization + negative tests | Not implemented; no hosted upload service |
| Reliability | Timeouts, bounded retry, idempotency, restart recovery tests | Local import contention refusal, idempotent retry and process-kill boundaries tested; full workflow recovery pending |
| Observability | Redacted tool spans, versioned corpus/config, categorized failures | Request identifier is an initial step, not full tracing |
| Evaluation | Frozen development/holdout splits, denominators, replayable results | Synthetic engineering tests only |
| Delivery | Clean-clone setup, CI, container smoke, rollback runbook | Incremental rollout; see STATUS |
| Operations | Measured load envelope and failure drills | Not measured; no uptime/SLA claim |

Performance targets are provisional: report p50/p95, sample size, corpus size, concurrency, hardware and cold/warm state before selecting an SLO. Never fabricate an enterprise availability number.

## Completion definition

The portfolio release needs a working report-to-evidence-to-calculation workflow, a separately demonstrated bounded model integration when authorized, reproducible evaluation and failure cases, CI and runnable packaging, an operations runbook, a three-minute demo and honest contribution records. A production deployment would additionally require organization-specific security, data licensing, privacy, capacity and operational review. Neither is established merely by writing this design.
