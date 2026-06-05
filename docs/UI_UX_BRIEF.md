# Glyph — UI/UX Design Brief (for Claude Designs)

Hand this whole file to the design tool. It describes the product, the exact design system,
every screen, every component with its real data fields, and every state. Everything here
matches the real backend so the design imports cleanly.

---

## 1. What Glyph is (context)
Glyph is a **Code Documentation Assistant**. You point it at a GitHub repo or a local folder;
it reads the code and you **ask questions in chat** ("where does login happen?", "what are the
API endpoints?"). It answers **grounded in the real code** and shows the exact **file + line
citations**. Think "ChatGPT, but only about your codebase, and it always shows its receipts."
It runs 100% free (local embeddings + a free LLM).

**Tone:** premium, calm, engineering-grade. Near-monochrome dark, one restrained green accent,
generous whitespace, crisp type, smooth motion. NOT a colorful generic template.

---

## 2. Design system (use these exact tokens)

**Surfaces (layered near-black):**
- bg `#08090b` · panel `#0d0e11` · panel-2 `#131419` · panel-3 `#181a20`
- border `rgba(255,255,255,0.07)` · border-strong `rgba(255,255,255,0.12)`

**Text:**
- primary `#e9eaec` · secondary `#b6b9c0` · muted `#797d87` · faint `#4b4f59`

**Accent (one confident code-green):**
- accent `#7ee787` · accent-2 `#58c97e` · accent-soft `rgba(126,231,135,0.12)`
- accent-line `rgba(126,231,135,0.35)` · danger `#ff7b72`

**Type:**
- Sans: **Inter** (UI). Mono: **JetBrains Mono** (code, file paths, metrics).
- Base 14px, line-height 1.6, letter-spacing -0.01em.

**Shape & motion:**
- radius 12px (cards), 8px (small). shadow `0 16px 50px rgba(0,0,0,0.5)`.
- easing `cubic-bezier(0.22,1,0.36,1)`. Transitions 150–250ms. Subtle, never bouncy.

**Logo:** a small rounded square "G" mark in accent green + wordmark "Glyph." (with a green dot).

---

## 3. Global layout

Two screens: **Landing** (before a repo is loaded) and **Workspace** (after).

### Navbar (top, both screens)
- **Center:** the logo + wordmark "Glyph." — CENTERED in the bar (this is a change from today).
- **Left:** repo chip (small pill: green dot + "owner/repo"). Empty on landing.
- **Right:** model picker dropdown, a ⌘K search trigger, and a light/dark toggle.
- Height ~56px, bottom border `--border`, background `--panel`.

### Workspace = 2 zones (becomes 3 when viewing code)
```
┌──────────────────── navbar (logo centered) ────────────────────┐
├───────────────────────┬─────────────────────────────────────────┤
│ LEFT: PROJECT PANEL   │ RIGHT: CHAT                             │
│ (fixed ~320px, scroll)│ (flexible, fills the rest)             │
└───────────────────────┴─────────────────────────────────────────┘
Clicking a citation slides a CODE VIEWER in as a middle column:
┌──────────┬───────────────────┬──────────────┐
│ PROJECT  │ CODE VIEWER       │ CHAT         │
└──────────┴───────────────────┴──────────────┘
```

---

## 4. Landing screen
Centered hero on the near-black bg with a faint grid texture.
- Small pill badge: "G Code intelligence"
- H1: "Ask your **codebase**." (the word "codebase" in accent green)
- Subtitle (muted): "Point Glyph at a GitHub repo or a local folder, then ask questions and
  get answers grounded in the real code, with file and line citations."
- **Ingest box:** a single rounded input (placeholder: `https://github.com/owner/repo · or a
  local path`) + a primary "Ingest →" button. Button shows a spinner + "Ingesting" while busy.
- Hint line: "Try `app` to index Glyph's own code."
- States: idle / ingesting (spinner) / error (red toast bottom).

---

## 5. LEFT — Project Intelligence panel (the new part)
A vertical stack of collapsible cards, ~320px wide, its own scroll. Each card: `--panel-2`
background, `--border`, radius 12px, a small uppercase muted title, generous padding.

Widgets, top to bottom:

1. **Repo header**
   - Repo name (bold) + a clickable GitHub link (opens in new tab). Branch name if known.
   - A "re-ingest / change repo" small ghost button.

2. **Language breakdown + index stats**
   - A small **donut or horizontal bar chart** of language percentages.
   - Below it, three stat tiles: **files**, **chunks**, **cached** (mono numbers).
   - Data: ingest returns `{ files, added, cached, languages: string[] }`. (languages is a list;
     show each with a colored dot; counts can come from the sources later.)

3. **Overview card**
   - Heading "Overview" with a green dot. A 2–3 sentence paragraph: "what this codebase does."
   - Data: `GET /api/overview` → `{ overview: string }`. Show a shimmer while loading.

4. **Architecture mini-graph**
   - A small force-directed graph: nodes = files, edges = imports. Click a node → asks Glyph to
     explain that file. A "expand" affordance to see it big.
   - Data: `GET /api/graph` → `{ nodes: [{id,label,language}], edges: [{source,target}] }`.

5. **Top files** (standout)
   - "Most depended-on files" — a short ranked list (file + a small bar for how many other files
     import it). Computed from the graph's edge in-degree. Click → ask about that file.

6. **API endpoints detected** (standout)
   - A list of detected routes, e.g. `POST /api/ingest`, `GET /api/health`. Method shown as a
     small colored tag. Click → ask "explain this endpoint." (Backend endpoint to be added.)

7. **Session metrics + latency sparkline** (standout)
   - Tiles: queries asked, avg latency, total tokens. A tiny sparkline of recent answer latencies.
   - Data: aggregate each answer's `meta { model, latency_ms, token_usage }` client-side.

8. **Recent repos**
   - A short list of previously ingested repos for quick re-open.

(Empty state for the whole panel before ingest: a soft "Load a repo to see its intelligence.")

---

## 6. RIGHT — Chat
The main conversation column, flexible width, its own scroll, composer pinned at the bottom.

### Empty state (no messages yet)
- The **Overview** can also surface here as a welcome card.
- Title: "Ask anything about this code"
- A 2×2 grid of **suggested-question cards** (e.g. "What does this codebase do?", "Where are the
  API endpoints defined?", "How does retrieval work?", "Walk me through the main data flow.").

### A user message
- Small avatar "U" + "YOU", then the question text in a subtle bubble.

### A Glyph answer (the rich one) — render these parts in order:
1. Avatar (green "G" mark) + "GLYPH".
2. **Answer body:** markdown (headings, bold, lists, inline `code`, fenced code blocks with
   syntax highlighting). While streaming, text appears token-by-token with a blinking accent
   cursor `▍`, then settles into formatted markdown.
3. **Grounding badge** (standout): a small line "⛓ grounded on N sources" (trust signal).
4. **Metrics line** (mono, muted): `model · 13.5s · 1639 tokens`.
   Data: `meta.model` (show the part after the last "/"), `meta.latency_ms/1000`, `token_usage.total_tokens`.
5. **Citations:** label "CITED" + chips like `auth.py :1-3`. Chip = mono file path + a faint
   `:start-end`. Click → opens the code viewer at those lines.
   Data: `citations: [{ file_path, start_line, end_line }]`.
6. **Sources (collapsible):** "▸ N sources retrieved" → a list of rows (symbol name + `file:line`).
   Click a row → opens the code viewer. Data: `sources: [{ id, file_path, symbol_name, type,
   start_line, end_line, code, language }]`.
7. **Suggested follow-ups:** a row of pill buttons with smart next questions.

### "Not found" answer
- If the answer starts with "Not found", render it as a calm muted note (no citations) — this is
  the guardrail being honest, not an error. Style it gently, not red.

### Composer (bottom)
- A rounded multiline input (placeholder "Ask about the code…") + a circular send button (↑).
- Enter sends, Shift+Enter newline. Disabled while a request is in flight.

### Thinking state
- Before the first token arrives: three pulsing dots where the answer will appear.

---

## 7. CODE VIEWER (slides in as middle column on citation click)
- Header: file path (mono) + line range + a close (×) button + a "copy code" button.
- Body: the source code with **line numbers**, syntax highlighted, the cited lines subtly
  highlighted with an accent-soft background.
- Data: the matching `source.code` (already returned with each answer) + start/end lines.
- Slides in from the side with the standard easing; chat shifts to make room.

---

## 8. Standout interactions (these help it beat 100+ candidates)
- **⌘K command palette:** a centered modal to search files/symbols and jump or ask. Mono list,
  fuzzy match, arrow-key nav, Enter to act, Esc to close.
- **Citation hover preview:** hovering a citation chip pops a small code peek before clicking.
- **Light/dark toggle:** dark is default; provide a light variant of the same token system.
- **Copy buttons:** copy answer, copy a code block.
- **Auto architecture diagram (optional):** a generated diagram view from the import graph.

---

## 9. States to design for EVERY data area
For ingest, overview, graph, chat, code viewer — design all of:
- **Loading** (shimmer/skeleton, not a bare spinner where possible)
- **Empty** (friendly one-liner)
- **Error** (a bottom toast in `--danger`, e.g. "the request timed out — try a smaller repo or a
  local folder path"; auto-dismiss ~5s)
- **Streaming** (chat answer typing in live)

---

## 10. Responsive
- ≥1200px: full 3-zone.
- 900–1200px: project panel collapses to icons / a toggle; chat stays primary.
- <900px (mobile): single column = chat; project panel and code viewer become slide-over sheets;
  the dependency graph hides.

---

## 11. Accessibility
- Strong contrast (text on near-black already passes). Don't rely on color alone — endpoints use a
  text method tag, languages use a dot + label.
- Full keyboard: Tab order, Enter to send, ⌘K palette, Esc closes panels, focus rings in accent.
- Respect reduced-motion: tone down the streaming cursor and graph animation.

---

## 12. Real data shapes (so the design fields match the import)
```
IngestResponse = { files: number, added: number, cached: number, languages: string[] }
AskResponse = {
  answer: string,
  citations: { file_path: string, start_line: number, end_line: number }[],
  retrieved_chunk_ids: string[],
  sources: { id, file_path, symbol_name, type, start_line, end_line, code, language }[],
  meta: { model: string, latency_ms: number,
          token_usage: { prompt_tokens, completion_tokens, total_tokens } }
}
ModelInfo = { id: string, label: string, tier: "free"|"paid", note: string, available: boolean }
GraphData = { nodes: { id, label, language }[], edges: { source, target }[] }
Overview = { overview: string }
```
Endpoints: `POST /api/ingest`, `POST /api/ask`, `POST /api/ask/stream` (Server-Sent Events,
streams `{type:"token",text}` then `{type:"final", ...AskResponse}`), `GET /api/models`,
`GET /api/overview`, `GET /api/graph`.

---

## 13. Handoff / export notes (for importing into the real app)
- The app is **React + TypeScript + Vite**, plain hand-written CSS using the CSS variables above
  (no Tailwind, no component library). Designs that map to semantic class names + these tokens
  import most cleanly.
- Components today: `App`, `Answer`, `CodePanel`, `GraphView`, `ModelPicker`. The redesign adds a
  `ProjectPanel` (left) and its widget sub-components, plus a `CommandPalette`.
- Keep the markdown answer rendering (react-markdown) and syntax highlighting (highlight.js,
  github-dark theme) in mind — code blocks already have a style.
- Deliver: the two screens (landing, workspace), the 3-zone workspace with code viewer open, the
  ⌘K palette, and mobile variants. Provide the dark theme as primary and a light variant.
```
