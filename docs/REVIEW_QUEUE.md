# Review queue

Baseline review: 2026-10-19, before first public repository commit. These are observed limitations / roadmap gaps unless explicitly labeled reproduced defects.

| ID | Priority | Kind | Evidence / impact | Next acceptance check |
|---|---|---|---|---|
| FE-001 | P1 | Financial capability gap | Partial E1: synthetic gross margin and annual revenue growth implemented; human fact review, SQLite and percentage-point change remain absent | Keep open; finish remaining E1 operations/storage and real review boundary |
| FE-002 | P1 | Real-evidence gap | Only four synthetic documents; no real PDF extraction or real-report quality denominator | E2 preserves physical pages and records human fact review |
| FE-003 | P1 | Agent capability gap | No live model or model-selected tool loop | E3 bounds tool requests and records real/stub mode; real execution remains unverified until authorized |
| FE-004 | P2 | Reproduced drift fixed | At 6458207 altered text/company/year/pages/hash or unavailable originals could yield false evidence or false NO_MATCH | Query now validates all indexed originals before filters and uses checked objects. Seven new regressions plus the prior 32-case script were run; see RETRIEVAL_INTEGRITY. Cryptographic authenticity and coordinated edits remain unsupported |
| FE-005 | P2 | Reproduced operational limitation | At caafb75, two real processes synchronized after reading an empty index both reported successful import, but only one document remained | Keep open; retain both sources with a full read-modify-write transaction/lock before supporting concurrency |
| FE-006 | P2 | Retrieval limitation | Lexical overlap can return a different year/company unless explicit filters are applied | E0 filter tests; later evidence-support labeling, not score-as-confidence |
| FE-007 | P2 | Publication/operations gap | Baseline had no remote CI, container smoke or rollback evidence | E0 CI and clean clone; later measured container/operations validation |
| FE-008 | P2 | Product gap | Reviewer UI does not exist yet | E4 implementation and actual E7 browser/visual checks remain pending |
| FE-009 | P2 | Fixed input defect | At caafb75, FIFO index blocked query/calculation/import; input read was unbounded | Now reject nonregular descriptors, read at most 1 MiB + 1 byte, enforce the same write cap. FIFO, directory, broken links, exact cap, over-cap read and batch-write tests pass |
| FE-010 | P2 | Fixed input defect, including fact follow-up | caafb75 crashed on import; bebb865 fixed document paths but still crashed on surrogate text in financial basis/scope | FinancialFact now rejects invalid scalar text before calculation/serialization. Five new tests include all free-text fields, optional verifier, CLI modes and valid non-BMP controls; 70 full tests pass. Source filenames retain INVALID_PATH |
| FE-011 | P2 | Fixed input defect | At caafb75, a source symlink cycle raised uncaught RuntimeError | Resolve errors become INVALID_PATH; self/two-node cycles, dangling/external links and valid internal link controls pass |

Do not mark FE-001/002/003 closed merely because an interface or stub exists. Each closure needs a commit and executed acceptance evidence.

## 2026-10-20 implementation review

The E1 increment's working tree reproduced three boundary defects before publication: UTF-16 manifests accepted despite the UTF-8 contract, deep JSON producing RecursionError, and facts relabelled as 2025 against a 2024 source. `test_manifest_encoding_and_nesting_are_bounded` and `test_report_year_cannot_be_relabelled_in_fact_manifest` initially failed and now pass. These are fixed pre-release defects, not claims that the prior baseline already had a finance module. Source trust limitations are documented separately and remain open where applicable.

A fourth pre-release defect was reproduced in the existing context-isolation test: changing Decimal DefaultContext traps could make 1/3 raise Inexact. Explicit context traps now isolate the function from both active and default context settings. All 51 tests pass locally after this fix.

Follow-up to 0dedb2b: the fact constructor recursively copied unvalidated field values. A 600-level list caused RecursionError. Direct field type checks now precede serialization; the added regression passes with INVALID_FACT. Final suite: 51 tests, including 24 financial tests.

## Input-boundary fix verification, 2026-10-20

The independent review of `caafb75daa3644e47229cf9f93f56b7ee2471c8d` reproduced FE-009/010/011. This increment adds `tests/test_input_boundaries.py`: initially 13 tests, 10 methods failing against the old implementation (32 failing subtests/assertions after test-fixture cleanup was corrected), three controls already passing. A follow-up test reproduced two more invalid source-path failures (lone surrogate and embedded null in the fact manifest); both now return INVALID_PATH. Final result: 14 boundary tests and 65 full-suite tests pass locally. See [INPUT_BOUNDARIES](INPUT_BOUNDARIES.md) for reproduction, error contracts and the 1 MiB capacity decision. Inspect CI for the exact release commit before claiming remote verification.

At that release FE-004 remained open: editing only the snapshot from 120 to 999 million preserved the displayed source hash and produced EVIDENCE_FOUND during review; calculation correctly returned SOURCE_MISMATCH. A file-size/type check does not authenticate the snapshot. FE-005 remains open despite atomic replacement. These are local-tool limitations, not claims about an exposed production service.

## FE-010 fact-field follow-up, 2026-10-20

Independent review at `bebb86597578c90d60ecdc8bd73283b010aca256` appended U+D800/U+DC00 to both selected facts' accounting_basis or consolidation_scope. All four cases exited 1 with UnicodeEncodeError at finance.gross_margin's calculation-ID encoding. The prior document fix remained valid; this was a different input path and was merged into FE-010.

Five added test methods first produced 20 failing subtests across three methods (14 constructor checks, four CLI crashes, two invalid-verifier status checks); two controls already passed. The fact constructor now checks every accepted string by strict UTF-8 encoding after type/length validation. Optional verifier null remains valid; a valid non-null identity still cannot enable synthetic calculations. No bad value is echoed in the error. Source filenames keep the prior INVALID_PATH contract. Targeted 29 and full 70 tests pass locally; see INPUT_BOUNDARIES for limits and commands. No production arithmetic, source data, retrieval behavior, model or UI changed. At that release FE-004/005 stayed open; current disposition is in the table above.

## Retrieval integrity and annual growth, 2026-10-20

The 6458207 review extended FE-004 to old-company/year false NO_MATCH and wrong page citations. Seven regression methods first produced 11 failing subtests/assertions; the fix passes all seven (2.680s). The original 32-case review script was rerun without changes: no timeout, index bytes preserved, expected source/index/text errors and normal controls. This closes the observed retrieval drift, not whole-corpus completeness or cryptographic authenticity.

Revenue growth adds fourteen tests with literal +20%, -20%, 0% and -100% oracles, explicit units and adjacent-calendar-year policy, zero/negative-prior refusal, comparable metadata and two-source CLI lineage. All 91 tests pass locally (12.540s). FE-001 remains partial, FE-005 remains open, and FE-008/E7 remain unimplemented. See FINANCIAL_CALCULATIONS for the two fixture-conflict failures corrected without weakening their target assertions.
