"""Conventional image segmentation pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
from skimage import exposure, filters, measure, morphology, util


@dataclass
class SegmentationOutput:
    """Container for the conventional segmentation pipeline output."""

    mask: np.ndarray
    overlay: np.ndarray
    input_image: np.ndarray
    logs: List[str]


@dataclass
class ConventionalParams:
    clahe_clip_limit: float = 2.0
    clahe_tile_grid: tuple[int, int] = (8, 8)
    adaptive_window: int = 13
    adaptive_offset: int = 40
    morph_kernel: tuple[int, int] = (5, 5)
    morph_iters: int = 0
    area_threshold: int = 95
    crop: bool = False
    crop_percent: int = 10


def segment_conventional(image: np.ndarray, params: ConventionalParams) -> SegmentationOutput:
    """Run a CLAHE → adaptive threshold → morphology segmentation pipeline."""

    logs: List[str] = []
    image = np.asarray(image)
    if image.ndim != 2:
        raise ValueError("Conventional pipeline expects a grayscale image")

    height, width = image.shape
    logs.append(f"Input image: {width}×{height} pixels")

    working = image
    crop_line = height
    if params.crop:
        crop_pixels = int(round(height * params.crop_percent / 100))
        crop_pixels = min(max(crop_pixels, 0), height - 1)
        crop_line = height - crop_pixels
        working = image[:crop_line, :]
        logs.append(
            f"Cropping bottom {params.crop_percent}% → using top {crop_line} px"
        )

    img_float = working / 255.0
    clahe = exposure.equalize_adapthist(
        img_float,
        clip_limit=max(params.clahe_clip_limit, 0.01),
        kernel_size=params.clahe_tile_grid,
    )
    clahe_img = util.img_as_ubyte(clahe)
    logs.append(
        "Applied CLAHE "
        f"(clip={params.clahe_clip_limit}, tile={params.clahe_tile_grid[0]}×{params.clahe_tile_grid[1]})"
    )

    block_size = max(int(params.adaptive_window), 3)
    if block_size % 2 == 0:
        block_size += 1
    thresh = filters.threshold_local(
        clahe_img,
        block_size,
        offset=params.adaptive_offset,
    )
    mask = (clahe_img < thresh).astype(np.uint8)
    logs.append(
        f"Adaptive threshold with window={block_size} offset={params.adaptive_offset}"
    )

    selem = morphology.rectangle(
        max(params.morph_kernel[0], 1), max(params.morph_kernel[1], 1)
    )
    mask_bool = mask.astype(bool)
    for _ in range(max(params.morph_iters, 0)):
        mask_bool = morphology.binary_closing(mask_bool, selem)
    logs.append(
        f"Morphological closing kernel={params.morph_kernel} iterations={params.morph_iters}"
    )

    if params.area_threshold > 1:
        before = int(mask_bool.sum())
        mask_bool = morphology.remove_small_objects(mask_bool, params.area_threshold)
        after = int(mask_bool.sum())
        logs.append(
            f"Removed components smaller than {params.area_threshold} px (kept {after} of {before})"
        )

    cropped_mask = (mask_bool.astype(np.uint8)) * 255
    full_mask = np.zeros_like(image, dtype=np.uint8)
    full_mask[:crop_line, :] = cropped_mask

    mask_labels = measure.label(mask_bool)
    logs.append(f"Detected {int(mask_labels.max())} connected hydride regions")

    overlay = np.stack([image] * 3, axis=-1)
    edges = morphology.binary_dilation(full_mask > 0) ^ (full_mask > 0)
    overlay[edges] = [255, 0, 0]

    return SegmentationOutput(
        mask=full_mask,
        overlay=overlay,
        input_image=image,
        logs=logs,
    )
