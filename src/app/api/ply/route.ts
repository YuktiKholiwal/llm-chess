import { streamText } from "ai";
import { Chess } from "chess.js";
import { getModel } from "@/lib/models";
import { classifyError } from "@/lib/errors";
import { extractAnalysis, parseEval, parseMove } from "@/lib/parse-move";
import {
  DEFAULT_PROMPT_VERSION,
  positionPrompt,
  promptHash,
  retryPrompt,
  systemPrompt,
  type PromptVersion,
} from "@/lib/prompt";
import type { Mode, Usage } from "@/lib/types";

export const maxDuration = 300;

type Body = {
  modelId: string;
  fen: string;
  mode: Mode;
  /** SAN moves played so far; not recoverable from the FEN alone. */
  history?: string[];
  /** Which frozen prompt variant to use. Stamped onto the result. */
  promptVersion?: PromptVersion;
  /** Prior rejected attempts in this same ply, oldest first. */
  rejected?: { san: string; reason: string }[];
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const spec = getModel(body.modelId);
  const chess = new Chess(body.fen);
  const color = chess.turn();
  const promptVersion = body.promptVersion ?? DEFAULT_PROMPT_VERSION;

  const messages: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: positionPrompt(body.fen, body.mode, body.history ?? []),
    },
  ];
  for (const r of body.rejected ?? []) {
    messages.push({ role: "assistant", content: `<move>${r.san}</move>` });
    messages.push({
      role: "user",
      content: retryPrompt(body.fen, r.san, r.reason, body.mode),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let text = "";
      let reasoning = "";
      let usage: Usage = {};

      try {
        const result = streamText({
          model: spec.id,
          system: systemPrompt(color, body.mode, promptVersion),
          messages,
          providerOptions: spec.providerOptions,
          maxOutputTokens: spec.maxOutputTokens,
          // The SDK already backs off on retryable statuses; the client adds a
          // second, longer layer on top for sustained rate limiting.
          maxRetries: 3,
        });

        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            text += part.text;
            send({ t: "text", v: part.text });
          } else if (part.type === "reasoning-delta") {
            reasoning += part.text;
            send({ t: "reasoning", v: part.text });
          } else if (part.type === "error") {
            throw part.error;
          }
        }

        const u = await result.totalUsage;
        usage = {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          reasoningTokens: u.outputTokenDetails?.reasoningTokens,
          totalTokens: u.totalTokens,
        };

        const san = parseMove(text);
        if (!san) {
          send({
            t: "result",
            legal: false,
            san: null,
            error: "No <move> tag found in the response.",
            analysis: extractAnalysis(text),
            reasoning,
            usage,
            evalClaim: parseEval(text),
            promptVersion,
            promptHash: promptHash(promptVersion),
          });
        } else {
          // chess.js throws on an illegal move; that throw IS the validation.
          let legal = true;
          let error: string | null = null;
          try {
            new Chess(body.fen).move(san);
          } catch {
            legal = false;
            error = `${san} is not legal from this position.`;
          }
          send({
            t: "result",
            legal,
            san,
            error,
            analysis: extractAnalysis(text),
            reasoning,
            usage,
            evalClaim: parseEval(text),
            promptVersion,
            promptHash: promptHash(promptVersion),
          });
        }
      } catch (err) {
        const { kind, message } = classifyError(err);
        send({ t: kind, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
