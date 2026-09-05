"""Builds the puzzle bank from the Lichess export.

Two properties of the source file drive everything here.

The FEN column is NOT the position the solver sees. Lichess documents it as
"the position before the opponent makes their move"; the puzzle position is
what you get after applying the first move, and the solution begins at the
second. Getting this wrong yields a bank where every task asks the wrong side
to move, and it would look entirely plausible until the solve rates came back
near zero. `to_task` is where that correction happens, and it is tested.

The export also has no puzzle creation date -- its columns are PuzzleId, FEN,
Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl,
OpeningTags, DailyDate, and DailyDate is the day a puzzle was featured, present
for almost none of them. So recency cannot be filtered on, and contamination is
not controlled in this bank. RESULTS.md says so rather than implying otherwise.
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import sys
from dataclasses import dataclass
from typing import Any, Iterator

import chess
import zstandard

from ..config import TASKS_PATH, Config
from ..manifest import hash_file, hash_text, write_manifest
from ..store import write_jsonl
from . import download

# Enough to absorb the rows that fail validation without a second pass over a
# six-million-row file.
OVERSAMPLE = 4


@dataclass(frozen=True)
class Candidate:
    puzzle_id: str
    fen: str
    moves: tuple[str, ...]
    rating: int
    themes: tuple[str, ...]
    band: int


def rows(path) -> Iterator[dict[str, str]]:
    """Streams the compressed export without unpacking it to disk."""
    decompressor = zstandard.ZstdDecompressor()
    with open(path, "rb") as raw, decompressor.stream_reader(raw) as stream:
        text = io.TextIOWrapper(stream, encoding="utf-8", newline="")
        yield from csv.DictReader(text)


def band_for(rating: int, bands: tuple[int, ...], tolerance: int) -> int | None:
    """The band a rating belongs to, or None if it falls between them.

    Bands are separated rather than adjacent on purpose: a 1400 puzzle is not
    evidence about either the 1200 or the 1600 cohort, and forcing it into the
    nearer one would blur exactly the distinction the stratification exists to
    draw.
    """
    nearest = min(bands, key=lambda b: abs(rating - b))
    return nearest if abs(rating - nearest) <= tolerance else None


def select(cfg: Config, path) -> dict[int, list[Candidate]]:
    """Reservoir-samples candidates per band in one pass over the export.

    A prefix of the file would be a sample of whatever ordering Lichess happens
    to export in. Reservoir sampling gives a uniform draw from the whole file
    at fixed memory, and seeding it makes the bank reproducible.
    """
    tc = cfg.tasks
    rng = random.Random(tc.seed)
    want = tc.per_band * OVERSAMPLE
    reservoirs: dict[int, list[Candidate]] = {b: [] for b in tc.bands}
    seen: dict[int, int] = {b: 0 for b in tc.bands}
    scanned = 0

    for row in rows(path):
        scanned += 1
        if scanned % 500_000 == 0:
            print(f"\r  scanned {scanned / 1e6:.1f}M rows", end="", file=sys.stderr)

        try:
            rating = int(row["Rating"])
            deviation = int(row["RatingDeviation"])
            plays = int(row["NbPlays"])
        except (KeyError, ValueError):
            continue

        # A wide deviation means the rating is a guess, and an unplayed puzzle's
        # rating is a prior rather than a measurement. Either way the band label
        # would not mean what the stratification claims it means.
        if deviation > tc.max_rating_deviation or plays < tc.min_plays:
            continue

        band = band_for(rating, tc.bands, tc.band_tolerance)
        if band is None:
            continue

        moves = tuple(row["Moves"].split())
        if len(moves) < 2:
            continue

        candidate = Candidate(
            puzzle_id=row["PuzzleId"],
            fen=row["FEN"],
            moves=moves,
            rating=rating,
            themes=tuple(row["Themes"].split()),
            band=band,
        )

        seen[band] += 1
        reservoir = reservoirs[band]
        if len(reservoir) < want:
            reservoir.append(candidate)
        else:
            j = rng.randrange(seen[band])
            if j < want:
                reservoir[j] = candidate

    print(f"\r  scanned {scanned / 1e6:.2f}M rows", file=sys.stderr)
    return reservoirs


def to_task(candidate: Candidate) -> dict[str, Any] | None:
    """Converts an export row into the position the solver is actually shown.

    Returns None for a row whose moves do not play out legally, which is the
    only validation that matters: everything downstream assumes the FEN and the
    solution belong to the same position.
    """
    board = chess.Board(candidate.fen)

    try:
        setup = chess.Move.from_uci(candidate.moves[0])
    except ValueError:
        return None
    if setup not in board.legal_moves:
        return None
    board.push(setup)

    # The remaining moves alternate solver and opponent. All of them must be
    # legal in sequence, or the row is corrupt.
    probe = board.copy()
    for uci in candidate.moves[1:]:
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            return None
        if move not in probe.legal_moves:
            return None
        probe.push(move)

    return {
        "id": candidate.puzzle_id,
        "fen": board.fen(),
        "side_to_move": "w" if board.turn == chess.WHITE else "b",
        "solution_uci": list(candidate.moves[1:]),
        "rating": candidate.rating,
        "rating_band": candidate.band,
        "themes": list(candidate.themes),
    }


def build(cfg: Config) -> list[dict[str, Any]]:
    path = download.ensure(cfg.tasks.source_url)
    reservoirs = select(cfg, path)

    tasks: list[dict[str, Any]] = []
    short: list[str] = []
    for band in cfg.tasks.bands:
        kept: list[dict[str, Any]] = []
        for candidate in reservoirs[band]:
            task = to_task(candidate)
            if task is not None:
                kept.append(task)
            if len(kept) == cfg.tasks.per_band:
                break
        if len(kept) < cfg.tasks.per_band:
            short.append(f"{band}: {len(kept)} of {cfg.tasks.per_band}")
        tasks.extend(kept)

    if short:
        raise SystemExit(
            "Not enough valid puzzles in some bands: "
            + "; ".join(short)
            + "\nRaise OVERSAMPLE or widen tasks.band_tolerance in the config."
        )
    return tasks


def run(cfg: Config, args: argparse.Namespace) -> None:
    if TASKS_PATH.exists() and not args.force:
        print(f"tasks: {TASKS_PATH} exists; --force to rebuild", file=sys.stderr)
        return

    tasks = build(cfg)
    write_jsonl(TASKS_PATH, tasks)

    themes: dict[str, int] = {}
    for task in tasks:
        for theme in task["themes"]:
            themes[theme] = themes.get(theme, 0) + 1

    write_manifest(
        "tasks",
        {
            "source_url": cfg.tasks.source_url,
            "source_hash": hash_file(download.puzzle_db_path(cfg.tasks.source_url)),
            "bands": list(cfg.tasks.bands),
            "per_band": cfg.tasks.per_band,
            "band_tolerance": cfg.tasks.band_tolerance,
            "max_rating_deviation": cfg.tasks.max_rating_deviation,
            "min_plays": cfg.tasks.min_plays,
            "seed": cfg.tasks.seed,
            "tasks": len(tasks),
            "bank_hash": hash_text("\n".join(t["id"] for t in tasks)),
            # No creation-date column exists in the export, so recency is not
            # filtered and training-data contamination is not controlled.
            "contamination_controlled": False,
        },
    )

    print(f"tasks: {len(tasks)} written to {TASKS_PATH}")
    for band in cfg.tasks.bands:
        n = sum(1 for t in tasks if t["rating_band"] == band)
        white = sum(1 for t in tasks if t["rating_band"] == band and t["side_to_move"] == "w")
        print(f"  {band:<6} n={n:<4} white {white}, black {n - white}")
    top = sorted(themes.items(), key=lambda kv: -kv[1])[:8]
    print("  themes: " + ", ".join(f"{k} {v}" for k, v in top))
