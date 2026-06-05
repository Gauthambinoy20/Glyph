// Tests for the icon set and the logo.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon, Logo } from "./Icon";

describe("Icon", () => {
  it("renders an svg for a known icon at the given size", () => {
    const { container } = render(<Icon name="search" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("20");
  });

  it("renders nothing for an unknown icon name", () => {
    const { container } = render(<Icon name="does-not-exist" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("Logo", () => {
  it("shows the Glyph wordmark", () => {
    const { getByText } = render(<Logo />);
    expect(getByText("Glyph")).toBeTruthy();
  });
});
