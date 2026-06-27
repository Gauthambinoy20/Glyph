// Minimal single-weight stroke icon set + the Glyph logo mark. Standard UI glyphs only.

import { useId, type CSSProperties } from "react";

const ICON_PATHS: Record<string, string> = {
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5",
  close: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12.5l4.5 4.5L19 7",
  chevDown: "M6 9l6 6 6-6",
  chevRight: "M9 6l6 6-6 6",
  github:
    "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z",
  branch:
    "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4-6 3-6 9",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  chain: "M9 12h6M10 8h7a4 4 0 0 1 0 8h-1M14 16H7a4 4 0 0 1 0-8h1",
  compass: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15.5 8.5l-2 5-5 2 2-5 5-2z",
  route: "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 8v3a4 4 0 0 1-4 4H9",
  flow: "M4 5h6v5H4zM14 14h6v5h-6zM10 7h4a2 2 0 0 1 2 2v5",
  file: "M14 3v5h5M14 3H5v18h14V8l-5-5z",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  zap: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  bookOpen:
    "M12 6.5C10.5 5 7.5 4.5 4 5v13c3.5-.5 6.5 0 8 1.5 1.5-1.5 4.5-2 8-1.5V5c-3.5-.5-6.5 0-8 1.5zM12 6.5v13",
};

interface IconProps {
  name: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

/** A single-path stroke icon at the given size. Returns null for an unknown name. */
export function Icon({ name, size = 18, style, className }: IconProps) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The Glyph mark: a machined dark tile with a geometric green "G" (a clean C-arc plus a
 * centre tongue). Self-contained SVG — the same vector is reused at every size, from the
 * 16px favicon to the landing hero, so the brand never relies on a font-rendered letter.
 * Gradient ids are made unique per instance so multiple marks on a page never collide.
 */
export function GlyphMark({ size = 28, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const grn = `glyph-grn-${uid}`;
  const tile = `glyph-tile-${uid}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={grn} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9ff5a6" />
          <stop offset="0.5" stopColor="#7ee787" />
          <stop offset="1" stopColor="#58c97e" />
        </linearGradient>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1d22" />
          <stop offset="1" stopColor="#0c0d10" />
        </linearGradient>
      </defs>
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="11"
        fill={`url(#${tile})`}
        stroke="#7ee787"
        strokeOpacity="0.34"
      />
      <rect x="2" y="2" width="36" height="16" rx="9.5" fill="#ffffff" opacity="0.05" />
      <text
        x="20"
        y="29.5"
        textAnchor="middle"
        fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill={`url(#${grn})`}
      >
        G
      </text>
    </svg>
  );
}

/** Sizing wrapper used by the navbar and the landing hero (CSS sets the box; the SVG fills it). */
export function LogoMark({ large }: { large?: boolean }) {
  return <GlyphMark className={large ? "logo-mark lg" : "logo-mark"} size={large ? 46 : 28} />;
}

/** Logo tile + "Glyph." wordmark. */
export function Logo({ large }: { large?: boolean }) {
  return (
    <span className="logo">
      <LogoMark large={large} />
      <span className="logo-word" style={large ? { fontSize: 22 } : undefined}>
        Glyph<span className="dot">.</span>
      </span>
    </span>
  );
}
