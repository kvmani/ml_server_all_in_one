"""Utilities for parsing PDF page range strings."""

from __future__ import annotations

import re
from typing import List


class PageRangeError(ValueError):
    """Raised when a page range cannot be parsed."""


_RANGE_RE = re.compile(r"^(\d+(?:-\d+)?)(,\d+(?:-\d+)?)*$", re.ASCII)


def parse_page_range(range_str: str | None, total_pages: int) -> List[int]:
    """Return 1-indexed page numbers described by ``range_str``."""

    if not range_str or range_str.lower() == "all":
        return list(range(1, total_pages + 1))

    candidate = range_str.replace(" ", "")
    if not _RANGE_RE.match(candidate):
        raise PageRangeError("Invalid page range format")

    pages: List[int] = []
    for part in candidate.split(","):
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start = int(start_s)
            end = int(end_s)
            if start < 1 or end > total_pages or start > end:
                raise PageRangeError("Invalid page interval")
            pages.extend(range(start, end + 1))
        else:
            page = int(part)
            if page < 1 or page > total_pages:
                raise PageRangeError("Page number out of range")
            pages.append(page)
    return pages


__all__ = ["parse_page_range", "PageRangeError"]
