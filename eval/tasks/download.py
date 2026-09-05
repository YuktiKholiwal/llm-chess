"""Fetches the Lichess puzzle export.

The file stays compressed on disk. Uncompressed it is several gigabytes, and
the build streams through it exactly once, so materialising it would cost disk
for nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

from ..config import DATA


def puzzle_db_path(url: str) -> Path:
    return DATA / url.rsplit("/", 1)[-1]


def ensure(url: str) -> Path:
    path = puzzle_db_path(url)
    if path.exists() and path.stat().st_size > 0:
        return path

    DATA.mkdir(parents=True, exist_ok=True)
    # Downloaded to a temporary name and moved into place, so an interrupted
    # download cannot leave a truncated file that later looks complete.
    partial = path.with_suffix(path.suffix + ".part")

    print(f"downloading {url}", file=sys.stderr)
    with httpx.stream("GET", url, follow_redirects=True, timeout=60.0) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        written = 0
        with partial.open("wb") as fh:
            for chunk in response.iter_bytes(chunk_size=1 << 20):
                fh.write(chunk)
                written += len(chunk)
                if total:
                    pct = 100 * written / total
                    print(
                        f"\r  {written / 1e6:.0f}MB of {total / 1e6:.0f}MB ({pct:.0f}%)",
                        end="",
                        file=sys.stderr,
                    )
    print("", file=sys.stderr)

    partial.replace(path)
    return path
