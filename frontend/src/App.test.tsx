// Component tests for the main App: the ingest button flow (success and error) and the
// ask flow. The api module and the heavy graph view are mocked so these run fast and
// offline, exercising the real buttons and state, not the network.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api";

// jsdom does not implement scrollTo, which the app calls to keep the chat scrolled to the
// newest message. It is a real browser API, so we stub it rather than change the app.
Element.prototype.scrollTo = vi.fn();

// The graph view pulls in a canvas/WebGL library that does not run under jsdom; stub it.
vi.mock("./components/GraphView", () => ({ GraphView: () => null }));

// Replace the whole api module with controllable fakes.
vi.mock("./api", () => ({
  api: {
    models: vi.fn(),
    ingest: vi.fn(),
    overview: vi.fn(),
    graph: vi.fn(),
    ask: vi.fn(),
    askStream: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(api.models).mockResolvedValue({ models: [], default: "" });
  vi.mocked(api.overview).mockResolvedValue({ overview: "" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Type a path into the ingest box and click the Ingest button. */
async function ingest(user: ReturnType<typeof userEvent.setup>, path: string) {
  await user.type(screen.getByPlaceholderText(/github\.com/i), path);
  await user.click(screen.getByRole("button", { name: /ingest/i }));
}

describe("App ingest flow", () => {
  it("moves to the workspace after a successful ingest", async () => {
    vi.mocked(api.ingest).mockResolvedValue({
      files: 3,
      added: 3,
      cached: 0,
      languages: ["python"],
    });
    const user = userEvent.setup();
    render(<App />);

    await ingest(user, "app");

    // The empty workspace shows its prompt once ingest succeeds.
    expect(await screen.findByText(/ask anything about this code/i)).toBeTruthy();
    expect(api.ingest).toHaveBeenCalledWith({ local_path: "app" });
  });

  it("shows an error toast and stays on the landing page when ingest fails", async () => {
    // This is exactly the stuck-button case: a failed/timed-out ingest must surface an
    // error and re-enable the button, never spin forever.
    vi.mocked(api.ingest).mockRejectedValue(new Error("the request timed out"));
    const user = userEvent.setup();
    render(<App />);

    await ingest(user, "app");

    expect(await screen.findByText("the request timed out")).toBeTruthy();
    // Still on the landing page (the ingest box is still there) and the button is back.
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /ingest →/i })).toBeTruthy(),
    );
  });
});

describe("App ask flow", () => {
  it("renders the streamed answer after asking a question", async () => {
    vi.mocked(api.ingest).mockResolvedValue({
      files: 1,
      added: 1,
      cached: 0,
      languages: ["python"],
    });
    // Drive the stream handlers straight to a final answer.
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("Login ");
      handlers.onFinal({
        answer: "Login lives in auth.py.",
        citations: [],
        retrieved_chunk_ids: ["x"],
        sources: [],
        meta: {
          model: "test/model",
          latency_ms: 100,
          token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    await screen.findByText(/ask anything about this code/i);

    await user.type(screen.getByPlaceholderText(/ask about the code/i), "where is login{Enter}");

    expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();
    expect(api.askStream).toHaveBeenCalledOnce();
  });
});
