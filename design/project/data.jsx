// data.jsx — Glyph indexing its OWN codebase.
// Shapes match the real backend: IngestResponse, AskResponse, sources[], meta{}, GraphData, etc.

const GLYPH = {
  repo: {
    owner: "glyph-dev", name: "glyph", branch: "main", url: "https://github.com/glyph-dev/glyph",
    ownerType: "Organization", visibility: "Public", stars: "1.2k", license: "MIT",
    description: "Code-documentation assistant — ask your repo, get answers grounded in the real code.",
    lastIndexed: "just now", lastCommit: "2d ago",
  },

  // tech stack inferred from the index (shown in Overview)
  stack: ["TypeScript", "React", "Vite", "Python", "FastAPI", "sentence-transformers"],

  // IngestResponse = { files, added, cached, languages }
  ingest: { files: 48, added: 312, cached: 1196, languages: ["TypeScript", "Python", "CSS", "Markdown"] },

  stats: { files: 48, chunks: 1508, cached: 1196 },

  languages: [
    { name: "TypeScript", pct: 51, color: "var(--lang-ts)" },
    { name: "Python", pct: 34, color: "var(--lang-py)" },
    { name: "CSS", pct: 11, color: "var(--lang-css)" },
    { name: "Markdown", pct: 4, color: "var(--lang-md)" },
  ],

  // GET /api/overview → { overview }
  overview:
    "**Glyph** is a code-documentation assistant. It ingests a repository, chunks every file " +
    "by symbol, and builds **local embeddings** so questions can be answered with retrieval-augmented " +
    "generation. A FastAPI backend exposes `/api/ingest`, `/api/ask` and a streaming variant; the " +
    "React + TypeScript client renders grounded answers with exact **file and line citations** so every " +
    "claim can be traced back to source.",

  // GraphData = { nodes:[{id,label,language}], edges:[{source,target}] }
  graph: {
    nodes: [
      { id: "app", label: "App.tsx", language: "TypeScript", path: "src/App.tsx" },
      { id: "answer", label: "Answer.tsx", language: "TypeScript", path: "src/components/Answer.tsx" },
      { id: "codepanel", label: "CodePanel.tsx", language: "TypeScript", path: "src/components/CodePanel.tsx" },
      { id: "graphview", label: "GraphView.tsx", language: "TypeScript", path: "src/components/GraphView.tsx" },
      { id: "modelpicker", label: "ModelPicker.tsx", language: "TypeScript", path: "src/components/ModelPicker.tsx" },
      { id: "projectpanel", label: "ProjectPanel.tsx", language: "TypeScript", path: "src/components/ProjectPanel.tsx" },
      { id: "palette", label: "CommandPalette.tsx", language: "TypeScript", path: "src/components/CommandPalette.tsx" },
      { id: "api", label: "api.ts", language: "TypeScript", path: "src/api.ts" },
      { id: "types", label: "types.ts", language: "TypeScript", path: "src/types.ts" },
      { id: "main", label: "main.py", language: "Python", path: "server/main.py" },
      { id: "ingest", label: "ingest.py", language: "Python", path: "server/ingest.py" },
      { id: "ask", label: "ask.py", language: "Python", path: "server/ask.py" },
      { id: "retrieval", label: "retrieval.py", language: "Python", path: "server/retrieval.py" },
      { id: "embeddings", label: "embeddings.py", language: "Python", path: "server/embeddings.py" },
      { id: "models", label: "models.py", language: "Python", path: "server/models.py" },
      { id: "store", label: "store.py", language: "Python", path: "server/store.py" },
    ],
    edges: [
      { source: "app", target: "answer" }, { source: "app", target: "projectpanel" },
      { source: "app", target: "codepanel" }, { source: "app", target: "palette" },
      { source: "app", target: "modelpicker" }, { source: "app", target: "api" },
      { source: "answer", target: "codepanel" }, { source: "answer", target: "types" },
      { source: "projectpanel", target: "graphview" }, { source: "projectpanel", target: "api" },
      { source: "graphview", target: "types" }, { source: "codepanel", target: "types" },
      { source: "modelpicker", target: "api" }, { source: "api", target: "types" },
      { source: "main", target: "ingest" }, { source: "main", target: "ask" },
      { source: "main", target: "models" }, { source: "ask", target: "retrieval" },
      { source: "ask", target: "models" }, { source: "retrieval", target: "embeddings" },
      { source: "retrieval", target: "store" }, { source: "ingest", target: "embeddings" },
      { source: "ingest", target: "store" }, { source: "embeddings", target: "store" },
    ],
  },

  // computed from edge in-degree, precomputed here
  topFiles: [
    { name: "types.ts", path: "src/types.ts", count: 4 },
    { name: "store.py", path: "server/store.py", count: 4 },
    { name: "embeddings.py", path: "server/embeddings.py", count: 2 },
    { name: "api.ts", path: "src/api.ts", count: 4 },
    { name: "retrieval.py", path: "server/retrieval.py", count: 1 },
    { name: "models.py", path: "server/models.py", count: 2 },
  ],

  endpoints: [
    { method: "POST", path: "/api/ingest" },
    { method: "POST", path: "/api/ask" },
    { method: "POST", path: "/api/ask/stream" },
    { method: "GET", path: "/api/models" },
    { method: "GET", path: "/api/overview" },
    { method: "GET", path: "/api/graph" },
    { method: "GET", path: "/api/health" },
  ],

  // GET /api/models → ModelInfo[]
  models: [
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "free", note: "Default · grounded, fast", available: true },
    { id: "qwen/qwen-2.5-coder-32b", label: "Qwen 2.5 Coder 32B", tier: "free", note: "Tuned for code reasoning", available: true },
    { id: "mistralai/mistral-small", label: "Mistral Small", tier: "free", note: "Lightweight, lowest latency", available: true },
    { id: "anthropic/claude-sonnet", label: "Claude Sonnet", tier: "paid", note: "Add an API key to enable", available: false },
  ],

  recent: [
    { owner: "glyph-dev", name: "glyph", when: "now" },
    { owner: "fastapi", name: "fastapi", when: "2d" },
    { owner: "honojs", name: "hono", when: "5d" },
    { owner: "pallets", name: "flask", when: "1w" },
  ],

  suggestions: [
    { q: "What does this codebase do?", hint: "High-level overview", icon: "compass" },
    { q: "Where are the API endpoints defined?", hint: "Routing & handlers", icon: "route" },
    { q: "How does retrieval work?", hint: "Embeddings + ranking", icon: "search" },
    { q: "Walk me through the main data flow.", hint: "Ingest → ask → answer", icon: "flow" },
  ],
};

// ── Prebuilt source chunks (sources[] in AskResponse) ───────────────────────
const SRC = {
  retrieval: {
    id: "src_retrieval_4f", file_path: "server/retrieval.py", symbol_name: "retrieve", type: "function",
    start_line: 18, end_line: 41, language: "Python",
    code: `def retrieve(query: str, k: int = 6) -> list[Chunk]:
    """Embed the query, rank chunks by cosine similarity, return top-k."""
    q_vec = embed_one(query)
    scored: list[tuple[float, Chunk]] = []

    for chunk in store.all_chunks():
        score = cosine(q_vec, chunk.vector)
        scored.append((score, chunk))

    scored.sort(key=lambda s: s[0], reverse=True)
    top = [c for _, c in scored[:k]]

    # Drop anything below the floor so weak matches never ground an answer.
    return [c for c in top if cosine(q_vec, c.vector) >= MIN_SCORE]`,
  },
  embeddings: {
    id: "src_embed_2a", file_path: "server/embeddings.py", symbol_name: "embed_one", type: "function",
    start_line: 9, end_line: 21, language: "Python",
    code: `_model = SentenceTransformer(MODEL_NAME, device="cpu")

def embed_one(text: str) -> list[float]:
    """Local embedding — no network, no key, runs on CPU."""
    vec = _model.encode(text, normalize_embeddings=True)
    return vec.tolist()

def embed_batch(texts: list[str]) -> list[list[float]]:
    vecs = _model.encode(texts, normalize_embeddings=True, batch_size=32)
    return [v.tolist() for v in vecs]`,
  },
  ask: {
    id: "src_ask_9c", file_path: "server/ask.py", symbol_name: "ask", type: "route",
    start_line: 24, end_line: 47, language: "Python",
    code: `@router.post("/api/ask")
async def ask(req: AskRequest) -> AskResponse:
    chunks = retrieve(req.question, k=req.k)
    if not chunks:
        return AskResponse(answer="Not found in the indexed code.",
                           citations=[], sources=[])

    prompt = build_prompt(req.question, chunks)
    answer, usage = await llm.complete(prompt, model=req.model)

    return AskResponse(
        answer=answer,
        citations=cite(chunks),
        sources=[c.as_source() for c in chunks],
        meta=Meta(model=req.model, latency_ms=timer.ms(), token_usage=usage),
    )`,
  },
  ingest: {
    id: "src_ingest_7b", file_path: "server/ingest.py", symbol_name: "ingest_repo", type: "route",
    start_line: 31, end_line: 52, language: "Python",
    code: `@router.post("/api/ingest")
async def ingest_repo(req: IngestRequest) -> IngestResponse:
    root = clone_or_path(req.source)
    files = list(walk_source_files(root))

    added = cached = 0
    for path in files:
        for chunk in chunk_by_symbol(path):
            if store.has(chunk.id):
                cached += 1
                continue
            chunk.vector = embed_one(chunk.code)
            store.put(chunk)
            added += 1

    langs = sorted({detect_language(p) for p in files})
    return IngestResponse(files=len(files), added=added,
                          cached=cached, languages=langs)`,
  },
  app: {
    id: "src_app_1d", file_path: "src/App.tsx", symbol_name: "App", type: "component",
    start_line: 22, end_line: 40, language: "TypeScript",
    code: `export function App() {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cite, setCite] = useState<Citation | null>(null);

  async function send(question: string) {
    const res = await api.ask({ question, model });
    setMessages((m) => [...m, userMsg(question), answerMsg(res)]);
  }

  if (!repo) return <Landing onIngest={setRepo} />;
  return (
    <Workspace repo={repo} messages={messages}
               onSend={send} onCite={setCite} cite={cite} />
  );
}`,
  },
  api: {
    id: "src_api_5e", file_path: "src/api.ts", symbol_name: "ask", type: "function",
    start_line: 14, end_line: 27, language: "TypeScript",
    code: `export async function ask(req: AskRequest): Promise<AskResponse> {
  const res = await fetch(\`\${BASE}/api/ask\`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<AskResponse>;
}`,
  },
  answer: {
    id: "src_answer_3f", file_path: "src/components/Answer.tsx", symbol_name: "Answer", type: "component",
    start_line: 17, end_line: 33, language: "TypeScript",
    code: `export function Answer({ msg, onCite }: AnswerProps) {
  return (
    <div className="answer">
      <Markdown>{msg.answer}</Markdown>
      <Grounding count={msg.sources.length} />
      <MetaLine meta={msg.meta} />
      <Citations chips={msg.citations} onClick={onCite} />
      <Sources rows={msg.sources} onOpen={onCite} />
    </div>
  );
}`,
  },
};

// ── Prebuilt conversations (AskResponse-shaped) ─────────────────────────────
GLYPH.answers = {
  "How does retrieval work?": {
    answer:
      "Retrieval is the **R** in Glyph's RAG loop — it turns your question into a vector and finds the closest code chunks.\n\n" +
      "### The flow\n" +
      "1. The question is embedded **locally** with a sentence-transformer — no network, no API key.\n" +
      "2. Every stored chunk's vector is compared by `cosine` similarity.\n" +
      "3. The top-`k` (default **6**) are kept, then anything below `MIN_SCORE` is dropped so weak matches never ground an answer.\n\n" +
      "```python\nq_vec = embed_one(query)\nscored.sort(key=lambda s: s[0], reverse=True)\nreturn [c for c in top if cosine(q_vec, c.vector) >= MIN_SCORE]\n```\n\n" +
      "Those surviving chunks become the **sources** you see below, and their file ranges become the **citations**.",
    citations: [
      { file_path: "server/retrieval.py", start_line: 18, end_line: 41 },
      { file_path: "server/embeddings.py", start_line: 9, end_line: 21 },
    ],
    sources: [SRC.retrieval, SRC.embeddings, SRC.ask],
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: 13500, token_usage: { prompt_tokens: 1204, completion_tokens: 435, total_tokens: 1639 } },
    followups: ["What embedding model is used?", "How is MIN_SCORE chosen?", "Where does ranking happen?"],
  },
  "Where are the API endpoints defined?": {
    answer:
      "All routes are registered on FastAPI routers and mounted in `main.py`. There are **seven**:\n\n" +
      "- `POST /api/ingest` — clone or read a path, chunk + embed, return counts.\n" +
      "- `POST /api/ask` — retrieve, build the prompt, call the model.\n" +
      "- `POST /api/ask/stream` — same, streamed as Server-Sent Events.\n" +
      "- `GET /api/models`, `GET /api/overview`, `GET /api/graph`, `GET /api/health`.\n\n" +
      "The `ask` handler is the heart of it — it short-circuits to a **Not found** answer when retrieval comes back empty, which is the guardrail that keeps answers honest.",
    citations: [
      { file_path: "server/ask.py", start_line: 24, end_line: 47 },
      { file_path: "server/ingest.py", start_line: 31, end_line: 52 },
    ],
    sources: [SRC.ask, SRC.ingest, SRC.retrieval],
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: 9800, token_usage: { prompt_tokens: 980, completion_tokens: 372, total_tokens: 1352 } },
    followups: ["What does the ingest handler return?", "How does streaming work?", "Show me the health check."],
  },
  "What does this codebase do?": {
    answer:
      "Glyph is a **code-documentation assistant**. You point it at a repo; it answers questions about that code and shows the exact file + line it pulled from.\n\n" +
      "### Two halves\n" +
      "- A **Python / FastAPI** backend that ingests source, chunks it by symbol, embeds it locally, and answers via retrieval-augmented generation.\n" +
      "- A **React + TypeScript** client (`App.tsx`) that renders grounded answers, citations and a live project-intelligence panel.\n\n" +
      "The whole thing runs **free and local** — local embeddings plus a free LLM — so there's no key required to try it.",
    citations: [
      { file_path: "src/App.tsx", start_line: 22, end_line: 40 },
      { file_path: "server/ingest.py", start_line: 31, end_line: 52 },
    ],
    sources: [SRC.app, SRC.ingest, SRC.api],
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: 11200, token_usage: { prompt_tokens: 1043, completion_tokens: 398, total_tokens: 1441 } },
    followups: ["How does retrieval work?", "Walk me through the main data flow.", "What's in the React client?"],
  },
  "Walk me through the main data flow.": {
    answer:
      "Here's the path a question takes end to end:\n\n" +
      "### Ingest (once per repo)\n" +
      "`ingest_repo` walks the source, splits each file into symbol-level chunks, embeds the new ones with `embed_one`, and stores them. Already-seen chunks are **cached**, which is why re-ingesting is fast.\n\n" +
      "### Ask (per question)\n" +
      "1. `App.send` POSTs to `/api/ask`.\n" +
      "2. `ask` calls `retrieve` → top-k chunks.\n" +
      "3. It builds a grounded prompt and calls the model.\n" +
      "4. It returns the answer **plus** `citations`, `sources` and `meta`.\n\n" +
      "The client's `Answer` component then renders the markdown, the grounding badge, the metrics line and the citation chips you can click to open the code.",
    citations: [
      { file_path: "src/App.tsx", start_line: 22, end_line: 40 },
      { file_path: "server/ask.py", start_line: 24, end_line: 47 },
      { file_path: "src/components/Answer.tsx", start_line: 17, end_line: 33 },
    ],
    sources: [SRC.app, SRC.ask, SRC.answer, SRC.retrieval],
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: 15900, token_usage: { prompt_tokens: 1388, completion_tokens: 511, total_tokens: 1899 } },
    followups: ["How are chunks cached?", "What does build_prompt include?", "How does retrieval rank chunks?"],
  },
  // Guardrail / "Not found" example
  "Does Glyph support voice input?": {
    answer:
      "Not found in the indexed code. I searched the repository and there's no audio capture, speech-to-text, or microphone handling — Glyph's only input path is the text composer in the chat client. If you add it later, re-ingest and ask again.",
    citations: [],
    sources: [],
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: 4200, token_usage: { prompt_tokens: 612, completion_tokens: 88, total_tokens: 700 } },
    followups: ["What input methods exist?", "How does the composer work?"],
  },
};

// session latency samples for sparkline (ms)
GLYPH.latencies = [9800, 13500, 11200, 15900, 8400, 12100, 10600];

// flatten all sources for ⌘K file/symbol search
GLYPH.allSources = Object.values(SRC);

window.GLYPH = GLYPH;
