"""
Optional text appended to extracted table/column descriptions before graph load.

Applied on every schema load and refresh so Text-to-SQL sees glossary terms
without requiring COMMENT ON in the source database.
Edit the dicts below to add more tables/columns.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

# table_name -> (suffix, substring_that_means_already_applied)
_TABLE_DESCRIPTION_APPENDS: Dict[str, Tuple[str, str]] = {
    "apps": (
        "Catalog of apps (display names, slugs). Used for reporting and filters.",
        "Catalog of apps (display names, slugs)",
    ),
}

# (table_name, column_name) -> (suffix, substring_that_means_already_applied)
_COLUMN_DESCRIPTION_APPENDS: Dict[Tuple[str, str], Tuple[str, str]] = {
    (
        "apps",
        "name",
    ): (
        'Glossary: internal/marketing name "Smart menu" refers to '
        "Qikify Mega Menu & Navigation; match by name or slug tmenu.",
        'Glossary: internal/marketing name "Smart menu"',
    ),
}


def _dedupe_append(base: str, fragment: str, already_there: str) -> str:
    if already_there in base:
        return base
    base = base.rstrip()
    fragment = fragment.strip()
    if not fragment:
        return base
    if not base:
        return fragment
    return f"{base} {fragment}"


def enrich_entities(entities: Dict[str, Any]) -> None:
    """
    Mutate entities in place: append configured description fragments and
    refresh col_descriptions lists for affected tables.
    """
    touched_tables: set[str] = set()

    for table_name, (fragment, dedupe) in _TABLE_DESCRIPTION_APPENDS.items():
        entity = entities.get(table_name)
        if not entity:
            continue
        desc = entity.get("description") or ""
        entity["description"] = _dedupe_append(desc, fragment, dedupe)
        touched_tables.add(table_name)

    for (table_name, column_name), (fragment, dedupe) in _COLUMN_DESCRIPTION_APPENDS.items():
        entity = entities.get(table_name)
        if not entity:
            continue
        columns = entity.get("columns") or {}
        col = columns.get(column_name)
        if not col:
            continue
        col["description"] = _dedupe_append(col.get("description") or "", fragment, dedupe)
        touched_tables.add(table_name)

    for table_name in touched_tables:
        entity = entities.get(table_name)
        if not entity or "columns" not in entity:
            continue
        cols = entity["columns"]
        entity["col_descriptions"] = [cols[c]["description"] for c in cols]
