"""Re-verify after Fixer: scanners clean for issue + harness expect_closed."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from slopguard.catalog import load_catalog, repo_root
from slopguard.redteam.prove import run_harness
from slopguard.scan import scan_report


def run_reverify(
    target: Path,
    *,
    threat_id: str,
    catalog_path: Path | None = None,
    base_url: str = "http://127.0.0.1:8000",
    run_id: str,
    artifacts_dir: Path,
    skip_prove: bool = False,
) -> dict[str, Any]:
    """
    After a template fix:
    1. Re-scan; require no findings for threat_id.
    2. If catalog has a harness, run with --expect-closed (vuln must be closed).
    """
    root = repo_root()
    catalog = load_catalog(catalog_path)
    threats = {str(t["id"]): t for t in catalog.get("threats", [])}
    threat = threats.get(threat_id) or {}

    after = scan_report(target, catalog_path)
    remaining = [
        f
        for f in (after.get("findings") or [])
        if str(f.get("threat_id")) == threat_id
    ]
    scanners_clean = len(remaining) == 0

    proofs: list[dict[str, Any]] = []
    if not skip_prove:
        proof = threat.get("proof")
        harness = (proof or {}).get("harness") if proof else None
        if harness:
            out_path = artifacts_dir / f"reverify_proof_{threat_id}.json"
            result = run_harness(
                repo_root=root,
                harness_rel=str(harness),
                base_url=base_url,
                run_id=run_id,
                out_path=out_path,
                expect_closed=True,
            )
            proofs.append(
                {
                    "threat_id": threat_id,
                    "harness": harness,
                    **result,
                }
            )
        else:
            proofs.append(
                {
                    "threat_id": threat_id,
                    "skipped": True,
                    "reason": "no_harness_in_catalog",
                }
            )

    harness_ok = True
    for p in proofs:
        if p.get("skipped"):
            continue
        # expect_closed: exit 0 means vuln closed
        if not p.get("ok"):
            harness_ok = False

    closed = scanners_clean and harness_ok
    payload: dict[str, Any] = {
        "threat_id": threat_id,
        "scanners_clean": scanners_clean,
        "remaining_findings": remaining,
        "findings_after_count": len(after.get("findings") or []),
        "proofs": proofs,
        "harness_ok": harness_ok,
        "closed": closed,
        "after_scan": {
            "findings": after.get("findings") or [],
            "top_finding": after.get("top_finding"),
            "blast_radius": after.get("blast_radius"),
        },
    }

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    reverify_path = artifacts_dir / "reverify.json"
    reverify_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    payload["reverify_path"] = str(reverify_path)
    return payload
