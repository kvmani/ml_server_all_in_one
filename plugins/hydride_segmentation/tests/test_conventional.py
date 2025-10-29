import numpy as np

from plugins.hydride_segmentation.core import ConventionalParams, segment_conventional


def test_segment_conventional_detects_circle():
    image = np.ones((64, 64), dtype=np.uint8) * 255
    rr, cc = np.ogrid[:64, :64]
    mask = (rr - 32) ** 2 + (cc - 32) ** 2 <= 10 ** 2
    image[mask] = 10

    params = ConventionalParams(adaptive_window=15, morph_kernel=(3, 3), area_threshold=5)
    result = segment_conventional(image, params)
    assert result.mask.sum() > 0
    assert result.overlay.shape == (64, 64, 3)
    assert result.logs


def test_segment_conventional_crop_restores_shape():
    image = np.full((40, 20), 200, dtype=np.uint8)
    image[5:18, 5:15] = 40

    params = ConventionalParams(crop=True, crop_percent=50, area_threshold=10)
    result = segment_conventional(image, params)
    assert result.mask.shape == image.shape
    assert np.all(result.mask[20:, :] == 0)


def test_segment_conventional_filters_small_regions():
    image = np.full((32, 32), 220, dtype=np.uint8)
    image[8:10, 8:10] = 10  # very small dark square

    params = ConventionalParams(adaptive_window=9, adaptive_offset=5, area_threshold=50)
    result = segment_conventional(image, params)
    assert result.mask.sum() == 0
