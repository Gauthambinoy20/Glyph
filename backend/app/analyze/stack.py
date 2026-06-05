"""Detect the real frameworks/libraries the repo uses, from its import statements.

Works from the chunks already in the store (no re-reading the repo). For each file we collect
its imports, keep only the *external* top-level packages (not the Python stdlib, not another
file in the repo), map well-known packages to a friendly name, and count how many files use
each — so the panel shows the actual stack (FastAPI, React, Chroma, ...) instead of just the
languages. Only recognised packages are reported, so nothing shown is a guess.
"""

from app.analyze.graph import _imports_in
from app.store.chroma_store import ChromaStore

# Top-level import token -> friendly framework/library name. Curated so the panel never shows a
# guessed dependency; react and react-dom both fold into "React".
_KNOWN: dict[str, str] = {
    # Python — web / API
    "fastapi": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "starlette": "Starlette",
    "uvicorn": "Uvicorn",
    "pydantic": "Pydantic",
    "click": "Click",
    "typer": "Typer",
    # Python — data / ML / infra
    "chromadb": "Chroma",
    "sqlalchemy": "SQLAlchemy",
    "sqlmodel": "SQLModel",
    "numpy": "NumPy",
    "pandas": "pandas",
    "torch": "PyTorch",
    "tensorflow": "TensorFlow",
    "sklearn": "scikit-learn",
    "fastembed": "fastembed",
    "model2vec": "Model2Vec",
    "openai": "OpenAI",
    "transformers": "Transformers",
    "langchain": "LangChain",
    "redis": "Redis",
    "celery": "Celery",
    "requests": "requests",
    "httpx": "HTTPX",
    "pytest": "pytest",
    "rank_bm25": "rank-bm25",
    "tree_sitter": "tree-sitter",
    # JS / TS — frameworks & key libs
    "react": "React",
    "react-dom": "React",
    "next": "Next.js",
    "vue": "Vue",
    "svelte": "Svelte",
    "@angular/core": "Angular",
    "express": "Express",
    "hono": "Hono",
    "fastify": "Fastify",
    "@nestjs/core": "NestJS",
    "vite": "Vite",
    "zod": "Zod",
    "zustand": "Zustand",
    "redux": "Redux",
    "axios": "axios",
    "tailwindcss": "Tailwind",
    "vitest": "Vitest",
    "jest": "Jest",
}


def _top_level(spec: str) -> str:
    """Top-level package of an import spec.

    'fastapi.responses' -> 'fastapi'; '@scope/pkg/sub' -> '@scope/pkg'; './x' -> '' (internal).
    """
    if spec.startswith("."):
        return ""  # relative / internal import — not a dependency
    if spec.startswith("@"):
        return "/".join(spec.split("/")[:2])  # scoped package keeps @scope/name
    return spec.split("/")[0].split(".")[0]


def detect_stack(store: ChromaStore) -> list[dict]:
    """Return the detected stack: ``[{"name", "package", "files"}]``, most-used first.

    ``files`` is how many distinct files import the package, so the UI can rank by real usage.
    """
    data = store.all_chunks()
    documents = data.get("documents", []) or []
    metadatas = data.get("metadatas", []) or []

    # Per file, the set of external top-level packages it imports (a set, so a file that imports
    # fastapi five times still counts once).
    pkgs_by_file: dict[str, set[str]] = {}
    for doc, meta in zip(documents, metadatas, strict=False):
        path = meta["file_path"]
        bucket = pkgs_by_file.setdefault(path, set())
        for spec in _imports_in(doc):
            top = _top_level(spec)
            if top in _KNOWN:
                bucket.add(top)

    # Count files per friendly name (folding react + react-dom together).
    files_by_name: dict[str, int] = {}
    for pkgs in pkgs_by_file.values():
        for name in {_KNOWN[top] for top in pkgs}:
            files_by_name[name] = files_by_name.get(name, 0) + 1

    # Keep a representative package id per name for display/debugging.
    pkg_by_name: dict[str, str] = {}
    for top, name in _KNOWN.items():
        pkg_by_name.setdefault(name, top)

    items = [
        {"name": name, "package": pkg_by_name[name], "files": count}
        for name, count in files_by_name.items()
    ]
    return sorted(items, key=lambda item: (-item["files"], item["name"]))
