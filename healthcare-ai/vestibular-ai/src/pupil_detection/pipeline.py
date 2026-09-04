"""Stage 1 orchestrator: video in, pupil trajectory + QA artifacts out.

Detector selection per frame:
  mode="closeup"  -> classical detector runs on the full frame (the frame
                      already *is* the eye, as in VOG/VNG goggle footage).
  mode="face"     -> MediaPipe FaceLandmarker if a model was supplied and
                      loads, else Haar-cascade eye ROI + classical detector.
  mode="auto"     -> starts in "face" behavior; if no face is found for
                      `closeup_fallback_frames` in a row, permanently
                      switches to "closeup" behavior for the rest of the
                      video (handles goggle footage without being told).
"""
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
import pandas as pd

from . import classical_detector, cnn_detector, mediapipe_detector, preprocessing
from .classical_detector import LocalDetection
from .eye_localizer import EyeLocalizer
from .tracker import PupilTracker
from .types import PupilDetection
from .visualize import AnnotatedVideoWriter, draw_overlay

VALID_MODES = ("closeup", "face", "auto")


class PupilDetectionPipeline:
    def __init__(
        self,
        mode: str = "auto",
        eye: str = "right",
        model_path: Optional[str] = None,
        pupil_cnn_path: Optional[str] = None,
        save_masks: bool = False,
        closeup_fallback_frames: int = 30,
    ):
        if mode not in VALID_MODES:
            raise ValueError(f"mode must be one of {VALID_MODES}")
        self.mode = mode
        self.eye = eye
        self.save_masks = save_masks
        self._closeup_fallback_frames = closeup_fallback_frames
        self._forced_closeup = mode == "closeup"

        self._eye_localizer = EyeLocalizer() if mode in ("face", "auto") else None

        self._mp_detector = None
        if mode in ("face", "auto") and model_path and mediapipe_detector.is_available():
            try:
                self._mp_detector = mediapipe_detector.MediaPipeIrisDetector(model_path, eye=eye)
            except (FileNotFoundError, RuntimeError):
                self._mp_detector = None  # fall back silently to Haar + classical

        # Closeup-mode only: the checkpoint is trained on LPW's full
        # 640x480 eye-camera frames, not on face-mode's cropped eye ROI,
        # so it isn't used for the face/auto Haar-fallback path -- see
        # cnn_detector.py.
        self._cnn_detector = None
        if pupil_cnn_path and cnn_detector.is_available():
            try:
                self._cnn_detector = cnn_detector.CnnPupilDetector(pupil_cnn_path)
            except (FileNotFoundError, RuntimeError):
                self._cnn_detector = None  # fall back silently to classical_detector

        self._tracker = PupilTracker()
        self._consecutive_no_face = 0

    def _detect_frame(self, frame_bgr: np.ndarray, gray: np.ndarray, frame_idx: int, timestamp_ms: int) -> PupilDetection:
        local: LocalDetection
        method: str
        offset: Tuple[int, int] = (0, 0)

        if not self._forced_closeup and self._mp_detector is not None:
            local = self._mp_detector.detect(frame_bgr, timestamp_ms)
            method = "mediapipe"
            if local.found:
                self._consecutive_no_face = 0
            else:
                self._consecutive_no_face += 1
                if self.mode == "auto" and self._consecutive_no_face >= self._closeup_fallback_frames:
                    self._forced_closeup = True
        elif self._forced_closeup or self.mode == "closeup":
            if self._cnn_detector is not None:
                local = self._cnn_detector.detect(gray)
                method = "cnn"
            else:
                local = classical_detector.detect_pupil(gray)
                method = "classical"
        else:
            box = self._eye_localizer.locate(gray) if self._eye_localizer else None
            if box is None:
                local = LocalDetection(found=False)
                method = "classical"
            else:
                x, y, w, h = box
                roi = gray[y : y + h, x : x + w]
                local = classical_detector.detect_pupil(roi)
                offset = (x, y)
                method = "classical"

        mask = None
        if self.save_masks and local.mask is not None:
            mask = np.zeros(gray.shape, dtype=np.uint8)
            oy, ox = offset[1], offset[0]
            mh, mw = local.mask.shape[:2]
            mask[oy : oy + mh, ox : ox + mw] = local.mask

        return PupilDetection(
            frame_index=frame_idx,
            time_s=timestamp_ms / 1000.0,
            found=local.found,
            center_x=(local.cx + offset[0]) if local.found else None,
            center_y=(local.cy + offset[1]) if local.found else None,
            axis_major=local.axis_major if local.found else None,
            axis_minor=local.axis_minor if local.found else None,
            angle_deg=local.angle_deg if local.found else None,
            iris_diameter_px=local.iris_diameter_px if local.found else None,
            confidence=local.confidence,
            method=method if local.found else "none",
            mask=mask,
        )

    def process_video(self, video_path: str, output_dir: str, save_annotated: bool = False) -> dict:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

        writer = AnnotatedVideoWriter(output_dir / "annotated.mp4", fps, frame_size) if save_annotated else None

        rows = []
        masks = [] if self.save_masks else None
        frame_idx = 0
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                gray = preprocessing.to_gray(frame)
                timestamp_ms = int(frame_idx * 1000 / fps)
                det = self._detect_frame(frame, gray, frame_idx, timestamp_ms)
                det = self._tracker.update(det)
                rows.append(det.as_row())
                if masks is not None:
                    masks.append(det.mask if det.mask is not None else np.zeros_like(gray))
                if writer is not None:
                    writer.write(draw_overlay(frame, det))
                frame_idx += 1
        finally:
            cap.release()
            if writer is not None:
                writer.close()
            if self._mp_detector is not None:
                self._mp_detector.close()

        df = pd.DataFrame(rows)
        csv_path = output_dir / "trajectory.csv"
        df.to_csv(csv_path, index=False)

        masks_path = None
        if masks is not None and masks:
            masks_path = output_dir / "masks.npz"
            np.savez_compressed(masks_path, masks=np.stack(masks))

        return {
            "n_frames": frame_idx,
            "detection_rate": float(df["found"].mean()) if frame_idx else 0.0,
            "mean_confidence": float(df["confidence"].mean()) if frame_idx else 0.0,
            "csv_path": str(csv_path),
            "annotated_video_path": str(output_dir / "annotated.mp4") if writer is not None else None,
            "masks_path": str(masks_path) if masks_path is not None else None,
        }
