"""
Step 4: the deterministic fix, not an LLM patch.

Per the CWE-stratified reliability finding (LLMs get SQL injection fixes
conceptually right but botch the data-flow-dependent implementation), this
walks the actual concatenation chain in the AST and mechanically produces a
parameterized query -- no model call involved for this pattern.

Handles two shapes found by flattening the `+` chain into an ordered list
of literal segments and variables:
  1. A variable embedded directly between literals -> becomes one `?`
     placeholder, the variable passed straight through as a parameter.
  2. A variable wrapped in a SQL LIKE wildcard idiom, e.g.
     "...LIKE '%" + var + "%'" -> recognized as ONE parameter slot; the
     wildcard characters move from the SQL text into the parameter value
     itself (f"%{var}%"), because a `?` cannot sit inside a quoted literal.
This second case is exactly the kind of idiom a naive token-level rewrite
gets wrong -- it has to be special-cased, and any concatenation shape this
script doesn't recognize should fall back to LLM-assisted generation with
extra scrutiny, per CLAUDE.md 5.2.3, rather than being silently mishandled.

Known limitation: this rewrites the matched lines as text, not via
ast.unparse of the whole file, specifically to avoid reformatting or
dropping comments elsewhere in the file. A production version should use a
concrete-syntax-tree library (e.g. LibCST for Python) instead of raw line
replacement for exact-formatting-preserving edits at scale.
"""
import ast
import json


def flatten_add_chain(node):
    """Flatten a left-associated chain of `a + b + c + ...` into an
    ordered list of leaf AST nodes."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return flatten_add_chain(node.left) + flatten_add_chain(node.right)
    return [node]


def build_parameterized_query(leaves):
    """Walk the flattened leaves, merging the LIKE-wildcard idiom, and
    return (new_sql_template, [param_source_expressions])."""
    sql_parts = []
    params = []
    i = 0
    while i < len(leaves):
        leaf = leaves[i]
        if isinstance(leaf, ast.Constant) and isinstance(leaf.value, str):
            sql_parts.append(leaf.value)
            i += 1
            continue

        # Non-literal leaf -- a value that needs to become a parameter.
        prev_literal = sql_parts[-1] if sql_parts and isinstance(sql_parts[-1], str) else ""
        next_leaf = leaves[i + 1] if i + 1 < len(leaves) else None
        next_literal = (
            next_leaf.value
            if isinstance(next_leaf, ast.Constant) and isinstance(next_leaf.value, str)
            else ""
        )

        if prev_literal.endswith("'%") and next_literal.startswith("%'"):
            # LIKE-wildcard idiom: strip the trailing/leading wildcard+quote
            # from the surrounding literals, emit one placeholder, and move
            # the wildcards into the parameter value itself.
            sql_parts[-1] = prev_literal[:-2] + "?"
            leaves[i + 1] = ast.Constant(value=next_literal[2:])
            params.append(("like_wrap", leaf))
            i += 1
        elif prev_literal.endswith("'") and next_literal.startswith("'") and not prev_literal.endswith("''"):
            # Plain quote-wrapped value, no wildcards (e.g. status = '<value>').
            # A bare "?" cannot sit inside quote marks, so the quotes must be
            # stripped here too -- the same underlying problem as the
            # LIKE-wildcard case, just without the extra "%" characters. This
            # was found by testing against a second real function, not
            # anticipated in advance; it previously fell through to the
            # "plain" branch below and silently left a broken '?' in the SQL.
            sql_parts[-1] = prev_literal[:-1] + "?"
            leaves[i + 1] = ast.Constant(value=next_literal[1:])
            params.append(("plain", leaf))
            i += 1
        else:
            sql_parts.append("?")
            params.append(("plain", leaf))
            i += 1

    new_sql = "".join(sql_parts)
    return new_sql, params


def source_of(node, source_lines):
    """Best-effort: reconstruct the source text of a simple Name node."""
    if isinstance(node, ast.Name):
        return node.id
    return ast.unparse(node)


def fix_file(file_path):
    """Returns True if a concatenation-based pattern was found and fixed,
    False if this file has no pattern this deterministic rewriter
    recognizes (e.g. .format()-based building) -- callers must treat False
    as 'needs escalation', not 'nothing was wrong'."""
    with open(file_path) as f:
        source = f.read()
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    fixed_anything = False

    for node in ast.walk(tree):
        # Find: <name> = <concatenation chain>
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.BinOp):
            sql_var = node.targets[0].id if isinstance(node.targets[0], ast.Name) else None
            if not sql_var:
                continue
            leaves = flatten_add_chain(node.value)
            if not any(not isinstance(l, ast.Constant) for l in leaves):
                continue  # pure literal concatenation, nothing tainted

            new_sql, params = build_parameterized_query(leaves)
            param_exprs = []
            for kind, leaf in params:
                name = source_of(leaf, lines)
                param_exprs.append(f'f"%{{{name}}}%"' if kind == "like_wrap" else name)

            # Find a matching execute(sql_var) call FIRST. Only if one
            # actually exists does this get treated as a query-building
            # site at all -- a string built with + that never reaches
            # .execute() (a log message, an error string, anything else)
            # must be left completely alone.
            matching_call = None
            for call_node in ast.walk(tree):
                if (
                    isinstance(call_node, ast.Call)
                    and isinstance(call_node.func, ast.Attribute)
                    and call_node.func.attr == "execute"
                    and len(call_node.args) == 1
                    and isinstance(call_node.args[0], ast.Name)
                    and call_node.args[0].id == sql_var
                ):
                    matching_call = call_node
                    break
            if matching_call is None:
                continue

            indent = " " * node.col_offset
            new_assign_line = f'{indent}{sql_var} = "{new_sql}"\n'
            cur_name = source_of(matching_call.func.value, lines)
            call_indent = " " * matching_call.col_offset
            new_call_line = (
                f"{call_indent}{cur_name}.execute({sql_var}, "
                f"({', '.join(param_exprs)}{',' if len(param_exprs) == 1 else ''}))\n"
            )
            lines[matching_call.lineno - 1] = new_call_line
            lines[node.lineno - 1] = new_assign_line
            fixed_anything = True

    if fixed_anything:
        with open(file_path, "w") as f:
            f.writelines(lines)
    return fixed_anything


def fix_from_scan(scan_results_path):
    """Runs the deterministic fixer across every file Semgrep flagged and
    reports, per file, whether it was actually fixed or needs escalation to
    an LLM (or a human) -- this is the real behavior of the 'unsupported
    pattern' path, not a hypothetical."""
    with open(scan_results_path) as f:
        scan = json.load(f)

    files = sorted({r["path"] for r in scan["results"]})
    fixed, needs_escalation = [], []
    for path in files:
        if fix_file(path):
            fixed.append(path)
        else:
            needs_escalation.append(path)

    print(f"Deterministically fixed: {fixed}")
    print(f"Needs escalation (pattern not recognized -- LLM fallback per CLAUDE.md 5.2.3): {needs_escalation}")
    return {"fixed": fixed, "needs_escalation": needs_escalation}


if __name__ == "__main__":
    fix_from_scan("scan_results.json")
