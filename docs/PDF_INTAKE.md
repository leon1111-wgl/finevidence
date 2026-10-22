# Local PDF preflight design and acceptance

A bounded E2 increment: inspect a local PDF before anyone treats it as financial evidence. Public and loopback workbenches use the same browser-only path. No upload endpoint, credentials, model invocation, corpus write, financial calculation or human-verification assertion is introduced.

The reader sees file name, exact byte SHA-256, parser version, 1-based physical pages and extracted text. A page without extracted text is explicitly inconclusive (blank, image-only or extraction failure); no OCR is claimed. Export contains the same page mapping and an unverified classification. Reading text does not establish licensing, semantic correctness, original visual layout or approval. Printed page labels are not inferred.

Limits: 5 MiB source bytes, 120 physical pages, 100,000 text characters per page and 500,000 per document, 12 second wall-clock deadline. A dedicated PDF.js worker is terminated on cancel/deadline; limits do not establish a hard browser-process memory cap. Password-protected input is refused without collecting passwords. Bad signature, malformed/over-limit input, extraction failure, unavailable worker and cancellation have explicit fixed outcomes. No partial output can become a completed report.

Architecture: pdf-intake.mjs is the File/PDF.js/byte-hash contract; pdf-panel.mjs owns rendering, selection, cancel/clear and download. Existing app/state/engine/financial data remain independent. Vendor only the pinned upstream core/worker modules and Apache-2.0 license; verify pinned hashes offline. Dynamic import occurs only when the panel is used. No PDF embedded scripts, attachments, links or actions are executed; content is rendered with textContent, no HTML or native PDF iframe.

Acceptance: generated synthetic PDFs cover text/physical-page order, mixed and textless pages, encryption, invalid header, malformed PDF, byte/page/text limits; browser checks cover retry, cancellation/deadline, clear/reload, keyboard, narrow-screen layout, report hash equality, unchanged corpus/draft and no outgoing document content. A clean-clone build, original regression suites, exact-SHA CI and public resource/browser checks remain release gates. Test counts are engineering coverage, not real-report extraction accuracy or competitive advantage.


## Implemented data flow and actual validation

The sidebar links to PDF preflight on the same homepage. Choose a file or press Try synthetic PDF. `bindPdfPanel` clears the preceding report before `inspectPdf` reads bytes, validates the signature and computes SHA-256. The pinned library opens a dedicated module Worker; pages are read in physical order. Only a complete inventory is shown/exported. Each page remains unverified; an empty extraction is explicitly inconclusive. Clear/cancel/reload do not change the current synthetic calculation or saved review.

The 12 committed PDF fixtures are generated SYNTHETIC inputs, plus a generated over-byte-limit File. Four have valid text/mixed/blank/image-only content; one has an unsupported filter that PDF.js recovers as empty text (still NEEDS_OCR_OR_REVIEW); seven exercise signature, corruption, broken page tree, encryption and page/per-page/total-text limits. They are not a real-report quality corpus. Browser acceptance has 17 scenarios at 1440/390 px, 34/34 locally. The separate fault suite passes 3/3: library load failure and user retry, worker deadline/termination and retry, cancellation/termination and retry. No hidden data or human-time-saving metric is claimed.

The first acceptance attempt on unmodified 83d1989 failed because the PDF entry did not exist; it did not measure a baseline accuracy. The first implemented 24 cases passed. Adding text-limit cases first yielded 24/28 because fixture strings extended beyond the page: only 72 characters per page were actually extracted. Tiny-font on-page stress fixtures corrected the test inputs without changing limits. An unsupported-filter fixture did not throw as first expected (28/30); the parser returned a textless page, so the acceptance now requires an explicit inconclusive status. A separately broken page tree verifies the actual extraction-error refusal without exporting a partial successful page.

The independent injected resource-failure suite initially passed 2/3. A failed dynamic-import URL stayed cached, preventing user retry. The loader now uses a fresh same-origin module URL only after a failed load; a successful module remains cached. The same fault suite then passed 3/3. This is a reproduced prerelease recovery fix; it is not attributed to the old release without PDF capability.

## Reproduce

Run `python3 -m finevidence.server`; open localhost:8765 and select PDF preflight from the sidebar. No Python package installation is needed for runtime. `pnpm test:browser` includes `tests/browser-pdf.cjs` and `tests/browser-pdf-faults.cjs`; BASE_URL can target a static/public build and CHROME_PATH an installed Chrome. The fault suite uses intercepted requests and an intentionally nonresponsive real Worker; this is offline fault injection, not a real malformed-document benchmark.

`python3 -m unittest discover -s tests -v` also checks exact vendor and synthetic-fixture hashes. `web/vendor/manifest.json` records the npm version, tarball integrity and per-file digests; the two unmodified upstream modules and license are committed, so deploy/runtime need no CDN. Review dependency advisories and repeat browser checks when upgrading; hashes detect unreviewed drift, not absence of vulnerabilities.

Limits remain: no visual PDF renderer, page-label interpretation, OCR, table reconstruction, source rights validation, trusted source approval, authenticated human verification, automatic factual ingestion or hard process-memory bound. PDFs may contain extractable but wrongly ordered/encoded text, or recoverable errors. The panel does not detect all such errors. Unverified page inventories are intentionally incompatible with financial facts and replay imports.

## Business need and design challenge, accessed 2026-10-23

Round 1: the [HSBC Hong Kong sandbox use-case summary](https://www.about.hsbc.com.hk/-/media/hong-kong/en/news-and-media/251024-hsbc-hkma-genai-sandbox-use-cases-summary.pdf?sc_lang=en-GB) describes internal staff tools with human involvement. [Dify's official knowledge-base introduction](https://dify.ai/blog/create-knowledge-in-dify-for-beginners) describes PDF ingestion and chunking. These support document preparation as a useful workflow; neither proves FinEvidence's effectiveness or a hiring requirement.

Round 2: adding automatic financial extraction now would combine parsing uncertainty with numeric truth. The chosen narrower deliverable makes file identity, physical-page coverage and missing extracted text inspectable first. Existing mature ingestion products cover broader formats and indexing. The present local-only preflight is an engineering choice for this portfolio, not a claim that it outperforms Dify or a bank's internal platform.

PDF.js API and vendor provenance: [official examples](https://mozilla.github.io/pdf.js/examples/), [getDocument API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [6.4.299 release](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299). Only these two runtime modules are vendored; no upstream viewer, PDFs or financial dataset is copied.

Text limits count JavaScript UTF-16 code units. image-only.pdf is a generated image-only proxy, not a real scanned financial report. Its empty extraction is not labeled proof that the input is a scan.
