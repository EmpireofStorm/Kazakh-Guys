"""Public blast-radius API: prefer graphify when available, else AST."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from slopguard.graph.ast_scope import build_blast_radius
from slopguard.graph.graphify_adapter import try_graphify_blast_radius
from slopguard.models import Finding

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
# Prefer structural / exploitable code findings for blast-radius demos.
GRAPH_THREAT_RANK = {
    "sql_injection": 0,
    "missing_auth": 1,
    "secrets_in_repo": 2,
}


def pick_top_finding(findings: list[Finding]) -> Finding | None:
    if not findings:
        return None
    return sorted(
        findings,
        key=lambda f: (
            GRAPH_THREAT_RANK.get(f.threat_id, 50),
            SEVERITY_RANK.get(f.severity, 9),
            f.line,
            f.file,
        ),
    )[0]


def blast_radius_for_finding(
    project_root: Path,
    finding: Finding,
    *,
    depth: int = 2,
) -> dict[str, Any]:
    seed = Path(finding.file)
    if not seed.is_file():
        # Relative paths from scanners
        candidate = (project_root / finding.file).resolve()
        if candidate.is_file():
            seed = candidate
        else:
            return {
                "engine": "none",
                "seed": {"file": finding.file, "line": finding.line, "name": ""},
                "nodes": [],
                "edges": [],
                "why": f"Seed file not found: {finding.file}",
            }

    root = project_root.resolve()
    # Prefer packaging root that contains the seed (e.g. demo-app/).
    if root not in seed.resolve().parents and seed.resolve().parent != root:
        # If project_root is repo root and seed is under demo-app/app, use demo-app.
        for parent in seed.resolve().parents:
            if (parent / "app").is_dir() and (parent / "app" / "__init__.py").exists():
                root = parent
                break

    graphify = try_graphify_blast_radius(root, seed, finding.line)
    if graphify is not None:
        return graphify

    result = build_blast_radius(root, seed, finding.line, depth=depth)
    result["threat_id"] = finding.threat_id
    result["finding_message"] = finding.message
    return result


def enrich_scan_report(
    project_root: Path,
    findings: list[Finding],
) -> dict[str, Any]:
    top = pick_top_finding(findings)
    blast: dict[str, Any] | None = None
    if top is not None:
        blast = blast_radius_for_finding(project_root, top)
    return {
        "findings": [f.to_dict() for f in findings],
        "top_finding": top.to_dict() if top else None,
        "blast_radius": blast,
    }
