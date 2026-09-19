"""Known-good patch templates for the three demo-app seeds (no LLM)."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Callable

# Relative to the scan target root (typically demo-app/).
_FILE_BY_THREAT: dict[str, str] = {
    "sql_injection": "app/db.py",
    "missing_auth": "app/main.py",
    "secrets_in_repo": "app/config.py",
}

SUPPORTED_THREATS: tuple[str, ...] = tuple(_FILE_BY_THREAT.keys())


def _secure_db_py(original: str) -> str:
    """Parameterized SQL for search_users (CWE-89 closed)."""
    vulnerable = '''def search_users(query: str) -> list[dict]:
    """VULN: SQL built via string concatenation (CWE-89)."""
    conn = get_connection()
    try:
        # Intentionally unsafe — SlopGuard Red Team target.
        sql = f"SELECT id, name, email, role FROM users WHERE name LIKE '%{query}%'"
        rows = conn.execute(sql).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()'''
    secure = '''def search_users(query: str) -> list[dict]:
    """FIXED: parameterized LIKE query (CWE-89 closed)."""
    conn = get_connection()
    try:
        sql = "SELECT id, name, email, role FROM users WHERE name LIKE ?"
        rows = conn.execute(sql, (f"%{query}%",)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()'''
    if vulnerable not in original:
        raise ValueError("sql_injection template: unexpected app/db.py contents")
    return original.replace(vulnerable, secure, 1)


def _secure_main_py(original: str) -> str:
    """Require API key dependency on /admin/users."""
    if "def require_api_key" in original:
        raise ValueError("missing_auth template: admin auth already present")

    out = original.replace(
        "from fastapi import FastAPI, Query\n",
        "from fastapi import Depends, FastAPI, Header, HTTPException, Query\n",
        1,
    )
    if out == original:
        raise ValueError("missing_auth template: fastapi import not found")

    helper = '''
def require_api_key(x_api_key: str | None = Header(default=None)) -> str:
    """FIXED: reject unauthenticated admin access."""
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")
    return x_api_key


'''
    marker = "app = FastAPI(title=\"SlopGuard Demo App\", lifespan=lifespan)\n"
    if marker not in out:
        raise ValueError("missing_auth template: FastAPI app marker not found")
    out = out.replace(marker, marker + "\n" + helper, 1)

    vulnerable = '''@app.get("/admin/users")
def admin_users() -> dict:
    """VULN: admin listing with no authentication check."""
    return {"users": list_all_users(), "api_key_hint": API_KEY[:8] + "..."}'''
    secure = '''@app.get("/admin/users")
def admin_users(_auth: str = Depends(require_api_key)) -> dict:
    """FIXED: admin listing requires X-API-Key header."""
    return {"users": list_all_users(), "api_key_hint": API_KEY[:8] + "..."}'''
    if vulnerable not in out:
        raise ValueError("missing_auth template: unexpected admin route")
    return out.replace(vulnerable, secure, 1)


def _secure_config_py(original: str) -> str:
    """Remove hardcoded sk_live_ seed; load from env instead."""
    vulnerable = '''"""App config — seeded secret for gitleaks / SlopGuard demos."""

# DEMO ONLY: hardcoded secret so scanners have a deterministic finding.
API_KEY = "sk_live_demo_seed_slopguard_do_not_use"
'''
    secure = '''"""App config — API key from environment (no hardcoded sk_live_ seed)."""

import os

# FIXED: no hardcoded secret; scanners should not flag this file.
API_KEY = os.environ.get("DEMO_API_KEY", "demo-dev-key-not-for-production")
'''
    if vulnerable not in original:
        raise ValueError("secrets_in_repo template: unexpected app/config.py contents")
    return original.replace(vulnerable, secure, 1)


_TRANSFORMS: dict[str, Callable[[str], str]] = {
    "sql_injection": _secure_db_py,
    "missing_auth": _secure_main_py,
    "secrets_in_repo": _secure_config_py,
}


def resolve_target_file(target: Path, threat_id: str) -> Path:
    rel = _FILE_BY_THREAT.get(threat_id)
    if not rel:
        raise KeyError(f"no patch template for threat_id={threat_id!r}")
    path = (target.resolve() / rel).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"patch target missing: {path}")
    return path


def apply_template(
    target: Path,
    threat_id: str,
    *,
    artifacts_dir: Path | None = None,
) -> dict[str, Any]:
    """
    Apply one known-good template for threat_id under target.

    Returns a result dict including backup_text for restore_backup().
    Cap of one apply is enforced by the orchestrator caller.
    """
    if threat_id not in _TRANSFORMS:
        return {
            "applied": False,
            "threat_id": threat_id,
            "reason": "no_template",
            "engine": "template",
        }

    path = resolve_target_file(target, threat_id)
    original = path.read_text(encoding="utf-8")
    transform = _TRANSFORMS[threat_id]
    try:
        fixed = transform(original)
    except ValueError as exc:
        return {
            "applied": False,
            "threat_id": threat_id,
            "reason": str(exc),
            "engine": "template",
            "file": str(path),
        }

    if artifacts_dir is not None:
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        before = artifacts_dir / f"fix_before_{threat_id}{path.suffix}"
        after = artifacts_dir / f"fix_after_{threat_id}{path.suffix}"
        before.write_text(original, encoding="utf-8")
        after.write_text(fixed, encoding="utf-8")

    path.write_text(fixed, encoding="utf-8")
    return {
        "applied": True,
        "threat_id": threat_id,
        "engine": "template",
        "file": str(path),
        "rel_path": _FILE_BY_THREAT[threat_id],
        "backup_text": original,
        "llm_skipped": True,
    }


def restore_backup(fix_result: dict[str, Any]) -> None:
    """Restore file contents from an apply_template result (tests / rollback)."""
    if not fix_result.get("applied"):
        return
    path = Path(fix_result["file"])
    backup = fix_result.get("backup_text")
    if backup is None:
        raise ValueError("fix_result missing backup_text")
    path.write_text(backup, encoding="utf-8")


def copy_target_tree(src: Path, dest: Path) -> Path:
    """Copy a target tree for isolated fix/reverify tests."""
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    return dest
