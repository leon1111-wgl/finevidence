# Review queue

Baseline review: 2026-10-19, before first public repository commit. These are observed limitations / roadmap gaps unless explicitly labeled reproduced defects.

| ID | Priority | Kind | Evidence / impact | Next acceptance check |
|---|---|---|---|---|
| FE-001 | P1 | Financial capability gap | Partial E1: synthetic gross-margin path and 23 financial tests added on 2026-10-20; human fact review, SQLite and cross-period operations remain absent | Keep open; finish remaining E1 operations/storage and real review boundary |
| FE-002 | P1 | Real-evidence gap | Only two synthetic documents; no real PDF extraction or real-report quality denominator | E2 preserves physical pages and records human fact review |
| FE-003 | P1 | Agent capability gap | No live model or model-selected tool loop | E3 bounds tool requests and records real/stub mode; real execution remains unverified until authorized |
| FE-004 | P2 | Integrity limitation | JSON index stores a source hash but manual content edits are not authenticated; read_index validates shape, not cryptographic origin | Calculation now rechecks originals and rejects a tampered snapshot in test_source_edit_and_snapshot_edit_are_both_rejected; ordinary retrieval still trusts the snapshot. See FINANCIAL_CALCULATIONS; keep retrieval issue open |
| FE-005 | P2 | Operational limitation | Atomic replacement does not serialize concurrent import writers | Reproduce concurrent import and retain both sources with transaction/lock design before supporting concurrency |
| FE-006 | P2 | Retrieval limitation | Lexical overlap can return a different year/company unless explicit filters are applied | E0 filter tests; later evidence-support labeling, not score-as-confidence |
| FE-007 | P2 | Publication/operations gap | Baseline had no remote CI, container smoke or rollback evidence | E0 CI and clean clone; later measured container/operations validation |

Do not mark FE-001/002/003 closed merely because an interface or stub exists. Each closure needs a commit and executed acceptance evidence.

## 2026-10-20 implementation review

The E1 increment's working tree reproduced three boundary defects before publication: UTF-16 manifests accepted despite the UTF-8 contract, deep JSON producing RecursionError, and facts relabelled as 2025 against a 2024 source. `test_manifest_encoding_and_nesting_are_bounded` and `test_report_year_cannot_be_relabelled_in_fact_manifest` initially failed and now pass. These are fixed pre-release defects, not claims that the prior baseline already had a finance module. Source trust limitations are documented separately and remain open where applicable.

A fourth pre-release defect was reproduced in the existing context-isolation test: changing Decimal DefaultContext traps could make 1/3 raise Inexact. Explicit context traps now isolate the function from both active and default context settings. All 50 tests pass locally after this fix.
