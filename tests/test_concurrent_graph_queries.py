"""
Gửi N request POST /graphs/{graph_id} song song (kiểm tra concurrency).

**Không** khởi động server: bạn tự chạy API trước, test chỉ bắn HTTP vào đó.

- Base URL: `CONCURRENT_TEST_APP_URL`, hoặc `APP_URL`, mặc định `http://localhost:5000`
- Graph: `CONCURRENT_QUERY_GRAPH_ID`, mặc định `neondb`

Chạy:
  uv run pytest tests/test_concurrent_graph_queries.py -s
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
import requests


@pytest.fixture
def app_url():
    base = (
        os.environ.get("CONCURRENT_TEST_APP_URL")
        or os.environ.get("APP_URL")
        or "http://localhost:5000"
    )
    return base.rstrip("/")


@pytest.mark.slow
def test_ten_parallel_graph_queries(app_url):
    graph_id = (os.environ.get("CONCURRENT_QUERY_GRAPH_ID") or "neondb").strip()

    url = f"{app_url}/graphs/{graph_id}"
    payload = {
        "chat": ["How many tables are in this database? Reply briefly."],
        "use_memory": False,
        "use_user_rules": False,
    }
    headers = {"Content-Type": "application/json"}
    uid = os.environ.get("CONCURRENT_QUERY_USER_ID", "load-test-user")
    if uid:
        headers["X-User-Id"] = uid

    connect_timeout = int(os.environ.get("CONCURRENT_QUERY_CONNECT_TIMEOUT", "10"))
    read_timeout = int(os.environ.get("CONCURRENT_QUERY_READ_TIMEOUT", "300"))

    def fire(index: int) -> tuple[int, int, int]:
        r = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=(connect_timeout, read_timeout),
        )
        r.raise_for_status()
        body = r.content
        return index, r.status_code, len(body)

    n = int(os.environ.get("CONCURRENT_QUERY_COUNT", "10"))
    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(fire, i) for i in range(n)]
        results = []
        for fut in as_completed(futures):
            results.append(fut.result())

    assert len(results) == n
    for idx, status, nbytes in results:
        assert status == 200
        assert nbytes > 0, f"response {idx} rỗng"
