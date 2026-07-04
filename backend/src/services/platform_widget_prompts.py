"""Default LLM prompts when support generates widgets without an explicit prompt."""

from __future__ import annotations

from src.models.agent import Agent


def default_widget_prompt(agent: Agent, widget_type: str) -> str:
    name = agent.name or agent.slug
    if widget_type == "stat_cards":
        return (
            f"برای ایجنت «{name}» پنل KPI با عنوان «شاخص‌های کلیدی {name}» بساز. "
            "کارت‌های آماری: ۱) تعداد اجرا (امروز) با درصد تغییر نسبت به دیروز، "
            "۲) نرخ موفقیت (۷ روز اخیر)، ۳) میانگین زمان پاسخ (ثانیه)، "
            "۴) کاربران فعال هفته، ۵) آخرین اجرا (زمان نسبی + وضعیت)، "
            "۶) رضایت کاربر (۰ تا ۵). داده نمونه واقع‌گرایانه و برچسب فارسی."
        )
    if widget_type == "line_chart":
        return (
            f"نمودار خطی «روند فعالیت {name}» با چند سری (اجرای موفق، خطا) "
            "و نقاط زمانی ۷ روز اخیر."
        )
    if widget_type == "pie_chart":
        return f"نمودار دایره‌ای توزیع نتایج یا دسته‌بندی فعالیت برای ایجنت «{name}»."
    if widget_type == "review_table":
        return f"جدول بازبینی موارد نیازمند تأیید انسانی برای ایجنت «{name}»."
    if widget_type == "hr_savings":
        return f"ویجت صرفه‌جویی HR برای ایجنت «{name}»."
    return f"پنل داشبورد اختصاصی برای ایجنت «{name}»."
