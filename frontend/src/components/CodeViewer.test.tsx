// Tests for the sliding code viewer.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Source } from "../api";
import { CodeViewer } from "./CodeViewer";

const source: Source = {
  id: "x",
  file_path: "server/auth.py",
  symbol_name: "login",
  type: "function",
  start_line: 10,
  end_line: 12,
  code: "def login():\n    return True\n# done",
  language: "python",
};

describe("CodeViewer", () => {
  it("shows the file path, numbered lines, and highlights the cited range", () => {
    const { container } = render(<CodeViewer source={source} hlStart={10} hlEnd={11} onClose={() => {}} />);

    expect(screen.getByText("server/auth.py")).toBeTruthy();
    // Gutter line numbers start at the source's start_line.
    expect(screen.getByText("10")).toBeTruthy();
    // Two of the three lines are within the highlighted range.
    expect(container.querySelectorAll(".code-line.hl").length).toBe(2);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CodeViewer source={source} hlStart={10} hlEnd={10} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close code viewer/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to line 1 when the source has no start_line", () => {
    // start_line of 0 is falsy, so the gutter base should default to 1.
    const noStart: Source = { ...source, start_line: 0 };
    const { container } = render(<CodeViewer source={noStart} hlStart={1} hlEnd={1} onClose={() => {}} />);

    // First gutter cell should read "1", not the source's start_line.
    const firstGutter = container.querySelector(".gutter");
    expect(firstGutter?.textContent).toBe("1");
    // Only the first line is within the 1-1 highlight range.
    expect(container.querySelectorAll(".code-line.hl").length).toBe(1);
  });

  it("renders a non-breaking space for blank lines", () => {
    // An empty line yields an empty highlight, so the fallback &nbsp; is used.
    const withBlank: Source = { ...source, start_line: 1, code: "a\n\nb" };
    const { container } = render(<CodeViewer source={withBlank} hlStart={5} hlEnd={5} onClose={() => {}} />);

    const srcCells = container.querySelectorAll(".src");
    expect(srcCells.length).toBe(3);
    // The middle (blank) line falls back to the non-breaking space entity.
    expect(srcCells[1].innerHTML).toBe("&nbsp;");
    // None of the lines are highlighted because the range is out of bounds.
    expect(container.querySelectorAll(".code-line.hl").length).toBe(0);
  });

  it("marks the first and last cited lines as edges", () => {
    const { container } = render(<CodeViewer source={source} hlStart={10} hlEnd={11} onClose={() => {}} />);

    // Lines 10 and 11 are highlighted; both are the start/end so both are edges.
    expect(container.querySelectorAll(".code-line.hl-edge").length).toBe(2);
    // Line 12 is outside the range and carries neither class.
    const plain = container.querySelectorAll(".code-line:not(.hl)");
    expect(plain.length).toBe(1);
  });

  it("scrolls the highlighted block toward the centre of the body", () => {
    // Stub the geometry the effect reads so the scroll math runs end to end.
    const offsetTopSpy = vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(400);
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);

    const { container } = render(<CodeViewer source={source} hlStart={10} hlEnd={11} onClose={() => {}} />);

    const body = container.querySelector(".code-body") as HTMLElement;
    // top = 400 - 200/2 + 40 = 340, clamped to >= 0.
    expect(body.scrollTop).toBe(340);

    offsetTopSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it("copies the full snippet when the copy button is clicked", () => {
    // Provide a clipboard that resolves so the CopyButton success path runs.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<CodeViewer source={source} hlStart={10} hlEnd={10} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(source.code);
  });
});
