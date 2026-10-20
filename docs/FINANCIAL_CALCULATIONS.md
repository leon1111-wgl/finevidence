# Financial calculation contract and trust model

Implemented through 2026-10-21: gross margin, adjacent-calendar-year revenue growth and margin percentage-point change, entirely synthetic. This does not complete E1 or establish real-report quality.

## Data flow

`cli.main` → `workflow.calculate_margin` → `facts.load_fixture_facts` → `finance.gross_margin` → response with facts, calculation and original citations.

`data/facts/synthetic.json` contains eight authored facts across two companies and 2023/2024. The loader reads at most 64 KiB of UTF-8 JSON and at most 32 facts. It validates shape, unique identities/selectors, fixed-point values, dates and explicit metadata; selects the required calendar-year facts; re-reads each selected original once; compares it with the imported snapshot and recorded hashes; and matches each full paragraph on its synthetic page. A missing or inconsistent input cannot fall back to a different company/year. No input is interpreted as SQL, code or a formula.

For Aurora Orchard, revenue `120 × 1000000 = 120000000 USD` and gross profit `36 × 1000000 = 36000000 USD` produce `36000000 / 120000000 = 0.3`. `30.00%` is a display value; the ratio string and policy remain in the calculation. A content-derived calculation ID covers both fact records and numeric policy. It is a reproducibility identifier, not a signature or authorization token.

## Numeric and comparison policy

- Decimal input: at most 18 integral digits and 12 fractional digits. No float, boolean, missing value, exponent, nonfinite value or implicit separator parsing.
- Scale: explicit multiplier `1`, `1000`, `1000000` or `1000000000`. Normalize before dividing; preserve the raw value and scale.
- Equality for gross margin: company, period start/end, report type, currency, accounting basis and consolidation scope. Growth instead requires adjacent complete calendar years; company, currency, basis and scope still match. Currency codes have a three-uppercase-letter syntax check, not an ISO registry lookup. No currency conversion.
- Zero revenue: refuse. Negative revenue: refuse under this initial policy. Negative gross profit: retain the negative ratio. Do not clamp unusual ratios into 0–100%.
- Gross margin / revenue growth arithmetic: isolated Decimal context, 50 significant digits, half-even rounding. Display: percentage with two fractional digits. No early input rounding. This precision exceeds the exact normalized input length under the declared bounds, but division can still recur.
- Each fact must come from its own report year. Prior-year comparative columns inside a newer report, restatement selection and non-calendar financial years remain unsupported.

## Annual revenue growth

`cli.main` → `workflow.calculate_revenue_growth` → `facts.load_fixture_periods` → `finance.revenue_growth` → shared result formatting. `--year` is the current year, and the prior year is exactly one year earlier. Current years 1001–9999 keep both years within the four-digit source contract.

The loader reads one manifest and one index for the entire comparison, requires revenue in both periods, and validates each source before returning any result. Gross-profit facts are not required. The single-year `load_fixture_facts` wrapper still requires both revenue and gross profit for margin.

After explicit unit normalization, `(current - prior) / prior` returns a ratio; `absolute_change` remains in the displayed `currency`. Aurora's 2024 versus 2023 fixture is `(120000000 - 100000000) / 100000000 = 0.2`, displayed as `20.00%`. Harbor's result is `-20.00%`. The calculation identity binds both complete fact records and `revenue_growth_v1` policy; both original citations are returned.

Prior revenue must be positive: zero (including negative zero) is `ZERO_DENOMINATOR`; a negative prior is `NEGATIVE_BASE`. Current revenue must be nonnegative; zero against a positive prior gives -100%. This is an explicit support policy, not a claim that negative revenue can never occur. Complete adjacent years accept leap years without requiring equal day counts. Quarterly, partial, fiscal and nonadjacent periods are refused, not annualized.

## Margin percentage-point change

`cli.main` → `workflow.calculate_margin_change` → `facts.load_fixture_periods` → `finance.gross_margin_change` → shared result formatting. The CLI operation is `gross-margin-change`; current year 1001–9999 selects that year and its immediate predecessor. The existing loader reads one index and manifest, requires both revenue and gross profit in both years, then checks the two selected original sources. Results contain four fact records and two deduplicated paragraph citations for the current fixtures.

The formula is `(current_gross_profit / current_revenue - prior_gross_profit / prior_revenue) * 100`, returned as `unit=percentage_points` and displayed with `pp`. Aurora: 30% minus 25% = 5.00 pp; Harbor: 25% minus 30% = -5.00 pp. Relative growth of a margin is a different quantity and is not provided. Both component margin ratios/displays are included for inspection, not used as operands for the change.

All four identities must be distinct and all facts explicitly synthetic. Within each year the existing margin checks enforce matching company, dates, report type, currency, basis and scope. Across years, company/currency/basis/scope must match, and periods must be adjacent complete calendar years, current first. Both revenues must be positive: zero including signed zero is ZERO_DENOMINATOR, negative is NEGATIVE_REVENUE. Negative/zero profits and margins outside 0–100% are not clamped. Missing operands, unimported/changed sources and fabricated review statuses fail explicitly with no partial result.

To avoid cancellation between independently rounded ratios, let `cg, cr, pg, pr` be the four normalized Decimal values. Compute `((cg * pr - pg * cr) * 100) / (cr * pr)` under a fresh 100-digit half-even context. The declared 18-integral/12-fractional digit bound and maximum billion scale give at most 39 digits on a common decimal grid; products, subtraction and multiplication by 100 fit within 81 digits. Thus these intermediates are exact under this context. Division may recur, so the `value` is explicitly precision-limited. Final display alone is quantized to 0.01 pp; a rounded zero has no minus sign. The component margins retain the existing 50-digit policy and cannot reconstruct the more precise change in near-equal extreme cases. `gross_margin_change_v1` records both precisions and the method, and the calculation ID binds all four full fact records and policy.

Literal rounding control: 12.346% minus 12.344% is 0.002 pp, displayed 0.00 pp. Subtracting their displayed 12.35% and 12.34% would incorrectly yield 0.01 pp. Consecutive 30-digit coefficients also test a nonzero change near 1e-58 pp that would disappear if 50-digit component ratios were subtracted.

Fifteen new unit/CLI methods first failed with 59 assertions/subtests on the absent function/operation, then passed in 1.493s. All prior 112 tests remain unchanged; full 127 pass in 15.773s on macOS/Python 3.12.2. A separate seeded oracle uses exact Fraction arithmetic and integer half-even rounding for 14 fixed plus 1,000 generated inputs, including signs, all scales and bounds: all 1,014 displays match, exact zeros remain zero, and nonzero reported values have relative error below 1e-98 for these inputs. This is engineering evidence, not extraction accuracy or a real-report denominator. Inspect exact-commit CI separately.

## Evidence boundary

The fixture manifest and checked-out code are trusted local development artifacts. Source checks detect stale snapshots, a changed source, wrong hashes, wrong pages/excerpts, wrong company/document and relabelled report years. They do not check whether a number was transcribed correctly from prose or whether accounting metadata is semantically supported. They cannot defend against a local actor rewriting code, manifest and all corresponding source copies.

`synthetic_fixture` is deliberately distinct from `human_verified`; no reviewer identity is invented. `verified_by` is null, and candidate/real/human-verified statuses are refused in this workflow. Real fact calculations will require an actual review process and storage/permission design. Changing the label is not an implementation of that process.

The pure finance functions validate arithmetic and comparable metadata. They expect already source-checked facts; application callers must use the workflow, not treat constructing a dataclass as source verification. Retrieval now also checks source/snapshot equality before filtering; see [RETRIEVAL_INTEGRITY](RETRIEVAL_INTEGRITY.md).

## Observed failures and regression evidence

The initial CLI acceptance test failed because `calculate` did not exist. During boundary review, the first implementation accepted a UTF-16 manifest, allowed the fixture's year to be relabelled while retaining a 2024 source, and raised an unhandled recursion error on deeply nested JSON. Tests reproduced all three before the fix. Explicit UTF-8 decoding, recursion-error translation and source-year agreement now reject them with typed failures and no result.

The initial E1 suite had 51 tests: the original 27 and 24 financial tests. These include literal hand-computed ratios, scale normalization, signs, missing/nonfinite inputs, context isolation, display rounding, all comparison dimensions, source/index drift, path containment, malformed fixtures and complete CLI provenance. These are synthetic engineering checks, not a real financial accuracy denominator. Current counts are in STATUS.

A further context-isolation test set the process-wide Decimal DefaultContext Inexact trap: recurring division then raised Inexact despite local precision settings. The numeric context now explicitly specifies traps as well as precision/rounding/exponent settings. The regression verifies both active-context and default-context isolation.

Publication follow-up: a 600-level list in a scalar fact field could pass JSON parsing and then fail during recursive dataclass serialization before type validation. Validation now inspects fields without serialization and bounds verifier identities before any asdict call. `test_nested_wrong_types_refuse_before_recursive_dataclass_copy` reproduces the old RecursionError and now receives INVALID_FACT. That release's complete suite was 51 tests.

The later bebb865 review found malformed Unicode in basis/scope could survive source checks and crash calculation-ID encoding. Fact construction now rejects invalid Unicode scalar text before serialization, including optional verifier text; valid non-BMP characters are preserved. Financial text errors use INVALID_FACT, while source filenames retain INVALID_PATH. Five added regressions brought that release to 70 tests. See INPUT_BOUNDARIES for the red/green observations.

The revenue-growth extension adds 14 test methods. Before implementation they failed on the absent function, CLI operation and prior-year fixtures. The first implemented run exposed a test-fixture overlap: a same-year test also reused an ID, so identity conflict correctly preceded period refusal. Giving the period test a distinct ID isolates its intended boundary. The old year-relabel test now alters only its original 2024 records; relabelling the new 2023 records as well created duplicate selectors and hid the original source-year check. Its SOURCE_MISMATCH assertion is retained. The missing-fact test uses 2022, while 2023 without its import explicitly checks SOURCE_MISMATCH. No old test methods or error assertions were removed.

Targeted growth: 14 passed in 1.431s. Full suite, including seven retrieval integrity regressions: 91 passed in 12.540s on macOS/Python 3.12.2. These are engineering tests, not financial-quality metrics; exact remote CI must be checked separately.
