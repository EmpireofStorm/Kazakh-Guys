from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = REPO_ROOT / "catalog" / "threats.yaml"


def load_catalog(path: Path | None = None) -> dict[str, Any]:
    catalog_path = path or DEFAULT_CATALOG
    with catalog_path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict) or "threats" not in data:
        raise ValueError(f"Invalid catalog: {catalog_path}")
    return data


def repo_root() -> Path:
    return REPO_ROOT
