"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Arrow } from "react-chessboard";
import { Board } from "@/components/Board";
import { Controls } from "@/components/Controls";
import { EvalBar, EvalSummary } from "@/components/EvalBar";
import { MoveList, MoveLegend } from "@/components/MoveList";
import { PlayerPanel } from "@/components/PlayerPanel";
import { useEngine } from "@/hooks/useEngine";
import { useMatch } from "@/hooks/useMatch";
import { sanToSquares, scorecardFor } from "@/lib/chess-utils";
import { costOf, formatTokens, formatUsd, type Pricing } from "@/lib/cost";
import { getModel } from "@/lib/models";
import type { Color } from "@/lib/types";

const BOARD_PX = 480;

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

  const lastMove = match.moves.at(-1) ?? null;
  const lastByColor = (c: Color) =>
    [...match.moves].reverse().find((m) => m.color === c) ?? null;

  const currentEval = useMemo(() => {
    const graded = [...match.moves]
      .reverse()
      .find((m) => typeof m.evalAfter === "number");
    return graded?.evalAfter ?? 0;
  }, [match.moves]);

  /** Solid arrow for the move just played, ghost arrows for live candidates. */
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
    if (match.live) {
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
  }, [lastMove, match.live, match.fen]);

  const movesW = useMemo(
    () => match.moves.filter((m) => m.color === "w"),
    [match.moves],
  );
  const movesB = useMemo(
    () => match.moves.filter((m) => m.color === "b"),
    [match.moves],
  );
  const costW = pricing ? costOf(movesW, pricing) : null;
  const costB = pricing ? costOf(movesB, pricing) : null;
  const totalTokens = match.moves.reduce(
    (a, m) => a + (m.usage.totalTokens ?? 0),
    0,
  );

  const scoreW = useMemo(
    () => scorecardFor(match.moves, "w", match.players.w),
    [match.moves, match.players.w],
  );
  const scoreB = useMemo(
    () => scorecardFor(match.moves, "b", match.players.b),
    [match.moves, match.players.b],
  );

  return (
    <main className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 p-3">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-arena-border pb-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-semibold tracking-tight">
            LLM Chess Arena
          </h1>
          <p className="hidden text-[11px] text-arena-dim sm:block">
            Two AI models play. Stockfish scores every move.
          </p>
        </div>
        <span className="rounded border border-arena-border px-2 py-0.5 text-[11px] text-arena-dim">
          {match.opening}
        </span>
        <span
          className="rounded border border-arena-border px-2 py-0.5 text-[11px] text-arena-dim"
          title={
            match.mode === "assisted"
              ? "Models are given the list of legal moves"
              : "Models get only the position and must work out legality themselves"
          }
        >
          legal moves {match.mode === "assisted" ? "shown" : "hidden"}
        </span>
        <span
          className="rounded border border-arena-border px-2 py-0.5 text-[11px] text-arena-dim"
          title="Which frozen prompt variant produced these numbers"
        >
          prompt: {match.promptVersion}
        </span>
        {match.isDemoMatch && (
          <span
            className="rounded px-2 py-0.5 text-[11px] font-semibold text-arena-bg"
            style={{ background: "#C4B5FD" }}
            title="Scripted replay of a real game — no API calls, no model output"
          >
            DEMO · scripted
          </span>
        )}
        {engineOn && (
          <span className="text-[11px] text-arena-faint">
            {engine.grading ? "grading…" : engine.ready ? "engine ready" : "engine off"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          {match.error && (
            <span className="max-w-[360px] truncate text-amber-400" title={match.error}>
              {match.error}
            </span>
          )}
          {totalTokens > 0 && (
            <span
              className="flex items-center gap-2 rounded-md border border-arena-border px-2 py-1 font-[family-name:var(--font-mono-arena)] tabular-nums text-arena-dim"
              title="Estimated spend this match, from live AI Gateway rates"
            >
              <span>{formatTokens(totalTokens)} tok</span>
              {costW !== null && costB !== null && (
                <span className="text-arena-text">
                  ~{formatUsd(costW + costB)}
                </span>
              )}
            </span>
          )}
          {match.outcome && (
            <span className="rounded-md bg-arena-text px-2.5 py-1 font-[family-name:var(--font-mono-arena)] font-semibold text-arena-bg">
              {match.outcome.result} · {match.outcome.reason}
            </span>
          )}
        </div>
      </header>

      {/* Three columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)]">
        <PlayerPanel
          color="w"
          spec={white}
          locked={locked}
          onChangeModel={(id) => match.setPlayers((p) => ({ ...p, w: id }))}
          isActive={turn === "w" && match.status === "thinking"}
          live={match.live?.color === "w" ? match.live : null}
          lastMove={lastByColor("w")}
          score={scoreW}
          cost={costW}
        />

        <div className="flex min-h-0 flex-col items-center gap-3">
          <div className="flex w-full items-center justify-center" style={{ maxWidth: BOARD_PX + 36 }}>
            <EvalSummary cp={currentEval} active={engineOn} />
          </div>
          <div
            className="flex shrink-0 items-stretch gap-3"
            style={{ height: BOARD_PX }}
          >
            <EvalBar cp={currentEval} active={engineOn} />
            <div style={{ width: BOARD_PX }}>
              <Board fen={match.fen} arrows={arrows} />
            </div>
          </div>
          <div className="w-full shrink-0" style={{ maxWidth: BOARD_PX + 36 }}>
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
              onReset={() => match.reset(true)}
              onDemo={match.startDemo}
              promptVersion={match.promptVersion}
              setPromptVersion={match.setPromptVersion}
            />
          </div>
          <div
            className="flex min-h-0 w-full flex-1 flex-col gap-1.5"
            style={{ maxWidth: BOARD_PX + 36 }}
          >
            <MoveList moves={match.moves} />
            <MoveLegend />
          </div>
        </div>

        <PlayerPanel
          color="b"
          spec={black}
          locked={locked}
          onChangeModel={(id) => match.setPlayers((p) => ({ ...p, b: id }))}
          isActive={turn === "b" && match.status === "thinking"}
          live={match.live?.color === "b" ? match.live : null}
          lastMove={lastByColor("b")}
          score={scoreB}
          cost={costB}
        />
      </div>
    </main>
  );
}
