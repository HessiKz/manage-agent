"""Knowledge dataset schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeDatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=100)
    description: str | None = None
    department: str | None = None
    source_type: str = Field(default="text", pattern="^(text|file|api)$")
    example_input: str | None = None
    example_output: str | None = None


class KnowledgeDatasetUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    department: str | None = None
    source_type: str | None = Field(None, pattern="^(text|file|api)$")
    example_input: str | None = None
    example_output: str | None = None


class KnowledgeDatasetRead(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    department: str | None
    source_type: str = "text"
    example_input: str | None = None
    example_output: str | None = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeDatasetIngestRequest(BaseModel):
    content: str = Field(..., min_length=10)
    source: str = "manual"
