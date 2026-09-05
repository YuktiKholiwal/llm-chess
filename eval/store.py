"""JSONL is the storage for every stage.

Append-only files are what make the pipeline resumable: a stage reads the keys
already present in its own output, skips that work, and appends the rest. That
is also why nothing here rewrites a file in place except on an explicit request
-- a crash halfway through a run must cost the remaining rows, not the finished
ones.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

Row = dict[str, Any]


def iter_jsonl(path: str | Path) -> Iterator[Row]:
    path = Path(path)
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def read_jsonl(path: str | Path) -> list[Row]:
    return list(iter_jsonl(path))


def append_jsonl(path: str | Path, rows: Row | Iterable[Row]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(rows, dict):
        rows = [rows]
    with path.open("a", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_jsonl(path: str | Path, rows: Iterable[Row]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: str | Path, obj: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def completed_keys(path: str | Path, *fields: str) -> set[tuple[Any, ...]]:
    """Keys already written to an output file, for skipping finished work.

    Rows missing any of the key fields are ignored rather than raising: a
    partially written final line from an interrupted run should cost that one
    row, not the ability to resume at all.
    """
    keys: set[tuple[Any, ...]] = set()
    for row in iter_jsonl(path):
        if all(f in row for f in fields):
            keys.add(tuple(row[f] for f in fields))
    return keys
