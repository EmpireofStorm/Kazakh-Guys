"""Smoke test Red Team harnesses against a live demo-app (offline path)."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
DEMO = REPO / "demo-app"
HARNESS = REPO / "harnesses"


@pytest.fixture(scope="module")
def live_app():
    """Start uvicorn for harness tests; skip if bind fails."""
    venv_python = DEMO / ".venv" / "bin" / "python"
    python = str(venv_python) if venv_python.exists() else sys.executable
    proc = subprocess.Popen(
        [
            python,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8010",
        ],
        cwd=str(DEMO),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Wait for health
    import urllib.request

    healthy = False
    for _ in range(40):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8010/health", timeout=1) as r:
                if r.status == 200:
                    healthy = True
                    break
        except Exception:
            time.sleep(0.25)
    if not healthy:
        proc.kill()
        pytest.skip("Could not start demo-app for harness tests")
    yield "http://127.0.0.1:8010"
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_sqli_harness_breached(live_app, tmp_path):
    out = tmp_path / "sqli.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(HARNESS / "sqli_http.py"),
            "--base-url",
            live_app,
            "--repo-root",
            str(REPO),
            "--out",
            str(out),
        ],
        cwd=str(HARNESS),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    evidence = json.loads(out.read_text())
    assert evidence["breached"] is True
    assert evidence["verdict"] == "BREACHED"


def test_unauth_harness_breached(live_app, tmp_path):
    out = tmp_path / "unauth.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(HARNESS / "unauth_get.py"),
            "--base-url",
            live_app,
            "--repo-root",
            str(REPO),
            "--out",
            str(out),
        ],
        cwd=str(HARNESS),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    evidence = json.loads(out.read_text())
    assert evidence["breached"] is True
    assert evidence["verdict"] == "BREACHED"
