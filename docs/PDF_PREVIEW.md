# Local original-page layout preview

2026-10-24. The PDF preparation worksheet can draw the selected physical page
within the extraction workflow. This supports checking column headings, units,
parentheses and visual reading order before handing off an unverified draft.
It is not a semantic verifier, a licensed corpus or authenticated approval.

## Two design checks

1. Extracted text alone removes table alignment. Showing the original physical
   page is useful to the preparer even before real-fact admission is implemented.
   An iframe/native viewer would have browser-dependent controls and active PDF
   annotations. We use the existing pinned PDF.js canvas renderer with annotations
   disabled; no new library, public upload or model call.
2. A successful render can still have substituted fonts or unsupported image
   resources. It must not set review flags or infer units. Keep the original local
   file authoritative, show a fidelity warning, preserve unknown metadata and
   require explicit future human/source-rights approval. A fitted page alone is
   too small on narrow screens, so offer a keyboard-scrollable enlarged view.

This is the next preparation step identified in the dated ENTERPRISE_RESEARCH
and E2 review queue. No new competitor or productivity claim is made.

## Use

Select a local PDF or the synthetic sample, select a physical page, and press
**查看本页版面**. Use **放大查看（可滚动）** to inspect small table text; focus the
preview region and use arrow keys. **收起原页** releases the raster. Page changes,
new files, clear and failed preflight discard the old image. A new render requires
an explicit click. Text, draft entry and saved-draft downloads remain independent.
A preview failure offers a retry or use of a local PDF reader.

`pdf-panel.mjs` retains only the selected File after successful preflight.
`pdf-preview.mjs:renderPdfPage` re-reads and hashes its actual bytes, checks against
the preflight SHA-256, opens a separate Worker and draws only the requested page.
The panel owns an attempt sequence and detached canvas; an old completion cannot
attach an image after selection/cancellation has changed. It does not export an
image or a claimed review event.

Bounds: existing5MiB/120-page limits, one raster, maximum2000 pixels on each edge
and2,000,000 total pixels, regardless of screen DPR. Drawing uses a12-second
application deadline with explicit cancel. Worker termination and render-task
cancellation clean up owned work; main-thread drawing/native font decoding can
still delay timers. This is not a hard CPU/process-memory sandbox or SLA. Large
embedded images, unusual fonts/CMaps and complex graphics can fail or differ.
No OCR, table extraction, interactive annotations, links, scripts or XFA UI.

API references checked2026-10-24: [PDF.js rendering example](https://mozilla.github.io/pdf.js/examples/)
and [DocumentInitParameters](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
The shipped library remains pinned6.4.299 and its bytes/license are unchanged.

## Reproduce and interpret results

```sh
python3 scripts/build_web.py
python3 -m http.server 8776 --bind 127.0.0.1 --directory web
# in another terminal, after installing the pinned development dependencies:
BASE_URL=http://127.0.0.1:8776/ node tests/browser-pdf-preview.cjs
# Same test also runs against python3 -m finevidence.server, port8765.
```

The original8 authored scenarios ×2 widths produced0/16 before the feature.
The first implementation gave14/16: the two failure-message assertions expected
Chinese “超时” while the product correctly emitted PDF_PREVIEW_TIMEOUT and
“超过12秒”. The test now asserts the fixed code; no product outcome was waived.
The enlarged/collapsed controls added2 scenarios ×2 widths: the intermediate
20-case suite passed18/20, failing both missing zoom-control checks.

The final20 cases cover rendering/pixels, page identity, blank pages, worker
failure/retry, cancellation/late completion, file replacement/clear, unchanged
actual draft downloads, source mismatch/dimension bounds, zoom/keyboard/layout
and a held Worker timeout/retry. All cases have fixed planned rows and not_run
counts. Authored fixtures are synthetic, not independent financial-quality labels.

Real validation uses two catalog PDFs ×two widths (4 workflows), each viewing
page1 and its income statement (FY2023 physical9, FY2024 physical7), while the
same page1 pending draft remains byte-for-byte equal in downloads. It checks
local preparation and visible layout, not the correctness of financial semantics,
all55 pages, permission to redistribute, accessibility certification or time saved.
Exact release results, first failures and screenshots are recorded separately.
Historical live-model7/8, FE-013 and the missing real approval gate stay unchanged.
