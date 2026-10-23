# Local PDF preflight design and acceptance

A bounded E2 increment: inspect a local PDF before anyone treats it as financial evidence. Public and loopback workbenches use the same browser-only path. No upload endpoint, credentials, model invocation, corpus write, financial calculation or human-verification assertion is introduced.

The reader sees file name, exact byte SHA-256, parser version, 1-based physical pages and extracted text. A page without extracted text is explicitly inconclusive (blank, image-only or extraction failure); no OCR is claimed. Export contains the same page mapping and an unverified classification. Reading text does not establish licensing, semantic correctness, original visual layout or approval. Printed page labels are not inferred.

Limits: 5 MiB source bytes, 120 physical pages, 100,000 text characters per page and 500,000 per document, 12 second wall-clock processing deadline. The built-in public synthetic sample has a separate 5 second download deadline before processing begins. A dedicated PDF.js worker is terminated on cancel/deadline; limits do not establish a hard browser-process memory cap. Password-protected input is refused without collecting passwords. Bad signature, malformed/over-limit input, extraction failure, unavailable worker and cancellation have explicit fixed outcomes. No partial output can become a completed report.

Architecture: pdf-intake.mjs is the File/PDF.js/byte-hash contract; pdf-panel.mjs owns rendering, selection, cancel/clear and download. Existing app/state/engine/financial data remain independent. Vendor only the pinned upstream core/worker modules and Apache-2.0 license; verify pinned hashes offline. Dynamic import occurs only when the panel is used. No PDF embedded scripts, attachments, links or actions are executed; content is rendered with textContent, no HTML or native PDF iframe.

Acceptance: generated synthetic PDFs cover text/physical-page order, mixed and textless pages, encryption, invalid header, malformed PDF, byte/page/text limits; browser checks cover retry, cancellation/deadline, clear/reload, keyboard, narrow-screen layout, report hash equality, unchanged corpus/draft and no outgoing document content. A clean-clone build, original regression suites, exact-SHA CI and public resource/browser checks remain release gates. Test counts are engineering coverage, not real-report extraction accuracy or competitive advantage.


## Implemented data flow and actual validation

The sidebar links to PDF preflight on the same homepage. Choose a file or press Try synthetic PDF. `bindPdfPanel` clears the preceding report before `inspectPdf` reads bytes, validates the signature and computes SHA-256. The pinned library opens a dedicated module Worker; pages are read in physical order. Only a complete inventory is shown/exported. Each page remains unverified; an empty extraction is explicitly inconclusive. Clear/cancel/reload do not change the current synthetic calculation or saved review.

The 12 committed PDF fixtures are generated SYNTHETIC inputs, plus a generated over-byte-limit File. Four have valid text/mixed/blank/image-only content; one has an unsupported filter that PDF.js recovers as empty text (still NEEDS_OCR_OR_REVIEW); seven exercise signature, corruption, broken page tree, encryption and page/per-page/total-text limits. They are not a real-report quality corpus. Browser acceptance has 17 scenarios at 1440/390 px, 34/34 locally. The separate fault suite passes 4/4: sample-download deadline and retry, library load failure and user retry, worker deadline/termination and retry, cancellation/termination and retry. No hidden data or human-time-saving metric is claimed.

The first acceptance attempt on unmodified 83d1989 failed because the PDF entry did not exist; it did not measure a baseline accuracy. The first implemented 24 cases passed. Adding text-limit cases first yielded 24/28 because fixture strings extended beyond the page: only 72 characters per page were actually extracted. Tiny-font on-page stress fixtures corrected the test inputs without changing limits. An unsupported-filter fixture did not throw as first expected (28/30); the parser returned a textless page, so the acceptance now requires an explicit inconclusive status. A separately broken page tree verifies the actual extraction-error refusal without exporting a partial successful page.

The independent injected resource-failure suite initially passed 2/3. A failed dynamic-import URL stayed cached, preventing user retry. The loader now uses a fresh same-origin module URL only after a failed load; a successful module remains cached. The same fault suite then passed 3/3. This is a reproduced prerelease recovery fix; it is not attributed to the old release without PDF capability.

A fourth injected fault exposed an unbounded wait for the public demo download (3/4). A separate 5 second fetch deadline now aborts that request and gives an explicit PDF_DEMO_TIMEOUT with user retry; all four cases pass. File processing keeps its independent 12 second deadline.

## Reproduce

Run `python3 -m finevidence.server`; open localhost:8765 and select PDF preflight from the sidebar. No Python package installation is needed for runtime. `pnpm test:browser` includes `tests/browser-pdf.cjs` and `tests/browser-pdf-faults.cjs`; BASE_URL can target a static/public build and CHROME_PATH an installed Chrome. The fault suite uses intercepted requests and an intentionally nonresponsive real Worker; this is offline fault injection, not a real malformed-document benchmark.

`python3 -m unittest discover -s tests -v` also checks exact vendor and synthetic-fixture hashes. `web/vendor/manifest.json` records the npm version, tarball integrity and per-file digests; the two unmodified upstream modules and license are committed, so deploy/runtime need no CDN. Review dependency advisories and repeat browser checks when upgrading; hashes detect unreviewed drift, not absence of vulnerabilities.

Limits remain: no visual PDF renderer, page-label interpretation, OCR, table reconstruction, source rights validation, trusted source approval, authenticated human verification, automatic factual ingestion or hard process-memory bound. PDFs may contain extractable but wrongly ordered/encoded text, or recoverable errors. The panel does not detect all such errors. Unverified page inventories are intentionally incompatible with financial facts and replay imports.

## Business need and design challenge, accessed 2026-10-23

Round 1: the [HSBC Hong Kong sandbox use-case summary](https://www.about.hsbc.com.hk/-/media/hong-kong/en/news-and-media/251024-hsbc-hkma-genai-sandbox-use-cases-summary.pdf?sc_lang=en-GB) describes internal staff tools with human involvement. [Dify's official knowledge-base introduction](https://dify.ai/blog/create-knowledge-in-dify-for-beginners) describes PDF ingestion and chunking. These support document preparation as a useful workflow; neither proves FinEvidence's effectiveness or a hiring requirement.

Round 2: adding automatic financial extraction now would combine parsing uncertainty with numeric truth. The chosen narrower deliverable makes file identity, physical-page coverage and missing extracted text inspectable first. Existing mature ingestion products cover broader formats and indexing. The present local-only preflight is an engineering choice for this portfolio, not a claim that it outperforms Dify or a bank's internal platform.

PDF.js API and vendor provenance: [official examples](https://mozilla.github.io/pdf.js/examples/), [getDocument API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [6.4.299 release](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299). Only these two runtime modules are vendored; no upstream viewer, PDFs or financial dataset is copied.

Text limits count JavaScript UTF-16 code units. image-only.pdf is a generated image-only proxy, not a real scanned financial report. Its empty extraction is not labeled proof that the input is a scan.


## FE-018: manual retry after a stalled module load (2026-10-23)

Independent review of 82ab62c reproduced failed manual retries on both the public and Python surfaces (0/2). A still-pending dynamic import remained in the shared promise cache after the caller timed out. Restored connectivity did not help: retry waited on that original import. Immediate rejection was already covered by the four-case fault suite; an unresolved request was not.

The loader now caches only a successfully loaded, version-checked module accepted by an active attempt. Every uncached explicit attempt has its own import URL and promise; a timed-out or canceled caller cannot populate or clear the successful cache or create a Worker. There is no shared pending slot for an old callback to invalidate. Subsequent files reuse the successful module. There are no automatic retries.

The original 12-second total processing deadline is unchanged. When it expires while awaiting the module, the panel reports PDF_READER_TIMEOUT and suggests checking connectivity and selecting again; PDF_TIMEOUT still covers file processing/parsing. Cancel remains PDF_CANCELLED. Native dynamic import has no AbortSignal: stopping the application wait does **not** physically cancel that network request or remove its module-map entry. Late settlement is ignored by the abandoned attempt. Repeated explicit failures can retain browser module entries until reload; this is not a hard memory bound or an automatic retry budget.

`node tests/browser-pdf-loading.cjs` adds four injected resource sequences at 1440 and 390 px (8 cases): timeout then late rejection, cancellation then late resolution, and old rejection/resolution while the new attempt is pending. The first run against unmodified 82ab62c passed 0/8: all eight failed because a second module request never started. After the fix, local static and Python acceptance each pass 8/8. Tests keep the original request held while allowing the new request; removing the route would release the original and conceal the bug. Actual pinned PDF.js, Worker, synthetic PDF bytes and downloaded JSON remain in use. The tests also assert hash/page identity, no stale Worker, keyboard cancel/export, success-cache reuse, and preserved unverified status. They are included in test:browser and run for both delivery modes in CI.

This is authored synthetic recovery evidence, not a financial-accuracy, competitor-performance, real-report or human-time-saving result. Original PDF34/resource-fault4 suites remain required. Independent closure and precise released-SHA verification are separate from implementation tests.


Release infrastructure evidence: the first fix CI run39882588317 passed Linux/macOS tests but its browser job hit the10-minute job limit. Log timestamps show apt downloaded25.9MB in9min01s (47.9kB/s); the actual browser suites had started, and Pages was skipped. The browser job now permits20minutes for cold dependency setup plus both suites. No application12-second deadline, per-test assertion, browser case or deployment dependency was removed. Preserve this failed release attempt; only a complete exact-commit CI run can verify deployment.
