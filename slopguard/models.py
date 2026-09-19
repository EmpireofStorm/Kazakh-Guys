from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Finding:
    threat_id: str
    severity: str
    file: str
    line: int
    message: str
    tool: str
    rule_id: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
