// Build repo-aligned starter questions from what Glyph found while indexing. Pure and
// deterministic (no LLM call), so the four prompts always match the actual code and can be
// unit-tested. They cover distinct intents — overview, API surface, a concrete symbol, and
// structure — because naming a real endpoint or symbol makes retrieval land on the right
// chunks, which is what gives the model the grounded context for a strong, cited answer.

import type { Endpoint, Suggestion } from "./types";

interface SymbolLike {
  symbol_name: string;
  type: string;
}

// Generic prompts used as fallbacks so we always return exactly four, even for a sparse repo.
const GENERIC: Suggestion[] = [
  {
    q: "What does this project do and how is it structured?",
    hint: "High-level overview",
    icon: "compass",
  },
  { q: "What are the main modules and what is each responsible for?", hint: "Module map", icon: "flow" },
  { q: "Where does execution start — what are the entry points?", hint: "Entry points", icon: "route" },
  { q: "How is the code tested?", hint: "Tests & quality", icon: "search" },
];

/** Pick a concrete, askable symbol — a real function/class, never the <module> catch-all. */
function pickSymbol(symbols: SymbolLike[]): string | null {
  const good = symbols.find(
    (s) =>
      s.symbol_name &&
      s.symbol_name !== "<module>" &&
      s.symbol_name.length >= 3 &&
      /function|method|class/i.test(s.type),
  );
  return good ? good.symbol_name : null;
}

/**
 * Four starter questions tailored to the indexed repo. Always returns exactly four: it adds a
 * question per available signal (a real endpoint, a real symbol, a dependency graph), then fills
 * any gaps from the generic pool, never duplicating a question.
 */
export function buildSuggestions(input: {
  endpoints?: Endpoint[];
  symbols?: SymbolLike[];
  hasDeps?: boolean;
}): Suggestion[] {
  const endpoints = input.endpoints ?? [];
  const symbols = input.symbols ?? [];
  const out: Suggestion[] = [];

  // 1) Big picture — grounded by the generated overview.
  out.push({
    q: "What does this project do and how is it structured?",
    hint: "High-level overview",
    icon: "compass",
  });

  // 2) API surface — name a real route so retrieval lands on its handler.
  if (endpoints.length) {
    const e = endpoints[0];
    out.push({
      q: `Explain the ${e.method} ${e.path} endpoint — how is it handled?`,
      hint: "API & routing",
      icon: "route",
    });
  }

  // 3) A concrete symbol — naming it gives the model the exact code to explain.
  const sym = pickSymbol(symbols);
  if (sym) {
    out.push({ q: `How does \`${sym}\` work?`, hint: "Trace a key function", icon: "search" });
  }

  // 4) Structure / dependencies.
  if (input.hasDeps) {
    out.push({
      q: "Which files are most central, and how do they depend on each other?",
      hint: "Architecture & deps",
      icon: "flow",
    });
  }

  // Always return four: fill any gaps from the generic pool, no duplicates.
  for (const g of GENERIC) {
    if (out.length >= 4) break;
    if (!out.some((s) => s.q === g.q)) out.push(g);
  }
  return out.slice(0, 4);
}
