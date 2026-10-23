# PDF-to-fact review drafts

2026-10-23. A complete **local drafting and handoff** workflow, not approved real-data ingestion.

## Why this increment

Official sources rechecked 2026-10-23 and accessible:

- [Tencent Cloud ADP enterprise knowledge](https://adp.tencentcloud.com/solutions/enterprise-knowledge-expert) describes internal document retrieval, employee edits to generated Q&A and original-document references. It is a product description, not independent outcome evidence or a junior hiring threshold.
- [AlphaSense response documentation](https://developer.alpha-sense.com/agent-api/response-parsing) describes structured citations with document, page and sometimes statement identifiers. It does not establish how this project's financial labels should be verified.

Round one: an automatic PDF-to-finance button would make the demo look complete but confuse extracted text with trusted facts. Merely exporting page text leaves the reviewer to copy every source reference manually. Choose an explicit fact worksheet bound to the selected physical page; retain user assertions and unknown values.

Round two: weigh automatic extraction, a local worksheet and a hosted approval queue. Automatic extraction needs fresh quality labels; hosting needs identity, authorization and upload permission. Extend the existing local preflight with the bounded worksheet now. This supplies a review artifact that can be inspected, with no claim of superior retrieval or overall superiority to those products. Authenticated approval and real-report evaluation remain separate work.

## Try it

Open the online or loopback workbench → PDF 资料预检 → 试用虚构 PDF → 登记待核验财务草稿. Enter a synthetic company/title, period `2024 calendar year`, revenue, raw amount `120`, USD, multiplier `1000000`. Fill the page text and save. The saved row includes the raw amount and multiplier; the expanded detail includes `120000000`, the exact excerpt and the unverified accounting scope. Export the saved list as JSON. Select page 2 to draft the prior `100`, or remove a row. Changing files, clearing or refreshing removes this in-memory list.

Only the explicitly saved rows are exported; subsequent unsaved form edits are not included. A rejected add leaves the list unchanged and reports its retained count. The source URL is optional and never fetched. Source authenticity, licensing, company, period and financial semantics are not certified by this operation. Open the original PDF separately to check layout, table headers and context.

## Data and trust contract

- The existing PDF.js preflight supplies exact file SHA256/name, parser version and 1-based `pdf_physical` page. Printed page numbers can differ.
- `createFactDraft(report, input)` validates typed/bounded metadata and **exact contiguous excerpt membership** in the current page; offsets are UTF-16 code units into the extracted page string. Numeric boundaries are checked in the whole extracted page at that occurrence, including characters just outside the excerpt. Repeated identical excerpts use the first occurrence; a later valid token cannot validate an earlier clipped one. This is structural lineage, not proof of semantic support or visual bounding boxes.
- Revenue/gross-profit are the two allowed labels. Company/title/period/basis/scope are user-supplied strings; basis/scope may stay `unknown`. No calendar, fiscal, restatement or consolidation inference occurs.
- Raw amounts accept plain decimals, strict three-digit comma grouping, leading minus or enclosing accounting parentheses. A bounded string decimal shift yields a canonical Decimal-compatible value, with no `Number` financial conversion. Limit: 40 integer and 18 fractional digits. Scientific notation, plus signs, percentages, localized decimal commas and partial tokens are rejected. This deliberately conservative token check can reject otherwise valid punctuation-adjacent amounts; no automatic repair is attempted.
- Currency and multiplier default to unknown. An unknown multiplier yields `normalized_value: null`; no guess from nearby text. Selecting a known multiplier merely records the user's asserted conversion.
- `review_status: pending_human_review`, `verified_by: null`, `financial_calculation_eligible: false` are fixed. The classification remains `SYNTHETIC_DEMO_UNVERIFIED` for the built-in demo, otherwise `USER_SUPPLIED_UNVERIFIED` (including a synthetic test file chosen through the user-file input).
- At most 20 saved rows; no duplicate identical rows. `exportFactDrafts` reconstructs each row against the current report and rejects drift/tampering. Each row carries its own full provenance. The `unverified_fact_drafts` envelope is distinct from the trusted synthetic replay format; the replay verifier rejects it.
- No PDF or metadata upload, model call, localStorage write, automatic fact-store admission, authenticated reviewer identity, signature or re-import is implemented. Downloaded JSON is unsigned and editable; hash identity does not prove origin or prevent coordinated edits. Refresh loss is explicitly disclosed, so export before leaving.

## Code path

`bindPdfPanel` owns the current successful preflight report and invalidates it on every new attempt/clear. `bindFactDraftPanel` renders the worksheet/list and obtains that report through a closure. On Save, `createFactDraft` validates input; `exportFactDrafts` validates the proposed collection before the UI replaces its saved list. On export, the same collection check runs again. On page change, the unsaved amount/excerpt are cleared; saved rows retain their original pages. On file replacement all draft fields/rows are cleared. Nothing calls Workspace, a model or the fact store.

## Reproduce and interpret evidence

```sh
python3 scripts/build_web.py
python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
python3 scripts/evaluate.py --output evaluation-result.json
# Terminal 1
python3 -m http.server 8776 --bind 127.0.0.1 --directory web
# Terminal 2, after pnpm install --frozen-lockfile --ignore-scripts
BASE_URL=http://127.0.0.1:8776/ node tests/browser-fact-draft.cjs
# Also against python3 -m finevidence.server
node tests/browser-fact-draft.cjs
```

The authored synthetic workflow has eight scenarios at 1440/390 px: source-to-saved-export; invalid/duplicate submission; unknown unit; page identity; remove/empty; replacement/error/retry; keyboard/layout; isolation. The report always reserves all 16 rows, records per-case elapsed time and preserves not-run cases if setup fails. Browser screenshots and actual downloaded JSON are inspected by assertions. This is publicly visible development coverage, not a hidden set or real-report accuracy estimate. One source-to-export task per viewport is a denominator of **2**, not 16 independent business examples. All timing is serial browser test automation on one local machine, not human review time or a production latency SLO.

The pre-UI baseline has no draft workflow (0/2 source-to-export tasks, 0/16 new UI scenarios). First implemented UI run was 14/16: two assertions incorrectly matched `本页` rather than the actual `当前物理页` message; preserve that run. The valid and refused actions had the intended behavior; the message assertion was corrected without changing the refusal. An HTML formatting check also caught two malformed option boundaries, which were repaired before release. The first shell test invocation lacked Node on PATH; the subsequent explicit-runtime red test failed because the new module did not exist. These are development/test failures, not claims of production defects.

Local and exact-commit CI/deployment results belong in STATUS and the Chinese delivery evidence; do not infer deployment from this document. The historical eight-task real-model result remains 7/8, FE-013 is open, real financial quality samples are still 0, and this cycle makes 0 paid calls.

Final local results: Python **185/185** (24.300 s), JavaScript **38/38** (including eight new contract tests), fixed workflow **8/8**. Existing browser families 14/7/18/20/PDF34/fault4/loading8 passed on static and Python surfaces; the new worksheet is **16/16 on each**, and Python draft recovery is 6/6. The business denominator above is **2/2 source-to-export tasks per surface**, using one authored two-page PDF, not 16 financial examples. No human-time saving or financial accuracy percentage is estimated.

Two further test-development failures are retained: the cross-format rejection test incorrectly expected no downloadable report, while the existing verifier correctly exports a rejection report (`SCHEMA_INVALID`); the assertion was aligned with that existing contract. A fully keyboard-driven test then got null units because this macOS Chrome native select did not commit ArrowDown selections. A minimal page with only a select reproduced the behavior; the application also showed it in headed Chrome; native type-ahead (`USD`, `1,000,000`) selected the intended options. The workflow now exercises that keyboard path without injecting selected values or changing application handlers. The failed 12/16 attempt, control scripts and successful 16/16 results are retained. No refusal or numeric assertion was relaxed.

## FE-020: preserve original numeric boundaries (2026-10-23)

At f5e06d9, excerpt `12` from original `120`, or excerpt `120` from `-120`, could be saved and exported. Exact substring membership alone did not preserve numeric identity. `containsToken` now searches only within the chosen excerpt but inspects both boundaries at the corresponding absolute page offsets. Save and export share this check. The first-occurrence rule, conservative token grammar, exact string decimal conversion and unverified admission remain unchanged. A source hash still does not certify transcription or semantics.

`tests/fact-draft-boundary.test.mjs` adds 16 cases covering clipped signs/digits/grouping/decimal/percent/exponent, whitespace lost by trimming, repeated occurrences, out-of-excerpt matching, UTF-16 offsets and export revalidation. Before the patch, 2/16 passed; after the patch all16 passed. A deliberately incorrect whole-page search mutation passes14/16 and is caught by both occurrence/scope tests. The first draft test used an incorrect literal offset and changed the amount position in an export fixture; both test constructions were corrected before the production patch, and the original output is retained in local evidence.

The browser worksheet suite now has nine scenarios × two widths (18), adding rejected clipped inputs while the previously saved row and actual downloaded JSON remain unchanged. Its pre-fix result was16/18. The original independent review's 21-case string probe changed13/21→21/21, with five valid controls and eight pairs of full/clipped refusals. These are synthetic engineering checks, not new real financial quality samples or a model benchmark. Exact release, CI and public-browser verification are recorded separately.
