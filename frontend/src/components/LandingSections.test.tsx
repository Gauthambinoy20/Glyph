// Tests for the landing marketing sections: they render, and the quickstart copy works.

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingSections } from "./LandingSections";

describe("LandingSections", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it("renders every section and its content", () => {
    render(<LandingSections />);
    expect(screen.getByText("How it works")).toBeTruthy();
    expect(screen.getByText("What you get")).toBeTruthy();
    expect(screen.getByText("Under the hood")).toBeTruthy();
    expect(screen.getByText("Run it yourself")).toBeTruthy();
    expect(screen.getByText("Built by Gautham Binoy")).toBeTruthy();
    // a step, a feature and a stack chip (exact text so a parent's combined text never matches)
    expect(screen.getByText("Ingest")).toBeTruthy();
    expect(screen.getByText("File and line citations")).toBeTruthy();
    expect(screen.getByText("OpenRouter · gpt-oss-120b")).toBeTruthy();
  });

  it("copies a quickstart command and switches the icon to the copied state", () => {
    const { container } = render(<LandingSections />);
    const copyButtons = screen.getAllByLabelText("Copy command");
    fireEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "git clone https://github.com/Gauthambinoy20/Glyph.git",
    );
    // the check icon path appears once the command is copied
    expect(container.querySelector("path[d='M5 12.5l4.5 4.5L19 7']")).toBeTruthy();
  });
});
