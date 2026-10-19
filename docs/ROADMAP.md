# Implementation roadmap

The user replaced the exercise-gated schedule on 2026-10-19. Execute one completed and tested increment per implementation cycle. Prioritize reproducible high-impact review findings over feature count. A cycle may take less than or more than a scheduled interval; do not start a concurrent writer.

| Order | Deliverable | Acceptance evidence | Dependency / boundary |
|---|---|---|---|
| E0 | Shared retrieval service, company/year filters, structured provenance output, GitHub CI | Existing CLI regression + contract/filter/error tests + fresh-clone smoke | Existing synthetic corpus |
| E1 | Fact schema, read-only SQLite access, Decimal financial functions | Unit/period/currency/scope checks; zero/negative/missing inputs; formula lineage | Synthetic tests clearly labeled; real facts require review |
| E2 | Approved public report ingestion, provenance and verification workflow | Four source manifests; physical page tracing; empty/scanned/encrypted/error states | Source rights and download permission; no bulk scraping |
| E3 | Thin model adapter and bounded single-Agent loop | Unknown tool, invalid args, repeat loops, timeout, malformed JSON and budget tests; distinguish fixture vs real model | No paid calls or model download without authorization |
| E4 | Service and reviewer interface, document permission boundary | Shared business logic; API contract, auth/authorization, upload limits, negative access tests | Bind local by default; no public uploads before controls |
| E5 | Comparative evaluation and reliability | BM25 vs permitted embedding baseline with same corpus/k; fixed workflow vs Agent; frozen splits; task-level errors; restart/timeout drills | No random embeddings or self-scored gold labels |
| E6 | Portfolio release | CI, actual container build/smoke if supported, rollback guide, documented limits, demo and evidence-linked claims | Do not call partial milestones a completed enterprise product |
| E7 | Final enterprise interface refinement, requested 2026-10-19 | Real browser checks and screenshots at desktop/narrow widths; keyboard and empty/loading/error states; readable financial tables and source panels | After the complete business workflow works; no cosmetic substitute for missing functionality |

E7 visual direction: a restrained enterprise research workspace with a neutral palette, one functional accent, system fonts, consistent typography, deliberate spacing and aligned tables. Avoid decorative gradients, excessive rounded cards, oversized headings, badge clutter, promotional copy and generic AI-dashboard styling. Prioritize company/period selection, question entry, evidence review, calculation provenance and understandable failure recovery. Measure usability through completing these flows, not screenshot appearance alone.

## Per-cycle procedure

1. Read remote HEAD, STATUS and REVIEW_QUEUE, plus local interview/status notes. If another writer is active, do independent read-only work; do not overwrite it.
2. Select one requirement or finding. Write the failure case and a concrete acceptance check before changing behavior.
3. Implement the smallest coherent feature; keep architecture comprehensible and update applicable documentation.
4. Run targeted tests and the full required suite. Record actual command, exit code, platform, test count and limitations.
5. Inspect diff, release scope and secret/private-material exposure. Commit with honest attribution; use fast-forward publication only.
6. Verify pushed SHA and GitHub checks; fresh-clone smoke important releases. Update Chinese local notes with what changed, why and how an interviewer can reproduce it.
7. Remove only clean, remotely recoverable temporary code. On failed push preserve unsynced work and report recovery location.

## Next concrete implementation after E0

Create `finevidence/finance.py` with Decimal-based gross margin, comparable-period revenue change and percentage-point change. Start tests with literal expected values, zero denominator, missing/nonfinite numbers and negative-prior-value semantics. Add a typed fact/comparability model and parameterized read-only lookup only when used by the workflow. Do not let an LLM choose arbitrary formulas or infer currency/unit scales from prose.

## Review procedure

Review a specific remote commit, read actual implementation and run reproducible checks. Classify defects separately from missing target capabilities. Record P0/P1/P2/P3, file/function, input, observed result, expected result, impact and minimal fix. A roadmap gap must not masquerade as a reproduced bug. The review cycle writes findings and suggestions, not competing production changes.
