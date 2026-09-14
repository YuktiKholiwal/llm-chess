import type { ReactNode } from "react";

/** Shared atoms for the reasoning pages. Presentational only -- no data access. */

export function Pct({ value, dp = 1 }: { value: number | null; dp?: number }) {
  if (value === null) return <span className="text-arena-faint">—</span>;
  return <span className="tabular-nums">{(value * 100).toFixed(dp)}%</span>;
}

/** A 95% interval, set quieter than the point estimate it qualifies. */
export function CI({ ci }: { ci: [number, number] | undefined }) {
  if (!ci) return null;
  return (
    <span className="ml-1.5 whitespace-nowrap font-mono-arena text-[10.5px] tabular-nums text-arena-faint">
      [{(ci[0] * 100).toFixed(1)}–{(ci[1] * 100).toFixed(1)}]
    </span>
  );
}

/**
 * Signed points, coloured only where the sign carries meaning. The gap between
 * solve rate and claim accuracy is the eval's headline, and a bare number
 * loses which direction it runs in.
 */
export function Gap({ value }: { value: number | null }) {
  if (value === null) return <span className="text-arena-faint">—</span>;
  const points = value * 100;
  const tone = points >= 0 ? "text-arena-good" : "text-arena-bad";
  return (
    <span className={`tabular-nums ${tone}`}>
      {points >= 0 ? "+" : "−"}
      {Math.abs(points).toFixed(1)}
    </span>
  );
}

export type Verdict = boolean | null;

const VERDICT_STYLE: Record<string, { label: string; className: string; mark: string }> = {
  true: {
    label: "True",
    mark: "✓",
    className: "border-arena-good/35 bg-arena-good/10 text-arena-good",
  },
  false: {
    label: "False",
    mark: "✗",
    className: "border-arena-bad/35 bg-arena-bad/10 text-arena-bad",
  },
  null: {
    label: "Unverifiable",
    mark: "?",
    className: "border-arena-border bg-arena-panel-2 text-arena-faint",
  },
};

export function VerdictPill({ verdict, showLabel = true }: { verdict: Verdict; showLabel?: boolean }) {
  const style = VERDICT_STYLE[String(verdict)];
  return (
    <span
      title={style.label}
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded border px-1.5 text-[10.5px] font-medium ${style.className}`}
    >
      <span aria-hidden="true">{style.mark}</span>
      {showLabel && style.label}
      {!showLabel && <span className="sr-only">{style.label}</span>}
    </span>
  );
}

/** One number with its name above it, for a row of headline figures. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
        {label}
      </p>
      <p className="mt-2 font-mono-arena text-[20px] font-medium leading-none tracking-[-0.02em] text-arena-text tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-[11.5px] leading-[1.5] text-arena-faint">{hint}</p>}
    </div>
  );
}

export function ModelDot({ accent }: { accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: accent }}
    />
  );
}

/** Section heading, matching the rule-under-caps used on the scorecard. */
export function SectionHeading({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-arena-border pb-3">
      <h2 className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
        {children}
      </h2>
      {note && <p className="text-[11.5px] text-arena-faint">{note}</p>}
    </div>
  );
}

/** A table that scrolls inside its own box rather than widening the page. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-arena-border bg-arena-panel">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "right",
  title,
}: {
  children: ReactNode;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      className={`whitespace-nowrap border-b border-arena-border px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.07em] text-arena-faint ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "right",
  muted = false,
}: {
  children: ReactNode;
  align?: "left" | "right";
  muted?: boolean;
}) {
  return (
    <td
      className={`border-b border-arena-line px-4 py-3 ${
        align === "left" ? "text-left" : "text-right"
      } ${muted ? "text-arena-faint" : "text-arena-dim"}`}
    >
      {children}
    </td>
  );
}
