import type { MoveRecord } from "./types";

export type Pricing = Record<string, { input: number; output: number }>;

/**
 * Estimated USD for a set of moves. Rates are per-token from the Gateway
 * catalogue; reasoning tokens are already inside outputTokens, and cache
 * discounts aren't modelled, so treat this as an upper-ish estimate.
 */
export function costOf(moves: MoveRecord[], pricing: Pricing): number {
  let total = 0;
  for (const m of moves) {
    if (m.book) continue;
    const rate = pricing[m.modelId];
    if (!rate) continue;
    total += (m.usage.inputTokens ?? 0) * rate.input;
    total += (m.usage.outputTokens ?? 0) * rate.output;
  }
  return total;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
