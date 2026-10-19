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
