"""File-backed query history keyed by session / anonymous user id (X-User-Id)."""

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


def list_entries(
    memory_user_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    graph_id: str | None = None,
    q: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Return newest-first slice and total after filters."""
    path = _user_file(memory_user_id)
    lk = _user_lock(str(path))
    with lk:
        entries = _load_unlocked(path)

    # stored oldest-first; present newest-first
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


def append_entry(memory_user_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    """Append one history row (newest at end of file). Returns stored row including id."""
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
