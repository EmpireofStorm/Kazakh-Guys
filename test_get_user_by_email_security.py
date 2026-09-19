# AUTO-GENERATED from a Semgrep finding -- regenerate, don't hand-edit.
# Source: app/user_lookup.py:7  (rules.sql-injection-string-build)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

def test_get_user_by_email_blocks_sql_injection():
    """Generated from Semgrep finding: rules.sql-injection-string-build at app/user_lookup.py:7."""
    from user_lookup import get_user_by_email

    malicious = "x' OR '1'='1"
    rows = get_user_by_email(malicious)
    assert len(rows) == 0, (
        f"Injection succeeded -- a non-existent email returned {len(rows)} row(s): {rows}."
    )

def test_get_user_by_email_still_works_with_real_data():
    """FALLBACK: no row with a special character exists -- weaker test.
    Built from an actual row in the target database, not a hardcoded guess."""
    from user_lookup import get_user_by_email

    example_value = 'alice@tallybird.app'
    rows = get_user_by_email(example_value)
    assert len(rows) == 1, (
        f"Legitimate lookup for {example_value} should return exactly one row, got {rows}."
    )
