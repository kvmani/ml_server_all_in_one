"""Command line interface for the Tabular ML plugin."""

from __future__ import annotations

import argparse
import json
from typing import Any

from .backend.schemas import PreprocessRequest, TrainRequest
from .backend.services import (
    dataset_list,
    dataset_load_from_key,
    run_evaluate,
    run_preprocess,
    run_train,
)


def _print(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def command_datasets(args: argparse.Namespace) -> None:
    if args.action == "list":
        _print(dataset_list())
    elif args.action == "preview":
        meta = dataset_load_from_key(args.key)
        _print({"session_id": meta["session_id"], "preview": meta["head"]})
    else:  # pragma: no cover - argparse guards
        raise SystemExit(f"Unknown datasets action: {args.action}")


def command_train(args: argparse.Namespace) -> None:
    meta = dataset_load_from_key(args.key)
    session_id = meta["session_id"]
    preprocess = PreprocessRequest(session_id=session_id, target=args.target)
    run_preprocess(preprocess)
    train_request = TrainRequest(session_id=session_id, algo=args.algo, cv=args.cv)
    result = run_train(train_request)
    _print(result)


def command_evaluate(args: argparse.Namespace) -> None:
    _print(run_evaluate(args.run_id))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tabular ML CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    datasets_parser = subparsers.add_parser("datasets", help="Dataset utilities")
    datasets_sub = datasets_parser.add_subparsers(dest="action", required=True)
    datasets_sub.add_parser("list", help="List bundled datasets")
    preview_parser = datasets_sub.add_parser("preview", help="Preview a bundled dataset")
    preview_parser.add_argument("--key", required=True, help="Dataset key (e.g. titanic)")
    datasets_parser.set_defaults(func=command_datasets)

    train_parser = subparsers.add_parser("train", help="Train a model on a dataset")
    train_parser.add_argument("--key", required=True, help="Dataset key")
    train_parser.add_argument("--target", required=True, help="Target column")
    train_parser.add_argument("--algo", default="logreg", choices=["logreg", "rf", "mlp"], help="Algorithm")
    train_parser.add_argument("--cv", type=int, default=3, help="Cross-validation folds")
    train_parser.set_defaults(func=command_train)

    evaluate_parser = subparsers.add_parser("evaluate", help="Inspect a training run")
    evaluate_parser.add_argument("--run-id", dest="run_id", required=True, help="Run identifier")
    evaluate_parser.set_defaults(func=command_evaluate)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
