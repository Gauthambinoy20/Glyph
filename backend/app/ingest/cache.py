"""Content-hash cache so unchanged code is never re-embedded.

Each chunk's id is the sha256 of its exact code text. Before embedding, we ask the store
which ids it already has, and only embed and add the new ones. Because the id IS the
content, editing one function does not invalidate its siblings.
"""

import hashlib
from collections.abc import Sequence

from app.embed.base import Embedder
from app.ingest.chunker import Chunk
from app.store.chroma_store import ChromaStore


def chunk_id(chunk: Chunk) -> str:
    """Return a stable id for a chunk, derived only from its exact code text."""
    return hashlib.sha256(chunk.code.encode("utf-8")).hexdigest()


def select_new_chunks(
    chunks: Sequence[Chunk], store: ChromaStore
) -> tuple[list[str], list[Chunk], int]:
    """Split a batch into the chunks that still need embedding vs. those already cached.

    De-duplicates identical snippets within the batch (same code -> same id), then asks the
    store which ids it already has. Returns ``(new_ids, new_chunks, cached_count)`` so callers
    can embed only the new ones (and, if they want, report progress while doing so).
    """
    # Map id -> chunk, which also de-duplicates identical snippets within this batch.
    by_id: dict[str, Chunk] = {}
    for chunk in chunks:
        by_id.setdefault(chunk_id(chunk), chunk)

    already_stored = store.existing_ids(list(by_id.keys()))
    new_ids = [cid for cid in by_id if cid not in already_stored]
    new_chunks = [by_id[cid] for cid in new_ids]
    cached = len(by_id) - len(new_chunks)
    return new_ids, new_chunks, cached


def embed_new_chunks(
    chunks: Sequence[Chunk], store: ChromaStore, embedder: Embedder
) -> dict[str, int]:
    """Embed and store only the chunks the store does not already have.

    Returns counts of how many were newly added vs already cached.
    """
    new_ids, new_chunks, cached = select_new_chunks(chunks, store)

    if new_chunks:
        vectors = embedder.embed_documents([chunk.code for chunk in new_chunks])
        store.add(new_ids, new_chunks, vectors)

    return {"added": len(new_chunks), "cached": cached}
