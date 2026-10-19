# Gross-margin contract and trust model

Implemented 2026-10-20: one E1 vertical slice, entirely synthetic. It does not complete E1 or establish real-report quality.

## Data flow

`cli.main` → `workflow.calculate_margin` → `facts.load_fixture_facts` → `finance.gross_margin` → response with facts, calculation and original citations.

`data/facts/synthetic.json` contains four authored facts. The loader reads at most 64 KiB of UTF-8 JSON and at most 32 facts. It validates shape, unique identities/selectors, fixed-point values, dates and explicit metadata; selects one calendar-year revenue/gross-profit pair; re-reads the original documents; compares them with the imported snapshots and recorded hashes; and matches each full paragraph on its synthetic page. A missing or inconsistent pair cannot fall back to a different company/year. No input is interpreted as SQL, code or a formula.

For Aurora Orchard, revenue `120 × 1000000 = 120000000 USD` and gross profit `36 × 1000000 = 36000000 USD` produce `36000000 / 120000000 = 0.3`. `30.00%` is a display value; the ratio string and policy remain in the calculation. A content-derived calculation ID covers both fact records and numeric policy. It is a reproducibility identifier, not a signature or authorization token.

## Numeric and comparison policy

- Decimal input: at most 18 integral digits and 12 fractional digits. No float, boolean, missing value, exponent, nonfinite value or implicit separator parsing.
- Scale: explicit multiplier `1`, `1000`, `1000000` or `1000000000`. Normalize before dividing; preserve the raw value and scale.
- Equality required: company, period start/end, report type, currency, accounting basis and consolidation scope. Currency codes have a three-uppercase-letter syntax check, not an ISO registry lookup. No currency conversion.
- Zero revenue: refuse. Negative revenue: refuse under this initial policy. Negative gross profit: retain the negative ratio. Do not clamp unusual ratios into 0–100%.
- Arithmetic: isolated Decimal context, 50 significant digits, half-even rounding. Display: percentage with two fractional digits. No early input rounding. This precision exceeds the exact normalized input length under the declared bounds, but division can still recur.
- Current CLI: same-report-year calendar-year annual facts only. Comparative columns, non-calendar financial years and prior-year negative-base interpretation require a separate extension and tests.

## Evidence boundary

The fixture manifest and checked-out code are trusted local development artifacts. Source checks detect stale snapshots, a changed source, wrong hashes, wrong pages/excerpts, wrong company/document and relabelled report years. They do not check whether a number was transcribed correctly from prose or whether accounting metadata is semantically supported. They cannot defend against a local actor rewriting code, manifest and all corresponding source copies.

`synthetic_fixture` is deliberately distinct from `human_verified`; no reviewer identity is invented. `verified_by` is null, and candidate/real/human-verified statuses are refused in this workflow. Real fact calculations will require an actual review process and storage/permission design. Changing the label is not an implementation of that process.

The pure `gross_margin` function validates arithmetic and comparable metadata. It expects already source-checked facts; application callers must use the workflow, not treat constructing a dataclass as source verification. Ordinary retrieval still reads its local snapshot without the new calculation-specific original-byte recheck (FE-004 remains open for retrieval).

## Observed failures and regression evidence

The initial CLI acceptance test failed because `calculate` did not exist. During boundary review, the first implementation accepted a UTF-16 manifest, allowed the fixture's year to be relabelled while retaining a 2024 source, and raised an unhandled recursion error on deeply nested JSON. Tests reproduced all three before the fix. Explicit UTF-8 decoding, recursion-error translation and source-year agreement now reject them with typed failures and no result.

`python -m unittest discover -s tests -v` runs 50 tests: the original 27 and 23 financial tests. These include literal hand-computed ratios, scale normalization, signs, missing/nonfinite inputs, context isolation, display rounding, all comparison dimensions, source/index drift, path containment, malformed fixtures and complete CLI provenance. These are synthetic engineering checks, not a real financial accuracy denominator.

A further context-isolation test set the process-wide Decimal DefaultContext Inexact trap: recurring division then raised Inexact despite local precision settings. The numeric context now explicitly specifies traps as well as precision/rounding/exponent settings. The regression verifies both active-context and default-context isolation.
