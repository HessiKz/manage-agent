"""Re-compile system prompts for agents with instruction__ attachments."""

from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy import select

from src.core.agent_file_roles import INSTRUCTION_FILE_PREFIX, is_instruction_file
from src.database.session import async_session_maker
from src.models.agent import Agent
from src.models.agent_file import AgentFile
from src.services.agent_instruction_service import AgentInstructionService


async def _import_catalog_instruction_doc(db, agent: Agent, rel_path: str) -> bool:
    path = Path(rel_path)
    if not path.is_file():
        return False
    existing = (
        await db.execute(select(AgentFile).where(AgentFile.agent_id == agent.id))
    ).scalars().all()
    target_name = f"{INSTRUCTION_FILE_PREFIX}{path.name}"
    if any((row.filename or "") == target_name for row in existing):
        return False

    base_dir = Path("var/agent_files") / str(agent.id)
    base_dir.mkdir(parents=True, exist_ok=True)
    storage_path = base_dir / f"catalog_{path.name}"
    storage_path.write_bytes(path.read_bytes())

    row = AgentFile(
        agent_id=agent.id,
        filename=target_name,
        mime_type="application/octet-stream",
        size_bytes=storage_path.stat().st_size,
        storage_path=str(storage_path),
    )
    db.add(row)
    await db.flush()
    return True


async def refresh_all(*, import_catalog_docs: bool = True) -> int:
    refreshed = 0
    async with async_session_maker() as db:
        agents = list((await db.execute(select(Agent))).scalars().all())
        for agent in agents:
            files = list(
                (await db.execute(select(AgentFile).where(AgentFile.agent_id == agent.id)))
                .scalars()
                .all()
            )
            if import_catalog_docs:
                cfg = agent.config_json or {}
                rel = cfg.get("instruction_doc")
                if isinstance(rel, str) and rel.strip():
                    await _import_catalog_instruction_doc(db, agent, rel.strip())
                    files = list(
                        (
                            await db.execute(
                                select(AgentFile).where(AgentFile.agent_id == agent.id)
                            )
                        )
                        .scalars()
                        .all()
                    )

            if not any(is_instruction_file(row.filename) for row in files):
                continue

            await AgentInstructionService(db).refresh_from_instructions(
                agent.id,
                instruction_text=agent.system_prompt or "",
                force=True,
            )
            refreshed += 1
            print(f"refreshed {agent.slug}")
        await db.commit()
    return refreshed


def main() -> None:
    n = asyncio.run(refresh_all())
    print(f"refresh_instruction_prompts: {n} agent(s)")


if __name__ == "__main__":
    main()
