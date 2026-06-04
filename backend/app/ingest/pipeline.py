"""The ingest pipeline: turn a repo into a searchable index.

Ties the pieces together: walk (or clone then walk) the files, chunk each one, then embed
and store only the new chunks. Returns a small summary of what happened.
"""

import shutil

from app.embed.base import Embedder
from app.ingest.cache import embed_new_chunks
from app.ingest.chunker import chunk_file
from app.ingest.cloner import clone_repo
from app.ingest.walker import walk_files
from app.store.chroma_store import ChromaStore


def ingest_path(
    local_path: str,
    store: ChromaStore,
    embedder: Embedder,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> dict:
    """Chunk, embed and store every supported file under a local folder.

    Raises ValueError if the folder has no supported files or yields no chunks.
    """
    files = walk_files(local_path, max_files=max_files, max_file_bytes=max_file_bytes)
    if not files:
        raise ValueError("no supported source files found")

    all_chunks = []
    languages: set[str] = set()
    for relative_path, content in files:
        chunks = chunk_file(relative_path, content)
        all_chunks.extend(chunks)
        languages.update(chunk.language for chunk in chunks)

    if not all_chunks:
        raise ValueError("no code chunks could be produced")

    counts = embed_new_chunks(all_chunks, store, embedder)
    return {"files": len(files), "languages": sorted(languages), **counts}


def ingest_repo(
    repo_url: str,
    store: ChromaStore,
    embedder: Embedder,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> dict:
    """Clone a public GitHub repo, ingest it, then delete the temporary clone."""
    repo_dir = clone_repo(repo_url)
    try:
        return ingest_path(
            repo_dir, store, embedder, max_files=max_files, max_file_bytes=max_file_bytes
        )
    finally:
        shutil.rmtree(repo_dir, ignore_errors=True)
