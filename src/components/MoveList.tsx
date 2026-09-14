"use client";

import { useEffect, useRef } from "react";
import { MoveInspector } from "@/components/MoveInspector";
import { QUALITY_COLOR } from "@/components/ui";
import type { MoveQuality, MoveRecord } from "@/lib/types";

function Cell({
  move,
  selected,
  onSelect,
  ref,
}: {
  move: MoveRecord | undefined;
  selected: boolean;
  onSelect: (ply: number) => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  if (!move) return <span className="flex-1" />;

  const title = move.book
    ? "Opening book seed — not chosen by a model, not scored"
    : [
        move.quality ?? "ungraded",
        typeof move.cpLoss === "number" ? `−${move.cpLoss}cp` : null,
        move.bestMove && move.bestMove !== move.san ? `best: ${move.bestMove}` : null,
        move.illegalAttempts.length
          ? `illegal tries: ${move.illegalAttempts.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const color = move.quality ? QUALITY_COLOR[move.quality] : undefined;

  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={() => onSelect(move.ply)}
      className={`flex flex-1 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left font-mono-arena text-[12px] transition-colors ${
        selected ? "bg-arena-text/[0.13]" : "hover:bg-white/[0.04]"
      }`}
    >
      <span
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${
          move.book ? "border border-arena-edge" : ""
        }`}
        style={move.book ? undefined : { background: color ?? "#33333c" }}
      />
      <span
        className={
          move.book
            ? "text-arena-faint"
            : move.forced
              ? "text-arena-bad"
              : "text-arena-text"
        }
      >
        {move.san}
      </span>
      {move.illegalAttempts.length > 0 && (
        <span className="text-[10px] text-arena-warn">⚠{move.illegalAttempts.length}</span>
      )}
    </button>
  );
}

const LEGEND: { q: MoveQuality; label: string }[] = [
  { q: "best", label: "Best" },
  { q: "good", label: "Good" },
  { q: "inaccuracy", label: "Inaccuracy" },
  { q: "mistake", label: "Mistake" },
  { q: "blunder", label: "Blunder" },
];

/** The coloured dots mean nothing without this, so it ships inside the panel. */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-arena-line px-3 py-2 text-[10.5px] text-arena-faint">
      {LEGEND.map(({ q, label }) => (
        <span key={q} className="flex items-center gap-1.5">
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: QUALITY_COLOR[q] }}
          />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-[5px] w-[5px] rounded-full border border-arena-edge" />
        Opening book
      </span>
    </div>
  );
}

export function MoveList({
  moves,
  selectedPly,
  onSelect,
}: {
  moves: MoveRecord[];
  selectedPly: number | null;
  onSelect: (ply: number | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const following = selectedPly === null;

  // Only chase the newest move while following the live game. Yanking the list
  // to the bottom under someone reading move 12 is the whole reason review
  // mode exists.
  useEffect(() => {
    if (following && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length, following]);

  // Keyboard stepping walks off screen otherwise.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedPly]);

  const selected = moves.find((m) => m.ply === selectedPly) ?? null;

  const rows: MoveRecord[][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-arena-border bg-arena-panel">
      {selected && <MoveInspector move={selected} onExit={() => onSelect(null)} />}

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {rows.length === 0 && (
          <p className="px-1.5 py-2 text-[12px] text-arena-faint">
            Moves appear here, colour-coded by how good Stockfish thinks they
            are. Click one to replay the position and read what the model said
            about it.
          </p>
        )}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-6 shrink-0 text-right font-mono-arena text-[11px] tabular-nums text-arena-faint">
              {i + 1}
            </span>
            {[row[0], row[1]].map((move, j) => (
              <Cell
                key={j}
                move={move}
                selected={!!move && move.ply === selectedPly}
                onSelect={onSelect}
                ref={move && move.ply === selectedPly ? selectedRef : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      <Legend />
    </div>
  );
}
