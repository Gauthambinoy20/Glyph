// Tests for the Landing screen: it renders the hero, reports the typed value on submit, and
// lets the user choose the indexing mode (fast vs careful).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "./Landing";
import type { IngestState } from "./IngestProgress";
import type { Recent } from "../types";

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

  it("falls back to 'app' when the input is empty or whitespace on submit", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} {...base} />);

    // Type only whitespace so value.trim() is empty and the "app" fallback kicks in.
    await user.type(screen.getByPlaceholderText(/github\.com/i), "   ");
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    expect(onIngest).toHaveBeenCalledWith("app");
  });

  it("shows the ingesting state and is disabled while busy", () => {
    render(<Landing onIngest={() => {}} {...base} busy={true} />);
    const button = screen.getByRole("button", { name: /ingesting/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("does not call onIngest on submit while busy", () => {
    const onIngest = vi.fn();
    render(<Landing onIngest={onIngest} {...base} busy={true} />);

    // The form can still receive a submit event (e.g. Enter) even with a disabled button;
    // the submit handler must short-circuit on busy.
    const form = document.querySelector("form.ingest") as HTMLFormElement;
    form.requestSubmit?.();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onIngest).not.toHaveBeenCalled();
  });

  it("renders demo-repo chips and ingests the repo URL on click", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} {...base} />);

    const chip = screen.getByRole("button", { name: /pmndrs\/zustand/i });
    await user.click(chip);

    expect(onIngest).toHaveBeenCalledWith("https://github.com/pmndrs/zustand");
  });

  it("does not ingest a demo repo while busy", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={onIngest} {...base} busy={true} />);

    const chip = screen.getByRole("button", { name: /pmndrs\/zustand/i });
    await user.click(chip);

    expect(onIngest).not.toHaveBeenCalled();
  });

  it("lets the user pick the fast indexing mode", async () => {
    const onMode = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={() => {}} {...base} onMode={onMode} />);

    await user.click(screen.getByRole("button", { name: /fast indexing/i }));

    expect(onMode).toHaveBeenCalledWith("fast");
  });

  it("lets the user pick the careful indexing mode", async () => {
    const onMode = vi.fn();
    const user = userEvent.setup();
    render(<Landing onIngest={() => {}} {...base} mode="fast" onMode={onMode} />);

    await user.click(screen.getByRole("button", { name: /careful indexing/i }));

    expect(onMode).toHaveBeenCalledWith("careful");
  });

  it("reflects the selected mode via aria-pressed and the mode note", () => {
    const { rerender } = render(<Landing onIngest={() => {}} {...base} mode="careful" />);

    const fastBtn = screen.getByRole("button", { name: /fast indexing/i });
    const carefulBtn = screen.getByRole("button", { name: /careful indexing/i });
    expect(carefulBtn.getAttribute("aria-pressed")).toBe("true");
    expect(fastBtn.getAttribute("aria-pressed")).toBe("false");
    // Careful mode shows the transformer-embeddings note.
    expect(screen.getByText(/Transformer embeddings/i)).toBeTruthy();

    rerender(<Landing onIngest={() => {}} {...base} mode="fast" />);
    expect(screen.getByRole("button", { name: /fast indexing/i }).getAttribute("aria-pressed")).toBe("true");
    // Fast mode shows the static-embeddings note.
    expect(screen.getByText(/Static embeddings/i)).toBeTruthy();
  });

  it("shows the 'try app' hint when there is no progress", () => {
    render(<Landing onIngest={() => {}} {...base} />);
    expect(screen.getByText(/to index Glyph/i)).toBeTruthy();
  });

  it("renders ingest progress and hides the mode/demo/hint sections when progress is set", () => {
    const progress: IngestState = {
      isRepo: true,
      clone: "running",
    };
    render(<Landing onIngest={() => {}} {...base} progress={progress} />);

    // The live progress checklist appears.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Cloning repository/i)).toBeTruthy();

    // The pre-ingest helpers are gone while progress is showing.
    expect(document.querySelector(".mode-pick")).toBeNull();
    expect(document.querySelector(".mode-note")).toBeNull();
    expect(screen.queryByText(/Try a public repo/i)).toBeNull();
    expect(screen.queryByText(/to index Glyph/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /pmndrs\/zustand/i })).toBeNull();
  });

  it("renders recent repos (capped at four) and ingests the owner/name on click", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    const recent: Recent[] = [
      { owner: "alpha", name: "one", when: "now" },
      { owner: "beta", name: "two", when: "now" },
      { owner: "gamma", name: "three", when: "now" },
      { owner: "delta", name: "four", when: "now" },
      { owner: "epsilon", name: "five", when: "now" },
    ];
    render(<Landing onIngest={onIngest} {...base} recent={recent} />);

    // Only the first four recents are rendered.
    expect(screen.getByText("alpha/one")).toBeTruthy();
    expect(screen.getByText("delta/four")).toBeTruthy();
    expect(screen.queryByText("epsilon/five")).toBeNull();

    await user.click(screen.getByRole("button", { name: /alpha\/one/i }));
    expect(onIngest).toHaveBeenCalledWith("alpha/one");
  });

  it("does not ingest a recent repo while busy", async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    const recent: Recent[] = [{ owner: "alpha", name: "one", when: "now" }];
    render(<Landing onIngest={onIngest} {...base} recent={recent} busy={true} />);

    await user.click(screen.getByRole("button", { name: /alpha\/one/i }));
    expect(onIngest).not.toHaveBeenCalled();
  });

  it("hides recent repos while progress is showing", () => {
    const recent: Recent[] = [{ owner: "alpha", name: "one", when: "now" }];
    const progress: IngestState = { isRepo: false, clone: "idle" };
    render(<Landing onIngest={() => {}} {...base} recent={recent} progress={progress} />);

    expect(screen.queryByText("alpha/one")).toBeNull();
  });

  it("does not render the recent section when the list is empty", () => {
    render(<Landing onIngest={() => {}} {...base} recent={[]} />);
    expect(document.querySelector(".land-recent")).toBeNull();
  });

  it("exposes the clone-the-repo link to GitHub", () => {
    render(<Landing onIngest={() => {}} {...base} />);
    const link = screen.getByRole("link", { name: /clone the repo/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://github.com/Gauthambinoy20/Glyph");
    // Keep within to satisfy the imported helper and assert the icon-bearing label.
    expect(within(link).getByText(/clone the repo/i)).toBeTruthy();
  });
});
