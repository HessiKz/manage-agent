"""Per-agent dashboard definitions — domain data keyed by slug / kind."""

from __future__ import annotations

from typing import Any

from src.demo.datasets import DEMO_INVOICES, DEMO_PAYROLL, DEMO_TICKETS
from src.models.agent import Agent, AgentKind

# ─── Payroll / HR finance ───────────────────────────────────────────────────

_PAYROLL_LINE = [
    {"month": "شهریور", "paid": 4510, "forecast": 4300},
    {"month": "مهر", "paid": 9020, "forecast": 8700},
    {"month": "آبان", "paid": 7800, "forecast": 7600},
    {"month": "آذر", "paid": 8200, "forecast": 8100},
    {"month": "دی", "paid": 8600, "forecast": 8450},
    {"month": "بهمن", "paid": 9020, "forecast": 8920},
]

_PAYROLL_PIE = [
    {"name": "تولید", "value": 38},
    {"name": "فنی", "value": 22},
    {"name": "فروش", "value": 16},
    {"name": "پشتیبانی", "value": 14},
    {"name": "سایر", "value": 10},
]

_PAYROLL_REVIEWS = [
    {
        "id": "r1",
        "cells": {
            "employee": "علی حسینی",
            "dept": "تولید",
            "overtime": "۸۴h",
            "avg3m": "۲۸h",
            "delta": "+۲۰۰٪",
            "reason": "شیفت‌های شبانه پروژه ویژه — تأیید سرپرست ثبت شده",
        },
        "status": "pending",
    },
    {
        "id": "r2",
        "cells": {
            "employee": "مریم صادقی",
            "dept": "تولید",
            "overtime": "۷۲h",
            "avg3m": "۲۶h",
            "delta": "+۱۷۷٪",
            "reason": "پوشش غیبت همکار — ثبت حضور مطابق سامانه",
        },
        "status": "pending",
    },
    {
        "id": "r3",
        "cells": {
            "employee": "امیر طاهری",
            "dept": "فنی",
            "overtime": "۵۲h",
            "avg3m": "۲۱h",
            "delta": "+۱۴۸٪",
            "reason": "تحویل فوری — نیازمند بازبینی مدیر مالی",
        },
        "status": "pending",
    },
]

# ─── Invoice ────────────────────────────────────────────────────────────────

def _invoice_status_counts() -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for inv in DEMO_INVOICES:
        counts[inv["status"]] = counts.get(inv["status"], 0) + 1
    labels = {"paid": "پرداخت‌شده", "pending": "در انتظار", "overdue": "معوق"}
    return [{"name": labels.get(k, k), "value": v} for k, v in counts.items()]


_INVOICE_ROWS = [
    {
        "id": inv["id"],
        "cells": {
            "id": inv["id"],
            "customer": inv["customer"],
            "amount": f"{inv['amount']:,} ریال",
            "status": {"paid": "پرداخت‌شده", "pending": "در انتظار", "overdue": "معوق"}.get(
                inv["status"], inv["status"]
            ),
            "batch": inv["batch"],
        },
        "status": inv["status"],
    }
    for inv in DEMO_INVOICES
]

# ─── Support tickets ────────────────────────────────────────────────────────

_SUPPORT_ROWS = [
    {
        "id": t["id"],
        "cells": {
            "id": t["id"],
            "subject": t["subject"],
            "priority": {"high": "بالا", "medium": "متوسط", "low": "پایین"}.get(
                t["priority"], t["priority"]
            ),
            "status": {"open": "باز", "pending": "در انتظار", "closed": "بسته"}.get(
                t["status"], t["status"]
            ),
        },
        "status": t["status"],
    }
    for t in DEMO_TICKETS
]

# ─── Karkard / spreadsheet ──────────────────────────────────────────────────

_KARKARD_LINE = [
    {"month": "مهر", "processed": 118, "expected": 120},
    {"month": "آبان", "processed": 124, "expected": 122},
    {"month": "آذر", "processed": 131, "expected": 128},
    {"month": "دی", "processed": 136, "expected": 135},
    {"month": "بهمن", "processed": 148, "expected": 145},
]

# ─── Bank recon ─────────────────────────────────────────────────────────────

_BANK_ROWS = [
    {
        "id": "tx1",
        "cells": {
            "date": "۱۴۰۴/۱۱/۰۵",
            "description": "واریز حقوق",
            "amount": "۱۲٬۵۰۰٬۰۰۰",
            "match": "تطبیق‌شده",
        },
        "status": "matched",
    },
    {
        "id": "tx2",
        "cells": {
            "date": "۱۴۰۴/۱۱/۰۷",
            "description": "کارمزد بانکی",
            "amount": "۴۵٬۰۰۰",
            "match": "نیازمند بررسی",
        },
        "status": "pending",
    },
    {
        "id": "tx3",
        "cells": {
            "date": "۱۴۰۴/۱۱/۰۹",
            "description": "پرداخت تأمین‌کننده",
            "amount": "۸٬۲۰۰٬۰۰۰",
            "match": "مغایرت",
        },
        "status": "mismatch",
    },
]

# ─── API connector ──────────────────────────────────────────────────────────

_API_LINE = [
    {"month": "شهریور", "calls": 420, "errors": 3},
    {"month": "مهر", "calls": 510, "errors": 5},
    {"month": "آبان", "calls": 488, "errors": 2},
    {"month": "آذر", "calls": 530, "errors": 4},
    {"month": "دی", "calls": 575, "errors": 6},
    {"month": "بهمن", "calls": 602, "errors": 2},
]

# ─── Supervisor ─────────────────────────────────────────────────────────────

_SUPERVISOR_PIE = [
    {"name": "گفت‌وگو", "value": 40},
    {"name": "کارگر", "value": 35},
    {"name": "دریافت فایل", "value": 25},
]

# ─── Profile builders ───────────────────────────────────────────────────────


def _profile_payroll() -> dict[str, Any]:
    return {
        "profile": "payroll",
        "stat_cards": [
            {"label": "کل کارمندان", "value": str(len(DEMO_PAYROLL) + 145), "hint": "دی vs ↗ روندبدی", "chart_variant": "payroll-headcount"},
            {"label": "جمع پرداختی", "value": "۸٫۲B", "hint": "دی vs ↗ ۲٫۴٪+", "chart_variant": "payroll-payout"},
            {"label": "بازرسی لازم", "value": "۳", "hint": "اضافه‌کار غیرعادی", "chart_variant": "payroll-review"},
            {"label": "کل مالیات", "value": "۹۸۰M", "hint": "↗ ۱٫۸٪+", "chart_variant": "payroll-tax"},
        ],
        "line_chart": {
            "title": "روند پرداختی · ۶ ماه اخیر",
            "series": [
                {"name": "پرداختی", "data_key": "paid", "dashed": False},
                {"name": "پیش‌بینی", "data_key": "forecast", "dashed": True},
            ],
            "points": _PAYROLL_LINE,
        },
        "pie_chart": {
            "title": "توزیع بر اساس دپارتمان",
            "slices": _PAYROLL_PIE,
        },
        "review_table": {
            "title": "۳ مورد نیازمند بررسی",
            "columns": [
                {"key": "employee", "label": "کارمند"},
                {"key": "dept", "label": "دپارتمان"},
                {"key": "overtime", "label": "اضافه‌کار"},
                {"key": "avg3m", "label": "میانگین ۳ ماه"},
                {"key": "delta", "label": "تغییر"},
                {"key": "reason", "label": "دلیل پیشنهادی AI"},
            ],
            "rows": _PAYROLL_REVIEWS,
        },
    }


def _profile_invoice() -> dict[str, Any]:
    total = sum(i["amount"] for i in DEMO_INVOICES)
    pending = sum(1 for i in DEMO_INVOICES if i["status"] != "paid")
    return {
        "profile": "invoice",
        "stat_cards": [
            {"label": "فاکتورهای فعال", "value": str(len(DEMO_INVOICES)), "hint": "workspace نمونه", "chart_variant": "savings"},
            {"label": "جمع مبلغ", "value": f"{total // 1_000_000}M", "hint": "ریال", "chart_variant": "hours"},
            {"label": "معوق / باز", "value": str(pending), "hint": "نیازمند پیگیری", "chart_variant": "alerts"},
            {"label": "دقت صدور", "value": "۹۹٫۱٪", "hint": "↗ ۰٫۳٪+", "chart_variant": "accuracy"},
        ],
        "line_chart": {
            "title": "روند صدور فاکتور · ۶ ماه",
            "series": [
                {"name": "صادرشده", "data_key": "issued", "dashed": False},
                {"name": "هدف", "data_key": "target", "dashed": True},
            ],
            "points": [
                {"month": "شهریور", "issued": 12, "target": 10},
                {"month": "مهر", "issued": 18, "target": 15},
                {"month": "آبان", "issued": 15, "target": 14},
                {"month": "آذر", "issued": 20, "target": 18},
                {"month": "دی", "issued": 22, "target": 20},
                {"month": "بهمن", "issued": len(DEMO_INVOICES), "target": 22},
            ],
        },
        "pie_chart": {
            "title": "وضعیت فاکتورها",
            "slices": _invoice_status_counts(),
        },
        "review_table": {
            "title": "فاکتورهای workspace",
            "columns": [
                {"key": "id", "label": "شناسه"},
                {"key": "customer", "label": "مشتری"},
                {"key": "amount", "label": "مبلغ"},
                {"key": "status", "label": "وضعیت"},
                {"key": "batch", "label": "دسته"},
            ],
            "rows": _INVOICE_ROWS,
        },
    }


def _profile_karkard() -> dict[str, Any]:
    return {
        "profile": "karkard",
        "stat_cards": [
            {"label": "پرسنل در فایل", "value": "۱۴۸", "hint": "آخرین اکسل خام", "chart_variant": "payroll-headcount"},
            {"label": "ردیف پردازش‌شده", "value": "۱۴۸", "hint": "بهمن ۱۴۰۴", "chart_variant": "payroll-payout"},
            {"label": "خطاهای اعتبارسنجی", "value": "۲", "hint": "نیازمند اصلاح", "chart_variant": "payroll-review"},
            {"label": "زمان پردازش", "value": "۴٫۲s", "hint": "آخرین اجرا", "chart_variant": "accuracy"},
        ],
        "line_chart": {
            "title": "روند پردازش کارکرد",
            "series": [
                {"name": "پردازش‌شده", "data_key": "processed", "dashed": False},
                {"name": "هدف", "data_key": "expected", "dashed": True},
            ],
            "points": _KARKARD_LINE,
        },
        "pie_chart": {
            "title": "وضعیت ردیف‌ها",
            "slices": [
                {"name": "تأییدشده", "value": 142},
                {"name": "هشدار", "value": 4},
                {"name": "خطا", "value": 2},
            ],
        },
        "review_table": {
            "title": "نمونه پرسنل (workspace)",
            "columns": [
                {"key": "employee", "label": "نام"},
                {"key": "dept", "label": "دپارتمان"},
                {"key": "base", "label": "پایه"},
                {"key": "overtime", "label": "اضافه‌کار"},
            ],
            "rows": [
                {
                    "id": f"p{i}",
                    "cells": {
                        "employee": r["employee"],
                        "dept": r["department"],
                        "base": f"{r['base']:,}",
                        "overtime": f"{r['overtime_h']}h",
                    },
                    "status": "ok",
                }
                for i, r in enumerate(DEMO_PAYROLL)
            ],
        },
    }


def _profile_bank_recon() -> dict[str, Any]:
    return {
        "profile": "bank_recon",
        "stat_cards": [
            {"label": "تراکنش‌های CSV", "value": "۲۴۶", "hint": "آخرین آپلود", "chart_variant": "hours"},
            {"label": "تطبیق خودکار", "value": "۲۳۱", "hint": "۹۳٫۹٪", "chart_variant": "accuracy"},
            {"label": "مغایرت", "value": "۸", "hint": "نیازمند بررسی", "chart_variant": "alerts"},
            {"label": "در انتظار", "value": "۷", "hint": "دستی", "chart_variant": "savings"},
        ],
        "line_chart": {
            "title": "روند تطبیق هفتگی",
            "series": [
                {"name": "تطبیق‌شده", "data_key": "matched", "dashed": False},
                {"name": "باز", "data_key": "open", "dashed": False},
            ],
            "points": [
                {"month": "هفته ۱", "matched": 52, "open": 8},
                {"month": "هفته ۲", "matched": 58, "open": 6},
                {"month": "هفته ۳", "matched": 61, "open": 5},
                {"month": "هفته ۴", "matched": 60, "open": 7},
            ],
        },
        "pie_chart": {
            "title": "نتیجه تطبیق",
            "slices": [
                {"name": "تطبیق‌شده", "value": 231},
                {"name": "مغایرت", "value": 8},
                {"name": "باز", "value": 7},
            ],
        },
        "review_table": {
            "title": "تراکنش‌های نیازمند بررسی",
            "columns": [
                {"key": "date", "label": "تاریخ"},
                {"key": "description", "label": "شرح"},
                {"key": "amount", "label": "مبلغ"},
                {"key": "match", "label": "وضعیت"},
            ],
            "rows": _BANK_ROWS,
        },
    }


def _profile_support() -> dict[str, Any]:
    open_count = sum(1 for t in DEMO_TICKETS if t["status"] == "open")
    return {
        "profile": "support",
        "stat_cards": [
            {"label": "تیکت‌های باز", "value": str(open_count), "hint": "اولویت بالا: ۱", "chart_variant": "alerts"},
            {"label": "میانگین پاسخ", "value": "۱۲m", "hint": "↗ بهبود", "chart_variant": "hours"},
            {"label": "رضایت", "value": "۹۴٪", "hint": "این ماه", "chart_variant": "accuracy"},
            {"label": "بسته‌شده", "value": "۱۸۴", "hint": "۳۰ روز", "chart_variant": "savings"},
        ],
        "line_chart": {
            "title": "حجم تیکت · ۶ ماه",
            "series": [
                {"name": "باز", "data_key": "open", "dashed": False},
                {"name": "بسته", "data_key": "closed", "dashed": False},
            ],
            "points": [
                {"month": "شهریور", "open": 42, "closed": 38},
                {"month": "مهر", "open": 48, "closed": 45},
                {"month": "آبان", "open": 35, "closed": 40},
                {"month": "آذر", "open": 30, "closed": 36},
                {"month": "دی", "open": 28, "closed": 34},
                {"month": "بهمن", "open": len(DEMO_TICKETS), "closed": 32},
            ],
        },
        "pie_chart": {
            "title": "اولویت تیکت‌ها",
            "slices": [
                {"name": "بالا", "value": 1},
                {"name": "متوسط", "value": 1},
                {"name": "پایین", "value": 0},
            ],
        },
        "review_table": {
            "title": "تیکت‌های workspace",
            "columns": [
                {"key": "id", "label": "شناسه"},
                {"key": "subject", "label": "موضوع"},
                {"key": "priority", "label": "اولویت"},
                {"key": "status", "label": "وضعیت"},
            ],
            "rows": _SUPPORT_ROWS,
        },
    }


def _profile_resume() -> dict[str, Any]:
    return {
        "profile": "resume",
        "stat_cards": [
            {"label": "رزومه در صف", "value": "۳۲", "hint": "آپلودشده", "chart_variant": "hours"},
            {"label": "تأیید اولیه", "value": "۱۲", "hint": "امتیاز > ۷۰", "chart_variant": "accuracy"},
            {"label": "رد شده", "value": "۵", "hint": "امتیاز < ۴۰", "chart_variant": "alerts"},
            {"label": "در انتظار", "value": "۱۵", "hint": "نیازمند مصاحبه", "chart_variant": "savings"},
        ],
        "line_chart": {
            "title": "غربال هفتگی",
            "series": [
                {"name": "بررسی‌شده", "data_key": "screened", "dashed": False},
                {"name": "پذیرفته", "data_key": "shortlisted", "dashed": False},
            ],
            "points": [
                {"month": "هفته ۱", "screened": 24, "shortlisted": 6},
                {"month": "هفته ۲", "screened": 28, "shortlisted": 8},
                {"month": "هفته ۳", "screened": 22, "shortlisted": 5},
                {"month": "هفته ۴", "screened": 32, "shortlisted": 12},
            ],
        },
        "pie_chart": {
            "title": "نتیجه غربال",
            "slices": [
                {"name": "لیست کوتاه", "value": 12},
                {"name": "رد", "value": 5},
                {"name": "در انتظار", "value": 15},
            ],
        },
        "review_table": None,
    }


def _profile_api() -> dict[str, Any]:
    return {
        "profile": "api",
        "stat_cards": [
            {"label": "فراخوانی API", "value": "۶۰۲", "hint": "بهمن", "chart_variant": "hours"},
            {"label": "میانگین تأخیر", "value": "۱۲۰ms", "hint": "httpbin-demo", "chart_variant": "accuracy"},
            {"label": "خطا", "value": "۲", "hint": "۰٫۳٪", "chart_variant": "alerts"},
            {"label": "endpoint فعال", "value": "۱", "hint": "get-ip", "chart_variant": "savings"},
        ],
        "line_chart": {
            "title": "فراخوانی‌های API",
            "series": [
                {"name": "موفق", "data_key": "calls", "dashed": False},
                {"name": "خطا", "data_key": "errors", "dashed": False},
            ],
            "points": _API_LINE,
        },
        "pie_chart": None,
        "review_table": None,
    }


def _profile_supervisor() -> dict[str, Any]:
    return {
        "profile": "supervisor",
        "stat_cards": [
            {"label": "زیرایجنت", "value": "۳", "hint": "متصل", "chart_variant": "savings"},
            {"label": "مسیریابی موفق", "value": "۹۶٪", "hint": "۳۰ روز", "chart_variant": "accuracy"},
            {"label": "عمق میانگین", "value": "۱٫۴", "hint": "سطح فراخوانی", "chart_variant": "hours"},
            {"label": "در صف", "value": "۲", "hint": "درخواست باز", "chart_variant": "alerts"},
        ],
        "line_chart": {
            "title": "مسیریابی روزانه",
            "series": [
                {"name": "موفق", "data_key": "routed", "dashed": False},
                {"name": "ناموفق", "data_key": "failed", "dashed": False},
            ],
            "points": [
                {"month": "شنبه", "routed": 18, "failed": 1},
                {"month": "یکشنبه", "routed": 22, "failed": 0},
                {"month": "دوشنبه", "routed": 25, "failed": 2},
                {"month": "سه‌شنبه", "routed": 20, "failed": 1},
                {"month": "چهارشنبه", "routed": 24, "failed": 0},
            ],
        },
        "pie_chart": {
            "title": "سهم زیرایجنت‌ها",
            "slices": _SUPERVISOR_PIE,
        },
        "review_table": None,
    }


def _profile_file_intake() -> dict[str, Any]:
    return {
        "profile": "file_intake",
        "stat_cards": [
            {"label": "فایل‌های دریافتی", "value": "۱۲", "hint": "این هفته", "chart_variant": "hours"},
            {"label": "آماده پردازش", "value": "۱۰", "hint": "اعتبارسنجی OK", "chart_variant": "accuracy"},
            {"label": "رد شده", "value": "۲", "hint": "فرمت نامعتبر", "chart_variant": "alerts"},
            {"label": "حجم کل", "value": "۴۸MB", "hint": "محدودیت ۵۰۰MB", "chart_variant": "savings"},
        ],
        "line_chart": {
            "title": "ورود فایل هفتگی",
            "series": [
                {"name": "آپلود", "data_key": "uploads", "dashed": False},
            ],
            "points": [
                {"month": "هفته ۱", "uploads": 8},
                {"month": "هفته ۲", "uploads": 11},
                {"month": "هفته ۳", "uploads": 9},
                {"month": "هفته ۴", "uploads": 12},
            ],
        },
        "pie_chart": {
            "title": "نوع فایل",
            "slices": [
                {"name": "CSV", "value": 7},
                {"name": "PDF", "value": 3},
                {"name": "XLSX", "value": 2},
            ],
        },
        "review_table": None,
    }


def _profile_generic_chat(name: str) -> dict[str, Any]:
    return {
        "profile": "generic_chat",
        "stat_cards": [
            {"label": "گفت‌وگوها", "value": "۴۲", "hint": "۳۰ روز", "chart_variant": "hours"},
            {"label": "میانگین پاسخ", "value": "۲٫۱s", "hint": "آخرین هفته", "chart_variant": "accuracy"},
            {"label": "قالب‌های فعال", "value": "۳", "hint": name[:20], "chart_variant": "savings"},
            {"label": "رضایت", "value": "۹۷٪", "hint": "بازخورد نمونه", "chart_variant": "alerts"},
        ],
        "line_chart": {
            "title": "فعالیت گفت‌وگو",
            "series": [
                {"name": "پیام", "data_key": "messages", "dashed": False},
            ],
            "points": [
                {"month": "شهریور", "messages": 28},
                {"month": "مهر", "messages": 35},
                {"month": "آبان", "messages": 32},
                {"month": "آذر", "messages": 40},
                {"month": "دی", "messages": 38},
                {"month": "بهمن", "messages": 42},
            ],
        },
        "pie_chart": None,
        "review_table": None,
    }


# Every catalog slug → domain dashboard profile (task-specific KPIs).
_SLUG_PROFILE: dict[str, str] = {
    "payroll": "payroll",
    "example-worker": "payroll",
    "invoice": "invoice",
    "example-karkard": "karkard",
    "bank-recon": "bank_recon",
    "support": "support",
    "example-chat-files": "support",
    "resume": "resume",
    "example-worker-chat": "resume",
    "example-api-connector": "api",
    "example-supervisor": "supervisor",
    "example-orchestrator": "supervisor",
    "example-file-intake": "file_intake",
    "example-chat": "generic_chat",
    "example-custom": "generic_chat",
    "general": "generic_chat",
}


def resolve_profile_key(agent: Agent) -> str:
    if agent.slug in _SLUG_PROFILE:
        return _SLUG_PROFILE[agent.slug]
    kind = agent.kind.canonical() if hasattr(agent.kind, "canonical") else agent.kind
    if kind == AgentKind.SUPERVISOR:
        return "supervisor"
    if kind == AgentKind.WORKER:
        caps = getattr(agent, "capabilities", None) or {}
        if isinstance(caps, dict) and caps.get("external_apis_enabled"):
            return "api"
        if isinstance(caps, dict) and caps.get("file_upload_enabled") and "karkard" in str(
            getattr(agent, "slug", "")
        ):
            return "karkard"
        return "payroll"
    if agent.department == "support":
        return "support"
    if agent.department == "finance":
        return "invoice"
    if agent.department == "hr":
        return "resume"
    return "generic_chat"


_BUILDERS = {
    "payroll": _profile_payroll,
    "invoice": _profile_invoice,
    "karkard": _profile_karkard,
    "bank_recon": _profile_bank_recon,
    "support": _profile_support,
    "resume": _profile_resume,
    "api": _profile_api,
    "supervisor": _profile_supervisor,
    "file_intake": _profile_file_intake,
    "generic_chat": lambda: _profile_generic_chat("chat"),
}


def base_dashboard_for_agent(agent: Agent) -> dict[str, Any]:
    key = resolve_profile_key(agent)
    builder = _BUILDERS.get(key, _BUILDERS["generic_chat"])
    if key == "generic_chat":
        return builder(agent.name)
    return builder()
