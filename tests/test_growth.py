"""Independent numeric examples and annual-comparison refusal policies."""

from dataclasses import replace
from decimal import Inexact, ROUND_DOWN, localcontext
import unittest

from finevidence import finance
from finevidence.facts import FinanceError
from test_finance import fact


def revenue(year, value, **changes):
    return fact("revenue", value, fact_id=f"syn_revenue_{year}",
                period_start=f"{year}-01-01", period_end=f"{year}-12-31", **changes)


class RevenueGrowthTests(unittest.TestCase):
    def test_literal_growth_decline_unchanged_and_zero_current(self):
        for current, prior, value, display, delta in (
            ("120", "100", "0.2", "20.00%", "20000000"),
            ("80", "100", "-0.2", "-20.00%", "-20000000"),
            ("100", "100", "0", "0.00%", "0"),
            ("0", "100", "-1", "-100.00%", "-100000000"),
            ("4", "3", "0.33333333333333333333333333333333333333333333333333",
             "33.33%", "1000000"),
        ):
            with self.subTest(current=current, prior=prior):
                result = finance.revenue_growth(revenue(2024, current), revenue(2023, prior))
                self.assertEqual(result["value"], value)
                self.assertEqual(result["display"], display)
                self.assertEqual(result["absolute_change"], delta)
                self.assertEqual(result["currency"], "USD")

    def test_different_scales_normalize_before_subtraction(self):
        result = finance.revenue_growth(revenue(2024, "120000", unit_scale="1000"),
                                        revenue(2023, "0.1", unit_scale="1000000000"))
        self.assertEqual(result["value"], "0.2")
        self.assertEqual(result["normalized_inputs"],
                         {"current_revenue": "120000000", "prior_revenue": "100000000.0"})

    def test_zero_negative_prior_and_negative_current_refuse(self):
        for current, prior, code in (
            ("120", "0", "ZERO_DENOMINATOR"), ("120", "-0.0", "ZERO_DENOMINATOR"),
            ("120", "-100", "NEGATIVE_BASE"), ("-5", "100", "NEGATIVE_REVENUE"),
        ):
            with self.subTest(code=code), self.assertRaisesRegex(FinanceError, code):
                finance.revenue_growth(revenue(2024, current), revenue(2023, prior))

    def test_only_adjacent_complete_calendar_years_are_comparable(self):
        current, prior = revenue(2024, "120"), revenue(2023, "100")
        for other in (
            revenue(2022, "100"),
            replace(prior, period_start="2024-01-01", period_end="2024-12-31"),
            revenue(2025, "100"),
            replace(prior, period_start="2023-04-01"),
            replace(prior, period_end="2023-09-30"),
            replace(prior, report_type="quarterly"),
            replace(prior, period_start="2022-04-01", period_end="2023-03-31"),
        ):
            with self.subTest(other=other), self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
                finance.revenue_growth(current, other)
        # 2024 is a leap year; comparing full years must not require equal day counts.
        self.assertEqual(finance.revenue_growth(current, prior)["display"], "20.00%")

    def test_company_currency_basis_and_scope_must_match(self):
        for edit in ({"company": "Harbor Lantern"}, {"currency": "HKD"},
                     {"accounting_basis": "IFRS"}, {"consolidation_scope": "consolidated"}):
            with self.subTest(edit=edit), self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
                finance.revenue_growth(revenue(2024, "120"), revenue(2023, "100", **edit))

    def test_rejects_wrong_metrics_duplicate_ids_and_fake_verification(self):
        current, prior = revenue(2024, "120"), revenue(2023, "100")
        for changed, code in (
            (replace(prior, metric="gross_profit"), "INVALID_OPERANDS"),
            (replace(prior, fact_id=current.fact_id), "FACT_CONFLICT"),
            (replace(prior, verification_status="candidate"), "FACT_UNVERIFIED"),
            (replace(prior, verification_status="human_verified", verified_by="invented"), "FACT_UNVERIFIED"),
        ):
            with self.subTest(code=code), self.assertRaisesRegex(FinanceError, code):
                finance.revenue_growth(current, changed)

    def test_rounding_is_half_even_and_caller_context_is_isolated(self):
        with localcontext() as ctx:
            ctx.prec = 3
            ctx.rounding = ROUND_DOWN
            ctx.traps[Inexact] = True
            for value, display in (("1.12345", "12.34%"), ("1.12355", "12.36%")):
                result = finance.revenue_growth(revenue(2024, value), revenue(2023, "1"))
                self.assertEqual(result["display"], display)
            self.assertEqual(ctx.prec, 3)
            self.assertTrue(ctx.traps[Inexact])

    def test_replay_identity_binds_both_inputs_and_policy(self):
        current, prior = revenue(2024, "120"), revenue(2023, "100")
        result = finance.revenue_growth(current, prior)
        self.assertEqual(result, finance.revenue_growth(current, prior))
        self.assertEqual(result["input_fact_ids"],
                         {"current_revenue": "syn_revenue_2024", "prior_revenue": "syn_revenue_2023"})
        for other in (replace(prior, raw_value="90"), replace(prior, source_sha256="b" * 64)):
            self.assertNotEqual(result["calc_id"], finance.revenue_growth(current, other)["calc_id"])


if __name__ == "__main__":
    unittest.main()
