/* eslint-disable @typescript-eslint/no-explicit-any -- loose fake stream events and recorded params */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CONTINUATIONS, MODEL, runGeneration, type StreamFn } from "./generate";
import type { StreamEvent } from "./types";

type Step = { events?: any[]; stop_reason: string | null; content?: unknown[] };
function fake(steps: Step[]) {
  const calls: Record<string, any>[] = [];
  const stream: StreamFn = (params) => {
    calls.push(structuredClone(params));
    const s = steps[calls.length - 1];
    return {
      async *[Symbol.asyncIterator]() { for (const e of s.events ?? []) yield e; },
      finalMessage: async () => ({ stop_reason: s.stop_reason, content: s.content ?? [] }),
    };
  };
  return { stream, calls };
}
const delta = (text: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text } });
async function run(stream: StreamFn) {
  const events: StreamEvent[] = [];
  await runGeneration(stream, "SYS", [{ role: "user", content: "hi" }], (e) => events.push(e));
  return events;
}

describe("runGeneration", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("streams text and status in order, then done", async () => {
    const content = [{ type: "text", text: "ab" }];
    const { stream } = fake([{
      events: [delta("a"), { type: "content_block_start", content_block: { type: "server_tool_use" } }, delta("b")],
      stop_reason: "end_turn", content,
    }]);
    expect(await run(stream)).toEqual([
      { type: "text", text: "a" },
      { type: "status", text: "Searching trends…" },
      { type: "text", text: "b" },
      { type: "done", messages: [{ role: "assistant", content }] },
    ]);
  });

  it("sends the expected params", async () => {
    const { stream, calls } = fake([{ stop_reason: "end_turn" }]);
    await run(stream);
    expect(calls[0]).toMatchObject({
      model: MODEL, max_tokens: 16000, output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
      thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
      fallbacks: "default", system: "SYS",
    });
    expect(MODEL).toBe("claude-sonnet-5-5");
  });

  it("continues on pause_turn without a user message", async () => {
    const c1 = [{ type: "server_tool_use" }], c2 = [{ type: "text", text: "x" }];
    const { stream, calls } = fake([{ stop_reason: "pause_turn", content: c1 }, { stop_reason: "end_turn", content: c2 }]);
    const events = await run(stream);
    expect(calls[1].messages.at(-1)).toEqual({ role: "assistant", content: c1 });
    expect(calls[1].messages).toHaveLength(2);
    expect(events.at(-1)).toEqual({
      type: "done", messages: [{ role: "assistant", content: c1 }, { role: "assistant", content: c2 }],
    });
  });

  it("gives up after MAX_CONTINUATIONS", async () => {
    const { stream, calls } = fake(Array(5).fill({ stop_reason: "pause_turn" }));
    const events = await run(stream);
    expect(calls).toHaveLength(1 + MAX_CONTINUATIONS);
    expect(events).toEqual([{ type: "error", text: "Cut off — hit Regenerate" }]);
  });

  it("reports refusal", async () => {
    const { stream } = fake([{ stop_reason: "refusal" }]);
    expect(await run(stream)).toEqual([
      { type: "error", text: "Claude won't write this one — try toning the premise down" },
    ]);
  });

  it("treats max_tokens like end_turn", async () => {
    const { stream } = fake([{ stop_reason: "max_tokens" }]);
    expect((await run(stream)).at(-1)?.type).toBe("done");
  });

  it("turns a failing finalMessage into a generic error", async () => {
    const stream: StreamFn = () => ({
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => { throw new Error("boom"); },
    });
    expect(await run(stream)).toEqual([{ type: "error", text: "Couldn't generate, try again" }]);
  });

  it("turns a synchronous throw from stream() into a generic error", async () => {
    const stream: StreamFn = () => { throw new Error("no api key"); };
    expect(await run(stream)).toEqual([{ type: "error", text: "Couldn't generate, try again" }]);
  });
});
