"""Query history API (per X-User-Id / cookie anon_id)."""

import logging
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api.core.query_history_store import append_entry, list_entries
from api.routes.graphs import _resolve_memory_user_id

logger = logging.getLogger(__name__)

history_router = APIRouter(prefix="/history", tags=["History"])

_INTENT_MAX = 8000


class HistoryEntryCreate(BaseModel):
    """Client-recorded outcome of a natural-language query."""

    graph_id: str = Field(..., min_length=1, max_length=256)
    intent: str = Field(..., min_length=1, max_length=_INTENT_MAX)
    status: Literal["verified", "error"] = "verified"
    timing_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    tags: list[str] = Field(default_factory=list, max_length=32)
    error_kind: str | None = Field(default=None, max_length=128)


@history_router.get("")
async def get_history(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=100_000),
    graph_id: str | None = Query(None, max_length=256),
    q: str | None = Query(None, max_length=256),
):
    """List query history for the current session user (newest first)."""
    memory_user_id = _resolve_memory_user_id(request)
    items, total = list_entries(
        memory_user_id,
        limit=limit,
        offset=offset,
        graph_id=graph_id,
        q=q,
    )
    return JSONResponse(content={"items": items, "total": total})


_TAG_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def _sanitize_tags(tags: list[str]) -> list[str]:
    out: list[str] = []
    for t in tags[:32]:
        s = str(t).strip()[:64]
        if s and _TAG_PATTERN.match(s):
            out.append(s)
    return out


@history_router.post("")
async def post_history(request: Request, body: HistoryEntryCreate):
    """Append a history row (typically called by the SPA after a query finishes)."""
    memory_user_id = _resolve_memory_user_id(request)
    try:
        row = append_entry(
            memory_user_id,
            {
                "graph_id": body.graph_id.strip(),
                "intent": body.intent.strip()[:_INTENT_MAX],
                "status": body.status,
                "timing_ms": body.timing_ms,
                "tags": _sanitize_tags(body.tags),
                "error_kind": (body.error_kind.strip()[:128] if body.error_kind else None),
            },
        )
        return JSONResponse(content=row, status_code=201)
    except OSError as exc:
        logger.error("Failed to persist history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save history") from exc
