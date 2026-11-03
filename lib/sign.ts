import { createHmac, timingSafeEqual } from "crypto";
import type { HistoryMessage } from "./types";

// Stamps the history the server produced, so a rewrite can't smuggle in made-up assistant turns.
export function signHistory(history: HistoryMessage[], key: string): string {
  return createHmac("sha256", key).update(JSON.stringify(history)).digest("base64url");
}

export function verifyHistory(history: HistoryMessage[], sig: unknown, key: string): boolean {
  if (typeof sig !== "string") return false;
  const want = Buffer.from(signHistory(history, key));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}
