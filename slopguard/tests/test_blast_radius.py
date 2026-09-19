"""Tests for AST blast-radius scoping on the demo app."""

from __future__ import annotations

from pathlib import Path

from slopguard.graph.ast_scope import build_blast_radius
from slopguard.graph.scope import blast_radius_for_finding, pick_top_finding
from slopguard.models import Finding

REPO = Path(__file__).resolve().parents[2]
DEMO = REPO / "demo-app"


def test_sqli_blast_radius_has_caller() -> None:
    seed = DEMO / "app" / "db.py"
    # Line of conn.execute(sql) in search_users
    result = build_blast_radius(DEMO, seed, seed_line=52, depth=2)
    assert result["engine"] == "ast"
    assert len(result["nodes"]) >= 2
    names = {n["name"] for n in result["nodes"]}
    assert "search_users" in names
    assert "search" in names  # FastAPI route caller


def test_blast_radius_for_finding_enriches() -> None:
    finding = Finding(
        threat_id="sql_injection",
        severity="high",
        file=str(DEMO / "app" / "db.py"),
        line=52,
        message="SQLi",
        tool="semgrep",
    )
    blast = blast_radius_for_finding(DEMO, finding)
    assert len(blast["nodes"]) >= 2
    assert blast["engine"] in {"ast", "graphify"}


def test_pick_top_finding_prefers_sqli_for_graph() -> None:
    findings = [
        Finding("secrets_in_repo", "critical", "b.py", 1, "y", "gitleaks"),
        Finding("sql_injection", "high", "a.py", 1, "x", "semgrep"),
    ]
    top = pick_top_finding(findings)
    assert top is not None
    assert top.threat_id == "sql_injection"
