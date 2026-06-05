"""The ingest pipeline: turn a repo into a searchable index.

Ties the pieces together: walk (or clone then walk) the files, chunk each one, then embed
and store only the new chunks. The work is written as a generator that *yields* a small
event per stage (``walk`` -> ``chunk`` -> ``embed`` -> ``done``, plus ``clone`` for repos),
so the API can stream live progress to the UI. The blocking ``ingest_path`` / ``ingest_repo``
helpers just drive that generator and return the final summary, so both paths share exactly
one implementation.
"""

import shutil
from collections.abc import Iterator

from app.embed.base import Embedder
from app.ingest.cache import select_new_chunks
from app.ingest.chunker import chunk_file
from app.ingest.cloner import clone_repo, read_default_branch
from app.ingest.walker import walk_files
from app.store.chroma_store import ChromaStore

# Embed (and store) the new chunks in batches this size, so progress updates land smoothly
# instead of one long silent pause on a big repo. Larger = fewer embed round-trips (faster),
# still frequent enough for a smooth progress bar.
EMBED_BATCH = 128


def ingest_path_events(
    local_path: str,
    store: ChromaStore,
    embedder: Embedder,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> Iterator[dict]:
    """Ingest a local folder, yielding a progress event per stage.

    Yields, in order: ``{"stage":"walk","files":N}``, ``{"stage":"chunk","chunks":M}``,
    one or more ``{"stage":"embed","done":d,"total":t}`` events as new chunks are embedded,
    and finally ``{"stage":"done", files, languages, added, cached}``.

    Raises ValueError if the folder has no supported files or yields no chunks.
    """
    files = walk_files(local_path, max_files=max_files, max_file_bytes=max_file_bytes)
    if not files:
        raise ValueError("no supported source files found")
    yield {"stage": "walk", "files": len(files)}

    all_chunks = []
    languages: set[str] = set()
    for relative_path, content in files:
        chunks = chunk_file(relative_path, content)
        all_chunks.extend(chunks)
        languages.update(chunk.language for chunk in chunks)
    if not all_chunks:
        raise ValueError("no code chunks could be produced")
    yield {"stage": "chunk", "chunks": len(all_chunks)}

    new_ids, new_chunks, cached = select_new_chunks(all_chunks, store)
    total = len(new_chunks)
    yield {"stage": "embed", "done": 0, "total": total}
    for start in range(0, total, EMBED_BATCH):
        batch_ids = new_ids[start : start + EMBED_BATCH]
        batch_chunks = new_chunks[start : start + EMBED_BATCH]
        vectors = embedder.embed_documents([chunk.code for chunk in batch_chunks])
        store.add(batch_ids, batch_chunks, vectors)
        yield {"stage": "embed", "done": min(start + EMBED_BATCH, total), "total": total}

    yield {
        "stage": "done",
        "files": len(files),
        "languages": sorted(languages),
        "added": total,
        "cached": cached,
    }


def ingest_repo_events(
    repo_url: str,
    store: ChromaStore,
    embedder: Embedder,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> Iterator[dict]:
    """Clone a public GitHub repo and ingest it, yielding progress (clone first, then ingest).

    The temporary clone is always deleted, even if ingest fails part way through.
    """
    yield {"stage": "clone", "status": "start"}
    repo_dir = clone_repo(repo_url)
    # The shallow clone checks out the real default branch — capture it before we ingest so the
    # final summary reports the actual branch instead of a guessed "main".
    branch = read_default_branch(repo_dir)
    yield {"stage": "clone", "status": "done"}
    try:
        for event in ingest_path_events(
            repo_dir, store, embedder, max_files=max_files, max_file_bytes=max_file_bytes
        ):
            # Attach the real branch to the final summary event.
            if event["stage"] == "done" and branch:
                event = {**event, "branch": branch}
            yield event
    finally:
        shutil.rmtree(repo_dir, ignore_errors=True)


def _summary(events: Iterator[dict]) -> dict:
    """Drive an ingest event stream to completion and return the final ``done`` summary."""
    summary: dict = {}
    for event in events:
        if event["stage"] == "done":
            summary = {key: value for key, value in event.items() if key != "stage"}
    return summary


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
    return _summary(
        ingest_path_events(
            local_path, store, embedder, max_files=max_files, max_file_bytes=max_file_bytes
        )
    )


def ingest_repo(
    repo_url: str,
    store: ChromaStore,
    embedder: Embedder,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> dict:
    """Clone a public GitHub repo, ingest it, then delete the temporary clone."""
    return _summary(
        ingest_repo_events(
            repo_url, store, embedder, max_files=max_files, max_file_bytes=max_file_bytes
        )
    )
