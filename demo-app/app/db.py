"""SQLite helpers — intentionally vulnerable query construction for the demo."""

from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "users.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count == 0:
            conn.executemany(
                "INSERT INTO users (name, email, role) VALUES (?, ?, ?)",
                [
                    ("Alice Admin", "alice@example.com", "admin"),
                    ("Bob Builder", "bob@example.com", "user"),
                    ("Carol Analyst", "carol@example.com", "user"),
                ],
            )
            conn.commit()
    finally:
        conn.close()


def search_users(query: str) -> list[dict]:
    """VULN: SQL built via string concatenation (CWE-89)."""
    conn = get_connection()
    try:
        # Intentionally unsafe — SlopGuard Red Team target.
        sql = f"SELECT id, name, email, role FROM users WHERE name LIKE '%{query}%'"
        rows = conn.execute(sql).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def list_all_users() -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name, email, role FROM users ORDER BY id"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
