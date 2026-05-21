"""HTTP tests for /history routes."""

import pytest
from fastapi.testclient import TestClient

from api.app_factory import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("QUERYWEAVER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("QUERYWEAVER_HISTORY_BACKEND", "file")
    monkeypatch.setenv("DISABLE_MCP", "true")
    return TestClient(create_app())


def test_history_post_then_get(client):
    uid = "e2e-history-user"
    body = {
        "graph_id": "neondb",
        "intent": "Show top customers",
        "status": "verified",
        "timing_ms": 1200,
        "tags": ["neondb"],
    }
    r = client.post("/history", json=body, headers={"X-User-Id": uid})
    assert r.status_code == 201
    row = r.json()
    assert row["intent"] == "Show top customers"
    assert "id" in row

    g = client.get("/history", headers={"X-User-Id": uid})
    assert g.status_code == 200
    data = g.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["graph_id"] == "neondb"


def test_history_search_q(client):
    uid = "user-search"
    client.post("/history", json={"graph_id": "a", "intent": "alpha wolf", "status": "verified"}, headers={"X-User-Id": uid})
    client.post("/history", json={"graph_id": "b", "intent": "beta", "status": "verified"}, headers={"X-User-Id": uid})
    r = client.get("/history", params={"q": "wolf"}, headers={"X-User-Id": uid})
    assert r.status_code == 200
    assert r.json()["total"] == 1
