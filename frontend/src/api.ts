// Typed wrappers around the Glyph backend. All calls go to /api (proxied to :8000 in dev).

export interface ModelInfo {
  id: string;
  label: string;
  tier: "free" | "paid";
  note: string;
  available: boolean;
}

export interface Source {
  id: string;
  file_path: string;
  symbol_name: string;
  type: string;
  start_line: number;
  end_line: number;
  code: string;
  language?: string;
}

export interface Citation {
  file_path: string;
  start_line: number;
  end_line: number;
}

export interface AnswerMeta {
  model: string;
  latency_ms: number;
  token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  stage_ms?: { retrieve_ms: number; llm_ms: number };
  cached?: boolean;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  retrieved_chunk_ids: string[];
  sources: Source[];
  meta: AnswerMeta;
}

export interface GraphNode {
  id: string;
  label: string;
  language: string;
  path?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
}

export interface LanguageStat {
  language: string;
  files: number;
  chunks: number;
}

export interface StatsResponse {
  files: number;
  chunks: number;
  languages: LanguageStat[];
}

export interface IndexedFile {
  file_path: string;
  language: string;
  code: string;
  start_line: number;
  end_line: number;
  chunks: { symbol_name: string; type: string; start_line: number; end_line: number; code: string }[];
}

export interface IngestResponse {
  files: number;
  added: number;
  cached: number;
  languages: string[];
}

// Time budgets. Most calls are quick; ingesting a repo (clone + embed) can take minutes,
// but it must still end eventually so a hung clone never leaves the UI spinning forever.
const DEFAULT_TIMEOUT_MS = 30_000;
const INGEST_TIMEOUT_MS = 180_000;

/**
 * fetch that aborts with a clear error if it runs past timeoutMs.
 * This is what stops a slow or stuck request (e.g. a clone over a bad network) from
 * hanging the UI with no feedback. Exported so the timeout behaviour can be unit tested.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("the request timed out — try a smaller repo or a local folder path", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** POST helper that times out and throws the backend's error detail on failure. */
async function post<T>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// One message off the /api/ask/stream Server-Sent Events stream.
export type StreamMessage =
  | { type: "token"; text: string }
  | ({ type: "final" } & AskResponse)
  | { type: "error"; detail: string };

export interface AskBody {
  question: string;
  model?: string | null;
  history?: { question: string; answer: string }[];
  // Per-question reranker switch: false skips the cross-encoder for a slightly faster answer.
  rerank?: boolean;
}

export interface StreamHandlers {
  onToken: (text: string) => void;
  onFinal: (res: AskResponse) => void;
  onError: (message: string) => void;
}

/**
 * Split a raw SSE buffer into its complete `data:` payload strings plus the unfinished
 * remainder. Each SSE message is a `data: {json}` line ended by a blank line; a trailing
 * block with no blank line yet is incomplete and handed back as `rest`. Kept pure (no I/O)
 * so both the answer and the ingest parsers can build on it and unit-test without a stream.
 */
function splitSSE(buffer: string): { payloads: string[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  const payloads = blocks
    .filter((block) => block.startsWith("data: "))
    .map((block) => block.slice("data: ".length));
  return { payloads, rest };
}

/** Parse the answer stream into typed messages plus any unfinished remainder. */
export function parseSSE(buffer: string): { messages: StreamMessage[]; rest: string } {
  const { payloads, rest } = splitSSE(buffer);
  return { messages: payloads.map((p) => JSON.parse(p) as StreamMessage), rest };
}

// One event off the /api/ingest/stream Server-Sent Events stream. The stage names mirror
// the backend pipeline (clone -> walk -> chunk -> embed -> done), with error as a terminal.
export type IngestEvent =
  | { stage: "clone"; status: "start" | "done" }
  | { stage: "walk"; files: number }
  | { stage: "chunk"; chunks: number }
  | { stage: "embed"; done: number; total: number }
  | { stage: "done"; files: number; languages: string[]; added: number; cached: number }
  | { stage: "error"; detail: string };

export type IngestDone = Extract<IngestEvent, { stage: "done" }>;

/** Parse the ingest stream into typed stage events plus any unfinished remainder. */
export function parseIngestSSE(buffer: string): { events: IngestEvent[]; rest: string } {
  const { payloads, rest } = splitSSE(buffer);
  return { events: payloads.map((p) => JSON.parse(p) as IngestEvent), rest };
}

export interface IngestStreamHandlers {
  onEvent: (event: IngestEvent) => void; // every progress stage (clone/walk/chunk/embed)
  onDone: (summary: IngestDone) => void; // the final summary
  onError: (message: string) => void; // bad input, failed clone, or no chunks
}

/** Ask with a live stream: tokens arrive as the answer is written, then the final payload. */
async function askStream(body: AskBody, handlers: StreamHandlers): Promise<void> {
  const res = await fetch("/api/ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    handlers.onError(data.detail ?? `request failed (${res.status})`);
    return;
  }

  // Read the response body chunk by chunk, decode to text, and drain whole SSE messages.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { messages, rest } = parseSSE(buffer);
    buffer = rest;
    for (const msg of messages) {
      if (msg.type === "token") handlers.onToken(msg.text);
      else if (msg.type === "final") handlers.onFinal(msg);
      else if (msg.type === "error") handlers.onError(msg.detail);
    }
  }
}

/** Ingest with a live stream: a stage event lands as each step starts/progresses. */
async function ingestStream(
  body: { repo_url?: string; local_path?: string },
  handlers: IngestStreamHandlers,
): Promise<void> {
  const res = await fetch("/api/ingest/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    handlers.onError(data.detail ?? `request failed (${res.status})`);
    return;
  }

  // Read the response body chunk by chunk, decode to text, and drain whole SSE events.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseIngestSSE(buffer);
    buffer = rest;
    for (const ev of events) {
      if (ev.stage === "done") handlers.onDone(ev);
      else if (ev.stage === "error") handlers.onError(ev.detail);
      else handlers.onEvent(ev);
    }
  }
}

export const api = {
  ingest: (body: { repo_url?: string; local_path?: string }) =>
    post<IngestResponse>("/api/ingest", body, INGEST_TIMEOUT_MS),

  ingestStream,

  ask: (body: AskBody) => post<AskResponse>("/api/ask", body),

  askStream,

  // Pick how the next repo is indexed: "fast" (Model2Vec, near-instant) or "careful"
  // (the transformer, slightly more precise). Call this before ingesting.
  setMode: (mode: "fast" | "careful") => post<{ mode: string; backend: string }>("/api/mode", { mode }),

  models: async (): Promise<{ models: ModelInfo[]; default: string }> => {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error("could not load models");
    return res.json();
  },

  overview: async (): Promise<{ overview: string }> => {
    const res = await fetch("/api/overview");
    if (!res.ok) throw new Error("could not load overview");
    return res.json();
  },

  graph: async (): Promise<GraphData> => {
    const res = await fetch("/api/graph");
    if (!res.ok) throw new Error("could not load graph");
    return res.json();
  },

  stats: async (): Promise<StatsResponse> => {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error("could not load stats");
    return res.json();
  },

  file: async (path: string, start?: number, end?: number): Promise<IndexedFile> => {
    const params = new URLSearchParams({ path });
    if (start != null) params.set("start", String(start));
    if (end != null) params.set("end", String(end));
    const res = await fetch(`/api/file?${params.toString()}`);
    if (!res.ok) throw new Error("could not load file");
    return res.json();
  },

  endpoints: async (): Promise<{ method: string; path: string }[]> => {
    const res = await fetch("/api/endpoints");
    if (!res.ok) throw new Error("could not load endpoints");
    return (await res.json()).endpoints;
  },

  symbols: async (): Promise<
    { file_path: string; symbol_name: string; type: string; start_line: number; end_line: number }[]
  > => {
    const res = await fetch("/api/symbols");
    if (!res.ok) throw new Error("could not load symbols");
    return (await res.json()).symbols;
  },

  saveHistory: (body: {
    repo: string;
    messages: { role: string; content: string; data: unknown }[];
    session_id?: string | null;
  }): Promise<{ session_id: string }> => post("/api/history", body),

  loadHistory: async (
    sessionId: string,
  ): Promise<{
    session_id: string;
    repo: string;
    messages: { role: string; content: string; data: unknown }[];
  }> => {
    const res = await fetch(`/api/history/${sessionId}`);
    if (!res.ok) throw new Error("could not load session");
    return res.json();
  },
};
