from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from slopguard.models import Finding

SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
}


def _semgrep_cmd() -> list[str]:
    """Prefer venv-local semgrep; avoid resolving through system Python symlinks."""
    candidates = [
        Path(sys.prefix) / "bin" / "semgrep",
        Path(sys.executable).parent / "semgrep",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return [str(candidate)]
    path = shutil.which("semgrep")
    if path:
        return [path]
    raise RuntimeError(
        "semgrep not found. Install with: pip install semgrep (in the project venv)"
    )


def run_semgrep(
    target: Path,
    config: Path,
    threat_id: str,
    *,
    cwd: Path | None = None,
) -> list[Finding]:
    cmd = [
        *_semgrep_cmd(),
        "scan",
        "--config",
        str(config),
        "--json",
        "--quiet",
        str(target),
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(cwd) if cwd else None,
        check=False,
    )
    # Semgrep exits 1 when findings exist.
    if proc.returncode not in (0, 1):
        raise RuntimeError(
            f"semgrep failed ({proc.returncode}): {proc.stderr or proc.stdout}"
        )

    payload = json.loads(proc.stdout or "{}")
    findings: list[Finding] = []
    for item in payload.get("results", []):
        meta = item.get("extra", {}).get("metadata", {}) or {}
        tid = meta.get("threat_id") or threat_id
        severity = SEVERITY_MAP.get(
            str(item.get("extra", {}).get("severity", "ERROR")).upper(),
            "high",
        )
        path = item.get("path") or ""
        start = item.get("start", {}) or {}
        findings.append(
            Finding(
                threat_id=str(tid),
                severity=severity,
                file=path,
                line=int(start.get("line") or 0),
                message=str(item.get("extra", {}).get("message") or item.get("check_id")),
                tool="semgrep",
                rule_id=str(item.get("check_id") or ""),
                extra={"end_line": (item.get("end") or {}).get("line")},
            )
        )
    return findings
