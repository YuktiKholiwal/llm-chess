"""Content hashing and per-stage run manifests.

A score is only meaningful relative to the exact inputs that produced it. Every
stage writes a manifest naming its inputs by hash, so any number in RESULTS.md
can be traced back to the task bank, the prompt text and the engine build that
produced it -- and so a changed prompt is visible as a changed hash rather than
as an unexplained shift in the results.
"""

from __future__ import annotations

import hashlib
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import MANIFEST_DIR
from .store import write_json


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def hash_file(path: str | Path) -> str | None:
    path = Path(path)
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:12]


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def git_commit() -> str | None:
    """The commit the run happened at, when the tree is a repo and is clean."""
    try:
        rev = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return f"{rev}-dirty" if dirty else rev
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def write_manifest(stage: str, payload: dict[str, Any]) -> Path:
    path = MANIFEST_DIR / f"{stage}.json"
    write_json(path, {"stage": stage, "finished_at": now(), "commit": git_commit(), **payload})
    return path
