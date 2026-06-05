// Component tests for the redesigned App: ingest → workspace, ask → answer, ingest error.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    ingestStream: vi.fn(),
    setMode: vi.fn(),
    stats: vi.fn(),
    overview: vi.fn(),
    graph: vi.fn(),
    models: vi.fn(),
    askStream: vi.fn(),
    file: vi.fn(),
    endpoints: vi.fn(),
    symbols: vi.fn(),
    saveHistory: vi.fn(),
    loadHistory: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(api.models).mockResolvedValue({
    models: [{ id: "m", label: "Model", tier: "free", note: "", available: true }],
    default: "m",
  });
  vi.mocked(api.stats).mockResolvedValue({
    files: 3,
    chunks: 10,
    languages: [
      { language: "python", files: 2, chunks: 7 },
      { language: "typescript", files: 1, chunks: 3 },
    ],
  });
  vi.mocked(api.overview).mockResolvedValue({ overview: "An assistant." });
  vi.mocked(api.graph).mockResolvedValue({
    nodes: [{ id: "a", label: "a.py", language: "python" }],
    edges: [],
  });
  vi.mocked(api.endpoints).mockResolvedValue([{ method: "POST", path: "/api/ask" }]);
  vi.mocked(api.symbols).mockResolvedValue([
    { file_path: "a.py", symbol_name: "f", type: "function", start_line: 1, end_line: 2 },
  ]);
  vi.mocked(api.saveHistory).mockResolvedValue({ session_id: "s1" });
  vi.mocked(api.setMode).mockResolvedValue({ mode: "careful", backend: "local" });
  localStorage.clear();
  // Default: the stream walks a few stages, then resolves with the final summary.
  vi.mocked(api.ingestStream).mockImplementation(async (_body, handlers) => {
    handlers.onEvent({ stage: "walk", files: 3 });
    handlers.onEvent({ stage: "embed", done: 3, total: 3 });
    handlers.onDone({ stage: "done", files: 3, languages: ["python"], added: 3, cached: 0 });
  });
});

afterEach(() => vi.clearAllMocks());

async function ingest(user: ReturnType<typeof userEvent.setup>, path: string) {
  await user.type(screen.getByPlaceholderText(/github\.com/i), path);
  await user.click(screen.getByRole("button", { name: /ingest/i }));
}

describe("App", () => {
  it("ingests a local path and moves into the workspace", async () => {
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");

    expect(await screen.findByText(/ask anything about this code/i)).toBeTruthy();
    expect(api.ingestStream).toHaveBeenCalledWith({ local_path: "app" }, expect.anything());
  });

  it("renders a streamed answer after asking", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("Login ");
      handlers.onFinal({
        answer: "Login lives in auth.py.",
        citations: [],
        retrieved_chunk_ids: ["x"],
        sources: [],
        meta: {
          model: "m",
          latency_ms: 100,
          token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    await screen.findByText(/ask anything about this code/i);

    // The first starter question is always the repo-aligned overview prompt.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();
  });

  it("shows an error toast when ingest fails", async () => {
    vi.mocked(api.ingestStream).mockImplementation(async (_body, handlers) => {
      handlers.onError("clone failed");
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");

    expect(await screen.findByText("clone failed")).toBeTruthy();
    // Still on the landing page (the ingest box is still there).
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeTruthy();
  });
});
