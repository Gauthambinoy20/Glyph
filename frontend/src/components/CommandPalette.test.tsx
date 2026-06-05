// Tests for the command palette: the fuzzy scorer and the search/run flow.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Source } from "../api";
import type { Endpoint } from "../types";
import { CommandPalette, fuzzy } from "./CommandPalette";

describe("fuzzy", () => {
  it("scores a prefix match higher than a scattered one, and misses score zero", () => {
    expect(fuzzy("ing", "ingest")).toBeGreaterThan(fuzzy("ing", "indexing"));
    expect(fuzzy("xyz", "ingest")).toBe(0);
    expect(fuzzy("", "anything")).toBe(1);
  });
});

const endpoints: Endpoint[] = [{ method: "POST", path: "/api/ingest" }];
const sources: Source[] = [
  {
    id: "s1",
    file_path: "server/ask.py",
    symbol_name: "ask_handler",
    type: "route",
    start_line: 24,
    end_line: 40,
    code: "def ask_handler(): pass",
    language: "python",
  },
];

describe("CommandPalette", () => {
  it("filters to a matching symbol and runs it on click", async () => {
    const onOpenCode = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette
        endpoints={endpoints}
        sources={sources}
        onClose={() => {}}
        onOpenCode={onOpenCode}
        onAsk={() => {}}
        onChangeRepo={() => {}}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search files/i), "ask_handler");
    await user.click(screen.getByText("ask_handler"));
    expect(onOpenCode).toHaveBeenCalledWith(sources[0]);
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        endpoints={endpoints}
        sources={sources}
        onClose={() => {}}
        onOpenCode={() => {}}
        onAsk={() => {}}
        onChangeRepo={() => {}}
      />,
    );
    await user.type(screen.getByPlaceholderText(/search files/i), "zzzzzz");
    expect(screen.getByText(/no matches/i)).toBeTruthy();
  });
});
