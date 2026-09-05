"""Run configuration, loaded once and passed down rather than read globally.

Every number that shapes a score lives in config/models.yaml, so a run can be
described by pointing at that file plus the commit it ran at.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

TASKS_PATH = DATA / "tasks.jsonl"
RUNS_PATH = DATA / "runs.jsonl"
CLAIMS_PATH = DATA / "claims.jsonl"
VERIFIED_PATH = DATA / "verified.jsonl"
RESULTS_PATH = DATA / "results.json"
EXTRACTOR_EVAL_PATH = DATA / "extractor_eval.jsonl"
MANIFEST_DIR = DATA / "manifests"


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    reasoning: dict[str, Any] | None = None


@dataclass(frozen=True)
class ProviderConfig:
    base_url: str
    api_key_env: str


@dataclass(frozen=True)
class EngineConfig:
    path: str
    depth: int
    threads: int
    hash_mb: int


@dataclass(frozen=True)
class Limits:
    max_cost_usd: float
    request_timeout_s: float
    max_transient_retries: int
    abort_after_consecutive_errors: int
    concurrency: int


@dataclass(frozen=True)
class TaskConfig:
    source_url: str
    bands: tuple[int, ...]
    per_band: int
    band_tolerance: int
    max_rating_deviation: int
    min_plays: int
    seed: int


@dataclass(frozen=True)
class Config:
    path: Path
    provider: ProviderConfig
    models: tuple[ModelSpec, ...]
    extractor: ModelSpec
    engine: EngineConfig
    limits: Limits
    tasks: TaskConfig

    def model(self, model_id: str) -> ModelSpec:
        for spec in self.models:
            if spec.id == model_id:
                return spec
        if model_id == self.extractor.id:
            return self.extractor
        raise KeyError(f"{model_id} is not in {self.path}")


def _model(raw: dict[str, Any]) -> ModelSpec:
    return ModelSpec(
        id=raw["id"],
        label=raw.get("label", raw["id"]),
        reasoning=raw.get("reasoning"),
    )


def load(path: str | Path) -> Config:
    path = Path(path)
    raw = yaml.safe_load(path.read_text())

    return Config(
        path=path,
        provider=ProviderConfig(**raw["provider"]),
        models=tuple(_model(m) for m in raw["models"]),
        extractor=_model(raw["extractor"]),
        engine=EngineConfig(**raw["engine"]),
        limits=Limits(**raw["limits"]),
        tasks=TaskConfig(
            **{**raw["tasks"], "bands": tuple(raw["tasks"]["bands"])},
        ),
    )


def api_key(provider: ProviderConfig) -> str:
    """The provider key, from the environment or a .env file.

    Read lazily rather than at import so the stages that touch no model at all
    -- tasks, score -- run without a key present.
    """
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / ".env.local")
    key = os.environ.get(provider.api_key_env, "").strip()
    if not key:
        raise SystemExit(
            f"{provider.api_key_env} is not set.\n"
            f"Add it to .env for {provider.base_url}"
        )
    return key
