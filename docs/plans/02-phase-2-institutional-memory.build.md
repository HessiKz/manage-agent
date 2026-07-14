# Phase 2 — Implementation Build Plan (DETAILED, code-grounded)

Companion to `02-phase-2-institutional-memory.md`. Read that first. This file turns each milestone into concrete, file-and-line-anchored steps using the *actual* code that already exists. Every reference was verified against the working tree (HEAD `9d4f5955`); the graphify graph (`33d57f98`) is a few commits stale — trust the inline reads.

---

## 0. Phase 1 readiness — VERIFIED

Phase 1 is **implemented and wired** (not planned-only). Phase 2 can build immediately; no Phase 1 stubs remain.

| Need | Where | Shape / key symbols |
|------|-------|----------------------|
| Run state | `backend/src/models/run_state.py`, `services/run_state_service.py`, `api/v1/run_state.py`, `schemas/run_state.py` | `RunState(scope_type, scope_key, user_id, agent_id, slug, phase, wizard_step_index, payload JSONB, version)`. `RunStatePhase` enum: `unknown, wizard_form, wizard_steps, publish, planning, training, dashboard, validation, complete, error`. |
| Run state API | `api/v1/run_state.py` | `GET/PUT/PATCH/DELETE /run-state/{scope_type}/{scope_key}` → `RunStateRead`. Raises `RunStateNotFound` (→ empty default) / `RunStateConflict` (optimistic lock on `version`). |
| FE run state | `frontend/src/lib/run-state-client.ts` | `getRunState/putRunState/patchRunState/deleteRunState/wizardScopeKey`. Types `RunState`, `RunStateScope`, `RunStatePayload`. |
| Autonomy | `services/autonomy_policy_service.py`, `models/user.py:62-73`, `frontend/src/lib/autonomy-policy.ts` | `AutonomyLevel.OBSERVE=0/ASSIST=1/AUTO=2/UNATTENDED=3`. `resolve_level(db,user,session_override)` → int. FE `canRunAutomation(level, action)`: `suggest>=0, fill>=1, bridge>=2, full>=3`. |
| Precision routing | `core/execution_router.py`, `core/precision_defaults.py` | `resolve_execution_path(agent, payload, caps=)` → `ExecutionPath{AUTO_TOOL,REACT,SUPERVISOR,PLAIN_LLM}`. `resolve_precision(agent)`, `precision_for_kind(kind)`, `precision_from_config(config_json)`. |
| Run-state → backend parse | `agents_lib/platform_support_grounding.py:184-208` | `parse_run_state_block(text)` → `{phase, slug, autonomy_level, execution_precision}` parsed from the `[RUN STATE — AUTHORITATIVE]` block the FE injects via `page-guide-context.ts:247`. |
| FE context block | `frontend/src/lib/page-guide-context.ts:247` | `formatRunStateBlock(state)` emits `phase`, `slug (verified)`, `wizard_step`, `autonomy_level`, `execution_precision`. |

**CRITICAL CAVEAT (affects M1d + M2b):** the autonomy gate is **OFF by default**. `autonomy_policy_service.autonomy_gates_enabled()` returns `settings.graduated_autonomy_v1`, which is `False` in `config.py`. Also `run_state_v1` / `precision_routing_v1` flags exist as `True` constants but are never checked (M1/M2 paths run unconditionally).

**Decision required:** Phase 2's "L0 = no auto-run, L2+ = skill first" depends on a real autonomy level. Two options:
- (A) Flip `graduated_autonomy_v1 = True` in `.env` for staging; OR
- (B) Phase 2 reads `run_state.payload.autonomy_level` directly (already injected by FE via `formatRunStateBlock`) and applies its own gate, independent of the Phase 1 flag.

**Recommendation:** use (B) for the skill gate, but still call `autonomy_policy_service.resolve_level()` as the source of `min_autonomy_level` truth. Keeps Phase 2 robust whether or not `graduated_autonomy_v1` is flipped.

**Graph drift:** graphify `graph.json` was built at `33d57f98`; HEAD is `9d4f5955`. Run `graphify update .` after Phase 2 merges.

---

## 1. Reusable patterns to COPY

### 1.1 New tables — match the latest migration style
Latest migration head = `p7q8r9s0t1u2` (`alembic/versions/p7q8r9s0t1u2_autonomy_preferences.py`). New migrations set `down_revision = "p7q8r9s0t1u2"` and a fresh `revision` slug. Use `sa.UUID()` + `sa.DateTime(timezone=True), server_default=sa.text("now()")` (matches `UUIDPkMixin`/`TimestampMixin` at `database/base.py:20-44`). FK columns use `sa.UUID()` + `op.create_foreign_key(..., ondelete=...)`. Index via `op.create_index("ix_<table>_<col>", "<table>", ["<col>"])`. Reference: `alembic/versions/l3m4n5o6p7q8_knowledge_datasets.py` (create_table + FK onto `document_chunks`).

ORM models subclass `Base, UUIDPkMixin, TimestampMixin` (see `models/run_state.py` and `models/document_chunk.py`). JSONB via `from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID`.

### 1.2 API router registration
Add module to `backend/src/api/v1/router.py` import block + `api_router.include_router(skills.router, tags=["skills"])` / `failures.router, tags=["failures"]`. Copy the `run_state.router` mount (no prefix, tagged) or `knowledge.router` (prefix `/knowledge`). Dependencies: `from src.api.dependencies import DB, CurrentUser, CurrentSuperuser`. Examples: `api/v1/knowledge.py:9,64`, `api/v1/run_state.py:7-16`.

### 1.3 Pydantic v2 schemas
Pattern (from `run_state.py` schemas + `knowledge_dataset.py`): `model_config = ConfigDict(from_attributes=True)`; create/update via `BaseModel` with `Field(default_factory=dict)`; convert ORM→schema with `SkillRead.model_validate(row)` (see `agents.py:144,379`). Partial PATCH uses `model_dump(exclude_unset=True)` (`run_state_service._apply_patch:95`).

### 1.4 Service + repository
Thin services take `db: AsyncSession` in `__init__` (see `RunStateService`, `ActivityService`, `VectorStore`). Repository: `class XRepository(BaseRepository[X])` with `model = X` (`repositories/base.py`, `repositories/agent_repo.py`). For simple CRUD, call `db.add/get` directly in the service (as `RunStateService` does).

### 1.5 Validation failure taxonomy (seed source for `root_cause_tag`)
`AgentValidationService` (`services/agent_validation_service.py:84-294`): collects `list[ValidationFailure]` of `dataclass(phase, message, fixable_in_admin)` (`:48-52`). Phases observed: `instruction_compile`, `tool_resolution`, `script_generate`, `script_verify`. `ok = not failures` at `:267`; success → `agent.status = ACTIVE` (`:283`); fixable failures → `ERROR` (`:284`); else `DRAFT` (`:287`). Hook point for Phase 3 learning = **right after `:289`** (`_notify_owner_result`), reusing `self.db`.

---

## 2. Milestone 1 — Skill Library core (week 1)

### 2.1 Migration + model
- **Migration:** `alembic/versions/<rev>_platform_skills.py`, `down_revision="p7q8r9s0t1u2"`. Columns from plan §1.1, with:
  - `id sa.UUID()` PK; `created_at/updated_at` `server_default=sa.text("now()")`.
  - `scope sa.String(32)`, `status sa.String(16)`, `source sa.String(16)`, `version sa.Integer()` default 1.
  - `trigger JSONB` + `procedure JSONB` + `stats JSONB` (`postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"`).
  - `slug sa.String(120) NOT NULL UNIQUE`; `agent_id sa.UUID() NULL` FK→`agents.id` ON DELETE CASCADE; `org_id` deferred (nullable, no FK yet); `created_by sa.UUID() NULL` FK→`users.id` ON DELETE SET NULL; `supersedes_id sa.UUID() NULL` FK→`platform_skills.id` ON DELETE SET NULL.
  - Indexes: `ix_platform_skills_status(status)`, `ix_platform_skills_scope(scope, agent_id)`.
  - CHECK: `scope IN ('platform','org','agent')`. The "`scope='agent'` requires `agent_id`" rule enforced in the **Pydantic validator**, not DB.
- **Model:** `backend/src/models/platform_skill.py` mirroring `RunState` fields + `UUIDPkMixin, TimestampMixin`. Define `SkillScope(str,enum.Enum){PLATFORM,ORG,AGENT}`, `SkillStatus(str,enum.Enum){DRAFT,ACTIVE,ARCHIVED}`, `SkillSource(str,enum.Enum){MANUAL,LEARNED,IMPORTED}` as Python enums (keep JSON-friendly like `RunStatePhase` — don't rely on SAEnum).

### 2.2 Schemas — `backend/src/schemas/platform_skill.py`

```python
class SkillTrigger(BaseModel):
    phase_any: list[str] = []
    pathname_prefix: str | None = None
    intent_regex: str | None = None
    run_state: dict = {}
    min_autonomy_level: int = 0
    agent_kind_any: list[str] = []
    priority: int = 0

class SkillProcedure(BaseModel):
    # EXACTLY the SupportUiScript contract (frontend/src/lib/support-ui-script.ts:30-33)
    label: str
    steps: list[dict]   # each step validated against the 9 allowed types

class SkillStats(BaseModel):
    success_count: int = 0
    failure_count: int = 0
    last_used_at: str | None = None

class PlatformSkillCreate(BaseModel):
    slug: str
    name: str
    name_fa: str | None = None
    description: str | None = None
    scope: SkillScope = SkillScope.PLATFORM
    agent_id: UUID | None = None
    source: SkillSource = SkillSource.MANUAL
    trigger: SkillTrigger = SkillTrigger()
    procedure: SkillProcedure
    content_md: str | None = None
    # validator: scope==AGENT and agent_id is None -> ValueError

class PlatformSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # id, slug, name, name_fa, description, scope, agent_id, source, status,
    # version, trigger, procedure, content_md, stats, created_by, created_at, updated_at
```

**`procedure` validation:** mirror the guard set from `parseSupportUiScript` (`support-ui-script.ts:47-111`) — each step must have a legal `type` ∈ `{navigate, wait, wait_for_path, wait_for_dom, highlight, click, type, select, bridge}`; `bridge` needs `action:str`; `type`/`select` need `text`/`value:str`; `wait` needs `ms:int`; `wait_for_path` needs `pattern:str`. This guarantees `procedure` stored in DB is **guaranteed playable** by the existing player without re-parsing.

**`trigger` validation:** `min_autonomy_level` 0..3; `priority` int; `phase_any` values must be valid `RunStatePhase` strings (import `RunStatePhase` from `models/run_state.py`).

### 2.3 Service + matcher — `services/skill_service.py`, `services/skill_matcher.py`, `core/skill_template.py`

**`SkillService(db)`** CRUD: `create`, `get`, `list(scope?,status?)`, `update` (bump `version` if `procedure`/`trigger` changed; set `supersedes_id` on activate), `activate(slug)` (draft→active; archive previous active version of same slug), `record_outcome(slug, success: bool)` (increment `stats.success_count|failure_count`, set `last_used_at`), `get_active_for_match(...)`.

**`skill_template.py` — safe `{{var}}` substitution** (plan §1.2, Annex B): allowed tokens `{{run_state.slug}}`, `{{run_state.phase}}`, `{{user.id}}`, `{{payload.name}}`. **Reject any other token** → raise `UnknownSkillTokenError` (test 1.2.17). Pure `str.replace`, NO LLM (test 1.2.18). Resolve from a context dict `{run_state:{...}, user:{...}, payload:{...}}`. `{{run_state.slug}}` when unverified/None → **abort before player if a bridge step's payload would contain an empty slug** (Annex B.5/B.6.5; slug hallucination is the #1 risk the whole plan prevents).

**`SkillMatcher(db)` — `match(context) -> MatchResult(skill|None, confidence, reasons)`** (plan §1.2): input `context = {run_state, message, pathname, snapshot_hash, agent_kind}`. Scoring:

| Signal | Score |
|--------|-------|
| `phase` exact match (`run_state.phase in trigger.phase_any`) | +0.4 |
| `pathname_prefix` match | +0.2 |
| `intent_regex` match (`re.search`) | +0.2 |
| `run_state` predicates subset of `payload` | +0.2 (capped) |
| `success_rate` multiplier | ×0.8–1.2 (0 runs → 1.0) |
| `min_autonomy_level` not met | disqualify (return None) |

Threshold: **≥0.75** → `should_execute=True`; **0.5–0.74** → `should_suggest=True`; **<0.5** → None. Tie-break by `priority` desc, then `success_rate`. Only `status=ACTIVE` skills (draft never matches — test 1.2.8). Return top 1.

### 2.4 API — `backend/src/api/v1/skills.py`
Routes from plan §1.2. Key:
- `POST /skills/match` body `{run_state, message, pathname, snapshot_hash}` → `MatchResultRead{slug, confidence, should_execute, should_suggest, procedure}`. Build context, call `SkillMatcher.match`, **template-resolve** `procedure` before returning. If `should_execute` and `run_state.payload.autonomy_level < 2` → downgrade to suggest.
- `POST /skills/{slug}/record-outcome` body `{success: bool}` → `SkillService.record_outcome`. Auth: `CurrentUser`.
- `PUT /skills/{slug}` → bump version on procedure change (test 1.2.7).
- Admin-only writes via `CurrentSuperuser` (test 1.2.1).

### 2.5 Frontend runner — `frontend/src/lib/skill-client.ts`, `skill-runner.ts`

**`skill-client.ts`**: `matchSkill(ctx)`, `recordSkillOutcome(slug, success)`, `getSkill`, `listSkills`, `createSkill`, `activateSkill`, `updateSkill` — mirror `run-state-client.ts`/`api.ts` conventions (axios wrapper, `ApiError` handling from `support-error-text.ts`).

**`skill-runner.ts` — `matchAndRunSkill(context): Promise<'ran'|'no_match'|'failed'>`**:

```text
1. rs = await getRunState(scope)               // Phase 1
2. autonomy = rs?.payload?.autonomy_level ?? 1
3. if autonomy < 2 and not flag-allow-L0: return 'no_match'   // Annex B.5
4. res = await matchSkill({run_state: rs, message, pathname, snapshot_hash})
5. if !res.should_execute: return 'no_match'   // 0.5–0.74 → caller shows suggestion UI
6. try {
     await useSupportUiPlayer().playScript(res.procedure)   // runUiOutcome
     await recordSkillOutcome(res.slug, true)
     return 'ran'
   } catch (e) {
     await recordSkillOutcome(res.slug, false)
     if (e instanceof SupportUiBlockedError) await recordFailure(...)  // M2 wire
     return 'failed'
   }
```

Wire into `platform-support-assistant.tsx` send path: call `matchAndRunSkill` BEFORE the LLM invoke; if `'ran'` → skip LLM (Annex B.1). Feature flag `SKILL_LIBRARY_V1`. When false → `skill-runner` returns `'no_match'` and the existing `resolveLocalWizardContinueScript` path is used (MIG-2). Read the flag the same way other flags are read in `platform-support-assistant.tsx` (env `NEXT_PUBLIC_*` or `/platform/settings` fetch).

### 2.6 Seed skills — `backend/skills/platform/*.json` + `scripts/sync_platform_skills.py`
Author the 4 procedures to **exactly match** the TS builders so parity tests pass:

1. **`wizard.continue-testing`** — mirror `buildWizardContinueTestingScript` (`support-wizard-mission.ts:225-244`):

```json
{ "label": "ادامه تست «{{payload.name}}»",
  "steps": [ { "type":"bridge", "action":"wizard.continue_testing",
               "payload": { "agent_slug": "{{run_state.slug}}", "name":"{{payload.name}}" },
               "label":"آموزش تعاملی، طراحی پنل و تأیید" } ] }
```

Trigger: `{ "phase_any":["training","dashboard","validation","complete"], "intent_regex":"ادامه|continue|تست", "min_autonomy_level":2, "priority":100 }`.

2. **`wizard.create-full`** — mirror `buildWizardCreateBridgeScript` (`support-wizard-mission.ts:189-222`):

```json
{ "label":"تکمیل ساخت «{{payload.name}}»",
  "steps":[
    {"type":"bridge","action":"wizard.create","payload":{"name":"{{payload.name}}","agent_slug":"{{run_state.slug}}"},"label":"پیمایش ویزارد تا تست"},
    {"type":"wait_for_path","pattern":"slug=","timeout_ms":120000,"label":"منتظر آماده‌سازی تست…"},
    {"type":"wait","ms":1200},
    {"type":"bridge","action":"wizard.continue_testing","payload":{"agent_slug":"{{run_state.slug}}","name":"{{payload.name}}"},"label":"آموزش تعاملی"}
  ] }
```

Trigger: `{ "phase_any":["wizard_steps","wizard_form"], "min_autonomy_level":2, "priority":90 }`.

3. **`wizard.permissions-default`** — Mechanical (Annex B.5). Trigger: `{ "phase_any":["training","dashboard"], "intent_regex":"دسترسی|permissions|مجوز", "min_autonomy_level":2, "priority":95 }`. Procedure: a `bridge` step `action:"wizard.permissions_default"`. **Verify the bridge action exists in `support-automation-bridge.ts` before authoring; if not, add it there mirroring `ensurePermissionsDefault`.**

4. **`wizard.resolve-planning`** — Trigger: `{ "phase_any":["planning"], "min_autonomy_level":2 }`. Procedure: `bridge` `action:"wizard.resolve_planning"`. **Confirm in `support-testing-actions.ts` / bridge registry; else add.**

`scripts/sync_platform_skills.py`: idempotent upsert keyed by `slug` (insert if missing, update `procedure`/`trigger`/`name` if JSON changed; never clobber `status=active` set by an admin — create a new `version`). `--dry-run` prints the 4 slugs + diff. Run at deploy + CI for parity (test 1.4.6).

Parity tests: `test_skill_seed_parity.py` imports each TS builder output (`buildWizardContinueTestingScript(buildContinueTestingPayload(slug))`), normalizes to the `procedure` shape, asserts equality with committed JSON (after template-token normalization, since TS uses real values and JSON uses `{{...}}`).

---

## 3. Milestone 2 — Failure Ledger (week 2)

### 3.1 Migration + model
Table `failure_ledger` per plan §2.1, same migration style as §2.1:
- `id sa.UUID()` PK; `created_at/updated_at` `server_default=sa.text("now()")`.
- `pattern_hash sa.String(64) NOT NULL UNIQUE` (sha256 of `tag|normalized_error|phase|tool`).
- `scope sa.String(32)` default `'platform'`; `phase sa.String(32)`; `pathname_prefix sa.String(255)`; `tool_name sa.String(120)`; `error_regex sa.String(512)`; `root_cause_tag sa.String(64)`; `occurrence_count sa.Integer()` default 1; `last_seen_at sa.DateTime(timezone=True)` default now.
- `resolved_by_skill_id sa.UUID() NULL` → `platform_skills.id` ON DELETE SET NULL.
- `sample_redacted sa.Text()`.
- Indexes: `ix_failure_ledger_tag(root_cause_tag)`, `ix_failure_ledger_count(occurrence_count DESC)`.
- Model: **`RootCauseTag(str, enum.Enum)`** with the 10 plan values (`slug_hallucination|permissions_ui|blocker_misdetect|wizard_step_rewind|agent_not_found|planning_stuck|widget_disabled|network|unknown`). Validate against it in the schema (test 2.1.3).

### 3.2 Service — `services/failure_ledger_service.py`

**`record(tag, phase, pathname_prefix, tool_name, error_text, recommended_fix, sample_redacted)`:**
- Normalize error (lower, strip whitespace) → `pattern_hash = sha256(f"{tag}|{norm_err}|{phase}|{tool_name}")`.
- **Redaction (privacy):** strip emails (`[^@\s]+@[^@\s]+\.[^@\s]+`), strip `.env`-style secrets (`(?i)(KEY|SECRET|TOKEN|PASSWORD)=...`), truncate `sample_redacted` to **200 chars** (tests 2.2.4/2.2.5).
- Upsert: if `pattern_hash` exists → `occurrence_count += 1`, refresh `last_seen_at`; else insert (test 2.2.3).

**`relevant(phase, pathname, error_substr, limit=3)`:** ordered by `occurrence_count DESC`, filtered by tag/phase/pathname; used for context injection + auto-recovery.

**`top(limit)`:** admin dashboard.

**`link_skill(pattern_hash, skill_id)`:** set `resolved_by_skill_id` (M3.4).

`recommended_fix` schema: `{type:"skill"|"user_action"|"tool", ...}` validated in schema (test 2.1.4).

### 3.3 Write hooks (FE + BE)
- **`support-ui-player.tsx`** catch block (line 350 `catch (e)`): add `recordFailureOnBlock(e)` POSTing `/failures/record` with `{tag: mapBlockerToTag(e.blockerText), phase, pathname, tool_name, error_text}`. Map blocker → `root_cause_tag` via `support-error-text.ts` `humanizeSupportError` patterns (test 2.2.6). **Keep the existing `SupportUiBlockedError` rethrow** — recording is fire-and-forget (don't fail the run if the API is down).
- **`support-auto-recovery.ts`** (`tryAutoResolveSupportError`): before its current heuristics, GET `/failures/relevant` for the current blocker; if a `recommended_fix.type==='skill'` and autonomy≥L2 → run that skill **once** (flag `triedSkillRecovery` to prevent loops; test 2.3.4). L1 → hint only (test 2.3.5).
- **Backend tool `success:false`:** where platform tools report failure (in `agents_lib/platform_tools.py` or `graph_agent._apply_support_post_process` `extract_platform_tool_results` path at `graph_agent.py:324`), call `FailureLedgerService.record` with `tool_name` (test 2.2.2).
- **Validation hook** (`agent_validation_service.py` after `:289`): optional aggregate — for each `ValidationFailure`, `record(tag=phase, error_text=message)` if failures present (test 2.2.7).

### 3.4 Read path + context injection
- **API `api/v1/failures.py`**: `GET /failures/relevant`, `GET /failures/top`, `POST /failures/record`.
- **`page-guide-context.ts`**: add `buildFailureHintsBlock(failures)` emitting the `[FAILURE HINTS]` block (plan §2.3). Inject into `buildSupportContextBlock` (`:196`) when `FAILURE_LEDGER_V1` is on. Cap to top 3 (test 2.3.3).
- **Auto-recovery** (above) reads the same `/failures/relevant`.

### 3.5 RAG index (optional v1.1)
On record/update, `VectorStore(db).upsert(content=f"{tag}: {sample_redacted} {pattern_hash}", source=f"failure_ledger:{pattern_hash}", meta={kind:"failure", tag, count:occurrence_count})`.

**Constraint — critical:** `VectorStore.upsert` dedups on `sha256(content)`, not `source` (`vector_store.py:67-72`). To keep one chunk per pattern that updates over time, make `content` a deterministic function that **includes the `pattern_hash`**, and use singular `upsert()` (not `upsert_document`, which appends `chunk_index/chunk_total` to meta). For count bumps, you'll need a dedicated `upsert_failure()` that does `select`→`update meta` rather than the dedup-return-early path, since `upsert()` won't update an existing row. Tests 2.4.1/2.4.2. Embedding model = `text-embedding-3-small` (1536-dim), requires `OPENAI_API_KEY` (raises `RuntimeError` if absent — guard behind the v1.1 flag).

---

## 4. Milestone 3 — Learning loop & lifecycle (week 3)

### 4.1 Learning service — `services/skill_learning_service.py`
- Triggered from `agent_validation_service.py` after `:289` (`ok = not failures` path):
  - Gated by `SKILL_LEARNING_V1` (default **false** — test 3.1.1). Read via settings.
  - Insert right after `ok`/status block, before notifications (`≈:289`), reusing `self.db` (same transaction as the validation commit at `:293`):
    ```python
    if not failures:
        await SkillLearningService(self.db).learn_from_validation(agent, owner)
    ```
  - Collect trajectory: `ActivityLog.details.execution_trace` carries `kind ∈ {tool, tool_result, llm_request, llm_config, execution_path, ...}` + `payload.precision` (subagent 3 confirmed: `execution_path` step has `payload={"precision": tier}`). **UI scripts are NOT currently persisted** in `ActivityLog.details` — they flow into `AgentRunResult.ui_scripts`/`ui_actions` and the SSE `done` payload (`invoke_service.py:242-247`) but are lost at DB-write time. **Close this gap in M3a** by extending `orchestrator_service.py:423-429` `activity.finish(details=...)` to include `ui_scripts`/`ui_actions` from `run_result`, OR scope M3 learning to tool/bridge traces only.
  - Build **draft** `PlatformSkill`: `procedure.steps = dedupe(trajectory tool/bridge steps)` (test 3.1.4), `trigger` inferred from final `run_state` + first user message intent, `source=LEARNED`, `status=DRAFT`. `content_md` via optional LLM summary (skip if flag off).
  - Save + notify admin (reuse `NotificationService` + the `_notify_owner_result` pattern). Test 3.1.5. Draft **never matches** (filter `status=ACTIVE`).
- Feature flag read: add `SKILL_LEARNING_V1: bool = False` to `config.py`; surface to FE via `/platform/settings`.

### 4.2 Versioning + promotion
- On `PUT /skills/{slug}` procedure change (M1): `version += 1`, set `supersedes_id` to previous row id, keep previous `status` until new one `activate`d → then archive previous (test 3.2.1/3.2.2). Don't delete history.
- **A/B promotion** (`SKILL_AB_PROMOTION_V1` default false): `evaluate_promotion(skill)` run on `record_outcome` — if new version `success_rate > old + 0.10` over `≥20` runs → activate new, archive old (test 3.2.4/3.2.5). Implement as a FastAPI `BackgroundTasks` (like `agent_validation_runner`).

### 4.3 Deprecation (cron)
- `scripts/deprecate_unused_skills.py` (or an existing scheduler if one exists — check `backend` for cron/APScheduler; else a management script run via cron). Archive skills with `last_used_at > 90d`, warn 7d before (test 3.3.1/3.3.2). Never archive `source=IMPORTED` without manual confirm (test 3.3.2).

### 4.4 Failure → skill link
- Admin failures page "Create skill from fix" prefills `procedure` from the last successful recovery script for that `pattern_hash`; on save set `failure_ledger.resolved_by_skill_id` (test 3.4.1/3.4.2). Backend: `FailureLedgerService.link_skill(pattern_hash, skill_id)`.

---

## 5. Milestone 4 — Agent-scoped procedural memory (week 3–4)

### 5.1 Reuse same tables
- `scope=AGENT` + `agent_id` set (validator from M1.2). Platform `match` queries filter `scope IN ('platform','org')` (exclude agent) — test 4.1. Agent-scoped path `SkillMatcher.match_agent_context(agent, payload, enriched_input)` filters `scope='agent' AND agent_id=agent.id` — test 4.2.

### 5.2 Wizard UX
- `wizard-post-publish-panel.tsx`: add button «ذخیره روال موفق به‌عنوان مهارت» shown when validation `ok`. Calls `POST /skills` with `scope=AGENT, agent_id`, `procedure` built from executed bridges (test 4.3). Reuse `skill-client.createSkill`.

### 5.3 Invoke-time retrieval (backend)
**Exact insertion point:** `orchestrator_service.py` between `:307` (`enriched_input = await self.build_enriched_input(...)`) and `:322` (`path = resolve_execution_path(...)`):

```python
from src.core.execution_router import resolve_precision
from src.core.precision_defaults import ExecutionPrecision
if resolve_precision(agent) != ExecutionPrecision.DETERMINISTIC:   # P0 skips (Annex/plan 4.3)
    skill = await SkillMatcher(self.db).match_agent_context(agent, payload, enriched_input)
    if skill and skill.content_md:
        # inject into system prompt build (build_messages / build_system_prompt)
        enriched_input = f"{enriched_input}\n\n[SAVED PROCEDURE: {skill.slug}]\n{skill.content_md}"
```

This matches the existing pre-graph seam where `_forced_support_create_agent_result` returns early (`graph_agent.py:196-257`, called at `:579-590` & `:701-709` — subagent 2 confirmed). Start with **prompt injection only** (no UI bridges for tenant chat agents) — test 4.6. P0/DETERMINISTIC skips injection (test 4.5). Precision read via `resolve_precision(agent).value`.

RAG: `VectorStore.search(query, agent_id=agent.id)` already scopes by `agent_id` (`vector_store.py:122-128`) — agent skills' chunks (from M2.5 if you index agent skills) become retrievable (test 4.4).

---

## 6. Milestone 5 — Admin UI, flags, polish (week 4)

### 6.1 Admin pages
- `frontend/src/app/(dashboard)/admin/skills/page.tsx` + `frontend/src/app/(dashboard)/admin/failures/page.tsx`. Copy layout from `knowledge-base-admin.tsx` (plan §5.1). List, edit trigger+procedure (structured form or Monaco), read-only preview (render steps as static list — don't `playScript` for preview), link skill↔failure (M3.4). Non-admin blocked (test 5.1.5 — reuse `useAuth` role guard).
- Sidebar nav: add links in `sidebar.tsx`.

### 6.2 Feature flags
Add to `config.py` and expose via `/platform/settings`:
```
SKILL_LIBRARY_V1=true
FAILURE_LEDGER_V1=true
SKILL_LEARNING_V1=false
SKILL_AB_PROMOTION_V1=false
```
FE reads them the same way other phase flags are read in `platform-support-assistant.tsx`. `SKILL_LIBRARY_V1=false` → `skill-runner` falls back to `resolveLocalWizardContinueScript` (MIG-2, test 5.2.1). `FAILURE_LEDGER_V1=false` → no `/failures/record` calls (test 5.2.2).

### 6.3 Observability
Extend `execution_trace` with steps `skill_match` (confidence+slug), `skill_run` (success/fail), `failure_hint` (tags) using the existing `trace_step(...)` helper (used at `orchestrator_service.py:325-332`; shape documented in `agents_lib/execution_trace.py`). Emit in `skill-runner` (FE trace) and `SkillMatcher`/`FailureLedgerService` (BE). Tests 5.3.1-5.3.3.

### 6.4 Repo sync
- `backend/skills/platform/*.json` + `scripts/sync_platform_skills.py` (from §2.6). On deploy upsert into DB, idempotent (test 5.4.1/5.4.2). Cursor `.cursor/skills/` stay dev-only.

---

## 7. Bridge-migration verification (cross-cutting)
- **MIG-1** hot path uses skill runner before `resolveLocalWizardContinueScript` when `SKILL_LIBRARY_V1=true` (wire in `platform-support-assistant.tsx`).
- **MIG-2** API down → catch `matchSkill` network error → fall back to TS heal (don't crash).
- **MIG-3** continue-testing L2 uses `{{run_state.slug}}` only — `skill_template` aborts if slug unverified (no hallucination).
- **MIG-4** deactivate `wizard.continue-testing` → `match` returns None → LLM fallback, no crash.
- **MIG-5** karkard worker: `resolve_execution_path` returns DETERMINISTIC → `match_agent_context`/skill gate skips (P0 never injected; see §5.3). Add a test asserting no skill intercept for a `WORKER` agent with `karkard_process` tool.

---

## 8. Execution order (10 sessions) — grounded
1. **M1a** — `platform_skills` migration + model + schemas + `SkillService` CRUD. Tests: 1.1.1–1.1.7, 1.2.7.
2. **M1b** — `skill_matcher.py` + `core/skill_template.py` + `SkillTrigger`/`SkillProcedure` validation. Tests: 1.2.9–1.2.19.
3. **M1c** — `api/v1/skills.py` (incl `/match`, `/record-outcome`) + seed JSON ×4 + `sync_platform_skills.py`. Tests: 1.2.1–1.2.8, 1.4.1–1.4.3.
4. **M1d** — `skill-client.ts` + `skill-runner.ts` + wire `platform-support-assistant.tsx`. Tests: 1.3.1–1.3.6, 1.4.5, E2E continue-without-LLM. **Gate:** confirm autonomy gate decision (§0 caveat).
5. **M2a** — `failure_ledger` migration + model + `failure_ledger_service.record`. Tests: 2.1.1–2.1.4, 2.2.1–2.2.6.
6. **M2b** — `api/v1/failures.py` + context injection (`page-guide-context.ts`) + auto-recovery (`support-auto-recovery.ts`). Tests: 2.3.1–2.3.6. **Gate:** confirm `/failures/relevant` consumed before LLM retry.
7. **M2c** — admin failures page. Manual test 2.3.6.
8. **M3a** — `skill_learning_service.py` (draft queue) + validation hook (after `agent_validation_service.py:289`). Tests: 3.1.1–3.1.5 (+ 3.2.1/3.2.2 versioning).
9. **M3b** — promotion/deprecation + admin skills page. Tests: 3.2.3–3.2.5, 3.3.1–3.3.3, 5.1.
10. **M4** — agent-scoped skills + orchestrator injection (`orchestrator_service.py:~315`) + flags + QA. Tests: 4.1–4.6, MIG-*, E2E-1..8.

---

## 9. Risks & mitigations (concrete, verified)

| Risk | Concrete mitigation |
|------|---------------------|
| Phase 1 autonomy gate OFF (`graduated_autonomy_v1=False`) | Skill gate reads `run_state.payload.autonomy_level` directly (injected by FE `formatRunStateBlock`) + calls `autonomy_policy_service.resolve_level`; don't depend on the Phase 1 flag. |
| `run_state_v1` / `precision_routing_v1` flags never checked | Phase 2 implements its own `SKILL_LIBRARY_V1` / `FAILURE_LEDGER_V1` flags AND reads them (unlike Phase 1's optically-present-but-ungated flags). |
| Graph stale (`33d57f98` vs HEAD `9d4f5955`) | Run `graphify update .` after merge; trust inline reads over graph for file refs. |
| `procedure` not playable by player | Validate `procedure` against the 9-step contract in `SkillProcedure` schema (mirror `parseSupportUiScript`) so DB JSON is guaranteed valid. |
| `wait` step carries no round-tripping `label` | Don't rely on `wait.label`; player ignores it (`support-ui-script.ts:49`). |
| `VectorStore.upsert` dedups on `sha256(content)` not `source` | Include `pattern_hash` in failure chunk `content` so re-records dedup to one chunk; bump `meta.count` — and since `upsert` won't update existing rows, write a dedicated `upsert_failure()` that does `select`→`update meta` rather than the dedup-return-early path. |
| Singleton `upsert` vs `upsert_document` meta pollution | Use singular `upsert()` for failure/skill chunks; `upsert_document` appends `chunk_index/chunk_total` to meta. |
| Deploy snapshot drift (`.manage-agent-deploy/backend/...`) | Author against `backend/src/...` canonical; the deploy dir is a copy. |
| `bridge` action names for `permissions-default`/`resolve-planning` may not exist | **Verify in `support-automation-bridge.ts` / `support-testing-actions.ts` before authoring seed JSON**; add the bridge actions if missing (mirror `wizard.continue_testing`: registered via `runSupportBridge`). Known working actions: `wizard.create`, `wizard.continue_testing`, `training.complete`, `dashboard.approve`, `dashboard.generate_widget`. |
| Learned skills from UI scripts | `ActivityLog.details` does not persist executed UI scripts today — extend `orchestrator_service.activity.finish(details=...)` to include `ui_scripts`/`ui_actions` from `run_result` before M3 learning, or scope M3 to tool/bridge traces. |
| Ledger PII leakage | Redaction in `failure_ledger_service.record` (emails, secrets, 200-char cap, slug hashing). |
| Duplicate with KnowledgeDataset | Separate `platform_skills` table; chunks tagged `meta.kind="failure"` / `"skill"`, paired with `source="failure_ledger:{hash}"` / `"skill:{slug}"`. |
| Missing phase-1 fallback value | If `run_state` is absent (404 returns empty default per `run_state.py:58`), skill matcher should degrade to `confidence=0` and defer to LLM (don't crash). |

---

## 10. Test commands (from plan, all paths verified to exist)
```bash
cd backend && pytest tests/unit/test_skill_matcher.py tests/unit/test_skill_template.py tests/unit/test_failure_ledger.py tests/integration/test_skills_api.py -q
cd frontend && npm run test -- skill-runner skill-client support-auto-recovery
# phase gate:
cd backend && pytest tests/unit/test_skill*.py tests/unit/test_failure_ledger*.py tests/integration/test_skills*.py tests/integration/test_failures*.py -q
cd frontend && npm run test -- skill support-auto-recovery page-guide-context
python backend/scripts/sync_platform_skills.py --dry-run
```
Keep Phase 1 run-state tests green throughout (`backend/tests/unit/test_run_state_service.py`, `test_execution_router.py`, `frontend/src/lib/run-state-client.test.ts`, `autonomy-policy.test.ts`).

After merge: `graphify update .`
# Phase 2 — Implementation Build Plan (DETAILED, code-grounded)

Companion to `02-phase-2-institutional-memory.md`. Read that first. This file turns each milestone into concrete, file-and-line-anchored steps using the *actual* code that already exists. Every reference was verified against the working tree (HEAD `9d4f5955`); the graphify graph (`33d57f98`) is a few commits stale — trust the inline reads.

---

## 0. Phase 1 readiness — VERIFIED

Phase 1 is **implemented and wired** (not planned-only). Phase 2 can build immediately; no Phase 1 stubs remain.

| Need | Where | Shape / key symbols |
|------|-------|----------------------|
| Run state | `backend/src/models/run_state.py`, `services/run_state_service.py`, `api/v1/run_state.py`, `schemas/run_state.py` | `RunState(scope_type, scope_key, user_id, agent_id, slug, phase, wizard_step_index, payload JSONB, version)`. `RunStatePhase` enum: `unknown, wizard_form, wizard_steps, publish, planning, training, dashboard, validation, complete, error`. |
| Run state API | `api/v1/run_state.py` | `GET/PUT/PATCH/DELETE /run-state/{scope_type}/{scope_key}` → `RunStateRead`. Raises `RunStateNotFound` (→ empty default) / `RunStateConflict` (optimistic lock on `version`). |
| FE run state | `frontend/src/lib/run-state-client.ts` | `getRunState/putRunState/patchRunState/deleteRunState/wizardScopeKey`. Types `RunState`, `RunStateScope`, `RunStatePayload`. |
| Autonomy | `services/autonomy_policy_service.py`, `models/user.py:62-73`, `frontend/src/lib/autonomy-policy.ts` | `AutonomyLevel.OBSERVE=0/ASSIST=1/AUTO=2/UNATTENDED=3`. `resolve_level(db,user,session_override)` → int. FE `canRunAutomation(level, action)`: `suggest>=0, fill>=1, bridge>=2, full>=3`. |
| Precision routing | `core/execution_router.py`, `core/precision_defaults.py` | `resolve_execution_path(agent, payload, caps=)` → `ExecutionPath{AUTO_TOOL,REACT,SUPERVISOR,PLAIN_LLM}`. `resolve_precision(agent)`, `precision_for_kind(kind)`, `precision_from_config(config_json)`. |
| Run-state → backend parse | `agents_lib/platform_support_grounding.py:184-208` | `parse_run_state_block(text)` → `{phase, slug, autonomy_level, execution_precision}` parsed from the `[RUN STATE — AUTHORITATIVE]` block the FE injects via `page-guide-context.ts:247`. |
| FE context block | `frontend/src/lib/page-guide-context.ts:247` | `formatRunStateBlock(state)` emits `phase`, `slug (verified)`, `wizard_step`, `autonomy_level`, `execution_precision`. |

**CRITICAL CAVEAT (affects M1d + M2b):** the autonomy gate is **OFF by default**. `autonomy_policy_service.autonomy_gates_enabled()` returns `settings.graduated_autonomy_v1`, which is `False` in `config.py`. Also `run_state_v1` / `precision_routing_v1` flags exist as `True` constants but are never checked (M1/M2 paths run unconditionally).

**Decision required:** Phase 2's "L0 = no auto-run, L2+ = skill first" depends on a real autonomy level. Two options:
- (A) Flip `graduated_autonomy_v1 = True` in `.env` for staging; OR
- (B) Phase 2 reads `run_state.payload.autonomy_level` directly (already injected by FE via `formatRunStateBlock`) and applies its own gate, independent of the Phase 1 flag.

**Recommendation:** use (B) for the skill gate, but still call `autonomy_policy_service.resolve_level()` as the source of `min_autonomy_level` truth. Keeps Phase 2 robust whether or not `graduated_autonomy_v1` is flipped.

**Graph drift:** graphify `graph.json` was built at `33d57f98`; HEAD is `9d4f5955`. Run `graphify update .` after Phase 2 merges.

---

## 1. Reusable patterns to COPY

### 1.1 New tables — match the latest migration style
Latest migration head = `p7q8r9s0t1u2` (`alembic/versions/p7q8r9s0t1u2_autonomy_preferences.py`). New migrations set `down_revision = "p7q8r9s0t1u2"` and a fresh `revision` slug. Use `sa.UUID()` + `sa.DateTime(timezone=True), server_default=sa.text("now()")` (matches `UUIDPkMixin`/`TimestampMixin` at `database/base.py:20-44`). FK columns use `sa.UUID()` + `op.create_foreign_key(..., ondelete=...)`. Index via `op.create_index("ix_<table>_<col>", "<table>", ["<col>"])`. Reference: `alembic/versions/l3m4n5o6p7q8_knowledge_datasets.py` (create_table + FK onto `document_chunks`).

ORM models subclass `Base, UUIDPkMixin, TimestampMixin` (see `models/run_state.py` and `models/document_chunk.py`). JSONB via `from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID`.

### 1.2 API router registration
Add module to `backend/src/api/v1/router.py` import block + `api_router.include_router(skills.router, tags=["skills"])` / `failures.router, tags=["failures"]`. Copy the `run_state.router` mount (no prefix, tagged) or `knowledge.router` (prefix `/knowledge`). Dependencies: `from src.api.dependencies import DB, CurrentUser, CurrentSuperuser`. Examples: `api/v1/knowledge.py:9,64`, `api/v1/run_state.py:7-16`.

### 1.3 Pydantic v2 schemas
Pattern (from `run_state.py` schemas + `knowledge_dataset.py`): `model_config = ConfigDict(from_attributes=True)`; create/update via `BaseModel` with `Field(default_factory=dict)`; convert ORM→schema with `SkillRead.model_validate(row)` (see `agents.py:144,379`). Partial PATCH uses `model_dump(exclude_unset=True)` (`run_state_service._apply_patch:95`).

### 1.4 Service + repository
Thin services take `db: AsyncSession` in `__init__` (see `RunStateService`, `ActivityService`, `VectorStore`). Repository: `class XRepository(BaseRepository[X])` with `model = X` (`repositories/base.py`, `repositories/agent_repo.py`). For simple CRUD, call `db.add/get` directly in the service (as `RunStateService` does).

### 1.5 Validation failure taxonomy (seed source for `root_cause_tag`)
`AgentValidationService` (`services/agent_validation_service.py:84-294`): collects `list[ValidationFailure]` of `dataclass(phase, message, fixable_in_admin)` (`:48-52`). Phases observed: `instruction_compile`, `tool_resolution`, `script_generate`, `script_verify`. `ok = not failures` at `:267`; success → `agent.status = ACTIVE` (`:283`); fixable failures → `ERROR` (`:284`); else `DRAFT` (`:287`). Hook point for Phase 3 learning = **right after `:289`** (`_notify_owner_result`), reusing `self.db`.

---

## 2. Milestone 1 — Skill Library core (week 1)

### 2.1 Migration + model
- **Migration:** `alembic/versions/<rev>_platform_skills.py`, `down_revision="p7q8r9s0t1u2"`. Columns from plan §1.1, with:
  - `id sa.UUID()` PK; `created_at/updated_at` `server_default=sa.text("now()")`.
  - `scope sa.String(32)`, `status sa.String(16)`, `source sa.String(16)`, `version sa.Integer()` default 1.
  - `trigger JSONB` + `procedure JSONB` + `stats JSONB` (`postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"`).
  - `slug sa.String(120) NOT NULL UNIQUE`; `agent_id sa.UUID() NULL` FK→`agents.id` ON DELETE CASCADE; `org_id` deferred (nullable, no FK yet); `created_by sa.UUID() NULL` FK→`users.id` ON DELETE SET NULL; `supersedes_id sa.UUID() NULL` FK→`platform_skills.id` ON DELETE SET NULL.
  - Indexes: `ix_platform_skills_status(status)`, `ix_platform_skills_scope(scope, agent_id)`.
  - CHECK: `scope IN ('platform','org','agent')`. The "`scope='agent'` requires `agent_id`" rule enforced in the **Pydantic validator**, not DB.
- **Model:** `backend/src/models/platform_skill.py` mirroring `RunState` fields + `UUIDPkMixin, TimestampMixin`. Define `SkillScope(str,enum.Enum){PLATFORM,ORG,AGENT}`, `SkillStatus(str,enum.Enum){DRAFT,ACTIVE,ARCHIVED}`, `SkillSource(str,enum.Enum){MANUAL,LEARNED,IMPORTED}` as Python enums (keep JSON-friendly like `RunStatePhase` — don't rely on SAEnum).

### 2.2 Schemas — `backend/src/schemas/platform_skill.py`

```python
class SkillTrigger(BaseModel):
    phase_any: list[str] = []
    pathname_prefix: str | None = None
    intent_regex: str | None = None
    run_state: dict = {}
    min_autonomy_level: int = 0
    agent_kind_any: list[str] = []
    priority: int = 0

class SkillProcedure(BaseModel):
    # EXACTLY the SupportUiScript contract (frontend/src/lib/support-ui-script.ts:30-33)
    label: str
    steps: list[dict]   # each step validated against the 9 allowed types

class SkillStats(BaseModel):
    success_count: int = 0
    failure_count: int = 0
    last_used_at: str | None = None

class PlatformSkillCreate(BaseModel):
    slug: str
    name: str
    name_fa: str | None = None
    description: str | None = None
    scope: SkillScope = SkillScope.PLATFORM
    agent_id: UUID | None = None
    source: SkillSource = SkillSource.MANUAL
    trigger: SkillTrigger = SkillTrigger()
    procedure: SkillProcedure
    content_md: str | None = None
    # validator: scope==AGENT and agent_id is None -> ValueError

class PlatformSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # id, slug, name, name_fa, description, scope, agent_id, source, status,
    # version, trigger, procedure, content_md, stats, created_by, created_at, updated_at
```

**`procedure` validation:** mirror the guard set from `parseSupportUiScript` (`support-ui-script.ts:47-111`) — each step must have a legal `type` ∈ `{navigate, wait, wait_for_path, wait_for_dom, highlight, click, type, select, bridge}`; `bridge` needs `action:str`; `type`/`select` need `text`/`value:str`; `wait` needs `ms:int`; `wait_for_path` needs `pattern:str`. This guarantees `procedure` stored in DB is **guaranteed playable** by the existing player without re-parsing.

**`trigger` validation:** `min_autonomy_level` 0..3; `priority` int; `phase_any` values must be valid `RunStatePhase` strings (import `RunStatePhase` from `models/run_state.py`).

### 2.3 Service + matcher — `services/skill_service.py`, `services/skill_matcher.py`, `core/skill_template.py`

**`SkillService(db)`** CRUD: `create`, `get`, `list(scope?,status?)`, `update` (bump `version` if `procedure`/`trigger` changed; set `supersedes_id` on activate), `activate(slug)` (draft→active; archive previous active version of same slug), `record_outcome(slug, success: bool)` (increment `stats.success_count|failure_count`, set `last_used_at`), `get_active_for_match(...)`.

**`skill_template.py` — safe `{{var}}` substitution** (plan §1.2, Annex B): allowed tokens `{{run_state.slug}}`, `{{run_state.phase}}`, `{{user.id}}`, `{{payload.name}}`. **Reject any other token** → raise `UnknownSkillTokenError` (test 1.2.17). Pure `str.replace`, NO LLM (test 1.2.18). Resolve from a context dict `{run_state:{...}, user:{...}, payload:{...}}`. `{{run_state.slug}}` when unverified/None → **abort before player if a bridge step's payload would contain an empty slug** (Annex B.5/B.6.5; slug hallucination is the #1 risk the whole plan prevents).

**`SkillMatcher(db)` — `match(context) -> MatchResult(skill|None, confidence, reasons)`** (plan §1.2): input `context = {run_state, message, pathname, snapshot_hash, agent_kind}`. Scoring:

| Signal | Score |
|--------|-------|
| `phase` exact match (`run_state.phase in trigger.phase_any`) | +0.4 |
| `pathname_prefix` match | +0.2 |
| `intent_regex` match (`re.search`) | +0.2 |
| `run_state` predicates subset of `payload` | +0.2 (capped) |
| `success_rate` multiplier | ×0.8–1.2 (0 runs → 1.0) |
| `min_autonomy_level` not met | disqualify (return None) |

Threshold: **≥0.75** → `should_execute=True`; **0.5–0.74** → `should_suggest=True`; **<0.5** → None. Tie-break by `priority` desc, then `success_rate`. Only `status=ACTIVE` skills (draft never matches — test 1.2.8). Return top 1.

### 2.4 API — `backend/src/api/v1/skills.py`
Routes from plan §1.2. Key:
- `POST /skills/match` body `{run_state, message, pathname, snapshot_hash}` → `MatchResultRead{slug, confidence, should_execute, should_suggest, procedure}`. Build context, call `SkillMatcher.match`, **template-resolve** `procedure` before returning. If `should_execute` and `run_state.payload.autonomy_level < 2` → downgrade to suggest.
- `POST /skills/{slug}/record-outcome` body `{success: bool}` → `SkillService.record_outcome`. Auth: `CurrentUser`.
- `PUT /skills/{slug}` → bump version on procedure change (test 1.2.7).
- Admin-only writes via `CurrentSuperuser` (test 1.2.1).

### 2.5 Frontend runner — `frontend/src/lib/skill-client.ts`, `skill-runner.ts`

**`skill-client.ts`**: `matchSkill(ctx)`, `recordSkillOutcome(slug, success)`, `getSkill`, `listSkills`, `createSkill`, `activateSkill`, `updateSkill` — mirror `run-state-client.ts`/`api.ts` conventions (axios wrapper, `ApiError` handling from `support-error-text.ts`).

**`skill-runner.ts` — `matchAndRunSkill(context): Promise<'ran'|'no_match'|'failed'>`**:

```text
1. rs = await getRunState(scope)               // Phase 1
2. autonomy = rs?.payload?.autonomy_level ?? 1
3. if autonomy < 2 and not flag-allow-L0: return 'no_match'   // Annex B.5
4. res = await matchSkill({run_state: rs, message, pathname, snapshot_hash})
5. if !res.should_execute: return 'no_match'   // 0.5–0.74 → caller shows suggestion UI
6. try {
     await useSupportUiPlayer().playScript(res.procedure)   // runUiOutcome
     await recordSkillOutcome(res.slug, true)
     return 'ran'
   } catch (e) {
     await recordSkillOutcome(res.slug, false)
     if (e instanceof SupportUiBlockedError) await recordFailure(...)  // M2 wire
     return 'failed'
   }
```

Wire into `platform-support-assistant.tsx` send path: call `matchAndRunSkill` BEFORE the LLM invoke; if `'ran'` → skip LLM (Annex B.1). Feature flag `SKILL_LIBRARY_V1`. When false → `skill-runner` returns `'no_match'` and the existing `resolveLocalWizardContinueScript` path is used (MIG-2). Read the flag the same way other flags are read in `platform-support-assistant.tsx` (env `NEXT_PUBLIC_*` or `/platform/settings` fetch).

### 2.6 Seed skills — `backend/skills/platform/*.json` + `scripts/sync_platform_skills.py`
Author the 4 procedures to **exactly match** the TS builders so parity tests pass:

1. **`wizard.continue-testing`** — mirror `buildWizardContinueTestingScript` (`support-wizard-mission.ts:225-244`):

```json
{ "label": "ادامه تست «{{payload.name}}»",
  "steps": [ { "type":"bridge", "action":"wizard.continue_testing",
               "payload": { "agent_slug": "{{run_state.slug}}", "name":"{{payload.name}}" },
               "label":"آموزش تعاملی، طراحی پنل و تأیید" } ] }
```

Trigger: `{ "phase_any":["training","dashboard","validation","complete"], "intent_regex":"ادامه|continue|تست", "min_autonomy_level":2, "priority":100 }`.

2. **`wizard.create-full`** — mirror `buildWizardCreateBridgeScript` (`support-wizard-mission.ts:189-222`):

```json
{ "label":"تکمیل ساخت «{{payload.name}}»",
  "steps":[
    {"type":"bridge","action":"wizard.create","payload":{"name":"{{payload.name}}","agent_slug":"{{run_state.slug}}"},"label":"پیمایش ویزارد تا تست"},
    {"type":"wait_for_path","pattern":"slug=","timeout_ms":120000,"label":"منتظر آماده‌سازی تست…"},
    {"type":"wait","ms":1200},
    {"type":"bridge","action":"wizard.continue_testing","payload":{"agent_slug":"{{run_state.slug}}","name":"{{payload.name}}"},"label":"آموزش تعاملی"}
  ] }
```

Trigger: `{ "phase_any":["wizard_steps","wizard_form"], "min_autonomy_level":2, "priority":90 }`.

3. **`wizard.permissions-default`** — Mechanical (Annex B.5). Trigger: `{ "phase_any":["training","dashboard"], "intent_regex":"دسترسی|permissions|مجوز", "min_autonomy_level":2, "priority":95 }`. Procedure: a `bridge` step `action:"wizard.permissions_default"`. **Verify the bridge action exists in `support-automation-bridge.ts` before authoring; if not, add it there mirroring `ensurePermissionsDefault`.**

4. **`wizard.resolve-planning`** — Trigger: `{ "phase_any":["planning"], "min_autonomy_level":2 }`. Procedure: `bridge` `action:"wizard.resolve_planning"`. **Confirm in `support-testing-actions.ts` / bridge registry; else add.**

`scripts/sync_platform_skills.py`: idempotent upsert keyed by `slug` (insert if missing, update `procedure`/`trigger`/`name` if JSON changed; never clobber `status=active` set by an admin — create a new `version`). `--dry-run` prints the 4 slugs + diff. Run at deploy + CI for parity (test 1.4.6).

Parity tests: `test_skill_seed_parity.py` imports each TS builder output (`buildWizardContinueTestingScript(buildContinueTestingPayload(slug))`), normalizes to the `procedure` shape, asserts equality with committed JSON (after template-token normalization, since TS uses real values and JSON uses `{{...}}`).

---

## 3. Milestone 2 — Failure Ledger (week 2)

### 3.1 Migration + model
Table `failure_ledger` per plan §2.1, same migration style as §2.1:
- `id sa.UUID()` PK; `created_at/updated_at` `server_default=sa.text("now()")`.
- `pattern_hash sa.String(64) NOT NULL UNIQUE` (sha256 of `tag|normalized_error|phase|tool`).
- `scope sa.String(32)` default `'platform'`; `phase sa.String(32)`; `pathname_prefix sa.String(255)`; `tool_name sa.String(120)`; `error_regex sa.String(512)`; `root_cause_tag sa.String(64)`; `occurrence_count sa.Integer()` default 1; `last_seen_at sa.DateTime(timezone=True)` default now.
- `resolved_by_skill_id sa.UUID() NULL` → `platform_skills.id` ON DELETE SET NULL.
- `sample_redacted sa.Text()`.
- Indexes: `ix_failure_ledger_tag(root_cause_tag)`, `ix_failure_ledger_count(occurrence_count DESC)`.
- Model: **`RootCauseTag(str, enum.Enum)`** with the 10 plan values (`slug_hallucination|permissions_ui|blocker_misdetect|wizard_step_rewind|agent_not_found|planning_stuck|widget_disabled|network|unknown`). Validate against it in the schema (test 2.1.3).

### 3.2 Service — `services/failure_ledger_service.py`

**`record(tag, phase, pathname_prefix, tool_name, error_text, recommended_fix, sample_redacted)`:**
- Normalize error (lower, strip whitespace) → `pattern_hash = sha256(f"{tag}|{norm_err}|{phase}|{tool_name}")`.
- **Redaction (privacy):** strip emails (`[^@\s]+@[^@\s]+\.[^@\s]+`), strip `.env`-style secrets (`(?i)(KEY|SECRET|TOKEN|PASSWORD)=...`), truncate `sample_redacted` to **200 chars** (tests 2.2.4/2.2.5).
- Upsert: if `pattern_hash` exists → `occurrence_count += 1`, refresh `last_seen_at`; else insert (test 2.2.3).

**`relevant(phase, pathname, error_substr, limit=3)`:** ordered by `occurrence_count DESC`, filtered by tag/phase/pathname; used for context injection + auto-recovery.

**`top(limit)`:** admin dashboard.

**`link_skill(pattern_hash, skill_id)`:** set `resolved_by_skill_id` (M3.4).

`recommended_fix` schema: `{type:"skill"|"user_action"|"tool", ...}` validated in schema (test 2.1.4).

### 3.3 Write hooks (FE + BE)
- **`support-ui-player.tsx`** catch block (line 350 `catch (e)`): add `recordFailureOnBlock(e)` POSTing `/failures/record` with `{tag: mapBlockerToTag(e.blockerText), phase, pathname, tool_name, error_text}`. Map blocker → `root_cause_tag` via `support-error-text.ts` `humanizeSupportError` patterns (test 2.2.6). **Keep the existing `SupportUiBlockedError` rethrow** — recording is fire-and-forget (don't fail the run if the API is down).
- **`support-auto-recovery.ts`** (`tryAutoResolveSupportError`): before its current heuristics, GET `/failures/relevant` for the current blocker; if a `recommended_fix.type==='skill'` and autonomy≥L2 → run that skill **once** (flag `triedSkillRecovery` to prevent loops; test 2.3.4). L1 → hint only (test 2.3.5).
- **Backend tool `success:false`:** where platform tools report failure (in `agents_lib/platform_tools.py` or `graph_agent._apply_support_post_process` `extract_platform_tool_results` path at `graph_agent.py:324`), call `FailureLedgerService.record` with `tool_name` (test 2.2.2).
- **Validation hook** (`agent_validation_service.py` after `:289`): optional aggregate — for each `ValidationFailure`, `record(tag=phase, error_text=message)` if failures present (test 2.2.7).

### 3.4 Read path + context injection
- **API `api/v1/failures.py`**: `GET /failures/relevant`, `GET /failures/top`, `POST /failures/record`.
- **`page-guide-context.ts`**: add `buildFailureHintsBlock(failures)` emitting the `[FAILURE HINTS]` block (plan §2.3). Inject into `buildSupportContextBlock` (`:196`) when `FAILURE_LEDGER_V1` is on. Cap to top 3 (test 2.3.3).
- **Auto-recovery** (above) reads the same `/failures/relevant`.

### 3.5 RAG index (optional v1.1)
On record/update, `VectorStore(db).upsert(content=f"{tag}: {sample_redacted} {pattern_hash}", source=f"failure_ledger:{pattern_hash}", meta={kind:"failure", tag, count:occurrence_count})`.

**Constraint — critical:** `VectorStore.upsert` dedups on `sha256(content)`, not `source` (`vector_store.py:67-72`). To keep one chunk per pattern that updates over time, make `content` a deterministic function that **includes the `pattern_hash`**, and use singular `upsert()` (not `upsert_document`, which appends `chunk_index/chunk_total` to meta). For count bumps, you'll need a dedicated `upsert_failure()` that does `select`→`update meta` rather than the dedup-return-early path, since `upsert()` won't update an existing row. Tests 2.4.1/2.4.2. Embedding model = `text-embedding-3-small` (1536-dim), requires `OPENAI_API_KEY` (raises `RuntimeError` if absent — guard behind the v1.1 flag).

---

## 4. Milestone 3 — Learning loop & lifecycle (week 3)

### 4.1 Learning service — `services/skill_learning_service.py`
- Triggered from `agent_validation_service.py` after `:289` (`ok = not failures` path):
  - Gated by `SKILL_LEARNING_V1` (default **false** — test 3.1.1). Read via settings.
  - Insert right after `ok`/status block, before notifications (`≈:289`), reusing `self.db` (same transaction as the validation commit at `:293`):
    ```python
    if not failures:
        await SkillLearningService(self.db).learn_from_validation(agent, owner)
    ```
  - Collect trajectory: `ActivityLog.details.execution_trace` carries `kind ∈ {tool, tool_result, llm_request, llm_config, execution_path, ...}` + `payload.precision` (subagent 3 confirmed: `execution_path` step has `payload={"precision": tier}`). **UI scripts are NOT currently persisted** in `ActivityLog.details` — they flow into `AgentRunResult.ui_scripts`/`ui_actions` and the SSE `done` payload (`invoke_service.py:242-247`) but are lost at DB-write time. **Close this gap in M3a** by extending `orchestrator_service.py:423-429` `activity.finish(details=...)` to include `ui_scripts`/`ui_actions` from `run_result`, OR scope M3 learning to tool/bridge traces only.
  - Build **draft** `PlatformSkill`: `procedure.steps = dedupe(trajectory tool/bridge steps)` (test 3.1.4), `trigger` inferred from final `run_state` + first user message intent, `source=LEARNED`, `status=DRAFT`. `content_md` via optional LLM summary (skip if flag off).
  - Save + notify admin (reuse `NotificationService` + the `_notify_owner_result` pattern). Test 3.1.5. Draft **never matches** (filter `status=ACTIVE`).
- Feature flag read: add `SKILL_LEARNING_V1: bool = False` to `config.py`; surface to FE via `/platform/settings`.

### 4.2 Versioning + promotion
- On `PUT /skills/{slug}` procedure change (M1): `version += 1`, set `supersedes_id` to previous row id, keep previous `status` until new one `activate`d → then archive previous (test 3.2.1/3.2.2). Don't delete history.
- **A/B promotion** (`SKILL_AB_PROMOTION_V1` default false): `evaluate_promotion(skill)` run on `record_outcome` — if new version `success_rate > old + 0.10` over `≥20` runs → activate new, archive old (test 3.2.4/3.2.5). Implement as a FastAPI `BackgroundTasks` (like `agent_validation_runner`).

### 4.3 Deprecation (cron)
- `scripts/deprecate_unused_skills.py` (or an existing scheduler if one exists — check `backend` for cron/APScheduler; else a management script run via cron). Archive skills with `last_used_at > 90d`, warn 7d before (test 3.3.1/3.3.2). Never archive `source=IMPORTED` without manual confirm (test 3.3.2).

### 4.4 Failure → skill link
- Admin failures page "Create skill from fix" prefills `procedure` from the last successful recovery script for that `pattern_hash`; on save set `failure_ledger.resolved_by_skill_id` (test 3.4.1/3.4.2). Backend: `FailureLedgerService.link_skill(pattern_hash, skill_id)`.

---

## 5. Milestone 4 — Agent-scoped procedural memory (week 3–4)

### 5.1 Reuse same tables
- `scope=AGENT` + `agent_id` set (validator from M1.2). Platform `match` queries filter `scope IN ('platform','org')` (exclude agent) — test 4.1. Agent-scoped path `SkillMatcher.match_agent_context(agent, payload, enriched_input)` filters `scope='agent' AND agent_id=agent.id` — test 4.2.

### 5.2 Wizard UX
- `wizard-post-publish-panel.tsx`: add button «ذخیره روال موفق به‌عنوان مهارت» shown when validation `ok`. Calls `POST /skills` with `scope=AGENT, agent_id`, `procedure` built from executed bridges (test 4.3). Reuse `skill-client.createSkill`.

### 5.3 Invoke-time retrieval (backend)
**Exact insertion point:** `orchestrator_service.py` between `:307` (`enriched_input = await self.build_enriched_input(...)`) and `:322` (`path = resolve_execution_path(...)`):

```python
from src.core.execution_router import resolve_precision
from src.core.precision_defaults import ExecutionPrecision
if resolve_precision(agent) != ExecutionPrecision.DETERMINISTIC:   # P0 skips (Annex/plan 4.3)
    skill = await SkillMatcher(self.db).match_agent_context(agent, payload, enriched_input)
    if skill and skill.content_md:
        # inject into system prompt build (build_messages / build_system_prompt)
        enriched_input = f"{enriched_input}\n\n[SAVED PROCEDURE: {skill.slug}]\n{skill.content_md}"
```

This matches the existing pre-graph seam where `_forced_support_create_agent_result` returns early (`graph_agent.py:196-257`, called at `:579-590` & `:701-709` — subagent 2 confirmed). Start with **prompt injection only** (no UI bridges for tenant chat agents) — test 4.6. P0/DETERMINISTIC skips injection (test 4.5). Precision read via `resolve_precision(agent).value`.

RAG: `VectorStore.search(query, agent_id=agent.id)` already scopes by `agent_id` (`vector_store.py:122-128`) — agent skills' chunks (from M2.5 if you index agent skills) become retrievable (test 4.4).

---

## 6. Milestone 5 — Admin UI, flags, polish (week 4)

### 6.1 Admin pages
- `frontend/src/app/(dashboard)/admin/skills/page.tsx` + `frontend/src/app/(dashboard)/admin/failures/page.tsx`. Copy layout from `knowledge-base-admin.tsx` (plan §5.1). List, edit trigger+procedure (structured form or Monaco), read-only preview (render steps as static list — don't `playScript` for preview), link skill↔failure (M3.4). Non-admin blocked (test 5.1.5 — reuse `useAuth` role guard).
- Sidebar nav: add links in `sidebar.tsx`.

### 6.2 Feature flags
Add to `config.py` and expose via `/platform/settings`:
```
SKILL_LIBRARY_V1=true
FAILURE_LEDGER_V1=true
SKILL_LEARNING_V1=false
SKILL_AB_PROMOTION_V1=false
```
FE reads them the same way other phase flags are read in `platform-support-assistant.tsx`. `SKILL_LIBRARY_V1=false` → `skill-runner` falls back to `resolveLocalWizardContinueScript` (MIG-2, test 5.2.1). `FAILURE_LEDGER_V1=false` → no `/failures/record` calls (test 5.2.2).

### 6.3 Observability
Extend `execution_trace` with steps `skill_match` (confidence+slug), `skill_run` (success/fail), `failure_hint` (tags) using the existing `trace_step(...)` helper (used at `orchestrator_service.py:325-332`; shape documented in `agents_lib/execution_trace.py`). Emit in `skill-runner` (FE trace) and `SkillMatcher`/`FailureLedgerService` (BE). Tests 5.3.1-5.3.3.

### 6.4 Repo sync
- `backend/skills/platform/*.json` + `scripts/sync_platform_skills.py` (from §2.6). On deploy upsert into DB, idempotent (test 5.4.1/5.4.2). Cursor `.cursor/skills/` stay dev-only.

---

## 7. Bridge-migration verification (cross-cutting)
- **MIG-1** hot path uses skill runner before `resolveLocalWizardContinueScript` when `SKILL_LIBRARY_V1=true` (wire in `platform-support-assistant.tsx`).
- **MIG-2** API down → catch `matchSkill` network error → fall back to TS heal (don't crash).
- **MIG-3** continue-testing L2 uses `{{run_state.slug}}` only — `skill_template` aborts if slug unverified (no hallucination).
- **MIG-4** deactivate `wizard.continue-testing` → `match` returns None → LLM fallback, no crash.
- **MIG-5** karkard worker: `resolve_execution_path` returns DETERMINISTIC → `match_agent_context`/skill gate skips (P0 never injected; see §5.3). Add a test asserting no skill intercept for a `WORKER` agent with `karkard_process` tool.

---

## 8. Execution order (10 sessions) — grounded
1. **M1a** — `platform_skills` migration + model + schemas + `SkillService` CRUD. Tests: 1.1.1–1.1.7, 1.2.7.
2. **M1b** — `skill_matcher.py` + `core/skill_template.py` + `SkillTrigger`/`SkillProcedure` validation. Tests: 1.2.9–1.2.19.
3. **M1c** — `api/v1/skills.py` (incl `/match`, `/record-outcome`) + seed JSON ×4 + `sync_platform_skills.py`. Tests: 1.2.1–1.2.8, 1.4.1–1.4.3.
4. **M1d** — `skill-client.ts` + `skill-runner.ts` + wire `platform-support-assistant.tsx`. Tests: 1.3.1–1.3.6, 1.4.5, E2E continue-without-LLM. **Gate:** confirm autonomy gate decision (§0 caveat).
5. **M2a** — `failure_ledger` migration + model + `failure_ledger_service.record`. Tests: 2.1.1–2.1.4, 2.2.1–2.2.6.
6. **M2b** — `api/v1/failures.py` + context injection (`page-guide-context.ts`) + auto-recovery (`support-auto-recovery.ts`). Tests: 2.3.1–2.3.6. **Gate:** confirm `/failures/relevant` consumed before LLM retry.
7. **M2c** — admin failures page. Manual test 2.3.6.
8. **M3a** — `skill_learning_service.py` (draft queue) + validation hook (after `agent_validation_service.py:289`). Tests: 3.1.1–3.1.5 (+ 3.2.1/3.2.2 versioning).
9. **M3b** — promotion/deprecation + admin skills page. Tests: 3.2.3–3.2.5, 3.3.1–3.3.3, 5.1.
10. **M4** — agent-scoped skills + orchestrator injection (`orchestrator_service.py:~315`) + flags + QA. Tests: 4.1–4.6, MIG-*, E2E-1..8.

---

## 9. Risks & mitigations (concrete, verified)

| Risk | Concrete mitigation |
|------|---------------------|
| Phase 1 autonomy gate OFF (`graduated_autonomy_v1=False`) | Skill gate reads `run_state.payload.autonomy_level` directly (injected by FE `formatRunStateBlock`) + calls `autonomy_policy_service.resolve_level`; don't depend on the Phase 1 flag. |
| `run_state_v1` / `precision_routing_v1` flags never checked | Phase 2 implements its own `SKILL_LIBRARY_V1` / `FAILURE_LEDGER_V1` flags AND reads them (unlike Phase 1's optically-present-but-ungated flags). |
| Graph stale (`33d57f98` vs HEAD `9d4f5955`) | Run `graphify update .` after merge; trust inline reads over graph for file refs. |
| `procedure` not playable by player | Validate `procedure` against the 9-step contract in `SkillProcedure` schema (mirror `parseSupportUiScript`) so DB JSON is guaranteed valid. |
| `wait` step carries no round-tripping `label` | Don't rely on `wait.label`; player ignores it (`support-ui-script.ts:49`). |
| `VectorStore.upsert` dedups on `sha256(content)` not `source` | Include `pattern_hash` in failure chunk `content` so re-records dedup to one chunk; bump `meta.count` — and since `upsert` won't update existing rows, write a dedicated `upsert_failure()` that does `select`→`update meta` rather than the dedup-return-early path. |
| Singleton `upsert` vs `upsert_document` meta pollution | Use singular `upsert()` for failure/skill chunks; `upsert_document` appends `chunk_index/chunk_total` to meta. |
| Deploy snapshot drift (`.manage-agent-deploy/backend/...`) | Author against `backend/src/...` canonical; the deploy dir is a copy. |
| `bridge` action names for `permissions-default`/`resolve-planning` may not exist | **Verify in `support-automation-bridge.ts` / `support-testing-actions.ts` before authoring seed JSON**; add the bridge actions if missing (mirror `wizard.continue_testing`: registered via `runSupportBridge`). Known working actions: `wizard.create`, `wizard.continue_testing`, `training.complete`, `dashboard.approve`, `dashboard.generate_widget`. |
| Learned skills from UI scripts | `ActivityLog.details` does not persist executed UI scripts today — extend `orchestrator_service.activity.finish(details=...)` to include `ui_scripts`/`ui_actions` from `run_result` before M3 learning, or scope M3 to tool/bridge traces. |
| Ledger PII leakage | Redaction in `failure_ledger_service.record` (emails, secrets, 200-char cap, slug hashing). |
| Duplicate with KnowledgeDataset | Separate `platform_skills` table; chunks tagged `meta.kind="failure"` / `"skill"`, paired with `source="failure_ledger:{hash}"` / `"skill:{slug}"`. |
| Missing phase-1 fallback value | If `run_state` is absent (404 returns empty default per `run_state.py:58`), skill matcher should degrade to `confidence=0` and defer to LLM (don't crash). |

---

## 10. Test commands (from plan, all paths verified to exist)
```bash
cd backend && pytest tests/unit/test_skill_matcher.py tests/unit/test_skill_template.py tests/unit/test_failure_ledger.py tests/integration/test_skills_api.py -q
cd frontend && npm run test -- skill-runner skill-client support-auto-recovery
# phase gate:
cd backend && pytest tests/unit/test_skill*.py tests/unit/test_failure_ledger*.py tests/integration/test_skills*.py tests/integration/test_failures*.py -q
cd frontend && npm run test -- skill support-auto-recovery page-guide-context
python backend/scripts/sync_platform_skills.py --dry-run
```
Keep Phase 1 run-state tests green throughout (`backend/tests/unit/test_run_state_service.py`, `test_execution_router.py`, `frontend/src/lib/run-state-client.test.ts`, `autonomy-policy.test.ts`).

After merge: `graphify update .`
