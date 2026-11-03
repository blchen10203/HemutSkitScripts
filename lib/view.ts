import type { HistoryMessage, StreamEvent } from "./types";

export interface View {
  output: string;
  status: string;
  error: string;
  history: HistoryMessage[];
  sig: string;
}

export const EMPTY_VIEW: View = { output: "", status: "", error: "", history: [], sig: "" };

// The script starts at its Title; anything before that is search chatter.
const TITLE = "## Title";
const fromTitle = (s: string) => (s.includes(TITLE) ? s.slice(s.indexOf(TITLE)) : s);

// `sent` is the history this request posted; `done` appends Claude's reply to it.
export function applyEvent(v: View, e: StreamEvent, sent: HistoryMessage[]): View {
  switch (e.type) {
    case "status": // a search: drop pre-script chatter, but never a script already under way
      return { ...v, status: e.text, output: v.output.includes(TITLE) ? v.output : "" };
    case "text":
      return { ...v, status: "", output: fromTitle(v.output + e.text) };
    case "error":
      return { ...v, error: e.text };
    case "done":
      return { ...v, history: [...sent, ...e.messages], sig: e.sig ?? "" };
  }
}
