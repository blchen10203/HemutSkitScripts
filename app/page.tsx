import { loadContent } from "@/lib/content";
import SkitForm from "./SkitForm";

export default async function Home() {
  const content = await loadContent();
  return <SkitForm formats={content.formats.map(({ slug, name }) => ({ slug, name }))} />;
}
