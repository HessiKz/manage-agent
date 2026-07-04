"""Ensure catalog کارکرد agents have processable demo output on disk."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.agent_workspace_files import ensure_karkard_processed_for_upload
from src.models.agent import Agent
from src.models.agent_file import AgentFile


def _karkard_fixture_paths() -> list[Path]:
    backend_root = Path(__file__).resolve().parents[2]
    repo_root = backend_root.parent
    return [
        repo_root / "formdocs" / "کارکرد_توسعه_کارآفرینی_1405.2.xlsx",
        repo_root / "frontend" / "public" / "samples" / "karkard-raw.xlsx",
        backend_root / "tests" / "fixtures" / "karkard_sample.xlsx",
    ]


def resolve_karkard_fixture() -> Path | None:
    for path in _karkard_fixture_paths():
        if path.is_file():
            return path
    return None


async def ensure_catalog_karkard_outputs(db: AsyncSession) -> int:
    """Pre-process demo کارکرد file for example-karkard when raw exists but output missing."""
    agent = (
        await db.execute(select(Agent).where(Agent.slug == "example-karkard").limit(1))
    ).scalar_one_or_none()
    if not agent:
        return 0

    rows = (
        await db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent.id)
            .order_by(AgentFile.created_at.desc())
        )
    ).scalars().all()

    raw_path: Path | None = None
    for row in rows:
        candidate = Path(row.storage_path)
        if candidate.is_file() and candidate.suffix.lower() in {".xlsx", ".xls"}:
            raw_path = candidate
            break

    if not raw_path:
        fixture = resolve_karkard_fixture()
        if not fixture:
            return 0
        dest_dir = Path("var/agent_files") / str(agent.id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / "demo-karkard-raw.xlsx"
        if not dest.is_file():
            dest.write_bytes(fixture.read_bytes())
        raw_path = dest

    processed = ensure_karkard_processed_for_upload(agent.id, raw_path)
    return 1 if processed else 0
