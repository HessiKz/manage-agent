"""Upsert seed platform skills from backend/skills/platform/*.json into the DB.

Idempotent by slug: existing slugs are updated to match the JSON (preserving
stats, version history, and supersedes chain). New slugs are inserted as active
imported skills. Run from the backend dir with the venv python:

    ./venv/bin/python scripts/sync_platform_skills.py [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

# Allow running as `python scripts/sync_platform_skills.py`.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from src.database.session import async_session_maker  # noqa: E402
from src.models.platform_skill import (  # noqa: E402
    PlatformSkill,
    SkillScope,
    SkillSource,
    SkillStatus,
)
from src.schemas.platform_skill import SkillCreate  # noqa: E402

SKILLS_DIR = _BACKEND_ROOT / "skills" / "platform"

# Fields that come from the JSON seed and are safe to overwrite on upsert.
_SEED_FIELDS = (
    "name",
    "name_fa",
    "description",
    "scope",
    "source",
    "trigger",
    "procedure",
    "content_md",
    "status",
)
# Status for seeds is fixed to active + imported per the migration plan.
_SEED_STATUS = SkillStatus.ACTIVE
_SEED_SOURCE = SkillSource.IMPORTED


def _find_json_files() -> list[Path]:
    if not SKILLS_DIR.is_dir():
        return []
    return sorted(SKILLS_DIR.glob("*.json"))


def _load_seed(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not data.get("slug"):
        raise ValueError(f"{path.name}: missing required 'slug'")
    return data


def _validate_seed(data: dict) -> None:
    # Validate through the create schema (checks scope=agent -> agent_id, etc.).
    # We bypass slug auto-derivation by supplying the seed slug.
    SkillCreate.model_validate(
        {
            "slug": data["slug"],
            "name": data.get("name", data["slug"]),
            "name_fa": data.get("name_fa"),
            "description": data.get("description"),
            "scope": data.get("scope", "platform"),
            "org_id": data.get("org_id"),
            "agent_id": data.get("agent_id"),
            "source": data.get("source", "imported"),
            "trigger": data.get("trigger", {}),
            "procedure": data.get("procedure", {}),
            "content_md": data.get("content_md"),
        }
    )


async def sync(dry_run: bool = False) -> dict[str, int]:
    json_files = _find_json_files()
    if not json_files:
        print(f"No seed JSON found in {SKILLS_DIR}")
        return {"loaded": 0, "created": 0, "updated": 0, "skipped": 0}

    counters = {"loaded": 0, "created": 0, "updated": 0, "skipped": 0}

    async with async_session_maker() as db:
        existing = {
            s.slug: s
            for s in (await db.execute(select(PlatformSkill))).scalars().all()
        }

        for path in json_files:
            try:
                data = _load_seed(path)
                _validate_seed(data)
            except Exception as exc:  # noqa: BLE001
                print(f"SKIP {path.name}: {exc}")
                counters["skipped"] += 1
                continue

            counters["loaded"] += 1
            slug = data["slug"]
            action = "update" if slug in existing else "create"

            if dry_run:
                print(f"[{action}] {slug} ({path.name})")
                if action == "create":
                    counters["created"] += 1
                else:
                    counters["updated"] += 1
                continue

            if action == "create":
                skill = PlatformSkill(
                    slug=slug,
                    name=data.get("name", slug),
                    name_fa=data.get("name_fa"),
                    description=data.get("description"),
                    scope=SkillScope(data.get("scope", "platform")),
                    org_id=_as_uuid(data.get("org_id")),
                    agent_id=_as_uuid(data.get("agent_id")),
                    source=_SEED_SOURCE,
                    status=_SEED_STATUS,
                    version=int(data.get("version", 1) or 1),
                    trigger=dict(data.get("trigger", {}) or {}),
                    procedure=dict(data.get("procedure", {}) or {}),
                    content_md=data.get("content_md"),
                    stats={"success_count": 0, "failure_count": 0, "last_used_at": None},
                )
                db.add(skill)
                counters["created"] += 1
                print(f"[create] {slug}")
            else:
                skill = existing[slug]
                for field in _SEED_FIELDS:
                    if field == "status":
                        skill.status = _SEED_STATUS
                    elif field == "source":
                        skill.source = _SEED_SOURCE
                    elif field in ("scope",):
                        skill.scope = SkillScope(data.get("scope", "platform"))
                    else:
                        setattr(skill, field, data.get(field))
                counters["updated"] += 1
                print(f"[update] {slug}")

        if not dry_run:
            await db.commit()

    return counters


def _as_uuid(value) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync seed platform skills into DB")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing to the DB",
    )
    args = parser.parse_args()

    counters = asyncio.run(sync(dry_run=args.dry_run))
    print(
        "\nSummary: "
        f"loaded={counters['loaded']} "
        f"created={counters['created']} "
        f"updated={counters['updated']} "
        f"skipped={counters['skipped']}"
    )
    if args.dry_run:
        print("(dry-run: no changes written)")


if __name__ == "__main__":
    main()
"""Upsert seed platform skills from backend/skills/platform/*.json into the DB.

Idempotent by slug: existing slugs are updated to match the JSON (preserving
stats, version history, and supersedes chain). New slugs are inserted as active
imported skills. Run from the backend dir with the venv python:

    ./venv/bin/python scripts/sync_platform_skills.py [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

# Allow running as `python scripts/sync_platform_skills.py`.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from src.database.session import async_session_maker  # noqa: E402
from src.models.platform_skill import (  # noqa: E402
    PlatformSkill,
    SkillScope,
    SkillSource,
    SkillStatus,
)
from src.schemas.platform_skill import SkillCreate  # noqa: E402

SKILLS_DIR = _BACKEND_ROOT / "skills" / "platform"

# Fields that come from the JSON seed and are safe to overwrite on upsert.
_SEED_FIELDS = (
    "name",
    "name_fa",
    "description",
    "scope",
    "source",
    "trigger",
    "procedure",
    "content_md",
    "status",
)
# Status for seeds is fixed to active + imported per the migration plan.
_SEED_STATUS = SkillStatus.ACTIVE
_SEED_SOURCE = SkillSource.IMPORTED


def _find_json_files() -> list[Path]:
    if not SKILLS_DIR.is_dir():
        return []
    return sorted(SKILLS_DIR.glob("*.json"))


def _load_seed(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not data.get("slug"):
        raise ValueError(f"{path.name}: missing required 'slug'")
    return data


def _validate_seed(data: dict) -> None:
    # Validate through the create schema (checks scope=agent -> agent_id, etc.).
    # We bypass slug auto-derivation by supplying the seed slug.
    SkillCreate.model_validate(
        {
            "slug": data["slug"],
            "name": data.get("name", data["slug"]),
            "name_fa": data.get("name_fa"),
            "description": data.get("description"),
            "scope": data.get("scope", "platform"),
            "org_id": data.get("org_id"),
            "agent_id": data.get("agent_id"),
            "source": data.get("source", "imported"),
            "trigger": data.get("trigger", {}),
            "procedure": data.get("procedure", {}),
            "content_md": data.get("content_md"),
        }
    )


async def sync(dry_run: bool = False) -> dict[str, int]:
    json_files = _find_json_files()
    if not json_files:
        print(f"No seed JSON found in {SKILLS_DIR}")
        return {"loaded": 0, "created": 0, "updated": 0, "skipped": 0}

    counters = {"loaded": 0, "created": 0, "updated": 0, "skipped": 0}

    async with async_session_maker() as db:
        existing = {
            s.slug: s
            for s in (await db.execute(select(PlatformSkill))).scalars().all()
        }

        for path in json_files:
            try:
                data = _load_seed(path)
                _validate_seed(data)
            except Exception as exc:  # noqa: BLE001
                print(f"SKIP {path.name}: {exc}")
                counters["skipped"] += 1
                continue

            counters["loaded"] += 1
            slug = data["slug"]
            action = "update" if slug in existing else "create"

            if dry_run:
                print(f"[{action}] {slug} ({path.name})")
                if action == "create":
                    counters["created"] += 1
                else:
                    counters["updated"] += 1
                continue

            if action == "create":
                skill = PlatformSkill(
                    slug=slug,
                    name=data.get("name", slug),
                    name_fa=data.get("name_fa"),
                    description=data.get("description"),
                    scope=SkillScope(data.get("scope", "platform")),
                    org_id=_as_uuid(data.get("org_id")),
                    agent_id=_as_uuid(data.get("agent_id")),
                    source=_SEED_SOURCE,
                    status=_SEED_STATUS,
                    version=int(data.get("version", 1) or 1),
                    trigger=dict(data.get("trigger", {}) or {}),
                    procedure=dict(data.get("procedure", {}) or {}),
                    content_md=data.get("content_md"),
                    stats={"success_count": 0, "failure_count": 0, "last_used_at": None},
                )
                db.add(skill)
                counters["created"] += 1
                print(f"[create] {slug}")
            else:
                skill = existing[slug]
                for field in _SEED_FIELDS:
                    if field == "status":
                        skill.status = _SEED_STATUS
                    elif field == "source":
                        skill.source = _SEED_SOURCE
                    elif field in ("scope",):
                        skill.scope = SkillScope(data.get("scope", "platform"))
                    else:
                        setattr(skill, field, data.get(field))
                counters["updated"] += 1
                print(f"[update] {slug}")

        if not dry_run:
            await db.commit()

    return counters


def _as_uuid(value) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync seed platform skills into DB")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing to the DB",
    )
    args = parser.parse_args()

    counters = asyncio.run(sync(dry_run=args.dry_run))
    print(
        "\nSummary: "
        f"loaded={counters['loaded']} "
        f"created={counters['created']} "
        f"updated={counters['updated']} "
        f"skipped={counters['skipped']}"
    )
    if args.dry_run:
        print("(dry-run: no changes written)")


if __name__ == "__main__":
    main()
