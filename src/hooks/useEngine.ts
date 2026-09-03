"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { StockfishEngine, type EngineEval } from "@/lib/engine";
import { classify } from "@/lib/chess-utils";
import { accuracyForMove, evalError } from "@/lib/accuracy";
import type { MoveRecord } from "@/lib/types";

/**
 * Grades played moves with Stockfish. Positions are cached by FEN because the
 * position after ply N is the position before ply N+1 -- each one is only ever
 * searched once.
 */
export function useEngine(
  moves: MoveRecord[],
  patchMove: (ply: number, patch: Partial<MoveRecord>) => void,
  opts: { enabled: boolean; depth: number },
) {
  const engineRef = useRef<StockfishEngine | null>(null);
  const cacheRef = useRef(new Map<string, EngineEval>());
  const busyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [grading, setGrading] = useState(false);
  const [liveEval, setLiveEval] = useState<number>(0);

  useEffect(() => {
    if (!opts.enabled) return;
    const engine = (engineRef.current ??= new StockfishEngine());
    let alive = true;
    // Report readiness once the worker actually answers, not synchronously on
    // mount -- setState in an effect body causes a cascading render.
    void engine
      .analyze(new Chess().fen(), 1)
      .then(() => alive && setReady(true))
      .catch(() => {});
    return () => {
      alive = false;
      engineRef.current?.terminate();
      engineRef.current = null;
      setReady(false);
    };
  }, [opts.enabled]);

  const evalFen = useCallback(
    async (fen: string): Promise<EngineEval> => {
      const hit = cacheRef.current.get(fen);
      if (hit) return hit;
      const engine = (engineRef.current ??= new StockfishEngine());
      const res = await engine.analyze(fen, opts.depth);
      cacheRef.current.set(fen, res);
      return res;
    },
    [opts.depth],
  );

  useEffect(() => {
    if (!opts.enabled || busyRef.current) return;
    const pending = moves.filter((m) => typeof m.cpLoss !== "number");
    if (!pending.length) return;

    busyRef.current = true;

    (async () => {
      setGrading(true);
      for (const m of pending) {
        try {
          const before = await evalFen(m.fenBefore);
          const after = await evalFen(m.fenAfter);

          // Loss is measured from the mover's point of view.
          const sign = m.color === "w" ? 1 : -1;
          const cpLoss = Math.max(0, (before.cp - after.cp) * sign);

          const legalCount = new Chess(m.fenBefore).moves().length;
          let bestSan: string | undefined;
          if (before.best) {
            const c = new Chess(m.fenBefore);
            const found = c
              .moves({ verbose: true })
              .find(
                (v) =>
                  v.from + v.to + (v.promotion ?? "") === before.best ||
                  v.from + v.to === before.best,
              );
            bestSan = found?.san;
          }

          patchMove(m.ply, {
            evalBefore: before.cp,
            evalAfter: after.cp,
            cpLoss: Math.round(cpLoss),
            bestMove: bestSan,
            quality: classify(cpLoss, legalCount === 1),
            accuracy: accuracyForMove(before.cp, after.cp, m.color),
            // Calibration: the model assessed the position BEFORE moving, so
            // its claim is compared against the engine's read of that position.
            evalErrorPawns:
              typeof m.evalClaim === "number"
                ? evalError(m.evalClaim, before.cp)
                : undefined,
          });
          setLiveEval(after.cp);
        } catch {
          patchMove(m.ply, { cpLoss: 0, quality: "good" });
        }
      }
      busyRef.current = false;
      setGrading(false);
    })();
  }, [moves, opts.enabled, evalFen, patchMove]);

  return { ready, grading, liveEval };
}
