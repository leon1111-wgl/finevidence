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


## FE-020 follow-up: Unicode numeric context (2026-10-23)

Independent review of57b6b7c confirmed the ASCII correction but found that extracted `－120`, `120％` and `120٪` could still be saved/exported as positive120. The same P2 finding remains subject to independent closure; this follow-up addresses numeric context, not semantic verification.

The refusal classifier now applies NFKC to surrounding context only and ignores Unicode format characters (`Cf`) there. It recognizes Unicode number categories (`N`), ASCII letters/dot/comma/parentheses, Arabic decimal/group separators (U+066B/C), plus/minus and dash-like signs (U+2010–2015, U+2212), and percent/per-mille markers (ASCII%, U+066A, U+2030/31, U+0609/A). NFKC brings fullwidth/small compatibility forms into those checks. Signs/brackets and percent markers separated by whitespace are also checked. This is a documented conservative repertoire, not all numeric notations or a language parser. It can reject punctuation-adjacent values requiring manual inspection.

Raw amounts, page text, excerpts, file hashes and UTF-16 offsets are **never normalized or repaired**. Raw numeric input still uses the existing ASCII grammar; unsupported forms fail rather than being converted to a different amount. Unknown currency/scale and unverified status remain unchanged. A normalized text copy must never be used as the provenance string.

`node --test tests/fact-draft-unicode.test.mjs` adds19 methods:16 numeric-boundary variants (full/clipped each), original offsets after compatibility expansion, repeated occurrence/export revalidation, and valid/unknown controls. Against57b6b7c,2/19 passed before the fix; after,19/19. These are constructed text cases, not all tested through PDF extraction.

`node tests/browser-fact-unicode.cjs` separately sends actual synthetic PDF bytes through the shipped PDF.js parser:3 observed symbols ×2 excerpt scopes ×2 widths =12 cases. Each case first saves a valid300 control, then attempts the invalid120, checks the exact extracted text, preserves the existing list and actual downloaded JSON, verifies source SHA and unverified status, and uses keyboard save/download. The original build passes0/12. Inputs, fixed denominators, timing, screenshots and downloads are retained under BROWSER_ARTIFACTS/fact-unicode. The generator is a ToUnicode extraction fixture, not a visual/table-quality oracle. It is included in test:browser and CI; the older independent18-case probe remains a separate denominator.

No model was called; first live7/8 and FE-013 remain open. Real-report quality and holdout counts remain0. See STATUS for executed local checks and separately verified release evidence.


First fixed browser runs were11/12 on both static/Python: the last rapid download did not emit a download event. A minimal same-origin Blob-download control outside the application reproduced the eleventh-download timeout (the twelfth succeeded after the wait). Initial inline-handler controls were invalid (no downloads); the explicit-listener control and all outputs are retained. The regression now gives each PDF an isolated browser context; its save/refuse/before-after downloads still share the same report. This changes test isolation, not download assertions or application timeouts. The final unchanged harness is also rerun on the old engine. This does not establish unlimited rapid-download support. A formatter-path error was resolved through offline cached dependencies (4 reused,0 downloaded); no application dependency changed.


## Currency-prefixed transcription, 2026-10-24

Two checks shaped this bounded change. First, the official reference workflow's
actual page-1 amounts were unusable: amounts touch RMB and end with a clause
comma. Supporting those exact tokens makes the existing review handoff useful.
Second, simply ignoring letters before a number would admit identifiers and hide
signs. The implementation keeps original-page context on both sides of the amount,
including before an allowlisted prefix. This is manual transcription support, not
currency/scale inference, semantic verification or authenticated approval.

The recognized context prefixes are uppercase RMB, CNY, HKD, USD, EUR and JPY,
with optional whitespace before the complete raw amount. Existing context-only
NFKC/Cf handling also applies to the prefix; source text, raw value and offsets
are unchanged. A code embedded in a letter/number/underscore identifier is refused.
A sign before the code remains significant: `-RMB 120` cannot be registered as
positive `120`; `RMB-120` can be registered as exact `-120`. Accounting parentheses
must remain complete. This does not add a general financial-notation parser.

After a recognized prefix, a comma followed by whitespace and a letter can delimit
a clause, as in `RMB120, including ...`. Comma-plus-digits, comma-plus-percent and
bare commas remain refused. Without such a recognized prefix, existing conservative
punctuation behavior remains. Currency and scale remain explicit user assertions;
unknowns stay null. Source existence does not validate those assertions.

### Retained failures and checks

- On base2b981a9, the initial34 constructed-string methods passed19/34. They also
  exposed a previously unobserved FE-020 context variant: `-RMB 120` could become
  positive120 because the code hid the sign. The final expanded40-case suite
  passes24/40 on that same base and40/40 after the fix.
- The first prefix-only patch passed the initial24 synthetic browser checks but
  still failed all4 real document/viewport runs: a following clause comma was a
  second refusal cause. Inspecting actual PDF.js text identified it; the failing
  comma unit case was added before extending the rule. Original outputs remain.
- Final browser suite:7 tokens ×2 excerpt scopes ×2 widths =28. On2b981a9 it
  passes12/28; after the fix static and Python each pass28/28. Three complete
  amount controls, four refusal controls, preserved prior rows, actual downloads,
  hashes, unknown currency, keyboard and layout are checked. CI uses synthetic
  ToUnicode PDFs, not real documents or a paid model.
- A deliberately unsafe mutation that discards all context before a prefix passes
  only30/40 unit cases; ten checks detect identifier/sign/occurrence/export errors.
- Two official Kingdee PDFs, each at1440/390px, now complete the *same page-1*
  amount preparation/export path4/4 per local static/Python surface, versus0/4
  before. Raw amounts are5,679,073,000 and6,255,684,000. Currency/scale remain
  unknown and normalized_value=null in this workflow test. These are2 distinct
  documents, not4 independent financial labels, and not extraction accuracy.

Reproduce with `node --test tests/fact-draft-currency.test.mjs` and
`node tests/browser-fact-currency.cjs` (included in `pnpm test:browser`). For the
manual real-document check, obtain either official catalog PDF, keep physical
page1, enter its exact amount without RMB in the amount field, and include RMB
and the surrounding clause in the excerpt. Inspect the saved row and download;
no value becomes calculation-eligible. Release verification is separate from
these local results. Historical live-model7/8 and FE-013 remain unchanged.


## Currency-symbol sign context (2026-10-24)

Independent review at4cad7d0 found that `-$120` and `-HK$120` could be saved
as positive120. This affected unverified drafts and their exports; replay still
refused those files. The sign was outside the excerpt's adjacent symbol and the
previous code-only prefix rule did not inspect it.

The same original-page check now looks before a single Unicode currency symbol
or HK$/US$ prefix (including whitespace within these two qualifiers). Identifier
characters and another currency symbol immediately before the prefix are refused.
A preceding sign or accounting parenthesis remains significant, including across
a short one-to-three-uppercase-letter qualifier such as `-CAD $120`. That latter
rule only refuses hidden signs; it does not interpret the qualifier or set currency.
All existing NFKC/Cf handling is context-only; original source, excerpt and offsets
are untouched. The clause-comma exception remains limited to the six code prefixes.

Exact contiguous `HK$-120` → raw`-120` and `$(120)` → raw`(120)` remain usable.
A sign separated from the digits by a currency symbol, as in `-$120`, is not a
supported contiguous raw amount: refuse it instead of rearranging text or saving
positive120. This bounded check is not a general parser for every currency,
financial layout or negative-number convention. Unknown currency/scale stay null;
there is no approval or calculation admission.

Tests include complete/clipped excerpts, signs before symbols, compound prefixes,
fullwidth forms, hidden format characters, parentheses, grouping/decimal/percent
truncation, identifiers, repeated occurrences and export revalidation. Unrelated
negative prose before a valid amount must not trigger unbounded backward scanning.
See EVALUATION for denominators; original independent review failures are retained
in the local Chinese evidence. No model calls or new dependencies are required.
