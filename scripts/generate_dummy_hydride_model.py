"""Generate a dummy Hydride UNet model for local testing.

Requires torch and segmentation-models-pytorch to be installed.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a dummy hydride UNet model.")
    parser.add_argument(
        "--output",
        default="model_store/hydride_segmentation/hydride_unet_256_gray_placeholder.pth",
        help="Output .pth path (defaults under model_store).",
    )
    args = parser.parse_args()

    try:
        import segmentation_models_pytorch as smp
        import torch
    except Exception as exc:
        print("Missing dependencies. Install torch (CPU) and segmentation-models-pytorch.")
        print(f"Import error: {exc}")
        return 1

    model = smp.Unet(
        encoder_name="resnet18",
        encoder_weights=None,
        in_channels=1,
        classes=1,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model, output)
    print(f"Saved dummy model to {output}")
    print("Update config.yml to point at this file and disable placeholder=true.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
