"""Generate a short 'what this codebase does' overview from the ingested code.

Feeds the model a compact list of files and their main symbols and asks for 2-3 plain
sentences. If the model is unavailable, falls back to a simple stats summary so the UI
always has something to show.
"""

from app.llm.client import LLMClient, LLMError
from app.store.chroma_store import ChromaStore

_SYSTEM = (
    "You summarize codebases. In 2 to 3 plain sentences, describe what this project does "
    "and its main parts. Use only the file and symbol list provided; do not invent features."
)


def build_overview(store: ChromaStore, llm: LLMClient) -> str:
    """Return a short natural-language overview of the stored codebase."""
    metadatas = store.all_chunks().get("metadatas", []) or []
    if not metadatas:
        return ""

    symbols_by_file: dict[str, list[str]] = {}
    languages: set[str] = set()
    for meta in metadatas:
        symbols_by_file.setdefault(meta["file_path"], []).append(meta.get("symbol_name", ""))
        if meta.get("language"):
            languages.add(meta["language"])

    lines = []
    for path, symbols in sorted(symbols_by_file.items())[:60]:
        names = ", ".join(s for s in symbols if s and s != "<module>")
        lines.append(f"{path}: {names[:120]}" if names else path)
    user_prompt = "Files and their main symbols:\n" + "\n".join(lines)

    try:
        text, _ = llm.complete(_SYSTEM, user_prompt)
        return text.strip()
    except LLMError:
        langs = ", ".join(sorted(languages)) or "code"
        return (
            f"{len(symbols_by_file)} files in {langs}, "
            f"with {len(metadatas)} functions and classes indexed."
        )
