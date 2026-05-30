"""Demo workspace data — agents must use this instead of claiming no access."""

from __future__ import annotations

DEMO_INVOICES = [
    {"id": "INV-1001", "customer": "شرکت آلفا", "amount": 12_500_000, "status": "paid", "batch": "A"},
    {"id": "INV-1002", "customer": "شرکت بتا", "amount": 8_200_000, "status": "pending", "batch": "A"},
    {"id": "INV-1003", "customer": "شرکت گاما", "amount": 15_750_000, "status": "paid", "batch": "B"},
    {"id": "INV-1004", "customer": "فروشگاه دلتا", "amount": 3_400_000, "status": "overdue", "batch": "A"},
    {"id": "INV-1005", "customer": "هلدینگ اوپسیلون", "amount": 22_000_000, "status": "pending", "batch": "B"},
]

DEMO_PAYROLL = [
    {"employee": "علی حسینی", "department": "تولید", "base": 48_000_000, "overtime_h": 12, "employee_id": "E-1001"},
    {"employee": "مریم صادقی", "department": "تولید", "base": 42_000_000, "overtime_h": 8, "employee_id": "E-1002"},
    {"employee": "رضا کریمی", "department": "مالی", "base": 55_000_000, "overtime_h": 4, "employee_id": "E-1003"},
    {"employee": "سارا محمدی", "department": "فروش", "base": 38_500_000, "overtime_h": 6, "employee_id": "E-1004"},
    {"employee": "حامد نوری", "department": "IT", "base": 62_000_000, "overtime_h": 10, "employee_id": "E-1005"},
]

DEMO_TICKETS = [
    {"id": "TK-501", "subject": "تأخیر فاکتور", "priority": "high", "status": "open"},
    {"id": "TK-502", "subject": "دسترسی ایجنت حقوق", "priority": "medium", "status": "pending"},
]

DEMO_RESUMES = [
    {
        "id": "CV-001",
        "name": "نگار رضایی",
        "years": 4,
        "skills": ["Python", "Django", "PostgreSQL", "Docker", "Git", "REST API"],
        "projects": 5,
        "github": True,
        "teamwork": True,
        "summary": "بک‌اند دولوپر با سابقه طراحی API و بهینه‌سازی کوئری.",
    },
    {
        "id": "CV-002",
        "name": "پارسا احمدی",
        "years": 2,
        "skills": ["JavaScript", "React", "TypeScript", "Next.js", "Git"],
        "projects": 3,
        "github": True,
        "teamwork": True,
        "summary": "فرانت‌اند دولوپر با تمرکز روی React و تجربه کار تیمی Agile.",
    },
    {
        "id": "CV-003",
        "name": "علی حسینی",
        "years": 0,
        "skills": ["Excel", "Word"],
        "projects": 0,
        "github": False,
        "teamwork": True,
        "summary": "سابقه اداری در تولید، بدون تجربه مستقیم توسعه نرم‌افزار.",
    },
    {
        "id": "CV-004",
        "name": "زهرا مرادی",
        "years": 6,
        "skills": ["Java", "Spring Boot", "MySQL", "Redis", "System Design", "Git"],
        "projects": 8,
        "github": True,
        "teamwork": True,
        "summary": "مهندس نرم‌افزار ارشد با تجربه معماری سرویس‌های سازمانی.",
    },
    {
        "id": "CV-005",
        "name": "مهدی موسوی",
        "years": 1,
        "skills": ["Python", "Flask", "SQLite"],
        "projects": 2,
        "github": False,
        "teamwork": False,
        "summary": "جونیور بک‌اند با پروژه‌های کوچک و نیازمند منتورینگ فنی.",
    },
]

AGENT_DEMO_SNIPPETS: dict[str, str] = {
    "invoice": (
        "داده نمونه فاکتور (workspace): "
        + "; ".join(
            f"{r['id']} {r['customer']} {r['amount']:,} ریال ({r['status']})"
            for r in DEMO_INVOICES
        )
    ),
    "payroll": (
        "داده نمونه حقوق: "
        + "; ".join(f"{r['employee']} {r['base']:,}" for r in DEMO_PAYROLL)
    ),
    "bank-recon": "تراکنش‌های نمونه بانکی در فایل CSV آپلودشده قابل تطبیق با دفتر کل هستند.",
    "support": "تیکت‌های نمونه: " + "; ".join(f"{t['id']} {t['subject']}" for t in DEMO_TICKETS),
    "resume": (
        "رزومه‌های نمونه: "
        + "; ".join(f"{r['id']} {r['name']} ({r['years']}y)" for r in DEMO_RESUMES)
    ),
    "general": "پرسش‌های عمومی سازمان — از داده نمونه workspace استفاده کن.",
    "example-chat": "دستیار گفت‌وگو — داده نمونه workspace در دسترس است.",
    "example-worker": DEMO_PAYROLL[0]["employee"] + " — حقوق نمونه در workspace.",
    "example-file-intake": "فایل‌های نمونه در سامانه دریافت شده‌اند.",
    "example-supervisor": "سرپرست به زیرایجنت‌ها با داده نمونه دسترسی دارد.",
    "example-custom": "ایجنت سفارشی — همه داده‌های نمونه فعال است.",
    "example-chat-files": DEMO_INVOICES[0]["id"] + " — فاکتور نمونه.",
    "example-worker-chat": "کارگر + گفت‌وگو با رزومه‌های نمونه برای غربال استخدام.",
    "example-orchestrator": "ارکستراتور — زیرایجنت‌ها داده نمونه دارند.",
    "example-api-connector": (
        "ایجنت API — endpointهای httpbin-demo (مثلاً get-ip) به‌عنوان ابزار متصل است."
    ),
    "example-karkard": (
        "ایجنت کارکرد — فایل اکسل دمو (demo-karkard-raw.xlsx) از قبل در workspace بارگذاری شده. "
        "بدون درخواست از کاربر، ابزار karkard_process را با storage_path همان فایل فراخوانی کن و "
        "لینک دانلود خروجی پردازش‌شده را برگردان."
    ),
}

DEMO_BASE_RULES = """
شما در محیط نمایشی (demo workspace) کار می‌کنید. به داده‌های نمونه سازمانی در پایگاه دانش، ابزارها و فایل‌های آپلودشده دسترسی دارید.
هرگز نگویید به داده واقعی دسترسی ندارید. از اشاره به مسیرهای فایل محلی خودداری کنید. خروجی را کامل بدهید.
اگر ابزار گزارش URL دانلود برگرداند، همان URL را در پاسخ ذکر کنید.
""".strip()

KARKARD_DEMO_RULES = """
ایجنت کارکرد: فایل اکسل دمو از قبل در workspace است — از کاربر فایل نخواه.
با reasoning مدل، ابزار `karkard_process` را از طریق function calling فراخوانی کن (نه اجرای دستی خارج از LLM).
از `storage_path` کامل و `agent_id` در context ابزار استفاده کن؛ نام کوتاه فایل کافی نیست.
پس از اجرای ابزار، لینک دانلود و خلاصه را به کاربر بده.
""".strip()

_KARKARD_SLUGS = frozenset({"example-karkard"})


def demo_context_for_slug(slug: str) -> str:
    snippet = AGENT_DEMO_SNIPPETS.get(slug, "داده نمونه عمومی workspace فعال است.")
    rules = DEMO_BASE_RULES
    if slug in _KARKARD_SLUGS:
        rules = f"{rules}\n\n{KARKARD_DEMO_RULES}"
    return f"{rules}\n\n{snippet}"
