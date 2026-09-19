"""
Regression tests for fix_sqli.py itself -- NOT the generated target-app
tests (those live in tests/ and test whatever app the pipeline points at).
This is the gap that was flagged as open: every previous check of the
rewriter was me running it once and reading the output. This is what
should catch it automatically if a future change breaks a case that
currently works.

Run with: pytest dev_tests/ -v
"""
import ast
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fix_sqli import fix_file, flatten_add_chain, build_parameterized_query


def write_temp(source):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False)
    f.write(source)
    f.close()
    return f.name


def test_fixes_like_wildcard_idiom():
    """The exact case that shipped: LIKE '%...%' must move the wildcards
    into the parameter, not leave a ? sitting inside a quoted literal."""
    path = write_temp(
        'def f(a, b):\n'
        '    sql = "SELECT * FROM t WHERE a = " + a + " AND c LIKE \'%" + b + "%\'"\n'
        '    cur.execute(sql)\n'
    )
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is True
    assert "?" in result and "LIKE ?" in result
    assert 'f"%{b}%"' in result
    ast.parse(result)  # must still be valid Python


def test_fixes_plain_concatenation_no_wildcard():
    path = write_temp(
        'def f(uid):\n'
        '    sql = "SELECT * FROM users WHERE id = " + uid\n'
        '    cur.execute(sql)\n'
    )
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is True
    assert "cur.execute(sql, (uid,))" in result
    ast.parse(result)


def test_three_variable_chain():
    """Untested edge case flagged last time: more than two variables in
    one concatenation chain."""
    path = write_temp(
        'def f(a, b, c):\n'
        '    sql = "X " + a + " Y " + b + " Z " + c\n'
        '    cur.execute(sql)\n'
    )
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is True
    assert result.count("?") == 3
    ast.parse(result)


def test_declines_format_pattern_without_mangling():
    """The real proof from last session, now pinned as a permanent
    regression test instead of a one-off manual check."""
    original = (
        'def f(email):\n'
        '    sql = "SELECT * FROM users WHERE email = \'{}\'".format(email)\n'
        '    cur.execute(sql)\n'
    )
    path = write_temp(original)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == original, "File must be byte-for-byte unchanged when the rewriter declines"


def test_ignores_pure_literal_concatenation():
    """A concatenation with no variable at all isn't a vulnerability --
    must not be touched or miscounted as a taint source."""
    original = (
        'def f():\n'
        '    sql = "SELECT * " + "FROM users"\n'
        '    cur.execute(sql)\n'
    )
    path = write_temp(original)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == original


def test_idempotent_on_already_fixed_code():
    """Running the fixer on already-parameterized code must be a safe
    no-op, not a false-positive rewrite -- important once this runs
    automatically on every commit, not just once by hand."""
    already_fixed = (
        'def f(uid):\n'
        '    sql = "SELECT * FROM users WHERE id = ?"\n'
        '    cur.execute(sql, (uid,))\n'
    )
    path = write_temp(already_fixed)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == already_fixed


def test_concatenation_not_feeding_execute_is_ignored():
    """A string built with + that goes into logging, not a query, must
    not be treated as a SQL injection site."""
    original = (
        'def f(name):\n'
        '    message = "Hello " + name\n'
        '    logger.info(message)\n'
    )
    path = write_temp(original)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == original


def test_flatten_add_chain_order_preserved():
    """Unit-level check on the core algorithm: leaves must come out in
    left-to-right source order, not reordered."""
    tree = ast.parse('"a" + b + "c" + d + "e"', mode="eval")
    leaves = flatten_add_chain(tree.body)
    kinds = [
        leaf.value if isinstance(leaf, ast.Constant) else leaf.id
        for leaf in leaves
    ]
    assert kinds == ["a", "b", "c", "d", "e"]
