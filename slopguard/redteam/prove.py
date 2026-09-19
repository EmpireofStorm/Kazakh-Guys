"""Run catalog-bound Red Team harnesses and capture evidence."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def run_harness(
    *,
    repo_root: Path,
    harness_rel: str,
    base_url: str,
    run_id: str,
    out_path: Path,
    expect_closed: bool = False,
) -> dict[str, Any]:
    harness = (repo_root / harness_rel).resolve()
    if not harness.is_file():
        return {
            "ok": False,
            "error": f"harness not found: {harness}",
            "exit_code": 2,
            "evidence_path": None,
        }

    cmd = [
        sys.executable,
        str(harness),
        "--base-url",
        base_url,
        "--repo-root",
        str(repo_root),
        "--run-id",
        run_id,
        "--out",
        str(out_path),
    ]
    if expect_closed:
        cmd.append("--expect-closed")

    proc = subprocess.run(
        cmd,
        cwd=str(harness.parent),
        capture_output=True,
        text=True,
        check=False,
    )
    evidence: dict[str, Any] | None = None
    if out_path.is_file():
        try:
            evidence = json.loads(out_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            evidence = None

    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout": (proc.stdout or "").strip(),
        "stderr": (proc.stderr or "").strip(),
        "evidence_path": str(out_path) if out_path.is_file() else None,
        "evidence": evidence,
        "expect_closed": expect_closed,
    }
