from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from slopguard.models import Finding

# Offline/demo fallback when gitleaks CLI is unavailable.
_FALLBACK_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "slopguard-stripe-like-live-key",
        re.compile(r"sk_live_[0-9a-zA-Z_]{8,}"),
    ),
]


def _gitleaks_bin() -> str | None:
    path = shutil.which("gitleaks")
    if path:
        return path
    brew = Path("/opt/homebrew/bin/gitleaks")
    if brew.is_file():
        return str(brew)
    return None


def run_gitleaks(
    target: Path,
    config: Path,
    threat_id: str = "secrets_in_repo",
) -> list[Finding]:
    binary = _gitleaks_bin()
    if binary:
        return _run_gitleaks_cli(binary, target, config, threat_id)
    return _run_fallback_scan(target, threat_id)


def _run_gitleaks_cli(
    binary: str,
    target: Path,
    config: Path,
    threat_id: str,
) -> list[Finding]:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        report_path = Path(tmp.name)
    try:
        cmd = [
            binary,
            "detect",
            "--no-git",
            "--source",
            str(target),
            "--config",
            str(config),
            "--report-path",
            str(report_path),
            "--report-format",
            "json",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        # gitleaks exits 1 when leaks are found.
        if proc.returncode not in (0, 1):
            raise RuntimeError(
                f"gitleaks failed ({proc.returncode}): {proc.stderr or proc.stdout}"
            )
        raw = report_path.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        data = json.loads(raw)
        findings: list[Finding] = []
        for item in data if isinstance(data, list) else []:
            findings.append(
                Finding(
                    threat_id=threat_id,
                    severity="critical",
                    file=str(item.get("File") or item.get("file") or ""),
                    line=int(item.get("StartLine") or item.get("startLine") or 0),
                    message=str(
                        item.get("Description")
                        or item.get("RuleID")
                        or "Secret detected"
                    ),
                    tool="gitleaks",
                    rule_id=str(item.get("RuleID") or item.get("RuleId") or ""),
                    extra={"match": item.get("Match") or item.get("Secret")},
                )
            )
        return findings
    finally:
        report_path.unlink(missing_ok=True)


def _run_fallback_scan(target: Path, threat_id: str) -> list[Finding]:
    """Regex scan mirroring catalog/gitleaks.toml when CLI is missing."""
    findings: list[Finding] = []
    root = target if target.is_dir() else target.parent
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {".venv", "venv", ".git", "__pycache__", "node_modules"} for part in path.parts):
            continue
        if path.suffix not in {".py", ".env", ".toml", ".yml", ".yaml", ".txt", ".md", ""}:
            if path.name not in {".env", ".env.example"}:
                continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for rule_id, pattern in _FALLBACK_PATTERNS:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append(
                    Finding(
                        threat_id=threat_id,
                        severity="critical",
                        file=str(path),
                        line=line,
                        message=f"Hardcoded secret matched ({rule_id})",
                        tool="gitleaks-fallback",
                        rule_id=rule_id,
                        extra={"match": match.group(0)[:12] + "..."},
                    )
                )
    return findings
