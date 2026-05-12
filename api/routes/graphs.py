"""Graph-related routes for the text2sql API."""

import logging
import re
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from api.core.schema_loader import list_databases
from api.core.text2sql import (
    DEFAULT_USER_ID,
    GENERAL_PREFIX,
    ChatRequest,
    ConfirmRequest,
    GraphNotFoundError,
    InternalError,
    InvalidArgumentError,
    delete_database,
    execute_destructive_operation,
    get_schema,
    query_database,
    refresh_database_schema,
    _graph_name,
)
from api.graph import get_user_rules, set_user_rules

graphs_router = APIRouter(tags=["Graphs & Databases"])
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def _resolve_memory_user_id(request: Request) -> str:
    """Resolve memory user id from header/cookie with safe fallback."""
    candidate = (
        request.headers.get("X-User-Id")
        or request.cookies.get("anon_id")
        or DEFAULT_USER_ID
    )
    value = str(candidate).strip()[:128]
    if not value:
        return DEFAULT_USER_ID
    if not USER_ID_PATTERN.match(value):
        return DEFAULT_USER_ID
    return value


class GraphData(BaseModel):
    """Graph data model."""

    database: str


@graphs_router.get(
    "",
    operation_id="list_databases",
    tags=["mcp_tool"],
)
async def list_graphs():
    """List all available graphs/databases."""
    graphs = await list_databases(DEFAULT_USER_ID, GENERAL_PREFIX)
    return JSONResponse(content=graphs)


@graphs_router.get(
    "/{graph_id}/data",
    operation_id="database_schema",
    tags=["mcp_tool"],
)
async def get_graph_data(graph_id: str):  # pylint: disable=too-many-locals,too-many-branches
    """Return all nodes and edges for the specified database schema.

    Args:
        graph_id (str): The ID of the graph to query (the database name).
    """

    try:
        schema = await get_schema(DEFAULT_USER_ID, graph_id)
        return JSONResponse(content=schema)
    except GraphNotFoundError as gnfe:
        logging.warning("Graph not found: %s", str(gnfe))
        return JSONResponse(content={"error": "Database not found"}, status_code=404)
    except InternalError as ie:
        logging.error("Internal error getting schema: %s", str(ie))
        return JSONResponse(
            content={"error": "Failed to retrieve database schema"},
            status_code=500
        )


@graphs_router.post("")
async def load_graph(
    data: GraphData = None, file: UploadFile = File(None)
):  # pylint: disable=unused-argument
    """
    This route is used to load the graph data into the database.
    It expects either:
    - A JSON payload (application/json)
    - A File upload (multipart/form-data)
    - An XML payload (application/xml or text/xml)
    """

    if data:  # pylint: disable=no-else-raise
        raise HTTPException(status_code=501, detail="JSONLoader is not implemented yet")
    elif file:
        filename = file.filename

        if filename.endswith(".json"):  # pylint: disable=no-else-raise
            raise HTTPException(
                status_code=501, detail="JSONLoader is not implemented yet"
            )

        elif filename.endswith(".xml"):
            raise HTTPException(
                status_code=501, detail="ODataLoader is not implemented yet"
            )

        elif filename.endswith(".csv"):
            raise HTTPException(
                status_code=501, detail="CSVLoader is not implemented yet"
            )
        else:
            raise HTTPException(status_code=415, detail="Unsupported file type")
    else:
        raise HTTPException(status_code=415, detail="Unsupported Content-Type")


@graphs_router.post(
    "/{graph_id}",
    operation_id="query_database",
    tags=["mcp_tool"],
)
async def query_graph(
    graph_id: str, chat_data: ChatRequest, request: Request
):  # pylint: disable=too-many-statements
    """
    Query the Database with the given graph_id and chat_data.

    Args:
        graph_id (str): The ID of the graph to query.
        chat_data (ChatRequest): The chat data containing user queries and context.
    """
    try:
        memory_user_id = _resolve_memory_user_id(request)
        generator = await query_database(
            DEFAULT_USER_ID,
            graph_id,
            chat_data,
            memory_user_id=memory_user_id,
        )
        return StreamingResponse(generator, media_type="application/json")
    except InvalidArgumentError as iae:
        logging.warning("Invalid argument in query: %s", str(iae))
        return JSONResponse(content={"error": "Invalid query request"}, status_code=400)


@graphs_router.post("/{graph_id}/confirm")
async def confirm_destructive_operation(
    graph_id: str,
    confirm_data: ConfirmRequest,
    request: Request,
):
    """Handle user confirmation for destructive SQL operations."""

    try:
        memory_user_id = _resolve_memory_user_id(request)
        generator = await execute_destructive_operation(
            DEFAULT_USER_ID,
            graph_id,
            confirm_data,
            memory_user_id=memory_user_id,
        )
        return StreamingResponse(generator, media_type="application/json")
    except InvalidArgumentError as iae:
        logging.warning("Invalid argument in destructive operation: %s", str(iae))
        return JSONResponse(content={"error": "Invalid confirmation request"}, status_code=400)


@graphs_router.post("/{graph_id}/refresh")
async def refresh_graph_schema(graph_id: str):
    """
    Manually refresh the graph schema from the database.
    Streams progress steps as a sequence of JSON messages.
    """
    try:
        generator = await refresh_database_schema(DEFAULT_USER_ID, graph_id)
        return StreamingResponse(generator, media_type="application/json")
    except (InternalError, InvalidArgumentError) as e:
        if isinstance(e, InternalError):
            logging.error("Internal error refreshing schema: %s", str(e))
            error_message = "Failed to refresh database schema"
            status_code = 500
        else:
            logging.warning("Invalid argument refreshing schema: %s", str(e))
            error_message = "Invalid request to refresh schema"
            status_code = 400
        return JSONResponse(content={"error": error_message}, status_code=status_code)


@graphs_router.delete("/{graph_id}")
async def delete_graph(graph_id: str):
    """Delete the specified graph."""

    try:
        result = await delete_database(DEFAULT_USER_ID, graph_id)
        return JSONResponse(content=result)

    except InvalidArgumentError as iae:
        logging.warning("Invalid argument in delete: %s", str(iae))
        return JSONResponse(content={"error": "Invalid delete request"}, status_code=400)
    except GraphNotFoundError as gnfe:
        logging.warning("Graph not found for deletion: %s", str(gnfe))
        return JSONResponse(content={"error": "Database not found"}, status_code=404)
    except InternalError as ie:
        logging.error("Internal error deleting database: %s", str(ie))
        return JSONResponse(
            content={"error": "Failed to delete database"},
            status_code=500
        )


class UserRulesRequest(BaseModel):
    """User rules request model."""
    user_rules: str


@graphs_router.get("/{graph_id}/user-rules")
async def get_graph_user_rules(graph_id: str):
    """Get user rules for the specified graph."""
    try:
        full_graph_id = _graph_name(DEFAULT_USER_ID, graph_id)
        user_rules = await get_user_rules(full_graph_id)
        logging.info("Retrieved user rules length: %d", len(user_rules) if user_rules else 0)
        return JSONResponse(content={"user_rules": user_rules})
    except GraphNotFoundError:
        return JSONResponse(content={"error": "Database not found"}, status_code=404)
    except Exception as e:  # pylint: disable=broad-exception-caught
        logging.error("Error getting user rules: %s", str(e))
        return JSONResponse(content={"error": "Failed to get user rules"}, status_code=500)


@graphs_router.put("/{graph_id}/user-rules")
async def update_graph_user_rules(graph_id: str, data: UserRulesRequest):
    """Update user rules for the specified graph."""
    try:
        if GENERAL_PREFIX and graph_id.startswith(GENERAL_PREFIX):
            return JSONResponse(
                content={"error": "Rules cannot be modified for demo databases"},
                status_code=403
            )

        logging.info(
            "Received request to update user rules, content length: %d", len(data.user_rules)
        )
        full_graph_id = _graph_name(DEFAULT_USER_ID, graph_id)
        await set_user_rules(full_graph_id, data.user_rules)
        logging.info("User rules updated successfully")
        return JSONResponse(content={"success": True, "user_rules": data.user_rules})
    except GraphNotFoundError:
        logging.error("Graph not found")
        return JSONResponse(content={"error": "Database not found"}, status_code=404)
    except Exception as e:  # pylint: disable=broad-exception-caught
        logging.error("Error updating user rules: %s", str(e))
        return JSONResponse(content={"error": "Failed to update user rules"}, status_code=500)
