import numpy as np

from plugins.hydride_segmentation.core import analyze_mask, compute_metrics


def test_compute_metrics_and_analysis():
    mask = np.zeros((32, 32), dtype=np.uint8)
    mask[8:16, 8:16] = 255
    mask[18:26, 18:26] = 255

    metrics = compute_metrics(mask)
    assert metrics["hydride_count"] == 2
    assert 0 < metrics["mask_area_fraction"] < 1

    analysis, images = analyze_mask(mask, return_images=True)
    assert set(analysis) == {
        "orientation_map_png_b64",
        "size_histogram_png_b64",
        "angle_histogram_png_b64",
    }
    assert len(analysis["orientation_map_png_b64"]) > 10
    assert len(images) == 3
