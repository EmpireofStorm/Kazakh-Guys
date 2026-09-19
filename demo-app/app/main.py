"""FastAPI entrypoint with seeded SQLi and missing-auth routes."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Query

from app.config import API_KEY
from app.db import init_db, list_all_users, search_users


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SlopGuard Demo App", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/search")
def search(q: str = Query("", description="Name search")) -> dict:
    """VULN: passes unsanitized q into string-concat SQL."""
    results = search_users(q)
    return {"query": q, "results": results}


@app.get("/admin/users")
def admin_users() -> dict:
    """VULN: admin listing with no authentication check."""
    return {"users": list_all_users(), "api_key_hint": API_KEY[:8] + "..."}


@app.get("/")
def root() -> dict:
    return {
        "service": "slopguard-demo-app",
        "warning": "Intentionally vulnerable — local sandbox only",
        "endpoints": ["/health", "/search?q=", "/admin/users"],
    }
