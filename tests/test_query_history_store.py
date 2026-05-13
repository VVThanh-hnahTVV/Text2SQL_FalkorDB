"""Tests for file-backed query history store."""

import pytest

from api.core.query_history_store import append_entry, list_entries


@pytest.fixture(autouse=True)
def isolated_history_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("QUERYWEAVER_DATA_DIR", str(tmp_path))


def test_append_then_list_newest_first():
    uid = "session-test-1"
    append_entry(
        uid,
        {
            "graph_id": "db_a",
            "intent": "first query",
            "status": "verified",
            "timing_ms": 100,
            "tags": ["db_a"],
        },
    )
    append_entry(
        uid,
        {
            "graph_id": "db_b",
            "intent": "second query",
            "status": "error",
            "timing_ms": 50,
            "tags": ["db_b"],
            "error_kind": "Syntax Error",
        },
    )
    items, total = list_entries(uid, limit=10, offset=0)
    assert total == 2
    assert items[0]["intent"] == "second query"
    assert items[1]["intent"] == "first query"


def test_filter_graph_and_search():
    uid = "session-test-2"
    append_entry(uid, {"graph_id": "g1", "intent": "alpha sales", "status": "verified", "tags": ["g1"]})
    append_entry(uid, {"graph_id": "g2", "intent": "beta", "status": "verified", "tags": ["g2"]})
    items, total = list_entries(uid, graph_id="g1")
    assert total == 1
    assert items[0]["graph_id"] == "g1"
    items2, total2 = list_entries(uid, q="sales")
    assert total2 == 1
    assert "sales" in items2[0]["intent"]
