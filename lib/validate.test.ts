import { describe, expect, test } from "vitest";
import { validateRequest } from "@/lib/validate";

const slugs = ["pov"];
const req = (inputs: object = {}, history: unknown[] = []) => ({ inputs: { castSize: 2, ...inputs }, history });
const bad = (b: unknown) => {
  const r = validateRequest(b, slugs);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
};
const u = (content: unknown = "x") => ({ role: "user", content });
const a = { role: "assistant", content: [{ type: "text", text: "hi" }] };

describe("validateRequest", () => {
  test("accepts minimal body with defaults", () => {
    const r = validateRequest({ inputs: { castSize: 2 }, history: [] }, slugs);
    expect(r).toMatchObject({ ok: true, value: { inputs: { format: "auto", tieIn: "off", length: "30s", cast: [], topic: "" } } });
  });
  test.each([
    ["castSize 0", req({ castSize: 0 })],
    ["castSize 7", req({ castSize: 7 })],
    ["castSize 2.5", req({ castSize: 2.5 })],
    ["missing castSize", { inputs: {}, history: [] }],
    ["too many cast rows", req({ cast: ["a", "b", "c"] })],
    ["non-string cast row", req({ cast: [1] })],
    ["long topic", req({ topic: "a".repeat(501) })],
    ["long cast row", req({ cast: ["a".repeat(101)] })],
    ["long reference", req({ reference: "a".repeat(10_001) })],
    ["bad format", req({ format: "nope" })],
    ["bad tieIn", req({ tieIn: "max" })],
    ["bad length", req({ length: "90s" })],
    ["history ends in assistant", req({}, [u(), a])],
    ["11 user messages", req({}, Array.from({ length: 11 }, () => u()))],
    ["history too big", req({}, [u(), { role: "assistant", content: "a".repeat(300_001) }, u()])],
    ["long rewrite instruction", req({}, [u("a".repeat(501))])],
    ["array user content", req({}, [u([{ type: "text", text: "x" }])])],
    ["system role", req({}, [{ role: "system", content: "x" }])],
    ["string body", "hi"],
    ["null", null],
    ["missing inputs", { history: [] }],
  ])("rejects %s", (_n, body) => bad(body));

  test("accepts consecutive assistant messages before a final user message", () => {
    expect(validateRequest(req({}, [a, a, u("make it meaner")]), slugs).ok).toBe(true);
  });
  test("accepts a known format slug", () => {
    expect(validateRequest(req({ format: "pov" }), slugs).ok).toBe(true);
  });
});
