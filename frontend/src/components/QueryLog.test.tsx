// Tests for the observability query-log modal.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueryLog } from "./QueryLog";
import type { QueryLogEntry } from "./QueryLog";

const entries: QueryLogEntry[] = [
  { question: "how does retrieval work?", model: "meta/llama", latency_ms: 9800, retrieve_ms: 40, llm_ms: 9760, tokens: 1639, cached: false },
  { question: "what does this do?", model: "meta/llama", latency_ms: 12, retrieve_ms: 2, llm_ms: 10, tokens: 1441, cached: true },
];

describe("QueryLog", () => {
  it("renders a row per query with model, totals, and a cached badge", () => {
    render(<QueryLog entries={entries} onClose={() => {}} />);

    expect(screen.getByText("how does retrieval work?")).toBeTruthy();
    expect(screen.getByText("1,639")).toBeTruthy(); // token count formatted
    expect(screen.getAllByText("llama").length).toBe(2); // model shown (after the slash)
    expect(screen.getByText("cached")).toBeTruthy(); // the cached query is badged
  });

  it("shows an empty state when there are no queries", () => {
    render(<QueryLog entries={[]} onClose={() => {}} />);
    expect(screen.getByText(/no queries yet/i)).toBeTruthy();
  });
});
