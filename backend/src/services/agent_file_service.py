"""Agent file ingestion: store raw file + upsert extracted text into vector store."""

from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import delete, select

from src.core.agent_file_roles import (
    agent_file_role,
    display_agent_filename,
    is_instruction_file,
    is_output_sample_file,
)
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

    async def reindex_files(self, agent_id: UUID) -> int:
        files = await self.list_files(agent_id)
        indexed = 0
        for af in files:
            if is_output_sample_file(af.filename) or is_instruction_file(af.filename):
                continue
            path = Path(af.storage_path)
            if not path.exists():
                continue
            raw = path.read_bytes()
            text = self._extract_text(raw, af.mime_type, af.filename)
            if not text or len(text.strip()) < 10:
                continue
            digest = hashlib.sha256(raw).hexdigest()
            chunks = await self.vector.upsert_document(
                text,
                agent_id=agent_id,
                source=f"file:{af.filename}:{digest[:12]}",
                meta={
                    "filename": af.filename,
                    "display_filename": display_agent_filename(af.filename),
                    "content_hash": digest,
                    "role": agent_file_role(af.filename),
                },
            )
            indexed += len(chunks)
        return indexed

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

        # Instruction files compile into system_prompt — not runtime RAG/input.
        if is_output_sample_file(safe_name) or is_instruction_file(safe_name):
            await self.db.refresh(af)
            return af

        text = self._extract_text(raw, af.mime_type, safe_name)
        if text and len(text.strip()) >= 10:
            try:
                role = agent_file_role(safe_name)
                await self.vector.upsert_document(
                    text,
                    agent_id=agent_id,
                    source=f"file:{safe_name}:{digest[:12]}",
                    meta={
                        "filename": safe_name,
                        "display_filename": display_agent_filename(safe_name),
                        "content_hash": digest,
                        "role": role,
                    },
                )
            except Exception:
                # Embeddings/API may be offline in dev — file storage still succeeds
                pass

        await self.db.refresh(af)
        return af

    async def delete_file(self, agent_id: UUID, file_id: UUID) -> None:
        await self._require_agent(agent_id)
        row = (
            await self.db.execute(
                select(AgentFile).where(AgentFile.id == file_id, AgentFile.agent_id == agent_id)
            )
        ).scalar_one_or_none()
        if not row:
            raise ValueError("file_not_found")

        path = Path(row.storage_path)
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass

        from src.models.document_chunk import DocumentChunk

        await self.db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.agent_id == agent_id,
                DocumentChunk.source.like(f"file:{row.filename}:%"),
            )
        )
        await self.db.delete(row)
        await self.db.flush()

    def _extract_text(self, raw: bytes, mime: str, filename: str) -> str | None:
        from src.core.file_text_extract import extract_text

        return extract_text(raw, mime, filename)
