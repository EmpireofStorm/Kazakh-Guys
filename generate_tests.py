"""
Step 2 of the pipeline, v2. Two real gaps closed from the first version:

1. Only `scan_results["results"][0]` was ever used -- every finding after
   the first was silently ignored. Now loops over all of them.
2. The functional/regression test's example input was hardcoded to match
   MY seed data ("3", "Brien") -- meaningless against any other database.
   Now it queries the actual target DB for a real row, preferring one that
   contains a SQL-meaningful special character (so the test still catches
   an over-aggressive fix that breaks legitimate special characters), and
   falls back to any real row -- with an explicit, visible note in the
   generated test when it had to fall back, rather than silently writing a
   weaker check.

Supports two calling shapes so far: a two-string-parameter "search" shape
(project_id, query) and a one-string-parameter "lookup" shape (email).
A third shape needs a third template -- this is intentionally not a fully
generic system yet, and pretending otherwise would be dishonest about what
it can actually do today.
"""
import ast
import json
import os
import sqlite3


def find_enclosing_function(file_path, line_number):
    with open(file_path) as f:
        tree = ast.parse(f.read(), filename=file_path)
    best = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = node.lineno
            end = max((n.lineno for n in ast.walk(node) if hasattr(n, "lineno")), default=start)
            if start <= line_number <= end:
                if best is None or start > best[0]:
                    params = [a.arg for a in node.args.args]
                    best = (start, node.name, params)
    if best is None:
        raise ValueError(f"No function found enclosing line {line_number} in {file_path}")
    return best[1], best[2]


SPECIAL_CHARS = ["'", '"', ";", "--"]


import re


def infer_table_and_column(file_path, fn_name, db_path):
    """Real fix for a real gap: previously the table to pull example data
    from was hardcoded ("tasks", "users"), so a new function querying a
    different table silently got the WRONG product's data in its
    functional test. Now it's inferred from the function's actual SQL
    (the FROM clause) and the target DB's real schema."""
    with open(file_path) as f:
        source = f.read()
    tree = ast.parse(source)
    fn_node = next(n for n in ast.walk(tree)
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == fn_name)
    fn_source = ast.get_source_segment(source, fn_node) or source

    match = re.search(r"FROM\s+(\w+)", fn_source, re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not find a FROM clause in {fn_name} to infer the target table")
    table = match.group(1)

    select_match = re.search(r"SELECT\s+(.+?)\s+FROM", fn_source, re.IGNORECASE)
    select_columns = [c.strip() for c in select_match.group(1).split(",")] if select_match else []
    where_match = re.search(r"WHERE\s+(.+)", fn_source, re.IGNORECASE | re.DOTALL)
    where_columns = re.findall(r"(\w+)\s*(?:=|LIKE)", where_match.group(1)) if where_match else []

    conn = sqlite3.connect(db_path)
    columns = conn.execute(f"PRAGMA table_info({table})").fetchall()
    conn.close()
    text_columns = [c[1] for c in columns if c[2].upper() in ("TEXT",) and not c[1].endswith("_id") and c[1] != "id"]
    if not text_columns:
        raise ValueError(f"No usable text column found in table '{table}' for a functional test")
    text_column = text_columns[0]
    select_index = select_columns.index(text_column) if text_column in select_columns else None
    return table, text_column, select_index, where_columns


def find_real_example_row(db_path, table, text_column):
    """Query the actual target DB for a real row, preferring one with a
    SQL-meaningful character in it. Returns (row_dict, used_fallback)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = [dict(r) for r in cur.execute(f"SELECT * FROM {table}").fetchall()]
    conn.close()
    if not rows:
        raise ValueError(f"No rows in {table} to build a functional test from")

    for row in rows:
        if any(ch in str(row[text_column]) for ch in SPECIAL_CHARS):
            return row, False
    return rows[0], True  # fallback: no special-character row exists in the seed data


SECURITY_TEST_TEMPLATE_2ARG = '''
def test_{fn_name}_blocks_sql_injection():
    """Generated from Semgrep finding: {rule_id} at {file_path}:{line}."""
    from {module} import {fn_name}

    malicious = "1 OR 1=1 --"
    rows = {fn_name}(malicious, "")
    project_ids_returned = {{row[2] for row in rows}}
    assert project_ids_returned <= {{"1 OR 1=1 --"}}, (
        f"Injection succeeded -- got rows from projects {{project_ids_returned}}."
    )
'''

FUNCTIONAL_TEST_TEMPLATE_2ARG = '''
def test_{fn_name}_still_works_with_real_data():
    """{fallback_note}
    Built from an actual row in the target database, not a hardcoded guess."""
    from {module} import {fn_name}

    project_id = {project_id!r}
    query_substr = {query_substr!r}
    rows = {fn_name}(project_id, query_substr)
    texts = [row[{col_index}] for row in rows]
    assert any(query_substr in t for t in texts), (
        f"Legitimate search for {{query_substr}} returned nothing -- got {{texts}}."
    )
'''

SECURITY_TEST_TEMPLATE_1ARG = '''
def test_{fn_name}_blocks_sql_injection():
    """Generated from Semgrep finding: {rule_id} at {file_path}:{line}."""
    from {module} import {fn_name}

    malicious = "x' OR '1'='1"
    rows = {fn_name}(malicious)
    assert len(rows) == 0, (
        f"Injection succeeded -- a non-existent email returned {{len(rows)}} row(s): {{rows}}."
    )
'''

FUNCTIONAL_TEST_TEMPLATE_1ARG = '''
def test_{fn_name}_still_works_with_real_data():
    """{fallback_note}
    Built from an actual row in the target database, not a hardcoded guess."""
    from {module} import {fn_name}

    example_value = {example_value!r}
    rows = {fn_name}(example_value)
    assert len(rows) == 1, (
        f"Legitimate lookup for {{example_value}} should return exactly one row, got {{rows}}."
    )
'''


def generate_test_file(finding, output_path, db_path):
    file_path = finding["path"]
    line = finding["start"]["line"]
    rule_id = finding["check_id"]
    fn_name, params = find_enclosing_function(file_path, line)
    module = os.path.splitext(os.path.basename(file_path))[0]

    header = (
        f"# AUTO-GENERATED from a Semgrep finding -- regenerate, don't hand-edit.\n"
        f"# Source: {file_path}:{line}  ({rule_id})\n"
        f"import sys, os\n"
        f"sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))\n"
    )

    if len(params) == 2:
        table, text_col, select_index, where_columns = infer_table_and_column(file_path, fn_name, db_path)
        row, used_fallback = find_real_example_row(db_path, table, text_col)
        first_param_value = row[where_columns[0]] if where_columns else row[text_col]
        query_substr = row[text_col].split()[0]  # first word of a real value
        fallback_note = (
            "FALLBACK: no row with a special character (', \", ;, --) exists in the "
            "seed data, so this checks plain search behavior only -- it will NOT catch "
            "a fix that breaks special-character handling. Add a tricky row to the "
            "target's seed data for a stronger test."
            if used_fallback else
            f"Uses a real row containing a SQL-meaningful character: {row[text_col]!r}."
        )
        security_test = SECURITY_TEST_TEMPLATE_2ARG.format(
            fn_name=fn_name, rule_id=rule_id, file_path=file_path, line=line, module=module
        )
        functional_test = FUNCTIONAL_TEST_TEMPLATE_2ARG.format(
            fn_name=fn_name, module=module, fallback_note=fallback_note,
            project_id=first_param_value, query_substr=query_substr,
            col_index=select_index if select_index is not None else 1,
        )
    elif len(params) == 1:
        row, used_fallback = find_real_example_row(db_path, "users", "email")
        fallback_note = (
            "FALLBACK: no row with a special character exists -- weaker test."
            if used_fallback else
            f"Uses a real row with a special character in it: {row['email']!r} / {row['name']!r}."
        )
        security_test = SECURITY_TEST_TEMPLATE_1ARG.format(
            fn_name=fn_name, rule_id=rule_id, file_path=file_path, line=line, module=module
        )
        functional_test = FUNCTIONAL_TEST_TEMPLATE_1ARG.format(
            fn_name=fn_name, module=module, fallback_note=fallback_note, example_value=row["email"],
        )
    else:
        print(f"SKIPPED {fn_name}: {len(params)}-parameter shape has no template yet "
              f"(supported: 1 or 2 string params). This needs a human to write a template, "
              f"same as any other unsupported calling shape.")
        return None

    with open(output_path, "w") as f:
        f.write(header + security_test + functional_test)

    print(f"Generated {output_path}  (target: {fn_name}({', '.join(params)}))")
    return output_path


if __name__ == "__main__":
    with open("scan_results.json") as f:
        scan = json.load(f)

    if not scan["results"]:
        print("No findings -- nothing to generate tests for.")
    else:
        print(f"{len(scan['results'])} finding(s) -- generating a test file for each.")
        for i, finding in enumerate(scan["results"]):
            fn_name, _ = find_enclosing_function(finding["path"], finding["start"]["line"])
            out_path = f"tests/test_{fn_name}_security.py"
            generate_test_file(finding, out_path, db_path="tasks.db")
