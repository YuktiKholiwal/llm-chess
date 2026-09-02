"use client";

import type { MatchStatus, Mode } from "@/lib/types";

function Btn({
  children,
  onClick,
  disabled,
  primary,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        primary
          ? "bg-arena-text text-arena-bg hover:bg-white"
          : "border border-arena-border bg-arena-panel-2 text-arena-text hover:border-arena-dim"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="h-5 w-px shrink-0 bg-arena-border" />;
}

export function Controls({
  status,
  running,
  mode,
  setMode,
  delayMs,
  setDelayMs,
  engineOn,
  setEngineOn,
  onStart,
  onPause,
  onStep,
  onReset,
  onDemo,
}: {
  status: MatchStatus;
  running: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  delayMs: number;
  setDelayMs: (n: number) => void;
  engineOn: boolean;
  setEngineOn: (b: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onDemo: () => void;
}) {
  const finished = status === "finished";
  const busy = status === "thinking";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-arena-border bg-arena-panel p-2.5">
      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Btn onClick={onPause} primary title="Stop after the current move">
            ❙❙ Pause
          </Btn>
        ) : (
          <Btn onClick={onStart} disabled={finished || busy} primary>
            ▶ {status === "idle" ? "Start match" : "Resume"}
          </Btn>
        )}
        <Btn
          onClick={onStep}
          disabled={running || finished || busy}
          title="Play exactly one move, then stop"
        >
          ⇥ Step
        </Btn>
        <Btn onClick={onReset} title="New game with a fresh opening seed">
          ↻ New
        </Btn>
        <Divider />
        <Btn onClick={onDemo} title="Replay a real master game — no API calls, no cost">
          ◎ Demo
        </Btn>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-arena-dim">
          <span>pace</span>
          <input
            type="range"
            min={0}
            max={5000}
            step={250}
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="w-24 accent-neutral-200"
            title="Pause between moves"
          />
          <span className="w-9 text-right font-[family-name:var(--font-mono-arena)] tabular-nums">
            {(delayMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Match settings */}
      <div className="flex flex-wrap items-center gap-2 border-t border-arena-border/60 pt-2">
        <span className="text-[10px] uppercase tracking-[0.08em] text-arena-faint">
          Difficulty
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-arena-border p-0.5">
          {(["assisted", "blind"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={
                m === "assisted"
                  ? "Legal moves are listed in the prompt — tests chess judgment"
                  : "FEN and board only — the model must track legality itself"
              }
              className={`rounded px-2 py-0.5 text-[11px] capitalize transition-colors ${
                mode === m
                  ? "bg-arena-text text-arena-bg"
                  : "text-arena-dim hover:text-arena-text"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <Divider />

        <label
          className="flex cursor-pointer items-center gap-1.5 text-[11px] text-arena-dim hover:text-arena-text"
          title="Grade every move with a local Stockfish — free, runs in your browser"
        >
          <input
            type="checkbox"
            checked={engineOn}
            onChange={(e) => setEngineOn(e.target.checked)}
            className="accent-neutral-200"
          />
          Stockfish grading
        </label>
      </div>
    </div>
  );
}
