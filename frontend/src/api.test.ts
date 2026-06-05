// Unit tests for parseSSE: the pure parser that turns a raw Server-Sent Events buffer
// into complete messages plus any unfinished remainder. No network involved.

import { describe, expect, it } from "vitest";

import { parseSSE } from "./api";

describe("parseSSE", () => {
  it("parses two complete messages and leaves no remainder", () => {
    const buffer =
      'data: {"type":"token","text":"Hi"}\n\n' + 'data: {"type":"token","text":" there"}\n\n';

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
