"""Core hydride segmentation utilities."""

from .analysis import analyze_mask, combined_panel, compute_metrics
from .conventional import ConventionalParams, SegmentationOutput, segment_conventional
from .ml import MlModelSpec, MlModelError, MlUnavailableError, ml_available, ml_import_error, segment_ml
from .image_io import decode_image

__all__ = [
    "ConventionalParams",
    "SegmentationOutput",
    "segment_conventional",
    "MlModelSpec",
    "MlModelError",
    "MlUnavailableError",
    "ml_available",
    "ml_import_error",
    "segment_ml",
    "analyze_mask",
    "combined_panel",
    "compute_metrics",
    "decode_image",
]
