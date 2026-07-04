"""AI-generated per-agent dashboard config — draft, approve, post-creation customize."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from copy import deepcopy
from uuid import UUID

from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.agents_lib.agent_factory import _supports_temperature
from src.core.debug_session_log import debug_session_log
from src.core import llm_runtime
from src.demo.agent_dashboards import base_dashboard_for_agent, resolve_profile_key
from src.models.agent import Agent, AgentStatus
from src.models.user import User
from src.repositories.agent_repo import AgentRepository
from src.services.agent_widget_plan_service import (
    apply_widget_plan_to_raw,
    assert_widget_enabled,
    enforce_widget_plan,
    format_plan_for_llm,
    parse_widget_plan,
    review_table_from_plan,
)
from src.schemas.agent_dashboard import (
    AgentDashboardLineChart,
    AgentDashboardPieChart,
    AgentDashboardReviewTable,
    AgentDashboardStatCard,
)
from src.schemas.agent_dashboard_config import (
    AgentDashboardCustomConfig,
    DashboardGenerateRequest,
    DashboardGenerateResponse,
    DashboardWidgetPatchRequest,
    WidgetKind,
)


def _build_llm() -> ChatOpenAI | None:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        return None
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 120,
        "max_retries": 0,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.35
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _parse_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            data = json.loads(m.group())
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _dashboard_bucket(cfg: dict) -> dict:
    dash = cfg.get("dashboard")
    if not isinstance(dash, dict):
        dash = {}
        cfg["dashboard"] = dash
    return dash


def _stored_config_dict(bucket: dict, key: str) -> dict | None:
    raw = bucket.get(key)
    return raw if isinstance(raw, dict) else None


def _ensure_stat_card_ids(cards: list[AgentDashboardStatCard]) -> list[AgentDashboardStatCard]:
    out: list[AgentDashboardStatCard] = []
    for card in cards:
        data = card.model_dump()
        if not data.get("id"):
            data["id"] = str(uuid.uuid4())
        out.append(AgentDashboardStatCard.model_validate(data))
    return out


def _summarize_dashboard_changes(
    before: AgentDashboardCustomConfig | None,
    after: AgentDashboardCustomConfig,
    widget_type: WidgetKind | None,
) -> tuple[str, list[str], list[str]]:
    added: list[str] = []
    modified: list[str] = []

    before_ids = {c.id for c in (before.stat_cards if before else []) if c.id}
    after_ids = {c.id for c in after.stat_cards if c.id}
    new_cards = after_ids - before_ids
    if new_cards:
        for card in after.stat_cards:
            if card.id in new_cards:
                added.append(f"کارت KPI: {card.label}")
    elif widget_type == "stat_cards" and after.stat_cards:
        if not before or len(after.stat_cards) > len(before.stat_cards):
            for card in after.stat_cards[-1:]:
                added.append(f"کارت KPI: {card.label}")

    if widget_type == "line_chart" and after.line_chart:
        (added if not before or not before.line_chart else modified).append(
            f"نمودار خطی: {after.line_chart.title}"
        )
    if widget_type == "pie_chart" and after.pie_chart:
        (added if not before or not before.pie_chart else modified).append(
            f"نمودار دایره‌ای: {after.pie_chart.title}"
        )
    if widget_type == "review_table" and after.review_table:
        (added if not before or not before.review_table else modified).append(
            f"جدول: {after.review_table.title}"
        )

    if not added and not modified:
        if widget_type:
            modified.append("پیکربندی ویجت به‌روزرسانی شد")
        else:
            modified.append("پنل داشبورد بازطراحی شد")

    parts = []
    if added:
        parts.append("افزوده: " + "، ".join(added))
    if modified:
        parts.append("تغییر: " + "، ".join(modified))
    summary = " · ".join(parts) if parts else "پیش‌نمایش ویجت آماده است."
    return summary, added, modified


def _merge_dashboard_config(
    existing: AgentDashboardCustomConfig,
    generated: AgentDashboardCustomConfig,
    widget_type: WidgetKind | None,
    agent: Agent,
) -> AgentDashboardCustomConfig:
    out = existing.model_copy(deep=True)
    plan = parse_widget_plan(agent)

    if widget_type == "stat_cards" or widget_type is None:
        existing_labels = {c.label for c in out.stat_cards}
        for card in generated.stat_cards:
            if card.label not in existing_labels:
                out.stat_cards.append(card)
                existing_labels.add(card.label)
        if widget_type == "stat_cards" and generated.stat_cards and not any(
            c.label not in {x.label for x in existing.stat_cards} for c in generated.stat_cards
        ):
            out.stat_cards.append(generated.stat_cards[0])

    if widget_type in (None, "line_chart") and generated.line_chart and plan.line_chart.enabled:
        out.line_chart = generated.line_chart
    if widget_type in (None, "pie_chart") and generated.pie_chart and plan.pie_chart.enabled:
        out.pie_chart = generated.pie_chart
    if widget_type in (None, "review_table") and generated.review_table and plan.review_table.enabled:
        out.review_table = generated.review_table

    if widget_type is None:
        out.panel_title = generated.panel_title or out.panel_title
        out.domain_label = generated.domain_label or out.domain_label
        out.disabled_widgets = generated.disabled_widgets or out.disabled_widgets
    else:
        disabled = set(out.disabled_widgets or [])
        disabled.discard(widget_type)
        out.disabled_widgets = list(disabled)

    out.stat_cards = _ensure_stat_card_ids(out.stat_cards)
    return out


def _minimal_config_base(agent: Agent) -> dict:
    name = agent.name if isinstance(getattr(agent, "name", None), str) else "ایجنت"
    return {
        "panel_title": f"پنل {name}",
        "domain_label": "سفارشی",
        "profile": "custom",
        "stat_cards": [],
        "disabled_widgets": [],
    }


def _normalize_config_dict(raw: dict, agent: Agent) -> dict:
    """Merge partial / LLM / camelCase dashboard JSON with safe defaults."""
    base = _minimal_config_base(agent)
    merged = {**base, **raw}

    stat_cards = merged.get("stat_cards")
    if isinstance(stat_cards, list):
        normalized_cards = []
        for i, item in enumerate(stat_cards):
            if not isinstance(item, dict):
                continue
            normalized_cards.append(
                {
                    "id": str(item.get("id") or uuid.uuid4()),
                    "label": str(item.get("label") or item.get("Label") or f"شاخص {i + 1}"),
                    "value": str(item.get("value") or item.get("Value") or "—"),
                    "hint": item.get("hint") or item.get("Hint"),
                    "chart_variant": item.get("chart_variant") or item.get("chartVariant"),
                }
            )
        merged["stat_cards"] = normalized_cards

    line_chart = merged.get("line_chart")
    if isinstance(line_chart, dict):
        series = line_chart.get("series")
        if isinstance(series, list):
            line_chart["series"] = [
                {
                    "name": str(s.get("name", "سری")),
                    "data_key": str(s.get("data_key") or s.get("dataKey") or "value"),
                    "dashed": bool(s.get("dashed", False)),
                }
                for s in series
                if isinstance(s, dict)
            ]
        merged["line_chart"] = line_chart

    merged["panel_title"] = str(merged.get("panel_title") or base["panel_title"])
    merged["domain_label"] = str(merged.get("domain_label") or base["domain_label"])
    merged.setdefault("profile", "custom")
    merged.setdefault("disabled_widgets", [])
    return apply_widget_plan_to_raw(agent, merged)


def _load_config(raw: dict, agent: Agent) -> AgentDashboardCustomConfig:
    normalized = _normalize_config_dict(raw, agent)
    try:
        config = AgentDashboardCustomConfig.model_validate(normalized)
    except ValidationError:
        return _rule_based_dashboard(agent)
    return enforce_widget_plan(config, agent)


def _rule_based_dashboard(agent: Agent) -> AgentDashboardCustomConfig:
    """Fallback when LLM unavailable — adapt demo profile with agent-specific labels."""
    plan = parse_widget_plan(agent)
    raw = base_dashboard_for_agent(agent)
    profile_key = resolve_profile_key(agent)
    review = review_table_from_plan(agent, plan)
    name = agent.name if isinstance(getattr(agent, "name", None), str) else "ایجنت"
    config = AgentDashboardCustomConfig(
        panel_title=f"پنل {name}",
        domain_label=raw.get("profile", profile_key),
        profile="custom",
        stat_cards=[
            {
                "id": str(uuid.uuid4()),
                "label": c["label"],
                "value": c["value"],
                "hint": c.get("hint"),
                "chart_variant": c.get("chart_variant"),
            }
            for c in raw.get("stat_cards", [])[:4]
        ]
        if plan.stat_cards.enabled
        else [],
        line_chart=raw.get("line_chart") if plan.line_chart.enabled else None,
        pie_chart=raw.get("pie_chart") if plan.pie_chart.enabled else None,
        review_table=review,
        disabled_widgets=[],
    )
    return enforce_widget_plan(config, agent)


class AgentDashboardConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)

    def get_stored(self, agent: Agent) -> tuple[dict, AgentDashboardCustomConfig | None, bool]:
        cfg = dict(agent.config_json or {})
        bucket = _dashboard_bucket(cfg)
        approved = bool(bucket.get("approved"))
        custom_raw = bucket.get("custom")
        custom = None
        if isinstance(custom_raw, dict):
            try:
                custom = _load_config(custom_raw, agent)
            except Exception:  # noqa: BLE001
                custom = None
        return bucket, custom, approved

    def get_draft(self, agent: Agent) -> AgentDashboardCustomConfig | None:
        bucket, _, _ = self.get_stored(agent)
        draft_raw = bucket.get("draft")
        if not isinstance(draft_raw, dict):
            return None
        try:
            return _load_config(draft_raw, agent)
        except Exception:  # noqa: BLE001
            return None

    async def generate_draft(
        self,
        agent_id: UUID,
        payload: DashboardGenerateRequest | None = None,
        *,
        training_context: str | None = None,
    ) -> tuple[Agent, AgentDashboardCustomConfig]:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        if payload and payload.widget_type:
            assert_widget_enabled(agent, payload.widget_type)

        cfg = deepcopy(agent.config_json or {})
        bucket = _dashboard_bucket(cfg)
        prior_draft = bucket.get("draft")
        if prior_draft is not None:
            bucket["draft_backup"] = prior_draft

        before_config = self.get_draft(agent)
        if before_config is None:
            _, custom, approved = self.get_stored(agent)
            if approved and custom is not None:
                before_config = custom

        generated = await self._generate_config(agent, payload, training_context=training_context)

        merge = payload.merge_with_existing if payload else True
        widget_type = payload.widget_type if payload else None
        if merge and before_config is not None and widget_type is not None:
            draft = _merge_dashboard_config(before_config, generated, widget_type, agent)
        elif merge and before_config is not None and payload and payload.prompt:
            draft = _merge_dashboard_config(before_config, generated, widget_type, agent)
        else:
            draft = generated

        draft.stat_cards = _ensure_stat_card_ids(draft.stat_cards)
        draft = enforce_widget_plan(draft, agent)
        bucket["draft"] = draft.model_dump(mode="json")
        bucket["approved"] = False
        cfg["dashboard"] = bucket

        validation = dict(cfg.get("validation") or {})
        # ponytail: never skip interactive training — only advance wizard state after
        # training_completed or legacy pending agents (no training step).
        vstate = validation.get("state")
        if vstate == "training" and not validation.get("training_completed"):
            pass
        elif vstate == "pending" and not validation.get("training_completed"):
            pass
        elif vstate in ("pending_auto", None) or validation.get("training_completed"):
            validation["state"] = "dashboard_review"
            validation["current_phase"] = "dashboard_review"
            cfg["validation"] = validation

        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent, draft

    async def generate_with_preview(
        self,
        agent_id: UUID,
        payload: DashboardGenerateRequest,
    ) -> DashboardGenerateResponse:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        before = self.get_draft(agent)
        if before is None:
            _, custom, approved = self.get_stored(agent)
            before = custom if approved and custom else None

        _, draft = await self.generate_draft(agent_id, payload)

        summary, added, modified = _summarize_dashboard_changes(
            before, draft, payload.widget_type
        )
        return DashboardGenerateResponse(
            agent_id=str(agent_id),
            has_draft=True,
            preview_summary=summary,
            widgets_added=added,
            widgets_modified=modified,
            draft=draft,
        )

    async def reject_draft(self, agent_id: UUID) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        cfg = dict(agent.config_json or {})
        bucket = _dashboard_bucket(cfg)
        backup = bucket.pop("draft_backup", None)
        if backup is not None:
            bucket["draft"] = backup
        else:
            bucket.pop("draft", None)
        cfg["dashboard"] = bucket
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def _generate_config(
        self,
        agent: Agent,
        payload: DashboardGenerateRequest | None,
        *,
        training_context: str | None = None,
    ) -> AgentDashboardCustomConfig:
        llm = _build_llm()
        if not llm:
            return _rule_based_dashboard(agent)

        tp = (agent.config_json or {}).get("training_profile") or {}
        prompt = (payload.prompt if payload else None) or ""
        notes = (payload.context_notes if payload else None) or ""
        widget_type = payload.widget_type if payload else None

        focus = ""
        if widget_type == "stat_cards":
            focus = (
                "Focus ONLY on stat_cards: return exactly ONE new KPI card in stat_cards array "
                "(label, value, hint, chart_variant). Set line_chart, pie_chart, review_table to null."
            )
        elif widget_type == "line_chart":
            focus = "Focus ONLY on line_chart. Set stat_cards to [], pie_chart and review_table to null."
        elif widget_type == "pie_chart":
            focus = "Focus ONLY on pie_chart. Set stat_cards to [], line_chart and review_table to null."
        elif widget_type == "review_table":
            focus = "Focus ONLY on review_table. Set stat_cards to [], line_chart and pie_chart to null."

        sys = (
            "You design a Persian enterprise agent overview dashboard (KPI cards, charts, tables). "
            "Return ONLY valid JSON with keys:\n"
            "- panel_title (string, fa-IR): title for the agent panel\n"
            "- domain_label (string, fa-IR): short domain/subtitle\n"
            "- stat_cards (array): each {id (optional uuid), label, value, hint, chart_variant} "
            "chart_variant one of: savings, hours, alerts, accuracy, payroll-headcount, payroll-payout\n"
            "- line_chart (object|null): {title, series:[{name, data_key, dashed}], points:[{month, ...}]}\n"
            "- pie_chart (object|null): {title, slices:[{name, value}]}\n"
            "- review_table (object|null): {title, columns:[{key,label}], rows:[{id, cells:{key:val}, status}]}\n"
            "- disabled_widgets (array, optional): widget kinds to hide — "
            "stat_cards|line_chart|pie_chart|review_table|hr_savings\n"
            "Use realistic demo numbers for this agent's domain. All labels in fa-IR. "
            "Omit widgets that don't fit the agent purpose.\n\n"
            "MANDATORY: The user message includes widget_plan with enabled/disabled flags. "
            "Never include JSON for widgets marked غیرفعال — set them to null or []. "
            "Violating this invalidates the response."
        )
        if focus:
            sys += f"\n\nIMPORTANT: {focus}"
        user_parts = [
            f"نام ایجنت: {agent.name}",
            f"توضیح: {agent.description or '—'}",
            f"نوع: {getattr(agent.kind, 'value', agent.kind)}",
            f"دپارتمان: {agent.department or '—'}",
        ]
        if tp.get("responsibilities"):
            user_parts.append("مسئولیت‌ها: " + "؛ ".join(tp["responsibilities"][:5]))
        if tp.get("output_format_spec"):
            user_parts.append(f"فرمت خروجی: {tp['output_format_spec'][:500]}")
        if training_context:
            user_parts.append(f"زمینه آموزش:\n{training_context[:2000]}")
        if prompt:
            user_parts.append(f"درخواست ادمین برای پنل:\n{prompt}")
        if notes:
            user_parts.append(f"یادداشت: {notes}")
        user_parts.append(format_plan_for_llm(parse_widget_plan(agent)))

        try:
            result = await asyncio.wait_for(
                llm.ainvoke(
                    [
                        {"role": "system", "content": sys},
                        {"role": "user", "content": "\n".join(user_parts)},
                    ]
                ),
                timeout=90,
            )
            text = (getattr(result, "content", None) or str(result)).strip()
            parsed = _parse_json(text)
            if parsed:
                parsed.setdefault("profile", "custom")
                parsed.setdefault("disabled_widgets", [])
                config = AgentDashboardCustomConfig.model_validate(parsed)
                config.stat_cards = _ensure_stat_card_ids(config.stat_cards)
                return enforce_widget_plan(config, agent)
        except Exception:  # noqa: BLE001
            pass
        return _rule_based_dashboard(agent)

    async def approve_draft(self, agent_id: UUID) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        draft = self.get_draft(agent)
        if not draft:
            _, custom, approved = self.get_stored(agent)
            if approved and custom is not None:
                # Post-approval edits patch custom directly — nothing to promote.
                return agent
            validation = dict((agent.config_json or {}).get("validation") or {})
            if validation.get("training_completed") and validation.get("state") in (
                "pending_auto",
                "running",
                "done",
            ):
                # Idempotent — dashboard was already approved and validation started.
                return agent
            raise HTTPException(
                status_code=400,
                detail="پیش‌نویس پنل برای تأیید وجود ندارد — ابتدا پنل را بسازید.",
            )

        draft = enforce_widget_plan(draft, agent)

        cfg = dict(agent.config_json or {})
        bucket = _dashboard_bucket(cfg)
        bucket["custom"] = draft.model_dump(mode="json")
        bucket["approved"] = True
        bucket.pop("draft", None)
        cfg["dashboard"] = bucket

        validation = dict(cfg.get("validation") or {})
        if validation.get("state") == "dashboard_review":
            validation["state"] = "pending_auto"
            validation["current_phase"] = "starting"
            cfg["validation"] = validation

        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        # #region agent log
        debug_session_log(
            "agent_dashboard_config_service.py:approve_draft:done",
            "Draft promoted to approved custom",
            {
                "agent_id": str(agent_id),
                "approved": bucket.get("approved"),
                "has_custom": isinstance(bucket.get("custom"), dict),
                "disabled": (bucket.get("custom") or {}).get("disabled_widgets"),
                "stat_cards": len((bucket.get("custom") or {}).get("stat_cards") or []),
            },
            hypothesis_id="H8",
            run_id="post-fix",
        )
        # #endregion
        return agent

    async def customize_via_prompt(
        self, agent_id: UUID, payload: DashboardGenerateRequest
    ) -> Agent:
        """Post-creation: admin describes widget changes; AI rebuilds draft for approval."""
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent.status not in (AgentStatus.ACTIVE, AgentStatus.DEPLOYING, AgentStatus.DRAFT):
            raise HTTPException(status_code=400, detail="Agent cannot be customized in this state")

        bucket, custom, approved = self.get_stored(agent)
        base_prompt = payload.prompt or "پنل را برای این ایجنت بهینه کن"
        if custom and approved:
            base_prompt = (
                f"{base_prompt}\n\nپیکربندی فعلی تأیید‌شده:\n"
                f"{json.dumps(custom.model_dump(mode='json'), ensure_ascii=False)[:3000]}"
            )

        agent, _ = await self.generate_draft(agent_id, DashboardGenerateRequest(prompt=base_prompt))
        return agent

    async def _ensure_patch_target(self, agent: Agent) -> tuple[dict, dict, str, AgentDashboardCustomConfig]:
        cfg = dict(agent.config_json or {})
        bucket = _dashboard_bucket(cfg)

        draft_raw = _stored_config_dict(bucket, "draft")
        custom_raw = _stored_config_dict(bucket, "custom")
        approved = bool(bucket.get("approved"))

        # Prefer approved custom when no draft (post-publish edit)
        if draft_raw is None and approved and custom_raw is not None:
            return cfg, bucket, "custom", _load_config(custom_raw, agent)

        if draft_raw is not None:
            return cfg, bucket, "draft", _load_config(draft_raw, agent)

        if approved and custom_raw is not None:
            return cfg, bucket, "custom", _load_config(custom_raw, agent)

        config = _rule_based_dashboard(agent)
        bucket["draft"] = config.model_dump(mode="json")
        cfg["dashboard"] = bucket
        return cfg, bucket, "draft", config

    async def patch_widgets(self, agent_id: UUID, payload: DashboardWidgetPatchRequest) -> Agent:
        agent = await self.agents.get(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        bucket_preview = (agent.config_json or {}).get("dashboard")
        # #region agent log
        debug_session_log(
            "agent_dashboard_config_service.py:patch_widgets:entry",
            "patch_widgets service entry",
            {
                "agent_id": str(agent_id),
                "payload": payload.model_dump(),
                "dashboard_type": type(bucket_preview).__name__,
                "draft_type": type((bucket_preview or {}).get("draft") if isinstance(bucket_preview, dict) else None).__name__,
                "custom_type": type((bucket_preview or {}).get("custom") if isinstance(bucket_preview, dict) else None).__name__,
                "approved": (bucket_preview or {}).get("approved") if isinstance(bucket_preview, dict) else None,
            },
            hypothesis_id="H1",
        )
        # #endregion

        has_op = (
            payload.disabled_widgets is not None
            or payload.remove_widgets
            or payload.enable_widgets
            or payload.remove_stat_card_ids
        )
        if not has_op:
            # #region agent log
            debug_session_log(
                "agent_dashboard_config_service.py:patch_widgets:no_op",
                "No widget operation in payload — early return",
                {"agent_id": str(agent_id)},
                hypothesis_id="H3",
            )
            # #endregion
            return agent

        cfg, bucket, target_key, config = await self._ensure_patch_target(agent)
        # #region agent log
        debug_session_log(
            "agent_dashboard_config_service.py:patch_widgets:target",
            "Patch target resolved",
            {
                "agent_id": str(agent_id),
                "target_key": target_key,
                "stat_cards": len(config.stat_cards or []),
                "has_line": config.line_chart is not None,
                "has_pie": config.pie_chart is not None,
            },
            hypothesis_id="H1",
        )
        # #endregion
        raw_profile = base_dashboard_for_agent(agent)

        if payload.disabled_widgets is not None:
            config.disabled_widgets = list(payload.disabled_widgets)

        for kind in payload.remove_widgets or []:
            config = self._remove_widget(config, kind)

        for kind in payload.enable_widgets or []:
            assert_widget_enabled(agent, kind)
            try:
                config = self._enable_widget(config, kind, raw_profile)
            except Exception as exc:
                # #region agent log
                debug_session_log(
                    "agent_dashboard_config_service.py:patch_widgets:enable_fail",
                    "_enable_widget failed",
                    {"kind": kind, "type": type(exc).__name__, "msg": str(exc)[:300]},
                    hypothesis_id="H4",
                )
                # #endregion
                raise

        if payload.remove_stat_card_ids:
            remove_ids = set(payload.remove_stat_card_ids)
            config.stat_cards = [
                c for c in config.stat_cards if c.id not in remove_ids
            ]

        config.stat_cards = _ensure_stat_card_ids(config.stat_cards)
        config = enforce_widget_plan(config, agent)

        bucket[target_key] = config.model_dump(mode="json")
        agent.config_json = cfg
        flag_modified(agent, "config_json")
        await self.db.commit()
        await self.db.refresh(agent)
        # #region agent log
        debug_session_log(
            "agent_dashboard_config_service.py:patch_widgets:done",
            "patch_widgets committed",
            {"agent_id": str(agent_id), "target_key": target_key},
            hypothesis_id="H1",
        )
        # #endregion
        return agent

    @staticmethod
    def _enable_widget(
        config: AgentDashboardCustomConfig, kind: WidgetKind, raw: dict
    ) -> AgentDashboardCustomConfig:
        disabled = set(config.disabled_widgets or [])
        disabled.discard(kind)
        config.disabled_widgets = list(disabled)
        if kind == "stat_cards" and not config.stat_cards:
            config.stat_cards = _ensure_stat_card_ids(
                [
                    AgentDashboardStatCard.model_validate(c)
                    for c in raw.get("stat_cards", [])[:4]
                ]
            )
        elif kind == "line_chart" and not config.line_chart and raw.get("line_chart"):
            config.line_chart = AgentDashboardLineChart.model_validate(raw["line_chart"])
        elif kind == "pie_chart" and not config.pie_chart:
            if raw.get("pie_chart"):
                config.pie_chart = AgentDashboardPieChart.model_validate(raw["pie_chart"])
            else:
                config.pie_chart = AgentDashboardPieChart(
                    title="توزیع نتایج",
                    slices=[
                        {"name": "بخش الف", "value": 40},
                        {"name": "بخش ب", "value": 35},
                        {"name": "سایر", "value": 25},
                    ],
                )
        elif kind == "review_table" and not config.review_table and raw.get("review_table"):
            config.review_table = AgentDashboardReviewTable.model_validate(raw["review_table"])
        return config

    @staticmethod
    def _remove_widget(config: AgentDashboardCustomConfig, kind: WidgetKind) -> AgentDashboardCustomConfig:
        if kind == "stat_cards":
            config.stat_cards = []
        elif kind == "line_chart":
            config.line_chart = None
        elif kind == "pie_chart":
            config.pie_chart = None
        elif kind == "review_table":
            config.review_table = None
        elif kind == "hr_savings":
            disabled = set(config.disabled_widgets)
            disabled.add("hr_savings")
            config.disabled_widgets = list(disabled)
        return config

    def apply_custom_to_raw(
        self, agent: Agent, raw: dict, custom: AgentDashboardCustomConfig
    ) -> dict:
        disabled = set(custom.disabled_widgets or [])
        out = dict(raw)
        out["profile"] = custom.profile or "custom"
        out["panel_title"] = custom.panel_title
        out["domain_label"] = custom.domain_label
        if "stat_cards" in disabled:
            out["stat_cards"] = []
        elif custom.stat_cards:
            out["stat_cards"] = [c.model_dump(mode="json") for c in custom.stat_cards]
        else:
            out["stat_cards"] = []
        if "line_chart" not in disabled and custom.line_chart:
            out["line_chart"] = custom.line_chart.model_dump(mode="json")
        else:
            out["line_chart"] = None
        if "pie_chart" not in disabled and custom.pie_chart:
            out["pie_chart"] = custom.pie_chart.model_dump(mode="json")
        else:
            out["pie_chart"] = None
        if "review_table" not in disabled and custom.review_table:
            out["review_table"] = custom.review_table.model_dump(mode="json")
        else:
            out["review_table"] = None
        out["_hide_hr_savings"] = "hr_savings" in disabled
        return out
