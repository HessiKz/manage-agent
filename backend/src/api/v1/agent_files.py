"""Agent file upload + listing."""

import mimetypes
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from src.api.dependencies import DB, CurrentUser
from src.core.agent_workspace_files import (
    find_file_by_basename,
    resolve_storage_path_file,
    resolve_workspace_download_path,
)
from src.schemas.agent_file import AgentFileRead
from src.services.agent_file_service import AgentFileService

router = APIRouter()


@router.get("/agents/{agent_id}/files", response_model=list[AgentFileRead])
async def list_agent_files(agent_id: UUID, db: DB, _user: CurrentUser):
    return await AgentFileService(db).list_files(agent_id)


@router.post("/agents/{agent_id}/files", response_model=AgentFileRead)
async def upload_agent_file(
    agent_id: UUID, db: DB, _user: CurrentUser, file: UploadFile = File(...)
):
    af = await AgentFileService(db).upload(agent_id, file)
    await db.commit()
    return af


@router.delete("/agents/{agent_id}/files/{file_id}", status_code=204)
async def delete_agent_file(
    agent_id: UUID,
    file_id: UUID,
    db: DB,
    _user: CurrentUser,
):
    try:
        await AgentFileService(db).delete_file(agent_id, file_id)
    except ValueError as exc:
        if str(exc) == "file_not_found":
            raise HTTPException(status_code=404, detail="File not found") from exc
        raise
    await db.commit()


@router.get("/agents/{agent_id}/files/{file_id}/download")
async def download_agent_file_by_id(
    agent_id: UUID,
    file_id: UUID,
    db: DB,
    _user: CurrentUser,
):
    from sqlalchemy import select

    from src.models.agent_file import AgentFile

    row = (
        await db.execute(
            select(AgentFile).where(AgentFile.id == file_id, AgentFile.agent_id == agent_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    path = resolve_storage_path_file(agent_id, row.storage_path)
    if not path:
        path = find_file_by_basename(agent_id, row.filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found on disk")
    media_type, _ = mimetypes.guess_type(path.name)
    return FileResponse(
        path,
        media_type=media_type or row.mime_type or "application/octet-stream",
        filename=row.filename,
    )


@router.get("/agents/{agent_id}/workspace/{file_path:path}")
async def download_agent_workspace_file(
    agent_id: UUID,
    file_path: str,
    db: DB,
    _user: CurrentUser,
):
    """Download any file under var/agent_files/{agent_id}/ (uploads + tool output)."""
    from src.core.workspace_output_registry import reconcile_workspace_manifest

    await AgentFileService(db)._require_agent(agent_id)
    path = resolve_workspace_download_path(agent_id, file_path)
    if not path:
        reconcile_workspace_manifest(Path("var/agent_files"), agent_id)
        path = resolve_workspace_download_path(agent_id, file_path)
    if not path:
        raise HTTPException(
            status_code=404,
            detail=(
                "File not found on disk. If you recently deployed, re-upload the file "
                "from «دریافت فایل» and run the agent again."
            ),
        )
    media_type, _ = mimetypes.guess_type(path.name)
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        filename=path.name,
    )
