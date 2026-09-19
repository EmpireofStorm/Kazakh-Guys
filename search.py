"""
The real version of the frontend's Fix Explorer search -- scoped honestly
to what's actually buildable given two categories that each have exactly
one correct deterministic fix. "Multiple candidates" here means:

  Candidate 1: the deterministic rewriter (fix_sqli / fix_secrets)
  Candidate 2: the LLM fallback, told candidate 1 wasn't sufficient

...not several independently-invented strategies. See fix_sqli.py's and
fix_secrets.py's own docstrings for why a freehand LLM strategy isn't the
first move for either category.

Real backtracking: every candidate's attempt is against a real on-disk
backup, restored on failure -- not a simulated "revert" flag.

Real conflict detection, and a genuine bug this caught during testing:
a dependent's test can already be failing for reasons that have nothing
to do with this fix (proven case: user_lookup.py's OWN separate
vulnerability fails its own security test regardless of anything done to
tasks_search.py). So dependent test results are captured ONCE as a
baseline, against the original unfixed file, before any candidate is
tried -- a candidate is only blamed for a REGRESSION (passing at
baseline, failing after), never for a pre-existing failure.
"""
import subprocess

from dependency_graph import build_import_graph, get_dependents
import fix_sqli
import fix_secrets
import llm_fallback

FIXERS = {"sql-injection": fix_sqli.fix_file, "hardcoded-secret": fix_secrets.fix_file}


def run_pytest(test_path):
    result = subprocess.run(
        ["./venv/bin/python", "-m", "pytest", test_path, "-q"],
        capture_output=True, text=True,
    )
    return result.returncode == 0, result.stdout


def backup(path):
    with open(path) as f:
        return f.read()


def restore(path, content):
    with open(path, "w") as f:
        f.write(content)


def resolve_finding(file_path, category, module_name, app_dir="app",
                     own_test_path=None, dependent_test_paths=None,
                     max_candidates=2, llm_candidate_fn=None):
    """Returns a dict with the real outcome: which candidate (if any)
    worked, what it broke along the way, and whether it had to backtrack.
    dependent_test_paths: {dependent_module_name: test_file_path} for
    modules that actually have a test file to check -- a dependent with no
    tests genuinely can't be verified, which is stated in the result
    rather than silently assumed safe."""
    graph = build_import_graph(app_dir)
    dependents = get_dependents(module_name, graph)
    dependent_test_paths = dependent_test_paths or {}
    llm_candidate_fn = llm_candidate_fn or llm_fallback.generate_llm_fix

    log = []
    original_content = backup(file_path)

    # Baseline, captured ONCE against the original unfixed file -- this is
    # what every candidate gets judged against, not a moving target.
    baseline = {}
    for dep, path in dependent_test_paths.items():
        ok, _ = run_pytest(path)
        baseline[dep] = ok
        log.append(f"Baseline: dependent '{dep}' tests {'pass' if ok else 'already fail (pre-existing, unrelated)'}")

    deterministic_fixer = FIXERS[category]
    attempt = 1
    while attempt <= max_candidates:
        if attempt == 1:
            log.append(f"Attempt 1: deterministic fix ({category})")
            changed = deterministic_fixer(file_path)
            if not changed:
                log.append("  -> rewriter did not recognize this pattern, moving to candidate 2")
                attempt += 1
                continue
        else:
            log.append(f"Attempt {attempt}: LLM fallback")
            try:
                llm_candidate_fn(file_path, {"check_id": category, "start": {"line": 0}})
            except NotImplementedError as e:
                log.append(f"  -> LLM candidate unavailable: {e}")
                restore(file_path, original_content)
                return {"resolved": False, "backtracked": True, "log": log,
                        "reason": "no further candidates available"}

        if own_test_path:
            ok, out = run_pytest(own_test_path)
            if not ok:
                log.append("  -> own tests FAILED, reverting this candidate")
                restore(file_path, original_content)
                attempt += 1
                continue
            log.append("  -> own tests passed")

        regression = None
        for dep in dependents:
            if dep not in dependent_test_paths:
                log.append(f"  -> dependent '{dep}' has no test file, cannot verify it -- noted, not assumed safe")
                continue
            after_ok, _ = run_pytest(dependent_test_paths[dep])
            if baseline[dep] and not after_ok:
                regression = dep
                log.append(f"  -> CONFLICT: dependent '{dep}' regressed (baseline passed, now fails)")
                break
            elif not baseline[dep]:
                log.append(f"  -> dependent '{dep}' was already failing at baseline -- not this fix's problem")
            else:
                log.append(f"  -> dependent '{dep}' still passes, no regression")

        if regression:
            restore(file_path, original_content)
            log.append(f"  -> backtracking (reverted {file_path}), trying next candidate")
            attempt += 1
            continue

        log.append(f"RESOLVED on attempt {attempt}")
        return {"resolved": True, "attempt": attempt, "backtracked": attempt > 1,
                "dependents_checked": dependents, "log": log}

    restore(file_path, original_content)
    return {"resolved": False, "backtracked": True, "log": log,
            "reason": f"exhausted {max_candidates} candidates"}
