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
    except FileNotFoundError as exc:
        # git itself is not installed on this machine/image.
        shutil.rmtree(dest, ignore_errors=True)
        raise ValueError("git is not installed, so GitHub URLs cannot be cloned") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        shutil.rmtree(dest, ignore_errors=True)
        raise ValueError(f"could not clone repository: {url}") from exc
    return dest


def clone_at_commit(url: str, commit: str, timeout: int = 180) -> str:
    """Clone exactly one pinned commit of a public GitHub repo into a fresh temp dir.

    Unlike ``clone_repo`` (which shallow-clones the default branch's moving HEAD), this fetches
    the single named commit, so an evaluation that pins a SHA always sees the same files — the
    result is reproducible and cannot drift when upstream changes. Returns the path; the caller
    deletes the temp dir. Raises ValueError for an invalid URL, a missing git, or any failed step.
    """
    if not is_valid_github_url(url):
        raise ValueError(f"not a valid public GitHub URL: {url}")

    dest = tempfile.mkdtemp(prefix="glyph_pin_")
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    # Fetch only the one commit (depth 1) rather than the whole history, then check it out.
    steps = [
        ["git", "init", "--quiet", dest],
        ["git", "-C", dest, "remote", "add", "origin", url.strip()],
        ["git", "-C", dest, "fetch", "--depth", "1", "--quiet", "origin", commit],
        ["git", "-C", dest, "checkout", "--quiet", "FETCH_HEAD"],
    ]
    try:
        for step in steps:
            subprocess.run(step, check=True, capture_output=True, timeout=timeout, env=env)
    except FileNotFoundError as exc:
        shutil.rmtree(dest, ignore_errors=True)
        raise ValueError("git is not installed, so repositories cannot be cloned") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        shutil.rmtree(dest, ignore_errors=True)
        raise ValueError(f"could not clone {url} at {commit}") from exc
    return dest


def read_default_branch(repo_dir: str, timeout: int = 10) -> str | None:
    """Return the checked-out branch name of a clone (e.g. "main", "master"), or None.

    A shallow clone checks out the repo's default branch, so HEAD's branch name *is* the real
    default branch — no guessing. Returns None if git is missing or the name can't be read.
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_dir, "rev-parse", "--abbrev-ref", "HEAD"],
            check=True,
            capture_output=True,
            timeout=timeout,
            text=True,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    branch = result.stdout.strip()
    return branch or None
