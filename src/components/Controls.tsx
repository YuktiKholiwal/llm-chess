"use client";

import {
  Button,
  DemoIcon,
  Disclosure,
  Label,
  Panel,
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

  // Shown on the closed fold, so the conditions a run was played under stay
  // legible without opening anything.
  const summary = [
    mode === "assisted" ? "legal moves shown" : "legal moves hidden",
    promptVersion,
    engineOn ? "graded" : "ungraded",
  ].join(" · ");

  return (
    <Panel>
      {/* Transport. The only row a first-time visitor has to understand. */}
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
          <Button onClick={onStart} disabled={finished || busy} variant="primary">
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

        <Button
          onClick={onDemo}
          variant="ghost"
          className="ml-auto"
          title="Replay a real master game — no API calls, no cost"
        >
          <DemoIcon />
          Demo
        </Button>
      </div>

      {/* The knobs below change what is being measured, not how it looks. They
          are experimental conditions, so they stay folded away rather than
          asking a first-time visitor to have an opinion about them. */}
      <Disclosure label="Conditions" summary={summary}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
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

        {/* Playback speed changes nothing about the measurement, so it sits
            below the hairline rather than among the conditions. */}
        <div className="mt-3 flex items-center gap-2.5 border-t border-arena-line pt-3">
          <Label>Pace</Label>
          <input
            type="range"
            min={0}
            max={5000}
            step={250}
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="h-1 w-32 cursor-pointer accent-arena-text"
            title="Pause between moves"
          />
          <span className="font-mono-arena text-[11.5px] tabular-nums text-arena-dim">
            {(delayMs / 1000).toFixed(1)}s
          </span>
        </div>
      </Disclosure>
    </Panel>
  );
}
