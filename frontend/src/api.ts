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
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  retrieved_chunk_ids: string[];
  sources: Source[];
  meta: AnswerMeta;
}

export interface GraphData {
  nodes: { id: string; label: string; language: string }[];
  edges: { source: string; target: string }[];
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
      throw new Error("the request timed out — try a smaller repo or a local folder path");
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
}

export interface StreamHandlers {
  onToken: (text: string) => void;
  onFinal: (res: AskResponse) => void;
  onError: (message: string) => void;
}

/**
 * Split a raw SSE buffer into complete JSON messages plus the unfinished remainder.
 * Each SSE message is a `data: {json}` line ended by a blank line. Kept pure (no I/O)
 * and exported so it can be unit tested without a live stream.
 */
export function parseSSE(buffer: string): { messages: StreamMessage[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? ""; // a trailing block with no blank line yet is incomplete
  const messages = blocks
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice("data: ".length)) as StreamMessage);
  return { messages, rest };
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

export const api = {
  ingest: (body: { repo_url?: string; local_path?: string }) =>
    post<IngestResponse>("/api/ingest", body, INGEST_TIMEOUT_MS),

  ask: (body: AskBody) => post<AskResponse>("/api/ask", body),

  askStream,

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
};
