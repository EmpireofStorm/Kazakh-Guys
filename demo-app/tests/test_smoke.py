"""Smoke tests for the intentionally vulnerable demo app."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app


@pytest.fixture()
def client() -> TestClient:
    init_db()
    with TestClient(app) as c:
        yield c


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_search_returns_rows(client: TestClient) -> None:
    r = client.get("/search", params={"q": "Alice"})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "Alice"
    assert len(body["results"]) >= 1
    assert body["results"][0]["name"] == "Alice Admin"


def test_sqli_seed_returns_all_users(client: TestClient) -> None:
    # Breaks out of LIKE '%{q}%' via concatenation.
    payload = "' OR '1'='1' OR 'x"
    r = client.get("/search", params={"q": payload})
    assert r.status_code == 200
    assert len(r.json()["results"]) >= 3


def test_admin_users_no_auth(client: TestClient) -> None:
    r = client.get("/admin/users")
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) >= 3
    assert any(u["role"] == "admin" for u in users)


def test_secret_present_in_config() -> None:
    from app.config import API_KEY

    assert API_KEY.startswith("sk_")
    assert "demo_seed" in API_KEY
