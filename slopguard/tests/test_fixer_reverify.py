"""Fixer template + ReVerify tests (apply on copies / restore originals)."""

from __future__ import annotations

import json
from pathlib import Path

from slopguard.agents.fixer import (
    SUPPORTED_THREATS,
    apply_template,
    copy_target_tree,
    restore_backup,
)
from slopguard.agents.reverify import run_reverify
from slopguard.orchestrator import run_pipeline
from slopguard.scan import scan_report

REPO = Path(__file__).resolve().parents[2]
DEMO = REPO / "demo-app"


def test_templates_clear_scanners_on_copy(tmp_path: Path) -> None:
    for threat_id in SUPPORTED_THREATS:
        dest = tmp_path / threat_id / "demo"
        arts = tmp_path / threat_id / "arts"
        copy_target_tree(DEMO, dest)
        before = scan_report(dest)
        assert any(f["threat_id"] == threat_id for f in before["findings"]), threat_id

        result = apply_template(dest, threat_id, artifacts_dir=arts)
        assert result["applied"] is True, result
        assert result["llm_skipped"] is True

        after = scan_report(dest)
        remaining = [f for f in after["findings"] if f["threat_id"] == threat_id]
        assert remaining == [], (threat_id, remaining)


def test_apply_restore_leaves_demo_unchanged() -> None:
    original = (DEMO / "app" / "db.py").read_text(encoding="utf-8")
    result = apply_template(DEMO, "sql_injection")
    assert result["applied"] is True
    try:
        fixed = (DEMO / "app" / "db.py").read_text(encoding="utf-8")
        assert "LIKE ?" in fixed
        assert "f\"SELECT" not in fixed
    finally:
        restore_backup(result)
    assert (DEMO / "app" / "db.py").read_text(encoding="utf-8") == original


def test_reverify_scanners_clean_skip_prove(tmp_path: Path) -> None:
    dest = tmp_path / "demo"
    copy_target_tree(DEMO, dest)
    arts = REPO / "artifacts" / "test_reverify_sqli"
    arts.mkdir(parents=True, exist_ok=True)
    apply_template(dest, "sql_injection", artifacts_dir=arts)
    rev = run_reverify(
        dest,
        threat_id="sql_injection",
        run_id="test_reverify_sqli",
        artifacts_dir=arts,
        skip_prove=True,
    )
    assert rev["scanners_clean"] is True
    assert rev["closed"] is True
    assert Path(rev["reverify_path"]).is_file()
    payload = json.loads(Path(rev["reverify_path"]).read_text(encoding="utf-8"))
    assert payload["threat_id"] == "sql_injection"


def test_pipeline_fix_skip_prove_on_copy(tmp_path: Path) -> None:
    dest = tmp_path / "demo"
    copy_target_tree(DEMO, dest)
    report = run_pipeline(
        dest,
        skip_prove=True,
        fix=True,
        run_id="test_fix_spine",
    )
    assert report["fix"] and report["fix"]["applied"] is True
    assert report["fix"]["threat_id"] == "sql_injection"  # top finding
    assert report["reverify"] and report["reverify"]["scanners_clean"] is True
    assert report["reverify"]["closed"] is True
    before = Path(report["before_path"])
    assert before.is_file()
    after = Path(report["artifacts_dir"]) / "after.json"
    assert after.is_file()
