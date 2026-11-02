import { readdir, readFile } from "fs/promises";
import path from "path";

export interface Format {
  slug: string;
  name: string;
  body: string;
}

export interface Content {
  formats: Format[];
  references: string;
  hemut: string;
}

export function parseFormat(slug: string, raw: string): Format {
  const text = raw.replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { slug, name: slug, body: text.trim() };
  const name = m[1].match(/^name:\s*(.+)$/m)?.[1].trim() || slug;
  return { slug, name, body: m[2].trim() };
}

export async function loadContent(dir = path.join(process.cwd(), "content")): Promise<Content> {
  const files = (await readdir(path.join(dir, "formats"))).filter((f) => f.endsWith(".md")).sort();
  const formats = await Promise.all(
    files.map(async (f) =>
      parseFormat(f.slice(0, -3), await readFile(path.join(dir, "formats", f), "utf8")),
    ),
  );
  const [references, hemut] = await Promise.all(
    ["references.md", "hemut.md"].map((f) => readFile(path.join(dir, f), "utf8")),
  );
  return { formats, references, hemut };
}
