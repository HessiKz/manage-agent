"""Per-slug execution documentation — what each agent does and how to run it."""

from __future__ import annotations

from typing import Any

from src.models.agent import Agent, AgentKind

# slug -> profile dict (all catalog agents + kind fallbacks)
AGENT_EXECUTION_BY_SLUG: dict[str, dict[str, Any]] = {
    "payroll": {
        "profile": "payroll",
        "domain_label": "مالی · حقوق و دستمزد",
        "headline": "دستیار حقوق، فیش و اضافه‌کار",
        "summary": "اجرای چرخه حقوق ماهانه، صدور فیش، بررسی اضافه‌کار و آماده‌سازی فایل بانک.",
        "responsibilities": [
            "محاسبه و صدور فیش حقوق ماهانه",
            "بررسی موارد اضافه‌کار غیرعادی",
            "استخراج گزارش HR برای مدیر مالی",
            "هماهنگی با داده پرسنلی workspace",
        ],
        "how_to_steps": [
            "دوره یا ماه موردنظر را انتخاب کنید (مثلاً بهمن ۱۴۰۴).",
            "اقدام «فیش حقوق» را اجرا کنید یا از قالب «حقوق ماهانه» استفاده کنید.",
            "خروجی را در بخش نتایج بخوانید؛ در صورت وجود، لینک گزارش را دانلود کنید.",
            "موارد flagged را در تب «پنل ایجنت» بازبینی کنید.",
        ],
        "inputs": ["دوره / ماه شمسی", "لیست پرسنل (از workspace)"],
        "outputs": ["فیش حقوق", "گزارش اضافه‌کار", "فایل بانک"],
        "tips": ["این ایجنت گفت‌وگوی آزاد ندارد — فقط از اقدامات و قالب‌ها استفاده کنید."],
    },
    "example-worker": {
        "profile": "payroll",
        "domain_label": "مالی · کارگر عملیاتی",
        "headline": "کارگر حقوق و گزارش",
        "summary": "نمونه کارگر مالی: اجرای حقوق دوره‌ای و تولید گزارش بدون چت.",
        "responsibilities": [
            "اجرای حقوق با متغیر period",
            "تولید گزارش مالی از نوع report_type",
        ],
        "how_to_steps": [
            "یکی از کارت‌های اقدام را باز کنید.",
            "متغیرها (دوره یا نوع گزارش) را پر کنید.",
            "«اجرا» را بزنید و نتیجه را در پایین ببینید.",
        ],
        "inputs": ["دوره", "نوع گزارش"],
        "outputs": ["خلاصه حقوق", "فایل گزارش"],
        "tips": ["برای پرسش آزاد از ایجنت example-worker-chat استفاده کنید."],
    },
    "invoice": {
        "profile": "invoice",
        "domain_label": "مالی · فاکتور و دریافت",
        "headline": "صدور و پیگیری فاکتور",
        "summary": "صدور دسته‌ای فاکتور، پیگیری معوقات و گزارش از داده workspace.",
        "responsibilities": [
            "صدور فاکتور برای دسته مشتریان",
            "لیست فاکتورهای معوق",
            "پاسخ به سوالات فاکتور در گفت‌وگو",
        ],
        "how_to_steps": [
            "برای صدور سریع: اقدام «فاکتور دسته‌ای» و نام دسته (A/B) را وارد کنید.",
            "برای پرسش: در گفت‌وگو بپرسید «فاکتورهای معوق دسته A».",
            "از قالب «یادآوری فاکتور» برای لیست خودکار استفاده کنید.",
        ],
        "inputs": ["شناسه دسته (batch)", "سوالات متنی"],
        "outputs": ["لیست فاکتور", "لینک دانلود گزارش"],
        "tips": ["داده نمونه INV-1001 تا INV-1005 در workspace فعال است."],
    },
    "bank-recon": {
        "profile": "bank_recon",
        "domain_label": "مالی · مغایرت بانکی",
        "headline": "تطبیق صورتحساب بانک",
        "summary": "آپلود CSV/PDF بانک و تطبیق با دفتر کل؛ اجرا پس از بارگذاری فایل.",
        "responsibilities": [
            "دریافت فایل تراکنش بانکی",
            "تطبیق خودکار با دفتر",
            "گزارش مغایرت‌ها",
        ],
        "how_to_steps": [
            "فایل CSV یا PDF بانک را در «دریافت فایل» آپلود کنید.",
            "پس از آپلود، ایجنت را اجرا کنید (حداقل یک فایل الزامی است).",
            "موارد مغایرت را در پنل ایجنت و نتایج بررسی کنید.",
        ],
        "inputs": ["فایل CSV تراکنش", "اختیاری: PDF صورتحساب"],
        "outputs": ["گزارش تطبیق", "لیست مغایرت"],
        "tips": ["بدون فایل آپلودشده اجرا مسدود می‌شود."],
    },
    "example-karkard": {
        "profile": "karkard",
        "domain_label": "منابع انسانی · کارکرد",
        "headline": "محاسبه کارکرد ماهانه (اکسل)",
        "summary": "پردازش فایل خام کارکرد طبق دستورالعمل HR و تولید خروجی نهایی.",
        "responsibilities": [
            "دریافت اکسل کارکرد خام",
            "اجرای karkard_process",
            "تحویل فایل پردازش‌شده و لینک دانلود",
        ],
        "how_to_steps": [
            "فایل .xlsx کارکرد را آپلود کنید (یا از نمونه workspace استفاده کنید).",
            "سال شمسی و نام شرکت را در اقدام «محاسبه کارکرد» تنظیم کنید.",
            "اجرا کنید و لینک دانلود خروجی را از نتایج بگیرید.",
        ],
        "inputs": ["فایل xlsx/xls", "سال شمسی", "نام شرکت"],
        "outputs": ["اکسل کارکرد پردازش‌شده"],
        "tips": ["در گفت‌وگو می‌توانید بپرسید «فایل را پردازش کن»."],
    },
    "resume": {
        "profile": "resume",
        "domain_label": "منابع انسانی · استخدام",
        "headline": "غربال و ارزیابی رزومه",
        "summary": "آپلود PDF/TXT رزومه و غربال بر اساس نقش شغلی.",
        "responsibilities": [
            "دریافت رزومه پرسنلی",
            "غربال اولیه بر اساس معیار نقش",
            "اولویت‌بندی برای مصاحبه",
        ],
        "how_to_steps": [
            "رزومه را در بخش «دریافت فایل» آپلود کنید.",
            "در صورت نیاز دستور اجرا را ویرایش کنید.",
            "دکمه «اجرا» را بزنید و نتیجه را در «خروجی اجرا» ببینید.",
        ],
        "inputs": ["PDF یا TXT رزومه"],
        "outputs": ["امتیاز تطابق", "خلاصه نقاط قوت/ضعف"],
        "tips": ["برای غربال تعاملی با چت از example-worker-chat استفاده کنید."],
    },
    "example-worker-chat": {
        "profile": "resume",
        "domain_label": "منابع انسانی · غربال تعاملی",
        "headline": "غربال رزومه + گفت‌وگو",
        "summary": "ترکیب اقدام غربال و پرسش‌های آزاد درباره کاندیداها.",
        "responsibilities": [
            "اجرای غربال با نقش مشخص",
            "پاسخ به سوالات HR در چت",
        ],
        "how_to_steps": [
            "اقدام «غربال رزومه» را با نام نقش اجرا کنید.",
            "یا در گفت‌وگو: «رزومه‌ها را برای مهندس نرم‌افزار غربال کن».",
            "از قالب «غربال دسته‌ای» برای همه فایل‌های جدید استفاده کنید.",
        ],
        "inputs": ["نقش شغلی", "فایل‌های آپلودشده"],
        "outputs": ["خلاصه غربال", "توصیه مصاحبه"],
        "tips": [],
    },
    "support": {
        "profile": "support",
        "domain_label": "پشتیبانی · تیکت",
        "headline": "پاسخ و طبقه‌بندی تیکت",
        "summary": "پیشنهاد پاسخ، خلاصه تیکت و بستن درخواست‌های پشتیبانی.",
        "responsibilities": [
            "خلاصه تیکت مشتری",
            "پیشنهاد پاسخ",
            "اولویت‌بندی",
        ],
        "how_to_steps": [
            "متن تیکت را در گفت‌وگو بچسبانید یا فایل txt آپلود کنید.",
            "از قالب «بستن تیکت» برای پاسخ استاندارد استفاده کنید.",
            "پاسخ را ویرایش و به CRM منتقل کنید.",
        ],
        "inputs": ["متن تیکت", "فایل پیوست اختیاری"],
        "outputs": ["پاسخ پیشنهادی", "برچسب اولویت"],
        "tips": ["تیکت‌های نمونه TK-501 و TK-502 در workspace هستند."],
    },
    "example-chat-files": {
        "profile": "support",
        "domain_label": "پشتیبانی · گفت‌وگو + فایل",
        "headline": "پشتیبانی با پیوست",
        "summary": "گفت‌وگو همراه آپلود فایل txt برای خلاصه تیکت یا مستندات.",
        "responsibilities": [
            "خواندن پیوست متنی",
            "خلاصه و پاسخ",
        ],
        "how_to_steps": [
            "فایل txt را آپلود کنید.",
            "در گفت‌وگو بگویید «این فایل را خلاصه کن».",
            "از قالب «خلاصه تیکت» برای شروع سریع استفاده کنید.",
        ],
        "inputs": ["فایل txt"],
        "outputs": ["خلاصه", "پاسخ پیشنهادی"],
        "tips": [],
    },
    "example-api-connector": {
        "profile": "api",
        "domain_label": "عملیات · یکپارچه‌سازی API",
        "headline": "فراخوانی API خارجی",
        "summary": "اتصال به سرویس HTTPBin نمونه و اجرای endpoint به‌عنوان ابزار.",
        "responsibilities": [
            "بررسی IP عمومی",
            "تست سلامت اتصال API",
            "گزارش وضعیت endpoint",
        ],
        "how_to_steps": [
            "اقدام «بررسی IP عمومی» را بدون ورودی اجرا کنید.",
            "یا در گفت‌وگو بخواهید وضعیت API را چک کند.",
            "از قالب «سلامت API» برای تست دوره‌ای استفاده کنید.",
        ],
        "inputs": [],
        "outputs": ["IP عمومی", "وضعیت HTTP"],
        "tips": ["سرویس httpbin-demo در integrations متصل است."],
    },
    "example-supervisor": {
        "profile": "supervisor",
        "domain_label": "عملیات · سرپرست",
        "headline": "مسیریابی به زیرایجنت‌ها",
        "summary": "درخواست شما را به chat، worker یا file-intake مناسب هدایت می‌کند.",
        "responsibilities": [
            "تشخیص intent درخواست",
            "فراخوانی زیرایجنت مناسب",
            "جمع‌بندی پاسخ نهایی",
        ],
        "how_to_steps": [
            "درخواست خود را به زبان طبیعی بنویسید (مثلاً حقوق یا آپلود فایل).",
            "سرپرست زیرایجنت را انتخاب و نتیجه را برمی‌گرداند.",
            "گراف زیرایجنت‌ها را در پایین صفحه ببینید.",
        ],
        "inputs": ["درخواست متنی"],
        "outputs": ["پاسخ ترکیبی از زیرایجنت"],
        "tips": ["به chat، worker و file-intake متصل است."],
    },
    "example-orchestrator": {
        "profile": "supervisor",
        "domain_label": "عملیات · ارکستراتور",
        "headline": "فراخوانی ایجنت به‌عنوان ابزار",
        "summary": "سوال شما را به example-chat یا example-worker واگذار می‌کند.",
        "responsibilities": [
            "تفویض سوال به دستیار گفت‌وگو",
            "اجرای worker در صورت نیاز",
        ],
        "how_to_steps": [
            "اقدام «واگذاری به گفت‌وگو» با متن سوال را اجرا کنید.",
            "یا در چت مستقیم سوال بپرسید.",
        ],
        "inputs": ["سوال / task"],
        "outputs": ["پاسخ ایجنت فرزند"],
        "tips": ["عمق فراخوانی تا ۴ سطح مجاز است."],
    },
    "example-file-intake": {
        "profile": "file_intake",
        "domain_label": "مالی · دریافت سند",
        "headline": "دریافت و ingest فایل",
        "summary": "آپلود PDF/CSV/TXT برای آرشیو و آماده‌سازی پردازش بعدی.",
        "responsibilities": [
            "اعتبارسنجی نوع و حجم فایل",
            "ذخیره در workspace ایجنت",
            "آماده‌سازی برای RAG",
        ],
        "how_to_steps": [
            "فایل را در بخش دریافت فایل بکشید یا انتخاب کنید.",
            "پس از آپلود موفق، فایل در لیست ظاهر می‌شود.",
            "ایجنت downstream (مثلاً bank-recon) می‌تواند استفاده کند.",
        ],
        "inputs": ["PDF, CSV, TXT"],
        "outputs": ["تأیید دریافت", "شناسه storage"],
        "tips": ["خودش گفت‌وگو ندارد — فقط دریافت."],
    },
    "example-chat": {
        "profile": "generic_chat",
        "domain_label": "عملیات · گفت‌وگو",
        "headline": "دستیار گفت‌وگوی سازمانی",
        "summary": "پاسخ به سوالات عمومی workspace بدون اقدام از پیش تعریف‌شده.",
        "responsibilities": [
            "پاسخ سوالات متنی",
            "راهنمایی کاربر",
        ],
        "how_to_steps": [
            "سوال خود را در کادر گفت‌وگو بنویسید.",
            "Enter یا دکمه ارسال را بزنید.",
            "پاسخ را در همان صفحه بخوانید.",
        ],
        "inputs": ["متن سوال"],
        "outputs": ["پاسخ متنی"],
        "tips": ["ساده‌ترین ایجنت — فقط چت."],
    },
    "example-custom": {
        "profile": "generic_chat",
        "domain_label": "عملیات · سفارشی",
        "headline": "ایجنت سفارشی همه‌کاره",
        "summary": "چت، فایل، اقدام و فراخوانی ایجنت دیگر — برای آزمایش قابلیت‌ها.",
        "responsibilities": [
            "هر ترکیبی از chat / file / action",
            "فراخوانی example-chat به‌عنوان ابزار",
        ],
        "how_to_steps": [
            "قابلیت موردنیاز را انتخاب کنید: چت، آپلود، یا اقدام سفارشی.",
            "متغیر task را در اقدام پر کنید.",
            "نتایج در بخش پایین نمایش داده می‌شود.",
        ],
        "inputs": ["بسته به حالت"],
        "outputs": ["متنوع"],
        "tips": ["برای دمو همه capabilityها فعال است."],
    },
    "general": {
        "profile": "generic_chat",
        "domain_label": "عملیات · دستیار عمومی",
        "headline": "دستیار چندمنظوره سازمان",
        "summary": "پرسش‌های عمومی درباره فرایندها و داده نمونه workspace.",
        "responsibilities": [
            "پاسخ سوالات سازمانی",
            "راهنمایی به ایجنت تخصصی",
        ],
        "how_to_steps": [
            "سوال خود را بنویسید.",
            "برای کار تخصصی (حقوق، فاکتور، …) به ایجنت همان دپارتمان بروید.",
        ],
        "inputs": ["متن"],
        "outputs": ["پاسخ راهنما"],
        "tips": [],
    },
}

_KIND_FALLBACK: dict[AgentKind, str] = {
    AgentKind.SUPERVISOR: "example-supervisor",
    AgentKind.WORKER: "payroll",
    AgentKind.CHAT: "example-chat",
    AgentKind.CUSTOM: "example-custom",
}


def execution_profile_for_agent(agent: Agent) -> dict[str, Any]:
    if agent.slug in AGENT_EXECUTION_BY_SLUG:
        data = dict(AGENT_EXECUTION_BY_SLUG[agent.slug])
    elif (kind := agent.kind.canonical() if hasattr(agent.kind, "canonical") else agent.kind) in _KIND_FALLBACK:
        ref = _KIND_FALLBACK[kind]
        data = dict(AGENT_EXECUTION_BY_SLUG.get(ref, AGENT_EXECUTION_BY_SLUG["general"]))
        data["profile"] = data.get("profile", kind.value)
    elif agent.department == "finance":
        data = dict(AGENT_EXECUTION_BY_SLUG["invoice"])
    elif agent.department == "hr":
        data = dict(AGENT_EXECUTION_BY_SLUG["resume"])
    elif agent.department == "support":
        data = dict(AGENT_EXECUTION_BY_SLUG["support"])
    else:
        data = dict(AGENT_EXECUTION_BY_SLUG["general"])

    data["headline"] = data.get("headline", agent.name)
    if agent.description:
        data["summary"] = agent.description
    return data
