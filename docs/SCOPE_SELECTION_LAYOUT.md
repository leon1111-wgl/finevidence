# Readable company selection on compact screens

2026-10-29 Taipei. The independent review of `5ec231d` observed a P3 usability
issue: at 320px, the closed company selector clips both synthetic company names.
A reviewer should be able to identify the selected company before calculating or
exporting. This is an E7 improvement, not final E7 acceptance or a financial defect.

## Change and tradeoff

At 360px and below, the existing company and year controls occupy separate rows.
The same controls, labels, DOM order, font size, filters and handlers remain in
use. Wider layouts keep their existing arrangement. This exchanges some vertical
space for a readable scope; it does not abbreviate company names or hide the year.
No new data, model, network or permission path is introduced.

## Frozen development acceptance

`tests/browser-scope-layout.cjs` runs two existing synthetic companies at
320/360/361/390/768/1440px (12 authored cases; two source documents).
Each case selects a company, captures its closed control, presses Tab from company
to year, calculates gross margin, checks the source, downloads actual JSON, then
switches company and verifies stale results/export are disabled. Literal values
are Aurora 30.00% and Harbor 25.00%, with the correct 2024 source and annotations.

The readability proxy compares Canvas text width in the computed control font
with client width minus horizontal padding and a fixed 20px arrow reserve. It is
a conservative geometry check, not a universal native-control rendering model.
Actual Chrome screenshots supplement it. No horizontal page overflow is allowed.

| Measure | Original CSS | Candidate CSS |
|---|---:|---:|
| Complete known path | 10/12 | 12/12 |
| 320px names fit the proxy | 0/2 | 2/2 |
| Other five widths | 10/10 | 10/10 |
| Company to year via one Tab | 12/12 | 12/12 |
| Actual JSON: value, company, year, source, review | 12/12 | 12/12 |
| Scope change invalidates prior result/export | 12/12 | 12/12 |

At 320px, the control grows from 135px to 284px; available text space after the
reserve grows from 93px to 242px. Measured names require 105.044/103.916px.
Both companies' actual screenshots at 320px and the 390/1440px layout were
inspected. At 360/361px the same frozen checks cover the breakpoint boundary.
This is not a hidden set, user study or evidence of analyst time saved.

First valid runs used Chrome 156 on macOS 14.6.1 arm64 and the local Python
surface. Per-case p50/p95 were 0.511/0.654 seconds before and 0.492/0.591 after
(n=12 each, including browser navigation and download; warm local assets,
sequential cases). Timing is diagnostic, not an optimization claim. Raw rows,
test hash and initial harness failure are in
[validation/scope-layout-2026-10-29.json](validation/scope-layout-2026-10-29.json).

## First failure and limits

The initial harness mistakenly used `#source-panel` although the panel has a
class. It was interrupted after 23.849 seconds and retained as an invalid harness
run; its terminal rows are not product results. The selector was corrected to
the labelled checkbox before either valid comparison arm. The same corrected
test then ran once against each CSS version; the baseline's two failures reached
the final readability assertion after successful business controls.

Company selection uses Playwright `selectOption`; only the following Tab is a
real keyboard action. Native arrow-menu operation, screen readers, touch devices,
other browser engines, enlarged system fonts and arbitrary future company names
are not established. There are zero hidden/real-report tasks, new human labels,
model calls, tokens and unknown-usage calls. Fixed synthetic financial evaluation
remains separate: 8/8 complete, 6/6 exact values and source sets, 2/2 expected
refusals; p50/p95 .000619/.000801 seconds, n=8 in-process. Historical live-model
7/8 and FE-013, real-source E2, natural module reset observations and final E7
remain open. Publication, exact-SHA CI and independent review are separate gates.

## Reproduce

```sh
python3 scripts/build_web.py
# In another terminal: python3 -m finevidence.server
pnpm test:scope-layout
# Or use the public/static page:
BASE_URL=https://leon1111-wgl.github.io/finevidence/ pnpm test:scope-layout
```

`BROWSER_ARTIFACTS` selects the local evidence directory; `CHROME_PATH` optionally
selects an installed Chrome. CI includes this test in `test:browser` for both
static and Python surfaces. Reports preserve 12 planned rows, phases, failures,
downloads and screenshots; no model credentials are needed.
