"""Shared fixtures.

The engine is session-scoped because starting Stockfish costs far more than any
search these tests ask of it, and skipped rather than failed when the binary is
absent -- an unavailable engine is a missing tool, not a broken handler.
"""

from __future__ import annotations

import shutil

import pytest

from eval.verifier.engine import Engine


@pytest.fixture(scope="session")
def engine():
    if shutil.which("stockfish") is None:
        pytest.skip("stockfish is not on PATH; see the README for install steps")
    # Shallow on purpose: these positions are mate in one or dead level, and a
    # depth-20 search would only make the suite slow.
    with Engine("stockfish", depth=12) as running:
        yield running
