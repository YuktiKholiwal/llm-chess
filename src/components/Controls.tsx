"use client";

import {
  Button,
  DemoIcon,
  Divider,
  Label,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  Segmented,
  StepIcon,
} from "@/components/ui";
import { PROMPT_VERSIONS, type PromptVersion } from "@/lib/prompt";
import type { MatchStatus, Mode } from "@/lib/types";

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
  promptVersion,
  setPromptVersion,
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
  promptVersion: PromptVersion;
  setPromptVersion: (v: PromptVersion) => void;
}) {
  const finished = status === "finished";
  const busy = status === "thinking";

  return (
    <div className="rounded-xl border border-arena-border bg-arena-panel">
      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {running ? (
          <Button
            onClick={onPause}
            variant="primary"
            title="Stop after the current move"
          >
            <PauseIcon />
            Pause
          </Button>
        ) : (
          <Button
            onClick={onStart}
            disabled={finished || busy}
            variant="primary"
          >
            <PlayIcon />
            {status === "idle" ? "Start match" : "Resume"}
          </Button>
        )}
        <Button
          onClick={onStep}
          disabled={running || finished || busy}
          title="Play exactly one move, then stop"
        >
          <StepIcon />
          Step
        </Button>
        <Button onClick={onReset} title="New game with a fresh opening seed">
          <ResetIcon />
          New
        </Button>
        <Divider />
        <Button
          onClick={onDemo}
          title="Replay a real master game — no API calls, no cost"
        >
          <DemoIcon />
          Demo
        </Button>

        <label className="ml-auto flex items-center gap-2.5 text-[11.5px] text-arena-faint">
          <span>Pace</span>
          <input
            type="range"
            min={0}
            max={5000}
            step={250}
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer accent-arena-text"
            title="Pause between moves"
          />
          <span className="w-9 text-right font-mono-arena tabular-nums text-arena-dim">
            {(delayMs / 1000).toFixed(1)}s
          </span>
        </label>
      </div>

      {/* Match settings. Each label+control is one wrap unit, so a narrow
          column breaks between groups instead of orphaning a separator. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-arena-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Label>Legal moves</Label>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "assisted",
                label: "Shown",
                title:
                  "The model is given the list of legal moves. Tests chess judgment only.",
              },
              {
                value: "blind",
                label: "Hidden",
                title:
                  "The model gets only the position and must work out legality itself. Much harder.",
              },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label>Prompt</Label>
          <Segmented
            value={promptVersion}
            onChange={setPromptVersion}
            options={PROMPT_VERSIONS.map((pv) => ({
              value: pv.version,
              label: pv.label,
              title: pv.description,
            }))}
          />
        </div>

        <label
          className="flex cursor-pointer items-center gap-2 text-[11.5px] text-arena-dim transition-colors hover:text-arena-text"
          title="Grade every move with a local Stockfish — free, runs in your browser"
        >
          <input
            type="checkbox"
            checked={engineOn}
            onChange={(e) => setEngineOn(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-arena-text"
          />
          Stockfish grading
        </label>
      </div>
    </div>
  );
}
