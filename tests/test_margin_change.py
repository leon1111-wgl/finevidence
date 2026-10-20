"""Percentage-point arithmetic, independent literal oracles and refusal policies."""

from dataclasses import replace
from decimal import Decimal, Inexact, ROUND_DOWN, localcontext
import unittest

from finevidence import finance
from finevidence.facts import FinanceError
from test_finance import fact


def operands(current_profit="36", current_revenue="120", prior_profit="25", prior_revenue="100"):
    return tuple(fact(metric, value, fact_id=f"syn_{year}_{metric}",
                      period_start=f"{year}-01-01", period_end=f"{year}-12-31")
                 for year, metric, value in (
                     (2024, "gross_profit", current_profit), (2024, "revenue", current_revenue),
                     (2023, "gross_profit", prior_profit), (2023, "revenue", prior_revenue)))


class MarginChangeTests(unittest.TestCase):
    def calculate(self, inputs):
        operation = getattr(finance, "gross_margin_change", None)
        self.assertTrue(callable(operation), "gross_margin_change is not implemented")
        return operation(*inputs)

    def test_literal_increase_decline_zero_and_negative_profit(self):
        for values, points, display in (
            (("36", "120", "25", "100"), "5", "5.00 pp"),
            (("20", "80", "30", "100"), "-5", "-5.00 pp"),
            (("30", "100", "30", "100"), "0", "0.00 pp"),
            (("-10", "100", "10", "100"), "-20", "-20.00 pp"),
            (("0", "100", "-10", "100"), "10", "10.00 pp"),
            (("150", "100", "25", "100"), "125", "125.00 pp"),
        ):
            with self.subTest(values=values):
                result = self.calculate(operands(*values))
                self.assertEqual(Decimal(result["value"]), Decimal(points))
                self.assertEqual(result["display"], display)
                self.assertEqual(result["unit"], "percentage_points")
        result = self.calculate(operands())
        self.assertEqual(result["component_margins"]["current"]["display"], "30.00%")
        self.assertEqual(result["component_margins"]["prior"]["display"], "25.00%")

    def test_each_operand_scale_is_normalized(self):
        inputs = list(operands())
        inputs[0] = replace(inputs[0], raw_value="36000", unit_scale="1000")
        inputs[1] = replace(inputs[1], raw_value="0.12", unit_scale="1000000000")
        inputs[2] = replace(inputs[2], raw_value="25000000", unit_scale="1")
        result = self.calculate(inputs)
        self.assertEqual(result["display"], "5.00 pp")
        self.assertEqual({k: Decimal(v) for k, v in result["normalized_inputs"].items()},
                         {"current_gross_profit": Decimal("36000000"),
                          "current_revenue": Decimal("120000000"),
                          "prior_gross_profit": Decimal("25000000"),
                          "prior_revenue": Decimal("100000000")})

    def test_subtracts_raw_ratios_not_rounded_percent_displays(self):
        result = self.calculate(operands("12346", "100000", "12344", "100000"))
        self.assertEqual(Decimal(result["value"]), Decimal("0.002"))
        self.assertEqual(result["display"], "0.00 pp")
        self.assertEqual(result["component_margins"]["current"]["display"], "12.35%")
        self.assertEqual(result["component_margins"]["prior"]["display"], "12.34%")

    def test_near_equal_large_inputs_do_not_cancel_to_false_zero(self):
        result = self.calculate(operands(
            "999999999999999999.999999999998", "999999999999999999.999999999999",
            "999999999999999999.999999999997", "999999999999999999.999999999998"))
        # Consecutive integer coefficients give a cross-product difference of one.
        self.assertGreater(Decimal(result["value"]), Decimal("1e-58"))
        self.assertLess(Decimal(result["value"]), Decimal("2e-58"))
        self.assertEqual(result["display"], "0.00 pp")

    def test_zero_and_negative_revenue_refuse_in_either_year(self):
        for position in (1, 3):
            for value, code in (("0", "ZERO_DENOMINATOR"), ("-0.0", "ZERO_DENOMINATOR"),
                                ("-1", "NEGATIVE_REVENUE")):
                with self.subTest(position=position, value=value):
                    inputs = list(operands()); inputs[position] = replace(inputs[position], raw_value=value)
                    with self.assertRaisesRegex(FinanceError, code):
                        self.calculate(inputs)

    def test_metadata_must_match_within_and_across_years(self):
        for edit in ({"company": "Other"}, {"currency": "HKD"},
                     {"accounting_basis": "IFRS"}, {"consolidation_scope": "consolidated"}):
            for positions in ((0,), (2,), (2, 3)):
                with self.subTest(edit=edit, positions=positions):
                    inputs = list(operands())
                    for position in positions:
                        inputs[position] = replace(inputs[position], **edit)
                    with self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
                        self.calculate(inputs)

    def test_periods_are_complete_adjacent_calendar_years_in_current_first_order(self):
        for edit in (
            {"period_start": "2022-01-01", "period_end": "2022-12-31"},
            {"period_start": "2024-01-01", "period_end": "2024-12-31"},
            {"period_start": "2025-01-01", "period_end": "2025-12-31"},
            {"period_start": "2023-04-01"}, {"period_end": "2023-09-30"},
            {"period_start": "2022-04-01", "period_end": "2023-03-31"},
            {"report_type": "quarterly"},
        ):
            inputs = list(operands())
            inputs[2:] = [replace(f, **edit) for f in inputs[2:]]
            with self.subTest(edit=edit), self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
                self.calculate(inputs)
        inputs = list(operands()); inputs[0] = replace(inputs[0], period_end="2024-09-30")
        with self.assertRaisesRegex(FinanceError, "INCOMPARABLE_FACTS"):
            self.calculate(inputs)

    def test_metrics_identities_and_verification_are_checked_for_all_four_inputs(self):
        for position in range(4):
            for edit, code in (
                ({"metric": "revenue" if position % 2 == 0 else "gross_profit"}, "INVALID_OPERANDS"),
                ({"fact_id": operands()[(position + 1) % 4].fact_id}, "FACT_CONFLICT"),
                ({"verification_status": "candidate"}, "FACT_UNVERIFIED"),
                ({"verification_status": "human_verified", "verified_by": "invented"}, "FACT_UNVERIFIED"),
            ):
                inputs = list(operands()); inputs[position] = replace(inputs[position], **edit)
                with self.subTest(position=position, edit=edit), self.assertRaisesRegex(FinanceError, code):
                    self.calculate(inputs)

    def test_half_even_display_and_context_isolation(self):
        with localcontext() as ctx:
            ctx.prec = 3; ctx.rounding = ROUND_DOWN; ctx.traps[Inexact] = True
            for profit, display in (("12.345", "12.34 pp"), ("12.355", "12.36 pp"),
                                    ("-0.004", "0.00 pp")):
                self.assertEqual(self.calculate(operands(profit, "100", "0", "100"))["display"], display)
            self.assertEqual(ctx.prec, 3)
            self.assertEqual(ctx.rounding, ROUND_DOWN)
            self.assertTrue(ctx.traps[Inexact])

    def test_replay_identity_binds_every_source_and_value(self):
        inputs = operands(); result = self.calculate(inputs)
        self.assertEqual(result, self.calculate(inputs))
        self.assertEqual(set(result["input_fact_ids"].values()), {f.fact_id for f in inputs})
        for position in range(4):
            for edit in ({"raw_value": "50"}, {"source_sha256": "b" * 64}):
                changed = list(inputs); changed[position] = replace(changed[position], **edit)
                self.assertNotEqual(result["calc_id"], self.calculate(changed)["calc_id"])


if __name__ == "__main__":
    unittest.main()
