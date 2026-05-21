"""Re-run a saved query from FalkorDB memory without invoking the LLM pipeline."""

from __future__ import annotations

import logging
from typing import Any

from api.core.errors import GraphNotFoundError, InvalidArgumentError
from api.core.text2sql import (
    DEFAULT_USER_ID,
    _graph_name,
    _should_visualize,
    get_database_type_and_loader,
)
from api.graph import get_db_description
from api.memory.graphiti_tool import MemoryTool

logger = logging.getLogger(__name__)


async def replay_history_query(
    memory_user_id: str,
    *,
    graph_id: str,
    intent: str,
    sql_query: str | None = None,
) -> dict[str, Any]:
    """
    Resolve SQL from FalkorDB query memory, execute against the source DB, return rows.
    """
    intent = (intent or "").strip()
    if not intent:
        raise InvalidArgumentError("Missing query intent")

    short_graph_id = (graph_id or "").strip()
    if not short_graph_id:
        raise InvalidArgumentError("Missing graph_id")

    full_graph_id = _graph_name(DEFAULT_USER_ID, short_graph_id)

    resolved_sql = (sql_query or "").strip()
    if not resolved_sql:
        memory_tool = MemoryTool(memory_user_id, full_graph_id)
        resolved_sql = await memory_tool.find_sql_for_user_query(intent, success_only=True) or ""

    if not resolved_sql:
        raise GraphNotFoundError(
            "No saved SQL found for this query. "
            "Run it again from Workspace with memory enabled."
        )

    db_description, db_url = await get_db_description(full_graph_id)
    if not db_url or db_url == "No URL available for this database.":
        raise GraphNotFoundError("Database connection URL not found for this graph")

    _, loader_class = get_database_type_and_loader(db_url)
    if not loader_class:
        raise InvalidArgumentError("Unable to determine database type")

    query_results = loader_class.execute_sql_query(resolved_sql, db_url)

    return {
        "graph_id": short_graph_id,
        "intent": intent,
        "sql_query": resolved_sql,
        "data": query_results,
        "should_visualize": _should_visualize(query_results),
        "db_description": db_description,
    }
