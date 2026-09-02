"use client";

import { useEffect, useRef } from "react";
import type { MoveQuality, MoveRecord } from "@/lib/types";

const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: "#4ade80",
  good: "#94a3b8",
  inaccuracy: "#fbbf24",
  mistake: "#fb923c",
  blunder: "#f87171",
  forced: "#64748b",
};

function Cell({ move }: { move: MoveRecord | undefined }) {
  if (!move) return <span className="flex-1" />;
  if (move.book) {
    return (
      <span
        title="Opening book seed — not chosen by a model, not scored"
        className="flex flex-1 items-center gap-1.5 rounded px-1 py-0.5 font-[family-name:var(--font-mono-arena)] text-[12px] text-arena-faint italic"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-arena-faint" />
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
      className="flex flex-1 items-center gap-1.5 rounded px-1 py-0.5 font-[family-name:var(--font-mono-arena)] text-[12px] hover:bg-white/5"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color ?? "#33333c" }}
      />
      <span className={move.forced ? "text-red-400" : "text-arena-text"}>
        {move.san}
      </span>
      {move.illegalAttempts.length > 0 && (
        <span className="text-[10px] text-amber-500">
          ⚠{move.illegalAttempts.length}
        </span>
      )}
    </span>
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
      className="scroll-thin h-full min-h-0 overflow-y-auto rounded-lg border border-arena-border bg-arena-panel p-2"
    >
      {rows.length === 0 && (
        <p className="p-2 text-[12px] text-arena-faint italic">
          No moves yet.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-6 shrink-0 text-right font-[family-name:var(--font-mono-arena)] text-[11px] text-arena-faint">
            {i + 1}.
          </span>
          <Cell move={row[0]} />
          <Cell move={row[1]} />
        </div>
      ))}
    </div>
  );
}

export { QUALITY_COLOR };
