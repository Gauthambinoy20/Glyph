// Tests for the markdown renderer and the syntax highlighter.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown, highlightLine, mdInline } from "./Markdown";

describe("mdInline", () => {
  it("turns bold and inline code into HTML", () => {
    const html = mdInline("a **bold** word and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("escapes HTML so input cannot inject markup", () => {
    expect(mdInline("<script>x</script>")).toContain("&lt;script&gt;");
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
});

describe("Markdown component", () => {
  it("renders headings, lists, and code blocks", () => {
    const md = ["### Title", "", "- first item", "", "```python", "def x():", "    pass", "```"].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);

    expect(container.querySelector("h3")?.textContent).toBe("Title");
    expect(container.querySelector("li")?.textContent).toContain("first item");
    expect(container.querySelector("pre code")).toBeTruthy();
  });
});
