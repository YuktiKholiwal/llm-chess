import { generateText } from "ai";
import { Chess } from "chess.js";
import { classifyError } from "@/lib/errors";
import { getModel } from "@/lib/models";
import { extractAnalysis, parseEval, parseMove } from "@/lib/parse-move";
import {
  positionPrompt,
  retryPrompt,
  systemPrompt,
  type PromptVersion,
} from "@/lib/prompt";
import type { Mode, Usage } from "@/lib/types";

/**
 * Asks one model for one move, headlessly.
 *
 * The arena streams because a human is watching; the benchmark does not, so
 * this uses a single non-streaming call. The prompt construction, parsing and
 * illegal-move retry policy are deliberately identical to the interactive path
 * -- if they diverged, arena numbers and benchmark numbers would silently stop
 * being comparable.
 */

export type AskResult = {
  san: string | null;
  legal: boolean;
  evalClaim: number | null;
  illegalAttempts: number;
  /** SAN strings the model proposed that were not legal, in order. */
  rejected: string[];
  analysis: string;
  usage: Usage;
  elapsedMs: number;
  /** Set when the call failed outright rather than producing a bad move. */
  error?: string;
};

export type AskOptions = {
  mode: Mode;
  promptVersion: PromptVersion;
  maxRetries?: number;
  /** Extra attempts for rate limits and provider blips. */
  maxTransient?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function askModel(
  modelId: string,
  fen: string,
  opts: AskOptions,
): Promise<AskResult> {
  const spec = getModel(modelId);
  const chess = new Chess(fen);
  const color = chess.turn();
  const maxRetries = opts.maxRetries ?? 3;
  const maxTransient = opts.maxTransient ?? 5;
  const started = Date.now();

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: positionPrompt(fen, opts.mode) },
  ];

  const rejected: string[] = [];
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  let evalClaim: number | null = null;
  let analysis = "";

  const addUsage = (u: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    outputTokenDetails?: { reasoningTokens?: number };
  }) => {
    usage.inputTokens = (usage.inputTokens ?? 0) + (u.inputTokens ?? 0);
    usage.outputTokens = (usage.outputTokens ?? 0) + (u.outputTokens ?? 0);
    usage.reasoningTokens =
      (usage.reasoningTokens ?? 0) + (u.outputTokenDetails?.reasoningTokens ?? 0);
    usage.totalTokens = (usage.totalTokens ?? 0) + (u.totalTokens ?? 0);
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let text = "";

    // Rate limits are expected across a long run; back off rather than
    // recording a spurious failure against the model.
    let lastError: string | null = null;
    for (let t = 0; t <= maxTransient; t++) {
      try {
        const res = await generateText({
          model: spec.id,
          system: systemPrompt(color, opts.mode, opts.promptVersion),
          messages,
          providerOptions: spec.providerOptions,
          maxOutputTokens: spec.maxOutputTokens,
          maxRetries: 2,
        });
        text = res.text;
        addUsage(res.totalUsage);
        lastError = null;
        break;
      } catch (err) {
        const { kind, message } = classifyError(err);
        lastError = message;
        if (kind === "fatal" || t === maxTransient) break;
        await sleep(Math.min(30000, 2000 * 2 ** t));
      }
    }

    if (lastError) {
      return {
        san: null,
        legal: false,
        evalClaim,
        illegalAttempts: rejected.length,
        rejected,
        analysis,
        usage,
        elapsedMs: Date.now() - started,
        error: lastError,
      };
    }

    analysis = extractAnalysis(text) || analysis;
    // Keep the first parseable evaluation: it reflects the model's read of the
    // original position, before retries nudged it.
    if (evalClaim === null) evalClaim = parseEval(text);

    const san = parseMove(text);
    if (san) {
      try {
        new Chess(fen).move(san);
        return {
          san,
          legal: true,
          evalClaim,
          illegalAttempts: rejected.length,
          rejected,
          analysis,
          usage,
          elapsedMs: Date.now() - started,
        };
      } catch {
        // Falls through to the retry below.
      }
    }

    const bad = san ?? "(no move)";
    rejected.push(bad);
    messages.push({ role: "assistant", content: text.slice(-400) });
    messages.push({
      role: "user",
      content: retryPrompt(
        fen,
        bad,
        san ? "" : "No <move> tag found in the response.",
        opts.mode,
      ),
    });
  }

  return {
    san: null,
    legal: false,
    evalClaim,
    illegalAttempts: rejected.length,
    rejected,
    analysis,
    usage,
    elapsedMs: Date.now() - started,
  };
}
