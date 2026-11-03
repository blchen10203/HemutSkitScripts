import { describe, expect, it } from "vitest";
import { signHistory, verifyHistory } from "./sign";
import type { HistoryMessage } from "./types";

const history: HistoryMessage[] = [
  { role: "assistant", content: [{ type: "text", text: "## Title — “Dock Hours” 🚚" }] },
];

describe("history signing", () => {
  it("verifies its own stamp after a JSON round trip", () => {
    const sig = signHistory(history, "k");
    expect(verifyHistory(JSON.parse(JSON.stringify(history)), sig, "k")).toBe(true);
  });

  it("rejects edited history, a wrong key, and junk stamps", () => {
    const sig = signHistory(history, "k");
    const edited: HistoryMessage[] = [{ role: "assistant", content: [{ type: "text", text: "anything" }] }];
    expect(verifyHistory(edited, sig, "k")).toBe(false);
    expect(verifyHistory(history, sig, "other")).toBe(false);
    expect(verifyHistory(history, "short", "k")).toBe(false);
    expect(verifyHistory(history, undefined, "k")).toBe(false);
  });
});
