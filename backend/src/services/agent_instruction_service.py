"""Generate professional system prompts from admin instructions and files."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.agents_lib.agent_factory import _supports_temperature
from src.core import llm_runtime
from src.core.agent_file_roles import display_agent_filename, is_instruction_file
from src.core.file_text_extract import extract_text
from src.models.agent import Agent
from src.models.agent_file import AgentFile

_MAX_FILE_CHARS = 24_000
_MAX_TOTAL_FILE_CHARS = 48_000
_RULE_LINE_RE = re.compile(
    r"(?:^|\n)\s*(?:[-•*]|\d+[.)])\s*(.+)|(?:^|\n)\s*((?:پنجشنبه|جمعه|اضافه|کسر|موظف|ستون|فرمول|تعطیل|ساعت).{8,120})",
    re.MULTILINE,
)


def _build_llm() -> ChatOpenAI | None:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        return None
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 180,
        "max_retries": 1,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.2
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _shorten(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n[... متن کوتاه شد ...]"


def _kind_value(agent: Agent) -> str:
    return str(getattr(getattr(agent, "kind", None), "value", getattr(agent, "kind", "")))


def _capability_labels(agent: Agent) -> str:
    labels = {
        "chat_enabled": "گفت‌وگو",
        "file_upload_enabled": "دریافت فایل",
        "actions_enabled": "اقدامات",
        "templates_enabled": "قالب‌ها",
        "can_call_agents": "فراخوانی ایجنت",
        "supervisor_enabled": "سرپرست",
        "external_apis_enabled": "API خارجی",
    }
    caps = agent.capabilities or {}
    active = [label for key, label in labels.items() if caps.get(key)]
    return "، ".join(active) if active else "—"


def _heuristic_rules_from_text(text: str, *, source: str) -> list[dict[str, str]]:
    rules: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in _RULE_LINE_RE.finditer(text or ""):
        line = (match.group(1) or match.group(2) or "").strip()
        if len(line) < 8 or line in seen:
            continue
        seen.add(line)
        rules.append({"text": line, "source": source, "confidence": "heuristic"})
    return rules[:40]


def _parse_rules_json(raw: str) -> list[dict[str, str]]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            return []
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, str]] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            out.append({"text": item.strip(), "source": "llm", "confidence": "extracted"})
        elif isinstance(item, dict):
            rule_text = str(item.get("text") or item.get("rule") or "").strip()
            if rule_text:
                out.append(
                    {
                        "text": rule_text,
                        "source": str(item.get("source") or "llm"),
                        "confidence": str(item.get("confidence") or "extracted"),
                    }
                )
    return out[:60]


def _rules_block(rules: list[dict[str, str]]) -> str:
    if not rules:
        return "—"
    return "\n".join(f"- {r['text']}" for r in rules)


class AgentInstructionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_agent(self, agent_id: UUID) -> Agent:
        agent = (
            await self.db.execute(select(Agent).where(Agent.id == agent_id))
        ).scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return agent

    async def _instruction_files(self, agent_id: UUID) -> list[AgentFile]:
        rows = (
            await self.db.execute(
                select(AgentFile)
                .where(AgentFile.agent_id == agent_id)
                .order_by(AgentFile.created_at.desc())
            )
        ).scalars().all()
        return [row for row in rows if is_instruction_file(row.filename)]

    def _extract_file_blocks(self, files: list[AgentFile]) -> list[dict[str, str]]:
        blocks: list[dict[str, str]] = []
        used = 0
        for row in files:
            path = Path(row.storage_path)
            if not path.is_file():
                continue
            raw = path.read_bytes()
            text = extract_text(raw, row.mime_type, row.filename)
            if not text or len(text.strip()) < 10:
                continue
            remaining = max(0, _MAX_TOTAL_FILE_CHARS - used)
            if remaining <= 0:
                break
            clipped = _shorten(text, min(_MAX_FILE_CHARS, remaining))
            used += len(clipped)
            blocks.append(
                {
                    "filename": display_agent_filename(row.filename),
                    "text": clipped,
                }
            )
        return blocks

    def fingerprint(self, agent: Agent, instruction_text: str, blocks: list[dict[str, str]]) -> str:
        payload = {
            "name": agent.name,
            "description": agent.description or "",
            "department": agent.department or "",
            "kind": _kind_value(agent),
            "capabilities": agent.capabilities or {},
            "tool_names": list(agent.tool_names or []),
            "instruction_text": instruction_text.strip(),
            "files": blocks,
        }
        raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    async def extract_rules(
        self,
        agent: Agent,
        instruction_text: str,
        blocks: list[dict[str, str]],
    ) -> tuple[list[dict[str, str]], str]:
        """Return (rules, extraction_status)."""
        corpus_parts = [instruction_text.strip()] if instruction_text.strip() else []
        for block in blocks:
            corpus_parts.append(f"### {block['filename']}\n{block['text']}")
        corpus = "\n\n".join(corpus_parts).strip()
        if not corpus:
            return [], "empty"

        llm = _build_llm()
        if llm:
            sys = (
                "Extract authoritative business rules from Persian enterprise agent instructions. "
                "Return ONLY a JSON array of objects: "
                '[{"text":"rule in Persian","source":"filename or admin_text"}]. '
                "Include workday rules, overtime, columns, formulas, output format, validation, edge cases."
            )
            user = f"Agent: {agent.name}\nKind: {_kind_value(agent)}\n\nInstructions:\n{corpus[:48000]}"
            try:
                result = await llm.ainvoke(
                    [{"role": "system", "content": sys}, {"role": "user", "content": user}]
                )
                rules = _parse_rules_json((getattr(result, "content", None) or str(result)).strip())
                if rules:
                    return rules, "ready"
            except Exception:
                pass

        rules: list[dict[str, str]] = []
        if instruction_text.strip():
            rules.extend(_heuristic_rules_from_text(instruction_text, source="admin_text"))
        for block in blocks:
            rules.extend(_heuristic_rules_from_text(block["text"], source=block["filename"]))
        deduped: list[dict[str, str]] = []
        seen: set[str] = set()
        for rule in rules:
            key = rule["text"]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(rule)
        return deduped, "fallback" if deduped else "failed"

    def fallback_prompt(
        self,
        agent: Agent,
        instruction_text: str,
        blocks: list[dict[str, str]],
        rules: list[dict[str, str]] | None = None,
    ) -> str:
        parts = [
            f"تو ایجنت سازمانی «{agent.name}» هستی.",
            f"بخش: {agent.department or 'عملیات'}",
            f"نوع ایجنت: {_kind_value(agent)}",
            f"قابلیت‌های فعال: {_capability_labels(agent)}",
        ]
        if agent.description:
            parts.append(f"هدف ایجنت: {agent.description.strip()}")
        if instruction_text.strip():
            parts.append(f"دستورالعمل ادمین:\n{instruction_text.strip()}")
        rule_list = rules or []
        if rule_list:
            parts.append(f"قوانین الزام‌آور استخراج‌شده:\n{_rules_block(rule_list)}")
        for block in blocks:
            parts.append(f"محتوای فایل دستورالعمل «{block['filename']}»:\n{block['text']}")
        parts.append(
            "این قوانین در زمان ساخت ایجنت تثبیت شده‌اند — در اجرا دوباره فایل دستورالعمل را "
            "به‌عنوان داده ورودی تفسیر نکن. بر اساس system prompt و فایل‌های runtime کاربر عمل کن. "
            "خروجی دقیق و قابل استفاده برای عملیات سازمانی بده؛ اگر داده کافی نیست صریحاً اعلام کن."
        )
        return "\n\n".join(parts).strip()

    async def build_prompt_text(
        self,
        agent: Agent,
        instruction_text: str,
        blocks: list[dict[str, str]],
        rules: list[dict[str, str]],
    ) -> tuple[str, str]:
        llm = _build_llm()
        if not llm:
            return self.fallback_prompt(agent, instruction_text, blocks, rules), "fallback"

        sys = (
            "You are an expert prompt engineer for Persian enterprise AI agents. "
            "Create ONE professional system prompt in Persian (fa-IR). "
            "Use the admin instruction text, extracted rules, and instruction file content as authoritative. "
            "Rules:\n"
            "- Output ONLY the final system prompt text; no markdown fences or explanation.\n"
            "- Preserve ALL concrete business rules (workdays, overtime, columns, formulas, edge cases).\n"
            "- Explicitly state that instruction files were already compiled — do NOT re-read them as runtime input.\n"
            "- If file upload is enabled, use uploaded runtime files and workspace outputs only.\n"
            "- If tools/actions exist, call them when relevant instead of guessing data.\n"
            "- Avoid generic filler; write as an operational system prompt."
        )
        files = "\n\n".join(
            f"### فایل دستورالعمل: {block['filename']}\n{block['text']}" for block in blocks
        )
        user = "\n".join(
            [
                f"نام ایجنت: {agent.name}",
                f"توضیح: {agent.description or '—'}",
                f"بخش: {agent.department or '—'}",
                f"نوع: {_kind_value(agent)}",
                f"قابلیت‌ها: {_capability_labels(agent)}",
                f"ابزارها: {', '.join(agent.tool_names or []) or '—'}",
                f"دستورالعمل متنی ادمین:\n{instruction_text.strip() or '—'}",
                f"قوانین استخراج‌شده:\n{_rules_block(rules)}",
                f"محتوای فایل‌های دستورالعمل:\n{files or '—'}",
                f"پرامپت فعلی برای حفظ نیت مفید:\n{(agent.system_prompt or '').strip()[:3000] or '—'}",
            ]
        )
        try:
            result = await llm.ainvoke(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}]
            )
            text = (getattr(result, "content", None) or str(result)).strip()
            if text:
                return text, "ready"
        except Exception:
            pass
        return self.fallback_prompt(agent, instruction_text, blocks, rules), "fallback"

    async def refresh_from_instructions(
        self,
        agent_id: UUID,
        *,
        instruction_text: str = "",
        force: bool = False,
    ) -> Agent:
        agent = await self._get_agent(agent_id)
        files = await self._instruction_files(agent_id)
        blocks = self._extract_file_blocks(files)
        normalized_text = instruction_text.strip()
        if not normalized_text and not blocks:
            return agent

        cfg: dict[str, Any] = dict(agent.config_json or {})
        fp = self.fingerprint(agent, normalized_text, blocks)
        meta = dict(cfg.get("instruction_prompt") or {})
        if not force and meta.get("fingerprint") == fp:
            return agent

        # Fast path: text-only instruction with no files — skip LLM extract/rewrite
        # so wizard bootstrap is not blocked for 30–90s on a model round-trip.
        if not blocks and normalized_text:
            rules = _heuristic_rules_from_text(normalized_text, source="admin_text")
            rule_status = "heuristic"
            prompt = normalized_text
            prompt_status = "ready"
            status = "ready"
        else:
            rules, rule_status = await self.extract_rules(agent, normalized_text, blocks)
            prompt, prompt_status = await self.build_prompt_text(
                agent, normalized_text, blocks, rules
            )
            status = "ready" if prompt_status == "ready" and rules else prompt_status
            if rules and prompt_status == "fallback":
                status = "fallback"

        agent.system_prompt = prompt
        cfg["instruction_rules"] = rules
        cfg["instruction_prompt"] = {
            "fingerprint": fp,
            "source": "instruction_files" if blocks else "instruction_text",
            "file_count": len(blocks),
            "rule_count": len(rules),
            "compiled_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "rule_extraction": rule_status,
        }
        # ponytail: also persist the verbatim file text so the runtime
        # build_system_prompt() can force-feed instruction files into EVERY
        # LLM call (line-by-line) without re-reading disk on each message.
        # See agent_factory.build_system_prompt.
        cfg["instruction_files_text"] = [
            {"filename": b["filename"], "text": b["text"]}
            for b in blocks
        ]
        cfg.pop("execution_guide", None)
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent
