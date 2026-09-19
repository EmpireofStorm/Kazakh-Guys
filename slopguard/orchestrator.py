"""Deterministic SlopGuard orchestrator spine (no LLM)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from slopguard.agents.fixer import SUPPORTED_THREATS, apply_template
from slopguard.agents.reverify import run_reverify
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


def _run_proofs(
    *,
    root: Path,
    findings: list[Finding],
    top: Finding | None,
    threats: dict[str, dict[str, Any]],
    base_url: str,
    rid: str,
    artifacts: Path,
    expect_closed: bool,
) -> list[dict[str, Any]]:
    proofs: list[dict[str, Any]] = []
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
        prefix = "reverify_proof_" if expect_closed else "proof_"
        out_path = artifacts / f"{prefix}{tid}.json"
        result = run_harness(
            repo_root=root,
            harness_rel=str(harness),
            base_url=base_url,
            run_id=rid,
            out_path=out_path,
            expect_closed=expect_closed,
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
    return proofs


def run_pipeline(
    target: Path,
    *,
    catalog_path: Path | None = None,
    base_url: str = "http://127.0.0.1:8000",
    run_id: str | None = None,
    skip_prove: bool = False,
    fix: bool = False,
) -> dict[str, Any]:
    """
    Spine: scan → blast radius → prove open → (optional) fix → reverify → report.

    Fixer uses one known-good template (no OpenAI). Cap: 1 template apply.
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

    before_path = artifacts / "before.json"
    before_path.write_text(
        json.dumps(
            {
                "findings": scan.get("findings") or [],
                "top_finding": scan.get("top_finding"),
                "blast_radius": scan.get("blast_radius"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    proofs: list[dict[str, Any]] = []
    if not skip_prove:
        proofs = _run_proofs(
            root=root,
            findings=findings,
            top=top,
            threats=threats,
            base_url=base_url,
            rid=rid,
            artifacts=artifacts,
            expect_closed=False,
        )

    fix_result: dict[str, Any] | None = None
    reverify_result: dict[str, Any] | None = None

    if fix:
        if top is None:
            fix_result = {
                "applied": False,
                "reason": "no_findings",
                "engine": "template",
                "llm_skipped": True,
            }
        elif top.threat_id not in SUPPORTED_THREATS:
            fix_result = {
                "applied": False,
                "threat_id": top.threat_id,
                "reason": "no_template",
                "engine": "template",
                "llm_skipped": True,
            }
        else:
            # Cap: exactly one template apply for the top finding.
            fix_result = apply_template(
                target,
                top.threat_id,
                artifacts_dir=artifacts,
            )
            if fix_result.get("applied"):
                reverify_result = run_reverify(
                    target,
                    threat_id=top.threat_id,
                    catalog_path=catalog_path,
                    base_url=base_url,
                    run_id=rid,
                    artifacts_dir=artifacts,
                    skip_prove=skip_prove,
                )
                after_path = artifacts / "after.json"
                after_path.write_text(
                    json.dumps(reverify_result.get("after_scan") or {}, indent=2),
                    encoding="utf-8",
                )

    # Do not persist full file backups inside report.json (kept on fix_result in-memory only).
    fix_for_report = None
    if fix_result is not None:
        fix_for_report = {k: v for k, v in fix_result.items() if k != "backup_text"}

    report: dict[str, Any] = {
        "run_id": rid,
        "target": str(target),
        "base_url": base_url,
        "catalog_version": catalog.get("catalog_version"),
        "findings": scan.get("findings") or [],
        "top_finding": scan.get("top_finding"),
        "blast_radius": scan.get("blast_radius"),
        "proofs": proofs,
        "fix": fix_for_report,
        "reverify": reverify_result,
        "teacher": None,
        "before_path": str(before_path),
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
    fix = report.get("fix") or {}
    rev = report.get("reverify") or {}
    fix_bit = (
        f"fix_applied={bool(fix.get('applied'))}"
        if fix
        else "fix=None"
    )
    rev_bit = (
        f"reverify_closed={rev.get('closed')}"
        if rev
        else "reverify=None"
    )
    return (
        f"run_id={report.get('run_id')} findings={len(findings)} "
        f"blast_nodes={len(blast.get('nodes') or [])} "
        f"proofs={len(proofs)} breached={len(breached)} "
        f"{fix_bit} {rev_bit} "
        f"report={report.get('report_path')}"
    )
