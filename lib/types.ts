import type Anthropic from "@anthropic-ai/sdk";

export type TieIn = "off" | "light" | "central";
export type SkitLength = "15s" | "30s" | "60s";
export interface SkitInputs {
  topic: string;
  format: string; // slug or "auto"
  setting: string;
  castSize: number;
  cast: string[];
  tieIn: TieIn;
  length: SkitLength;
  reference: string;
  notes: string;
}
export type HistoryMessage = Anthropic.Beta.BetaMessageParam;
export interface GenerateRequest {
  inputs: SkitInputs;
  history: HistoryMessage[];
}
export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "done"; messages: HistoryMessage[] };
