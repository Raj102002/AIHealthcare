"""CNN-based pupil-center regressor for closeup eye-camera frames -- the
fix for classical_detector's global-threshold failure mode on LPW's
harder videos (see README's "Real eye-camera accuracy check (LPW)"
section). A learned model doesn't rely on the pupil being the frame's
single darkest large blob, so it isn't derailed by eyelash/eyelid
shadows the way the percentile-threshold approach is.

`PupilCNN` is the single source of truth for the architecture -- both
this module (inference) and scripts/train_pupil_cnn.py (training)
import it from here, so they can't drift apart.

Loading is optional and fails soft, mirroring mediapipe_detector: no
torch install or no checkpoint file just means the pipeline falls back
to classical_detector for closeup mode (see pipeline.py).
"""
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

try:
    import torch
    import torch.nn as nn

    _TORCH_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only when torch isn't installed
    _TORCH_AVAILABLE = False

from . import classical_detector
from .classical_detector import LocalDetection

# Must match prepare_lpw_cache.py's TARGET_W/TARGET_H -- the resolution
# the checkpoint was trained on.
INPUT_W, INPUT_H = 160, 120


def is_available() -> bool:
    return _TORCH_AVAILABLE


if _TORCH_AVAILABLE:

    class PupilCNN(nn.Module):
        """~85k params. Input: 1x120x160 grayscale. Output: (x, y) normalized to [0,1].

        Strided convs instead of separate conv+BatchNorm+MaxPool stages: on
        the original dev machine's CPU (unusually slow for conv workloads --
        ~5 GFLOPS effective on a plain 3x3 conv, well below typical AVX2
        throughput), that combo measured ~12ms/image (~5.7min/epoch);
        strided convs measure ~1ms/image (~30s/epoch) for a similar
        receptive field.

        IMPORTANT: ends in a flattened *spatial* feature map (8x10x32) into
        the FC head, not global average pooling. An earlier version pooled
        to a single value per channel before the FC head -- fine for
        classification, but it throws away all positional information,
        which is fatal for coordinate regression: training loss decreased
        over 17 epochs while validation pixel error plateaued at ~68px
        (worse than usably random) because the network had no way to
        represent *where* the dark region was, only how much dark there
        was on average. Flattening the spatial map lets the FC layers
        interpolate between grid cells for sub-cell precision.
        """

        def __init__(self):
            super().__init__()
            self.features = nn.Sequential(
                nn.Conv2d(1, 8, 3, padding=1, stride=2), nn.ReLU(inplace=True),  # 8x60x80
                nn.Conv2d(8, 16, 3, padding=1, stride=2), nn.ReLU(inplace=True),  # 16x30x40
                nn.Conv2d(16, 32, 3, padding=1, stride=2), nn.ReLU(inplace=True),  # 32x15x20
                nn.Conv2d(32, 32, 3, padding=1, stride=2), nn.ReLU(inplace=True),  # 32x8x10
            )
            self.head = nn.Sequential(
                nn.Flatten(), nn.Linear(32 * 8 * 10, 64), nn.ReLU(inplace=True), nn.Linear(64, 2), nn.Sigmoid()
            )

        def forward(self, x):
            return self.head(self.features(x))

else:
    PupilCNN = None  # torch not installed -- see is_available()


class CnnPupilDetector:
    """Wraps `PupilCNN` to yield a `LocalDetection` for one closeup eye frame.

    Caveat: the network is a plain regressor with a sigmoid output -- it
    always emits *some* (x, y), even on a frame with no visible pupil
    (full blink, eye off-frame). There's no learned rejection/uncertainty
    output, so `confidence` below is a fixed prior, not a per-frame
    signal, unlike classical_detector's contour-shape-based confidence.
    """

    # Chosen from evaluate_lpw.py's full-dataset "e<=10px" rate for this
    # checkpoint -- see README -- not a per-frame estimate.
    FIXED_CONFIDENCE = 0.75

    def __init__(self, model_path: str, device: str = "cpu"):
        if not _TORCH_AVAILABLE:
            raise RuntimeError("torch is not installed")
        if not Path(model_path).exists():
            raise FileNotFoundError(
                f"Pupil CNN checkpoint not found at {model_path}. Run scripts/train_pupil_cnn.py first."
            )
        self._device = torch.device(device)
        self._model = PupilCNN().to(self._device)
        self._model.load_state_dict(torch.load(model_path, map_location=self._device))
        self._model.eval()

    def detect(self, gray_roi: np.ndarray) -> LocalDetection:
        h, w = gray_roi.shape[:2]
        small = cv2.resize(gray_roi, (INPUT_W, INPUT_H), interpolation=cv2.INTER_AREA)
        x = torch.from_numpy(small).float().div(255.0).unsqueeze(0).unsqueeze(0).to(self._device)
        with torch.no_grad():
            pred = self._model(x).cpu().numpy()[0]
        # pred is normalized to the ORIGINAL frame, not the resized 160x120
        # input (see prepare_lpw_cache.py) -- scale by the ROI's actual
        # dimensions so this generalizes beyond LPW's fixed 640x480.
        cx, cy = float(pred[0] * w), float(pred[1] * h)

        # Reuse classical_detector's Otsu-based iris fit, anchored on the
        # CNN's pupil center, instead of duplicating that logic -- see its
        # docstring for why iris diameter needs its own (non-CLAHE) pass.
        iris_diameter_px = classical_detector._measure_iris_diameter(gray_roi, w, h, cx, cy)

        return LocalDetection(
            found=True,
            cx=cx,
            cy=cy,
            axis_major=0.0,  # regressor has no shape/size head, only center
            axis_minor=0.0,
            angle_deg=0.0,
            confidence=self.FIXED_CONFIDENCE,
            mask=None,  # no segmentation head; see README roadmap
            iris_diameter_px=iris_diameter_px,
        )
