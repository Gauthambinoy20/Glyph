# Glyph — Code Documentation Assistant

Ask questions about any codebase and get answers grounded in the actual code, with **file + line
citations**. Ingest a public GitHub repo (or local files), then ask *"where are the API endpoints?"*,
*"how does auth work?"* — Glyph answers using only the code it found and shows you exactly where.

**Runs 100% free** (local embeddings + OpenRouter free LLM tier).

> 📔 Plain-English build story: [docs/JOURNAL.md](docs/JOURNAL.md) ·
> 🔬 Technical deep-dive: [docs/TECHNICAL_REPORT.md](docs/TECHNICAL_REPORT.md) ·
> 🗺️ Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## Quick start
<!-- filled in once the app runs (Phase 9). Will be: copy .env.example → .env, add a free
OpenRouter key, `docker compose up`, open http://localhost:5173 -->
_Coming once the skeleton lands._

## Architecture
<!-- Mermaid diagram added in Phase 9; see docs/TECHNICAL_REPORT.md for the current version. -->

## RAG / LLM approach & decisions
- **Chunking:** AST-aware via tree-sitter (by function/class) — see TECHNICAL_REPORT §1.1.
- **Embeddings:** local `bge-small` (fastembed), pluggable to OpenAI — §1.2.
- **Vector DB:** Chroma (cosine, persistent) — §1.2.
- **Retrieval:** hybrid semantic + BM25 fused with RRF, top_k=5 — §1.2.
- **LLM:** OpenRouter free tier (default `qwen/qwen3-coder:free`), user-selectable — §1.3.
- **Prompt & guardrails:** answer only from context; cite file:line; say "not found" otherwise.
- **Observability:** one JSON log line per query (ids, latency, tokens).

## Productionizing & scaling on a hyperscaler
<!-- ✍️ YOU WRITE: how you'd deploy/scale on AWS/GCP/Azure/Cloudflare. Notes to expand in your
voice: managed vector DB (e.g. pgvector/Pinecone) vs self-hosted Chroma; embeddings as a service or
a GPU worker; object storage for cloned repos; queue for async ingest; per-user isolation/auth;
autoscaling the API; caching; rate limits; secrets manager. -->

## Key technical decisions & why
<!-- ✍️ YOU WRITE in your own voice. Draft notes live in docs/JOURNAL.md "Decisions made so far". -->

## Engineering standards I followed (and skipped)
<!-- ✍️ YOU WRITE. Kept: pinned deps, type hints, per-slice tests, explicit error handling, no
secrets. Skipped (and why): auth, exhaustive language support, concurrency hardening, frontend tests. -->

## How I used AI tools in development
<!-- ✍️ YOU WRITE. Your do's/don'ts: how you kept the code to your standard, where you trusted AI
output vs. wrote things yourself, how you made it repeatable (written engineering standards, per-slice approval). -->

## What I'd do differently with more time
<!-- ✍️ YOU WRITE. -->

## Edge cases knowingly skipped
<!-- ✍️ YOU WRITE. e.g. giant repos, binary files, non-UTF8 source, private repos, rate-limit storms. -->

## License
<!-- choose one -->
