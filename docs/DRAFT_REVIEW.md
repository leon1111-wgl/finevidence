# Draft preparation checklist and correction

2026-10-25 (Asia/Taipei). Local preparation of an unsigned review artifact;
not authenticated approval, source-rights clearance or real-fact admission.

## Two design passes

Official pages rechecked and accessible on 2026-10-25:
[Tencent ADP enterprise knowledge](https://adp.tencentcloud.com/solutions/enterprise-knowledge-expert)
describes employee checking/editing and original references (Shenzhen platform
reference; undated product description). [AlphaSense response documentation](https://developer.alpha-sense.com/agent-api/response-parsing)
describes document/page/statement citations (international competitor reference;
undated documentation). These establish existing workflow baselines, not measured
competitor performance or evidence of a particular junior hiring requirement.

First pass: a citation is useful but a reviewer still needs to identify missing
currency, units and scope and inconsistent transcription. Show actionable issues
on the saved source-bound rows and allow a correction without deleting the row.
Second pass: a green readiness score or a browser "approve" button would imply
trust the application cannot establish. Keep source rights and authenticated
semantic review as explicit outstanding gates even when all declared fields are
filled. Compare only exact declarations and never use an LLM to infer missing
units, merge aliases or resolve disagreements. There is no competitor win claim.

## Run a complete preparation task

1. PDF preflight → try the synthetic PDF → open the financial draft worksheet.
2. Save page 1 amount `120` with unknown currency/scale/basis/scope and no URL.
   The saved row lists these five gaps. Export the checklist to inspect them.
3. Choose **修改草稿 1**, inspect the original page, fill the declared metadata,
   then save. The row is replaced only after full source/amount validation; the
   saved count stays one. Cancel or invalid input preserves the original row.
4. Save page 2 amount `100` using the *same* company, period, metric, currency,
   basis and scope. This intentionally mislabeled synthetic example creates a
   declared-value conflict. Edit its period to `2023` after checking that page;
   the comparison group disappears. This demonstrates correcting a declaration,
   not automatic semantic verification of the period.
5. Export saved drafts for later source-bound re-import, or export the checklist
   for review. The latter contains the saved rows plus checks and is deliberately
   a different format; it cannot be imported as approved facts or a replay pack.

## Contract and limits

`reviewFactDrafts(report, drafts)` first calls `exportFactDrafts` to reconstruct
every saved row against the current file/page/excerpt and amount. Its result has
kind `unverified_draft_review`, schema 1, the original unverified source metadata,
rows and provenance, plus `checks.policy=exact_declared_context_v1`.

- Preparation fields: company, title, period, source URL, currency, unit scale,
  accounting basis and consolidation scope. Null and exact case-insensitive
  `unknown`, `待核对`, `待核验`, `未提供` are reported. This finite placeholder
  list cannot detect arbitrary vague prose or prove that any supplied value is true.
- Group only rows whose company/period/metric/currency/basis/scope are known and
  exactly equal after the existing input trimming; unit scale must be known.
  No case folding, translations, period parsing, alias or restatement merging.
- Compare canonical normalized decimal **strings**, never IEEE-754 numbers.
  Different scales with the same normalized value are `REPEATED_DECLARATION`;
  different values are `DECLARED_VALUE_CONFLICT`. Both need a human to distinguish
  duplicate extraction, genuine revisions, or mislabeled context. Titles/URLs are
  not grouping keys; all rows already belong to the same local PDF.
- Group row numbers are 1-based positions in this exported snapshot. They are
  not persistent IDs; editing, deleting or importing rebuilds all checks.
- `rows_needing_attention` counts unique affected rows, not issue count or an
  accuracy/readiness score. Zero does **not** mean ready for financial calculation.
- `SOURCE_RIGHTS_NOT_VERIFIED` and `AUTHENTICATED_SEMANTIC_REVIEW_REQUIRED` always
  remain. All drafts keep pending status, verified_by=null and calculation=false.
- Saving a correction uses an object reference to its original row and validates
  the entire proposed list before replacement. A duplicate/invalid replacement
  cannot remove prior rows. No-op saves remain valid. Maximum count stays 20.
- Cancel, switching pages, viewing another original, deleting, receiving another
  list or changing the PDF ends editing. Page/file changes keep existing clearing
  rules; list import preserves unsaved form fields but ends their replace target,
  so a later save is explicitly a new draft. Editing controls are also installed
  on supported historical HTML before binding, preserving legacy startup.
- Drafts remain in memory; export before refresh. No upload, network source fetch,
  model call, new storage, signature, reviewer identity or admission endpoint.

## Reproduce

```sh
python3 scripts/build_web.py
node --test tests/draft-review.test.mjs
# Python loopback server or a static server of web/ must already be running
BASE_URL=http://127.0.0.1:8765/ node tests/browser-draft-review.cjs
```

The browser runner reserves twelve scenarios × two widths (1440/390), retains failed
and not-run cases, downloads actual JSON and checks keyboard transitions, error
retry, cancellation, page/list/file changes and absence of non-GET requests.
Two authored task sequences (fill missing metadata; resolve a declared conflict)
× two viewports are a separate denominator of four, using **one** synthetic PDF.
This is public development coverage, not a hidden set, real financial accuracy,
human time saved or a model/competitor benchmark. The historic live result7/8 and
FE-013 remain unchanged; no paid calls are made.

First failures: the red unit module import failed before implementation. The
first implementation passed11/12 methods; a page-drift assertion had two identical
page texts and therefore expected rejection of an actually self-consistent row.
The second page fixture now has a distinct prefix/offset; production validation
was not relaxed. The first current-HTML browser plan passed20/20, but historical
HTML cache regression exposed missing newly added DOM controls. Compatibility
initialization was then added before final release checks. Exact results and
release verification are retained separately in local delivery evidence.

Implementation, tests and documentation are Codex-assisted. This increment adds
no claim of independent user implementation or human financial-review contribution.

The local orchestration helper also mistakenly sent the Python-only restore
suite to the static server; all six cases rejected that wrong runtime as designed.
The proper Python restore invocation passed6/6. Its final new-feature browser
suite was accidentally invoked twice (both24/24); it is counted once, not as
additional coverage. These harness mistakes do not change the task denominators.
