from __future__ import annotations

import argparse
import sys
from pathlib import Path

from slopguard.scan import findings_to_json, scan_target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="slopguard", description="SlopGuard CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    scan_p = sub.add_parser("scan", help="Run catalog-bound scanners on a target path")
    scan_p.add_argument(
        "target",
        nargs="?",
        default="demo-app",
        help="Path to scan (default: demo-app)",
    )
    scan_p.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional path to threats.yaml",
    )

    args = parser.parse_args(argv)
    if args.command == "scan":
        target = Path(args.target)
        if not target.exists():
            print(f"Target not found: {target}", file=sys.stderr)
            return 2
        findings = scan_target(target, args.catalog)
        print(findings_to_json(findings))
        print(f"\n# {len(findings)} finding(s)", file=sys.stderr)
        return 1 if findings else 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
