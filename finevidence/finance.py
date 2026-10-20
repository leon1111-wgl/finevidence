"""Deterministic financial arithmetic; no formula evaluation or model calls."""

from dataclasses import asdict
from decimal import Decimal, localcontext
import hashlib
import json

from .facts import FinancialFact, FinanceError, decimal_context


def gross_margin(gross_profit: FinancialFact, revenue: FinancialFact) -> dict:
    """Calculate a fixture ratio after checking comparable input facts.

    Application callers must first load facts with source checks. This pure function
    checks their arithmetic/metadata contract; it does not perform human review.
    """
    if gross_profit.metric != "gross_profit" or revenue.metric != "revenue":
        raise FinanceError("INVALID_OPERANDS: require gross_profit then revenue")
    if gross_profit.fact_id == revenue.fact_id:
        raise FinanceError("FACT_CONFLICT: distinct input fact identities required")
    for fact in (gross_profit, revenue):
        if fact.verification_status != "synthetic_fixture" or fact.verified_by is not None:
            raise FinanceError("FACT_UNVERIFIED: only explicitly synthetic fixtures are enabled")
    for field in ("company", "period_start", "period_end", "report_type", "currency",
                  "accounting_basis", "consolidation_scope"):
        if getattr(gross_profit, field) != getattr(revenue, field):
            raise FinanceError(f"INCOMPARABLE_FACTS: {field} differs")
    with localcontext(decimal_context()):
        numerator, denominator = gross_profit.normalized_value, revenue.normalized_value
        if denominator == 0:
            raise FinanceError("ZERO_DENOMINATOR: revenue is zero")
        if denominator < 0:
            raise FinanceError("NEGATIVE_REVENUE: negative revenue is outside the supported margin policy")
        ratio = numerator / denominator
        display = (ratio * 100).quantize(Decimal("0.01"))
    policy = {"version": "gross_margin_v1", "precision": 50, "rounding": "ROUND_HALF_EVEN",
              "display_decimal_places": 2}
    identity = json.dumps({"inputs": [asdict(gross_profit), asdict(revenue)], "policy": policy},
                          sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return {
        "calc_id": "calc_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "operation": "gross_margin", "formula": "gross_profit / revenue",
        "input_fact_ids": {"gross_profit": gross_profit.fact_id, "revenue": revenue.fact_id},
        "normalized_inputs": {"gross_profit": format(numerator, "f"), "revenue": format(denominator, "f")},
        "value": format(ratio, "f"), "unit": "ratio", "display": f"{display:.2f}%",
        "numeric_policy": policy,
    }


def revenue_growth(current: FinancialFact, prior: FinancialFact) -> dict:
    """Compare adjacent full calendar years; source verification belongs to the loader."""
    if current.metric != "revenue" or prior.metric != "revenue":
        raise FinanceError("INVALID_OPERANDS: require current and prior revenue")
    if current.fact_id == prior.fact_id:
        raise FinanceError("FACT_CONFLICT: distinct input fact identities required")
    for fact in (current, prior):
        if fact.verification_status != "synthetic_fixture" or fact.verified_by is not None:
            raise FinanceError("FACT_UNVERIFIED: only explicitly synthetic fixtures are enabled")
        year = fact.period_start[:4]
        if (fact.report_type != "annual" or fact.period_start != f"{year}-01-01"
                or fact.period_end != f"{year}-12-31"):
            raise FinanceError("INCOMPARABLE_FACTS: growth requires complete calendar years")
    if int(current.period_start[:4]) != int(prior.period_start[:4]) + 1:
        raise FinanceError("INCOMPARABLE_FACTS: growth requires adjacent years in current/prior order")
    for field in ("company", "currency", "accounting_basis", "consolidation_scope"):
        if getattr(current, field) != getattr(prior, field):
            raise FinanceError(f"INCOMPARABLE_FACTS: {field} differs")
    with localcontext(decimal_context()):
        current_value, prior_value = current.normalized_value, prior.normalized_value
        if prior_value == 0:
            raise FinanceError("ZERO_DENOMINATOR: prior revenue is zero")
        if prior_value < 0:
            raise FinanceError("NEGATIVE_BASE: growth from negative prior revenue is unsupported")
        if current_value < 0:
            raise FinanceError("NEGATIVE_REVENUE: negative current revenue is unsupported")
        delta = current_value - prior_value
        ratio = delta / prior_value
        display = (ratio * 100).quantize(Decimal("0.01"))
    policy = {"version": "revenue_growth_v1", "precision": 50, "rounding": "ROUND_HALF_EVEN",
              "display_decimal_places": 2, "period": "adjacent_calendar_years",
              "prior_revenue": "positive", "current_revenue": "nonnegative"}
    identity = json.dumps({"inputs": [asdict(current), asdict(prior)], "policy": policy},
                          sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return {
        "calc_id": "calc_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "operation": "revenue_growth", "formula": "(current_revenue - prior_revenue) / prior_revenue",
        "input_fact_ids": {"current_revenue": current.fact_id, "prior_revenue": prior.fact_id},
        "normalized_inputs": {"current_revenue": format(current_value, "f"),
                              "prior_revenue": format(prior_value, "f")},
        "absolute_change": format(delta, "f"), "currency": current.currency,
        "value": format(ratio, "f"), "unit": "ratio", "display": f"{display:.2f}%",
        "numeric_policy": policy,
    }
