# 🗺️ Glyph - Implementation Roadmap (A→Z To-Do)

Every step from empty folder to finished app. Each step is small, testable, and ends in a commit.
This is the single source of truth for what is done and what is left. After each step I also update
[JOURNAL.md](./JOURNAL.md).

## How to use this (for me, or any AI agent picking this up)

**The loop, every step:** plan it in one line → write clean commented code → write its test →
run the test green → update JOURNAL + tick the box here → commit (human message) → stop and review.

**Status boxes:** `[x]` done, `[ ]` to do.

**Priority tags so we never over-build (the brief rewards solid over flashy):**
- `(core)` must-have for a solid, graded submission.
- `(polish)` makes it noticeably better. Do it if time allows.
- `(stretch)` optional wow. Only after all core + polish are green.

**Definition of done for a single step:** the code does exactly what the step says, its test passes,
errors are handled, the docs are updated, and there is a command Dave can run to see it.

**Definition of done for the whole project:** see the final section.

---

## Phase 0 - Setup & docs
- [x] 1. Pick app name → **Glyph** `(core)`
- [x] 2. Check machine has all tools (Python, Node, git, Docker) `(core)`
- [x] 3. Create folder skeleton + `git init` (branch `main`) `(core)`
- [x] 4. Write `docs/ENGINEERING_STANDARDS.md` (the rules) `(core)`
- [x] 5. Write `docs/JOURNAL.md` (personal report) `(core)`
- [x] 6. Write `docs/ROADMAP.md` (this file) `(core)`
- [x] 7. Write `docs/TECHNICAL_REPORT.md` (research + design + review + diagrams) `(core)`
- [x] 8. Write `README.md` skeleton (with `✍️ YOU WRITE` blanks) `(core)`
- [x] 9. Write `.gitignore` and `.env.example` `(core)`
- [x] 10. First commit: scaffold project, docs, and rules `(core)`

## Phase 1 - Backend foundation
- [x] 11. `backend/requirements.txt` with pinned versions `(core)`
- [x] 12. `app/config.py` load settings from env safely, all defaults `(core)`
- [x] 13. `app/main.py` FastAPI app + `GET /api/health` `(core)`
- [x] 14. Test: `/api/health` returns `{"status":"ok"}` `(core)`
- [x] 15. Commit: add config and health endpoint `(core)`
- [ ] 15a. `GET /api/ready` readiness probe (reports if model + store are loaded) `(polish)`
- [ ] 15b. CORS locked to the frontend origin; request-id on every response `(core)`
- [ ] 15c. Global error handler: generic message to client, full detail to logs `(core)`

## Phase 2 - Code chunking (the accuracy core)
- [x] 16. `ingest/chunker.py` tree-sitter parser setup + extension→language map `(core)`
- [x] 17. Python chunking: functions/classes/methods + metadata + 1-indexed lines `(core)`
- [x] 18. Python decorators (no double-count); capture `<module>` top-level code `(core)`
- [x] 19. JS / JSX chunking (functions, classes, arrow funcs assigned to const) `(core)`
- [x] 20. TS / TSX chunking (tsx uses its own grammar; interfaces, type aliases) `(core)`
- [x] 21. Fallback: unsupported files → plain ~40-line text chunks `(core)`
- [x] 22. Sub-split oversized functions (fit the embedder's 512-token limit) `(core)`
- [x] 23. utf-8 decode with errors='replace' so odd files never crash ingest `(core)`
- [x] 24. Tests: exact line ranges, decorator, module capture, tsx, oversize, bad-encoding `(core)`
- [ ] 25. Commit: tree-sitter chunker for py/js/ts/tsx `(core)`  ← you commit this

## Phase 3 - Embeddings, storage, cache
- [x] 26. `embed/base.py` Embedder protocol (embed_documents / embed_query / dim) `(core)`
- [x] 27. `embed/fastembed_embedder.py` local bge-small default (384-dim) `(core)`
- [x] 28. `embed/openai_embedder.py` thin stub behind same interface (one-env swap) `(core)`
- [x] 29. Cache the embedding model on disk (model_cache_dir; first run only is slow) `(core)`
- [x] 30. `store/chroma_store.py` persistent, cosine config, precomputed vectors `(core)`
- [x] 31. Dimension-mismatch guard: clear error, not a raw Chroma 500 `(core)`
- [x] 32. `ingest/cache.py` content-hash ids; never re-embed unchanged code `(core)`
- [x] 33. Tests: dim, add+query roundtrip, similarity, mismatch error, cache skip `(core)`
- [ ] 34. Commit: local embedder, Chroma store, content-hash cache `(core)`  ← you commit this

## Phase 4 - Ingest pipeline
- [x] 35. `ingest/walker.py` walk local path, ext allowlist, skip junk, size + count caps `(core)`
- [x] 36. Local-path safety: confine reads to the given dir, reject symlink escapes `(core)`
- [x] 37. `ingest/cloner.py` non-interactive GitHub clone (no hang, depth=1, timeout) `(core)`
- [x] 38. `ingest/pipeline.py` clone/walk → chunk → cache → embed → store (BM25 added in Phase 5) `(core)`
- [x] 39. `POST /api/ingest` accepts repo URL or local path; pydantic request model `(core)`
- [x] 40. Clear errors: bad URL, clone fail/timeout, 0 supported files, 0 chunks `(core)`
- [x] 41. Ingest status surfaced (counts: files, added, cached, languages) `(core)`
- [x] 42. Tests: ingest fixture, re-ingest adds 0, bad URL 4xx, 0-files 4xx, symlink blocked `(core)`
- [ ] 43. Commit: ingest pipeline and endpoint `(core)`  ← you commit this

## Phase 5 - Retrieval
- [x] 44. `retrieve/tokenize.py` code-aware tokenizer (splits camelCase / snake_case) `(core)`
- [x] 45. BM25 index rebuilt from Chroma docs per retriever (no stale pickle) `(core)`
- [x] 46. `retrieve/hybrid.py` semantic + BM25 fused via RRF; exact-symbol boost; top-5 `(core)`
- [x] 47. Debug `POST /api/search` returns chunks (no AI) for inspection `(core)`
- [x] 48. Tests: tokenizer splits, exact symbol found, semantic hit, empty index → [], stable order `(core)`
- [ ] 49. Commit: hybrid retrieval with RRF `(core)`  ← you commit this

## Phase 6 - Answers (the AI)
- [x] 50. `llm/catalog.py` model registry (free + cheapest-paid, note, available flag) `(core)`
- [x] 51. `llm/client.py` OpenRouter call, temp 0, fallback model on 429/5xx, clear 402 `(core)`
- [x] 52. `GET /api/models` list models + which are available given the keys `(core)`
- [x] 53. `rag/prompt.py` grounded prompt: answer only from context, always cite, else "not found" `(core)`
- [x] 54. `POST /api/ask` question → retrieve → AI → answer + citations (model selectable) `(core)`
- [x] 55. Citation parsing: `[file:start-end]` → structured citations, validated vs retrieved chunks `(core)`
- [ ] 56. Streaming `POST /api/ask/stream` (answer appears live, citations in final event) `(polish)`
- [x] 57. `obs/logging.py` one JSON log line per ask (question, chunk_ids, latency, tokens) `(core)`
- [x] 58. Token-usage fallback to 0 when a free provider omits usage `(core)`
- [x] 59. Tests: ask returns citations, empty index → citations=[], citation consistency, 429→fallback, log fields `(core)`
- [ ] 60. Commit: grounded answer endpoint with model picker and logging `(core)`  ← you commit this

## Phase 7 - Conversation & extra endpoints
- [x] 61. Conversational follow-ups: feed last few Q&A turns into the prompt (context mgmt) `(core)`
- [x] 62. Repo overview generated on ingest ("what this codebase does") `(polish)`
- [ ] 63. `GET /api/file` return a snippet for click-to-view citations `(core)`
- [ ] 64. `GET /repos/{id}/endpoints` auto-detect API routes (FastAPI/Express) `(polish)`
- [ ] 65. SQLite chat history (sessions + messages) + endpoints `(polish)`
- [x] 66. Suggested starter questions after ingest (in the web UI) `(polish)`
- [ ] 67. Tests: follow-up keeps context, snippet returns right lines, endpoints found, history roundtrip `(core)`
- [ ] 68. Commit: conversation, overview, snippets, endpoint detection, history `(core)`

## Phase 8 - Frontend
- [x] 69. Vite + React + TS shell, premium dark theme, `api.ts` typed wrappers `(core)`
- [x] 70. Ingest panel: repo URL / path input + progress + "try app" demo `(core)`
- [x] 71. Model-picker dropdown (free enabled; paid shown with note, disabled w/o key) `(core)`
- [x] 72. Chat UI with markdown answers + clickable citation chips `(core)`
- [x] 73. Click a citation → code panel shows the source code with line numbers `(core)`
- [x] 74. Suggested starter questions (overview/endpoints/history are Phase 7 follow-ups) `(polish)`
- [x] 75. Loading / empty / error states; friendly error toast `(core)`
- [x] 76. Small touches: Enter-to-send, model badge, repo chip (copy-answer later) `(polish)`
- [ ] 77. Commit: Glyph web UI `(core)`  ← you commit this

## Phase 9 - Quality, tooling & tests depth
- [x] 78. Lint + format: `ruff` (lint) and `ruff format` for the backend, pinned `(core)`
- [x] 79. Type-check: `mypy` on `app/`, pinned, passes clean `(polish)`
- [x] 80. `pre-commit` hooks: ruff lint + format, so commits stay clean `(polish)`
- [x] 81. Coverage: `pytest --cov`, report printed, 88% (≥ 80% target met) `(core)`
- [x] 81b. Security: `bandit` (code) + `pip-audit` (deps); fixed 5/6 CVEs, 1 has no fix `(polish)`
- [ ] 82. Frontend unit test (vitest): `api.ts` request shape with a mocked fetch `(polish)`
- [ ] 83. End-to-end smoke test: ingest demo repo → ask → assert correct file cited `(core)`
- [ ] 84. `Makefile` (or `tasks.sh`): `make install / test / run / lint / fmt / up` one-liners `(polish)`
- [ ] 85. Commit: lint, types, coverage, e2e smoke, Makefile `(core)`

## Phase 10 - Ship it
- [ ] 86. Backend Dockerfile (pre-downloads bge-small) + `.dockerignore` `(core)`
- [ ] 87. Frontend Dockerfile (build → static serve) + `.dockerignore` `(core)`
- [ ] 88. `docker-compose.yml` so `docker compose up` runs the whole app `(core)`
- [x] 89. GitHub Actions CI: install → ruff → format → mypy → bandit → pip-audit → pytest+cov `(core)`
- [ ] 90. Orchestration note in README: why NO framework (LangChain/LlamaIndex) on purpose `(core)`
- [ ] 91. Fill README: setup, architecture diagram, productionize/scale, RAG decisions; keep `✍️` blanks `(core)`
- [x] 92. Create the GitHub repo and push (github.com/Gauthambinoy20/Glyph, CI green) `(core)`
- [ ] 93. Capture screenshots + short demo video; add screenshots to README `(core)`
- [ ] 94. Final pass: all tests green, fresh `docker compose up` works from scratch `(core)`
- [ ] 95. Commit: dockerize, CI, finalize docs `(core)`

## Phase 11 - Standout features (graded extras)
- [ ] 96. Quality eval set: ~10 golden questions + script reporting retrieval hit-rate `(polish)`
- [ ] 97. Observability dashboard: page showing query logs, latency, token usage `(polish)`
- [ ] 98. Commit: quality eval set + observability dashboard `(polish)`

## Phase 12 - Stretch (only if everything above is green)
- [ ] 99. File-tree browser: click a file/function and ask about it `(stretch)`
- [x] 100. Dependency / architecture graph view of the repo `(stretch)`
- [ ] 101. Light/dark theme toggle + polished empty-state illustration `(stretch)`
- [ ] 102. Export chat / shareable answer link `(stretch)`

---

## ✅ Test Inventory (track every test case, one box each)

Backend unit tests live in `backend/tests/`. Tick a box when its test exists and passes.

**Health / app**
- [x] T01. `/api/health` → 200 + `{"status":"ok"}`
- [ ] T02. `/api/ready` reflects model + store loaded
- [ ] T03. Unknown route → clean 404; bad body → 422 with friendly message

**Chunker**
- [x] T04. Python function → exact 1-indexed start/end + symbol name
- [x] T05. Python class and method captured with correct type
- [x] T06. Decorated function includes the `@decorator` line, no duplicate chunk
- [x] T07. Top-level imports/constants captured as a `<module>` chunk
- [x] T08. JS function + arrow-const function captured
- [x] T09. TS interface and type alias captured
- [x] T10. `.tsx` parsed with tsx grammar (JSX component, no parse error)
- [x] T11. Oversized function → multiple sub-chunks with contiguous correct lines
- [x] T12. Unsupported extension → text fallback chunks (no crash)
- [x] T13. Non-utf8 / odd bytes file → does not crash, decodes with replace

**Embedder / store / cache**
- [x] T14. Embedder returns a 384-dim vector
- [x] T15. Query and passage embedding are produced consistently
- [x] T16. Chroma add then query returns the chunk + correct metadata
- [x] T17. Store returns the nearest chunk by similarity
- [x] T18. Dimension mismatch on swap → clear error (not raw 500)
- [x] T19. Same code → same chunk id; different code → different id
- [x] T20. Re-embedding unchanged code adds 0 vectors (counting fake embedder)
- [x] T21. Editing one chunk re-embeds only that chunk, siblings untouched

**Ingest pipeline**
- [x] T22. Walker filters junk (node_modules/.git) and honors ext allowlist
- [x] T23. Symlink escaping the root is rejected
- [x] T24. Cloner: malformed URL → 4xx (validated before any clone)
- [x] T25. Cloner: clone failure/timeout handled → 4xx, no hang
- [x] T26. Ingest fixture repo → chunks added > 0
- [x] T27. Re-ingest same repo → chunks added == 0 (all cached)
- [x] T28. Ingest a folder with 0 supported files → clear error
- [x] T28b. Endpoint: local_path ingests; missing input → 400; bad repo URL → 400

**Retrieval**
- [x] T29. Tokenizer splits camelCase and snake_case identifiers
- [x] T30. Exact symbol query returns that chunk in the results
- [x] T31. Natural-language query returns the relevant chunk (fake deterministic embedder)
- [x] T32. Retrieval on an empty index → returns `[]`, no crash
- [x] T33. Results are exactly top-5 and stable for fixed inputs

**Answers / LLM**
- [x] T34. Prompt string contains the refusal rule + numbered file:line context blocks
- [x] T35. LLM client success → returns text (mocked, no network)
- [x] T36. Simulated 429 → fall back to the second model
- [x] T37. Simulated 402 (no credit) → clear error, not a 500
- [x] T38. `/api/models` lists models with correct `available` flags
- [x] T39. `/api/ask` (mock LLM) → answer + citation + retrieved_chunk_ids
- [x] T40. `/api/ask` on empty index → retrieved_chunk_ids == [] and citations == []
- [x] T41. Returned citations map to retrieved chunks and are 1-indexed
- [x] T41b. Citations accept varied brackets ([ ], 【 】, ( )) and lines inside a chunk
- [x] T42. Log record has all required keys; token_usage defaults to 0 when omitted

**Conversation / extra endpoints**
- [x] T43. Follow-up question carries prior turns into the prompt
- [ ] T44. `/api/file` returns the exact requested line range
- [ ] T45. Endpoint detector finds routes in a sample file
- [ ] T46. Chat history save → load roundtrip

**Quality / e2e**
- [ ] T47. Eval script runs on the golden set and reports a hit-rate number
- [ ] T48. Frontend `api.ts` calls the right URL/shape (mocked fetch)
- [ ] T49. End-to-end: ingest demo repo → ask a known question → correct file cited

---

## 🧩 Feature catalogue (what the finished app does)

| Feature | Priority | Status |
|---|---|---|
| Ingest public GitHub repo | core | ☐ |
| Ingest local folder (sandboxed) | core | ☐ |
| AST chunking (py/js/ts/tsx) with line metadata | core | ☐ |
| Local free embeddings (bge-small) | core | ☐ |
| Hybrid retrieval (semantic + keyword, RRF) | core | ☐ |
| Grounded answers with file:line citations | core | ☐ |
| Click citation → view highlighted code | core | ☐ |
| Pick the AI model (free + cheapest paid) | core | ☐ |
| Conversational follow-ups | core | ☐ |
| Streaming answers | polish | ☐ |
| Repo overview on ingest | polish | ☐ |
| Suggested starter questions | polish | ☐ |
| List API endpoints | polish | ☐ |
| Chat history | polish | ☐ |
| Quality eval (hit-rate) | polish | ☐ |
| Observability dashboard | polish | ☐ |
| JSON query logs | core | ☐ |
| One-command Docker run | core | ☐ |
| CI on push | core | ☐ |
| File-tree browser | stretch | ☐ |
| Dependency graph | stretch | ☐ |

---

## 🏁 Definition of Done (whole project)
- [ ] Every `(core)` step above is checked.
- [ ] Every `(core)` test in the inventory passes; coverage ≥ 80% on logic.
- [ ] `docker compose up` from a clean clone runs the whole app and a demo repo works.
- [ ] README is complete (diagrams + productionize), with the `✍️` sections written in Dave's voice.
- [ ] Screenshots + short demo video are in the repo.
- [ ] Repo is on GitHub, history is clean, all commits authored by Dave.
- [ ] No secrets committed; `.env.example` is complete.

*Core first, then polish, then stretch. We do not start a flashy extra while a core box is empty.*
