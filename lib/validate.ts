import type { GenerateRequest, HistoryMessage, SkitInputs } from "./types";

type Result = { ok: true; value: GenerateRequest } | { ok: false; error: string };

const MAX_HISTORY_CHARS = 300_000;
const MAX_USER_MESSAGES = 10;
const TIE_INS = ["off", "light", "central"];
const LENGTHS = ["15s", "30s", "60s"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateRequest(body: unknown, formatSlugs: string[]): Result {
  const fail = (error: string): Result => ({ ok: false, error });
  if (!isObj(body) || !isObj(body.inputs)) return fail("Request is missing inputs.");
  const i = body.inputs;

  const str = (key: string, label: string, max: number): string | { error: string } => {
    const v = i[key] ?? "";
    if (typeof v !== "string") return { error: `${label} must be text.` };
    if (v.length > max) return { error: `${label} must be ${max} characters or fewer.` };
    return v;
  };
  const topic = str("topic", "Topic", 500);
  const setting = str("setting", "Setting", 500);
  const notes = str("notes", "Notes", 500);
  const reference = str("reference", "Reference", 10_000);
  for (const s of [topic, setting, notes, reference]) if (typeof s !== "string") return fail(s.error);

  const format = i.format ?? "auto";
  if (typeof format !== "string" || (format !== "auto" && !formatSlugs.includes(format)))
    return fail("Unknown format.");
  const tieIn = i.tieIn ?? "off";
  if (typeof tieIn !== "string" || !TIE_INS.includes(tieIn)) return fail("Unknown tie-in setting.");
  const length = i.length ?? "30s";
  if (typeof length !== "string" || !LENGTHS.includes(length)) return fail("Unknown length.");

  const castSize = i.castSize;
  if (typeof castSize !== "number" || !Number.isInteger(castSize) || castSize < 1 || castSize > 6)
    return fail("Cast size must be 1–6.");
  const cast = i.cast ?? [];
  if (!Array.isArray(cast) || cast.length > castSize) return fail("Too many cast rows for the cast size.");
  for (const row of cast) {
    if (typeof row !== "string") return fail("Cast rows must be text.");
    if (row.length > 100) return fail("Each cast row must be 100 characters or fewer.");
  }

  const history = body.history ?? [];
  if (!Array.isArray(history)) return fail("History must be a list.");
  let users = 0;
  for (const m of history) {
    if (!isObj(m) || (m.role !== "user" && m.role !== "assistant")) return fail("Invalid history message.");
    if (m.role === "user") {
      users++;
      if (typeof m.content !== "string") return fail("Invalid history message.");
      if (m.content.length > 500) return fail("Rewrite instruction must be 500 characters or fewer.");
    }
  }
  if (users > MAX_USER_MESSAGES) return fail("Too many rewrites in this session. Hit Regenerate to start fresh.");
  if (history.length && (history[history.length - 1] as { role: string }).role !== "user")
    return fail("History must end with a user message.");
  if (JSON.stringify(history).length > MAX_HISTORY_CHARS) return fail("Conversation is too long. Hit Regenerate to start fresh.");

  return {
    ok: true,
    value: {
      inputs: {
        topic, setting, notes, reference, format, castSize, cast,
        tieIn: tieIn as SkitInputs["tieIn"],
        length: length as SkitInputs["length"],
      } as SkitInputs,
      history: history as HistoryMessage[],
    },
  };
}
