from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from slopguard.orchestrator import pipeline_summary, run_pipeline
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

    run_p = sub.add_parser(
        "run",
        help="Spine: scan → blast → prove → optional --fix → reverify → report.json",
    )
    run_p.add_argument("target", nargs="?", default="demo-app")
    run_p.add_argument("--catalog", type=Path, default=None)
    run_p.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Sandbox demo-app URL for harnesses",
    )
    run_p.add_argument("--run-id", default=None)
    run_p.add_argument(
        "--skip-prove",
        action="store_true",
        help="Skip Red Team harnesses (scan+graph only)",
    )
    run_p.add_argument(
        "--fix",
        action="store_true",
        help="Apply one known-good template for the top finding, then reverify",
    )

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

    if args.command == "run":
        target = Path(args.target)
        if not target.exists():
            print(f"Target not found: {target}", file=sys.stderr)
            return 2
        report = run_pipeline(
            target,
            catalog_path=args.catalog,
            base_url=args.base_url,
            run_id=args.run_id,
            skip_prove=args.skip_prove,
            fix=args.fix,
        )
        print(json.dumps(report, indent=2))
        print(f"\n# {pipeline_summary(report)}", file=sys.stderr)
        findings = report.get("findings") or []
        rev = report.get("reverify") or {}
        # After a successful fix loop, exit 0 when that issue is closed even if
        # sibling findings remain (cap is one template).
        if args.fix and rev.get("closed"):
            return 0
        if not findings:
            return 0
        return 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
