"""
Real dependency graph, extracted by parsing actual imports -- not a
hand-authored mapping. This is what "which files does a fix's blast radius
touch" means for real, as opposed to the frontend's scripted node lists.

Only handles same-package `from X import Y` and `import X` where X is
another module in the same directory -- external packages (sqlite3,
stripe) are correctly not treated as internal dependents of anything.
"""
import ast
import os


def build_import_graph(app_dir):
    """Returns {module_name: set(module_names it depends on)} for every
    .py file in app_dir, using only real modules present in that directory
    -- an import of an external package is not a graph edge."""
    local_modules = {
        os.path.splitext(f)[0] for f in os.listdir(app_dir) if f.endswith(".py")
    }
    graph = {m: set() for m in local_modules}

    for fname in os.listdir(app_dir):
        if not fname.endswith(".py"):
            continue
        module_name = os.path.splitext(fname)[0]
        with open(os.path.join(app_dir, fname)) as f:
            tree = ast.parse(f.read(), filename=fname)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in local_modules:
                graph[module_name].add(node.module)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in local_modules:
                        graph[module_name].add(alias.name)
    return graph


def get_dependents(module_name, graph):
    """Reverse lookup: which modules depend ON this one (i.e. would be
    affected if this module's public behavior changes)."""
    return sorted(m for m, deps in graph.items() if module_name in deps)
