"""Simplified but realistic Iranian payroll computation for demo documents."""

from __future__ import annotations

# Fixed statutory allowances (approx. 1404 figures, demo only)
HOUSING_ALLOWANCE = 9_000_000        # حق مسکن
FOOD_ALLOWANCE = 14_000_000          # بن کارگری / خواروبار
CHILD_ALLOWANCE_PER = 7_000_000      # حق اولاد به ازای هر فرزند

MONTHLY_HOURS = 192                  # ساعت کاری ماهانه پایه
OVERTIME_FACTOR = 1.4                # ضریب اضافه‌کاری
INSURANCE_RATE = 0.07                # سهم کارگر بیمه تأمین اجتماعی

# مالیات بر حقوق (ساده‌سازی پلکانی)
TAX_EXEMPT_THRESHOLD = 120_000_000   # معافیت ماهانه
TAX_RATE = 0.10


def _overtime_pay(base: int, overtime_h: int) -> int:
    hourly = base / MONTHLY_HOURS
    return int(round(hourly * OVERTIME_FACTOR * overtime_h))


def _income_tax(taxable_gross: int) -> int:
    if taxable_gross <= TAX_EXEMPT_THRESHOLD:
        return 0
    return int(round((taxable_gross - TAX_EXEMPT_THRESHOLD) * TAX_RATE))


def compute_payslip(emp: dict) -> dict:
    """Return a full earnings/deductions/net breakdown for one employee."""
    base = int(emp.get("base", 0))
    overtime_h = int(emp.get("overtime_h", 0))
    children = int(emp.get("children", 1))

    housing = HOUSING_ALLOWANCE
    food = FOOD_ALLOWANCE
    child = CHILD_ALLOWANCE_PER * max(0, children)
    overtime_pay = _overtime_pay(base, overtime_h)

    gross = base + housing + food + child + overtime_pay

    # Insurance applies to base + overtime (not the non-cash allowances, simplified)
    insurance = int(round((base + overtime_pay) * INSURANCE_RATE))
    taxable = base + overtime_pay - insurance
    tax = _income_tax(taxable)
    deductions_total = insurance + tax
    net = gross - deductions_total

    return {
        "base": base,
        "housing": housing,
        "food": food,
        "child": child,
        "overtime_pay": overtime_pay,
        "gross": gross,
        "insurance": insurance,
        "tax": tax,
        "deductions_total": deductions_total,
        "net": net,
    }
