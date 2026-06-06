// Tests for the chat pieces: the rich answer, citations + hover peek, the
// collapsible sources list, the empty state, the thinking dots, and the composer.

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Message, Suggestion } from "../types";
import { ChatEmpty, Composer, GlyphAnswer, Thinking } from "./Chat";

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

  it("pluralises the grounding badge and renders an empty model gracefully", () => {
    const multi: Extract<Message, { role: "glyph" }> = {
      ...answer,
      meta: { ...answer.meta!, model: "" },
      sources: [
        ...answer.sources,
        {
          id: "y",
          file_path: "db.py",
          symbol_name: "connect",
          type: "function",
          start_line: 5,
          end_line: 9,
          code: "def connect(): pass",
          language: "python",
        },
      ],
    };
    render(<GlyphAnswer msg={multi} onOpenCode={() => {}} onAsk={() => {}} />);
    // plural "sources" path of the grounding badge
    expect(screen.getByText(/grounded on 2 sources/i)).toBeTruthy();
  });

  it("renders followups and calls onAsk when one is clicked", async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    render(<GlyphAnswer msg={answer} onOpenCode={() => {}} onAsk={onAsk} />);
    await user.click(screen.getByRole("button", { name: /where is it called\?/i }));
    expect(onAsk).toHaveBeenCalledWith("Where is it called?");
  });

  it("hides meta, citations, sources and followups while streaming and shows the cursor", () => {
    const { container } = render(
      <GlyphAnswer msg={answer} onOpenCode={() => {}} onAsk={() => {}} streaming />,
    );
    expect(container.querySelector(".cursor")).toBeTruthy();
    expect(screen.queryByText(/grounded on/i)).toBeNull();
    expect(screen.queryByText(/source.* retrieved/i)).toBeNull();
  });

  it("omits the metaline when the answer has no meta", () => {
    const { container } = render(
      // The Message type marks meta required, but a loaded session can omit it — cast to drive
      // GlyphAnswer's defensive no-metaline branch.
      <GlyphAnswer
        msg={{ ...answer, meta: undefined } as unknown as typeof answer}
        onOpenCode={() => {}}
        onAsk={() => {}}
      />,
    );
    expect(container.querySelector(".metaline")).toBeNull();
    // grounding badge is still rendered
    expect(screen.getByText(/grounded on 1 source/i)).toBeTruthy();
  });

  it("renders nothing for citations and no sources block when both are empty", () => {
    const { container } = render(
      <GlyphAnswer
        msg={{ ...answer, citations: [], sources: [], followups: [] }}
        onOpenCode={() => {}}
        onAsk={() => {}}
      />,
    );
    // Citations returns null -> no "Cited" label
    expect(screen.queryByText("Cited")).toBeNull();
    // sources length 0 -> no toggle
    expect(container.querySelector(".sources-toggle")).toBeNull();
    // followups empty -> no followup buttons
    expect(container.querySelector(".followup")).toBeNull();
    expect(screen.getByText(/grounded on 0 sources/i)).toBeTruthy();
  });
});

describe("Citations hover peek (CitePeek)", () => {
  const originalGBCR = Element.prototype.getBoundingClientRect;

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGBCR;
  });

  function stubRect(rect: Partial<DOMRect>) {
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
          ...rect,
        }) as DOMRect,
    );
  }

  it("opens a below-positioned peek on hover and closes it on leave", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect({ left: 10, top: 40, bottom: 60 });

    const { container } = render(<GlyphAnswer msg={answer} onOpenCode={() => {}} onAsk={() => {}} />);
    const chip = container.querySelector(".cite-chip") as HTMLElement;

    fireEvent.mouseEnter(chip);
    const peek = container.querySelector(".cite-peek") as HTMLElement;
    expect(peek).toBeTruthy();
    // below: uses top (y), not bottom positioning
    expect(peek.style.top).toBe("68px"); // r.bottom + 8
    expect(peek.style.left).toBe("10px");
    // file path + language line are shown inside the peek
    expect(within(peek).getByText("auth.py")).toBeTruthy();
    expect(within(peek).getByText(/python/i)).toBeTruthy();

    fireEvent.mouseLeave(chip);
    expect(container.querySelector(".cite-peek")).toBeNull();
  });

  it("positions the peek above and clamps x near the right edge", () => {
    vi.stubGlobal("innerWidth", 420); // r.left(300) + 420 > 420 - 12 -> clamp
    vi.stubGlobal("innerHeight", 200); // r.bottom(180) + 230 > 200 -> above
    stubRect({ left: 300, top: 150, bottom: 180 });

    const { container } = render(<GlyphAnswer msg={answer} onOpenCode={() => {}} onAsk={() => {}} />);
    const chip = container.querySelector(".cite-chip") as HTMLElement;

    fireEvent.mouseEnter(chip);
    const peek = container.querySelector(".cite-peek") as HTMLElement;
    expect(peek).toBeTruthy();
    // clamped x = innerWidth - w - 12 = 420 - 420 - 12 = -12
    expect(peek.style.left).toBe("-12px");
    // above branch uses bottom = innerHeight - top + 8 = 200 - 150 + 8 = 58
    expect(peek.style.bottom).toBe("58px");
    expect(peek.style.top).toBe("");
  });

  it("renders an empty-line fallback inside the peek for blank code lines", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect({ left: 10, top: 40, bottom: 60 });

    const withBlank: Extract<Message, { role: "glyph" }> = {
      ...answer,
      sources: [{ ...answer.sources[0], code: "def login():\n\n    pass\n" }],
    };
    const { container } = render(<GlyphAnswer msg={withBlank} onOpenCode={() => {}} onAsk={() => {}} />);
    const chip = container.querySelector(".cite-chip") as HTMLElement;

    fireEvent.mouseEnter(chip);
    const peek = container.querySelector(".cite-peek") as HTMLElement;
    const lns = peek.querySelectorAll(".ln");
    expect(lns.length).toBe(3); // trailing newline trimmed; blank middle line kept
    // the blank middle line falls back to a non-breaking space
    expect(lns[1].innerHTML).toBe("&nbsp;");
  });

  it("does not open a peek when the citation has no matching source", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect({ left: 10, top: 40, bottom: 60 });

    const noMatch: Extract<Message, { role: "glyph" }> = {
      ...answer,
      citations: [{ file_path: "ghost.py", start_line: 1, end_line: 2 }],
    };
    const { container } = render(<GlyphAnswer msg={noMatch} onOpenCode={() => {}} onAsk={() => {}} />);
    const chip = container.querySelector(".cite-chip") as HTMLElement;

    fireEvent.mouseEnter(chip);
    expect(container.querySelector(".cite-peek")).toBeNull();
  });

  it("clears the peek when the mouse leaves the chip row", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect({ left: 10, top: 40, bottom: 60 });

    const { container } = render(<GlyphAnswer msg={answer} onOpenCode={() => {}} onAsk={() => {}} />);
    const chip = container.querySelector(".cite-chip") as HTMLElement;
    const chips = container.querySelector(".cite-chips") as HTMLElement;

    fireEvent.mouseEnter(chip);
    expect(container.querySelector(".cite-peek")).toBeTruthy();
    fireEvent.mouseLeave(chips);
    expect(container.querySelector(".cite-peek")).toBeNull();
  });
});

describe("SourcesList", () => {
  it("toggles the collapsible list and opens code for a clicked row", async () => {
    const onOpenCode = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<GlyphAnswer msg={answer} onOpenCode={onOpenCode} onAsk={() => {}} />);

    const toggle = container.querySelector(".sources-toggle") as HTMLElement;
    expect(toggle.getAttribute("data-open")).toBe("0");
    expect(container.querySelector(".sources-list")).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("data-open")).toBe("1");
    const list = container.querySelector(".sources-list") as HTMLElement;
    expect(list).toBeTruthy();
    expect(within(list).getByText("login")).toBeTruthy();
    expect(within(list).getByText(/auth\.py:1/)).toBeTruthy();

    await user.click(container.querySelector(".src-row") as HTMLElement);
    expect(onOpenCode).toHaveBeenCalledWith(answer.sources[0]);

    // collapse again
    await user.click(toggle);
    expect(container.querySelector(".sources-list")).toBeNull();
  });
});

describe("Thinking", () => {
  it("renders the Glyph avatar and the animated dots", () => {
    const { container } = render(<Thinking />);
    expect(screen.getByText("Glyph")).toBeTruthy();
    expect(container.querySelectorAll(".thinking i").length).toBe(3);
  });
});

describe("ChatEmpty", () => {
  it("renders the overview card and the suggestion cards", async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    const suggestions: Suggestion[] = [{ q: "What does this do?", hint: "Overview", icon: "compass" }];
    const { container } = render(
      <ChatEmpty overview="An **assistant**." suggestions={suggestions} onAsk={onAsk} />,
    );
    expect(container.querySelector(".welcome-card")).toBeTruthy();
    expect(screen.getByText("What does this do?")).toBeTruthy();

    await user.click(screen.getByText("What does this do?"));
    expect(onAsk).toHaveBeenCalledWith("What does this do?");
  });

  it("omits the welcome card when there is no overview", () => {
    const { container } = render(<ChatEmpty overview="" suggestions={[]} onAsk={() => {}} />);
    expect(container.querySelector(".welcome-card")).toBeNull();
    expect(screen.getByText(/ask anything about this code/i)).toBeTruthy();
  });
});

describe("Composer", () => {
  beforeEach(() => {
    // jsdom textarea scrollHeight is 0; the autosize effect just reads it, no mock needed.
  });

  it("sends the text on Enter and clears the field", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} busy={false} />);
    const ta = screen.getByPlaceholderText(/ask about the code/i) as HTMLTextAreaElement;
    await user.type(ta, "where is login{Enter}");
    expect(onSend).toHaveBeenCalledWith("where is login");
    expect(ta.value).toBe("");
  });

  it("inserts a newline on Shift+Enter without sending", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} busy={false} />);
    const ta = screen.getByPlaceholderText(/ask about the code/i) as HTMLTextAreaElement;
    await user.type(ta, "line one{Shift>}{Enter}{/Shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(ta.value).toBe("line one\nline two");
  });

  it("sends on the send button click", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} busy={false} />);
    await user.type(screen.getByPlaceholderText(/ask about the code/i), "hello");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not send blank or whitespace-only input", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} busy={false} />);
    const ta = screen.getByPlaceholderText(/ask about the code/i);
    // Enter on empty does nothing
    await user.type(ta, "{Enter}");
    // whitespace then Enter is trimmed to empty -> no send
    await user.type(ta, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while busy and shows the spinner", async () => {
    const onSend = vi.fn();
    const { container } = render(<Composer onSend={onSend} busy />);
    const ta = screen.getByPlaceholderText(/ask about the code/i) as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
    // submit() returns early because busy is true
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector(".spinner")).toBeTruthy();
  });
});
