// Tests for the sliding code viewer.

import { render, screen } from "@testing-library/react";
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
});
