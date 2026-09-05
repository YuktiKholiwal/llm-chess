import type { Color, MoveRecord } from "./types";

/**
 * What the arena shows when a past move is selected.
 *
 * Selecting a ply rewinds the whole page to that moment -- board, evaluation,
 * both analysis panels and both scorecards. One rule applied everywhere is
 * explainable; a board that rewinds beside a scorecard that does not is just
 * confusing.
 *
 * All of it is derived, never stored: every field below already exists on the
 * move records the match loop writes.
 */

export type ReviewView = {
  /** The ply under inspection, or null when following the live game. */
  ply: number | null;
  /** Position to put on the board. */
  fen: string;
  /** The move that produced that position, and the subject of the inspector. */
  move: MoveRecord | null;
  /** Engine evaluation of the position, centipawns from White. */
  cp: number;
  /** Moves up to and including it — every panel is derived from this slice. */
  through: MoveRecord[];
};

/**
 * Stockfish grades asynchronously and lags the game, so the newest move often
 * carries no evaluation yet. Falling back to the last graded one holds the bar
 * steady instead of dropping it to level for a moment.
 */
function lastEval(moves: MoveRecord[]): number {
  for (let i = moves.length - 1; i >= 0; i--) {
    const cp = moves[i].evalAfter;
    if (typeof cp === "number") return cp;
  }
  return 0;
}

export function reviewAt(
  moves: MoveRecord[],
  ply: number | null,
  liveFen: string,
): ReviewView {
  const i = ply === null ? -1 : moves.findIndex((m) => m.ply === ply);

  // A selection can outlive the moves it pointed at, because resetting the
  // match empties the list. Falling back to live beats blanking the board.
  if (i === -1) {
    return {
      ply: null,
      fen: liveFen,
      move: moves.at(-1) ?? null,
      cp: lastEval(moves),
      through: moves,
    };
  }

  const through = moves.slice(0, i + 1);
  return {
    ply: moves[i].ply,
    fen: moves[i].fenAfter,
    move: moves[i],
    cp: lastEval(through),
    through,
  };
}

/** That side's most recent move at or before the reviewed ply. */
export function lastByColor(
  through: MoveRecord[],
  color: Color,
): MoveRecord | null {
  for (let i = through.length - 1; i >= 0; i--) {
    if (through[i].color === color) return through[i];
  }
  return null;
}

/**
 * The ply reached by stepping `delta` moves through the list.
 *
 * Stepping back from the live game opens the inspector on the final move: the
 * board does not move, so nothing appears to happen except that the move just
 * played becomes readable. Stepping past the end returns to live.
 */
export function stepPly(
  moves: MoveRecord[],
  current: number | null,
  delta: number,
): number | null {
  if (moves.length === 0) return null;
  if (current === null) return delta < 0 ? moves[moves.length - 1].ply : null;

  const i = moves.findIndex((m) => m.ply === current);
  if (i === -1) return null;

  const next = i + delta;
  if (next < 0) return moves[0].ply;
  if (next >= moves.length) return null;
  return moves[next].ply;
}
