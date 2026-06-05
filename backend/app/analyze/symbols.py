"""A flat file + symbol index of the ingested code.

Pulls the lightweight metadata (no code bodies) for every stored chunk so the command
palette and a file browser can search across files and symbols. Sorted by file then line.
"""

from app.store.chroma_store import ChromaStore


def list_symbols(store: ChromaStore) -> list[dict]:
    """Return {file_path, symbol_name, type, start_line, end_line} for every indexed chunk."""
    data = store.all_chunks()
    metadatas = data.get("metadatas", []) or []

    rows = [
        {
            "file_path": meta.get("file_path", ""),
            "symbol_name": meta.get("symbol_name", ""),
            "type": meta.get("type", ""),
            "start_line": meta.get("start_line", 0),
            "end_line": meta.get("end_line", 0),
        }
        for meta in metadatas
    ]
    rows.sort(key=lambda r: (r["file_path"], r["start_line"]))
    return rows
