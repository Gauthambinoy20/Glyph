// ⌘K command palette: fuzzy search across actions, endpoints, files & symbols.

import { useEffect, useMemo, useRef, useState } from "react";

import type { Source } from "../api";
import type { Endpoint } from "../types";
import { Icon } from "./Icon";
import type { CodeRef } from "./Chat";

/** Subsequence fuzzy score: contiguous matches and a prefix match score higher. */
export function fuzzy(needle: string, hay: string): number {
  needle = needle.toLowerCase();
  hay = hay.toLowerCase();
  if (!needle) return 1;
  let n = 0;
  let score = 0;
  let lastIdx = -1;
  for (let i = 0; i < hay.length && n < needle.length; i++) {
    if (hay[i] === needle[n]) {
      score += lastIdx === i - 1 ? 3 : 1;
      lastIdx = i;
      n++;
    }
  }
  return n === needle.length ? score + (hay.startsWith(needle) ? 10 : 0) : 0;
}

interface Item {
  kind: "action" | "endpoint" | "symbol";
  icon: string;
  main: string;
  sub: string;
  run: () => void;
}

interface Props {
  endpoints: Endpoint[];
  sources: Source[];
  onClose: () => void;
  onOpenCode: (ref: CodeRef) => void;
  onAsk: (q: string) => void;
  onChangeRepo: () => void;
}

export function CommandPalette({ endpoints, sources, onClose, onOpenCode, onAsk, onChangeRepo }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const arr: Item[] = [
      {
        kind: "action",
        icon: "refresh",
        main: "Re-ingest repository",
        sub: "Re-index from source",
        run: onChangeRepo,
      },
      {
        kind: "action",
        icon: "compass",
        main: "Ask: what does this codebase do?",
        sub: "Overview",
        run: () => onAsk("What does this codebase do?"),
      },
    ];
    endpoints.forEach((e) =>
      arr.push({
        kind: "endpoint",
        icon: "route",
        main: e.path,
        sub: e.method + " endpoint",
        run: () => onAsk(`Explain the ${e.method} ${e.path} endpoint.`),
      }),
    );
    sources.forEach((s) =>
      arr.push({
        kind: "symbol",
        icon: "file",
        main: s.symbol_name,
        sub: `${s.file_path}:${s.start_line}`,
        run: () => onOpenCode(s),
      }),
    );
    return arr;
  }, [endpoints, sources, onAsk, onOpenCode, onChangeRepo]);

  const results = useMemo<Item[]>(() => {
    if (!q.trim()) return items;
    return items
      .map((it) => ({ it, score: Math.max(fuzzy(q, it.main), fuzzy(q, it.sub) * 0.6) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [q, items]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function choose(it?: Item) {
    if (!it) return;
    it.run();
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="pal-scrim" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="pal-search">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files, symbols, or ask…"
            spellCheck="false"
          />
          <span className="esc">ESC</span>
        </div>
        <div className="pal-list scroll" ref={listRef}>
          {results.length === 0 && <div className="pal-empty">No matches for “{q}”.</div>}
          {results.map((it, idx) => (
            <div
              key={it.main + it.sub}
              className="pal-item"
              data-active={idx === active ? "1" : "0"}
              onMouseEnter={() => setActive(idx)}
              onClick={() => choose(it)}
            >
              <span className="pi-ic">
                <Icon name={it.icon} size={15} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="pi-main">{it.main}</span>
                <span className="pi-sub" style={{ display: "block" }}>
                  {it.sub}
                </span>
              </span>
              <span className="pi-kind">{it.kind}</span>
            </div>
          ))}
        </div>
        <div className="pal-foot">
          <span className="pf">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="pf">
            <span className="kbd">↵</span> select
          </span>
          <span className="pf">
            <span className="kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
