"""Image IO helpers for hydride segmentation core."""

from __future__ import annotations

import base64
from io import BytesIO
from typing import Tuple

import numpy as np
from PIL import Image


def decode_image(data: bytes) -> np.ndarray:
    image = Image.open(BytesIO(data))
    return np.array(image.convert("L"))


def image_to_png_base64(image: Image.Image) -> str:
    buf = BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


__all__ = ["decode_image", "image_to_png_base64"]
