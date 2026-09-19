"""Orchestrator spine tests (prove optional via skip)."""

from __future__ import annotations

import json
from pathlib import Path

from slopguard.orchestrator import run_pipeline

REPO = Path(__file__).resolve().parents[2]
DEMO = REPO / "demo-app"


def test_run_pipeline_skip_prove_writes_report(tmp_path_factory):
    report = run_pipeline(
        DEMO,
        skip_prove=True,
        run_id="test_spine_skip",
    )
    path = Path(report["report_path"])
    assert path.is_file()
    data = json.loads(path.read_text())
    assert len(data["findings"]) >= 2
    assert data["blast_radius"] is not None
    assert len(data["blast_radius"]["nodes"]) >= 2
    assert data["fix"] is None
