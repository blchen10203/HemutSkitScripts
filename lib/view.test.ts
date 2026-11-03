import { describe, expect, it } from "vitest";
import { applyEvent, EMPTY_VIEW } from "./view";
import type { HistoryMessage, StreamEvent } from "./types";

const sent: HistoryMessage[] = [{ role: "user", content: "make it meaner" }];
const search: StreamEvent = { type: "status", text: "Searching trends…" };

function play(events: StreamEvent[]) {
  return events.reduce((v, e) => applyEvent(v, e, sent), EMPTY_VIEW);
}

describe("applyEvent", () => {
  it("drops chatter before the script but keeps the script across a second search", () => {
    const v = play([
      { type: "text", text: "Let me look. " },
      search,
      { type: "text", text: "Checking one more. " },
      { type: "text", text: "## Title\nDock Hours\n" },
      search,
      { type: "text", text: "## Trend\n" },
    ]);
    expect(v.output).toBe("## Title\nDock Hours\n## Trend\n");
    expect(v.status).toBe("");
  });

  it("keeps history and stamp on done", () => {
    const messages: HistoryMessage[] = [{ role: "assistant", content: "## Title" }];
    const v = play([{ type: "text", text: "## Title" }, { type: "done", messages, sig: "s" }]);
    expect(v).toMatchObject({ output: "## Title", history: [...sent, ...messages], sig: "s" });
  });

  it("keeps partial output on error", () => {
    const v = play([{ type: "text", text: "## Title\n" }, { type: "error", text: "Cut off — hit Regenerate" }]);
    expect(v).toMatchObject({ output: "## Title\n", error: "Cut off — hit Regenerate", history: [] });
  });
});
