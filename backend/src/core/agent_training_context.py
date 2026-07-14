"""Shared helpers for interactive admin training phase."""

from __future__ import annotations

from src.models.agent import Agent
from src.schemas.agent_capabilities import AgentFilePolicy

TRAINING_ATTACHMENT_POLICY = AgentFilePolicy(
    min_files=0,
    max_files=10,
    max_file_size_mb=25,
    max_total_size_mb=150,
    allowed_mime_types=[
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    allowed_extensions=[".pdf", ".txt", ".csv", ".xlsx", ".xls", ".doc", ".docx"],
    require_files_to_invoke=False,
    auto_ingest_to_rag=True,
)


def training_session_active(validation: dict | None) -> bool:
    """True while wizard interactive training is in progress (incl. legacy pending)."""
    if not isinstance(validation, dict):
        return False
    if validation.get("training_completed"):
        return False
    state = validation.get("state")
    phase = validation.get("current_phase")
    if state in (None, "pending", "runtime_prepare", "training"):
        return True
    if phase in ("runtime_prepare", "training"):
        return True
    return False


def agent_in_interactive_training(agent: Agent) -> bool:
    cfg = agent.config_json or {}
    return training_session_active(cfg.get("validation"))


def training_calibration_prefix(agent: Agent) -> str:
    caps = agent.capabilities if isinstance(agent.capabilities, dict) else {}
    parts = [
        "[جلسه کالیبراسیون — ایجنت از قبل دستورالعمل دارد؛ "
        "فرمت، لحن و ساختار پاسخ را با انتظار ادمین هماهنگ کن. "
        "ادمین قابلیت‌های واقعی این ایجنت را در این جلسه تست می‌کند.]"
    ]
    if caps.get("supervisor_enabled"):
        parts.append("[تست سرپرست: در صورت مناسب بودن به زیرایجنت مسیریابی کن.]")
    if caps.get("can_call_agents"):
        parts.append("[تست: ایجنت‌های متصل را در صورت نیاز فراخوانی کن.]")
    if caps.get("external_apis_enabled"):
        parts.append("[تست API: از endpointهای متصل درخواست نمونه بزن.]")
    if caps.get("file_upload_enabled"):
        parts.append("[تست فایل: به فایل‌های آپلودشده در workspace اشاره کن.]")
    tool_names = list(agent.tool_names or [])
    if "run_agent_script" in tool_names:
        parts.append(
            "[پردازش فایل: برای پردازش فایل آپلودشده حتماً ابزار run_agent_script را فراخوانی کن؛ "
            "محاسبه دستی در متن و ساخت لینک ساختگی ممنوع است.]"
        )
    if caps.get("actions_enabled") and not caps.get("chat_enabled"):
        parts.append("[ایجنت worker — خروجی را در قالب نتیجه اقدام بده.]")
    return " ".join(parts)
