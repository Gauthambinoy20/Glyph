// Tests for the Landing screen: it renders the hero and reports the typed value on submit.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "./Landing";

describe("Landing", () => {
  it("renders the hero and ingest box", () => {
    render(<Landing onIngest={() => {}} busy={false} />);
    expect(screen.getByText(/ask your/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeTruthy();
  });

  it("calls onIngest with the typed value when submitted", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} busy={false} />);

    await user.type(screen.getByPlaceholderText(/github\.com/i), "app");
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    expect(onIngest).toHaveBeenCalledWith("app");
  });

  it("shows the ingesting state and is disabled while busy", () => {
    render(<Landing onIngest={() => {}} busy={true} />);
    const button = screen.getByRole("button", { name: /ingesting/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("renders demo-repo chips and ingests the repo URL on click", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} busy={false} />);

    const chip = screen.getByRole("button", { name: /pallets\/click/i });
    await user.click(chip);

    expect(onIngest).toHaveBeenCalledWith("https://github.com/pallets/click");
  });
});
