"""Restore demo conversations, execution history, audit feed, and Redis threads."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from src.agents_lib.memory import ConversationMemory
from src.config import settings
from src.core.catalog import CATALOG_SLUGS
from src.database.seed import SAMPLE_AUDIT, SAMPLE_NOTIFICATIONS
from src.database.session import async_session_maker
from src.models.activity_log import ActivityLog, ActivityStatus
from src.models.agent import Agent
from src.models.agent_permission import AgentUserPermission
from src.models.audit_log import AuditLog
from src.models.notification import Notification
from src.models.user import User

# Minimum catalog-scoped invoke rows before we skip re-seeding.
_MIN_CATALOG_INVOKES = 12


def _thread_id(user_id, agent_id: str) -> str:
    return f"user-{user_id}:agent-{agent_id}"


def _seed_thread(thread_id: str, messages: list[tuple[str, str]]) -> None:
    ConversationMemory.clear(thread_id)
    for role, content in messages:
        ConversationMemory.append(thread_id, {"role": role, "content": content})


async def ensure_demo_history(*, force: bool = False) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    stats = {"activity": 0, "audit": 0, "notifications": 0, "permissions": 0}

    async with async_session_maker() as db:
        agents = {
            a.slug: a
            for a in (await db.execute(select(Agent))).scalars().all()
        }
        users = {
            u.email: u
            for u in (await db.execute(select(User))).scalars().all()
        }
        admin = users.get(settings.first_admin_email.lower()) or users.get("admin@example.com")
        finance = users.get("finance@example.com")
        hr = users.get("hr@example.com")

        catalog_invokes = (
            await db.execute(
                select(func.count(ActivityLog.id))
                .join(Agent, Agent.id == ActivityLog.agent_id)
                .where(
                    Agent.slug.in_(CATALOG_SLUGS),
                    ActivityLog.action == "invoke",
                )
            )
        ).scalar_one()

        if catalog_invokes >= _MIN_CATALOG_INVOKES and not force:
            print(f"demo_history_skip catalog_invokes={catalog_invokes}")
            return stats

        demos: list[dict] = []

        def add_demo(
            *,
            slug: str,
            user: User,
            input_text: str,
            output_text: str,
            days_ago: float,
            hours_ago: float = 0,
            action: str = "invoke",
            tokens_in: int = 12,
            tokens_out: int = 48,
            cost: str = "0.00012",
            thread_messages: list[tuple[str, str]] | None = None,
        ) -> None:
            agent = agents.get(slug)
            if not agent or not user:
                return
            started = now - timedelta(days=days_ago, hours=hours_ago)
            completed = started + timedelta(seconds=4, milliseconds=800)
            thread_id = _thread_id(user.id, agent.id)
            demos.append(
                {
                    "agent": agent,
                    "user": user,
                    "action": action,
                    "input_text": input_text,
                    "output_text": output_text,
                    "started": started,
                    "completed": completed,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "cost": cost,
                    "thread_id": thread_id,
                    "thread_messages": thread_messages
                    or [
                        ("user", input_text),
                        ("assistant", output_text),
                    ],
                }
            )

        add_demo(
            slug="payroll",
            user=admin,
            input_text="حقوق پرسنل واحد مالی برای آبان را محاسبه و مغایرت‌ها را گزارش کن.",
            output_text=(
                "### گزارش حقوق آبان\n\n"
                "۴۲ فیش حقوقی صادر شد. ۳ مورد اضافه‌کار بالای سقف شناسایی شد.\n"
                "فایل خروجی در پیوست آماده است."
            ),
            days_ago=1,
            hours_ago=2,
            thread_messages=[
                ("user", "حقوق پرسنل واحد مالی برای آبان را محاسبه کن."),
                (
                    "assistant",
                    "فایل تردد دریافت شد. در حال اعمال ضرایب اضافه‌کار و کسورات…",
                ),
                ("user", "مغایرت‌ها را هم در گزارش بیاور."),
                (
                    "assistant",
                    "### گزارش حقوق آبان\n\n۴۲ فیش صادر شد. ۳ مورد اضافه‌کار بالای سقف.",
                ),
            ],
        )
        add_demo(
            slug="payroll",
            user=finance or admin,
            input_text="فیش حقوق پرسنل ۱۰۴۲ را با ماه قبل مقایسه کن.",
            output_text="مغایرت ۸٪ در اضافه‌کار — احتمال تأخیر در ثبت شیفت شب.",
            days_ago=3,
        )
        add_demo(
            slug="invoice",
            user=finance or admin,
            input_text="فاکتورهای معوق بالای ۱۰ میلیون تومان را لیست کن.",
            output_text="۳ فاکتور معوق: INV-4402، INV-4398، INV-4381 — جمع ۴۲.۶M",
            days_ago=2,
            hours_ago=5,
        )
        add_demo(
            slug="bank-recon",
            user=finance or admin,
            input_text="مغایرت‌های دیروز بین بانک ملت و دفتر کل را نشان بده.",
            output_text="۷ تراکنش بدون تطبیق — ۲ مورد بالای ۵۰M نیازمند تأیید مدیر مالی.",
            days_ago=4,
        )
        add_demo(
            slug="resume",
            user=hr or admin,
            input_text="رزومه‌های جدید امروز را غربال کن و ۵ نفر برتر را پیشنهاد بده.",
            output_text="از ۱۸ رزومه، ۵ نفر برای مصاحبه فنی پیشنهاد شدند (امتیاز ۷۸+).",
            days_ago=1,
            hours_ago=8,
        )
        add_demo(
            slug="resume",
            user=hr or admin,
            input_text="برای موقعیت «تحلیلگر داده» چه مهارت‌هایی کم است؟",
            output_text="در ۶ رزومه، Python و SQL قوی است؛ تجربه BI و داشبورد ضعیف‌تر دیده شد.",
            days_ago=5,
        )
        add_demo(
            slug="example-chat",
            user=admin,
            input_text="وضعیت سفارش‌های در حال ارسال را خلاصه کن.",
            output_text="۱۲ سفارش در مسیر — ۲ مورد با تأخیر تحویل در تهران.",
            days_ago=0,
            hours_ago=6,
        )
        add_demo(
            slug="example-karkard",
            user=admin,
            input_text="فایل کارکرد مهر را طبق دستورالعمل پردازش کن.",
            output_text="۴۷ پرسنل پردازش شد. خروجی اکسل با ۳ شیت آماده دانلود است.",
            days_ago=6,
        )
        add_demo(
            slug="general",
            user=admin,
            input_text="خلاصه وضعیت عملیات امروز را بده.",
            output_text="۳ ایجنت فعال، ۱۲ اجرای موفق در ۲۴ ساعت گذشته، بدون خطای بحرانی.",
            days_ago=0,
            hours_ago=1,
        )
        add_demo(
            slug="example-worker",
            user=admin,
            input_text="گزارش حقوق هفتگی را تولید کن.",
            output_text="گزارش worker در صف خروجی — ۱۴ ردیف با وضعیت تأیید.",
            days_ago=2,
            hours_ago=11,
            action="action:run_payroll",
        )
        add_demo(
            slug="example-file-intake",
            user=admin,
            input_text="[فایل: onboarding-checklist.pdf]",
            output_text="فایل دریافت و ایندکس شد. ۴ بخش قابل جستجو در پایگاه دانش.",
            days_ago=7,
        )
        add_demo(
            slug="support",
            user=admin,
            input_text="چطور ایجنت جدید بسازم؟",
            output_text="از منوی ایجنت‌ها → ایجاد ایجنت → انتشار → آموزش تعاملی.",
            days_ago=0,
            hours_ago=3,
        )
        add_demo(
            slug="invoice",
            user=admin,
            input_text="آیا فاکتور ۴۴۱۰ با سفارش خرید ۹۸۷ تطبیق دارد؟",
            output_text="بله — مبلغ و تاریخ تطبیق دارد؛ آماده تأیید نهایی.",
            days_ago=8,
        )
        add_demo(
            slug="payroll",
            user=admin,
            input_text="گزارش اضافه‌کار واحد تولید در هفته گذشته.",
            output_text="مجموع ۳۱۸ ساعت — ۲ نفر بالای سقف ۱۲۰ ساعت.",
            days_ago=9,
        )

        for spec in demos:
            db.add(
                ActivityLog(
                    agent_id=spec["agent"].id,
                    user_id=spec["user"].id,
                    action=spec["action"],
                    status=ActivityStatus.SUCCESS,
                    input_text=spec["input_text"],
                    output_text=spec["output_text"],
                    details={"thread_id": spec["thread_id"], "seeded": True},
                    tokens_input=spec["tokens_in"],
                    tokens_output=spec["tokens_out"],
                    cost_usd=Decimal(spec["cost"]),
                    duration_ms=4800,
                    started_at=spec["started"],
                    completed_at=spec["completed"],
                )
            )
            _seed_thread(spec["thread_id"], spec["thread_messages"])
            stats["activity"] += 1

        audit_count = (await db.execute(select(func.count(AuditLog.id)))).scalar_one()
        if audit_count < len(SAMPLE_AUDIT) or force:
            if force and audit_count:
                await db.execute(AuditLog.__table__.delete())
            for cfg in SAMPLE_AUDIT:
                db.add(AuditLog(**cfg))
            stats["audit"] = len(SAMPLE_AUDIT)

        if admin:
            notif_count = (
                await db.execute(
                    select(func.count(Notification.id)).where(
                        Notification.user_id == admin.id
                    )
                )
            ).scalar_one()
            if notif_count < 5 or force:
                for title, message, severity, link in SAMPLE_NOTIFICATIONS[:4]:
                    db.add(
                        Notification(
                            user_id=admin.id,
                            title=title,
                            message=message,
                            severity=severity,
                            link=link,
                            is_read=False,
                        )
                    )
                stats["notifications"] = min(4, len(SAMPLE_NOTIFICATIONS))

        for email, slugs in (
            ("finance@example.com", ("payroll", "invoice", "bank-recon")),
            ("hr@example.com", ("resume",)),
        ):
            user = users.get(email)
            if not user:
                continue
            for slug in slugs:
                agent = agents.get(slug)
                if not agent:
                    continue
                exists = (
                    await db.execute(
                        select(AgentUserPermission).where(
                            AgentUserPermission.user_id == user.id,
                            AgentUserPermission.agent_id == agent.id,
                        )
                    )
                ).scalar_one_or_none()
                if exists:
                    continue
                db.add(
                    AgentUserPermission(
                        user_id=user.id,
                        agent_id=agent.id,
                        can_invoke=True,
                        can_configure=False,
                    )
                )
                stats["permissions"] += 1

        await db.commit()

    return stats


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Seed demo history on manage-agent")
    parser.add_argument("--force", action="store_true", help="Re-seed even if data exists")
    args = parser.parse_args()
    stats = asyncio.run(ensure_demo_history(force=args.force))
    print("ensure_demo_history:", stats)


if __name__ == "__main__":
    main()
