#!/usr/bin/env python3
"""
Red Team harness: missing auth on /admin/users (SlopGuard demo-app).

Exit 0 = BREACHED (unauthenticated access to admin listing)
Exit 1 = SAFE / not confirmed
Exit 2 = infrastructure error

Sandbox only.
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


def main() -> int:
    parser = argparse.ArgumentParser(description="SlopGuard missing-auth Red Team harness")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument(
        "--expect-closed",
        action="store_true",
        help="Invert: exit 0 if unauthenticated admin access is blocked",
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    if not wait_for_health(base):
        print(f"demo-app not healthy at {base}", file=sys.stderr)
        return 2

    url = f"{base}/admin/users"
    status, body, headers = http_get(url)
    try:
        data = json.loads(body)
        users = data.get("users") or []
    except json.JSONDecodeError:
        users = []
        data = {"raw": body}

    breached = status == 200 and len(users) >= 1 and any(
        u.get("role") == "admin" for u in users if isinstance(u, dict)
    )

    evidence = {
        "threat_id": "missing_auth",
        "harness": "unauth_get",
        "timestamp": utc_now(),
        "base_url": base,
        "request": {"method": "GET", "url": url, "auth": None},
        "response": {
            "status": status,
            "headers": {k: headers.get(k) for k in ("content-type",)},
            "body": data,
            "user_count": len(users),
        },
        "breach_predicate": "status==200 and admin user visible without credentials",
        "breached": breached,
        "verdict": "BREACHED" if breached else "SAFE",
    }

    out = args.out
    if out is None:
        out = default_artifacts_dir(args.repo_root, args.run_id) / "unauth_get.json"
    write_evidence(out, evidence)
    print(json.dumps({"verdict": evidence["verdict"], "evidence": str(out)}, indent=2))

    if args.expect_closed:
        return 0 if not breached else 1
    return 0 if breached else 1


if __name__ == "__main__":
    raise SystemExit(main())
