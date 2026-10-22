# Synthetic PDF acceptance files

All files were generated for this repository with pypdf 6.18.1. They are not real company or financial data. The committed bytes and manifest hashes are the replayable fixtures; pypdf is a fixture-authoring tool, not a runtime or CI dependency.

text.pdf has two literal text pages (120 and 100). mixed.pdf has a text page and a blank page. blank.pdf has no text. encrypted.pdf requires the test password synthetic-test-password, which the product never requests. pages-limit.pdf has 121 blank pages. text-limit.pdf and total-text-limit.pdf deliberately use tiny text so the long synthetic strings stay inside the page rather than being clipped before extraction. page-error.pdf has valid text on page 1 and an unsupported content filter on page 2. corrupt.pdf and not-pdf.pdf are malformed controls.

No extraction accuracy, OCR, Chinese font, table, authenticity, licensing or real financial quality conclusion follows from these fixtures. Empty/textless tests do not prove scanner detection.

image-only.pdf contains an actual one-pixel image XObject and no text, a synthetic OCR-needed proxy; broken-page-tree.pdf has a null second page entry, exercising partial-extraction failure.
