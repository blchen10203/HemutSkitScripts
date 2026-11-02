import { expect, test } from "vitest";
import { loadContent, parseFormat } from "@/lib/content";

test("parseFormat reads name and body from frontmatter", () => {
  expect(parseFormat("pov", "---\nname: POV\n---\nBody text")).toEqual({
    slug: "pov",
    name: "POV",
    body: "Body text",
  });
});

test("parseFormat handles CRLF", () => {
  expect(parseFormat("pov", "---\r\nname: POV\r\n---\r\nBody text")).toEqual({
    slug: "pov",
    name: "POV",
    body: "Body text",
  });
});

test("parseFormat without frontmatter falls back to slug", () => {
  expect(parseFormat("x", "just text")).toEqual({ slug: "x", name: "x", body: "just text" });
});

test("loadContent loads the real content folder", async () => {
  const c = await loadContent();
  expect(c.formats).toHaveLength(6);
  const slugs = c.formats.map((f) => f.slug);
  expect(slugs).toEqual([...slugs].sort());
  c.formats.forEach((f) => expect(f.name).not.toBe(""));
  expect(c.references).not.toBe("");
  expect(c.hemut).not.toBe("");
});
