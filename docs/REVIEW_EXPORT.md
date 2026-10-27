# Review notes to download

2026-10-27 Taipei. The independent 89ca34a audit found that, after writing
notes, reaching the header's export action took 21 forward Tabs at 1440px and
20 at 390px. Export worked, but the path passed through unrelated PDF/handoff
controls and wrapped to the header.

The existing single action now follows the notes, beside the browser-save status
on wide screens and wrapping beneath it on narrow screens. Its ID, handler,
payload and disabled-state rules are unchanged. No duplicate action, positive
tabindex, custom keyboard shortcut or new financial operation is introduced.
The page still distinguishes browser checkmarks from authenticated verification.

## Reproduce

Start `python3 -m finevidence.server`, then run `pnpm test:review-export`.
`BASE_URL` selects a static or Python workbench; `CHROME_PATH` can select an
installed Chrome. Reports, actual JSON downloads and screenshots go to
`BROWSER_ARTIFACTS/review-export` (default `browser-artifacts/review-export`).
This script is also included in `pnpm test:browser` for both CI surfaces.

The frozen plan uses one synthetic Aurora2024 gross-margin source at two widths.
Tab/Enter/Space/type perform calculation, source opening, checking, notes and
download; no click, forced focus or DOM assignment performs that workflow. A
separate programmatic company-selection control checks stale export disabling.
The native select-arrow issue observed in the audit is not claimed resolved.

The first run on unchanged production code fails the <=3-Tab goal at both widths
(0/2); exact same plan after the change passes2/2, with1 Tab each. Actual download
and stale-scope controls remain2/2 in both arms. Results retain each full-case
timing, which includes browser/setup/interaction overhead and is not human time
saved. [First before/after reports and source hashes](validation/review-export-2026-10-27.json)
identify the uncommitted measured candidate. Baseline/candidate screenshot
artifacts and downloaded synthetic records are retained with the local release
evidence; CI additionally preserves browser artifacts.

No hidden tasks, real financial labels, model calls/tokens or calls with unknown
usage. This improves a known review handoff path; it does not establish real-report
quality or complete final E7. Historical live-model7/8 and FE-013 remain open.
An unchanged-server restoration diagnostic passed6/6 this round without
reproducing a natural module reset; prior first failures remain unresolved.

Separate local checks: Python265/265 (66.967s), JS246/246, fixed finance8/8
(numeric/source6/6 each, expected refusal2/2; n=8 p50=0.0005825s,
p95=0.000827s). Python Chrome base14/14, retry7/7, startup16/16 and restore6/6
pass; static Chrome keyboard2/2 and base14/14 pass. These are engineering
regressions, not additional financial tasks. Remote CI and public deployment
verification follow publication and are not inferred from local checks.
