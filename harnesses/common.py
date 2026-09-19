"""Shared helpers for Red Team harnesses (sandbox only)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def http_get(url: str, timeout: float = 5.0) -> tuple[int, str, dict[str, str]]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return int(resp.status), body, headers
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        headers = {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}
        return int(exc.code), body, headers


def wait_for_health(base_url: str, attempts: int = 30, delay: float = 0.5) -> bool:
    health = base_url.rstrip("/") + "/health"
    for _ in range(attempts):
        try:
            status, body, _ = http_get(health, timeout=2.0)
            if status == 200 and "ok" in body.lower():
                return True
        except Exception:
            pass
        time.sleep(delay)
    return False


def write_evidence(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def default_artifacts_dir(repo_root: Path, run_id: str | None = None) -> Path:
    rid = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return repo_root / "artifacts" / rid
