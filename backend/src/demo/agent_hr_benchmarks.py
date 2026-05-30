"""HR cost benchmarks per agent domain — savings vs equivalent employee."""

from __future__ import annotations

from typing import Any

# Monthly gross salary (IRR) for equivalent full-time role in Iran (demo benchmarks).
# Working month: 176 hours (22 × 8).
USD_TO_IRR = 620_000

_PROFILE_BENCHMARKS: dict[str, dict[str, Any]] = {
    "payroll": {
        "role_title": "کارشناس حقوق و دستمزد",
        "monthly_salary_irr": 95_000_000,
        "minutes_per_run": 50,
        "demo_monthly_runs": 28,
    },
    "invoice": {
        "role_title": "کارشناس حسابداری / فاکتور",
        "monthly_salary_irr": 88_000_000,
        "minutes_per_run": 35,
        "demo_monthly_runs": 40,
    },
    "karkard": {
        "role_title": "کارشناس کارگزینی / کارکرد",
        "monthly_salary_irr": 82_000_000,
        "minutes_per_run": 120,
        "demo_monthly_runs": 12,
    },
    "bank_recon": {
        "role_title": "حسابدار تطبیق بانکی",
        "monthly_salary_irr": 90_000_000,
        "minutes_per_run": 40,
        "demo_monthly_runs": 30,
    },
    "support": {
        "role_title": "کارشناس پشتیبانی مشتری",
        "monthly_salary_irr": 65_000_000,
        "minutes_per_run": 25,
        "demo_monthly_runs": 120,
    },
    "resume": {
        "role_title": "کارشناس جذب و استخدام",
        "monthly_salary_irr": 78_000_000,
        "minutes_per_run": 30,
        "demo_monthly_runs": 45,
    },
    "api": {
        "role_title": "کارشناس یکپارچه‌سازی / DevOps",
        "monthly_salary_irr": 120_000_000,
        "minutes_per_run": 20,
        "demo_monthly_runs": 60,
    },
    "supervisor": {
        "role_title": "سرپرست عملیات / هماهنگ‌کننده",
        "monthly_salary_irr": 105_000_000,
        "minutes_per_run": 15,
        "demo_monthly_runs": 80,
    },
    "file_intake": {
        "role_title": "کارشناس ورود داده / بایگانی",
        "monthly_salary_irr": 58_000_000,
        "minutes_per_run": 20,
        "demo_monthly_runs": 50,
    },
    "generic_chat": {
        "role_title": "کارشناس اداری (پاسخ‌گویی)",
        "monthly_salary_irr": 62_000_000,
        "minutes_per_run": 18,
        "demo_monthly_runs": 35,
    },
}

_DOMAIN_LABELS: dict[str, str] = {
    "payroll": "مالی · حقوق و دستمزد",
    "invoice": "مالی · فاکتور و دریافت",
    "karkard": "منابع انسانی · کارکرد",
    "bank_recon": "مالی · مغایرت بانکی",
    "support": "پشتیبانی · تیکت",
    "resume": "منابع انسانی · جذب",
    "api": "عملیات · یکپارچه‌سازی API",
    "supervisor": "عملیات · سرپرست ایجنت",
    "file_intake": "عملیات · دریافت فایل",
    "generic_chat": "عمومی · گفت‌وگو",
}

_PANEL_TITLES: dict[str, str] = {
    "payroll": "پنل حقوق و دستمزد",
    "invoice": "پنل فاکتور و دریافت",
    "karkard": "پنل کارکرد پرسنل",
    "bank_recon": "پنل تطبیق بانکی",
    "support": "پنل پشتیبانی",
    "resume": "پنل جذب و رزومه",
    "api": "پنل یکپارچه‌سازی API",
    "supervisor": "پنل مسیریابی ایجنت",
    "file_intake": "پنل دریافت فایل",
    "generic_chat": "پنل فعالیت گفت‌وگو",
}


def domain_label_for_profile(profile_key: str) -> str:
    return _DOMAIN_LABELS.get(profile_key, "عملیات · ایجنت")


def panel_title_for_profile(profile_key: str, agent_name: str) -> str:
    return _PANEL_TITLES.get(profile_key, f"پنل {agent_name}")


def _format_irr(amount: float) -> str:
    n = int(round(amount))
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.1f} میلیارد ریال"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.0f} میلیون ریال"
    if n >= 1_000:
        return f"{n / 1_000:.0f} هزار ریال"
    return f"{n:,} ریال"


def _format_hours(hours: float) -> str:
    if hours < 1:
        return f"{int(round(hours * 60))} دقیقه"
    if hours < 24:
        return f"{hours:.1f} ساعت"
    return f"{hours / 8:.1f} روز کاری"


def compute_hr_savings(profile_key: str, stats: dict[str, int | float]) -> dict[str, Any]:
    bench = _PROFILE_BENCHMARKS.get(profile_key, _PROFILE_BENCHMARKS["generic_chat"])
    monthly = int(bench["monthly_salary_irr"])
    hourly_irr = monthly / 176.0
    minutes_per_run = float(bench["minutes_per_run"])

    total_runs = int(stats.get("total") or 0)
    uses_live = total_runs > 0
    runs = total_runs if uses_live else int(bench["demo_monthly_runs"])

    tokens_in = int(stats.get("tokens_input") or 0)
    tokens_out = int(stats.get("tokens_output") or 0)
    tokens_total = tokens_in + tokens_out

    cost_usd = float(stats.get("cost_usd") or 0)
    agent_cost_irr = cost_usd * USD_TO_IRR
    if agent_cost_irr <= 0 and tokens_total > 0:
        # Rough fallback when cost not logged: ~$0.002 per 1K tokens (blended)
        agent_cost_irr = (tokens_total / 1000.0) * 0.002 * USD_TO_IRR

    total_duration_ms = int(stats.get("total_duration_ms") or 0)
    agent_hours = total_duration_ms / 3_600_000.0 if total_duration_ms > 0 else runs * 2.5 / 60.0

    human_hours = (runs * minutes_per_run) / 60.0
    human_cost_irr = human_hours * hourly_irr

    time_saved_hours = max(0.0, human_hours - agent_hours)
    money_saved_irr = max(0.0, human_cost_irr - agent_cost_irr)
    savings_pct = int(round(100 * money_saved_irr / human_cost_irr)) if human_cost_irr > 0 else 0

    return {
        "role_title": bench["role_title"],
        "period_label": "۳۰ روز اخیر" if uses_live else "برآورد ماهانه (نمونه)",
        "uses_live_activity": uses_live,
        "run_count": runs,
        "tokens_total": tokens_total,
        "employee_monthly_salary_irr": monthly,
        "employee_hourly_irr": int(round(hourly_irr)),
        "human_hours": round(human_hours, 2),
        "human_hours_label": _format_hours(human_hours),
        "human_cost_irr": int(round(human_cost_irr)),
        "human_cost_label": _format_irr(human_cost_irr),
        "agent_hours": round(agent_hours, 2),
        "agent_hours_label": _format_hours(agent_hours),
        "agent_cost_irr": int(round(agent_cost_irr)),
        "agent_cost_label": _format_irr(agent_cost_irr),
        "time_saved_hours": round(time_saved_hours, 2),
        "time_saved_label": _format_hours(time_saved_hours),
        "money_saved_irr": int(round(money_saved_irr)),
        "money_saved_label": _format_irr(money_saved_irr),
        "savings_percent": min(99, savings_pct),
        "usd_to_irr_rate": USD_TO_IRR,
    }
