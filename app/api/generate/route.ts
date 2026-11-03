import Anthropic from "@anthropic-ai/sdk";
import { loadContent } from "@/lib/content";
import { validateRequest } from "@/lib/validate";
import { buildMessages, buildSystemPrompt } from "@/lib/prompt";
import { runGeneration, type StreamFn } from "@/lib/generate";
import { signHistory, verifyHistory } from "@/lib/sign";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lazy so a missing ANTHROPIC_API_KEY becomes an error event, not a crash.
let client: Anthropic | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- params are a plain record; the beta SDK types lag the preview fields
const stream: StreamFn = (p, signal) => (client ??= new Anthropic()).beta.messages.stream(p as any, { signal }) as any;
// The API key doubles as the HMAC key: already secret, already set, no extra config.
const signingKey = () => process.env.ANTHROPIC_API_KEY ?? "";

const json = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 400_000) return json("Request too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json("Invalid request.", 400);
  }

  const content = await loadContent();
  const v = validateRequest(body, content.formats.map((f) => f.slug));
  if (!v.ok) return json(v.error, 400);
  const { history } = v.value;
  if (history.length && !verifyHistory(history.slice(0, -1), (body as { sig?: unknown }).sig, signingKey()))
    return json("This script can't be rewritten anymore. Hit Regenerate to start fresh.", 400);

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        if (e.type === "done") e = { ...e, sig: signHistory([...history, ...e.messages], signingKey()) };
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {} // client disconnected
      };
      try {
        await runGeneration(stream, buildSystemPrompt(content), buildMessages(v.value, content), emit, req.signal);
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(out, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
