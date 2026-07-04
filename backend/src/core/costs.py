"""Naive LLM-cost estimator.

Real cost data should come from a live pricing table; this is a stub.
"""

from decimal import Decimal

# USD per 1K tokens — rough public pricing (input, output)
PRICING: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o":        (Decimal("0.005"),  Decimal("0.015")),
    "gpt-4o-mini":   (Decimal("0.00015"), Decimal("0.0006")),
    "gpt-4-turbo":   (Decimal("0.01"),    Decimal("0.03")),
    "claude-3-5-sonnet": (Decimal("0.003"), Decimal("0.015")),
    "claude-3-haiku":    (Decimal("0.00025"), Decimal("0.00125")),
    "claude-opus-4-7":   (Decimal("0.015"), Decimal("0.075")),
    "claude-opus-4-8":   (Decimal("0.015"), Decimal("0.075")),
}

DEFAULT = (Decimal("0.001"), Decimal("0.002"))


def estimate_cost(model_name: str, tokens_in: int, tokens_out: int) -> Decimal:
    in_price, out_price = PRICING.get(model_name, DEFAULT)
    return (Decimal(tokens_in) / 1000 * in_price) + (Decimal(tokens_out) / 1000 * out_price)
