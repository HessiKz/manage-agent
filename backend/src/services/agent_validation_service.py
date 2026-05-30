"""Post-create AI validation for newly created agents."""

from __future__ import annotations

import asyncio
import io
import json
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core import llm_runtime
from src.core.errors import AppError, ErrorCode
from src.core.file_policy import validate_upload
from src.database.session import async_session_maker
from src.models.agent import Agent, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_file import AgentFile
from src.models.notification import NotificationSeverity
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest
from src.schemas.agent_action import AgentActionRunRequest
from src.services.agent_action_service import (
    AgentActionService,
    _has_tool_activity,
    _is_advisory_output,
)
from src.services.notification_service import NotificationService
from src.services.orchestrator_service import OrchestratorService

# Ensure demo/custom tools are registered even in non-API entrypoints (scripts/tests).
import src.agents_lib.custom_tools  # noqa: F401


@dataclass
class ValidationFailure:
    phase: str
    message: str
    fixable_in_admin: bool


class AgentValidationService:
    """Runs smoke tests so new agents are runnable before activation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.orchestrator = OrchestratorService(db)
        self.actions = AgentActionService(db)
        self.notifications = NotificationService(db)
        self.step_timeout_s = max(30, int(settings.agent_validation_timeout_seconds))
        if llm_runtime.active_provider() == "cursor":
            self.step_timeout_s = max(self.step_timeout_s, 600)
        self.step_retries = 1

    async def validate_after_create(self, agent: Agent, owner: User) -> None:
        failures: list[ValidationFailure] = []
        attached_file: AgentFile | None = None
        agent_id = agent.id

        try:
            await self._publish_phase(agent_id, "starting")

            if (agent.capabilities or {}).get("file_upload_enabled"):
                await self._publish_phase(agent_id, "file_setup")
                try:
                    attached_file = await self._ensure_sample_file(agent)
                except Exception as exc:  # noqa: BLE001
                    failures.append(
                        ValidationFailure(
                            phase="file_setup",
                            message=f"{type(exc).__name__}: {exc}",
                            fixable_in_admin=self._is_fixable(exc),
                        )
                    )

            if (agent.capabilities or {}).get("chat_enabled", True):
                await self._publish_phase(agent_id, "invoke")
                try:
                    await self._run_with_timeout_retry(
                        lambda: self.orchestrator.invoke(
                            agent.id,
                            AgentInvokeRequest(
                                input=self._smoke_prompt(agent, attached_file),
                                thread_id=f"validate-create-{uuid4().hex[:8]}",
                                stream=False,
                            ),
                            owner,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    failures.append(
                        ValidationFailure(
                            phase="invoke",
                            message=f"{type(exc).__name__}: {exc}",
                            fixable_in_admin=self._is_fixable(exc),
                        )
                    )

            if (agent.capabilities or {}).get("actions_enabled"):
                action_rows = await self._list_actions(agent.id)
                for action in action_rows:
                    await self._publish_phase(agent_id, f"action:{action.slug}")
                    try:
                        vars_map = self._action_variables(action)
                        if attached_file:
                            vars_map.setdefault("storage_path", attached_file.storage_path)
                        async def _run_action(
                            _slug: str = action.slug,
                            _vars: dict = vars_map,
                            _tool_chain: list = list(action.tool_chain or []),
                        ) -> None:
                            response = await self.actions.run(
                                agent.id,
                                _slug,
                                AgentActionRunRequest(
                                    variables=_vars,
                                    thread_id=f"validate-action-{_slug}-{uuid4().hex[:6]}",
                                ),
                                owner,
                            )
                            if _is_advisory_output(response.output) or (
                                _tool_chain and not _has_tool_activity(response)
                            ):
                                raise ValueError(
                                    (response.output or "Action did not execute tools")[:300]
                                )

                        await self._run_with_timeout_retry(_run_action)
                    except Exception as exc:  # noqa: BLE001
                        failures.append(
                            ValidationFailure(
                                phase=f"action:{action.slug}",
                                message=f"{type(exc).__name__}: {exc}",
                                fixable_in_admin=self._is_fixable(exc),
                            )
                        )

            await self._publish_phase(agent_id, "finishing")
            report = {
                "validated": True,
                "ok": not failures,
                "state": "done",
                "current_phase": "done",
                "failures": [f.__dict__ for f in failures],
            }
            fresh = await self.db.get(Agent, agent.id)
            if not fresh:
                return
            agent = fresh
            cfg = dict(agent.config_json or {})
            cfg["validation"] = report
            agent.config_json = cfg
            if agent.status == AgentStatus.PAUSED:
                await self.db.commit()
                return
            if not failures:
                agent.status = AgentStatus.ACTIVE
            elif any(f.fixable_in_admin for f in failures):
                agent.status = AgentStatus.ERROR
            else:
                agent.status = AgentStatus.DRAFT

            await self._notify_owner_result(agent, owner, failures)
            if failures:
                await self._notify_admins_if_fixable(agent, failures)

            await self.db.commit()
            await self.db.refresh(agent)
        except Exception:  # noqa: BLE001
            await self.db.rollback()
            raise

    async def _publish_phase(self, agent_id, phase: str) -> None:
        """Expose live validation progress (short-lived session — don't block auth during LLM)."""
        async with async_session_maker() as db:
            agent = await db.get(Agent, agent_id)
            if not agent or agent.status == AgentStatus.PAUSED:
                return
            cfg = dict(agent.config_json or {})
            validation = dict(cfg.get("validation") or {})
            validation["state"] = "running"
            validation["current_phase"] = phase
            cfg["validation"] = validation
            agent.config_json = cfg
            await db.commit()

    async def _list_actions(self, agent_id) -> list[AgentAction]:
        result = await self.db.execute(
            select(AgentAction).where(AgentAction.agent_id == agent_id).order_by(AgentAction.order_index)
        )
        return list(result.scalars().all())

    async def _ensure_sample_file(self, agent: Agent) -> AgentFile:
        filename, mime, raw = self._build_sample_file(agent)
        await validate_upload(self.db, agent, filename=filename, mime_type=mime, size_bytes=len(raw))

        base_dir = Path("var/agent_files") / str(agent.id)
        base_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}_{filename}"
        storage_path = base_dir / storage_name
        storage_path.write_bytes(raw)

        row = AgentFile(
            agent_id=agent.id,
            filename=filename,
            mime_type=mime,
            size_bytes=len(raw),
            storage_path=str(storage_path),
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    def _build_sample_file(self, agent: Agent) -> tuple[str, str, bytes]:
        policy = agent.file_policy or {}
        exts = [str(e).lower() for e in (policy.get("allowed_extensions") or [])]
        tools = {t.lower() for t in (agent.tool_names or [])}

        if "karkard_process" in tools or ".xlsx" in exts or ".xls" in exts:
            return self._xlsx_sample()
        if ".csv" in exts:
            return ("sample.csv", "text/csv", b"name,score\nAli,90\nSara,88\n")
        if ".txt" in exts or not exts:
            return ("sample.txt", "text/plain", b"Sample validation file for agent smoke test.")
        if ".pdf" in exts:
            return ("sample.txt", "text/plain", b"Fallback sample for validation.")
        return ("sample.txt", "text/plain", b"Sample validation file.")

    def _xlsx_sample(self) -> tuple[str, str, bytes]:
        wb = Workbook()
        ws = wb.active
        ws.title = "کارکرد"
        ws.append(["نام", "روز", "ورود", "خروج"])
        ws.append(["نمونه", "1405-01-01", "08:00", "16:00"])
        ws.append(["نمونه", "1405-01-02", "08:10", "16:20"])
        buff = io.BytesIO()
        wb.save(buff)
        return (
            "sample.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buff.getvalue(),
        )

    def _smoke_prompt(self, agent: Agent, attached_file: AgentFile | None) -> str:
        tools = {str(t).lower() for t in (agent.tool_names or [])}
        if attached_file:
            ctx = json.dumps(
                {
                    "storage_path": attached_file.storage_path,
                    "agent_id": str(agent.id),
                },
                ensure_ascii=False,
            )
            if "karkard_process" in tools:
                return (
                    "Automatic validation run. "
                    f"Context for tools (use these exact values when calling tools):\n{ctx}\n"
                    "Process the uploaded karkard spreadsheet with karkard_process "
                    "and return a short confirmation with the download link."
                )
            return (
                "This is an automatic validation run. "
                f"Context for tools (use these exact values when calling tools):\n{ctx}\n"
                "Use the already uploaded file and return a short result confirming execution."
            )
        if "resume_screen" in tools:
            return (
                "Automatic validation run. You MUST call resume_screen with "
                'role="Backend Engineer" and min_score=6, then return a one-line summary '
                "with how many candidates passed."
            )
        return "This is an automatic validation run. Return a one-line successful response."

    @staticmethod
    def _schema_properties(schema: dict | None) -> dict:
        if not isinstance(schema, dict):
            return {}
        props = schema.get("properties")
        if isinstance(props, dict):
            return props
        skip = frozenset({"properties", "required", "type", "$schema"})
        return {
            k: v
            for k, v in schema.items()
            if k not in skip and isinstance(v, dict)
        }

    def _action_variables(self, action: AgentAction) -> dict:
        props = self._schema_properties(action.input_schema)
        tool_chain = [str(t) for t in (action.tool_chain or [])]
        needs_role = "resume_screen" in tool_chain

        out: dict = {}
        for key, meta in props.items():
            if isinstance(meta, dict) and "default" in meta:
                out[key] = meta["default"]
                continue
            t = meta.get("type") if isinstance(meta, dict) else "string"
            if t in ("integer", "number"):
                out[key] = 1
            elif t == "boolean":
                out[key] = True
            else:
                out[key] = "sample"

        if needs_role:
            role = str(out.get("role", "")).strip()
            if not role or role.lower() in {"sample", "python", "test"}:
                out["role"] = "Backend Engineer"
        return out

    async def _notify_owner_result(
        self, agent: Agent, owner: User, failures: list[ValidationFailure]
    ) -> None:
        testing_link = f"/agents/create/testing?slug={agent.slug}"
        fix_link = f"/agents/{agent.slug}/fix"
        if not failures:
            await self.notifications.create(
                user_id=owner.id,
                title=f"ایجنت «{agent.name}» آماده است",
                message="تست خودکار با موفقیت انجام شد. می‌توانید ایجنت را باز کنید.",
                severity=NotificationSeverity.SUCCESS,
                link=testing_link,
                meta={
                    "agent_id": str(agent.id),
                    "agent_slug": agent.slug,
                    "validation_ok": True,
                },
            )
            return

        fixable = [f for f in failures if f.fixable_in_admin]
        if fixable:
            short = "; ".join(f"{f.phase}: {f.message[:100]}" for f in fixable[:2])
            await self.notifications.create(
                user_id=owner.id,
                title=f"خطا در تست ایجنت «{agent.name}»",
                message=f"تنظیمات ایجنت نیاز به اصلاح دارد. {short}",
                severity=NotificationSeverity.ERROR,
                link=fix_link,
                meta={
                    "agent_id": str(agent.id),
                    "agent_slug": agent.slug,
                    "validation_ok": False,
                    "fixable": True,
                },
            )
            return

        await self.notifications.create(
            user_id=owner.id,
            title=f"تست ایجنت «{agent.name}» ناموفق بود",
            message="مشکل موقت یا زیرساختی رخ داد. بعداً دوباره تست کنید یا با پشتیبانی تماس بگیرید.",
            severity=NotificationSeverity.WARNING,
            link=testing_link,
            meta={
                "agent_id": str(agent.id),
                "agent_slug": agent.slug,
                "validation_ok": False,
                "fixable": False,
            },
        )

    async def _notify_admins_if_fixable(self, agent: Agent, failures: list[ValidationFailure]) -> None:
        fixable = [f for f in failures if f.fixable_in_admin]
        if not fixable:
            return

        result = await self.db.execute(select(User).where(User.is_superuser.is_(True), User.is_active.is_(True)))
        admins = list(result.scalars().all())
        if not admins:
            return

        short = "; ".join(f"{f.phase}: {f.message[:120]}" for f in fixable[:3])
        if len(fixable) > 3:
            short += f" (+{len(fixable) - 3} more)"

        for admin in admins:
            await self.notifications.create(
                user_id=admin.id,
                title=f"Agent validation failed: {agent.name}",
                message=f"Fixable configuration issues detected. {short}",
                severity=NotificationSeverity.ERROR,
                link=f"/agents/{agent.slug}/fix",
                meta={
                    "agent_id": str(agent.id),
                    "agent_slug": agent.slug,
                    "fixable_count": len(fixable),
                },
            )

    async def _run_with_timeout_retry(self, task_factory):
        last_exc: Exception | None = None
        for _ in range(self.step_retries + 1):
            try:
                return await asyncio.wait_for(task_factory(), timeout=self.step_timeout_s)
            except asyncio.TimeoutError as exc:
                last_exc = exc
                continue
        if last_exc:
            raise last_exc

    def _is_fixable(self, exc: Exception) -> bool:
        if isinstance(exc, asyncio.TimeoutError):
            return False

        if isinstance(exc, HTTPException):
            return 400 <= int(exc.status_code) < 500

        if isinstance(exc, AppError):
            if exc.code in (ErrorCode.LLM_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE):
                return False
            if exc.code == ErrorCode.ORCHESTRATION_FAILED:
                detail_type = ""
                if isinstance(exc.details, dict):
                    detail_type = str(exc.details.get("type") or "")
                non_fixable_types = {
                    "PermissionError",
                    "ConnectTimeout",
                    "TimeoutException",
                    "ReadTimeout",
                    "TimeoutError",
                }
                return detail_type not in non_fixable_types
            return exc.status_code < 500

        name = type(exc).__name__
        if name in {"BadRequestError", "ValidationError", "NotImplementedError", "KeyError"}:
            return True

        msg = str(exc).lower()
        fixable_tokens = (
            "tool",
            "model",
            "file type not allowed",
            "max file",
            "permission denied",
            "chat is disabled",
            "actions are disabled",
            "max agent call depth",
            "deprecated for this model",
        )
        return any(token in msg for token in fixable_tokens)
