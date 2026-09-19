"""
LLM fallback for patterns fix_sqli.py's deterministic rewriter doesn't
recognize (e.g. user_lookup.py's .format()-based query).

Deliberately NOT the full Claude Code agent -- this task is "one file in,
one fixed file out," which is a single completion call, not a multi-step
tool-use session. Using the heavier agent for a job that doesn't need
tools would be the opposite of simple. Uses only Python's standard
library (urllib), so there's no new dependency for what is fundamentally
one HTTP request.

HONEST STATUS: this sandbox has no ANTHROPIC_API_KEY, so the live call has
never been exercised end-to-end -- that part is unverified. What HAS been
tested (dev_tests/test_llm_fallback.py): prompt construction, request
construction (headers/payload), and the no-key failure path. The moment a
real key is set in the environment, generate_llm_fix() runs for real with
no code change needed.
"""
import json
import os
import textwrap
import urllib.request


API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"  # swap freely -- this task has no reason to need a specific tier


def build_llm_fix_prompt(file_path, finding, source_code):
    return textwrap.dedent(f"""
        A static analyzer (Semgrep, rule: {finding['check_id']}) flagged a
        SQL injection vulnerability in the file below, at line {finding['start']['line']}.

        The deterministic AST-based rewriter could not handle this file's
        query-building pattern (it only recognizes string concatenation and
        f-strings; this file uses a different pattern).

        Rewrite ONLY the vulnerable query construction to use a parameterized
        query. Do not change any other behavior. Return the complete
        corrected file content, nothing else -- no explanation, no markdown
        fences.

        File: {file_path}
        ---
        {source_code}
        ---
    """).strip()


def build_request(prompt, api_key):
    """Separated from the actual network call specifically so it can be
    tested without one -- see dev_tests/test_llm_fallback.py."""
    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    return urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )


def generate_llm_fix(file_path, finding):
    """Makes a real call if ANTHROPIC_API_KEY is set in the environment;
    otherwise fails loudly with exactly what's missing, rather than
    pretending to succeed. Never marks the finding resolved itself -- the
    caller (pipeline.py) re-runs generate_tests.py + pytest on whatever
    this returns, holding an LLM fix to the identical verification bar as
    the deterministic path, per CLAUDE.md 5.2.3."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise NotImplementedError(
            "ANTHROPIC_API_KEY is not set. Set it and this function makes "
            "a real call with no code change needed -- this is not a "
            "placeholder that needs rewriting later, just a missing key."
        )

    with open(file_path) as f:
        source_code = f.read()
    prompt = build_llm_fix_prompt(file_path, finding, source_code)
    req = build_request(prompt, api_key)

    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    fixed_code = result["content"][0]["text"]

    with open(file_path, "w") as f:
        f.write(fixed_code)
    return fixed_code
