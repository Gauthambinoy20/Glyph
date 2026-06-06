// Tests for the markdown renderer, the syntax highlighter, and the copy button.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton, Markdown, highlightHtml, highlightLine, mdInline } from "./Markdown";

describe("mdInline", () => {
  it("turns bold and inline code into HTML", () => {
    const html = mdInline("a **bold** word and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("escapes HTML so input cannot inject markup", () => {
    expect(mdInline("<script>x</script>")).toContain("&lt;script&gt;");
  });

  it("escapes ampersands and angle brackets together", () => {
    expect(mdInline("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });
});

describe("highlightLine", () => {
  it("tags keywords, function calls, strings and comments", () => {
    const html = highlightLine('def greet(): return "hi"  # note');
    expect(html).toContain('tok-kw">def');
    expect(html).toContain('tok-fn">greet');
    expect(html).toContain("tok-str");
    expect(html).toContain("tok-com");
  });

  it("tags numbers and JS-style // comments", () => {
    const html = highlightLine("const x = 42 // total");
    expect(html).toContain('tok-kw">const');
    expect(html).toContain('tok-num">42');
    expect(html).toContain('tok-com">// total');
  });

  it("leaves plain text untouched (no tokens)", () => {
    const html = highlightLine("just some plain words here");
    expect(html).not.toContain("tok-");
    expect(html).toBe("just some plain words here");
  });
});

describe("highlightHtml", () => {
  it("wraps each line in a .ln span and drops a trailing newline", () => {
    const html = highlightHtml("a\nb\n");
    // Trailing newline stripped, so two lines, not three.
    expect(html.match(/class="ln"/g)).toHaveLength(2);
  });

  it("renders a non-breaking space for empty lines", () => {
    const html = highlightHtml("first\n\nlast");
    expect(html).toContain("&nbsp;");
  });
});

describe("Markdown component", () => {
  it("renders h3 and h4 headings", () => {
    const { container } = render(<Markdown>{"### Big\n#### Small"}</Markdown>);
    expect(container.querySelector("h3")?.textContent).toBe("Big");
    expect(container.querySelector("h4")?.textContent).toBe("Small");
  });

  it("renders unordered lists for both - and * bullets", () => {
    const md = ["- dash one", "* star two"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    const ul = container.querySelector("ul");
    expect(ul).toBeTruthy();
    const items = within(ul as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("dash one");
    expect(items[1].textContent).toBe("star two");
  });

  it("renders ordered lists", () => {
    const md = ["1. first", "2. second", "3. third"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    const ol = container.querySelector("ol");
    expect(ol).toBeTruthy();
    const items = within(ol as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[2].textContent).toBe("third");
  });

  it("renders a fenced code block with a language and a copy button", () => {
    const md = ["```python", "def x():", "", "    pass", "```"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.querySelector("code.mono")).toBeTruthy();
    expect(pre?.querySelector("button.code-copy")).toBeTruthy();
    // Inner highlighted markup is injected via dangerouslySetInnerHTML.
    expect(pre?.querySelector("code.mono")?.innerHTML).toContain('class="ln"');
  });

  it("joins wrapped lines into a single paragraph", () => {
    const md = ["one line", "still same para", "and more"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    const paras = container.querySelectorAll("p");
    expect(paras).toHaveLength(1);
    expect(paras[0].textContent).toBe("one line still same para and more");
  });

  it("starts a new block when a paragraph is followed by a heading", () => {
    const md = ["intro text", "### A Heading"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("p")?.textContent).toBe("intro text");
    expect(container.querySelector("h3")?.textContent).toBe("A Heading");
  });

  it("renders inline bold and code inside list items and paragraphs", () => {
    const md = ["- a **bold** item", "", "a `code` paragraph"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("li strong")?.textContent).toBe("bold");
    expect(container.querySelector("p code")?.textContent).toBe("code");
  });

  it("skips blank lines without creating empty blocks", () => {
    const md = ["", "", "only paragraph", "", ""].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector(".md")?.children).toHaveLength(1);
  });

  it("renders an empty wrapper for empty input", () => {
    const { container } = render(<Markdown>{""}</Markdown>);
    const md = container.querySelector(".md");
    expect(md).toBeTruthy();
    expect(md?.children).toHaveLength(0);
  });

  it("treats unsupported constructs (tables, blockquotes, links) as paragraphs", () => {
    const md = [
      "| col a | col b |",
      "| ----- | ----- |",
      "| 1 | 2 |",
      "",
      "> a quoted line",
      "",
      "see [the docs](https://example.com) here",
    ].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    const paras = Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
    // The table rows collapse into one paragraph, the blockquote into another, link into a third.
    expect(paras).toHaveLength(3);
    expect(paras[0]).toContain("| col a | col b |");
    expect(paras[1]).toContain("> a quoted line");
    expect(paras[2]).toContain("[the docs](https://example.com)");
  });
});

describe("CopyButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the copy icon and an optional label by default", () => {
    render(<CopyButton text="hello" label="Copy code" />);
    const btn = screen.getByRole("button", { name: "Copy" });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain("iconbtn");
    expect(screen.getByText("Copy code")).toBeTruthy();
  });

  it("applies an extra className when provided", () => {
    render(<CopyButton text="x" className="code-copy" />);
    expect(screen.getByRole("button", { name: "Copy" }).className).toContain("code-copy");
  });

  it("copies text, flips to a check + 'Copied', then reverts after the timeout", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<CopyButton text="payload" label="Copy" />);
    const btn = screen.getByRole("button", { name: "Copy" });

    fireEvent.click(btn);

    // After the resolved clipboard promise flushes, the button shows the check + "Copied".
    await waitFor(() => expect(within(btn).getByText("Copied")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("payload");
    expect(btn.querySelector(".copied-toast")).toBeTruthy();

    // The revert is scheduled for 1400ms; fire that timer to flip back to the plain label.
    const revert = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 1400)?.[0] as () => void;
    expect(revert).toBeTypeOf("function");
    act(() => revert());
    await waitFor(() => expect(within(btn).getByText("Copy")).toBeTruthy());
    expect(btn.querySelector(".copied-toast")).toBeNull();
  });

  it("stops click propagation so a wrapping clickable parent is not triggered", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <CopyButton text="x" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("swallows a rejected clipboard write without flipping to the check", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<CopyButton text="x" label="Copy" />);
    const btn = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(btn);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // The catch handler keeps state unchanged: never shows "Copied".
    expect(within(btn).queryByText("Copied")).toBeNull();
  });

  it("does nothing when the clipboard API is unavailable", () => {
    vi.stubGlobal("navigator", {});
    render(<CopyButton text="x" />);
    const btn = screen.getByRole("button", { name: "Copy" });
    // Optional chaining short-circuits; clicking must not throw.
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});
