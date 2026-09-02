import type { JSONValue } from "ai";
import type { Color } from "./types";

export type ModelSpec = {
  id: string;
  label: string;
  vendor: "anthropic" | "openai" | "google" | "xai" | "demo";
  /** Hex accent used for this player's panel, arrows and eval graph line. */
  accent: string;
  /**
   * Per-provider knobs to turn on visible reasoning. These necessarily differ
   * between vendors -- Anthropic streams real thinking blocks, OpenAI streams
   * summaries -- which is exactly why the prompt also mandates a visible
   * "## Analysis" section that IS symmetric across providers.
   */
  providerOptions?: Record<string, Record<string, JSONValue>>;
  /**
   * Output ceiling for the request. Must comfortably exceed any thinking
   * budget -- providers reject a max_output_tokens smaller than the reasoning
   * allowance, and a too-tight ceiling truncates the move tag.
   */
  maxOutputTokens: number;
  /** Rough cost tier, for the picker. */
  tier: "cheap" | "mid" | "frontier";
};

const anthropic = (
  id: string,
  label: string,
  accent: string,
  tier: ModelSpec["tier"],
  budgetTokens = 4000,
): ModelSpec => ({
  id,
  label,
  vendor: "anthropic",
  accent,
  tier,
  maxOutputTokens: budgetTokens + 2000,
  providerOptions: {
    anthropic: { thinking: { type: "enabled", budgetTokens } },
  },
});

const openai = (
  id: string,
  label: string,
  accent: string,
  tier: ModelSpec["tier"],
  reasoningEffort: "low" | "medium" | "high" = "medium",
): ModelSpec => ({
  id,
  label,
  vendor: "openai",
  accent,
  tier,
  maxOutputTokens: reasoningEffort === "low" ? 4000 : 8000,
  providerOptions: {
    openai: { reasoningEffort, reasoningSummary: "detailed" },
  },
});

const google = (
  id: string,
  label: string,
  accent: string,
  tier: ModelSpec["tier"],
  thinkingBudget = 4000,
): ModelSpec => ({
  id,
  label,
  vendor: "google",
  accent,
  tier,
  maxOutputTokens: thinkingBudget + 2000,
  providerOptions: {
    google: { thinkingConfig: { includeThoughts: true, thinkingBudget } },
  },
});

/** Offline scripted players — no API calls. See src/lib/demo.ts. */
const demo = (id: string, label: string, accent: string): ModelSpec => ({
  id,
  label,
  vendor: "demo",
  accent,
  tier: "cheap",
  maxOutputTokens: 1024,
});

export const MODELS: ModelSpec[] = [
  demo("demo/alpha", "Demo A (scripted)", "#C4B5FD"),
  demo("demo/beta", "Demo B (scripted)", "#F0ABFC"),

  // Cheap tier -- sensible defaults while iterating.
  anthropic("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", "#D4A27F", "cheap", 2000),
  openai("openai/gpt-5-nano", "GPT-5 nano", "#6EE7B7", "cheap", "low"),
  openai("openai/gpt-5-mini", "GPT-5 mini", "#34D399", "cheap", "low"),
  google("google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "#93C5FD", "cheap", 2000),
  google("google/gemini-3.7-flash", "Gemini 3.7 Flash", "#60A5FA", "cheap", 2000),

  // Frontier -- much stronger, much more expensive.
  anthropic("anthropic/claude-sonnet-5", "Claude Sonnet 5", "#C6785C", "mid"),
  anthropic("anthropic/claude-opus-5", "Claude Opus 5", "#B8875F", "frontier"),
  openai("openai/gpt-5.2", "GPT-5.2", "#10B981", "mid"),
  openai("openai/gpt-5.4", "GPT-5.4", "#059669", "frontier"),
  google("google/gemini-2.5-pro", "Gemini 2.5 Pro", "#3B82F6", "mid"),
];

// Cheap by default. Switch to the frontier pair in the pickers when you
// actually want a headline match.
export const DEFAULT_WHITE = "anthropic/claude-haiku-4.5";
export const DEFAULT_BLACK = "google/gemini-3.7-flash";

export function getModel(id: string): ModelSpec {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export type Players = Record<Color, string>;

/** Picker groups, so the cost implication of a choice is visible up front. */
export const MODEL_GROUPS: { label: string; models: ModelSpec[] }[] = [
  { label: "Offline demo — no API calls", models: MODELS.filter((m) => m.vendor === "demo") },
  { label: "Cheap — cents per game", models: MODELS.filter((m) => m.vendor !== "demo" && m.tier === "cheap") },
  { label: "Mid", models: MODELS.filter((m) => m.tier === "mid") },
  { label: "Frontier — expensive", models: MODELS.filter((m) => m.tier === "frontier") },
].filter((g) => g.models.length > 0);
