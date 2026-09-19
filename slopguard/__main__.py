from __future__ import annotations

import argparse
import sys
from pathlib import Path

from slopguard.scan import report_to_json, scan_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="slopguard", description="SlopGuard CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    scan_p = sub.add_parser(
        "scan",
        help="Run catalog-bound scanners and blast-radius for the top finding",
    )
    scan_p.add_argument("target", nargs="?", default="demo-app")
    scan_p.add_argument("--catalog", type=Path, default=None)

    args = parser.parse_args(argv)

    if args.command == "scan":
        target = Path(args.target)
        if not target.exists():
            print(f"Target not found: {target}", file=sys.stderr)
            return 2
        report = scan_report(target, args.catalog)
        print(report_to_json(report))
        findings = report.get("findings") or []
        blast = report.get("blast_radius") or {}
        print(
            f"\n# {len(findings)} finding(s); blast_radius nodes="
            f"{len(blast.get('nodes') or [])} engine={blast.get('engine')}",
            file=sys.stderr,
        )
        return 1 if findings else 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
