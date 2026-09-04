"""Locate an eye ROI in a full-face frame (webcam-style input).

Not needed for close-up VOG/VNG goggle footage where the frame already
*is* the eye (see pipeline.py mode="closeup") -- this is only for the
"face" / "auto" pipeline modes.
"""
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

Box = Tuple[int, int, int, int]  # x, y, w, h

# Recent opencv-python(-contrib) wheels no longer bundle the Haar cascade
# XML files under cv2.data (cv2.data.haarcascades resolves to an empty
# dir), so we ship our own copy under models/ -- see
# scripts/download_models.py.
_BUNDLED_CASCADE_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "haarcascade_eye.xml"


class EyeLocalizer:
    """Haar-cascade eye detector with simple frame-to-frame stabilization.

    Fallback used when MediaPipe's face landmarker isn't available or
    doesn't find a face.
    """

    def __init__(self, cascade_path: Optional[str] = None) -> None:
        candidates = [cascade_path] if cascade_path else []
        candidates += [str(_BUNDLED_CASCADE_PATH), cv2.data.haarcascades + "haarcascade_eye.xml"]

        self._cascade = None
        tried = []
        for path in candidates:
            if not path or not Path(path).exists():
                tried.append(path)
                continue
            cascade = cv2.CascadeClassifier(path)
            if not cascade.empty():
                self._cascade = cascade
                break
            tried.append(path)

        if self._cascade is None:
            raise RuntimeError(
                "Failed to load a Haar eye cascade. Tried: "
                f"{tried}. Run `python scripts/download_models.py` to fetch one."
            )
        self._last_box: Optional[Box] = None

    def locate(self, gray: np.ndarray) -> Optional[Box]:
        eyes = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=6, minSize=(30, 20)
        )
        if len(eyes) == 0:
            self._last_box = None
            return None

        if self._last_box is not None:
            lx, ly, lw, lh = self._last_box
            last_center = (lx + lw / 2, ly + lh / 2)
            box = min(
                eyes,
                key=lambda b: (b[0] + b[2] / 2 - last_center[0]) ** 2
                + (b[1] + b[3] / 2 - last_center[1]) ** 2,
            )
        else:
            box = max(eyes, key=lambda b: b[2] * b[3])

        self._last_box = tuple(int(v) for v in box)
        return self._last_box

    def reset(self) -> None:
        self._last_box = None
