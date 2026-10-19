"""Literal arithmetic oracles, comparability boundaries and Decimal isolation."""

from dataclasses import replace
from decimal import DefaultContext, Inexact, ROUND_DOWN, localcontext
import unittest

from finevidence.facts import FinancialFact, FinanceError
from finevidence.finance import gross_margin


def fact(metric, value, **changes):
    fields = dict(
        fact_id=f"syn_aurora_2024_{metric}", company="Aurora Orchard", metric=metric,
        period_start="2024-01-01", period_end="2024-12-31", report_type="annual",
        raw_value=value, currency="USD", unit_scale="1000000",
        accounting_basis="synthetic_simplified", consolidation_scope="standalone",
        doc_id="syn_aurora_2024", source_file="aurora_2024.json", source_sha256="a" * 64,
        page=1, source_excerpt="SYNTHETIC test values; no real financial evidence.",
        verification_status="synthetic_fixture", verified_by=None,
    )
    fields.update(changes)
    return FinancialFact(**fields)


class FinanceTests(unittest.TestCase):
    def test_ratios_zero_and_negative_profit_preserve_sign(self):
        for profit, revenue, expected, display in (
            ("36", "120", "0.3", "30.00%"), ("0", "120", "0", "0.00%"),
            ("-12", "120", "-0.1", "-10.00%"),
            ("0.1", "0.3", "0.33333333333333333333333333333333333333333333333333", "33.33%"),
        ):
            result = gross_margin(fact("gross_profit", profit), fact("revenue", revenue))
            self.assertEqual(result["value"], expected)
            self.assertEqual(result["display"], display)

    def test_explicit_unit_scaling_before_division(self):
        result = gross_margin(fact("gross_profit", "36000", unit_scale="1000"),
                              fact("revenue", "0.12", unit_scale="1000000000"))
        self.assertEqual(result["value"], "0.3")
        self.assertEqual(result["normalized_inputs"], {"gross_profit": "36000000", "revenue": "120000000.00"})

    def test_zero_and_negative_revenue_refuse(self):
        for value, code in (("0", "ZERO_DENOMINATOR"), ("-0.0", "ZERO_DENOMINATOR"),
                            ("-120", "NEGATIVE_REVENUE")):
            with self.assertRaisesRegex(FinanceError, code):
                gross_margin(fact("gross_profit", "36"), fact("revenue", value))

    def test_missing_nonfinite_float_and_unbounded_values_refuse(self):
        for value in (None, True, 0.1, 36, "", "NaN", "sNaN", "Infinity", "-Infinity",
                      "1e999999999", "1_000", " 36", "9" * 19, "0." + "1" * 13):
            with self.subTest(value=value), self.assertRaisesRegex(FinanceError, "INVALID_FACT"):
                gross_margin(fact("gross_profit", value), fact("revenue", "120"))

    def test_unknown_units_and_missing_basis_refuse(self):
        for override in ({"unit_scale": "million"}, {"unit_scale": "0"},
                         {"currency": ""}, {"currency": "unknown"},
                         {"accounting_basis": "unknown"}, {"consolidation_scope": ""}):
            with self.subTest(override=override), self.assertRaisesRegex(FinanceError, "INVALID_FACT"):
                gross_margin(fact("gross_profit", "36", **override), fact("revenue", "120"))

    def test_nested_wrong_types_refuse_before_recursive_dataclass_copy(self):
        nested = "not a field value"
        for _ in range(600):
            nested = [nested]
        for field in ("raw_value", "verified_by"):
            with self.assertRaisesRegex(FinanceError, "INVALID_FACT"):
                if field == "raw_value":
                    fact("gross_profit", nested)
                else:
                    fact("gross_profit", "36", verified_by=nested)

    def test_each_incompatible_dimension_refuses_comparison(self):
        for override in ({"company": "Harbor Lantern"}, {"currency": "HKD"},
                         {"period_start": "2024-04-01"}, {"period_end": "2024-09-30"},
                         {"report_type": "quarterly"}, {"accounting_basis": "IFRS"},
                         {"consolidation_scope": "consolidated"}):
            with self.subTest(override=override), self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
                gross_margin(fact("gross_profit", "36", **override), fact("revenue", "120"))

    def test_bad_dates_reject_including_noncanonical_and_reversed(self):
        for start, end in (("2024-02-30", "2024-12-31"), ("20240101", "2024-12-31"),
                           ("2025-01-01", "2024-12-31")):
            with self.subTest(start=start), self.assertRaisesRegex(FinanceError, "INVALID_FACT"):
                fact("gross_profit", "36", period_start=start, period_end=end)

    def test_wrong_metric_order_and_duplicate_identity_refuse(self):
        profit, revenue = fact("gross_profit", "36"), fact("revenue", "120")
        with self.assertRaisesRegex(FinanceError, "INVALID_OPERANDS"):
            gross_margin(revenue, profit)
        with self.assertRaisesRegex(FinanceError, "FACT_CONFLICT"):
            gross_margin(profit, replace(revenue, fact_id=profit.fact_id))

    def test_decimal_context_does_not_change_results_or_leak(self):
        with localcontext() as ctx:
            ctx.prec = 3
            ctx.rounding = ROUND_DOWN
            ctx.traps[Inexact] = True
            result = gross_margin(fact("gross_profit", "1"), fact("revenue", "3"))
            self.assertEqual(result["value"], "0.33333333333333333333333333333333333333333333333333")
            self.assertEqual(result["display"], "33.33%")
            self.assertEqual(ctx.prec, 3)
            self.assertEqual(ctx.rounding, ROUND_DOWN)
            self.assertTrue(ctx.traps[Inexact])
        previous = DefaultContext.traps[Inexact]
        try:
            DefaultContext.traps[Inexact] = True
            result = gross_margin(fact("gross_profit", "1"), fact("revenue", "3"))
            self.assertEqual(result["display"], "33.33%")
        finally:
            DefaultContext.traps[Inexact] = previous

    def test_display_rounding_is_half_even_and_does_not_round_input(self):
        for value, expected in (("0.12345", "12.34%"), ("0.12355", "12.36%")):
            result = gross_margin(fact("gross_profit", value), fact("revenue", "1"))
            self.assertEqual(result["display"], expected)
            self.assertEqual(result["value"], value)


if __name__ == "__main__":
    unittest.main()
