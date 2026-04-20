"""Database connection routes for the text2sql API."""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.core.schema_loader import load_database
from api.core.text2sql import DEFAULT_USER_ID

database_router = APIRouter(tags=["Database Connection"])

# Use the same delimiter as in the JavaScript frontend for streaming chunks
MESSAGE_DELIMITER = "|||FALKORDB_MESSAGE_BOUNDARY|||"


class DatabaseConnectionRequest(BaseModel):
    """Database connection request model."""

    url: str


@database_router.post("/database", operation_id="connect_database", tags=["mcp_tool"])
async def connect_database(db_request: DatabaseConnectionRequest):
    """
    Accepts a JSON payload with a database URL and attempts to connect.
    Supports both PostgreSQL and MySQL databases.
    Streams progress steps as a sequence of JSON messages separated by MESSAGE_DELIMITER.
    """
    generator = await load_database(db_request.url, DEFAULT_USER_ID)
    return StreamingResponse(generator, media_type="application/json")
