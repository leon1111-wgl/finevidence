# Receive source-bound pending drafts

2026-10-24. A local receiving workflow for `unverified_fact_drafts` version 1.
The receiver reselects the original PDF, checks the handoff, and explicitly
replaces the saved list. Nothing becomes an approved fact or enters calculations.

## Why this workflow

The dated enterprise research in ENTERPRISE_RESEARCH and FACT_DRAFTS identifies
source-linked, editable material for staff review as a useful narrow task. This
increment uses that existing research; it is not a new competitor assessment.

First design check: export alone leaves the receiver to manually re-enter every
field. Automatic acceptance would conflate unsigned assertions with approval.
Reconstruct the pending rows against the receiver's locally extracted source.

Second design check: merging rows silently creates duplicate/overwrite ambiguity;
a hosted approval queue needs identity, document authorization and permission.
Use a staged, explicit replacement with the old count visible. Keep the current
saved list until validation and the user's replacement action succeed. This
completes a bounded handoff task; it does not resolve those enterprise gates or
prove superiority to any competitor.

## Use

1. Preflight a PDF, save one or more financial drafts, and download the draft JSON.
2. In a fresh workbench, preflight the **same PDF bytes**. Use the same source entry:
   built-in synthetic demo versus a user-selected file. A renamed local PDF works.
3. Open the worksheet and choose the received JSON. Review its original/local PDF
   names, digest, row count, companies, periods, raw amounts, units and pages.
4. Select the button showing incoming and existing counts to replace the saved
   list. Cancel leaves it unchanged. Saving/removing a row revokes a staged file.
5. Open each restored row's original page; inspect its layout and financial
   context. Continue adding/removing pending rows or export again.

Replacement affects saved rows only, not unsaved form fields or the separate
synthetic calculation review. It does not persist through refresh; export first.
No PDF/JSON is uploaded and no model is called. Actual semantic/human review is
not inferred from any click.

## Contract and failure behavior

`importFactDrafts(raw, report)` accepts UTF-8 JSON up to 1 MiB, maximum nesting 12,
5,000 structural values and 1–20 drafts. Malformed JSON, duplicate object keys
(including escaped aliases), nonfinite numbers and excessive structure refuse.
Object-key order and whitespace do not matter; array order remains significant.

The current preflight's SHA-256, byte count and classification must match.
Reconstruction calls `createFactDraft` for every received row, then
`exportFactDrafts` for the collection. It checks original-page membership, exact
amount/token boundaries, decimal conversion, offsets, parser metadata, row/file
names, duplicates and all fixed trust fields. Canonical comparison rejects extra,
missing or altered derived fields, catalog metadata and limitations. After this
check, the same bytes with a new local filename are rebound to that name.

Different reader versions or catalog metadata can require a newly generated
handoff. No automatic version migration, OCR or reconciliation is provided.
Changing a company/period/currency/scale consistently can still yield a valid
*unverified assertion*. Byte hashes and this comparison are not signatures;
coordinated valid edits and false semantic labels are not authenticated.

The panel stages a bounded raw file and its owning report. Apply reconstructs it
again before replacing the list. Clear/new PDF, cancel, and saved-list edits revoke
old attempts; a late read cannot repopulate the UI. Read errors, invalid UTF-8 and
a 5-second file-read deadline preserve saved rows and permit explicit retry.
Native File reads themselves may finish later; this is not hard process resource
isolation. Errors show fixed codes, never exception contents.

## Code and reproducible checks

- `web/fact-draft-import.mjs`: bounded parsing and source-based reconstruction.
- `web/fact-draft-import-panel.mjs`: staged receiving, ownership and atomic apply.
- `web/fact-draft-panel.mjs`: the existing saved collection and source navigation.

```sh
python3 scripts/build_web.py
node --test tests/fact-draft-import.test.mjs
# In another terminal:
python3 -m http.server 8776 --bind 127.0.0.1 --directory web
BASE_URL=http://127.0.0.1:8776/ node tests/browser-draft-import.cjs
# Or use python3 -m finevidence.server and the script's default loopback URL.
```

The unit suite has 28 authored methods. The browser suite reserves 13 scenarios
at 1440/390 px (26), retains per-case elapsed time and not-run entries, and reads
actual downloads. It covers round-trip/source renaming, corrupted identity and
rows, malformed/oversized/duplicate-key/non-UTF8 inputs, read failure/retry,
discard, edited-list revocation, late reads after cancel/clear/replace, deadline
and explicit retry, keyboard operation and isolation from calculation reviews.

Before the UI existed, both planned source-to-receiver tasks failed (0/2); the
remaining 24 engineering cases were not run in that baseline, not counted as
failures. The first implemented suite was 22/26: four assertions targeted an
incorrect canvas selector after successful restoration/download comparison.
The selector was corrected to the existing `pdf-preview-image` container; all
first-run records are retained. The initial unit invocation failed because the
new module did not exist, not because 28 existing tests were executed and failed.

These are public synthetic development scenarios, not hidden or financial-quality
labels. The two official catalog PDFs are separately exercised through a
source-to-export-to-receiver workflow, with unknown units left null; two viewports
do not turn two documents into four independent financial labels. See STATUS,
EVALUATION and local delivery evidence for actual local/CI/public results.
Historical real-model 7/8 and FE-013 remain unchanged; this cycle uses zero paid
calls and does not estimate analyst time saved.

A later malformed-internal-report probe initially passed27/28: an empty report
raised an untyped TypeError instead of IMPORT_SOURCE. The source precondition now
checks file/pages before dereferencing them. Both null and incomplete report
controls are retained; neither version accepted that invalid report.
