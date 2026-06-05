"""Summarise the ingested code: how many files and chunks, broken down by language.

Works straight from the chunks already in the store (no re-reading the repo), so it is cheap
to call. Feeds the project panel's stat tiles and the language breakdown chart.
"""

from app.store.chroma_store import ChromaStore


def build_stats(store: ChromaStore) -> dict:
    """Return {files, chunks, languages:[{language, files, chunks}]} for the stored repo.

    `files` and `chunks` are repo-wide totals; the per-language `files`/`chunks` counts add up
    to those totals. Languages are sorted by chunk count, most first.
    """
    data = store.all_chunks()
    metadatas = data.get("metadatas", []) or []

    chunks_by_lang: dict[str, int] = {}
    files_by_lang: dict[str, set[str]] = {}
    all_files: set[str] = set()
    for meta in metadatas:
        language = meta.get("language", "") or "unknown"
        path = meta.get("file_path", "")
        chunks_by_lang[language] = chunks_by_lang.get(language, 0) + 1
        files_by_lang.setdefault(language, set()).add(path)
        all_files.add(path)

    # Most-used language first (by chunk count), with the language name as a stable tiebreak.
    ordered = sorted(chunks_by_lang, key=lambda language: (-chunks_by_lang[language], language))
    languages = [
        {
            "language": language,
            "files": len(files_by_lang[language]),
            "chunks": chunks_by_lang[language],
        }
        for language in ordered
    ]

    return {"files": len(all_files), "chunks": len(metadatas), "languages": languages}
