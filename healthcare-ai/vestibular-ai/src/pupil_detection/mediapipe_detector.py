"""MediaPipe FaceLandmarker-based iris/pupil detector.

Primary detector for webcam-style ("face") input: MediaPipe's landmarker
is trained to be robust to lighting, most glasses, and moderate head
pose -- exactly the robustness the Stage 1 spec asks for. The pipeline
falls back to `classical_detector` when no model file is available or
no face is found in a frame (see pipeline.py).

Landmark indices (478-point face mesh w/ iris refinement, fixed by the
model, not configurable):
  right eye iris center=468, ring=469-472
  left  eye iris center=473, ring=474-477
  6-point eye-aspect-ratio landmarks below are the standard set used
  across MediaPipe blink-detection references.
"""
from pathlib import Path
from typing import Sequence

import numpy as np

try:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

    _MEDIAPIPE_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only when mediapipe isn't installed
    _MEDIAPIPE_AVAILABLE = False

from .classical_detector import LocalDetection

_EYES = {
    "right": {"center": 468, "ring": (469, 470, 471, 472), "ear": (33, 160, 158, 133, 153, 144)},
    "left": {"center": 473, "ring": (474, 475, 476, 477), "ear": (362, 385, 387, 263, 373, 380)},
}


def is_available() -> bool:
    return _MEDIAPIPE_AVAILABLE


def _eye_aspect_ratio(landmarks: Sequence, idx: Sequence[int]) -> float:
    p1, p2, p3, p4, p5, p6 = (landmarks[i] for i in idx)

    def d(a, b) -> float:
        return float(np.hypot(a.x - b.x, a.y - b.y))

    vertical = d(p2, p6) + d(p3, p5)
    horizontal = 2 * d(p1, p4)
    return vertical / horizontal if horizontal else 0.0


class MediaPipeIrisDetector:
    """Wraps FaceLandmarker (Tasks API) to yield a pupil-center estimate for one eye."""

    BLINK_EAR_THRESHOLD = 0.17

    def __init__(self, model_path: str, eye: str = "right", num_faces: int = 1):
        if not _MEDIAPIPE_AVAILABLE:
            raise RuntimeError("mediapipe is not installed")
        if eye not in _EYES:
            raise ValueError(f"eye must be one of {list(_EYES)}")
        if not Path(model_path).exists():
            raise FileNotFoundError(
                f"MediaPipe face landmarker model not found at {model_path}. "
                "Run `python scripts/download_models.py` first."
            )
        self._eye = eye
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.VIDEO,
            num_faces=num_faces,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: int) -> LocalDetection:
        h, w = frame_bgr.shape[:2]
        rgb = np.ascontiguousarray(frame_bgr[:, :, ::-1])
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
        if not result.face_landmarks:
            return LocalDetection(found=False)

        landmarks = result.face_landmarks[0]
        spec = _EYES[self._eye]

        ear = _eye_aspect_ratio(landmarks, spec["ear"])
        if ear < self.BLINK_EAR_THRESHOLD:
            return LocalDetection(found=False)  # blink / eye closed

        center = landmarks[spec["center"]]
        cx, cy = center.x * w, center.y * h
        ring_pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in spec["ring"]])
        ring_radii = np.linalg.norm(ring_pts - [cx, cy], axis=1)
        radius = max(float(np.mean(ring_radii)), 1.0)

        # The Tasks API doesn't expose a per-landmark confidence, so derive a
        # proxy from iris-ring symmetry (occlusion/motion blur distorts it)
        # and eye openness.
        symmetry = 1.0 - float(np.clip(np.std(ring_radii) / radius, 0.0, 1.0))
        openness = float(np.clip(ear / 0.3, 0.0, 1.0))
        confidence = float(np.clip(0.6 * symmetry + 0.4 * openness, 0.0, 1.0))

        return LocalDetection(
            found=True,
            cx=float(cx),
            cy=float(cy),
            axis_major=2 * radius,
            axis_minor=2 * radius,
            angle_deg=0.0,
            confidence=confidence,
            mask=None,  # pixel-accurate mask needs a trained segmentation model; see README roadmap
            # MediaPipe's landmarks trace the iris boundary (not the pupil,
            # which it doesn't localize separately), so this ring measurement
            # doubles as the calibration-reference diameter -- see
            # classical_detector.LocalDetection.iris_diameter_px.
            iris_diameter_px=2 * radius,
        )

    def close(self) -> None:
        self._landmarker.close()
