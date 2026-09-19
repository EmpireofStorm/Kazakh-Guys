from __future__ import annotations

import json
from pathlib import Path

from slopguard.catalog import load_catalog, repo_root
from slopguard.graph.scope import enrich_scan_report
from slopguard.models import Finding
from slopguard.tools.gitleaks import run_gitleaks
from slopguard.tools.semgrep import run_semgrep


def scan_target(target: Path, catalog_path: Path | None = None) -> list[Finding]:
    root = repo_root()
    catalog = load_catalog(catalog_path)
    target = target.resolve()
    findings: list[Finding] = []

    for threat in catalog.get("threats", []):
        threat_id = str(threat["id"])
        for detector in threat.get("detectors", []):
            tool = detector.get("tool")
            config_rel = detector.get("config")
            if not config_rel:
                continue
            config = (root / config_rel).resolve()
            if tool == "semgrep":
                findings.extend(
                    run_semgrep(target, config, threat_id, cwd=root)
                )
            elif tool == "gitleaks":
                findings.extend(run_gitleaks(target, config, threat_id))
            else:
                raise ValueError(f"Unknown detector tool: {tool}")

    return findings


def scan_report(target: Path, catalog_path: Path | None = None) -> dict:
    """Run scanners and attach blast_radius for the top finding."""
    findings = scan_target(target, catalog_path)
    return enrich_scan_report(target.resolve(), findings)


def findings_to_json(findings: list[Finding]) -> str:
    return json.dumps([f.to_dict() for f in findings], indent=2)


def report_to_json(report: dict) -> str:
    return json.dumps(report, indent=2)
