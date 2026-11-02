import type { Content, Format } from "./content";
import type { GenerateRequest, HistoryMessage, SkitInputs } from "./types";

const TIE_IN: Record<SkitInputs["tieIn"], string> = {
  off: "Hemut tie-in: OFF — do not mention Hemut or trucking unless the topic asks for it.",
  light: "Hemut tie-in: LIGHT — include one nod or closing line about Hemut.",
  central: "Hemut tie-in: CENTRAL — build the premise on a Hemut or freight pain point.",
};

export function buildSystemPrompt(content: Content): string {
  const formats = content.formats.map((f) => `### ${f.name}\n${f.body}`).join("\n\n");
  return `You write Cluely-style short-form comedy skits: deadpan, confident absurdity, a little provocative. The skits are filmed by non-writers at Hemut, a trucking TMS company.

## How to find the trend
Search the web for what is trending on TikTok and Instagram this week (formats, sounds, memes). If the user gave a topic, pick the trend that fits it best; otherwise pick the one with the most viral potential. Cite the source link in the Trend section. If search fails, say in the Trend section that you couldn't confirm current trends, and still write the skit.

Write nothing before the script. If you search, search first; your visible answer starts with the Title.

## Output format
Markdown, with exactly these sections in this order:
## Title
## Trend — what it is, why it fits, source link
## Hooks — 3 alternative openings for the first 2 seconds
## Cast — name, role, one-line personality per person
## Script — numbered beats, each with dialogue, *[stage directions]* and **ON-SCREEN TEXT**
## Setting & props — 1–2 lines
## Caption — caption plus hashtags

## Rules
- Exactly as many cast members as the request says.
- Filmable on a phone in one location with no effects.
- Fits the chosen length.
- no real competitor names; no defamation.
- No gags about unsafe driving or hours-of-service violations.
- On a rewrite, return the full revised script in the same format; search again only if the instruction asks for new trends.

## Hemut tie-in levels
- OFF: do not mention Hemut or trucking unless the topic asks for it.
- LIGHT: a nod or closing line about Hemut.
- CENTRAL: the premise is built on a Hemut or freight pain point.

# Format library
${formats}

# Reference skits that worked
${content.references}

# About Hemut
${content.hemut}`;
}

export function buildUserMessage(i: SkitInputs, formats: Format[]): string {
  const format =
    i.format === "auto"
      ? "pick the best fit from the format library"
      : (formats.find((f) => f.slug === i.format)?.name ?? i.format);
  const lines = [
    `Topic: ${i.topic.trim() || "(none — pick from current trends)"}`,
    `Format: ${format}`,
    `Setting: ${i.setting.trim() || "(none — pick an easy-to-film location)"}`,
    `Cast: exactly ${i.castSize} people`,
  ];
  const cast = i.cast.map((c) => c.trim()).filter(Boolean);
  if (cast.length) lines.push("Cast details:", ...cast.map((c) => `- ${c}`));
  lines.push(TIE_IN[i.tieIn], `Length: ${i.length}`);
  if (i.reference.trim()) lines.push(`Reference skit:\n${i.reference.trim()}`);
  if (i.notes.trim()) lines.push(`Extra notes: ${i.notes.trim()}`);
  return lines.join("\n");
}

export function buildMessages(req: GenerateRequest, content: Content): HistoryMessage[] {
  return [{ role: "user", content: buildUserMessage(req.inputs, content.formats) }, ...req.history];
}
