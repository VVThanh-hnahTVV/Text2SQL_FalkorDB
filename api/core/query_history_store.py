"""Query history store — FalkorDB (default) or local JSON files (tests / fallback)."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

_MAX_ENTRIES_PER_USER = int(os.environ.get("QUERYWEAVER_HISTORY_MAX", "2000"))
_GLOBAL_LOCK = Lock()
_USER_LOCKS: dict[str, Lock] = {}


def _use_falkor() -> bool:
    backend = os.environ.get("QUERYWEAVER_HISTORY_BACKEND", "falkor").strip().lower()
    return backend not in ("file", "local", "json")


def _project_data_root() -> Path:
    env = os.environ.get("QUERYWEAVER_DATA_DIR", "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent.parent / "data").resolve()


def _history_dir() -> Path:
    d = _project_data_root() / "query_history"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _user_file(memory_user_id: str) -> Path:
    import hashlib

    digest = hashlib.sha256(memory_user_id.encode("utf-8")).hexdigest()
    return _history_dir() / f"{digest}.json"


def _user_lock(file_key: str) -> Lock:
    with _GLOBAL_LOCK:
        if file_key not in _USER_LOCKS:
            _USER_LOCKS[file_key] = Lock()
        return _USER_LOCKS[file_key]


def _load_unlocked(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read query history %s: %s", path, exc)
        return []


def _save_unlocked(path: Path, entries: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")


async def list_entries(
    memory_user_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    graph_id: str | None = None,
    q: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Return newest-first slice and total after filters."""
    if _use_falkor():
        from api.core import falkor_history_store

        return await falkor_history_store.list_entries(
            memory_user_id,
            limit=limit,
            offset=offset,
            graph_id=graph_id,
            q=q,
        )

    path = _user_file(memory_user_id)
    lk = _user_lock(str(path))
    with lk:
        entries = _load_unlocked(path)

    rev = list(reversed(entries))

    if graph_id:
        rev = [e for e in rev if e.get("graph_id") == graph_id]

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

            rev = [e for e in rev if _match(e)]

    total = len(rev)
    page = rev[offset : offset + limit]
    return page, total


async def get_entry_by_id(memory_user_id: str, entry_id: str) -> dict[str, Any] | None:
    """Return a single history row by id, or None if not found."""
    if _use_falkor():
        from api.core import falkor_history_store

        return await falkor_history_store.get_entry_by_id(memory_user_id, entry_id)

    if not entry_id or not str(entry_id).strip():
        return None
    path = _user_file(memory_user_id)
    lk = _user_lock(str(path))
    with lk:
        entries = _load_unlocked(path)
    for row in reversed(entries):
        if str(row.get("id")) == str(entry_id).strip():
            return dict(row)
    return None


async def append_entry(memory_user_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    """Append one history row. Returns stored row including id."""
    if _use_falkor():
        from api.core import falkor_history_store

        return await falkor_history_store.append_entry(memory_user_id, entry)

    path = _user_file(memory_user_id)
    lk = _user_lock(str(path))
    row = {
        **entry,
        "id": str(entry.get("id") or uuid.uuid4()),
        "executed_at": entry.get("executed_at")
        or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    with lk:
        entries = _load_unlocked(path)
        entries.append(row)
        if len(entries) > _MAX_ENTRIES_PER_USER:
            entries = entries[-_MAX_ENTRIES_PER_USER:]
        _save_unlocked(path, entries)
    return row


async def update_entry_sql(
    memory_user_id: str,
    *,
    graph_id: str,
    intent: str,
    sql_query: str,
) -> None:
    """Attach SQL to the newest matching history row (FalkorDB only)."""
    if not _use_falkor():
        return
    from api.core import falkor_history_store

    await falkor_history_store.update_entry_sql(
        memory_user_id,
        graph_id=graph_id,
        intent=intent,
        sql_query=sql_query,
    )
