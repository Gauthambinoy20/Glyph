"""Read an indexed file back out of the store, reconstructed from its chunks.

We never touch the original repo on disk (it is long gone after ingest); instead we stitch
the file's stored chunks back together in line order. The `path` is just a key into the
index, not a filesystem path, so there is no path-traversal risk: an unknown path is a 404.
"""

from app.store.chroma_store import ChromaStore


def read_indexed_file(
    store: ChromaStore,
    path: str,
    start: int | None = None,
    end: int | None = None,
) -> dict | None:
    """Return one indexed file's code (and its chunks), or None if the path is not indexed.

    If start and end are given, only the chunks overlapping that line range are returned, so
    the code viewer can open a file focused on a citation's lines.
    """
    data = store.all_chunks()
    documents = data.get("documents", []) or []
    metadatas = data.get("metadatas", []) or []

    rows = [
        (meta, doc)
        for meta, doc in zip(metadatas, documents, strict=False)
        if meta.get("file_path") == path
    ]
    if not rows:
        return None

    rows.sort(key=lambda row: row[0].get("start_line", 0))
    if start is not None and end is not None:
        rows = [
            (meta, doc)
            for meta, doc in rows
            if meta.get("start_line", 0) <= end and meta.get("end_line", 0) >= start
        ]
    if not rows:  # a range that matched nothing in this file
        return None

    chunks = [
        {
            "symbol_name": meta.get("symbol_name", ""),
            "type": meta.get("type", ""),
            "start_line": meta.get("start_line", 0),
            "end_line": meta.get("end_line", 0),
            "code": doc,
        }
        for meta, doc in rows
    ]
    return {
        "file_path": path,
        "language": rows[0][0].get("language", ""),
        "code": "\n\n".join(doc for _, doc in rows),
        "start_line": min(chunk["start_line"] for chunk in chunks),
        "end_line": max(chunk["end_line"] for chunk in chunks),
        "chunks": chunks,
    }
