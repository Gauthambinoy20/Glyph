// Tests for the chat pieces: the rich answer, the empty state, and the composer.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Message, Suggestion } from "../types";
import { ChatEmpty, Composer, GlyphAnswer } from "./Chat";

const answer: Extract<Message, { role: "glyph" }> = {
  role: "glyph",
  answer: "Login lives in **auth.py**.",
  citations: [{ file_path: "auth.py", start_line: 1, end_line: 3 }],
  retrieved_chunk_ids: ["x"],
  sources: [
    {
      id: "x",
      file_path: "auth.py",
      symbol_name: "login",
      type: "function",
      start_line: 1,
      end_line: 3,
      code: "def login(): pass",
      language: "python",
    },
  ],
  meta: {
    model: "test/model",
    latency_ms: 1200,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  },
  followups: ["Where is it called?"],
};

describe("GlyphAnswer", () => {
  it("shows the grounding badge, metrics and a clickable citation", async () => {
    const onOpenCode = vi.fn();
    const user = userEvent.setup();
    render(<GlyphAnswer msg={answer} onOpenCode={onOpenCode} onAsk={() => {}} />);

    expect(screen.getByText(/grounded on 1 source/i)).toBeTruthy();
    expect(screen.getByText("model")).toBeTruthy(); // model shown as the part after the slash

    await user.click(screen.getByRole("button", { name: /auth\.py/i }));
    expect(onOpenCode).toHaveBeenCalledWith(answer.citations[0]);
  });

  it("renders a not-found answer as a calm note with no citations", () => {
    const nf: Extract<Message, { role: "glyph" }> = { ...answer, answer: "Not found in the provided code." };
    render(<GlyphAnswer msg={nf} onOpenCode={() => {}} onAsk={() => {}} />);
    expect(screen.getByText(/not found/i)).toBeTruthy();
    expect(screen.queryByText(/grounded on/i)).toBeNull();
  });
});

describe("ChatEmpty", () => {
  it("renders the suggestion cards", () => {
    const suggestions: Suggestion[] = [{ q: "What does this do?", hint: "Overview", icon: "compass" }];
    render(<ChatEmpty overview="An **assistant**." suggestions={suggestions} onAsk={() => {}} />);
    expect(screen.getByText("What does this do?")).toBeTruthy();
  });
});

describe("Composer", () => {
  it("sends the text on Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} busy={false} />);
    await user.type(screen.getByPlaceholderText(/ask about the code/i), "where is login{Enter}");
    expect(onSend).toHaveBeenCalledWith("where is login");
  });
});
