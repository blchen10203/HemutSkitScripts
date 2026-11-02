import type { StreamEvent } from "./types";

// Browser-safe: no Node imports.
export function createEventParser(onEvent: (e: StreamEvent) => void) {
  const decoder = new TextDecoder();
  let buf = "";
  const emitLine = (l: string) => {
    if (l.trim()) onEvent(JSON.parse(l) as StreamEvent);
  };
  return {
    push(chunk: Uint8Array) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      lines.forEach(emitLine);
    },
    end() {
      buf += decoder.decode();
      const rest = buf;
      buf = "";
      emitLine(rest);
    },
  };
}
