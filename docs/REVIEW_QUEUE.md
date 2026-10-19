# Review queue

Baseline review: 2026-10-19, before first public repository commit. These are observed limitations / roadmap gaps unless explicitly labeled reproduced defects.

| ID | Priority | Kind | Evidence / impact | Next acceptance check |
|---|---|---|---|---|
| FE-001 | P1 | Financial capability gap | No verified fact store or numerical calculation path; cannot yet complete the intended financial analysis workflow | E1 rejects incompatible units/periods and produces source-linked Decimal results |
| FE-002 | P1 | Real-evidence gap | Only two synthetic documents; no real PDF extraction or real-report quality denominator | E2 preserves physical pages and records human fact review |
| FE-003 | P1 | Agent capability gap | No live model or model-selected tool loop | E3 bounds tool requests and records real/stub mode; real execution remains unverified until authorized |
| FE-004 | P2 | Integrity limitation | JSON index stores a source hash but manual content edits are not authenticated; read_index validates shape, not cryptographic origin | Choose explicit trust model; test a corrupted snapshot and document scope of protection |
| FE-005 | P2 | Operational limitation | Atomic replacement does not serialize concurrent import writers | Reproduce concurrent import and retain both sources with transaction/lock design before supporting concurrency |
| FE-006 | P2 | Retrieval limitation | Lexical overlap can return a different year/company unless explicit filters are applied | E0 filter tests; later evidence-support labeling, not score-as-confidence |
| FE-007 | P2 | Publication/operations gap | Baseline had no remote CI, container smoke or rollback evidence | E0 CI and clean clone; later measured container/operations validation |

Do not mark FE-001/002/003 closed merely because an interface or stub exists. Each closure needs a commit and executed acceptance evidence.
