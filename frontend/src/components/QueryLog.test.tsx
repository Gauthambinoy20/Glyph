// Tests for the observability query-log modal.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueryLog } from "./QueryLog";
import type { QueryLogEntry } from "./QueryLog";

const entries: QueryLogEntry[] = [
  {
    question: "how does retrieval work?",
    model: "meta/llama",
    latency_ms: 9800,
    retrieve_ms: 40,
    llm_ms: 9760,
    tokens: 1639,
    cached: false,
  },
  {
    question: "what does this do?",
    model: "meta/llama",
    latency_ms: 12,
    retrieve_ms: 2,
    llm_ms: 10,
    tokens: 1441,
    cached: true,
  },
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

  it("pluralizes the header for multiple queries", () => {
    const { container } = render(<QueryLog entries={entries} onClose={() => {}} />);
    // The header text ("Observability · 2 queries") is split across text nodes,
    // so assert on the normalized text content of the whole title span.
    const title = container.querySelector(".card-title") as HTMLElement;
    expect(title.textContent?.replace(/\s+/g, " ").trim()).toContain(
      `Observability · ${entries.length} queries`,
    );
  });

  it("uses the singular header label for exactly one query", () => {
    const { container } = render(<QueryLog entries={[entries[0]]} onClose={() => {}} />);
    const title = container.querySelector(".card-title") as HTMLElement;
    expect(title.textContent?.replace(/\s+/g, " ").trim()).toContain("Observability · 1 query");
  });

  it("closes when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<QueryLog entries={entries} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the scrim behind the modal is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<QueryLog entries={entries} onClose={onClose} />);
    const scrim = container.querySelector(".modal-scrim") as HTMLElement;
    fireEvent.mouseDown(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the modal body itself is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<QueryLog entries={entries} onClose={onClose} />);
    const modal = container.querySelector(".modal") as HTMLElement;
    fireEvent.mouseDown(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<QueryLog entries={entries} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape key presses", () => {
    const onClose = vi.fn();
    render(<QueryLog entries={entries} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the keydown listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<QueryLog entries={entries} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
