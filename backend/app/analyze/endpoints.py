"""Detect HTTP API routes in the ingested code.

Scans the stored chunks for route declarations in the common styles — FastAPI / Flask
decorators and Express-style calls — and returns a deduplicated, sorted list of
{method, path}. Works from the chunks already in the store, so no repo re-read is needed.
"""

import re

from app.store.chroma_store import ChromaStore

# FastAPI / Express: @app.get("/x")  ·  app.post("/x", handler)  ·  router.delete("/x")
_VERB = re.compile(
    r"""(?:@\s*)?(?:app|router|api|bp|blueprint|fastapi)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]""",
    re.IGNORECASE,
)
# Flask: @app.route("/x", methods=["GET", "POST"])  (defaults to GET when methods omitted)
_FLASK = re.compile(
    r"""@\s*(?:app|bp|blueprint)\.route\(\s*["']([^"']+)["']([^)]*)\)""",
    re.IGNORECASE,
)
_METHODS = re.compile(r"""methods\s*=\s*\[([^\]]*)\]""", re.IGNORECASE)


def detect_endpoints(store: ChromaStore) -> list[dict]:
    """Return the API routes found across the indexed code, as sorted {method, path}."""
    data = store.all_chunks()
    documents = data.get("documents", []) or []

    found: set[tuple[str, str]] = set()
    for code in documents:
        for method, path in _VERB.findall(code):
            if path.startswith("/"):
                found.add((method.upper(), path))
        for path, tail in _FLASK.findall(code):
            if not path.startswith("/"):
                continue
            methods = _METHODS.search(tail)
            if methods:
                for raw in methods.group(1).split(","):
                    verb = raw.strip().strip("\"'").upper()
                    if verb:
                        found.add((verb, path))
            else:
                found.add(("GET", path))

    return [{"method": m, "path": p} for m, p in sorted(found, key=lambda r: (r[1], r[0]))]
