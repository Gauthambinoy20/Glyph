// Tests for the shared language palette: the flat per-language accent and the gem gradient stops.

import { describe, expect, it } from "vitest";

import { gemStops, langColor } from "./palette";

describe("langColor", () => {
  it("maps known languages and falls back for unknown ones", () => {
    expect(langColor("Python")).toBe("#ffd866");
    expect(langColor("TypeScript")).toBe("#4c9eff");
    expect(langColor("brainfuck")).toBe("#9aa0aa"); // fallback grey
  });
});

describe("gemStops", () => {
  it("uses the gem palette for the core languages", () => {
    expect(gemStops("typescript")).toEqual(["#ffffff", "#2dd4bf", "#0d5f55"]);
    expect(gemStops("PYTHON")).toEqual(["#ffffff", "#e8a93c", "#74520f"]); // case-insensitive
  });

  it("falls back to langColor + a derived dark stop for other languages", () => {
    const [light, mid, dark] = gemStops("go");
    expect(light).toBe("#ffffff");
    expect(mid).toBe("#00add8"); // langColor("go")
    expect(dark).toMatch(/^#[0-9a-f]{6}$/i); // darkened, valid hex
    expect(dark).not.toBe(mid);
  });
});
