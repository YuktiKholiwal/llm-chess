"""Stockfish, wrapped for the verifier.

Evaluations are cached by FEN and depth. The same positions recur constantly
across models -- every model answering a task is scored against the same
starting position -- and a depth-20 search is by far the most expensive thing
in this stage.

Scores are normalised to White throughout, so a number means the same thing
wherever it is read. Mate is folded into the centipawn scale so the two are
comparable rather than needing a special case at every call site.
"""

from __future__ import annotations

import threading

import chess
import chess.engine

MATE_CP = 10000


def mate_to_cp(mate: int) -> int:
    """Nearer mates score higher, and any mate outscores any material edge."""
    return MATE_CP - mate * 10 if mate > 0 else -MATE_CP - mate * 10


class Engine:
    """A single Stockfish process, serialised across threads.

    UCI is one stateful conversation; two overlapping searches would corrupt
    both. A lock is simpler than a process pool and fast enough, because the
    cache absorbs almost all of the repeat work.
    """

    def __init__(self, path: str, depth: int, threads: int = 1, hash_mb: int = 256):
        self.depth = depth
        self._lock = threading.Lock()
        self._cache: dict[tuple[str, int], dict] = {}
        self._engine = chess.engine.SimpleEngine.popen_uci(path)
        self._engine.configure({"Threads": threads, "Hash": hash_mb})
        self.version = self._engine.id.get("name", "unknown")

    def analyse(self, board: chess.Board, depth: int | None = None) -> dict:
        depth = depth or self.depth
        key = (board.fen(), depth)

        with self._lock:
            hit = self._cache.get(key)
        if hit is not None:
            return hit

        with self._lock:
            info = self._engine.analyse(board, chess.engine.Limit(depth=depth))

        score = info["score"].white()
        mate = score.mate()
        result = {
            "cp": mate_to_cp(mate) if mate is not None else score.score(),
            "mate": mate,
            "best": info.get("pv", [None])[0],
            "depth": depth,
        }

        with self._lock:
            self._cache[key] = result
        return result

    def cp_loss(self, board: chess.Board, move: chess.Move) -> int | None:
        """Centipawns given up by `move` versus the engine's best, never negative.

        Floored at zero because a model cannot be credited for the search here
        being shallower than the one it is measured against.
        """
        if move not in board.legal_moves:
            return None

        mover_sign = 1 if board.turn == chess.WHITE else -1
        before = self.analyse(board)["cp"]

        after_board = board.copy()
        after_board.push(move)
        after = self.analyse(after_board)["cp"]

        return max(0, round((before - after) * mover_sign))

    def mate_distance(self, board: chess.Board, color: chess.Color) -> int | None:
        """Moves to mate for `color`, or None when there is no forced mate."""
        mate = self.analyse(board)["mate"]
        if mate is None:
            return None
        if color == chess.WHITE:
            return mate if mate > 0 else None
        return -mate if mate < 0 else None

    def close(self) -> None:
        with self._lock:
            self._engine.quit()

    def __enter__(self) -> Engine:
        return self

    def __exit__(self, *_) -> None:
        self.close()
