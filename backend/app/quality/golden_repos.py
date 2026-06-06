"""A real, multi-repo golden set for measuring retrieval quality across languages.

Each entry is a real public repo pinned to a commit SHA (so the run is reproducible and the
expected files never move under us) plus a handful of natural questions, each paired with the
file that genuinely answers it. ``evaluate_repos.py`` clones each repo at its pinned commit,
ingests it for real in both embedding modes, and checks whether the expected file lands in the
top-k. Every ``expect`` path below was verified to exist at the pinned SHA.

The first entry is Glyph's own backend, ingested in place from ``app`` (no clone), reusing the
existing single-repo golden set so the two stay in step.
"""

from app.quality.golden import GOLDEN

# Glyph's own backend (Python), ingested locally from the backend's ``app`` directory.
_GLYPH = {
    "name": "glyph-backend",
    "language": "python",
    "local_path": "app",
    "questions": GOLDEN,
}

# pallets/click — a Python command-line library.
_CLICK = {
    "name": "pallets/click",
    "language": "python",
    "url": "https://github.com/pallets/click",
    "commit": "4fc0e90e1c19faf82bc18f8551eb1ed78dc738ac",
    "questions": [
        {
            "question": "how are commands and groups defined and invoked",
            "expect": "src/click/core.py",
        },
        {
            "question": "how are options and arguments declared as decorators",
            "expect": "src/click/decorators.py",
        },
        {
            "question": "how does click parse argv tokens into options and arguments",
            "expect": "src/click/parser.py",
        },
        {
            "question": "where are parameter types like INT, Choice and Path defined",
            "expect": "src/click/types.py",
        },
        {
            "question": "how is styled and coloured terminal output produced",
            "expect": "src/click/termui.py",
        },
    ],
}

# expressjs/express — a JavaScript web framework.
_EXPRESS = {
    "name": "expressjs/express",
    "language": "javascript",
    "url": "https://github.com/expressjs/express",
    "commit": "dae209ae6559c29cfca2a1f4414c51d89ea643d5",
    "questions": [
        {
            "question": "how is the express application created and where are its settings stored",
            "expect": "lib/application.js",
        },
        {
            "question": "how are response helpers like res.json and res.send implemented",
            "expect": "lib/response.js",
        },
        {
            "question": "how are request properties like req.query and req.hostname implemented",
            "expect": "lib/request.js",
        },
        {
            "question": "where is the top-level express() factory exported",
            "expect": "lib/express.js",
        },
        {
            "question": "how is a view resolved and rendered with a template engine",
            "expect": "lib/view.js",
        },
    ],
}

# axios/axios — a JavaScript HTTP client.
_AXIOS = {
    "name": "axios/axios",
    "language": "javascript",
    "url": "https://github.com/axios/axios",
    "commit": "fae9d4e7db6a858c407c75e607a071c533c5c4f6",
    "questions": [
        {
            "question": "how does the core Axios class dispatch a request",
            "expect": "lib/core/Axios.js",
        },
        {
            "question": "how are request and response interceptors managed",
            "expect": "lib/core/InterceptorManager.js",
        },
        {
            "question": "where is the http adapter that sends requests from node",
            "expect": "lib/adapters/http.js",
        },
        {
            "question": "how are request and response headers normalised",
            "expect": "lib/core/AxiosHeaders.js",
        },
        {
            "question": "how are two config objects merged together",
            "expect": "lib/core/mergeConfig.js",
        },
    ],
}

# pmndrs/zustand — a TypeScript state-management library.
_ZUSTAND = {
    "name": "pmndrs/zustand",
    "language": "typescript",
    "url": "https://github.com/pmndrs/zustand",
    "commit": "4e15c2ed2f933f21d495013c52a5df4acc7e8920",
    "questions": [
        {
            "question": "how is the vanilla store created with setState, getState and subscribe",
            "expect": "src/vanilla.ts",
        },
        {
            "question": "how does the react hook subscribe a component to the store",
            "expect": "src/react.ts",
        },
        {
            "question": "where is the persist middleware that saves state to storage",
            "expect": "src/middleware/persist.ts",
        },
        {
            "question": "how does the devtools middleware connect to the redux devtools extension",
            "expect": "src/middleware/devtools.ts",
        },
    ],
}

# The full set: one local repo plus four pinned public repos, spanning Python, JS and TS.
REPO_GOLDEN: list[dict] = [_GLYPH, _CLICK, _EXPRESS, _AXIOS, _ZUSTAND]
