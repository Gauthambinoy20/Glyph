// Tests for the repo-aligned starter questions.

import { describe, expect, it } from "vitest";

import { buildSuggestions } from "./suggestions";

const OVERVIEW = "What does this project do and how is it structured?";

describe("buildSuggestions", () => {
  it("tailors questions to a real endpoint, symbol and framework", () => {
    const out = buildSuggestions({
      endpoints: [{ method: "POST", path: "/api/ask" }],
      symbols: [
        { symbol_name: "<module>", type: "module" },
        { symbol_name: "authenticate_user", type: "function" },
      ],
      hasDeps: true,
      frameworks: ["FastAPI"],
    });

    expect(out).toHaveLength(6);
    expect(out[0].q).toBe(OVERVIEW); // overview is always first
    expect(out.some((s) => s.q.includes("POST /api/ask"))).toBe(true);
    expect(out.some((s) => s.q.includes("authenticate_user"))).toBe(true);
    expect(out.some((s) => s.q.includes("FastAPI"))).toBe(true);
    expect(out.some((s) => s.q.includes("depend on each other"))).toBe(true);
    // The <module> catch-all is never offered as a symbol question.
    expect(out.some((s) => s.q.includes("<module>"))).toBe(false);
  });

  it("always returns six unique questions, even with no signals", () => {
    const out = buildSuggestions({});
    expect(out).toHaveLength(6);
    expect(new Set(out.map((s) => s.q)).size).toBe(6);
    expect(out[0].q).toBe(OVERVIEW);
  });

  it("fills from the broad pool when only some signals are present", () => {
    const out = buildSuggestions({ endpoints: [{ method: "GET", path: "/health" }] });
    expect(out).toHaveLength(6);
    expect(out.some((s) => s.q.includes("GET /health"))).toBe(true);
    // No symbol/framework/deps signal, so the rest come from the pool — still six, all unique.
    expect(new Set(out.map((s) => s.q)).size).toBe(6);
  });

  it("rotates the generic questions so a re-index surfaces fresh prompts", () => {
    const first = buildSuggestions({ rotate: 0 }).map((s) => s.q);
    const later = buildSuggestions({ rotate: 3 }).map((s) => s.q);

    expect(first).toHaveLength(6);
    expect(later).toHaveLength(6);
    expect(first[0]).toBe(later[0]); // overview stays pinned first
    expect(first.slice(1)).not.toEqual(later.slice(1)); // ...but the tail rotates
  });

  it("rotates which endpoint and symbol are named", () => {
    const base = {
      endpoints: [
        { method: "GET", path: "/a" },
        { method: "GET", path: "/b" },
      ],
      symbols: [
        { symbol_name: "alpha_fn", type: "function" },
        { symbol_name: "beta_fn", type: "function" },
      ],
    };
    const first = buildSuggestions({ ...base, rotate: 0 });
    const second = buildSuggestions({ ...base, rotate: 1 });

    expect(first.some((s) => s.q.includes("/a"))).toBe(true);
    expect(first.some((s) => s.q.includes("alpha_fn"))).toBe(true);
    expect(second.some((s) => s.q.includes("/b"))).toBe(true);
    expect(second.some((s) => s.q.includes("beta_fn"))).toBe(true);
  });
});
