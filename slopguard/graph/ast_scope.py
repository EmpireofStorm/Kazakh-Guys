"""Python AST import/call graph for blast-radius scoping."""

from __future__ import annotations

import ast
from collections import defaultdict
from pathlib import Path
from typing import Iterable


def _module_name(root: Path, path: Path) -> str:
    rel = path.resolve().relative_to(root.resolve())
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def _iter_py_files(root: Path) -> Iterable[Path]:
    skip = {".venv", "venv", "__pycache__", ".git", "node_modules", ".pytest_cache"}
    for path in root.rglob("*.py"):
        if any(part in skip for part in path.parts):
            continue
        yield path


class _ModuleIndex:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.file_to_module: dict[str, str] = {}
        self.module_to_file: dict[str, str] = {}
        self.functions: dict[str, set[str]] = defaultdict(set)
        # file -> local_name -> fully-qualified import target (module or module.attr)
        self.imports: dict[str, dict[str, str]] = defaultdict(dict)
        self.calls: list[tuple[str, str, str, str]] = []

        for path in _iter_py_files(self.root):
            self._index_file(path)

    def _index_file(self, path: Path) -> None:
        file_key = str(path.resolve())
        mod = _module_name(self.root, path)
        self.file_to_module[file_key] = mod
        self.module_to_file[mod] = file_key

        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=file_key)
        except (OSError, SyntaxError):
            return

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.functions[file_key].add(node.name)
            elif isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        self.functions[file_key].add(f"{node.name}.{item.name}")

        for node in tree.body:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    local = alias.asname or alias.name.split(".")[0]
                    self.imports[file_key][local] = alias.name
            elif isinstance(node, ast.ImportFrom) and node.module:
                base = self._resolve_from_module(mod, path, node.module, node.level)
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    local = alias.asname or alias.name
                    self.imports[file_key][local] = f"{base}.{alias.name}"

        self._index_calls(file_key, tree)

    def _resolve_from_module(
        self, current_mod: str, path: Path, module: str, level: int
    ) -> str:
        if level == 0:
            return module
        parts = current_mod.split(".") if current_mod else []
        if path.name != "__init__.py" and parts:
            parts = parts[:-1]
        if level > 1:
            parts = parts[: max(0, len(parts) - (level - 1))]
        return ".".join([*parts, module]) if module else ".".join(parts)

    def resolve_symbol(self, file_key: str, name: str) -> tuple[str, str] | None:
        """Map a name used in file_key to (callee_file, callee_func_or_module)."""
        if name in self.functions.get(file_key, set()):
            return file_key, name

        target = self.imports[file_key].get(name)
        if not target:
            return None

        # Exact module import: import app.db as db → target app.db
        if target in self.module_to_file:
            return self.module_to_file[target], "<module>"

        parts = target.split(".")
        # app.db.search_users → module app.db, attr search_users
        for i in range(len(parts) - 1, 0, -1):
            mod = ".".join(parts[:i])
            attr = parts[i]
            mod_file = self.module_to_file.get(mod)
            if not mod_file:
                continue
            if attr in self.functions.get(mod_file, set()):
                return mod_file, attr
            return mod_file, attr
        return None

    def _index_calls(self, file_key: str, tree: ast.AST) -> None:
        outer = self

        class Visitor(ast.NodeVisitor):
            def __init__(self) -> None:
                self.stack: list[str] = []

            def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
                self.stack.append(node.name)
                self.generic_visit(node)
                self.stack.pop()

            def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
                self.visit_FunctionDef(node)  # type: ignore[arg-type]

            def visit_Call(self, node: ast.Call) -> None:
                caller = self.stack[-1] if self.stack else "<module>"
                resolved = self._resolve_call(node.func)
                if resolved:
                    outer.calls.append((file_key, caller, resolved[0], resolved[1]))
                self.generic_visit(node)

            def _resolve_call(self, func: ast.AST) -> tuple[str, str] | None:
                if isinstance(func, ast.Name):
                    return outer.resolve_symbol(file_key, func.id)
                if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
                    base = outer.imports[file_key].get(func.value.id)
                    if not base:
                        return None
                    mod_file = outer.module_to_file.get(base)
                    if mod_file and func.attr in outer.functions.get(mod_file, set()):
                        return mod_file, func.attr
                return None

        Visitor().visit(tree)


def _nearest_function(path: Path, line: int) -> str | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError):
        return None
    enclosing: str | None = None
    best_before: tuple[int, str] | None = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = getattr(node, "lineno", 0)
            end = getattr(node, "end_lineno", start) or start
            if start <= line <= end:
                enclosing = node.name
            elif start <= line and (best_before is None or start > best_before[0]):
                best_before = (start, node.name)
    return enclosing or (best_before[1] if best_before else None)


def build_blast_radius(
    project_root: Path,
    seed_file: Path,
    seed_line: int,
    *,
    depth: int = 2,
) -> dict:
    root = project_root.resolve()
    seed_file = seed_file.resolve()
    index = _ModuleIndex(root)

    seed_file_key = str(seed_file)
    seed_name = _nearest_function(seed_file, seed_line) or Path(seed_file).stem
    seed_id = f"{seed_file_key}::{seed_name}"

    callers_of: dict[str, set[str]] = defaultdict(set)
    callees_of: dict[str, set[str]] = defaultdict(set)
    for caller_file, caller_func, callee_file, callee_name in index.calls:
        caller_id = f"{caller_file}::{caller_func}"
        callee_id = f"{callee_file}::{callee_name}"
        callers_of[callee_id].add(caller_id)
        callees_of[caller_id].add(callee_id)

    nodes: dict[str, dict] = {
        seed_id: {
            "id": seed_id,
            "file": seed_file_key,
            "name": seed_name,
            "role": "seed",
        }
    }
    edges: list[dict] = []

    # Walk callers upward (blast radius / entrypoints).
    frontier = {seed_id}
    visited = {seed_id}
    for _ in range(max(1, depth)):
        nxt: set[str] = set()
        for node_id in frontier:
            for caller in callers_of.get(node_id, set()):
                if caller not in nodes:
                    c_file, c_name = caller.split("::", 1)
                    nodes[caller] = {
                        "id": caller,
                        "file": c_file,
                        "name": c_name,
                        "role": "caller",
                    }
                edges.append({"from": caller, "to": node_id, "relation": "calls"})
                if caller not in visited:
                    nxt.add(caller)
                    visited.add(caller)
        frontier = nxt

    # One hop of callees from the seed only (dependencies, not sibling fan-in).
    for callee in callees_of.get(seed_id, set()):
        if callee not in nodes:
            c_file, c_name = callee.split("::", 1)
            nodes[callee] = {
                "id": callee,
                "file": c_file,
                "name": c_name,
                "role": "callee",
            }
        edges.append({"from": seed_id, "to": callee, "relation": "calls"})

    # Import edges from seed file (helps when finding is a secret in config).
    for local in index.imports.get(seed_file_key, {}):
        resolved = index.resolve_symbol(seed_file_key, local)
        if not resolved:
            continue
        c_file, c_name = resolved
        nid = f"{c_file}::{c_name}"
        if nid == seed_id:
            continue
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "file": c_file,
                "name": c_name,
                "role": "import",
            }
        edges.append({"from": seed_id, "to": nid, "relation": "imports"})

    # Who imports the seed module? (inbound module use)
    seed_mod = index.file_to_module.get(seed_file_key)
    if seed_mod:
        for file_key, mapping in index.imports.items():
            for local, target in mapping.items():
                if target == seed_mod or target.startswith(seed_mod + "."):
                    # Prefer function that references this import if we have calls;
                    # otherwise module-level node.
                    importer = f"{file_key}::<module>"
                    if importer not in nodes and file_key != seed_file_key:
                        nodes[importer] = {
                            "id": importer,
                            "file": file_key,
                            "name": Path(file_key).stem,
                            "role": "importer",
                        }
                        edges.append(
                            {
                                "from": importer,
                                "to": seed_id,
                                "relation": "imports",
                            }
                        )

    seen_e: set[tuple[str, str, str]] = set()
    uniq_edges: list[dict] = []
    for e in edges:
        key = (e["from"], e["to"], e["relation"])
        if key in seen_e:
            continue
        seen_e.add(key)
        uniq_edges.append(e)

    node_list = list(nodes.values())
    return {
        "engine": "ast",
        "seed": {"file": seed_file_key, "name": seed_name, "line": seed_line},
        "nodes": node_list,
        "edges": uniq_edges,
        "why": _why(seed_name, node_list),
    }


def _why(seed_name: str, nodes: list[dict]) -> str:
    callers = [n["name"] for n in nodes if n.get("role") == "caller"]
    if callers:
        return (
            f"Finding in `{seed_name}` is reachable from {', '.join(sorted(set(callers)))} "
            "— a change here can impact those entrypoints."
        )
    others = [n["name"] for n in nodes if n.get("role") != "seed"]
    if others:
        return (
            f"Finding in `{seed_name}` is connected to "
            f"{', '.join(sorted(set(others)))} in the import/call graph."
        )
    return f"Finding centered on `{seed_name}`; no neighbors found within depth."
