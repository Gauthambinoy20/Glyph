// Build repo-aligned starter questions from what Glyph found while indexing. Pure and
// deterministic (no LLM call), so the prompts always match the actual code and can be unit-tested.
// The shown set spans distinct intents — overview, API surface, a concrete symbol, a detected
// framework, structure, then a broad pool of cross-cutting questions (data flow, security,
// onboarding, testing, errors, the tricky bit, extensibility) — because naming real code makes
// retrieval land on the right chunks, and breadth gives a new reader many useful ways in.

import type { Endpoint, Suggestion } from "./types";

interface SymbolLike {
  symbol_name: string;
  type: string;
}

// How many starter questions to surface after indexing.
const COUNT = 6;

// A broad, diverse pool of cross-cutting prompts — one per distinct intent — used to fill the
// slots the repo-specific questions don't. Disjoint from those questions by construction, so no
// de-duplication is needed. The overview prompt is intentionally NOT here: it is always shown
// first (see buildSuggestions), and keeping it out of the pool lets the rotation below stay even.
const POOL: Suggestion[] = [
  { q: "What are the main modules and what is each responsible for?", hint: "Module map", icon: "layers" },
  { q: "Where does execution start — what are the entry points?", hint: "Entry points", icon: "route" },
  { q: "Trace how data flows from input through to where it is stored.", hint: "Data flow", icon: "flow" },
  {
    q: "How is input validated, and where are secrets and credentials handled?",
    hint: "Security",
    icon: "activity",
  },
  { q: "I'm new here — which three files should I read first, and why?", hint: "Onboarding", icon: "file" },
  {
    q: "How is the code tested, and what does the test strategy cover?",
    hint: "Tests & quality",
    icon: "search",
  },
  { q: "How are errors handled and surfaced across the app?", hint: "Error handling", icon: "refresh" },
  { q: "What is the most complex or clever part of this codebase?", hint: "The tricky bit", icon: "zap" },
  { q: "What would I change to add a new feature or endpoint?", hint: "Extending it", icon: "branch" },
];

/**
 * Pick a concrete, askable symbol — a real function/class, never the <module> catch-all. The
 * rotate offset shifts which qualifying symbol is chosen so re-indexing surfaces a fresh one.
 */
function pickSymbol(symbols: SymbolLike[], rotate: number): string | null {
  const good = symbols.filter(
    (s) =>
      s.symbol_name &&
      s.symbol_name !== "<module>" &&
      s.symbol_name.length >= 3 &&
      /function|method|class/i.test(s.type),
  );
  return good.length ? good[rotate % good.length].symbol_name : null;
}

/**
 * Starter questions tailored to the indexed repo. Returns up to COUNT (6), most-grounded first:
 * the overview, then a real endpoint, symbol, framework and the dependency graph when present
 * (naming real code makes retrieval land on the right chunks), then fills the remaining slots from
 * the broad pool. `rotate` (an ingest counter) shifts the endpoint/symbol/framework choice and the
 * pool fill order, so re-indexing the same repo surfaces fresh, still-valid prompts.
 */
export function buildSuggestions(input: {
  endpoints?: Endpoint[];
  symbols?: SymbolLike[];
  hasDeps?: boolean;
  frameworks?: string[];
  rotate?: number;
}): Suggestion[] {
  const endpoints = input.endpoints ?? [];
  const symbols = input.symbols ?? [];
  const frameworks = input.frameworks ?? [];
  const rotate = input.rotate ?? 0;
  const out: Suggestion[] = [];

  // 1) Big picture — always first, grounded by the generated overview.
  out.push({
    q: "What does this project do and how is it structured?",
    hint: "High-level overview",
    icon: "compass",
  });

  // 2) API surface — name a real route so retrieval lands on its handler.
  if (endpoints.length) {
    const e = endpoints[rotate % endpoints.length];
    out.push({
      q: `Explain the ${e.method} ${e.path} endpoint — how is it handled?`,
      hint: "API & routing",
      icon: "route",
    });
  }

  // 3) A concrete symbol — naming it gives the model the exact code to explain.
  const sym = pickSymbol(symbols, rotate);
  if (sym) {
    out.push({ q: `How does \`${sym}\` work?`, hint: "Trace a key function", icon: "search" });
  }

  // 4) A detected framework — ties the answer to how this repo actually uses it.
  if (frameworks.length) {
    const f = frameworks[rotate % frameworks.length];
    out.push({ q: `How is ${f} used in this project?`, hint: "Framework usage", icon: "layers" });
  }

  // 5) Structure / dependencies.
  if (input.hasDeps) {
    out.push({
      q: "Which files are most central, and how do they depend on each other?",
      hint: "Architecture & deps",
      icon: "link",
    });
  }

  // 6) Fill the rest from the broad pool, rotated so repeat ingests surface fresh intents.
  for (let i = 0; i < POOL.length && out.length < COUNT; i++) {
    out.push(POOL[(i + rotate) % POOL.length]);
  }
  return out.slice(0, COUNT);
}
