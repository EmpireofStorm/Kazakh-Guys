# AUTO-GENERATED from a Semgrep finding -- regenerate, don't hand-edit.
# Source: app/tasks_search.py:13  (rules.sql-injection-string-build)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

def test_search_tasks_blocks_sql_injection():
    """Generated from Semgrep finding: rules.sql-injection-string-build at app/tasks_search.py:13."""
    from tasks_search import search_tasks

    malicious = "1 OR 1=1 --"
    rows = search_tasks(malicious, "")
    project_ids_returned = {row[2] for row in rows}
    assert project_ids_returned <= {"1 OR 1=1 --"}, (
        f"Injection succeeded -- got rows from projects {project_ids_returned}."
    )

def test_search_tasks_still_works_with_real_data():
    """Uses a real row containing a SQL-meaningful character: "O'Brien's task with an apostrophe".
    Built from an actual row in the target database, not a hardcoded guess."""
    from tasks_search import search_tasks

    project_id = '3'
    query_substr = "O'Brien's"
    rows = search_tasks(project_id, query_substr)
    titles = [row[1] for row in rows]
    assert any(query_substr in t for t in titles), (
        f"Legitimate search for {query_substr} returned nothing -- got {titles}."
    )
