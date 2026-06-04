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

export interface AskResponse {
  answer: string;
  citations: Citation[];
  retrieved_chunk_ids: string[];
  sources: Source[];
}

export interface IngestResponse {
  files: number;
  added: number;
  cached: number;
  languages: string[];
}

/** POST helper that throws the backend's error detail on failure. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  ingest: (body: { repo_url?: string; local_path?: string }) =>
    post<IngestResponse>("/api/ingest", body),

  ask: (body: {
    question: string;
    model?: string | null;
    history?: { question: string; answer: string }[];
  }) => post<AskResponse>("/api/ask", body),

  models: async (): Promise<{ models: ModelInfo[]; default: string }> => {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error("could not load models");
    return res.json();
  },
};
