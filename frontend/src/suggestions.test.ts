// Tests for the repo-aligned starter questions.

import { describe, expect, it } from "vitest";

import { buildSuggestions } from "./suggestions";

describe("buildSuggestions", () => {
  it("tailors questions to a real endpoint and symbol", () => {
    const out = buildSuggestions({
      endpoints: [{ method: "POST", path: "/api/ask" }],
      symbols: [
        { symbol_name: "<module>", type: "module" },
        { symbol_name: "authenticate_user", type: "function" },
      ],
      hasDeps: true,
    });

    expect(out).toHaveLength(4);
    expect(out.some((s) => s.q.includes("POST /api/ask"))).toBe(true);
    expect(out.some((s) => s.q.includes("authenticate_user"))).toBe(true);
    // The <module> catch-all is never offered as a symbol question.
    expect(out.some((s) => s.q.includes("<module>"))).toBe(false);
  });

  it("always returns exactly four with no duplicates, even with no signals", () => {
    const out = buildSuggestions({});
    expect(out).toHaveLength(4);
    const questions = out.map((s) => s.q);
    expect(new Set(questions).size).toBe(4);
  });

  it("fills from the generic pool when only some signals are present", () => {
    const out = buildSuggestions({ endpoints: [{ method: "GET", path: "/health" }] });
    expect(out).toHaveLength(4);
    expect(out.some((s) => s.q.includes("GET /health"))).toBe(true);
    // No symbol/deps signal, so the rest come from the generic pool — still four, all unique.
    expect(new Set(out.map((s) => s.q)).size).toBe(4);
  });
});
