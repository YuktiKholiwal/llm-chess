"use client";

/** Vertical white-advantage bar. cp is from White's perspective. */
export function EvalBar({ cp, active }: { cp: number; active: boolean }) {
  // Squash centipawns into 0..1 with a logistic curve so the bar stays useful
  // in the +/-3 pawn range where most of these games are actually decided.
  const white = 1 / (1 + Math.exp(-cp / 320));
  const pct = Math.max(2, Math.min(98, white * 100));
  const label =
    Math.abs(cp) >= 9000
      ? cp > 0
        ? "M"
        : "-M"
      : (cp / 100).toFixed(1);

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div
        className={`relative h-full w-6 overflow-hidden rounded-full border transition-opacity ${
          active ? "opacity-100" : "opacity-60"
        }`}
        style={{ borderColor: "var(--color-arena-border)", background: "#1b1b21" }}
        title={`Evaluation: ${label}`}
      >
        <div
          className="absolute bottom-0 w-full bg-neutral-100 transition-all duration-500 ease-out"
          style={{ height: `${pct}%` }}
        />
        <div className="absolute top-1/2 h-px w-full bg-neutral-500/50" />
      </div>
      <span className="font-[family-name:var(--font-mono-arena)] text-[11px] tabular-nums text-arena-dim">
        {cp > 0 ? "+" : ""}
        {label}
      </span>
    </div>
  );
}
