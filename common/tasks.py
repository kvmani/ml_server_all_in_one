"""Simple synchronous task utilities."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TypeVar


T = TypeVar("T")


def run_in_thread(func: Callable[[], T]) -> T:
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        return future.result()


__all__ = ["run_in_thread"]
