// Tests for the command palette: the fuzzy scorer and the search/run flow.

import { fireEvent, render, screen } from "@testing-library/react";
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

  function renderPalette(overrides: Partial<Record<string, () => void>> = {}) {
    const handlers = {
      onClose: vi.fn(),
      onOpenCode: vi.fn(),
      onAsk: vi.fn(),
      onChangeRepo: vi.fn(),
      ...overrides,
    };
    const utils = render(
      <CommandPalette
        endpoints={endpoints}
        sources={sources}
        onClose={handlers.onClose}
        onOpenCode={handlers.onOpenCode}
        onAsk={handlers.onAsk}
        onChangeRepo={handlers.onChangeRepo}
      />,
    );
    return { ...utils, ...handlers };
  }

  function activeItem() {
    return document.querySelector('.pal-item[data-active="1"]');
  }

  it("runs an action item (re-ingest) and closes when chosen with Enter", () => {
    const { onChangeRepo, onClose } = renderPalette();
    const palette = document.querySelector(".palette")!;

    // First item is the "Re-ingest repository" action and is active by default.
    expect(activeItem()?.textContent).toContain("Re-ingest repository");

    fireEvent.keyDown(palette, { key: "Enter" });
    expect(onChangeRepo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the active selection down and up with the arrow keys", () => {
    renderPalette();
    const palette = document.querySelector(".palette")!;

    expect(activeItem()?.textContent).toContain("Re-ingest repository");

    fireEvent.keyDown(palette, { key: "ArrowDown" });
    expect(activeItem()?.textContent).toContain("Ask: what does this codebase do?");

    fireEvent.keyDown(palette, { key: "ArrowUp" });
    expect(activeItem()?.textContent).toContain("Re-ingest repository");
  });

  it("clamps ArrowUp at the top and ArrowDown at the bottom of the list", () => {
    renderPalette();
    const palette = document.querySelector(".palette")!;
    const total = document.querySelectorAll(".pal-item").length;

    // ArrowUp at the first item stays put (Math.max(0, a - 1)).
    fireEvent.keyDown(palette, { key: "ArrowUp" });
    expect(activeItem()?.textContent).toContain("Re-ingest repository");

    // Press ArrowDown past the end; it clamps to the last item.
    for (let i = 0; i < total + 2; i++) {
      fireEvent.keyDown(palette, { key: "ArrowDown" });
    }
    const items = Array.from(document.querySelectorAll(".pal-item"));
    expect(activeItem()).toBe(items[items.length - 1]);
  });

  it("chooses the highlighted endpoint with Enter after navigating", () => {
    const { onAsk, onClose } = renderPalette();
    const palette = document.querySelector(".palette")!;

    // Move to the second action which asks the overview question.
    fireEvent.keyDown(palette, { key: "ArrowDown" });
    fireEvent.keyDown(palette, { key: "Enter" });

    expect(onAsk).toHaveBeenCalledWith("What does this codebase do?");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape without running anything", () => {
    const { onClose, onChangeRepo, onAsk, onOpenCode } = renderPalette();
    const palette = document.querySelector(".palette")!;

    fireEvent.keyDown(palette, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChangeRepo).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
    expect(onOpenCode).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys", () => {
    const { onClose } = renderPalette();
    const palette = document.querySelector(".palette")!;

    fireEvent.keyDown(palette, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
    expect(activeItem()?.textContent).toContain("Re-ingest repository");
  });

  it("does nothing when Enter is pressed with no results to choose", async () => {
    const user = userEvent.setup();
    const { onClose, onChangeRepo } = renderPalette();

    await user.type(screen.getByPlaceholderText(/search files/i), "zzzzzz");
    const palette = document.querySelector(".palette")!;
    fireEvent.keyDown(palette, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
    expect(onChangeRepo).not.toHaveBeenCalled();
  });

  it("updates the active item on mouse enter", () => {
    renderPalette();
    const items = document.querySelectorAll(".pal-item");
    fireEvent.mouseEnter(items[1]);
    expect(items[1].getAttribute("data-active")).toBe("1");
    expect(items[0].getAttribute("data-active")).toBe("0");
  });

  it("closes when the scrim backdrop is clicked", () => {
    const { onClose } = renderPalette();
    fireEvent.mouseDown(document.querySelector(".pal-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the palette body itself is clicked", () => {
    const { onClose } = renderPalette();
    fireEvent.mouseDown(document.querySelector(".palette")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks about an endpoint when its item is clicked", async () => {
    const user = userEvent.setup();
    const { onAsk, onClose } = renderPalette();

    await user.type(screen.getByPlaceholderText(/search files/i), "/api/ingest");
    await user.click(screen.getByText("/api/ingest"));

    expect(onAsk).toHaveBeenCalledWith("Explain the POST /api/ingest endpoint.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
