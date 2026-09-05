import type { ReactNode } from "react";

/* ------------------------------------------------------------------ icons */

/**
 * 16px stroke icons drawn inline. They replace the glyphs (▶ ❙❙ ↻ ▼) the UI
 * used before, which rendered at a different weight and baseline in every
 * font and made the control bar look ragged.
 */
function Svg({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Svg>
    <path d="M4.75 2.75 13 8l-8.25 5.25z" fill="currentColor" stroke="none" />
  </Svg>
);

export const PauseIcon = () => (
  <Svg>
    <rect x="4" y="3" width="2.75" height="10" rx="0.75" fill="currentColor" stroke="none" />
    <rect x="9.25" y="3" width="2.75" height="10" rx="0.75" fill="currentColor" stroke="none" />
  </Svg>
);

export const StepIcon = () => (
  <Svg>
    <path d="M3.5 3.25 10 8l-6.5 4.75z" fill="currentColor" stroke="none" />
    <path d="M12.75 3.25v9.5" />
  </Svg>
);

export const ResetIcon = () => (
  <Svg>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.78" />
    <path d="M13.25 2.5V5.5H10.25" />
  </Svg>
);

export const DemoIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
  </Svg>
);

export const ChevronIcon = ({ open }: { open?: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
  >
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const ChevronDownIcon = () => (
  <Svg size={12}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Svg>
);

export const ArrowRightIcon = () => (
  <Svg size={13}>
    <path d="M2.75 8h10.5" />
    <path d="M9 3.75 13.25 8 9 12.25" />
  </Svg>
);

/**
 * Always visible, so sortable columns advertise themselves instead of waiting
 * for a hover the user has no reason to try.
 */
export const SortIcon = ({ active }: { active?: boolean }) => (
  <svg
    width="9"
    height="11"
    viewBox="0 0 9 11"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`shrink-0 transition-opacity ${active ? "opacity-100" : "opacity-35"}`}
  >
    <path d="M1.5 4 4.5 1 7.5 4" />
    <path d="M1.5 7 4.5 10 7.5 7" />
  </svg>
);

/* ---------------------------------------------------------------- surfaces */

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-arena-border bg-arena-panel ${className}`}>
      {children}
    </div>
  );
}

/** Small-caps section label. One definition, so the tracking never drifts. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-arena-faint">
      {children}
    </span>
  );
}

export function Badge({
  children,
  title,
  mono,
}: {
  children: ReactNode;
  title?: string;
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md border border-arena-border px-2 py-[3px] text-[11px] text-arena-dim ${
        mono ? "font-mono-arena tabular-nums" : ""
      }`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- controls */

const BUTTON_VARIANTS = {
  primary:
    "bg-arena-text text-arena-bg hover:bg-white disabled:hover:bg-arena-text",
  secondary:
    "border border-arena-border bg-arena-panel-2 text-arena-text hover:border-arena-edge hover:bg-arena-border/40 disabled:hover:border-arena-border disabled:hover:bg-arena-panel-2",
  ghost:
    "border border-transparent text-arena-dim hover:border-arena-border hover:text-arena-text",
} as const;

export function Button({
  children,
  onClick,
  disabled,
  title,
  variant = "secondary",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-35 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Two-or-three-way switch. Reads as one control rather than a row of buttons,
 * which is what the mode and prompt pickers actually are.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-arena-border bg-arena-bg p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={value === o.value}
          className={`rounded-[4px] px-2 py-[3px] text-[11.5px] transition-colors duration-150 ${
            value === o.value
              ? "bg-arena-border text-arena-text"
              : "text-arena-faint hover:text-arena-dim"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Vertical hairline between groups in a control bar. */
export function Divider() {
  return <span className="h-4 w-px shrink-0 bg-arena-border" />;
}
