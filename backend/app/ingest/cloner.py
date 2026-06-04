"""Clone a public GitHub repository into a temporary directory, safely.

The clone is shallow (depth 1), non-interactive (a bad or private URL fails fast instead
of hanging for a password), and bounded by a timeout. The caller deletes the temp dir.
"""

import os
import re
import shutil
import subprocess
import tempfile

# Accept only https GitHub repo URLs, with an optional trailing .git or slash.
_GITHUB_URL = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+(\.git)?/?$")


def is_valid_github_url(url: str) -> bool:
    """Return True if the URL looks like a public GitHub https repo URL."""
    return bool(_GITHUB_URL.match(url.strip()))


def clone_repo(url: str, timeout: int = 120) -> str:
    """Shallow-clone a public GitHub repo into a fresh temp dir and return its path.

    Raises ValueError for an invalid URL, or if the clone fails or times out.
    """
    if not is_valid_github_url(url):
        raise ValueError(f"not a valid public GitHub URL: {url}")

    dest = tempfile.mkdtemp(prefix="glyph_repo_")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", url.strip(), dest],
            check=True,
            capture_output=True,
            timeout=timeout,
            # GIT_TERMINAL_PROMPT=0 stops git asking for credentials (which would hang).
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        shutil.rmtree(dest, ignore_errors=True)
        raise ValueError(f"could not clone repository: {url}") from exc
    return dest
