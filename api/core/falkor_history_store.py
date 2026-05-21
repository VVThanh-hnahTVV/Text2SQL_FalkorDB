"""Query history stored in the user's FalkorDB memory graph (qwmem*)."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from api.extensions import db
from api.memory.graphiti_tool import falkor_memory_graph_name

logger = logging.getLogger(__name__)

_MAX_ENTRIES_PER_USER = int(os.environ.get("QUERYWEAVER_HISTORY_MAX", "2000"))


def _graph_name(memory_user_id: str) -> str:
    return falkor_memory_graph_name(memory_user_id)


async def _query(
    memory_user_id: str,
    cypher: str,
    params: dict[str, Any] | None = None,
) -> list[Any]:
    graph = db.select_graph(_graph_name(memory_user_id))
    result = await graph.query(cypher, params or {})
    return list(result.result_set) if result.result_set else []


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t) for t in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(t) for t in parsed]
        except json.JSONDecodeError:
            return []
    return []


def _row_from_props(props: dict[str, Any]) -> dict[str, Any]:
    timing = props.get("timing_ms")
    return {
        "id": str(props.get("id", "")),
        "graph_id": str(props.get("graph_id", "")),
        "intent": str(props.get("intent", "")),
        "status": str(props.get("status", "verified")),
        "timing_ms": int(timing) if timing is not None else None,
        "executed_at": str(props.get("executed_at", "")),
        "tags": _parse_tags(props.get("tags")),
        "error_kind": props.get("error_kind") or None,
        "sql_query": props.get("sql_query") or None,
    }


async def _ensure_archive_root(memory_user_id: str) -> None:
    await _query(
        memory_user_id,
        """
        MERGE (root:HistoryArchive {user_id: $user_id})
        ON CREATE SET root.created_at = $now
        """,
        {"user_id": memory_user_id, "now": _iso_now()},
    )


async def _trim_old_entries(memory_user_id: str) -> None:
    if _MAX_ENTRIES_PER_USER <= 0:
        return
    rows = await _query(
        memory_user_id,
        """
        MATCH (root:HistoryArchive {user_id: $user_id})-[:ENTRY]->(h:HistoryEntry)
        RETURN h.id AS id
        ORDER BY h.executed_at ASC
        """,
        {"user_id": memory_user_id},
    )
    excess = len(rows) - _MAX_ENTRIES_PER_USER
    if excess <= 0:
        return
    for row in rows[:excess]:
        await _query(
            memory_user_id,
            "MATCH (h:HistoryEntry {id: $id}) DETACH DELETE h",
            {"id": row[0]},
        )


async def append_entry(memory_user_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    """Append one history row in FalkorDB. Returns stored row including id."""
    await _ensure_archive_root(memory_user_id)
    row = {
        **entry,
        "id": str(entry.get("id") or uuid.uuid4()),
        "executed_at": entry.get("executed_at") or _iso_now(),
    }
    tags_json = json.dumps(row.get("tags") or [], ensure_ascii=False)
    params = {
        "user_id": memory_user_id,
        "id": row["id"],
        "graph_id": str(row.get("graph_id", "")),
        "intent": str(row.get("intent", "")),
        "status": str(row.get("status", "verified")),
        "timing_ms": row.get("timing_ms"),
        "tags": tags_json,
        "error_kind": row.get("error_kind") or "",
        "executed_at": row["executed_at"],
        "sql_query": str(row.get("sql_query") or ""),
    }
    await _query(
        memory_user_id,
        """
        MATCH (root:HistoryArchive {user_id: $user_id})
        CREATE (h:HistoryEntry {
            id: $id,
            graph_id: $graph_id,
            intent: $intent,
            status: $status,
            timing_ms: $timing_ms,
            tags: $tags,
            error_kind: $error_kind,
            executed_at: $executed_at,
            sql_query: $sql_query
        })
        CREATE (root)-[:ENTRY]->(h)
        RETURN h.id AS id
        """,
        params,
    )
    await _trim_old_entries(memory_user_id)
    return {
        "id": row["id"],
        "graph_id": params["graph_id"],
        "intent": params["intent"],
        "status": params["status"],
        "timing_ms": params["timing_ms"],
        "executed_at": params["executed_at"],
        "tags": row.get("tags") or [],
        "error_kind": params["error_kind"] or None,
    }


async def _fetch_all_entries(memory_user_id: str) -> list[dict[str, Any]]:
    rows = await _query(
        memory_user_id,
        """
        MATCH (root:HistoryArchive {user_id: $user_id})-[:ENTRY]->(h:HistoryEntry)
        RETURN h.id AS id,
               h.graph_id AS graph_id,
               h.intent AS intent,
               h.status AS status,
               h.timing_ms AS timing_ms,
               h.executed_at AS executed_at,
               h.tags AS tags,
               h.error_kind AS error_kind,
               h.sql_query AS sql_query
        ORDER BY h.executed_at DESC
        """,
        {"user_id": memory_user_id},
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        if not row:
            continue
        props = {
            "id": row[0],
            "graph_id": row[1],
            "intent": row[2],
            "status": row[3],
            "timing_ms": row[4],
            "executed_at": row[5],
            "tags": row[6],
            "error_kind": row[7],
            "sql_query": row[8] if len(row) > 8 else None,
        }
        out.append(_row_from_props(props))
    return out


async def list_entries(
    memory_user_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    graph_id: str | None = None,
    q: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Return newest-first slice and total after filters."""
    entries = await _fetch_all_entries(memory_user_id)

    if graph_id:
        entries = [e for e in entries if e.get("graph_id") == graph_id]

    if q:
        needle = q.strip().lower()
        if needle:

            def _match(entry: dict[str, Any]) -> bool:
                intent = str(entry.get("intent", "")).lower()
                if needle in intent:
                    return True
                for t in entry.get("tags") or []:
                    if needle in str(t).lower():
                        return True
                return False

            entries = [e for e in entries if _match(e)]

    total = len(entries)
    page = entries[offset : offset + limit]
    return page, total


async def get_entry_by_id(memory_user_id: str, entry_id: str) -> dict[str, Any] | None:
    """Return a single history row by id, or None if not found."""
    if not entry_id or not str(entry_id).strip():
        return None
    eid = str(entry_id).strip()
    rows = await _query(
        memory_user_id,
        """
        MATCH (root:HistoryArchive {user_id: $user_id})-[:ENTRY]->(h:HistoryEntry {id: $id})
        RETURN h.id AS id,
               h.graph_id AS graph_id,
               h.intent AS intent,
               h.status AS status,
               h.timing_ms AS timing_ms,
               h.executed_at AS executed_at,
               h.tags AS tags,
               h.error_kind AS error_kind,
               h.sql_query AS sql_query
        LIMIT 1
        """,
        {"user_id": memory_user_id, "id": eid},
    )
    if not rows:
        return None
    row = rows[0]
    return _row_from_props(
        {
            "id": row[0],
            "graph_id": row[1],
            "intent": row[2],
            "status": row[3],
            "timing_ms": row[4],
            "executed_at": row[5],
            "tags": row[6],
            "error_kind": row[7],
            "sql_query": row[8] if len(row) > 8 else None,
        }
    )


async def update_entry_sql(
    memory_user_id: str,
    *,
    graph_id: str,
    intent: str,
    sql_query: str,
) -> None:
    """Attach SQL to the newest matching verified history row (if any)."""
    if not sql_query.strip() or not intent.strip():
        return
    await _query(
        memory_user_id,
        """
        MATCH (root:HistoryArchive {user_id: $user_id})-[:ENTRY]->(h:HistoryEntry)
        WHERE h.graph_id = $graph_id
          AND h.intent = $intent
          AND h.status = 'verified'
        WITH h
        ORDER BY h.executed_at DESC
        LIMIT 1
        SET h.sql_query = $sql_query
        """,
        {
            "user_id": memory_user_id,
            "graph_id": graph_id,
            "intent": intent,
            "sql_query": sql_query.strip(),
        },
    )
