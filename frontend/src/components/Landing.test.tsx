// Tests for the Landing screen: it renders the hero, reports the typed value on submit, and
// lets the user choose the indexing mode (fast vs careful).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "./Landing";

// Default props so each test only has to pass what it cares about.
const base = { busy: false, mode: "careful" as const, onMode: () => {} };

describe("Landing", () => {
  it("renders the hero and ingest box", () => {
    render(<Landing onIngest={() => {}} {...base} />);
    expect(screen.getByText(/ask your/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeTruthy();
  });

  it("calls onIngest with the typed value when submitted", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} {...base} />);

    await user.type(screen.getByPlaceholderText(/github\.com/i), "app");
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    expect(onIngest).toHaveBeenCalledWith("app");
  });

  it("shows the ingesting state and is disabled while busy", () => {
    render(<Landing onIngest={() => {}} {...base} busy={true} />);
    const button = screen.getByRole("button", { name: /ingesting/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("renders demo-repo chips and ingests the repo URL on click", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} {...base} />);

    const chip = screen.getByRole("button", { name: /pallets\/click/i });
    await user.click(chip);

    expect(onIngest).toHaveBeenCalledWith("https://github.com/pallets/click");
  });

  it("lets the user pick the fast indexing mode", async () => {
    const onMode = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={() => {}} {...base} onMode={onMode} />);

    await user.click(screen.getByRole("button", { name: /fast/i }));

    expect(onMode).toHaveBeenCalledWith("fast");
  });
});
