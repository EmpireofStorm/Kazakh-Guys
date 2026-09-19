"""Deterministic SlopGuard orchestrator spine (no LLM)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from slopguard.catalog import load_catalog, repo_root
from slopguard.graph.scope import pick_top_finding
from slopguard.models import Finding
from slopguard.redteam.prove import run_harness
from slopguard.scan import scan_report


def _new_run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _threat_by_id(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(t["id"]): t for t in catalog.get("threats", [])}


def _findings_from_report(report: dict[str, Any]) -> list[Finding]:
    out: list[Finding] = []
    for item in report.get("findings") or []:
        out.append(
            Finding(
                threat_id=str(item.get("threat_id") or ""),
                severity=str(item.get("severity") or "medium"),
                file=str(item.get("file") or ""),
                line=int(item.get("line") or 0),
                message=str(item.get("message") or ""),
                tool=str(item.get("tool") or ""),
                rule_id=str(item.get("rule_id") or ""),
                extra=dict(item.get("extra") or {}),
            )
        )
    return out


def run_pipeline(
    target: Path,
    *,
    catalog_path: Path | None = None,
    base_url: str = "http://127.0.0.1:8000",
    run_id: str | None = None,
    skip_prove: bool = False,
) -> dict[str, Any]:
    """
    Spine: scan → blast radius → catalog harness proofs → artifacts/report.json

    No OpenAI / Fixer yet (Step 6+).
    """
    root = repo_root()
    target = target.resolve()
    catalog = load_catalog(catalog_path)
    rid = run_id or _new_run_id()
    artifacts = root / "artifacts" / rid
    artifacts.mkdir(parents=True, exist_ok=True)

    scan = scan_report(target, catalog_path)
    findings = _findings_from_report(scan)
    top = pick_top_finding(findings)
    threats = _threat_by_id(catalog)

    proofs: list[dict[str, Any]] = []
    if not skip_prove:
        # Prove each distinct threat_id that has a harness (once each).
        seen: set[str] = set()
        ordered = findings
        if top is not None:
            ordered = [top] + [f for f in findings if f.threat_id != top.threat_id]
        for finding in ordered:
            tid = finding.threat_id
            if tid in seen:
                continue
            seen.add(tid)
            threat = threats.get(tid) or {}
            proof = threat.get("proof")
            if not proof:
                proofs.append(
                    {
                        "threat_id": tid,
                        "skipped": True,
                        "reason": "no_harness_in_catalog",
                    }
                )
                continue
            harness = proof.get("harness")
            if not harness:
                proofs.append(
                    {
                        "threat_id": tid,
                        "skipped": True,
                        "reason": "empty_harness",
                    }
                )
                continue
            out_path = artifacts / f"proof_{tid}.json"
            result = run_harness(
                repo_root=root,
                harness_rel=str(harness),
                base_url=base_url,
                run_id=rid,
                out_path=out_path,
                expect_closed=False,
            )
            proofs.append(
                {
                    "threat_id": tid,
                    "harness": harness,
                    "finding_file": finding.file,
                    "finding_line": finding.line,
                    **result,
                }
            )

    report: dict[str, Any] = {
        "run_id": rid,
        "target": str(target),
        "base_url": base_url,
        "catalog_version": catalog.get("catalog_version"),
        "findings": scan.get("findings") or [],
        "top_finding": scan.get("top_finding"),
        "blast_radius": scan.get("blast_radius"),
        "proofs": proofs,
        "fix": None,
        "reverify": None,
        "teacher": None,
    }

    report_path = artifacts / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    report["artifacts_dir"] = str(artifacts)
    report["report_path"] = str(report_path)
    return report


def pipeline_summary(report: dict[str, Any]) -> str:
    findings = report.get("findings") or []
    blast = report.get("blast_radius") or {}
    proofs = report.get("proofs") or []
    breached = [
        p
        for p in proofs
        if not p.get("skipped") and (p.get("evidence") or {}).get("breached")
    ]
    return (
        f"run_id={report.get('run_id')} findings={len(findings)} "
        f"blast_nodes={len(blast.get('nodes') or [])} "
        f"proofs={len(proofs)} breached={len(breached)} "
        f"report={report.get('report_path')}"
    )
