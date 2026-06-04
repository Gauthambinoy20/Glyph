"""Walk a local folder and collect source files, safely.

Stays inside the given directory (rejects symlink escapes), skips junk folders, keeps
only the file types we support, and caps file size and count so a huge or hostile repo
cannot overwhelm the app.
"""

from pathlib import Path

# Directories we never descend into (build output, dependencies, caches, our own data).
_SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    ".model_cache",
    "chroma_db",
}

# Only these file types are ingested; everything else is ignored.
_ALLOWED_EXTS = {".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx"}


def walk_files(
    root: str,
    max_files: int = 2000,
    max_file_bytes: int = 1_000_000,
) -> list[tuple[str, bytes]]:
    """Return (relative_path, content) for each supported source file under root.

    Raises ValueError if root is not an existing directory.
    """
    root_path = Path(root).resolve()
    if not root_path.is_dir():
        raise ValueError(f"not a directory: {root}")

    collected: list[tuple[str, bytes]] = []
    for path in sorted(root_path.rglob("*")):
        if len(collected) >= max_files:
            break
        relative = path.relative_to(root_path)
        # Skip anything inside a junk directory.
        if any(part in _SKIP_DIRS for part in relative.parts):
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() not in _ALLOWED_EXTS:
            continue
        # Safety: a symlink must not lead outside the root we were given.
        resolved = path.resolve()
        if not resolved.is_relative_to(root_path):
            continue
        if resolved.stat().st_size > max_file_bytes:
            continue
        collected.append((str(relative), resolved.read_bytes()))
    return collected
