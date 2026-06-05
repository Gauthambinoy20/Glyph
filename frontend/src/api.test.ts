// Unit tests for parseSSE: the pure parser that turns a raw Server-Sent Events buffer
// into complete messages plus any unfinished remainder. No network involved.

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout, parseIngestSSE, parseSSE } from "./api";

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
});
