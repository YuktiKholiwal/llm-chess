"""The one entry point.

    python -m eval run --config config/models.yaml --stage all

Stages run in pipeline order and each reads only the previous stage's file on
disk, so any of them can be run alone against cached input. That is what makes
it possible to rewrite the extractor and rescore without paying to query the
models again.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace

from . import config as config_mod

STAGES = ("tasks", "run", "extract", "verify", "score")


def _dispatch(stage: str, cfg: config_mod.Config, args: argparse.Namespace) -> None:
    # Imported here so a stage that needs no network, engine or key can run in
    # an environment where the others could not.
    if stage == "tasks":
        from .tasks import build

        build.run(cfg, args)
    elif stage == "run":
        from .runner import run as runner

        runner.run(cfg, args)
    elif stage == "extract":
        from .extractor import extract

        extract.run(cfg, args)
    elif stage == "verify":
        from .verifier import verify

        verify.run(cfg, args)
    elif stage == "score":
        from .scorer import report

        report.run(cfg, args)
    else:
        raise SystemExit(f"unknown stage: {stage}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="eval", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run one pipeline stage, or all of them")
    run.add_argument("--config", default="config/models.yaml")
    run.add_argument("--stage", default="all", choices=[*STAGES, "all"])
    run.add_argument(
        "--models",
        default=None,
        help="comma-separated model ids; defaults to every model in the config",
    )
    run.add_argument(
        "--limit",
        type=int,
        default=0,
        help="cap the number of tasks, sampled evenly across rating bands",
    )
    run.add_argument(
        "--max-cost",
        type=float,
        default=None,
        help="USD ceiling for this invocation; overrides limits.max_cost_usd",
    )
    run.add_argument(
        "--force",
        action="store_true",
        help="ignore cached rows and redo the work",
    )
    run.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would be requested without sending anything",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = config_mod.load(args.config)

    if args.max_cost is not None:
        cfg = replace(cfg, limits=replace(cfg.limits, max_cost_usd=args.max_cost))
    if args.models:
        wanted = [m.strip() for m in args.models.split(",") if m.strip()]
        cfg = replace(cfg, models=tuple(cfg.model(m) for m in wanted))

    stages = STAGES if args.stage == "all" else (args.stage,)
    for stage in stages:
        _dispatch(stage, cfg, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
