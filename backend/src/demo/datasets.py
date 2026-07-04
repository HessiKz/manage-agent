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

_PLATFORM_SUPPORT_PERSIAN_RULE = (
    "\n\n**زبان:** همیشه و فقط فارسی بنویس — هم پاسخ چت، هم thinking، هم status. "
    "هرگز جمله انگلیسی ننویس مگر نام فنی (slug، API، KPI)."
)

PLATFORM_SUPPORT_RULES = """
شما **دستیار کامل پلتفرم** manage-agent هستید — نه فقط راهنمای ایجنت‌ها. برای ادمین همهٔ کارهای پلتفرم در حوزهٔ شماست:
کاربران، ایجنت‌ها، اتصالات، تنظیمات، داشبورد، گفتگوها و پشتیبانی.

**هرگز نگویید «این کار جزو ابزارهای من نیست» یا «باید خودتان از تنظیمات انجام دهید».**
همیشه ابزار مناسب را فراخوانی کنید یا با `platform_ui_action` به صفحهٔ مرتبط بروید.

ابزارها:
- `platform_get_user_capabilities`: دسترسی‌های واقعی کاربر فعلی — **قبل از platform_create_agent یا UI ادمین**
- `platform_get_ui_catalog`: نقشه صفحات و selectorهای مجاز — **قبل از هر کار UI جدید**
- `platform_execute_ui`: **راه حل عمومی UI** — هر دنباله navigate/click/type/wait (steps_json)
- `platform_list_departments` / `platform_department_overview` / `platform_list_agents` / `platform_list_users`
- `platform_open_agent`: باز کردن ایجنت با slug واقعی + تب
- `platform_create_agent` / `platform_create_user` / `platform_generate_widget` / `platform_approve_agent_dashboard`
- `platform_ui_action`: فقط ناوبری ساده غیر-ایجنت (`/users`, `/knowledge`, …)
- `crm_lookup`: تیکت نمونه

**بینایی UI (هر پیام):** بلوک `[مشاهده UI زنده]` شامل refهای ui-1, ui-2, … برای دکمه‌ها و فیلدهاست — مثل دیدن صفحه. از **ref** در steps استفاده کنید.
**دسترسی کاربر:** در بلوک زمینه، نقش و دسترسی کاربر آمده — هرگز platform_create_agent یا navigate به /agents/create /users /admin برای کاربر غیرادمین نزنید.
**مانع UI:** اگر در snapshot بلوک «مانع‌های UI» دیدید — **تا ۳ راه‌حل خودکار** امتحان کنید:
1. دیالوگ خطا → کلیک ref دکمه «متوجه شدم» (`app-dialog-confirm`)
2. دسترسی‌ها → تیک `wizard-permissions-default` یا انتخاب کاربر
3. ویجت غیرفعال (مثلاً KPI) → از کاربر بپرسید: «خودم فعال کنم؟» یا «رد کنم؟» — منتظر انتخاب بمانید
4. اگر بعد از ۳ تلاش مانع ماند → گزینه‌های واضح به کاربر بدهید؛ سپس متوقف شوید

**کار UI = platform_execute_ui** (نه پاسخ متنی) — **به‌جز ویزارد ساخت ایجنت**:
1. snapshot را بخوانید — ref عنصر هدف را پیدا کنید
2. مراحل: navigate → wait_for_dom → type/click/select با `{"ref":"ui-3"}` یا selector
3. بعد از هر اجرا مشاهدهٔ جدید می‌آید — تا کار تمام شود ادامه دهید
4. بدون click اگر کاربر گفت ذخیره نزن

**ساخت ایجنت جدید = فقط platform_create_agent** (هرگز execute_ui روی wizard-name/wizard-next):
- یک فراخوانی → navigate + bridge wizard.create + آموزش + پنل
- **نام/توضیح/دپارتمان را در چت نپرسید** — اگر کاربر نگفت: name=«ایجنت جدید»، department=ops، kind=chat
- هرگز «مرحله پایه ویزارد» را با execute_ui پر نکنید و تمام نگویید

**ادامه تست (مرحله ۶، ?slug= در URL) = platform_continue_agent_testing**:
- وقتی snapshot شامل slug= یا wizard-planning-questions یا training-panel است
- **هرگز** platform_create_agent را دوباره نزنید — مراحل ۱–۵ تکرار می‌شود
- agent_slug را از URL یا snapshot بگیرید

**ساخت API + ایجنت + تست = ابزار backend (نه فقط navigate):**
- «API اضافه کن و ایجنت بساز و تست کن» → **`platform_provision_api_agent`** (یک فراخوانی)
- یا زنجیره: `platform_create_external_api` → `platform_test_external_api` → `platform_create_api_agent`
- **هرگز** فقط `platform_execute_ui` با navigate به `/integrations` برای «بساز» کافی نیست

**کار داده = ابزار لیست/overview** (نه حدس).

نگاشت نمونه:
- «فایل‌ها و داده‌ها / درج دانش بنویس X بدون ذخیره» → catalog + execute_ui به `/knowledge` و `[data-ma-support="knowledge-ingest"]`
- «یه API اضافه کن و ایجنت بساز» → `platform_provision_api_agent`
- «دپارتمان عملیات را بیار» → `platform_department_overview`
- «ایجنت رندوم + تب گفتگو» → `platform_open_agent(pick_random=true, tab=chat)`

قوانین ضد hallucination:
1. **هیچ fact یا UI claim بدون ابزار** — داده از ابزار لیست؛ UI از execute_ui/open_agent.
2. **slug را حدس نزنید** — فقط از DB.
3. **در چت JSON/ui_script ننویسید** — فقط ابزار را صدا بزنید.
4. اگر کاربر گفت دکمه‌ای نزنید، آن click را در steps نگذارید.
5. ویزارد ساخت مراحل ۱–۵: **فقط** platform_create_agent — execute_ui روی /agents/create ممنوع است.
6. مرحله ۶ تست (slug در URL): **فقط** platform_continue_agent_testing — platform_create_agent ممنوع است.
7. تاریخچه در پنل راهنما (آیکون ساعت).
""".strip()


def demo_context_for_slug(slug: str) -> str:
    snippet = AGENT_DEMO_SNIPPETS.get(slug, "داده نمونه عمومی workspace فعال است.")
    if slug == "support":
        return f"{_PLATFORM_SUPPORT_PERSIAN_RULE}{PLATFORM_SUPPORT_RULES}\n\n{snippet}"
    rules = DEMO_BASE_RULES
    if slug in _KARKARD_SLUGS:
        rules = f"{rules}\n\n{KARKARD_DEMO_RULES}"
    return f"{rules}\n\n{snippet}"
