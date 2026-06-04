"""Build a dependency graph of the ingested code: which file imports which.

Nodes are files; an edge file A -> file B means A imports something defined in B (only
edges between files that are both in the repo are kept). Works from the chunks already in
the store, so no re-reading of the original repo is needed.
"""

import os
import re
from collections.abc import Iterable

from app.store.chroma_store import ChromaStore

# Python: `from x.y import z` or `import x.y`.
_PY_FROM = re.compile(r"^\s*from\s+([\w.]+)\s+import", re.MULTILINE)
_PY_IMPORT = re.compile(r"^\s*import\s+([\w.]+)", re.MULTILINE)
# JS/TS: `from "x"` or `require("x")`.
_JS_FROM = re.compile(r"""(?:from|require\(\s*)\s*["']([^"']+)["']""")


def _resolve_python(module: str, known: set[str]) -> str | None:
    """Map a dotted Python module to a known file, dropping leading package segments."""
    parts = module.split(".")
    for start in range(len(parts)):
        candidate = "/".join(parts[start:])
        for suffix in (".py", "/__init__.py"):
            if candidate + suffix in known:
                return candidate + suffix
    return None


def _resolve_relative(spec: str, importer: str, known: set[str]) -> str | None:
    """Map a relative JS/TS import (./x, ../y) from the importing file to a known file."""
    if not spec.startswith("."):
        return None
    target = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    for suffix in ("", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"):
        if target + suffix in known:
            return target + suffix
    return None


def _imports_in(code: str) -> Iterable[str]:
    """Yield every imported module/path token found in a file's code."""
    yield from _PY_FROM.findall(code)
    yield from _PY_IMPORT.findall(code)
    yield from _JS_FROM.findall(code)


def build_import_graph(store: ChromaStore) -> dict:
    """Return {nodes, edges} describing internal imports between the repo's files."""
    data = store.all_chunks()
    documents = data.get("documents", []) or []
    metadatas = data.get("metadatas", []) or []

    # Stitch each file's chunks back together so we can scan all of its imports.
    code_by_file: dict[str, list[str]] = {}
    lang_by_file: dict[str, str] = {}
    for doc, meta in zip(documents, metadatas, strict=False):
        path = meta["file_path"]
        code_by_file.setdefault(path, []).append(doc)
        lang_by_file[path] = meta.get("language", "")
    files = {path: "\n".join(parts) for path, parts in code_by_file.items()}
    known = set(files)

    edges: set[tuple[str, str]] = set()
    for path, code in files.items():
        for spec in _imports_in(code):
            target = _resolve_python(spec, known) or _resolve_relative(spec, path, known)
            if target and target != path:
                edges.add((path, target))

    nodes = [
        {"id": path, "label": os.path.basename(path), "language": lang_by_file.get(path, "")}
        for path in sorted(files)
    ]
    return {
        "nodes": nodes,
        "edges": [{"source": s, "target": t} for s, t in sorted(edges)],
    }
