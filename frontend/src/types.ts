// UI-only types for the workspace. API response shapes live in api.ts.

import type { AskResponse } from "./api";

export interface Recent {
  owner: string;
  name: string;
  when: string;
}

export interface Suggestion {
  q: string;
  hint: string;
  icon: string;
}

export interface Endpoint {
  method: string;
  path: string;
}

export interface Repo {
  owner: string;
  name: string;
  branch: string;
  url: string;
  visibility?: string;
  description?: string;
  lastIndexed?: string;
}

// A chat message: either the user's question, or a Glyph answer (an AskResponse + follow-ups).
export type Message =
  | { role: "user"; text: string }
  | ({ role: "glyph" } & AskResponse & { followups?: string[] });
