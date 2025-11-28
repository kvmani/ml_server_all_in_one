"""Image IO helpers for hydride segmentation core."""

from __future__ import annotations

import base64
from io import BytesIO

import numpy as np
from PIL import Image

MAX_IMAGE_PIXELS = 20_000_000


def decode_image(data: bytes, *, max_pixels: int = MAX_IMAGE_PIXELS) -> np.ndarray:
    image = Image.open(BytesIO(data))
    width, height = image.size
    if width * height > max_pixels:
        raise ValueError("Image exceeds maximum allowed pixels")
    return np.array(image.convert("L"))


def image_to_png_base64(image: Image.Image) -> str:
    buf = BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


__all__ = ["decode_image", "image_to_png_base64"]
