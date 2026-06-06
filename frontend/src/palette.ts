// One source of truth for language colours, shared by the canvas graph card, the D3 modal and
// the panel widgets. `langColor` is the flat per-language accent; `gemStops` adds the light/dark
// stops that give the architecture graphs their gem-like nodes.

// Keyed by the lowercased language name so "TypeScript", "Typescript" and "typescript" all resolve.
const LANG_COLOR: Record<string, string> = {
  typescript: "#4c9eff",
  tsx: "#4c9eff",
  javascript: "#f7df1e",
  jsx: "#f7df1e",
  python: "#ffd866",
  css: "#c792ea",
  html: "#e9682c",
  json: "#7ee787",
  markdown: "#9aa0aa",
  go: "#00add8",
  rust: "#ff7043",
  java: "#e76f00",
  ruby: "#e0455f",
  c: "#8d9bb0",
  cpp: "#f070a0",
  "c++": "#f070a0",
  "c#": "#9b6cff",
  php: "#8a91d6",
  shell: "#89e051",
  yaml: "#cb8f3a",
};

export function langColor(l: string): string {
  return LANG_COLOR[l.toLowerCase()] || "#9aa0aa";
}

// Gem palette (mid, dark) for the languages Glyph parses precisely. Any other language falls back
// to langColor() for the mid stop and a derived dark stop, so the gem look generalises.
const GEM: Record<string, [string, string]> = {
  javascript: ["#f4d35e", "#7a6612"],
  python: ["#e8a93c", "#74520f"],
  tsx: ["#5aa8ff", "#1c4a82"],
  typescript: ["#2dd4bf", "#0d5f55"],
};

/** Darken a #rrggbb colour toward black by factor f (0..1) for the gradient's outer stop. */
function darken(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  /* v8 ignore next -- defensive: langColor() always yields a valid #rrggbb */
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** [light, mid, dark] stops for a language's gem gradient. */
export function gemStops(lang: string): [string, string, string] {
  const key = lang.toLowerCase();
  const mid = GEM[key]?.[0] ?? langColor(key);
  const dark = GEM[key]?.[1] ?? darken(mid, 0.55);
  return ["#ffffff", mid, dark];
}
