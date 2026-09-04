"""Shared data types for the Stage 1 pupil-detection pipeline."""
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class PupilDetection:
    """Result of locating the pupil in a single video frame.

    Coordinates are in pixels, in the coordinate frame of the *original*
    input frame (not the ROI a detector may have cropped internally).
    """

    frame_index: int
    time_s: float
    found: bool
    center_x: Optional[float] = None
    center_y: Optional[float] = None
    axis_major: Optional[float] = None  # fitted ellipse major axis (px)
    axis_minor: Optional[float] = None  # fitted ellipse minor axis (px)
    angle_deg: Optional[float] = None  # fitted ellipse rotation
    confidence: float = 0.0  # 0..1
    method: str = "none"  # "mediapipe" | "classical" | "cnn" | "predicted" | "none"
    mask: Optional[np.ndarray] = field(default=None, repr=False)  # full-frame binary mask (uint8, 0/255)
    # Measured iris diameter in pixels this frame, or None if not measured.
    # Stable across frames for a given subject, unlike pupil size --
    # intended as a per-subject calibration reference for later stages
    # converting pixel measurements to mm/degrees. NOTE: the adult value
    # (~11.5-12.0mm) is not applicable to infants (~10.0-10.5mm); any
    # px-to-mm conversion needs an age-appropriate reference, not one
    # fixed constant, if pediatric patients are in scope.
    iris_diameter_px: Optional[float] = None

    def as_row(self) -> dict:
        """Flat dict for CSV/DataFrame export (mask excluded, it's not tabular)."""
        return {
            "frame": self.frame_index,
            "time_s": round(self.time_s, 4),
            "found": self.found,
            "x": self.center_x,
            "y": self.center_y,
            "axis_major": self.axis_major,
            "axis_minor": self.axis_minor,
            "angle_deg": self.angle_deg,
            "iris_diameter_px": self.iris_diameter_px,
            "confidence": round(self.confidence, 4),
            "method": self.method,
        }
