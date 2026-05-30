"""Agent file upload + listing."""

from uuid import UUID

from fastapi import APIRouter, File, UploadFile

from src.api.dependencies import DB, CurrentUser
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
