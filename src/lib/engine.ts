"use client";

export type EngineEval = {
  /** Centipawns, always from White's perspective. */
  cp: number;
  /** Mate distance from White's perspective, or null. */
  mate: number | null;
  /** Best move in UCI (e.g. "e2e4"), or null. */
  best: string | null;
  depth: number;
};

const MATE_CP = 10000;

/**
 * Serialized UCI wrapper around the single-threaded Stockfish 18 lite WASM
 * build. Single-threaded is deliberate: the multi-threaded build needs
 * SharedArrayBuffer, which would force COOP/COEP headers on the whole app.
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker("/stockfish/stockfish-18-lite-single.js");
      } catch (e) {
        reject(e);
        return;
      }
      const onMsg = (e: MessageEvent) => {
        const line = String(e.data ?? "");
        if (line.includes("uciok")) this.send("isready");
        if (line.includes("readyok")) {
          this.worker?.removeEventListener("message", onMsg);
          resolve();
        }
      };
      this.worker.addEventListener("message", onMsg);
      this.worker.addEventListener("error", (e) => reject(e.message));
      this.send("uci");
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  /** Queued so concurrent callers can't interleave UCI commands. */
  analyze(fen: string, depth = 12): Promise<EngineEval> {
    const run = async (): Promise<EngineEval> => {
      await this.boot();
      const whiteToMove = fen.split(" ")[1] === "w";

      return new Promise<EngineEval>((resolve) => {
        let cp = 0;
        let mate: number | null = null;
        let best: string | null = null;
        let seen = 0;

        const onMsg = (e: MessageEvent) => {
          const line = String(e.data ?? "");

          if (line.startsWith("info") && line.includes("score")) {
            const d = /\bdepth (\d+)/.exec(line);
            if (d) seen = Number(d[1]);
            const cpM = /score cp (-?\d+)/.exec(line);
            const mateM = /score mate (-?\d+)/.exec(line);
            if (cpM) {
              cp = Number(cpM[1]);
              mate = null;
            } else if (mateM) {
              mate = Number(mateM[1]);
              cp = mate > 0 ? MATE_CP - mate * 10 : -MATE_CP - mate * 10;
            }
          }

          if (line.startsWith("bestmove")) {
            best = line.split(/\s+/)[1] ?? null;
            if (best === "(none)") best = null;
            this.worker?.removeEventListener("message", onMsg);
            // UCI scores are side-to-move relative; normalise to White.
            const sign = whiteToMove ? 1 : -1;
            resolve({
              cp: cp * sign,
              mate: mate === null ? null : mate * sign,
              best,
              depth: seen,
            });
          }
        };

        this.worker?.addEventListener("message", onMsg);
        this.send("ucinewgame");
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}`);
      });
    };

    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
