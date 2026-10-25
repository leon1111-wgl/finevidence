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

## E1 progress and next increment

2026-10-20: source-linked calendar-year gross margin is implemented through CLI and shared workflow, with four explicitly synthetic facts, typed comparability checks, Decimal normalization and 24 added tests. This is a partial E1 delivery. No SQLite or human verification is claimed.

Originally next: comparable-period revenue change and percentage-point change with literal numeric oracles, zero/negative-prior semantics, calendar/fiscal period alignment and source lineage. Then integrate parameterized read-only lookup when used by the workflow. Do not let an LLM choose arbitrary formulas or infer currency/unit scales from prose. See FINANCIAL_CALCULATIONS for the current limits and source trust model.

Review-driven work takes precedence: the 2026-10-20 input-boundary increment fixes FE-009/010/011 with 14 added regression tests (65 total). FE-004 was next at that release; FE-005 concurrent writes remain unsupported and need a complete transaction/lock design. This reliability work does not complete E1 or start the final UI acceptance gate.

The subsequent bebb865 review reopened FE-010 for financial fact text. That follow-up now validates all supplied fact strings, with five additional tests (70 total). The original document fix and source-path error contract remain intact. At that release the next priority remained FE-004; do not infer progress on E1 arithmetic extensions or E7 from this boundary fix.

## Review procedure

Review a specific remote commit, read actual implementation and run reproducible checks. Classify defects separately from missing target capabilities. Record P0/P1/P2/P3, file/function, input, observed result, expected result, impact and minimal fix. A roadmap gap must not masquerade as a reproduced bug. The review cycle writes findings and suggestions, not competing production changes.

## Source-checked annual comparison, 2026-10-20

FE-004 reproduced retrieval drift is now fixed with seven regressions. Revenue growth is implemented with two additional synthetic 2023 reports, eight total facts and fourteen growth tests. Both years are checked from a single manifest/index read; results contain both sources and literal growth/decline examples. The full suite is 91 tests. E1 remains partial: percentage-point change and read-only storage are next; fiscal-year/restatement support and human review remain explicit gaps. FE-005 concurrent import is still open. No real model, API or UI was added, and E7 has not begun.

## Local import concurrency, 2026-10-20

FE-005 cooperating-writer lost update is fixed with a full-operation POSIX lock and explicit INDEX_BUSY retry contract. Fourteen new tests bring the suite to 105; they include real process interruption before/after replacement. This is local file coordination, not the planned read-only SQLite fact store or Agent state recovery. Next continue E1 percentage-point calculations and parameterized fact storage; no new UI or E7 acceptance is claimed. See IMPORT_CONCURRENCY.

## Query input correction, 2026-10-20

Independent review of af20584 found a remaining FE-010 query/company Unicode boundary. Shared entry validation and seven new regression methods now fix that observed failure (112 tests total), while keeping the original source/finance/import behavior. Continue E1 percentage-point calculations and read-only fact storage next; this input correction does not complete E1 or begin E7.

## Margin percentage-point change, 2026-10-21

The adjacent-calendar-year margin comparison is implemented through the shared workflow and CLI, with four explicit facts, both original citations and a percentage_points unit. Fifteen added tests and a separate numeric oracle validate the bounded arithmetic and failure contract. E1 remains partial; parameterized read-only fact storage is next, followed by the real-source/review work. The existing synthetic manifest trust boundary is unchanged. No E7 or model completion is claimed.

## Explicit read-only fact snapshots, 2026-10-21

Synthetic E1 storage is now consumed by all three existing workflows. The build command validates all authored inputs/sources, publishes a new snapshot without replacement, and preserves the manifest as an explicit reference backend. Reader failures do not fall back to JSON. Twenty-three new tests include connection-level read-only checks, parameter values, schema failures, source drift, concurrency and six-result parity (150 total).

The broader real fact review boundary remains open; storage is not evidence of human review. Next move toward E2 approved report ingestion and real verification records. No live model, authorization, UI, E7 screenshot or production acceptance is claimed. See FACT_STORE for lifecycle and limitations.

The subsequent FE-012 correction keeps build identity consistent on refusals and filesystem errors, with five regression methods (155 total). This completes one observed response-contract fix; the next feature increment remains E2 source ingestion and actual fact review, not another storage abstraction or a premature E7 completion claim.

## User-prioritized complete sample workbench, 2026-10-21

The user requested a GitHub-visible application after two enterprise research/design rounds, changed both cycles to three hours and authorized a specific MornAI integration. E3 now has real model-selected tool calls and protocol tests; E4 now has a loopback API/shared reviewer UI plus client-only public Pages. Source review/export/replay and an actual visual/keyboard/responsive pass work for the synthetic scope. These increments do not close organization permissions, real-report review or final production/real-data E7 acceptance. See ENTERPRISE_RESEARCH and WORKBENCH_RUNBOOK.

## User-requested auditable handoff, 2026-10-22

The existing review/export workflow now has local deterministic replay packages and per-field comparison, selected after two official-source research/design rounds (HANDOFF_RESEARCH). This is a complete bounded synthetic workflow extension. It does not complete real-source ingestion, authenticated approval, signed artifacts or persistent audit; these remain the next important enterprise gaps.


2026-10-22 bounded reviewer-flow increment: FE-017 file identity and export/import feedback separation are implemented and locally tested. This makes an existing handoff inspectable; it does not advance real-report E2 or organization authorization. Next major work remains an authorized real-source and actual human-verification boundary, with physical-page provenance and separately reported quality evidence.

## E2 preflight increment, 2026-10-23

A complete bounded local-file-to-page-inventory workflow now precedes actual corpus admission. E2 remains partial: approved real-source manifests, visual/table/OCR handling and authenticated fact verification are still pending. The preflight does not add a public upload service or enable unverified real-data calculations. Next extend source/verification with explicit authority and fresh quality evidence, not automatic approval based on extracted text.


2026-10-23 review priority: FE-018 stalled component import/manual retry is corrected with independent attempt ownership and successful-module caching. Desktop/narrow resource-failure regression is included in CI. E2 real-source rights and human verification remain next major gaps; this reliability correction does not admit unverified PDFs to financial calculations.

2026-10-23: E2 now includes local source-bound financial drafts and unsigned handoff with unknown metadata preserved. This advances manual preparation, not authenticated human approval or licensed real-report admission. Next establish a permitted real-source set, independent semantic/visual labels and an approval/admission contract before enabling real financial calculations.

2026-10-24: E2 now has a reference-only official catalog (two historical Kingdee
results PDFs), exact local byte-version identification and lineage in pending
exports. Two Tencent candidate URLs returned HTML and were excluded. This is not
four approved source manifests or permission to reuse reports. Next resolve
source-rights decisions and a real human/semantic verification contract. Attached
currency-token support is a documented usability gap, not a reason to weaken the
existing numeric boundary. See SOURCE_CATALOG.


2026-10-24: the actual catalog reports' page-1 amounts can be prepared through bounded currency-prefix and clause-comma handling. Numeric sign context extends across the code; export rechecks it. This closes neither financial semantics nor real-source approval. After independent FE-021/FE-020 scope review, prioritize source rights and an explicit reviewer/admission contract.


2026-10-24: follow-up FE-020 currency-symbol sign preservation is implemented
with source-position, prior-draft/export and browser regression evidence. Keep the
independent closure gate; then return to E2 source rights and real reviewer/admission
contracts. This fix does not advance authenticated approval or final real-data E7.

2026-10-24: E2 adds original physical-page layout inspection with enlarged narrow-screen scrolling, explicit retry/cancel and source-byte ownership. This enables manual comparison but does not complete source rights, authenticated human approval, real fact admission or final E7. Those gates remain next; do not treat a rendered page as a reviewed fact.

2026-10-24: pending financial drafts can now return to a receiver worksheet after reselection of the same PDF and explicit replacement. This closes the bounded preparation/handoff loop, not E2 source rights, human semantic approval or admission. Prioritize those remaining gates and separately labeled real-data evaluation. See DRAFT_RECEIVING.

## E2 preparation increment, 2026-10-25

Saved unverified rows now carry actionable missing-field and exact-declaration
conflict checks, in-place correction/cancel and a source-bound checklist export.
No field completion, URL, matching hash or UI action establishes source rights
or authenticated approval. Next implement/test actual identity, rights and
review/revocation admission, using permitted sources and genuine human labels;
keep E2 and final E7 open. See DRAFT_REVIEW for concrete workflow and limits.


## E2 local observation accountability, 2026-10-25

The opt-in local ledger binds a configured operator and separate secret to durable
pending-draft observations and revocations. It implements an accountable local
recording/recovery mechanism, not organization identity, source-rights clearance
or semantic financial approval. No unverified real facts enter calculation.
Next requires a permitted real-source set, genuine independent human labels and
an admission/revocation contract consumed by calculations. Do not close E2 or
final real-business E7 based on synthetic ledger checks. See LOCAL_REVIEW_LEDGER.
