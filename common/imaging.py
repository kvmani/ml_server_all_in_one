"""Shared imaging helpers."""

from __future__ import annotations

from io import BytesIO
from typing import Tuple

import numpy as np
from PIL import Image


def image_to_bytes(image: Image.Image, format: str = "PNG") -> bytes:
    buf = BytesIO()
    image.save(buf, format=format)
    return buf.getvalue()


def arrays_to_png(image: np.ndarray) -> Tuple[bytes, bytes]:
    rgb = Image.fromarray(image)
    mask = rgb.convert("L")
    return image_to_bytes(rgb), image_to_bytes(mask)


__all__ = ["image_to_bytes", "arrays_to_png"]
