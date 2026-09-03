"use client";

import { useEffect, useRef, useState } from "react";
import { RichText } from "@/components/RichText";
import { formatUsd } from "@/lib/cost";
import { MODEL_GROUPS, type ModelSpec } from "@/lib/models";
import type { Color, LiveThought, MoveRecord, Scorecard } from "@/lib/types";

const STAT_HELP: Record<string, string> = {
  Blunders: "Moves that threw away a winning or level position.",
  Illegal: "Times this model proposed a move that isn't legal and had to retry.",
  "Eval err": "How far the model's own read of the position was from Stockfish's, in pawns. Lower means it understands who is winning.",
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
    <div className="flex flex-col gap-0.5" title={STAT_HELP[label]}>
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-arena-faint">
        {label}
      </span>
      <span
        className={`font-[family-name:var(--font-mono-arena)] text-[13px] tabular-nums ${
          tone === "bad" && value !== 0
            ? "text-red-400"
            : tone === "warn" && value !== 0
              ? "text-amber-400"
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
        borderColor: isActive ? spec.accent : "var(--color-arena-border)",
        boxShadow: isActive ? `0 0 32px -16px ${spec.accent}` : undefined,
      }}
    >
      {/* Header: side badge + model picker */}
      <div className="flex items-center gap-2.5 border-b border-arena-border px-3 py-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "thinking-dot" : ""}`}
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
            className="w-full cursor-pointer appearance-none truncate rounded-md border border-transparent bg-arena-panel-2 py-1.5 pl-2.5 pr-7 text-[13px] font-medium text-arena-text outline-none transition-colors hover:border-arena-border focus:border-arena-dim disabled:cursor-not-allowed disabled:bg-transparent disabled:text-arena-dim"
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
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-arena-dim">
              ▼
            </span>
          )}
        </div>
        <span className="shrink-0 rounded border border-arena-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-arena-dim">
          {color === "w" ? "White" : "Black"}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
        <span className="truncate text-arena-dim">
          {streaming ? (
            <span style={{ color: spec.accent }}>
              thinking
              {live.attempt > 0 && (
                <span className="ml-1 text-amber-400">· retry {live.attempt}</span>
              )}
            </span>
          ) : lastMove ? (
            <>
              played{" "}
              <span className="font-[family-name:var(--font-mono-arena)] text-arena-text">
                {lastMove.san}
              </span>
              {lastMove.forced && <span className="ml-1 text-red-400">· forced</span>}
            </>
          ) : (
            "waiting"
          )}
        </span>
        {lastMove && !streaming && (
          <span className="shrink-0 font-[family-name:var(--font-mono-arena)] tabular-nums text-arena-faint">
            {(lastMove.thinkMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Candidate moves pulled live out of the stream */}
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {candidates.map((c) => (
            <span
              key={c}
              className="rounded border px-1.5 py-0.5 font-[family-name:var(--font-mono-arena)] text-[11px]"
              style={{ borderColor: `${spec.accent}55`, color: spec.accent }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Analysis */}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {analysis ? (
          <div
            className={`text-[13px] leading-[1.6] text-arena-text/85 ${streaming ? "cursor-blink" : ""}`}
          >
            <RichText text={analysis} />
          </div>
        ) : (
          <p className="text-[12px] italic text-arena-faint">
            {streaming ? "…" : "Waiting for this side to move."}
          </p>
        )}

        {reasoning && (
          <div className="mt-3 border-t border-arena-border/60 pt-2.5">
            <button
              onClick={() => setShowReasoning((s) => !s)}
              className="text-[11px] text-arena-dim transition-colors hover:text-arena-text"
            >
              {showReasoning ? "▾" : "▸"} raw thinking ·{" "}
              {reasoning.length.toLocaleString()} chars
            </button>
            {showReasoning && (
              <div className="mt-2 whitespace-pre-wrap rounded-md border border-arena-border bg-arena-bg/60 p-2.5 font-[family-name:var(--font-mono-arena)] text-[11px] leading-relaxed text-arena-dim">
                {reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scorecard. Accuracy leads because it is the one number a non-player
          can read; ACPL lives in its tooltip for people who want it. */}
      <div className="border-t border-arena-border bg-arena-bg/40 px-3 py-2.5">
        <div
          className="mb-2 flex items-baseline gap-2"
          title={
            score.moves
              ? `Average centipawn loss: ${score.acpl}. How close this model's moves were to Stockfish's best.`
              : "No moves scored yet"
          }
        >
          <span className="font-[family-name:var(--font-mono-arena)] text-[22px] font-semibold leading-none tabular-nums text-arena-text">
            {score.moves && score.accuracy ? `${score.accuracy.toFixed(1)}%` : "—"}
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em] text-arena-faint">
            accuracy
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Blunders" value={score.blunders} tone="bad" />
          <Stat label="Illegal" value={score.illegalAttempts} tone="warn" />
          <Stat
            label="Eval err"
            value={
              score.evalCompliance > 0 ? `${score.evalErrorPawns.toFixed(1)}p` : "—"
            }
          />
          <Stat label="Cost" value={cost === null ? "—" : formatUsd(cost)} />
        </div>
      </div>
    </div>
  );
}
