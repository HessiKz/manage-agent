from src.core.chat_sanitize import sanitize_chat_output

SAMPLE_TICKET_REPLY = """می‌تونیم یک پاسخ حرفه‌ای و در عین حال دوستانه برای بستن تیکت آماده کنیم. چون جزئیات تیکت مشخص نیست، یک متن عمومی ولی قابل استفاده می‌دم که اگر خواستی می‌تونیم دقیق‌ترش کنیم:

:::writing
سلام جناب کاظمی،

در خصوص درخواست ثبت‌شده، بررسی‌های لازم انجام شد و مورد اعلامی برطرف گردید. در حال حاضر سیستم در وضعیت عادی قرار دارد.

لطفاً در صورت مشاهده هرگونه مشکل یا نیاز به پیگیری بیشتر، از طریق همین تیکت اطلاع دهید تا در سریع‌ترین زمان رسیدگی شود.

با سپاس
واحد پشتیبانی
:::

اگر بگی موضوع تیکت چی بوده (مثلاً TK-501 یا TK-502)، می‌تونم متن رو دقیق‌تر و حرفه‌ای‌تر برات شخصی‌سازی کنم."""


def test_extracts_writing_fence_and_strips_meta():
    out = sanitize_chat_output(SAMPLE_TICKET_REPLY)
    assert ":::writing" not in out
    assert "می‌تونیم یک پاسخ" not in out
    assert "اگر بگی موضوع تیکت" not in out
    assert "سلام جناب کاظمی" in out
    assert "واحد پشتیبانی" in out


def test_plain_text_unchanged():
    text = "سلام\n\nوضعیت عادی است."
    assert sanitize_chat_output(text) == text


def test_empty_passthrough():
    assert sanitize_chat_output("") == ""
