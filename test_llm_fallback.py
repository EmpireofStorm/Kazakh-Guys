import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from llm_fallback import build_llm_fix_prompt, build_request, generate_llm_fix

SAMPLE_FINDING = {"check_id": "rules.sql-injection-string-build", "start": {"line": 7}}


def test_prompt_includes_the_real_finding_and_source():
    prompt = build_llm_fix_prompt("app/user_lookup.py", SAMPLE_FINDING, "def f(): pass")
    assert "app/user_lookup.py" in prompt
    assert "line 7" in prompt
    assert "def f(): pass" in prompt
    assert "rules.sql-injection-string-build" in prompt


def test_request_has_correct_auth_header_and_no_key_leak_elsewhere():
    req = build_request("a test prompt", api_key="sk-test-fake-key")
    assert req.headers["X-api-key"] == "sk-test-fake-key"
    assert req.full_url == "https://api.anthropic.com/v1/messages"
    body = json.loads(req.data)
    assert body["messages"][0]["content"] == "a test prompt"
    assert "model" in body and "max_tokens" in body


def test_fails_honestly_with_no_key_rather_than_faking_success():
    os.environ.pop("ANTHROPIC_API_KEY", None)  # ensure clean state for this test
    try:
        generate_llm_fix("app/user_lookup.py", SAMPLE_FINDING)
        assert False, "should have raised when no API key is present"
    except NotImplementedError as e:
        assert "ANTHROPIC_API_KEY" in str(e)
