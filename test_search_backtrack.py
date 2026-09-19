"""
Everything else tests search.py against the REAL sample app, where there
happens to be no organic conflict. This file exists specifically to prove
the backtrack/escalate path actually fires when a real regression exists
-- not just that it's designed to, on paper.

Scenario: a dependent module has a test that checks the LITERAL SQL text
sent to execute() (a real, if discouraged, pattern -- some codebases do
assert on exact query strings). Parameterizing the query changes that
text, so this dependent test genuinely regresses when the fix is applied
-- a real conflict, not a contrived assertion failure.
"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from search import resolve_finding


def build_scenario():
    tmp = tempfile.mkdtemp()
    app_dir = os.path.join(tmp, "app")
    os.makedirs(app_dir)

    with open(os.path.join(app_dir, "items.py"), "w") as f:
        f.write(
            "class FakeCursor:\n"
            "    last_sql = None\n"
            "    def execute(self, sql, params=None):\n"
            "        FakeCursor.last_sql = sql\n"
            "    def fetchall(self):\n"
            "        return []\n\n"
            "def get_item(item_id):\n"
            "    cur = FakeCursor()\n"
            "    sql = \"SELECT * FROM items WHERE id = \" + item_id\n"
            "    cur.execute(sql)\n"
            "    return cur.fetchall()\n"
        )

    with open(os.path.join(app_dir, "reporter.py"), "w") as f:
        f.write(
            "from items import get_item, FakeCursor\n\n"
            "def run_report(item_id):\n"
            "    return get_item(item_id)\n"
        )

    os.makedirs(os.path.join(tmp, "tests"))
    with open(os.path.join(tmp, "tests", "test_reporter_dependent.py"), "w") as f:
        f.write(
            "import sys, os\n"
            "sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))\n"
            "from reporter import run_report\n"
            "from items import FakeCursor\n\n"
            "def test_reporter_relies_on_exact_query_shape():\n"
            "    run_report('42')\n"
            "    # Over-specified on purpose: checks literal SQL text, not just\n"
            "    # behavior. Realistic, if discouraged -- and exactly what breaks\n"
            "    # when the query gets parameterized.\n"
            "    assert FakeCursor.last_sql == 'SELECT * FROM items WHERE id = 42'\n"
        )
    with open(os.path.join(tmp, "tests", "test_items_security.py"), "w") as f:
        f.write(
            "import sys, os\n"
            "sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))\n"
            "from items import get_item\n\n"
            "def test_get_item_runs():\n"
            "    get_item('42')  # smoke test -- just confirms it still runs\n"
        )

    # search.py's run_pytest shells out to ./venv/bin/python -- give this
    # scenario its own venv-shaped path by symlinking the real one in.
    os.symlink(
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "venv"),
        os.path.join(tmp, "venv"),
    )
    return tmp, app_dir


def test_backtrack_engages_on_real_dependent_regression():
    tmp, app_dir = build_scenario()
    cwd = os.getcwd()
    os.chdir(tmp)
    try:
        result = resolve_finding(
            file_path=os.path.join("app", "items.py"),
            category="sql-injection",
            module_name="items",
            own_test_path=os.path.join("tests", "test_items_security.py"),
            dependent_test_paths={"reporter": os.path.join("tests", "test_reporter_dependent.py")},
            max_candidates=2,
        )
    finally:
        os.chdir(cwd)
        shutil.rmtree(tmp)

    # No API key in this sandbox, so candidate 2 (LLM) correctly can't run
    # -- the real, honest outcome is backtrack-and-escalate, not a fake
    # success. That IS the thing being proven: attempt 1 gets tried,
    # the regression gets caught, the file gets reverted, candidate 2 gets
    # attempted and correctly fails without a key, and the search reports
    # exactly that instead of silently giving up or crashing.
    assert result["backtracked"] is True
    assert any("CONFLICT" in line and "reporter" in line for line in result["log"])
    assert any("Attempt 2" in line for line in result["log"])
    assert result["resolved"] is False
    assert "no further candidates" in result["reason"]
