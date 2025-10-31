"""Hydride orientation analysis helpers."""

from __future__ import annotations

from io import BytesIO
from typing import Tuple

import matplotlib
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes
from skimage import measure, morphology

from .image_io import image_to_png_base64

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def orientation_analysis(
    mask: np.ndarray,
) -> Tuple[Image.Image, Image.Image, Image.Image]:
    labels = measure.label(mask > 0)
    orientations = []
    sizes = []
    for i in range(1, labels.max() + 1):
        region = labels == i
        filled = binary_fill_holes(region)
        dilated = morphology.binary_dilation(filled, morphology.disk(1))
        skel = morphology.skeletonize(dilated)
        coords = np.column_stack(np.nonzero(skel))[:, ::-1]
        if len(coords) < 2:
            angle = 0.0
        else:
            cov = np.cov(coords, rowvar=False)
            vals, vecs = np.linalg.eigh(cov)
            vx, vy = vecs[:, np.argmax(vals)]
            angle = np.degrees(np.arctan2(vy, vx)) % 180
            if angle > 90:
                angle = 180 - angle
        orientations.append(float(angle))
        sizes.append(np.sum(region))

    cmap = plt.get_cmap("coolwarm")
    rgb = np.zeros((*labels.shape, 3))
    for i, angle in enumerate(orientations, start=1):
        rgb[labels == i] = cmap(angle / 90)[:3]

    orient_img = _fig_to_image(_plot_orientation_map(rgb))
    size_img = _fig_to_image(
        _plot_histogram(sizes, "Hydride Size Distribution", "Hydride Size (pixels)")
    )
    angle_img = _fig_to_image(
        _plot_histogram(
            orientations, "Hydride Orientation Distribution", "Orientation (deg)"
        )
    )
    return orient_img, size_img, angle_img


def _plot_orientation_map(rgb: np.ndarray):
    fig, ax = plt.subplots()
    ax.imshow(rgb)
    ax.axis("off")
    norm = plt.Normalize(0, 90)
    sm = plt.cm.ScalarMappable(cmap="coolwarm", norm=norm)
    sm.set_array([])
    plt.colorbar(sm, ax=ax, fraction=0.046, pad=0.04, label="Orientation (deg)")
    return fig


def _plot_histogram(data, title: str, xlabel: str):
    fig, ax = plt.subplots()
    ax.hist(data, bins=20, color="dodgerblue", edgecolor="black", alpha=0.8)
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Count")
    return fig


def _fig_to_image(fig) -> Image.Image:
    buf = BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf)


def compute_metrics(mask: np.ndarray) -> dict:
    labels = measure.label(mask > 0)
    area_fraction = float(np.count_nonzero(mask) / mask.size)
    hydride_count = int(labels.max())
    return {
        "mask_area_fraction": area_fraction,
        "hydride_count": hydride_count,
    }


def analyze_mask(mask: np.ndarray, *, return_images: bool = False):
    orient_img, size_img, angle_img = orientation_analysis(mask)
    payload = {
        "orientation_map_png_b64": image_to_png_base64(orient_img),
        "size_histogram_png_b64": image_to_png_base64(size_img),
        "angle_histogram_png_b64": image_to_png_base64(angle_img),
    }
    if return_images:
        return payload, (orient_img, size_img, angle_img)
    return payload


def combined_panel(
    input_img: Image.Image,
    mask_img: Image.Image,
    overlay_img: Image.Image,
    orient_img: Image.Image,
    size_img: Image.Image,
    angle_img: Image.Image,
) -> Image.Image:
    """Create a six-panel figure mirroring the legacy GUI layout."""

    fig, axes = plt.subplots(2, 3, figsize=(15, 10))

    axes[0, 0].imshow(input_img)
    axes[0, 0].set_title("Input")
    axes[0, 0].axis("off")

    axes[0, 1].imshow(mask_img, cmap="gray")
    axes[0, 1].set_title("Predicted Mask")
    axes[0, 1].axis("off")

    axes[0, 2].imshow(overlay_img)
    axes[0, 2].set_title("Overlay")
    axes[0, 2].axis("off")

    axes[1, 0].imshow(orient_img)
    axes[1, 0].set_title("Hydride Orientation")
    axes[1, 0].axis("off")

    axes[1, 1].imshow(size_img)
    axes[1, 1].set_title("Size Distribution")
    axes[1, 1].axis("off")

    axes[1, 2].imshow(angle_img)
    axes[1, 2].set_title("Orientation Distribution")
    axes[1, 2].axis("off")

    plt.tight_layout()
    combined = _fig_to_image(fig)
    return combined
