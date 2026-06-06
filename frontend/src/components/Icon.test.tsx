// Tests for the icon set and the logo.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon, Logo, LogoMark } from "./Icon";

describe("Icon", () => {
  it("renders an svg for a known icon at the given size", () => {
    const { container } = render(<Icon name="search" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("20");
  });

  it("falls back to the default size of 18 when size is omitted", () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("height")).toBe("18");
  });

  it("forwards style and className onto the svg", () => {
    const { container } = render(<Icon name="search" style={{ color: "red" }} className="my-icon" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("my-icon");
    expect((svg as SVGElement | null)?.getAttribute("style")).toContain("color");
  });

  it("renders the matching path for the requested icon name", () => {
    const { container } = render(<Icon name="check" />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M5 12.5l4.5 4.5L19 7");
  });

  it("renders nothing for an unknown icon name", () => {
    const { container } = render(<Icon name="does-not-exist" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("LogoMark", () => {
  it("uses the base class when not large", () => {
    const { container } = render(<LogoMark />);
    const mark = container.querySelector(".logo-mark");
    expect(mark).toBeTruthy();
    expect(mark?.getAttribute("class")).toBe("logo-mark");
  });

  it("adds the lg modifier class when large", () => {
    const { container } = render(<LogoMark large />);
    expect(container.querySelector(".logo-mark.lg")).toBeTruthy();
  });
});

describe("Logo", () => {
  it("shows the Glyph wordmark", () => {
    const { getByText } = render(<Logo />);
    expect(getByText("Glyph")).toBeTruthy();
  });

  it("does not inline a font-size on the wordmark when not large", () => {
    const { container } = render(<Logo />);
    const word = container.querySelector(".logo-word") as HTMLElement | null;
    expect(word).toBeTruthy();
    expect(word?.getAttribute("style")).toBeNull();
  });

  it("renders the large logo with an enlarged wordmark font-size", () => {
    const { container } = render(<Logo large />);
    expect(container.querySelector(".logo-mark.lg")).toBeTruthy();
    const word = container.querySelector(".logo-word") as HTMLElement | null;
    expect(word?.getAttribute("style")).toContain("font-size: 22px");
  });
});
