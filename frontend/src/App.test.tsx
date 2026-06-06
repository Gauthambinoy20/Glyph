// Component tests for the redesigned App: ingest → workspace, ask → answer, ingest error,
// plus the model picker, graph modal, history persistence, rerank toggle, command palette,
// toasts, and the ask error branch.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api";
import type { AskResponse } from "./api";

vi.mock("./api", () => ({
  api: {
    ingestStream: vi.fn(),
    setMode: vi.fn(),
    stats: vi.fn(),
    stack: vi.fn(),
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

// A 2D-context stub: the canvas force-graph draws when ResizeObserver gives it a size, so
// give getContext a no-op context (test-setup globally returns null, which skips drawing).
function mockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setTransform: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
  };
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
}

// A ResizeObserver that immediately reports a real size so GraphModal's effect sets dims and
// renders the ForceGraph at non-zero width/height.
function mockResizeObserver() {
  const orig = globalThis.ResizeObserver;
  class RO {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb(
        [{ contentRect: { width: 800, height: 500 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  return () => {
    (globalThis as unknown as { ResizeObserver: typeof orig }).ResizeObserver = orig;
  };
}

// A reusable final answer payload for askStream.onFinal.
function finalAnswer(over: Partial<AskResponse> = {}): AskResponse {
  return {
    answer: "Login lives in auth.py.",
    citations: [],
    retrieved_chunk_ids: ["x"],
    sources: [
      {
        id: "auth.py:10",
        file_path: "auth.py",
        symbol_name: "login",
        type: "function",
        start_line: 10,
        end_line: 20,
        code: "def login():\n    pass\n",
        language: "python",
      },
    ],
    meta: {
      model: "openrouter/m",
      latency_ms: 1200,
      token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 42 },
      stage_ms: { retrieve_ms: 50, llm_ms: 800 },
      cached: false,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(api.models).mockResolvedValue({
    models: [
      { id: "m", label: "Model", tier: "free", note: "fast and free", available: true },
      { id: "m2", label: "Model Two", tier: "paid", note: "smarter", available: true },
    ],
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
  vi.mocked(api.overview).mockResolvedValue({ overview: "An assistant. It indexes code." });
  vi.mocked(api.graph).mockResolvedValue({
    nodes: [
      { id: "a", label: "a.py", language: "python" },
      { id: "b", label: "b.ts", language: "typescript" },
    ],
    edges: [{ source: "a", target: "b" }],
  });
  vi.mocked(api.endpoints).mockResolvedValue([{ method: "POST", path: "/api/ask" }]);
  vi.mocked(api.stack).mockResolvedValue([{ name: "FastAPI", package: "fastapi", files: 2 }]);
  vi.mocked(api.symbols).mockResolvedValue([
    { file_path: "a.py", symbol_name: "f", type: "function", start_line: 1, end_line: 2 },
  ]);
  vi.mocked(api.saveHistory).mockResolvedValue({ session_id: "s1" });
  vi.mocked(api.setMode).mockResolvedValue({ mode: "fast", backend: "static" });
  localStorage.clear();
  // Default: the stream walks a few stages, then resolves with the final summary.
  vi.mocked(api.ingestStream).mockImplementation(async (_body, handlers) => {
    handlers.onEvent({ stage: "walk", files: 3 });
    handlers.onEvent({ stage: "embed", done: 3, total: 3 });
    handlers.onDone({ stage: "done", files: 3, languages: ["python"], added: 3, cached: 0 });
  });
});

afterEach(() => {
  // Safety net: if a fake-timer test throws before restoring real timers, the leak would
  // freeze every later test's async queries. Always hand back real timers between tests.
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function ingest(user: ReturnType<typeof userEvent.setup>, path: string) {
  await user.type(screen.getByPlaceholderText(/github\.com/i), path);
  await user.click(screen.getByRole("button", { name: /ingest/i }));
}

// Render, ingest "app", and wait for the workspace.
async function intoWorkspace(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await ingest(user, "app");
  await screen.findByText(/ask anything about this code/i);
}

// askStream that streams a token then resolves with `final`.
function streamFinal(over: Partial<AskResponse> = {}) {
  vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
    handlers.onToken("Login ");
    handlers.onFinal(finalAnswer(over));
  });
}

describe("App", () => {
  it("ingests a local path and moves into the workspace", async () => {
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");

    expect(await screen.findByText(/ask anything about this code/i)).toBeTruthy();
    expect(api.ingestStream).toHaveBeenCalledWith({ local_path: "app" }, expect.anything());
  });

  it("ingests a github URL as repo_url and parses the owner/name", async () => {
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "https://github.com/pmndrs/zustand");
    await screen.findByText(/ask anything about this code/i);

    expect(api.ingestStream).toHaveBeenCalledWith(
      { repo_url: "https://github.com/pmndrs/zustand" },
      expect.anything(),
    );
    // The repo chip in the nav shows the parsed owner/name.
    expect(screen.getByText("pmndrs/zustand")).toBeTruthy();
  });

  it("renders a streamed answer after asking, then persists it via saveHistory", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    // The first starter question is always the repo-aligned overview prompt.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();

    // After an answer lands, the chat is saved to history (best-effort) and the session id
    // is mirrored into localStorage for this repo.
    await waitFor(() => expect(api.saveHistory).toHaveBeenCalled());
    expect(localStorage.getItem("glyph:session:local/app")).toBe("s1");
    const body = vi.mocked(api.saveHistory).mock.calls[0][0];
    expect(body.repo).toBe("local/app");
    expect(body.messages.some((m) => m.role === "glyph")).toBe(true);
  });

  it("keeps the answer when saving history fails", async () => {
    streamFinal();
    // The persistence effect is best-effort: a rejected saveHistory is swallowed by its .catch.
    vi.mocked(api.saveHistory).mockRejectedValue(new Error("history backend down"));
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();
    await waitFor(() => expect(api.saveHistory).toHaveBeenCalled());
  });

  it("ignores a localStorage write failure when mirroring the session id", async () => {
    streamFinal();
    // saveHistory succeeds but localStorage.setItem throws (e.g. private mode / quota); the
    // inner try/catch swallows it so the chat is unaffected.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    try {
      const user = userEvent.setup();
      await intoWorkspace(user);

      await user.click(screen.getByText("What does this project do and how is it structured?"));
      expect(await screen.findByText("Login lives in auth.py.")).toBeTruthy();
      await waitFor(() => expect(api.saveHistory).toHaveBeenCalled());
    } finally {
      setItem.mockRestore();
    }
  });

  it("sends rerank=true by default, and rerank=false after toggling Smart sort off", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    expect(vi.mocked(api.askStream).mock.calls[0][0].rerank).toBe(true);

    // Toggle Smart sort off, then ask again — the next request carries rerank=false.
    const toggle = screen.getByRole("button", { name: /smart sort/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /smart sort off/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    await user.click(screen.getByPlaceholderText(/ask about the code/i));
    await user.keyboard("a second question{Enter}");
    await waitFor(() => expect(vi.mocked(api.askStream).mock.calls.length).toBe(2));
    expect(vi.mocked(api.askStream).mock.calls[1][0].rerank).toBe(false);
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

  it("shows an error toast when askStream calls onError, and clears the thinking state", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onError("model is over capacity");
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    expect(await screen.findByText("model is over capacity")).toBeTruthy();
    // Asking is no longer pending (the composer send button is enabled once we type).
  });

  it("shows an error toast when askStream rejects", async () => {
    vi.mocked(api.askStream).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    expect(await screen.findByText("network down")).toBeTruthy();
  });

  it("dismisses a toast after the 5s timeout", async () => {
    // Real timers keep userEvent + RTL's findBy working (RTL can't poll under vitest fake
    // timers — it has no `jest` global to detect them). Spy on setTimeout to grab the toast's
    // 5s auto-dismiss callback and fire it directly, so the test stays instant.
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.mocked(api.ingestStream).mockImplementation(async (_body, handlers) => {
      handlers.onError("boom");
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    expect(await screen.findByText("boom")).toBeTruthy();
    const dismiss = timeoutSpy.mock.calls.find(([, ms]) => ms === 5000)?.[0] as () => void;
    expect(dismiss).toBeTruthy();
    act(() => dismiss());
    await waitFor(() => expect(screen.queryByText("boom")).toBeNull());
  });

  it("opens the model picker, picks a non-default model, and closes on outside click", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    // The button shows the active model's label + tier.
    const pickBtn = screen.getByRole("button", { name: /Model free/i });
    await user.click(pickBtn);

    // The menu lists both models; pick the second (non-default) one.
    const second = await screen.findByText("Model Two");
    await user.click(second);
    // Button now reflects the new selection (paid tier).
    expect(screen.getByRole("button", { name: /Model Two paid/i })).toBeTruthy();

    // Re-open then click outside to close (mousedown outside the picker).
    await user.click(screen.getByRole("button", { name: /Model Two paid/i }));
    expect(screen.getByText("smarter")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("smarter")).toBeNull());

    // The picked model id flows into the next ask request.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    expect(vi.mocked(api.askStream).mock.calls[0][0].model).toBe("m2");
  });

  it("renders nothing for the picker when the model list is empty", async () => {
    vi.mocked(api.models).mockResolvedValue({ models: [], default: "" });
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);
    // With no models, the picker renders null, but the rerank/search buttons remain.
    expect(screen.getByRole("button", { name: /smart sort/i })).toBeTruthy();
    // Asking with no models sends model: null.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    expect(vi.mocked(api.askStream).mock.calls[0][0].model).toBeNull();
  });

  it("opens the command palette with the search button and asks the overview action", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByRole("button", { name: /search ⌘k/i }));
    const action = await screen.findByText("Ask: what does this codebase do?");
    await user.click(action);
    await screen.findByText("Login lives in auth.py.");
    expect(vi.mocked(api.askStream).mock.calls[0][0].question).toBe("What does this codebase do?");
  });

  it("toggles the command palette with ⌘K and closes it with the scrim", async () => {
    const user = userEvent.setup();
    await intoWorkspace(user);

    // Open with Meta+K.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByPlaceholderText(/search files, symbols/i)).toBeTruthy();
    // Toggle closed with Meta+K again.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.queryByPlaceholderText(/search files, symbols/i)).toBeNull());

    // Ctrl+K also opens it.
    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    expect(await screen.findByPlaceholderText(/search files, symbols/i)).toBeTruthy();
  });

  it("ignores ⌘K on the landing screen (palette only opens in the workspace)", async () => {
    render(<App />);
    await screen.findByPlaceholderText(/github\.com/i);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByPlaceholderText(/search files, symbols/i)).toBeNull();
  });

  it("opens the graph modal, shows the legend, closes on Escape and via onPick", async () => {
    const restoreRO = mockResizeObserver();
    const restoreCtx = mockCanvas();
    streamFinal();
    try {
      const user = userEvent.setup();
      await intoWorkspace(user);

      // Expand the architecture graph into the modal.
      await user.click(screen.getByRole("button", { name: /expand graph/i }));
      const modal = await screen.findByText("Architecture", { selector: ".modal-scrim .card-title" });
      expect(modal).toBeTruthy();

      // The modal legend lists both languages from the graph nodes.
      const scrim = document.querySelector(".modal-scrim") as HTMLElement;
      const legend = within(scrim).getAllByText(/python|typescript/i);
      expect(legend.length).toBeGreaterThanOrEqual(2);

      // Escape closes the modal.
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(document.querySelector(".modal-scrim")).toBeNull());

      // Re-open and close via the explicit close button.
      await user.click(screen.getByRole("button", { name: /expand graph/i }));
      await screen.findByText("Architecture", { selector: ".modal-scrim .card-title" });
      const closeBtn = within(document.querySelector(".modal-scrim") as HTMLElement).getByRole("button", {
        name: /close/i,
      });
      await user.click(closeBtn);
      await waitFor(() => expect(document.querySelector(".modal-scrim")).toBeNull());

      // Re-open then close by clicking the scrim backdrop.
      await user.click(screen.getByRole("button", { name: /expand graph/i }));
      await screen.findByText("Architecture", { selector: ".modal-scrim .card-title" });
      fireEvent.mouseDown(document.querySelector(".modal-scrim") as HTMLElement);
      await waitFor(() => expect(document.querySelector(".modal-scrim")).toBeNull());
    } finally {
      restoreCtx.mockRestore();
      restoreRO();
    }
  });

  it("graph modal onPick closes the modal and asks about the node", async () => {
    const restoreRO = mockResizeObserver();
    // Leave getContext returning null (the global stub) so the rAF physics loop never starts
    // and nodes hold their deterministic seed positions — a running simulation would drift them
    // and a fixed-coordinate click could never reliably land one. nodeAt() still hit-tests.
    const rectSpy = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 500,
      right: 800,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => "",
    });
    streamFinal();
    try {
      const user = userEvent.setup();
      await intoWorkspace(user);
      await user.click(screen.getByRole("button", { name: /expand graph/i }));
      await screen.findByText("Architecture", { selector: ".modal-scrim .card-title" });

      // ForceGraph seeds node i at (cx + cos(a)·rad + (i%5−2), cy + sin(a)·rad + (i%3−1)) with
      // a = i/N·2π. For the 2-node fixture in an 800×500 modal (cx=400, cy=250, rad=150), node
      // "a" (i=0) seats at (548, 249). A mousedown→mouseup there with no move registers a pick.
      const canvas = document.querySelector(".modal-scrim canvas") as HTMLCanvasElement;
      fireEvent.mouseDown(canvas, { clientX: 548, clientY: 249 });
      fireEvent.mouseUp(canvas, { clientX: 548, clientY: 249 });

      // onPick closes the modal and dispatches "Explain <label>." for the picked node ("a.py").
      await waitFor(() => expect(document.querySelector(".modal-scrim")).toBeNull());
      await waitFor(() => expect(api.askStream).toHaveBeenCalled());
      expect(vi.mocked(api.askStream).mock.calls[0][0].question).toMatch(/^Explain a\.py\./);
    } finally {
      rectSpy.mockRestore();
      restoreRO();
    }
  });

  it("opens the observability log and closes it", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    // Ask one question so the log has a row.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");

    await user.click(screen.getByRole("button", { name: /observability/i }));
    expect(await screen.findByText(/1 query/i)).toBeTruthy();
    // The row shows the model's short name (scoped to the log modal — "m" also labels the
    // model elsewhere in the workspace behind the scrim).
    const logScrim = document.querySelector(".modal-scrim") as HTMLElement;
    expect(within(logScrim).getByText("m")).toBeTruthy();

    const closeBtn = within(document.querySelector(".modal-scrim") as HTMLElement).getByRole("button", {
      name: /close/i,
    });
    await user.click(closeBtn);
    await waitFor(() => expect(document.querySelector(".modal-scrim")).toBeNull());
  });

  it("shows a roadmap toast when the theme toggle is clicked", async () => {
    const user = userEvent.setup();
    await intoWorkspace(user);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(await screen.findByText(/light theme is on the roadmap/i)).toBeTruthy();
  });

  it("asks a follow-up suggestion from an answer", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");

    // deriveFollowups builds "How does `login` work?" from the answer's sources.
    const followup = await screen.findByRole("button", { name: /how does `?login`? work/i });
    await user.click(followup);
    await waitFor(() => expect(vi.mocked(api.askStream).mock.calls.length).toBe(2));
    expect(vi.mocked(api.askStream).mock.calls[1][0].question).toMatch(/how does `login` work/i);
  });

  it("ignores a follow-up click while a question is already pending", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    const followup = await screen.findByRole("button", { name: /how does `?login`? work/i });

    // The next ask hangs, so the app stays pending after this follow-up fires.
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("...");
      await new Promise<void>((r) => setTimeout(r, 10_000));
    });
    await user.click(followup);
    await waitFor(() => expect(vi.mocked(api.askStream).mock.calls.length).toBe(2));

    // Clicking it again while pending is a no-op — the ask() guard returns early.
    await user.click(screen.getByRole("button", { name: /how does `?login`? work/i }));
    expect(vi.mocked(api.askStream).mock.calls.length).toBe(2);
  });

  it("ignores an empty question and a question while pending", async () => {
    // askStream never resolves so the app stays pending after the first ask.
    let resolved = false;
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("...");
      // never call onFinal — keep it pending
      await new Promise<void>((r) => setTimeout(r, 10_000));
      resolved = true;
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    const ta = screen.getByPlaceholderText(/ask about the code/i);
    // Empty submit does nothing (trimmed to "").
    await user.click(ta);
    await user.keyboard("   {Enter}");
    expect(api.askStream).not.toHaveBeenCalled();

    // First real question starts streaming and stays pending.
    await user.type(ta, "first question");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(vi.mocked(api.askStream).mock.calls.length).toBe(1));
    expect(resolved).toBe(false);
  });

  it("restores a saved session from localStorage on re-ingest, then resets on Re-ingest", async () => {
    // Seed a session id for this repo so loadHistory is called.
    localStorage.setItem("glyph:session:local/app", "seed-sid");
    vi.mocked(api.loadHistory).mockResolvedValue({
      session_id: "seed-sid",
      repo: "local/app",
      messages: [
        { role: "user", content: "old question", data: null },
        {
          role: "glyph",
          content: "old answer",
          data: finalAnswer({ answer: "old answer" }),
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");

    // The restored conversation appears instead of the empty state.
    expect(await screen.findByText("old question")).toBeTruthy();
    expect(screen.getByText("old answer")).toBeTruthy();
    expect(api.loadHistory).toHaveBeenCalledWith("seed-sid");

    // Re-ingest resets back to the landing screen.
    await user.click(screen.getByRole("button", { name: /re-ingest/i }));
    expect(await screen.findByPlaceholderText(/github\.com/i)).toBeTruthy();
  });

  it("starts fresh when a saved session fails to load", async () => {
    localStorage.setItem("glyph:session:local/app", "bad-sid");
    vi.mocked(api.loadHistory).mockRejectedValue(new Error("could not load session"));
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    // Falls back to the empty state rather than crashing.
    expect(await screen.findByText(/ask anything about this code/i)).toBeTruthy();
    expect(api.loadHistory).toHaveBeenCalledWith("bad-sid");
  });

  it("opens code from a source citation via the command palette symbol entry", async () => {
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    // Ask once so an answer source (with code) is in allSources/paletteSources.
    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");

    // Open the palette and pick the symbol; its source has code, so the viewer opens inline.
    await user.click(screen.getByRole("button", { name: /search ⌘k/i }));
    await user.type(screen.getByPlaceholderText(/search files, symbols/i), "login");
    const symbolItem = await screen.findByText("login");
    await user.click(symbolItem);
    // The CodeViewer header shows the file path.
    expect(await screen.findByText("auth.py", { selector: ".code-file" })).toBeTruthy();
    // Close the viewer.
    await user.click(screen.getByRole("button", { name: /close code viewer/i }));
    await waitFor(() => expect(document.querySelector(".code-col")).toBeNull());
  });

  it("opens code for a citation by fetching the file when no source matches", async () => {
    // The answer carries a citation but NO matching source code, so openCode hits api.file.
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onFinal(
        finalAnswer({
          citations: [{ file_path: "deep.py", start_line: 5, end_line: 9 }],
          sources: [],
        }),
      );
    });
    vi.mocked(api.file).mockResolvedValue({
      file_path: "deep.py",
      language: "python",
      code: "x = 1\ny = 2\n",
      start_line: 1,
      end_line: 9,
      chunks: [{ symbol_name: "main", type: "function", start_line: 1, end_line: 9, code: "" }],
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    // Click the citation chip (file name + line range).
    const chip = await screen.findByRole("button", { name: /deep\.py/i });
    await user.click(chip);
    await waitFor(() => expect(api.file).toHaveBeenCalledWith("deep.py", 5, 9));
    expect(await screen.findByText("deep.py", { selector: ".code-file" })).toBeTruthy();
  });

  it("toasts when a citation has no source preview available", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onFinal(
        finalAnswer({
          citations: [{ file_path: "missing.py", start_line: 5, end_line: 9 }],
          sources: [],
        }),
      );
    });
    vi.mocked(api.file).mockRejectedValue(new Error("could not load file"));
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    const chip = await screen.findByRole("button", { name: /missing\.py/i });
    await user.click(chip);
    expect(await screen.findByText(/no source preview available/i)).toBeTruthy();
  });

  it("opens code for a citation that overlaps an existing answer source", async () => {
    // The citation overlaps the source returned with the answer, so openCode uses that source
    // directly (no api.file call).
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onFinal(
        finalAnswer({
          citations: [{ file_path: "auth.py", start_line: 12, end_line: 15 }],
        }),
      );
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    const chip = await screen.findByRole("button", { name: /auth\.py/i });
    await user.click(chip);
    expect(await screen.findByText("auth.py", { selector: ".code-file" })).toBeTruthy();
    expect(api.file).not.toHaveBeenCalled();
  });

  it("falls back to the active backend if loadHistory has no saved session and overview is empty", async () => {
    // overview empty -> description stays undefined; covers the no-description branch.
    vi.mocked(api.overview).mockResolvedValue({ overview: "" });
    const user = userEvent.setup();
    render(<App />);
    await ingest(user, "app");
    expect(await screen.findByText(/ask anything about this code/i)).toBeTruthy();
    // No saved session id -> loadHistory not called.
    expect(api.loadHistory).not.toHaveBeenCalled();
  });

  it("marks an unavailable model in the picker menu", async () => {
    vi.mocked(api.models).mockResolvedValue({
      models: [
        { id: "m", label: "Model", tier: "free", note: "fast and free", available: true },
        { id: "down", label: "Model Down", tier: "paid", note: "currently offline", available: false },
      ],
      default: "m",
    });
    streamFinal();
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByRole("button", { name: /Model free/i }));
    const item = (await screen.findByText("Model Down")).closest(".menu-item") as HTMLElement;
    expect(item.getAttribute("data-avail")).toBe("0");
  });

  it("defaults observability fields when an answer omits stage timings and the cache flag", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onToken("Hi ");
      handlers.onFinal(
        finalAnswer({
          meta: {
            model: "openrouter/m",
            latency_ms: 90,
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 5 },
          },
        }),
      );
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    await user.click(screen.getByRole("button", { name: /observability/i }));
    // The row renders without crashing — missing stage_ms/cached default to 0 and not-cached.
    expect(await screen.findByText(/1 query/i)).toBeTruthy();
  });

  it("opens fetched code even when the file has no chunk metadata", async () => {
    vi.mocked(api.askStream).mockImplementation(async (_body, handlers) => {
      handlers.onFinal(
        finalAnswer({
          citations: [{ file_path: "bare.py", start_line: 1, end_line: 3 }],
          sources: [],
        }),
      );
    });
    vi.mocked(api.file).mockResolvedValue({
      file_path: "bare.py",
      language: "python",
      code: "x = 1\n",
      start_line: 1,
      end_line: 3,
      chunks: [],
    });
    const user = userEvent.setup();
    await intoWorkspace(user);

    await user.click(screen.getByText("What does this project do and how is it structured?"));
    await screen.findByText("Login lives in auth.py.");
    const chip = await screen.findByRole("button", { name: /bare\.py/i });
    await user.click(chip);
    // chunks[0] is undefined, so symbol_name/type fall back to "" without throwing.
    expect(await screen.findByText("bare.py", { selector: ".code-file" })).toBeTruthy();
  });

  it("labels a blank language as Other and avoids divide-by-zero on empty chunks", async () => {
    vi.mocked(api.stats).mockResolvedValue({
      files: 1,
      chunks: 0,
      languages: [{ language: "", files: 1, chunks: 0 }],
    });
    const user = userEvent.setup();
    await intoWorkspace(user);
    // prettyLang("") -> "Other" and the chunks:0 denominator falls back to 1 (no NaN).
    const legend = document.querySelector(".lang-legend") as HTMLElement;
    expect(legend.textContent).toContain("Other");
  });

  it("ignores a second ingest while one is busy", async () => {
    // A slow ingest keeps busyIngest true; a second submit is a no-op.
    let calls = 0;
    vi.mocked(api.ingestStream).mockImplementation(async (_body, handlers) => {
      calls++;
      await new Promise<void>((r) => setTimeout(r, 50));
      handlers.onDone({ stage: "done", files: 1, languages: ["python"], added: 1, cached: 0 });
    });
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByPlaceholderText(/github\.com/i);
    await user.type(input, "app");
    const btn = screen.getByRole("button", { name: /ingest/i });
    // Fire twice quickly; the busy guard should keep it to one underlying call.
    fireEvent.submit(btn.closest("form") as HTMLFormElement);
    fireEvent.submit(btn.closest("form") as HTMLFormElement);
    await screen.findByText(/ask anything about this code/i);
    expect(calls).toBe(1);
  });
});
