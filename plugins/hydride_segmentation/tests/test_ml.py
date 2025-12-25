import numpy as np
import pytest

torch = pytest.importorskip("torch")
smp = pytest.importorskip("segmentation_models_pytorch")

from plugins.hydride_segmentation.core.ml import MlModelSpec, segment_ml


def test_segment_ml_resizes_to_original_shape(tmp_path):
    model = smp.Unet(
        encoder_name="resnet18",
        encoder_weights=None,
        in_channels=1,
        classes=1,
    )
    weights_path = tmp_path / "dummy_model.pth"
    torch.save(model, weights_path)

    spec = MlModelSpec(
        model_id="dummy",
        label="Dummy",
        file=str(weights_path),
        input_size=256,
        threshold=0.5,
        in_channels=1,
        classes=1,
    )

    image = np.random.randint(0, 255, size=(180, 300), dtype=np.uint8)
    result = segment_ml(image, spec, weights_path=weights_path)

    assert result.mask.shape == image.shape
    assert result.overlay.shape == (image.shape[0], image.shape[1], 3)
    assert result.input_image.shape == image.shape
    assert result.mask.dtype == np.uint8
    assert set(np.unique(result.mask)).issubset({0, 255})
    assert any("Original size" in entry for entry in result.logs)
    assert any("Input resized to" in entry for entry in result.logs)
