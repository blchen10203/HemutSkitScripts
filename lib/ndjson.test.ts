import { describe, expect, it } from "vitest";
import { createEventParser } from "./ndjson";
import type { StreamEvent } from "./types";

const enc = new TextEncoder();
function run(chunks: Uint8Array[], end = true) {
  const got: StreamEvent[] = [];
  const p = createEventParser((e) => got.push(e));
  chunks.forEach((c) => p.push(c));
  if (end) p.end();
  return got;
}
const line = (e: StreamEvent) => JSON.stringify(e) + "\n";

describe("createEventParser", () => {
  it("delivers two events in one chunk in order", () => {
    const a: StreamEvent = { type: "status", text: "a" };
    const b: StreamEvent = { type: "text", text: "b" };
    expect(run([enc.encode(line(a) + line(b))])).toEqual([a, b]);
  });

  it("reassembles one event split across three chunks", () => {
    const bytes = enc.encode(line({ type: "text", text: "hello world" }));
    const got = run([bytes.slice(0, 5), bytes.slice(5, 12), bytes.slice(12)]);
    expect(got).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("keeps multi-byte characters split mid-character intact", () => {
    const bytes = enc.encode(line({ type: "text", text: "a — 🚚 b" }));
    const cut = bytes.indexOf(0xf0) + 2; // inside the truck emoji
    const dash = bytes.indexOf(0xe2) + 1; // inside the em dash
    const got = run([bytes.slice(0, dash), bytes.slice(dash, cut), bytes.slice(cut)]);
    expect(got).toEqual([{ type: "text", text: "a — 🚚 b" }]);
  });

  it("delivers a final line without newline on end()", () => {
    const e: StreamEvent = { type: "error", text: "x" };
    const bytes = enc.encode(JSON.stringify(e));
    expect(run([bytes], false)).toEqual([]);
    expect(run([bytes])).toEqual([e]);
  });

  it("ignores blank lines", () => {
    const e: StreamEvent = { type: "status", text: "s" };
    expect(run([enc.encode("\n\n" + line(e) + "\n  \n")])).toEqual([e]);
  });
});
