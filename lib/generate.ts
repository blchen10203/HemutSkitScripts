import type { HistoryMessage, StreamEvent } from "./types";

export const MODEL = "claude-sonnet-5-5";
export const MAX_CONTINUATIONS = 3;

export type StreamFn = (params: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stream events are a loosely typed union we only probe
  AsyncIterable<{ type: string; [k: string]: any }> & {
    finalMessage(): Promise<{ stop_reason: string | null; content: unknown[] }>;
  };

export async function runGeneration(
  stream: StreamFn,
  system: string,
  messages: HistoryMessage[],
  emit: (e: StreamEvent) => void,
): Promise<void> {
  try {
    const produced: HistoryMessage[] = [];
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const s = stream({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "high" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        fallbacks: "default",
        system,
        messages: [...messages, ...produced],
      });
      for await (const ev of s) {
        if (ev.type === "content_block_start" && ev.content_block?.type === "server_tool_use") {
          emit({ type: "status", text: "Searching trends…" });
        } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          emit({ type: "text", text: ev.delta.text });
        }
      }
      const final = await s.finalMessage();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK content blocks vs HistoryMessage content do not unify
      produced.push({ role: "assistant", content: final.content as any });
      if (final.stop_reason === "refusal") {
        return emit({ type: "error", text: "Claude won't write this one — try toning the premise down" });
      }
      // max_tokens is treated like end_turn: show what was written
      if (final.stop_reason !== "pause_turn") return emit({ type: "done", messages: produced });
    }
    emit({ type: "error", text: "Cut off — hit Regenerate" });
  } catch (err) {
    console.error("generation failed", err);
    emit({ type: "error", text: "Couldn't generate, try again" });
  }
}
