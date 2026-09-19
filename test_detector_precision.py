"""
Regression test for the DETECTOR's precision, not the fixer. Runs the real
Semgrep rule against app/safe_patterns.py and asserts zero findings --
catches a future rule change that becomes too broad and starts flagging
safe code, the same class of bug as an over-eager fixer, just upstream.
"""
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_no_false_positives_on_safe_patterns():
    out_path = os.path.join(ROOT, "safe_scan.json")
    subprocess.run(
        [os.path.join(ROOT, "venv", "bin", "semgrep"), "--config",
         os.path.join(ROOT, "rules", "sql-injection.yaml"),
         os.path.join(ROOT, "app", "safe_patterns.py"),
         "--json", "--output", out_path],
        capture_output=True, text=True,
    )
    with open(out_path) as f:
        result = json.load(f)
    os.remove(out_path)

    findings = result["results"]
    assert findings == [], (
        f"Detector false-positived on deliberately safe code: "
        f"{[(r['path'], r['start']['line']) for r in findings]}"
    )
