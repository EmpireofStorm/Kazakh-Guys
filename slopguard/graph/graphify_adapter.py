"""Optional graphify CLI adapter. Falls back silently if unavailable."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


def try_graphify_blast_radius(
    project_root: Path,
    seed_file: Path,
    seed_line: int,
) -> dict[str, Any] | None:
    """
    Attempt to use a local `graphify` CLI if installed.
    Returns None when graphify is missing or the call fails.
    """
    binary = shutil.which("graphify")
    if not binary:
        return None

    # Best-effort: interfaces differ across graphify forks. We only accept a
    # JSON blob with nodes/edges; otherwise caller uses AST.
    try:
        proc = subprocess.run(
            [
                binary,
                "query",
                "--json",
                "--file",
                str(seed_file),
                "--line",
                str(seed_line),
                "--depth",
                "2",
            ],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return None

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None

    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []
    if len(nodes) < 2:
        return None

    return {
        "engine": "graphify",
        "seed": {
            "file": str(seed_file.resolve()),
            "line": seed_line,
            "name": payload.get("seed_name") or Path(seed_file).stem,
        },
        "nodes": nodes,
        "edges": edges,
        "why": payload.get("why")
        or "Blast radius from graphify structural graph.",
    }
