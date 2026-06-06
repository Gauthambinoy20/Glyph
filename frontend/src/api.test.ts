// Unit tests for parseSSE: the pure parser that turns a raw Server-Sent Events buffer
// into complete messages plus any unfinished remainder. No network involved.

import { afterEach, describe, expect, it, vi } from "vitest";

import { api, fetchWithTimeout, parseIngestSSE, parseSSE } from "./api";

// Build a fake Response.body.getReader() that hands back the given string chunks
// (encoded to bytes) one at a time, then reports {done:true}. Lets us drive the
// streaming reader loops without a real network stream.
function readerFrom(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: vi.fn().mockImplementation(() => {
      if (i < chunks.length) {
        return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
  };
}

// A minimal Response stand-in for the json()-returning helpers.
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("parseSSE", () => {
  it("parses two complete messages and leaves no remainder", () => {
    const buffer = 'data: {"type":"token","text":"Hi"}\n\n' + 'data: {"type":"token","text":" there"}\n\n';

    const { messages, rest } = parseSSE(buffer);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ type: "token", text: " there" });
    expect(rest).toBe("");
  });

  it("holds a half-arrived message back as rest instead of dropping it", () => {
    const buffer = 'data: {"type":"token","text":"A"}\n\n' + 'data: {"type":"fin';

    const { messages, rest } = parseSSE(buffer);

    expect(messages).toHaveLength(1);
    expect(rest).toBe('data: {"type":"fin');
  });

  it("completes the message once the rest of it arrives", () => {
    const tail = 'al","answer":"done","citations":[],"retrieved_chunk_ids":[],"sources":[]';
    const { messages } = parseSSE('data: {"type":"fin' + tail + "}\n\n");

    expect(messages[0].type).toBe("final");
  });

  it("returns nothing for an empty buffer", () => {
    expect(parseSSE("")).toEqual({ messages: [], rest: "" });
  });
});

describe("parseIngestSSE", () => {
  it("parses ingest stage events and the final summary", () => {
    const buffer =
      'data: {"stage":"walk","files":4}\n\n' +
      'data: {"stage":"embed","done":2,"total":4}\n\n' +
      'data: {"stage":"done","files":4,"languages":["python"],"added":4,"cached":0}\n\n';

    const { events, rest } = parseIngestSSE(buffer);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ stage: "walk", files: 4 });
    expect(events[2]).toEqual({
      stage: "done",
      files: 4,
      languages: ["python"],
      added: 4,
      cached: 0,
    });
    expect(rest).toBe("");
  });

  it("holds a half-arrived event back as rest", () => {
    const buffer = 'data: {"stage":"walk","files":4}\n\n' + 'data: {"stage":"emb';

    const { events, rest } = parseIngestSSE(buffer);

    expect(events).toHaveLength(1);
    expect(rest).toBe('data: {"stage":"emb');
  });

  it("surfaces an error event", () => {
    const { events } = parseIngestSSE('data: {"stage":"error","detail":"bad url"}\n\n');

    expect(events[0]).toEqual({ stage: "error", detail: "bad url" });
  });
});

describe("fetchWithTimeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the response when fetch resolves in time", async () => {
    const response = { ok: true } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchWithTimeout("/api/x", {}, 1000)).resolves.toBe(response);
  });

  it("turns an abort into a clear timeout message", async () => {
    // The browser rejects an aborted fetch with an error named "AbortError".
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));

    await expect(fetchWithTimeout("/api/x", {}, 1000)).rejects.toThrow(/timed out/);
  });

  it("passes a normal network error through unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(fetchWithTimeout("/api/x", {}, 1000)).rejects.toThrow("network down");
  });

  it("re-throws a non-Error rejection value untouched", async () => {
    // Covers the branch where the caught value is not an Error instance, so the
    // AbortError handling is skipped and the raw value is re-thrown.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("plain string failure"));

    await expect(fetchWithTimeout("/api/x", {}, 1000)).rejects.toBe("plain string failure");
  });

  it("fires the abort controller when the timeout elapses", async () => {
    // Drives the real timer path: fetch hangs until its abort signal fires, so the
    // setTimeout callback's controller.abort() is what rejects it (not a pre-made reject).
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, opts: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }),
    );

    await expect(fetchWithTimeout("/api/x", {}, 1)).rejects.toThrow(/timed out/);
  });
});

describe("api POST helpers (post)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ingest posts to /api/ingest and returns the parsed body", async () => {
    const summary = { files: 4, added: 4, cached: 0, languages: ["python"] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summary));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.ingest({ repo_url: "https://example.com/r.git" });

    expect(result).toEqual(summary);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({ repo_url: "https://example.com/r.git" });
  });

  it("ask posts to /api/ask with the question body", async () => {
    const answer = {
      answer: "yes",
      citations: [],
      retrieved_chunk_ids: [],
      sources: [],
      meta: {},
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.ask({ question: "what?" });

    expect(result).toEqual(answer);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ask");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ question: "what?" });
  });

  it("setMode posts the chosen mode to /api/mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ mode: "fast", backend: "model2vec" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.setMode("fast");

    expect(result).toEqual({ mode: "fast", backend: "model2vec" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mode");
    expect(JSON.parse(options.body)).toEqual({ mode: "fast" });
  });

  it("saveHistory posts the conversation to /api/history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ session_id: "s1" }));
    vi.stubGlobal("fetch", fetchMock);

    const body = { repo: "r", messages: [{ role: "user", content: "hi", data: null }] };
    const result = await api.saveHistory(body);

    expect(result).toEqual({ session_id: "s1" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/history");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(body);
  });

  it("throws the backend's detail when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "no repo loaded" }, false, 400)));

    await expect(api.ask({ question: "x" })).rejects.toThrow("no repo loaded");
  });

  it("falls back to a status message when the error body has no detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));

    await expect(api.ask({ question: "x" })).rejects.toThrow("request failed (500)");
  });

  it("falls back to a status message when the error body is not JSON", async () => {
    const res = {
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    await expect(api.ask({ question: "x" })).rejects.toThrow("request failed (503)");
  });
});

describe("api GET methods", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("models fetches /api/models and returns the body", async () => {
    const body = { models: [], default: "free" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.models()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/models");
  });

  it("models throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.models()).rejects.toThrow("could not load models");
  });

  it("overview fetches /api/overview and returns the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ overview: "text" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.overview()).toEqual({ overview: "text" });
    expect(fetchMock).toHaveBeenCalledWith("/api/overview");
  });

  it("overview throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.overview()).rejects.toThrow("could not load overview");
  });

  it("graph fetches /api/graph and returns the body", async () => {
    const body = { nodes: [], edges: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.graph()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/graph");
  });

  it("graph throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.graph()).rejects.toThrow("could not load graph");
  });

  it("stats fetches /api/stats and returns the body", async () => {
    const body = { files: 1, chunks: 2, languages: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.stats()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/stats");
  });

  it("stats throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.stats()).rejects.toThrow("could not load stats");
  });

  it("stack fetches /api/stack and unwraps the stack array", async () => {
    const stack = [{ name: "React", package: "react", files: 3 }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stack }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.stack()).toEqual(stack);
    expect(fetchMock).toHaveBeenCalledWith("/api/stack");
  });

  it("stack throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.stack()).rejects.toThrow("could not load stack");
  });

  it("endpoints fetches /api/endpoints and unwraps the endpoints array", async () => {
    const endpoints = [{ method: "GET", path: "/x" }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ endpoints }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.endpoints()).toEqual(endpoints);
    expect(fetchMock).toHaveBeenCalledWith("/api/endpoints");
  });

  it("endpoints throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.endpoints()).rejects.toThrow("could not load endpoints");
  });

  it("symbols fetches /api/symbols and unwraps the symbols array", async () => {
    const symbols = [{ file_path: "a.py", symbol_name: "f", type: "function", start_line: 1, end_line: 2 }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ symbols }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.symbols()).toEqual(symbols);
    expect(fetchMock).toHaveBeenCalledWith("/api/symbols");
  });

  it("symbols throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(api.symbols()).rejects.toThrow("could not load symbols");
  });

  it("loadHistory fetches /api/history/:id and returns the body", async () => {
    const body = { session_id: "s1", repo: "r", messages: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.loadHistory("s1")).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/history/s1");
  });

  it("loadHistory throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));
    await expect(api.loadHistory("missing")).rejects.toThrow("could not load session");
  });
});

describe("api.file query params", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests only the path when no line range is given", async () => {
    const file = { file_path: "a.py", language: "python", code: "x", start_line: 1, end_line: 1, chunks: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(file));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.file("a.py")).toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith("/api/file?path=a.py");
  });

  it("includes start and end when both are provided", async () => {
    const file = { file_path: "a.py", language: "python", code: "x", start_line: 5, end_line: 9, chunks: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(file));
    vi.stubGlobal("fetch", fetchMock);

    await api.file("a.py", 5, 9);
    expect(fetchMock).toHaveBeenCalledWith("/api/file?path=a.py&start=5&end=9");
  });

  it("treats 0 as a real start/end value (not nullish)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await api.file("a.py", 0, 0);
    expect(fetchMock).toHaveBeenCalledWith("/api/file?path=a.py&start=0&end=0");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));
    await expect(api.file("missing.py")).rejects.toThrow("could not load file");
  });
});

describe("api.askStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delivers tokens then the final payload, draining chunked SSE", async () => {
    const reader = readerFrom([
      'data: {"type":"token","text":"Hel"}\n\ndata: {"type":"to',
      'ken","text":"lo"}\n\n',
      'data: {"type":"final","answer":"Hello","citations":[],"retrieved_chunk_ids":[],"sources":[],"meta":{}}\n\n',
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: { getReader: () => reader } }));

    const onToken = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();
    await api.askStream({ question: "hi" }, { onToken, onFinal, onError });

    expect(onToken.mock.calls.map((c) => c[0])).toEqual(["Hel", "lo"]);
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ type: "final", answer: "Hello" }));
    expect(onError).not.toHaveBeenCalled();
  });

  it("routes an error SSE message to onError", async () => {
    const reader = readerFrom(['data: {"type":"error","detail":"boom"}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: { getReader: () => reader } }));

    const onError = vi.fn();
    await api.askStream({ question: "hi" }, { onToken: vi.fn(), onFinal: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("reports the backend detail when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "rate limited" }, false, 429)));

    const onError = vi.fn();
    await api.askStream({ question: "hi" }, { onToken: vi.fn(), onFinal: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("rate limited");
  });

  it("reports a status fallback when ok but the body is missing", async () => {
    const res = {
      ok: true,
      body: null,
      status: 500,
      json: () => Promise.resolve({}),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const onError = vi.fn();
    await api.askStream({ question: "hi" }, { onToken: vi.fn(), onFinal: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("request failed (500)");
  });
});

describe("api.ingestStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("emits progress events then the done summary, draining chunked SSE", async () => {
    const reader = readerFrom([
      'data: {"stage":"clone","status":"start"}\n\ndata: {"stage":"wa',
      'lk","files":3}\n\n',
      'data: {"stage":"done","files":3,"languages":["python"],"added":3,"cached":0}\n\n',
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: { getReader: () => reader } }));

    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    await api.ingestStream({ repo_url: "r" }, { onEvent, onDone, onError });

    expect(onEvent.mock.calls.map((c) => c[0])).toEqual([
      { stage: "clone", status: "start" },
      { stage: "walk", files: 3 },
    ]);
    expect(onDone).toHaveBeenCalledWith({
      stage: "done",
      files: 3,
      languages: ["python"],
      added: 3,
      cached: 0,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("routes an error stage event to onError", async () => {
    const reader = readerFrom(['data: {"stage":"error","detail":"bad url"}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: { getReader: () => reader } }));

    const onError = vi.fn();
    await api.ingestStream({ repo_url: "r" }, { onEvent: vi.fn(), onDone: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("bad url");
  });

  it("reports the backend detail when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "clone failed" }, false, 400)));

    const onError = vi.fn();
    await api.ingestStream({ repo_url: "r" }, { onEvent: vi.fn(), onDone: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("clone failed");
  });

  it("reports a status fallback when ok but the body is missing", async () => {
    const res = {
      ok: true,
      body: null,
      status: 502,
      json: () => Promise.resolve({}),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const onError = vi.fn();
    await api.ingestStream({ repo_url: "r" }, { onEvent: vi.fn(), onDone: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith("request failed (502)");
  });
});
