"""
Gap 1, closed: one callable entry point instead of six manual commands.

Multi-candidate search, closed too: fix generation now goes through
search.py's resolve_finding, which checks 1-hop dependents against a real
baseline (not just "did it pass") and backtracks with a real on-disk
revert when a candidate regresses something -- see search.py's docstring
and dev_tests/test_search_backtrack.py for the proof this actually works,
not just that it's designed to.
"""
import json
import os
import subprocess

from generate_tests import generate_test_file, find_enclosing_function
from dependency_graph import build_import_graph, get_dependents
from search import resolve_finding

CATEGORY_BY_RULE = {
    "rules.sql-injection-string-build": "sql-injection",
    "rules.hardcoded-secret-assignment": "hardcoded-secret",
}


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def run_pipeline(app_dir="app", rules_path="rules/sql-injection.yaml", db_path="tasks.db"):
    report = {"stage": "detect", "findings": [], "resolved": [], "unresolved": [],
              "tests_before": None, "tests_after": None, "final_scan_clean": None}

    # 1. Detect
    run(["./venv/bin/semgrep", "--config", rules_path, app_dir,
         "--json", "--output", "scan_results.json"])
    with open("scan_results.json") as f:
        scan = json.load(f)
    report["findings"] = [
        {"path": r["path"], "line": r["start"]["line"], "rule": r["check_id"]}
        for r in scan["results"]
    ]
    if not scan["results"]:
        report["stage"] = "done"
        report["final_scan_clean"] = True
        return report

    # 2. Generate tests for every finding, and build module -> test_path so
    #    a dependent that also happens to have its own finding can be
    #    checked for real, not just noted as "no test file, unverifiable".
    report["stage"] = "generate_tests"
    module_test_paths = {}
    module_by_path = {}
    for finding in scan["results"]:
        fn_name, _ = find_enclosing_function(finding["path"], finding["start"]["line"])
        test_path = f"tests/test_{fn_name}_security.py"
        generate_test_file(finding, test_path, db_path=db_path)
        module_name = os.path.splitext(os.path.basename(finding["path"]))[0]
        module_test_paths[module_name] = test_path
        module_by_path[finding["path"]] = module_name

    # 3. Baseline, before touching anything
    report["stage"] = "test_before"
    code, out, err = run(["./venv/bin/python", "-m", "pytest", "tests/", "-v"])
    report["tests_before"] = {"exit_code": code, "summary": out.strip().splitlines()[-1] if out else err}

    # 4. Resolve each finding via the real graph-aware search
    report["stage"] = "resolve"
    graph = build_import_graph(app_dir)
    report["search_detail"] = {}
    for finding in scan["results"]:
        path, module_name = finding["path"], module_by_path[finding["path"]]
        category = CATEGORY_BY_RULE.get(finding["check_id"])
        if category is None:
            report["unresolved"].append(path)
            continue

        dependents = graph.get(module_name, set())
        dep_names = get_dependents(module_name, graph)
        dep_paths = {d: module_test_paths[d] for d in dep_names if d in module_test_paths}

        result = resolve_finding(
            file_path=path, category=category, module_name=module_name, app_dir=app_dir,
            own_test_path=module_test_paths.get(module_name), dependent_test_paths=dep_paths,
        )
        report["search_detail"][path] = result
        (report["resolved"] if result["resolved"] else report["unresolved"]).append(path)

    # 5. Re-run tests -- report what's actually true now, not what we hope
    report["stage"] = "test_after"
    code, out, err = run(["./venv/bin/python", "-m", "pytest", "tests/", "-v"])
    report["tests_after"] = {"exit_code": code, "summary": out.strip().splitlines()[-1] if out else err}

    # 6. Re-scan -- ground truth on what's actually still open
    code, out, err = run(["./venv/bin/semgrep", "--config", rules_path, app_dir, "--json"])
    remaining = json.loads(out)["results"] if out else []
    report["final_scan_clean"] = len(remaining) == 0
    report["remaining_findings"] = [r["path"] for r in remaining]
    report["stage"] = "done"
    return report


if __name__ == "__main__":
    result = run_pipeline()
    print("\n--- summary ---")
    print(f"Findings detected: {len(result['findings'])}")
    print(f"Resolved: {result['resolved']}")
    print(f"Unresolved (escalated/needs human): {result['unresolved']}")
    for path, detail in result.get("search_detail", {}).items():
        print(f"\n{path}:")
        for line in detail["log"]:
            print(f"  {line}")
    print(f"\nTests before fix: {result['tests_before']['summary']}")
    print(f"Tests after fix:  {result['tests_after']['summary']}")
    print(f"All clear: {result['final_scan_clean']} (remaining: {result.get('remaining_findings')})")
