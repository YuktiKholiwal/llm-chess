"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  OPENING_BOOK,
  candidatesInText,
  legalSet,
  outcomeOf,
  randomLegalMove,
} from "@/lib/chess-utils";
import { isDemo, runDemoPly } from "@/lib/demo";
import { DEFAULT_BLACK, DEFAULT_WHITE, type Players } from "@/lib/models";
import { DEFAULT_PROMPT_VERSION, type PromptVersion } from "@/lib/prompt";
import type {
  Color,
  LiveThought,
  MatchStatus,
  Mode,
  MoveRecord,
  Outcome,
  Usage,
} from "@/lib/types";

const MAX_RETRIES = 3;
const MAX_PLIES = 200;
/** Extra attempts for rate limits / provider hiccups, which are expected. */
const MAX_TRANSIENT = 5;
/** Cap live-panel re-renders at ~12/sec regardless of token rate. */
const FLUSH_MS = 80;

type PlyOutcome = {
  legal: boolean;
  san: string | null;
  error: string | null;
  analysis: string;
  reasoning: string;
  usage: Usage;
  evalClaim?: number | null;
  promptVersion?: string;
  promptHash?: string;
  fatal?: string;
  /** Retryable (rate limit, provider blip) rather than a dead end. */
  transient?: boolean;
};

/** Consumes the SSE stream for one model call, pushing deltas as they land. */
async function streamPly(
  body: unknown,
  signal: AbortSignal,
  onDelta: (kind: "text" | "reasoning", v: string) => void,
): Promise<PlyOutcome> {
  const res = await fetch("/api/ply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const out = blank(`Request failed: ${res.status} ${await res.text()}`);
    if (res.status === 429 || res.status >= 500) out.transient = true;
    return out;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: PlyOutcome | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const evt = JSON.parse(line.slice(5).trim());
      if (evt.t === "text" || evt.t === "reasoning") {
        onDelta(evt.t, evt.v);
      } else if (evt.t === "result") {
        final = evt as PlyOutcome;
      } else if (evt.t === "fatal") {
        final = blank(evt.message);
      } else if (evt.t === "transient") {
        final = { ...blank(evt.message), transient: true };
      }
    }
  }
  return final ?? blank("Stream ended without a result.");
}

function blank(fatal: string): PlyOutcome {
  return {
    legal: false,
    san: null,
    error: fatal,
    analysis: "",
    reasoning: "",
    usage: {},
    fatal,
  };
}

export function useMatch() {
  const chessRef = useRef(new Chess());
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [fen, setFen] = useState(() => new Chess().fen());
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [status, setStatus] = useState<MatchStatus>("idle");
  const [live, setLive] = useState<LiveThought | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string>("—");
  const [players, setPlayers] = useState<Players>({
    w: DEFAULT_WHITE,
    b: DEFAULT_BLACK,
  });
  const [mode, setMode] = useState<Mode>("assisted");
  const [promptVersion, setPromptVersion] =
    useState<PromptVersion>(DEFAULT_PROMPT_VERSION);
  const [moveDelayMs, setMoveDelayMs] = useState(1200);
  const [isRunning, setIsRunning] = useState(false);

  /** Single place that flips the loop flag, so the ref and the UI never drift. */
  const setRunning = useCallback((on: boolean) => {
    runningRef.current = on;
    setIsRunning(on);
  }, []);

  // The async match loop reads settings that may change mid-game, so they are
  // mirrored into refs. Done in an effect rather than during render.
  const playersRef = useRef(players);
  const modeRef = useRef(mode);
  const promptRef = useRef(promptVersion);
  const delayRef = useRef(moveDelayMs);
  useEffect(() => {
    playersRef.current = players;
    modeRef.current = mode;
    promptRef.current = promptVersion;
    delayRef.current = moveDelayMs;
  }, [players, mode, promptVersion, moveDelayMs]);

  /** Lets the engine hook backfill eval data onto an already-played move. */
  const patchMove = useCallback((ply: number, patch: Partial<MoveRecord>) => {
    setMoves((prev) =>
      prev.map((m) => (m.ply === ply ? { ...m, ...patch } : m)),
    );
  }, []);

  /** Plays exactly one ply, retrying the model on illegal moves. */
  const playOne = useCallback(async (): Promise<boolean> => {
    const chess = chessRef.current;
    if (chess.isGameOver() || chess.history().length >= MAX_PLIES) return false;

    const color: Color = chess.turn();
    const modelId = playersRef.current[color];
    const fenBefore = chess.fen();
    const historyBefore = chess.history();
    const startedAt = Date.now();

    abortRef.current = new AbortController();
    setStatus("thinking");
    setError(null);

    const rejected: { san: string; reason: string }[] = [];
    let analysis = "";
    let reasoning = "";
    let usage: Usage = {};
    let evalClaim: number | null | undefined;
    let promptMeta: { version?: string; hash?: string } = {};
    let chosen: string | null = null;
    let forced = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let textAcc = "";
      let reasonAcc = "";
      setLive({
        color,
        modelId,
        analysis: "",
        reasoning: "",
        attempt,
        startedAt: Date.now(),
        candidates: [],
      });

      // One shared delta handler so the panel streams on the first attempt and
      // on every rate-limit retry alike. Deltas are accumulated cheaply and the
      // React state is flushed on a timer -- a reasoning model emits thousands
      // of tokens per ply, and re-rendering on each one starves the loop.
      const legal = legalSet(fenBefore);
      let lastFlush = 0;
      let queued: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        lastFlush = Date.now();
        queued = null;
        setLive(
          (prev) =>
            prev && {
              ...prev,
              analysis: textAcc
                .split(/##\s*Move/i)[0]
                .replace(/^\s*##\s*Analysis\s*/i, ""),
              reasoning: reasonAcc,
              candidates: candidatesInText(
                fenBefore,
                textAcc + reasonAcc,
                legal,
              ).slice(0, 4),
            },
        );
      };

      const onDelta = (kind: "text" | "reasoning", v: string) => {
        if (kind === "text") textAcc += v;
        else reasonAcc += v;
        const since = Date.now() - lastFlush;
        if (since >= FLUSH_MS) flush();
        else if (!queued) queued = setTimeout(flush, FLUSH_MS - since);
      };

      const call = () => {
        textAcc = "";
        reasonAcc = "";
        if (isDemo(modelId)) {
          return runDemoPly(
            fenBefore,
            rejected.length,
            onDelta,
            abortRef.current!.signal,
          );
        }
        return streamPly(
          {
            modelId,
            fen: fenBefore,
            mode: modeRef.current,
            history: historyBefore,
            promptVersion: promptRef.current,
            rejected,
          },
          abortRef.current!.signal,
          onDelta,
        );
      };

      let out = await call();

      // Rate limits are expected in a long match: back off and retry the same
      // ply rather than ending the game.
      for (let t = 0; out.transient && t < MAX_TRANSIENT; t++) {
        const waitMs = Math.min(30000, 2000 * 2 ** t);
        setError(`Rate limited — retrying in ${Math.round(waitMs / 1000)}s…`);
        await new Promise((r) => setTimeout(r, waitMs));
        out = await call();
      }
      if (queued) clearTimeout(queued);
      flush();
      if (!out.transient) setError(null);

      analysis = out.analysis || textAcc;
      reasoning = out.reasoning || reasonAcc;
      usage = out.usage ?? {};
      evalClaim = out.evalClaim;
      promptMeta = { version: out.promptVersion, hash: out.promptHash };

      if (out.fatal) {
        setError(out.fatal);
        setStatus("error");
        runningRef.current = false;
        setLive(null);
        return false;
      }
      if (out.legal && out.san) {
        chosen = out.san;
        break;
      }
      rejected.push({
        san: out.san ?? "(no move)",
        reason: out.error ?? "Unparseable response.",
      });
    }

    if (!chosen) {
      chosen = randomLegalMove(fenBefore);
      forced = true;
    }

    chess.move(chosen);
    const record: MoveRecord = {
      ply: chess.history().length,
      moveNumber: Math.ceil(chess.history().length / 2),
      color,
      san: chosen,
      modelId,
      fenBefore,
      fenAfter: chess.fen(),
      analysis: analysis.trim(),
      reasoning: reasoning.trim(),
      illegalAttempts: rejected.map((r) => r.san),
      retries: rejected.length,
      forced,
      thinkMs: Date.now() - startedAt,
      usage,
      evalClaim,
      promptVersion: promptMeta.version,
      promptHash: promptMeta.hash,
    };

    setMoves((prev) => [...prev, record]);
    setFen(chess.fen());
    setLive(null);

    const done = outcomeOf(chess, chess.history().length >= MAX_PLIES);
    if (done) {
      setOutcome(done);
      setStatus("finished");
      setRunning(false);
      return false;
    }
    setStatus(runningRef.current ? "thinking" : "paused");
    return true;
  }, [setRunning]);

  const loop = useCallback(async () => {
    while (runningRef.current) {
      const more = await playOne();
      if (!more) break;
      if (delayRef.current > 0) {
        await new Promise((r) => setTimeout(r, delayRef.current));
      }
    }
    setRunning(false);
    setStatus((s) => (s === "thinking" ? "paused" : s));
  }, [playOne, setRunning]);

  /** Replays a real master game with scripted commentary and zero API calls. */
  const startDemo = useCallback(() => {
    setRunning(false);
    abortRef.current?.abort();

    const chess = new Chess();
    chessRef.current = chess;
    const demoPlayers: Players = { w: "demo/alpha", b: "demo/beta" };
    playersRef.current = demoPlayers;
    setPlayers(demoPlayers);
    setOpening("Opera Game · Morphy 1858");
    setFen(chess.fen());
    setMoves([]);
    setOutcome(null);
    setLive(null);
    setError(null);
    setStatus("thinking");

    setRunning(true);
    void loop();
  }, [loop, setRunning]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    setRunning(true);
    void loop();
  }, [loop, setRunning]);

  const pause = useCallback(() => {
    setRunning(false);
    setStatus((s) => (s === "thinking" ? "paused" : s));
  }, [setRunning]);

  const step = useCallback(() => {
    if (runningRef.current) return;
    void playOne();
  }, [playOne]);

  const reset = useCallback((seedOpening = true) => {
    setRunning(false);
    abortRef.current?.abort();

    const chess = new Chess();
    let name = "—";
    const seeded: MoveRecord[] = [];
    if (seedOpening) {
      const book = OPENING_BOOK[Math.floor(Math.random() * OPENING_BOOK.length)];
      for (const san of book.moves) {
        const fenBefore = chess.fen();
        const color = chess.turn() as Color;
        chess.move(san);
        seeded.push({
          ply: chess.history().length,
          moveNumber: Math.ceil(chess.history().length / 2),
          color,
          san,
          modelId: "book",
          fenBefore,
          fenAfter: chess.fen(),
          analysis: "",
          reasoning: "",
          illegalAttempts: [],
          retries: 0,
          forced: false,
          book: true,
          thinkMs: 0,
          usage: {},
        });
      }
      name = book.name;
    }
    chessRef.current = chess;
    setOpening(name);
    setFen(chess.fen());
    setMoves(seeded);
    setOutcome(null);
    setLive(null);
    setError(null);
    setStatus("idle");
  }, [setRunning]);

  return {
    fen,
    moves,
    status,
    live,
    outcome,
    error,
    opening,
    players,
    mode,
    promptVersion,
    setPromptVersion,
    moveDelayMs,
    isRunning,
    // Derived from the FEN rather than read off the ref, so it re-renders.
    turn: (fen.split(" ")[1] ?? "w") as Color,
    setPlayers,
    setMode,
    setMoveDelayMs,
    start,
    startDemo,
    isDemoMatch: isDemo(players.w) || isDemo(players.b),
    pause,
    step,
    reset,
    patchMove,
  };
}
