"use client";

import { QUALITY_COLOR } from "@/components/ui";
import { getModel } from "@/lib/models";
import type { MoveRecord } from "@/lib/types";

/**
 * Stockfish's verdict on one selected move.
 *
 * Every number here was already being recorded on the move and thrown away --
 * it lived only in a hover tooltip. Reading a game means comparing what the
 * model said it was doing against what the engine says it did, and that
 * comparison needs both on screen at once.
 */

const VERDICT: Record<string, string> = {
  best: "Engine's top choice",
  good: "Sound",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
  forced: "Only legal move",
};

function Field({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: string;
  color?: string;
  title?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-arena-faint">
        {label}
      </span>
      <span
        className="font-mono-arena text-[11.5px] tabular-nums"
        style={{ color: color ?? "var(--color-arena-text)" }}
      >
        {value}
      </span>
    </span>
  );
}

export function MoveInspector({
  move,
  onExit,
}: {
  move: MoveRecord;
  onExit: () => void;
}) {
  const number = `${move.moveNumber}${move.color === "w" ? "." : "…"}`;
  const quality = move.quality;

  return (
    <div className="shrink-0 border-b border-arena-line bg-arena-panel-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono-arena text-[13px] font-medium tabular-nums text-arena-text">
          {number} {move.san}
        </span>

        {move.book ? (
          <span className="text-[11.5px] text-arena-faint">Opening book</span>
        ) : (
          <span
            className="truncate text-[11.5px] text-arena-dim"
            style={{ color: getModel(move.modelId).accent }}
          >
            {getModel(move.modelId).label}
          </span>
        )}

        <button
          type="button"
          onClick={onExit}
          title="Return to the live game (Esc)"
          className="ml-auto shrink-0 rounded-md border border-arena-border px-2 py-0.5 text-[11px] font-medium text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
        >
          Live
        </button>
      </div>

      {move.book ? (
        <p className="mt-1.5 text-[11.5px] text-arena-faint">
          Seeded from the book so no two matches start alike. No model chose it,
          so it is scored for neither side.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
          {quality ? (
            <Field
              label="Verdict"
              value={VERDICT[quality] ?? quality}
              color={QUALITY_COLOR[quality]}
            />
          ) : (
            <Field label="Verdict" value="Not graded yet" color="var(--color-arena-faint)" />
          )}

          {typeof move.cpLoss === "number" && (
            <Field
              label="Cost"
              value={move.cpLoss === 0 ? "nothing" : `−${move.cpLoss}cp`}
              title="Centipawns given up against the engine's best move."
            />
          )}

          {typeof move.accuracy === "number" && (
            <Field label="Accuracy" value={`${move.accuracy.toFixed(1)}%`} />
          )}

          {move.bestMove && move.bestMove !== move.san && (
            <Field
              label="Engine played"
              value={move.bestMove}
              title="What Stockfish would have played here."
            />
          )}

          {typeof move.evalErrorPawns === "number" && (
            <Field
              label="Read the position"
              value={`off by ${move.evalErrorPawns.toFixed(1)}p`}
              title="How far this model's own assessment was from the engine's. Its claim is in the analysis; this is the gap."
            />
          )}

          {move.evalClaim === null && (
            <Field
              label="Self-eval"
              value="omitted"
              color="var(--color-arena-warn)"
              title="The model did not supply a parseable <eval> tag. Format adherence is itself measured."
            />
          )}

          {move.illegalAttempts.length > 0 && (
            <Field
              label="Illegal first"
              value={move.illegalAttempts.join(", ")}
              color="var(--color-arena-warn)"
              title="Moves it proposed that were not legal, before it landed on one that was."
            />
          )}

          {move.forced && (
            <Field
              label="Forced"
              value="random legal move"
              color="var(--color-arena-bad)"
              title="The model never produced a legal move, so the loop played one at random. Not the model's choice."
            />
          )}
        </div>
      )}
    </div>
  );
}
