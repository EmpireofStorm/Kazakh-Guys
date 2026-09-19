"""
Deterministic fixer for CWE-798 hardcoded secrets. Unlike SQL injection,
this genuinely is the "token swap" case from the reliability research:
replace a literal string with an os.environ[...] lookup, no data-flow
reasoning required. Kept as a separate, smaller module rather than bolted
onto fix_sqli.py -- these are different vulnerability classes with
different rewrite logic, and conflating them in one file would make both
harder to reason about.
"""
import ast


def fix_file(file_path):
    """Returns True if a hardcoded secret assignment was found and fixed."""
    with open(file_path) as f:
        source = f.read()
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    fixed_anything = False
    has_os_import = any(
        isinstance(n, ast.Import) and any(a.name == "os" for a in n.names)
        for n in ast.walk(tree)
    )

    for node in ast.walk(tree):
        if not (isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant)
                and isinstance(node.value.value, str)):
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        name = target.id
        if not any(name.upper().endswith(suffix) for suffix in
                    ("_API_KEY", "_SECRET", "_SECRET_KEY", "_TOKEN", "_PASSWORD", "_PASSWD")):
            continue
        if node.value.value == "":
            continue  # an empty-string default isn't a leaked secret

        indent = " " * node.col_offset
        lines[node.lineno - 1] = f'{indent}{name} = os.environ["{name}"]\n'
        fixed_anything = True

    if fixed_anything and not has_os_import:
        lines.insert(0, "import os\n")

    if fixed_anything:
        with open(file_path, "w") as f:
            f.writelines(lines)
    return fixed_anything
