"""Vector storage on disk, using Chroma.

Saves each code chunk's vector plus its metadata, and finds the closest chunks to a
query vector using cosine similarity. We pass vectors in ourselves (precomputed), so the
content-hash cache stays the single place embeddings ever happen.
"""

from collections.abc import Sequence
from typing import Any, cast

import chromadb

from app.ingest.chunker import Chunk


def collection_name(embed_model: str, dim: int) -> str:
    """Build a collection name that encodes the model and vector size.

    Putting the size in the name means switching to a different-sized model lands in a
    fresh collection instead of clashing with vectors of another size.
    """
    safe = embed_model.replace("/", "_").replace("-", "_").lower()
    return f"code_chunks_{safe}_{dim}"


def _metadata(chunk: Chunk) -> dict:
    """Return the fields we store alongside each vector (for citations and filtering)."""
    return {
        "file_path": chunk.file_path,
        "language": chunk.language,
        "symbol_name": chunk.symbol_name,
        "type": chunk.type,
        "start_line": chunk.start_line,
        "end_line": chunk.end_line,
    }


class ChromaStore:
    """A persistent Chroma collection for code chunks."""

    def __init__(self, path: str, embed_model: str, dim: int) -> None:
        self._dim = dim
        client = chromadb.PersistentClient(path=path)
        name = collection_name(embed_model, dim)
        # Cosine space must be set when the collection is created. Newer Chroma uses the
        # `configuration` form; fall back to the older `metadata` form if needed.
        try:
            self._collection = client.get_or_create_collection(
                name=name, configuration={"hnsw": {"space": "cosine"}}
            )
        except TypeError:
            self._collection = client.get_or_create_collection(
                name=name, metadata={"hnsw:space": "cosine"}
            )

    def existing_ids(self, ids: Sequence[str]) -> set[str]:
        """Return which of the given ids are already stored (for the cache check)."""
        if not ids:
            return set()
        found = self._collection.get(ids=list(ids))
        return set(found.get("ids", []))

    def add(
        self,
        ids: Sequence[str],
        chunks: Sequence[Chunk],
        vectors: Sequence[Sequence[float]],
    ) -> None:
        """Store chunks with their precomputed vectors and metadata."""
        if not ids:
            return
        # Fail clearly if a vector is the wrong size (e.g. someone swapped models), instead
        # of letting Chroma raise a confusing low-level error.
        for vector in vectors:
            if len(vector) != self._dim:
                raise ValueError(
                    f"vector length {len(vector)} does not match collection dim "
                    f"{self._dim}; switching embedding models needs a fresh collection"
                )
        self._collection.add(
            ids=list(ids),
            documents=[chunk.code for chunk in chunks],
            # chromadb's type stubs are stricter than its runtime, which accepts plain
            # lists of floats, so we cast to keep the type checker happy.
            embeddings=cast(Any, [list(vector) for vector in vectors]),
            metadatas=[_metadata(chunk) for chunk in chunks],
        )

    def query(self, vector: Sequence[float], k: int) -> dict:
        """Return up to k chunks closest to the query vector."""
        result = self._collection.query(
            query_embeddings=cast(Any, [list(vector)]),
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )
        return cast(dict, result)

    def count(self) -> int:
        """How many chunks are stored."""
        return self._collection.count()

    def all_chunks(self) -> dict:
        """Return all stored ids, documents and metadata (used to build the keyword index)."""
        return cast(dict, self._collection.get(include=["documents", "metadatas"]))
