// Component tests for the redesigned App: ingest → workspace, ask → answer, ingest error.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    ingest: vi.fn(),
    stats: vi.fn(),
    overview: vi.fn(),
    graph: vi.fn(),
    models: vi.fn(),
    askStream: vi.fn(),
    file: vi.fn(),
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
  vi.mocked(api.graph).mockResolvedValue({ nodes: [{ id: "a", label: "a.py", language: "python" }], edges: [] });
  vi.mocked(api.ingest).mockResolvedValue({ files: 3, added: 3, cached: 0, languages: ["python"] });
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
    expect(api.ingest).toHaveBeenCalledWith({ local_path: "app" });
  });

  it("renders a streamed answer after asking", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("Login ");
      handlers.onFinal({
        answer: "Login lives in auth.py.",
        citations: [],
        retrieved_chunk_ids: ["x"],
        sources: [],
        meta: { model: "m", latency_ms: 100, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
      });
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    await screen.findByText(/ask anything about this code/i);

    await user.click(screen.getByText("What does this codebase do?"));
    expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();
  });

  it("shows an error toast when ingest fails", async () => {
    vi.mocked(api.ingest).mockRejectedValue(new Error("clone failed"));
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");

    expect(await screen.findByText("clone failed")).toBeTruthy();
    // Still on the landing page (the ingest box is still there).
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeTruthy();
  });
});
