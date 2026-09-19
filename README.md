# Backend

The working detect → test → fix → verify pipeline. See the top-level
README for the design rationale; this file covers setup and structure.

## Setup

```bash
pip install semgrep pytest
python app/init_db.py
```

## Usage

```bash
python pipeline.py            # detect, generate tests, fix, verify -- end to end
pytest dev_tests/ -v          # regression suite for the pipeline's own code
pytest tests/ -v              # the generated security/functional tests, once created
```

`pipeline.py` prints a summary: which findings were detected, which were
fixed deterministically, which were escalated (and why), and the real
before/after test results.

## File structure

```
app/                Sample vulnerable application the pipeline runs against.
  tasks_search.py       SQL injection via string concatenation.
  tasks_search_BEFORE.py  Reference copy of the original vulnerable code.
  user_lookup.py         SQL injection via .format() -- a different pattern,
                          used to prove the detector and fixer generalize.
  billing_config.py      Hardcoded secret (CWE-798).
  safe_patterns.py       Deliberately safe-looking code, used to test the
                          detector doesn't false-positive on it.
  init_db.py             Seeds the sample SQLite database.

rules/               Semgrep detection rules, one per attack category.
  sql-injection.yaml
  hardcoded-secrets.yaml

generate_tests.py    Builds a security test + functional test per finding,
                      from the actual flagged function's real signature and
                      real data pulled from the target database.

fix_sqli.py           Deterministic AST-based rewriter for SQL injection.
fix_secrets.py         Deterministic rewriter for hardcoded secrets.
llm_fallback.py       Direct Claude API call, used when no deterministic
                       pattern applies. Requires ANTHROPIC_API_KEY.

dependency_graph.py   Extracts real import relationships from the codebase.
search.py             Runs a fix, checks connected files against a test
                       baseline, and backtracks to a different candidate if
                       something regresses.

pipeline.py           Single entry point tying every stage together.

tests/                Generated at runtime by generate_tests.py.
dev_tests/            Regression suite for this backend's own code --
                       covers the rewriter's edge cases, the detector's
                       precision on safe code, the fallback's request
                       construction, and the search/backtrack mechanism
                       itself (including a scenario that proves a genuine
                       regression is caught and reverted).
```

## Scope

Two attack categories have a complete, tested implementation end to end:
SQL injection and hardcoded secrets. Extending to another category means
first checking whether its correct fix is a mechanical, rule-based
pattern or genuinely requires model judgment, then building the
detector, test templates, and fixer following the same structure as
these two.
