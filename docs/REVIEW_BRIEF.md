# Readable evidence brief

2026-10-29. The workbench can download a standalone HTML reading copy of its
current synthetic result. JSON review records and replay packages remain the
machine-readable handoff. This advances the research-brief delivery in E6;
it does not complete real-report admission in E2 or the final E7 acceptance.

## Two design decisions

The workflow in ENTERPRISE_RESEARCH is evidence preparation for a reviewer.
A JSON-only export makes a recipient reconstruct the presentation to read the
formula, periods, units and cited pages. Reuse the existing export snapshot and
render those fields in a restrained report, with source links inside the file.

A polished document can overstate trust. The heading therefore retains SYNTHETIC
and unauthenticated-check labels. Do not calculate again, generate a model summary,
fetch references, include pending PDF drafts, or create a new approval format.
The HTML is editable and unsigned; it is not accepted by the replay importer.
No new enterprise efficacy, hiring or source-rights claim is introduced.

## Use and implementation

Run a task, inspect its sources, check any reviewed passages and write a note.
After the note, one Tab reaches JSON export and a second reaches
**导出可读简报（HTML）**. Open the downloaded file in a browser. Internal links
lead to each numbered citation; complete source pages are included below them.
The input table scrolls horizontally on narrow screens. Browser print styling
removes the scroll clipping and repeats table headings. Browser print-media
rendering is tested; physical printers and platform print dialogs are not.

`workbench.exportReview` builds the same snapshot for either download;
`review-brief.renderReviewBrief` is a pure presentation function. It escapes
all data, generates only fixed local anchors, contains no scripts, and supplies
a restrictive CSP with no external resource permission. Rendering is not an
independent verifier or an interface for opening untrusted review JSON.

Python supplies normalized values and numeric policy; the browser supplies raw
amounts/scales and exact-rational display/formula. The brief preserves the fields
actually returned, omitting a standard-amount column when none were returned.
It does not infer missing metadata or normalize values again. A fact's citation
is matched by document, page and exact excerpt. Model records, when present,
retain provider identity, trace and incomplete/unknown usage. Unit tests use an
explicit OFFLINE_TEST_STUB; no live model was run for this feature.

Changing scope, starting another operation or a refused calculation disables the
old brief. A generation/download-initiation error preserves the result and note
and permits an explicit retry. Browser download completion/cancellation cannot
be inferred by the application; the notification says the download was started.
Supported older HTML gets the disabled control before workbench startup.

## Reproduce and interpret

```sh
python3 scripts/build_web.py
node --test tests/review-brief.test.mjs
# Serve web/ statically or start python3 -m finevidence.server first.
BASE_URL=http://127.0.0.1:8765/ pnpm test:review-brief
```

The main browser plan has four sequences (growth, decline, empty search,
missing-prior refusal followed by correction) at 1440 and 390 pixels: eight
observations, four synthetic source documents and two existing numeric tasks.
It downloads HTML and JSON, checks exact values, periods, units, basis, scope,
hashes, full pages, partial review and notes; checks keyboard activation, no
external requests or executable markup, print styling and stale-output disabling.
Four separate boundaries cover a failed download initiation and supported old
HTML at both widths. These are authored development checks, not hidden cases,
real-report semantic accuracy or measured human time saved.

First results are retained in validation/review-brief-2026-10-29.json. Baseline
has no readable-export control: 0/8 capability acceptance, not eight production
defects. First candidate is 2/8: a renderer assumed Python-only fact citation
IDs. First unit candidate is 1/6 and also exposed a test mutating its shared
corpus. The renderer now matches actual provenance; tests clone fixtures and
treat browser-only absent normalized fields explicitly. The eight case plan and
financial/source expectations remain; the judge's schema handling changed and
is not presented as a byte-identical before/after judge. Final static/Python
results are each 8/8 plus 4/4 boundaries. Six unit methods cover six financial
displays, escaping, empty output, model-usage metadata and refusal boundaries.

Fixed deterministic financial tasks remain 8/8 (numeric/source 6/6, expected
refusal 2/2). Historical live-model first pass stays 7/8 with FE-013 open.
Model/paid calls, unknown-usage calls, new hidden tasks and genuine human financial
labels added here are all zero. Exact-commit CI and public deployment are separate
release checks. Implementation and tests are Codex-assisted; no independent
user contribution or authenticated review is claimed.
