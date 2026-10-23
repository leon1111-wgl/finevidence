# Official references and local version identification

Accessed 2026-10-24 (Asia/Taipei). This increment makes the local PDF preparation
workflow usable with a small, named source set. It does not approve real facts
for financial calculations.

## Two design checks

1. Research assistants need to find the right disclosure and hand a reproducible
   version to a reviewer. The prior [enterprise research](ENTERPRISE_RESEARCH.md)
   and [handoff comparison](HANDOFF_RESEARCH.md) prioritize source navigation and
   review. This increment adds official links, publication dates and observed byte
   fingerprints to the existing PDF flow. No competitor quality advantage or
   analyst time saving has been measured.
2. An official URL can fail, a filename can change, and identical bytes do not
   establish financial truth or reuse permission. Compare SHA-256 **and** size
   against a versioned metadata catalog; leave unmatched files usable for normal
   preflight. Keep catalog metadata separate from the user's fact assertions.
   Do not download documents in the background or promote drafts to approved facts.

## Observed source set

| Reference | Official listing / publication | PDF size | Physical pages | SHA-256 |
|---|---|---:|---:|---|
| Kingdee FY2023 annual results | [2024 announcements](https://investor.kingdee.com/en/announcements-circulars/s-2024/), 2024-03-18 | 1,126,393 bytes | 55 | `dd453567d91ae07d1db89bfc227fa441dba06f1de84ff819f6ee8f9484f7e5c7` |
| Kingdee FY2024 annual results | [2025 announcements](https://investor.kingdee.com/en/announcements-circulars/s-2025/), 2025-03-17 | 474,346 bytes | 55 | `ecf72f0a9ccfaec14fa1dc174d8f8cd31c1773e5f59c3e5edbcb01d15497d4ca` |

The exact official PDF URLs are in `web/source-catalog.mjs` and the homepage.
These are historical earnings announcements, not the latest reporting set or
full annual reports. Listing links provide a fallback if direct URLs change.
Titles/years were checked on rendered first pages; selected income-statement
pages were also inspected. Full-page financial semantics were not audited.

Four candidate URLs were attempted once: both Kingdee PDFs were obtained; both
Tencent FY2023/FY2024 official links returned HTTP 200 **HTML**, not PDF bytes.
Those two were not admitted to the catalog. Retrieval success is 2/4 candidates;
this must not be reported as four verified sources or successful HTTP-only checks.

Public availability is not a reuse license. The Kingdee listing reserves rights;
`licensing_status` remains `not_verified`. The public repository contains only
reference metadata, not the reports or full extracted text. Users obtain documents
from the publisher and select a local file. No CORS proxy or upload service exists.

## Use and data flow

1. On the homepage, open **PDF 资料预检 → 从官方资料开始** using Enter or a click.
2. Open the official PDF, save it locally, then select it under the PDF file input.
3. `inspectPdf` reads the actual bytes, computes SHA-256, enforces parser limits,
   and calls `identifySource({bytes, sha256})`. Renaming the file does not matter.
4. The result displays a catalog match, or a neutral unmatched message. Page
   inventories include `source_reference`. Failed/new/cleared attempts remove old
   identity; canceling the file picker keeps the existing report.
5. Register a pending draft and export. `exportFactDrafts` re-derives the reference
   from the report file metadata, ignoring any supplied `source_reference` object.
   User company/period/currency/scale remain assertions. Every draft remains
   `pending_human_review`, `verified_by: null`, and ineligible for calculation.

This is not a signature, independent origin attestation or live publisher check.
A coordinated edit to trusted catalog/application code is outside this boundary.
Exported JSON is unsigned. A new official revision can legitimately be unmatched.

The initial actual-document draft attempt used a number immediately following
`RMB` on page 1. All four document/viewport attempts were refused by the existing
numeric-token boundary, leaving the download disabled. This failure is retained.
The working walkthrough uses the separate revenue cell on FY2023 physical page 9
and FY2024 page 7. Currency and scale remain unknown in this identity test; no
inferred unit or financial metric is asserted. Supporting attached currency codes
requires a separate boundary design and regression; do not weaken sign/substring
checks as a workaround.

## Reproducible checks and denominators

```sh
python3 -m unittest discover -s tests -v
python3 scripts/build_web.py
node --test tests/*.test.mjs
python3 scripts/evaluate.py --output fixed-evaluation.json
python3 -m finevidence.server
# In another terminal, with Playwright installed:
node tests/browser-source-catalog.cjs
pnpm test:browser
pnpm test:restore
```

`BASE_URL` chooses static, loopback Python or public Pages; `CHROME_PATH` can use
an existing Chromium. CI uses synthetic bytes with an explicitly substituted
catalog fingerprint. It does not retrieve real documents or call a paid model.

Local evidence before publication:

- Python 185/185 in 21.085s; JS 78/78; fixed synthetic business tasks 8/8, numeric
  and source checks 6/6 each, expected refusals 2/2. These are separate denominators.
- New identity/state browser regression: 2/14 on the old interface, then 14/14 on
  static and Python surfaces. Seven cases × two widths; synthetic mapping only.
- Real-document workflow: **2 distinct official PDFs**, each at 1440 and 390 px,
  hence **4/4 workflow runs** on the local static surface after choosing the table
  cells. Each produces 55 text pages, matching digest/size and an unverified
  draft export. Preflight 365–449 ms on this machine; descriptive observations,
  not an SLA or a representative benchmark. The original page-1 draft attempts
  remain 0/4; they are not replaced by a best-of-N quality score.
- A unit fixture initially ended `120` with a period, which the existing token
  policy refuses. Corrected to `120 units`; no production acceptance rule changed.
- Real financial quality labels: 0; hidden set: 0; human time-saving study: 0;
  paid calls this cycle: 0. Historical live-model synthetic development score
  remains 7/8 and FE-013 stays open.

Exact-commit CI, public byte matching and deployed browser results are release
checks, recorded after push. E2 remains partial: four approved source manifests,
source-rights decisions, independent semantic labels and authenticated human
approval are not completed by this catalog.
