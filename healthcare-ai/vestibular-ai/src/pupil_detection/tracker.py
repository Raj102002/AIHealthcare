"""Temporal smoothing / gap-filling on top of per-frame detections.

A constant-velocity Kalman filter smooths per-frame jitter and lets the
pipeline keep emitting a plausible position through brief blinks or
missed detections, with decaying confidence, instead of leaving holes
in the trajectory -- Stage 2's velocity/frequency features are
sensitive to gaps, so this matters even though Stage 1 only tracks the
pupil.
"""
import cv2
import numpy as np

from .types import PupilDetection


class PupilTracker:
    def __init__(self, max_predicted_gap: int = 5, process_noise: float = 1e-2, meas_noise: float = 1e-1):
        self._kf = cv2.KalmanFilter(4, 2)
        self._kf.transitionMatrix = np.array(
            [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32
        )
        self._kf.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
        self._kf.processNoiseCov = np.eye(4, dtype=np.float32) * process_noise
        self._kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * meas_noise
        self._initialized = False
        self._max_gap = max_predicted_gap
        self._gap_count = 0

    def update(self, det: PupilDetection) -> PupilDetection:
        if det.found:
            meas = np.array([[np.float32(det.center_x)], [np.float32(det.center_y)]])
            if not self._initialized:
                self._kf.statePost = np.array(
                    [[det.center_x], [det.center_y], [0], [0]], np.float32
                )
                self._initialized = True
            self._kf.predict()
            corrected = self._kf.correct(meas)
            self._gap_count = 0
            det.center_x, det.center_y = float(corrected[0, 0]), float(corrected[1, 0])
            return det

        if not self._initialized or self._gap_count >= self._max_gap:
            self._gap_count += 1
            return det

        predicted = self._kf.predict()
        self._gap_count += 1
        decay = max(0.0, 1 - self._gap_count / self._max_gap)
        return PupilDetection(
            frame_index=det.frame_index,
            time_s=det.time_s,
            found=True,
            center_x=float(predicted[0, 0]),
            center_y=float(predicted[1, 0]),
            axis_major=det.axis_major,
            axis_minor=det.axis_minor,
            angle_deg=det.angle_deg,
            confidence=0.3 * decay,
            method="predicted",
            mask=None,
        )
