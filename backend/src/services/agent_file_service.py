"""Agent file ingestion: store raw file + upsert extracted text into vector store."""

from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import select

from src.core.file_policy import validate_upload
from src.models.agent import Agent
from src.models.agent_file import AgentFile
from src.services.vector_store import VectorStore


class AgentFileService:
    def __init__(self, db):
        self.db = db
        self.vector = VectorStore(db)

    async def _require_agent(self, agent_id: UUID) -> Agent:
        agent = (
            await self.db.execute(select(Agent).where(Agent.id == agent_id))
        ).scalar_one_or_none()
        if not agent:
            raise ValueError("agent_not_found")
        return agent

    async def list_files(self, agent_id: UUID) -> list[AgentFile]:
        await self._require_agent(agent_id)
        result = await self.db.execute(
            select(AgentFile)
            .where(AgentFile.agent_id == agent_id)
            .order_by(AgentFile.created_at.desc())
        )
        return list(result.scalars().all())

    async def upload(self, agent_id: UUID, file: UploadFile) -> AgentFile:
        agent = await self._require_agent(agent_id)

        raw = await file.read()
        safe_name = (file.filename or "file").replace("/", "_").replace("\\", "_")
        mime = file.content_type or "application/octet-stream"

        await validate_upload(
            self.db,
            agent,
            filename=safe_name,
            mime_type=mime,
            size_bytes=len(raw),
        )

        base_dir = Path("var/agent_files") / str(agent_id)
        base_dir.mkdir(parents=True, exist_ok=True)

        digest = hashlib.sha256(raw).hexdigest()

        storage_name = f"{uuid4().hex}_{safe_name}"
        storage_path = base_dir / storage_name
        storage_path.write_bytes(raw)

        af = AgentFile(
            agent_id=agent_id,
            filename=safe_name,
            mime_type=file.content_type or "application/octet-stream",
            size_bytes=len(raw),
            storage_path=str(storage_path),
        )
        self.db.add(af)
        await self.db.flush()

        # Extract text for RAG (best-effort)
        text = self._extract_text(raw, af.mime_type, safe_name)
        if text and len(text.strip()) >= 10:
            try:
                await self.vector.upsert(
                    text,
                    agent_id=agent_id,
                    source=f"file:{safe_name}:{digest[:12]}",
                )
            except Exception:
                # Embeddings/API may be offline in dev — file storage still succeeds
                pass

        await self.db.refresh(af)
        return af

    def _extract_text(self, raw: bytes, mime: str, filename: str) -> str | None:
        lower = filename.lower()
        if mime.startswith("text/") or lower.endswith((".txt", ".md", ".csv", ".json")):
            try:
                return raw.decode("utf-8", errors="ignore")
            except Exception:
                return None

        if lower.endswith(".pdf") or mime == "application/pdf":
            try:
                import io

                from pypdf import PdfReader

                reader = PdfReader(io.BytesIO(raw))
                parts: list[str] = []
                for page in reader.pages:
                    parts.append(page.extract_text() or "")
                joined = "\n".join(parts).strip()
                return joined if joined else None
            except Exception:
                return None

        return None
