import { describe, expect, it } from "vitest";
import { buildMessages, buildSystemPrompt, buildUserMessage } from "./prompt";
import type { Content } from "./content";
import type { SkitInputs } from "./types";

const formats = [
  { slug: "pov", name: "POV", body: "POV BODY TEXT" },
  { slug: "undercover", name: "Undercover", body: "UNDERCOVER BODY TEXT" },
];
const content: Content = { formats, references: "REFS TEXT", hemut: "HEMUT TEXT" };
const base: SkitInputs = {
  topic: "", format: "auto", setting: "", castSize: 4, cast: [],
  tieIn: "off", length: "30s", reference: "", notes: "",
};

describe("buildUserMessage", () => {
  it("states cast size", () => {
    expect(buildUserMessage(base, formats)).toContain("Cast: exactly 4 people");
  });
  it.each([
    ["off", "Hemut tie-in: OFF — do not mention Hemut or trucking unless the topic asks for it."],
    ["light", "Hemut tie-in: LIGHT — include one nod or closing line about Hemut."],
    ["central", "Hemut tie-in: CENTRAL — build the premise on a Hemut or freight pain point."],
  ] as const)("tie-in %s", (tieIn, line) => {
    expect(buildUserMessage({ ...base, tieIn }, formats)).toContain(line);
  });
  it("format auto vs named", () => {
    expect(buildUserMessage(base, formats)).toContain("Format: pick the best fit from the format library");
    expect(buildUserMessage({ ...base, format: "pov" }, formats)).toContain("Format: POV");
  });
  it("blank topic and setting", () => {
    const m = buildUserMessage(base, formats);
    expect(m).toContain("Topic: (none — pick from current trends)");
    expect(m).toContain("Setting: (none — pick an easy-to-film location)");
  });
  it("lists cast rows and reference", () => {
    const m = buildUserMessage({ ...base, cast: ["Dana, dispatcher", "Lou, broker"], reference: "tiktok.com/x" }, formats);
    expect(m).toContain("Dana, dispatcher");
    expect(m).toContain("Lou, broker");
    expect(m).toContain("Reference skit:\ntiktok.com/x");
  });
});

describe("buildSystemPrompt", () => {
  it("carries content, rules and headings in order", () => {
    const s = buildSystemPrompt(content);
    for (const t of ["POV", "POV BODY TEXT", "Undercover", "UNDERCOVER BODY TEXT", "REFS TEXT", "HEMUT TEXT",
      "TikTok", "Instagram", "this week", "no real competitor names", "hours-of-service", "couldn't confirm current trends"])
      expect(s).toContain(t);
    const heads = ["Title", "Trend", "Hooks", "Cast", "Script", "Setting & props", "Caption"].map((h) => s.indexOf(`## ${h}`));
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
  });
});

describe("buildMessages", () => {
  it("user message first then history", () => {
    const history = [{ role: "assistant" as const, content: "script" }, { role: "user" as const, content: "shorter" }];
    const out = buildMessages({ inputs: base, history }, content);
    expect(out[0]).toEqual({ role: "user", content: buildUserMessage(base, formats) });
    expect(out.slice(1)).toEqual(history);
  });
});
