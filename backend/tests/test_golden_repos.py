"""Validate the multi-repo golden set is well-formed (offline, no clone, no models).

This does not measure quality — that needs real repos and is done by ``evaluate_repos`` in the
separate eval job. It just guards the data: every repo is either local or pinned to a real
commit SHA, every question names an expected file, and there are no accidental duplicates.
"""

import re

from app.quality.golden_repos import REPO_GOLDEN

_SHA = re.compile(r"^[0-9a-f]{40}$")


def test_there_are_several_repos_spanning_languages() -> None:
    assert len(REPO_GOLDEN) >= 5
    languages = {repo["language"] for repo in REPO_GOLDEN}
    assert {"python", "javascript", "typescript"} <= languages


def test_every_repo_is_either_local_or_pinned_to_a_real_sha() -> None:
    for repo in REPO_GOLDEN:
        assert repo["name"]
        if "local_path" in repo:
            assert "url" not in repo and "commit" not in repo
        else:
            assert repo["url"].startswith("https://github.com/")
            assert _SHA.match(repo["commit"]), f"{repo['name']} commit is not a 40-char SHA"


def test_every_question_names_an_expected_file() -> None:
    for repo in REPO_GOLDEN:
        assert repo["questions"], f"{repo['name']} has no questions"
        for item in repo["questions"]:
            assert item["question"].strip()
            assert item["expect"].strip()


def test_the_set_is_substantial_and_has_no_duplicate_questions() -> None:
    questions = [item["question"] for repo in REPO_GOLDEN for item in repo["questions"]]
    assert len(questions) >= 25
    assert len(questions) == len(set(questions)), "a question appears twice"
