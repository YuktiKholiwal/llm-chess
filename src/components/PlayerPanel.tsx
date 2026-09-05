"use client";

import { useEffect, useRef, useState } from "react";
import { RichText } from "@/components/RichText";
import { ChevronDownIcon, ChevronIcon } from "@/components/ui";
import { formatUsd } from "@/lib/cost";
import { MODEL_GROUPS, type ModelSpec } from "@/lib/models";
import type { Color, LiveThought, MoveRecord, Scorecard } from "@/lib/types";

const STAT_HELP: Record<string, string> = {
  Blunders: "Moves that threw away a winning or level position.",
  Illegal: "Times this model proposed a move that isn't legal and had to retry.",
  "Eval err":
    "How far the model's own read of the position was from Stockfish's, in pawns. Lower means it understands who is winning.",
  Cost: "Estimated spend for this side, at live AI Gateway rates.",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="flex flex-col gap-1" title={STAT_HELP[label]}>
      <span className="text-[9.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
        {label}
      </span>
      <span
        className={`font-mono-arena text-[13px] tabular-nums ${
          tone === "bad" && value !== 0
            ? "text-arena-bad"
            : tone === "warn" && value !== 0
              ? "text-arena-warn"
              : "text-arena-text"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function PlayerPanel({
  color,
  spec,
  onChangeModel,
  locked,
  isActive,
  live,
  lastMove,
  score,
  cost,
}: {
  color: Color;
  spec: ModelSpec;
  onChangeModel: (id: string) => void;
  locked: boolean;
  isActive: boolean;
  live: LiveThought | null;
  lastMove: MoveRecord | null;
  score: Scorecard;
  cost: number | null;
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = isActive && live;

  const analysis = streaming ? live.analysis : (lastMove?.analysis ?? "");
  const reasoning = streaming ? live.reasoning : (lastMove?.reasoning ?? "");
  const candidates = streaming ? live.candidates : [];

  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [analysis, reasoning, streaming]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-arena-panel transition-colors duration-300"
      style={{
        borderColor: isActive ? `${spec.accent}88` : "var(--color-arena-border)",
        boxShadow: isActive ? `0 0 40px -22px ${spec.accent}` : undefined,
      }}
    >
      {/* Header: side + model picker */}
      <div className="flex items-center gap-2.5 border-b border-arena-line px-3 py-2.5">
        <span
          className={`h-[7px] w-[7px] shrink-0 rounded-full ${isActive ? "thinking-dot" : ""}`}
          style={{ background: spec.accent, color: spec.accent }}
        />
        <div className="relative min-w-0 flex-1">
          <select
            value={spec.id}
            disabled={locked}
            onChange={(e) => onChangeModel(e.target.value)}
            title={
              locked
                ? "Locked once a model has moved — start a new game to change"
                : "Choose this side's model"
            }
            className="w-full cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent py-1 pl-1.5 pr-7 text-[13.5px] font-medium tracking-[-0.01em] text-arena-text outline-none transition-colors hover:border-arena-border hover:bg-arena-panel-2 focus:border-arena-border disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-arena-dim"
          >
            {MODEL_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-arena-panel-2">
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {!locked && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-arena-faint">
              <ChevronDownIcon />
            </span>
          )}
        </div>
        <span className="shrink-0 text-[9.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          {color === "w" ? "White" : "Black"}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5 text-[11.5px]">
        <span className="truncate text-arena-dim">
          {streaming ? (
            <span style={{ color: spec.accent }}>
              Thinking
              {live.attempt > 0 && (
                <span className="ml-1 text-arena-warn">· retry {live.attempt}</span>
              )}
            </span>
          ) : lastMove ? (
            <>
              <span className="text-arena-faint">Played </span>
              <span className="font-mono-arena text-arena-text">{lastMove.san}</span>
              {lastMove.forced && <span className="ml-1 text-arena-bad">· forced</span>}
            </>
          ) : (
            <span className="text-arena-faint">Waiting</span>
          )}
        </span>
        {lastMove && !streaming && (
          <span className="shrink-0 font-mono-arena tabular-nums text-arena-faint">
            {(lastMove.thinkMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Candidate moves pulled live out of the stream */}
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1.5 pt-1">
          {candidates.map((c) => (
            <span
              key={c}
              className="rounded border px-1.5 py-0.5 font-mono-arena text-[11px]"
              style={{ borderColor: `${spec.accent}44`, color: spec.accent }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Analysis */}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1.5">
        {analysis ? (
          <div
            className={`text-[13px] leading-[1.65] text-arena-text/90 ${streaming ? "cursor-blink" : ""}`}
          >
            <RichText text={analysis} />
          </div>
        ) : (
          <p className="text-[12.5px] text-arena-faint">
            {streaming ? "…" : "Waiting for this side to move."}
          </p>
        )}

        {reasoning && (
          <div className="mt-4 border-t border-arena-line pt-3">
            <button
              type="button"
              onClick={() => setShowReasoning((s) => !s)}
              className="flex items-center gap-1.5 text-[11.5px] text-arena-faint transition-colors hover:text-arena-text"
            >
              <ChevronIcon open={showReasoning} />
              Raw thinking
              <span className="font-mono-arena tabular-nums">
                {reasoning.length.toLocaleString()}
              </span>
              chars
            </button>
            {showReasoning && (
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-arena-line bg-arena-bg p-3 font-mono-arena text-[11px] leading-[1.6] text-arena-dim">
                {reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scorecard. Accuracy leads because it is the one number a non-player
          can read; ACPL lives in its tooltip for people who want it. */}
      <div className="border-t border-arena-line px-3 py-3">
        <div
          className="mb-3 flex items-baseline gap-2"
          title={
            score.moves
              ? `Average centipawn loss: ${score.acpl}. How close this model's moves were to Stockfish's best.`
              : "No moves scored yet"
          }
        >
          <span className="font-mono-arena text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums text-arena-text">
            {score.moves && score.accuracy ? score.accuracy.toFixed(1) : "—"}
            {score.moves && score.accuracy ? (
              <span className="text-[15px] text-arena-faint">%</span>
            ) : null}
          </span>
          <span className="text-[9.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
            accuracy
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Blunders" value={score.blunders} tone="bad" />
          <Stat label="Illegal" value={score.illegalAttempts} tone="warn" />
          <Stat
            label="Eval err"
            value={score.evalCompliance > 0 ? `${score.evalErrorPawns.toFixed(1)}p` : "—"}
          />
          <Stat label="Cost" value={cost === null ? "—" : formatUsd(cost)} />
        </div>
      </div>
    </div>
  );
}
