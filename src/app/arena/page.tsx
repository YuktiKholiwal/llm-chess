"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Arrow } from "react-chessboard";
import { Board } from "@/components/Board";
import { Controls } from "@/components/Controls";
import { EvalBar, EvalSummary } from "@/components/EvalBar";
import { MoveList } from "@/components/MoveList";
import { PlayerPanel } from "@/components/PlayerPanel";
import { ArrowLeftIcon, Badge } from "@/components/ui";
import { useEngine } from "@/hooks/useEngine";
import { useMatch } from "@/hooks/useMatch";
import { sanToSquares, scorecardFor } from "@/lib/chess-utils";
import { costOf, formatTokens, formatUsd, type Pricing } from "@/lib/cost";
import { getModel } from "@/lib/models";
import { lastByColor, reviewAt, stepPly } from "@/lib/review";
import type { Color } from "@/lib/types";

/**
 * The board is the tallest fixed thing on the page, so it gives way rather than
 * pushing the move list off the bottom on a short window. 480px is the ceiling;
 * the subtrahend is everything stacked above and below it.
 */
const BOARD = "clamp(260px, calc(100vh - 320px), 480px)";
/** Board plus the eval bar beside it, so the rows above and below line up. */
const COLUMN = `calc(${BOARD} + 30px)`;

export default function Arena() {
  const match = useMatch();
  const [engineOn, setEngineOn] = useState(true);
  const [pricing, setPricing] = useState<Pricing | null>(null);

  // Real per-token rates from the Gateway catalogue, so the cost meter isn't a
  // guess. Failure is non-fatal: the meter just shows "—".
  useEffect(() => {
    let alive = true;
    fetch("/api/models")
      .then((r) => r.json())
      .then((p: Pricing) => alive && setPricing(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const engine = useEngine(match.moves, match.patchMove, {
    enabled: engineOn,
    depth: 12,
  });

  // Seed an opening once on mount; without it every match would replay the
  // same first few moves at low temperature.
  const seeded = useRef(false);
  const { reset } = match;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    reset(true);
  }, [reset]);

  const turn = (match.fen.split(" ")[1] ?? "w") as Color;
  const white = getModel(match.players.w);
  const black = getModel(match.players.b);
  // Lock the pickers only once a MODEL has moved -- seeded book moves must not
  // count, or the selector is disabled before the match even starts.
  const locked = match.moves.some((m) => !m.book);

  // Selecting a past ply rewinds the whole page to that moment. It is view
  // state, not match state, so it lives here rather than in the match loop.
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const view = useMemo(
    () => reviewAt(match.moves, selectedPly, match.fen),
    [match.moves, selectedPly, match.fen],
  );
  const reviewing = view.ply !== null;
  const lastMove = view.move;

  // Stepping a move list with the arrow keys is a convention older than the
  // web; without it, reading a game means clicking forty times.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;

      if (e.key === "Escape") setSelectedPly(null);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedPly((p) => stepPly(match.moves, p, e.key === "ArrowLeft" ? -1 : 1));
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match.moves]);

  /**
   * Solid arrow for the move on the board, ghost arrows for what the model
   * currently has under consideration. The ghosts belong to the live position
   * only -- drawn over a rewound board they would describe a different game.
   */
  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (lastMove) {
      const sq = sanToSquares(lastMove.fenBefore, lastMove.san);
      if (sq)
        out.push({
          startSquare: sq.from,
          endSquare: sq.to,
          color: getModel(lastMove.modelId).accent + "99",
        });
    }
    if (match.live && !reviewing) {
      const accent = getModel(match.live.modelId).accent;
      for (const san of match.live.candidates) {
        const sq = sanToSquares(match.fen, san);
        if (sq)
          out.push({
            startSquare: sq.from,
            endSquare: sq.to,
            color: accent + "44",
          });
      }
    }
    return out;
  }, [lastMove, match.live, match.fen, reviewing]);

  // Panels read the reviewed slice, not the whole game: a scorecard showing the
  // final accuracy beside the analysis from move 14 invites exactly the wrong
  // reading. The header meters stay on the whole match, because that is what
  // has actually been spent.
  const costW = pricing ? costOf(view.through.filter((m) => m.color === "w"), pricing) : null;
  const costB = pricing ? costOf(view.through.filter((m) => m.color === "b"), pricing) : null;
  const totalTokens = match.moves.reduce(
    (a, m) => a + (m.usage.totalTokens ?? 0),
    0,
  );
  const totalCost = pricing ? costOf(match.moves, pricing) : null;

  const scoreW = useMemo(
    () => scorecardFor(view.through, "w", match.players.w),
    [view.through, match.players.w],
  );
  const scoreB = useMemo(
    () => scorecardFor(view.through, "b", match.players.b),
    [view.through, match.players.b],
  );

  return (
    <main className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 p-4">
      {/* Header. Match settings live in Controls — repeating them here just
          added chrome without adding a place to change them. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-arena-border pb-3">
        {/* This page sizes the board against the viewport, so it keeps its own
            compact bar rather than the site nav. The links mirror it by hand. */}
        <Link
          href="/"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-arena-border px-2.5 font-medium text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
        >
          <ArrowLeftIcon />
          Chess evals
        </Link>

        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Live match</h1>
          <p className="hidden text-[11.5px] text-arena-faint lg:block">
            Two models play a full game. Stockfish grades every move as it lands.
          </p>
        </div>

        <Badge title="Opening seeded from the book so no two matches start alike">
          {match.opening}
        </Badge>

        {match.isDemoMatch && (
          <Badge title="Scripted replay of a real game — no API calls, no model output">
            <span className="h-1.5 w-1.5 rounded-full bg-arena-info" />
            Demo · scripted
          </Badge>
        )}

        {engineOn && (
          <span
            className="flex items-center gap-1.5 text-[11.5px] text-arena-faint"
            title="Local Stockfish, running in your browser"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                engine.grading
                  ? "bg-arena-warn thinking-dot"
                  : engine.ready
                    ? "bg-arena-good"
                    : "bg-arena-edge"
              }`}
              style={engine.grading ? { color: "var(--color-arena-warn)" } : undefined}
            />
            {engine.grading ? "Grading" : engine.ready ? "Engine ready" : "Engine loading"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11.5px]">
          {match.error && (
            <span
              className="max-w-[320px] truncate text-arena-warn"
              title={match.error}
            >
              {match.error}
            </span>
          )}
          {totalTokens > 0 && (
            <span
              className="flex items-center gap-2 font-mono-arena tabular-nums text-arena-faint"
              title="Estimated spend this match, from live AI Gateway rates"
            >
              <span>{formatTokens(totalTokens)} tok</span>
              {totalCost !== null && (
                <span className="text-arena-dim">~{formatUsd(totalCost)}</span>
              )}
            </span>
          )}
          {match.outcome && (
            <span className="rounded-md bg-arena-text px-2.5 py-1 font-mono-arena text-[11px] font-semibold text-arena-bg">
              {match.outcome.result} · {match.outcome.reason}
            </span>
          )}

          <span className="hidden items-center gap-1 md:flex">
            <Link
              href="/arena/scorecard"
              title="Same positions, every model, solo"
              className="rounded-md px-2 py-1 text-arena-faint transition-colors hover:bg-arena-panel hover:text-arena-dim"
            >
              Scorecard
            </Link>
            <Link
              href="/reasoning"
              title="Is what the model says about the board true?"
              className="rounded-md px-2 py-1 text-arena-faint transition-colors hover:bg-arena-panel hover:text-arena-dim"
            >
              Reasoning eval
            </Link>
          </span>
        </div>
      </header>

      {/* The primary action sits directly under the header rather than below a
          480px board, where a first-time visitor had to scroll to find it. */}
      <Controls
        status={match.status}
        running={match.status === "thinking" || match.isRunning}
        mode={match.mode}
        setMode={match.setMode}
        delayMs={match.moveDelayMs}
        setDelayMs={match.setMoveDelayMs}
        engineOn={engineOn}
        setEngineOn={setEngineOn}
        onStart={match.start}
        onPause={match.pause}
        onStep={match.step}
        // A selection left over from the last game would point at a ply
        // number the new one also has, quietly rewinding to a different match.
        onReset={() => {
          setSelectedPly(null);
          match.reset(true);
        }}
        onDemo={() => {
          setSelectedPly(null);
          match.startDemo();
        }}
        promptVersion={match.promptVersion}
        setPromptVersion={match.setPromptVersion}
      />

      {/* Three columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(230px,330px)_auto_minmax(230px,330px)] lg:justify-center">
        <PlayerPanel
          color="w"
          spec={white}
          locked={locked}
          onChangeModel={(id) => match.setPlayers((p) => ({ ...p, w: id }))}
          isActive={!reviewing && turn === "w" && match.status === "thinking"}
          live={!reviewing && match.live?.color === "w" ? match.live : null}
          lastMove={lastByColor(view.through, "w")}
          score={scoreW}
          cost={costW}
        />

        <div
          className="flex min-h-0 flex-col items-center gap-3"
          style={{ "--board": BOARD, "--column": COLUMN } as React.CSSProperties}
        >
          <div className="flex w-[var(--column)] items-center justify-center gap-2.5">
            <EvalSummary cp={view.cp} active={engineOn} />
            {reviewing && lastMove && (
              <Badge title="The board is showing a past position. ← → to step, Esc to catch up.">
                <span className="h-1.5 w-1.5 rounded-full bg-arena-info" />
                Reviewing {lastMove.moveNumber}
                {lastMove.color === "w" ? "." : "…"} {lastMove.san}
              </Badge>
            )}
          </div>
          <div className="flex h-[var(--board)] shrink-0 items-stretch gap-3">
            <EvalBar cp={view.cp} active={engineOn} />
            <div className="w-[var(--board)]">
              <Board fen={view.fen} arrows={arrows} />
            </div>
          </div>
          <div className="min-h-0 w-[var(--column)] flex-1">
            <MoveList
              moves={match.moves}
              selectedPly={selectedPly}
              onSelect={setSelectedPly}
            />
          </div>
        </div>

        <PlayerPanel
          color="b"
          spec={black}
          locked={locked}
          onChangeModel={(id) => match.setPlayers((p) => ({ ...p, b: id }))}
          isActive={!reviewing && turn === "b" && match.status === "thinking"}
          live={!reviewing && match.live?.color === "b" ? match.live : null}
          lastMove={lastByColor(view.through, "b")}
          score={scoreB}
          cost={costB}
        />
      </div>
    </main>
  );
}
