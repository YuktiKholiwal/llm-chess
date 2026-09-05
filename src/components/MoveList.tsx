"use client";

import { useEffect, useRef } from "react";
import type { MoveQuality, MoveRecord } from "@/lib/types";

const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: "#62c073",
  good: "#7d7d7d",
  inaccuracy: "#f5a623",
  mistake: "#f79448",
  blunder: "#ff6369",
  forced: "#545454",
};

function Cell({ move }: { move: MoveRecord | undefined }) {
  if (!move) return <span className="flex-1" />;
  if (move.book) {
    return (
      <span
        title="Opening book seed — not chosen by a model, not scored"
        className="flex flex-1 items-center gap-2 rounded px-1.5 py-1 font-mono-arena text-[12px] text-arena-faint"
      >
        <span className="h-[5px] w-[5px] shrink-0 rounded-full border border-arena-edge" />
        {move.san}
      </span>
    );
  }
  const color = move.quality ? QUALITY_COLOR[move.quality] : undefined;
  const title = [
    move.quality ?? "ungraded",
    typeof move.cpLoss === "number" ? `−${move.cpLoss}cp` : null,
    move.bestMove && move.bestMove !== move.san ? `best: ${move.bestMove}` : null,
    move.illegalAttempts.length
      ? `illegal tries: ${move.illegalAttempts.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className="flex flex-1 items-center gap-2 rounded px-1.5 py-1 font-mono-arena text-[12px] transition-colors hover:bg-white/[0.04]"
    >
      <span
        className="h-[5px] w-[5px] shrink-0 rounded-full"
        style={{ background: color ?? "#33333c" }}
      />
      <span className={move.forced ? "text-arena-bad" : "text-arena-text"}>{move.san}</span>
      {move.illegalAttempts.length > 0 && (
        <span className="text-[10px] text-arena-warn">⚠{move.illegalAttempts.length}</span>
      )}
    </span>
  );
}

const LEGEND: { q: MoveQuality; label: string }[] = [
  { q: "best", label: "Best" },
  { q: "good", label: "Good" },
  { q: "inaccuracy", label: "Inaccuracy" },
  { q: "mistake", label: "Mistake" },
  { q: "blunder", label: "Blunder" },
];

/** The coloured dots mean nothing without this. */
export function MoveLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10.5px] text-arena-faint">
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

export function MoveList({ moves }: { moves: MoveRecord[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [moves.length]);

  const rows: MoveRecord[][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2));

  return (
    <div
      ref={ref}
      className="scroll-thin h-full min-h-0 overflow-y-auto rounded-xl border border-arena-border bg-arena-panel p-2"
    >
      {rows.length === 0 && (
        <p className="px-1.5 py-2 text-[12px] text-arena-faint">
          Moves appear here, colour-coded by how good Stockfish thinks they are.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-6 shrink-0 text-right font-mono-arena text-[11px] tabular-nums text-arena-faint">
            {i + 1}
          </span>
          <Cell move={row[0]} />
          <Cell move={row[1]} />
        </div>
      ))}
    </div>
  );
}

export { QUALITY_COLOR };
