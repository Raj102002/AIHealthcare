"""Gap-aware velocity/acceleration computation from a Stage 1 trajectory.

`PupilTracker` (Stage 1) bridges short gaps (blinks, brief occlusion) by
emitting up to `max_predicted_gap` frames of Kalman-*extrapolated*
position with decaying confidence (down from 0.3), then gives up and
emits `found=False`/`method="none"` if the gap continues. Differencing
position across either of those -- a "predicted" run, or a "none" gap --
would compute a fake velocity spike out of missing signal, not measured
motion. Every function here operates only within maximal contiguous runs
of genuinely-measured, confident frames ("segments"); everything else is
marked `included=False` with `None` kinematics.
"""
from typing import List, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

from .types import CalibrationResult, KinematicFrame


# 0.3 is PupilTracker's decaying-confidence ceiling (0.3 * max(0, 1 -
# gap/max_gap), strictly < 0.3 for every predicted frame) -- chosen
# deliberately, not an arbitrary round number: running the Stage 1 demo
# showed classical_detector's real confidence on found frames clusters
# from ~0.34 up (e.g. 0/82 frames below 0.3 vs. 39/82 below 0.4 on
# outputs/demo/trajectory.csv), so 0.4 was silently discarding half of
# genuinely-good detections while 0.3 cleanly separates "measured" from
# "extrapolated through a gap" without cutting into real signal.
DEFAULT_MIN_CONFIDENCE = 0.3
# Named exclusion in addition to the confidence threshold: PupilTracker's
# decay formula (0.3 * max(0, 1 - gap/max_gap)) can never reach 0.3, so
# DEFAULT_MIN_CONFIDENCE already excludes "predicted" frames numerically
# today -- but excluding by method name too keeps this correct even if
# that tracker constant ever changes, instead of relying on a coincidence.
DEFAULT_EXCLUDE_METHODS = ("predicted", "none")
DEFAULT_MIN_SEGMENT_FRAMES = 5
DEFAULT_SAVGOL_WINDOW = 9
DEFAULT_SAVGOL_POLYORDER = 2


def build_segments(
    df: pd.DataFrame,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    exclude_methods: Sequence[str] = DEFAULT_EXCLUDE_METHODS,
    min_segment_frames: int = DEFAULT_MIN_SEGMENT_FRAMES,
) -> List[np.ndarray]:
    """Returns maximal contiguous runs of positional row-indices into `df`
    that are simultaneously found, confident, not an excluded method, and
    frame-number-contiguous (guards against a caller-supplied CSV with
    dropped rows, not just Stage 1's own gap-filled output). Runs shorter
    than `min_segment_frames` are dropped outright -- a 1-2 frame sliver
    can't support a meaningful derivative, let alone a beat (mirrors
    classical_detector's area/circularity floors: a noise guard, not a
    real segment).
    """
    trustworthy = (
        df["found"].to_numpy()
        & ~df["method"].isin(exclude_methods).to_numpy()
        & (df["confidence"].to_numpy() >= min_confidence)
    )
    frames = df["frame"].to_numpy()

    segments: List[np.ndarray] = []
    start = None
    for i in range(len(df)):
        frame_gap = start is not None and i > 0 and frames[i] != frames[i - 1] + 1
        if trustworthy[i] and (start is None or frame_gap):
            if frame_gap:
                segments.append(np.arange(start, i))
            start = i
        elif not trustworthy[i] and start is not None:
            segments.append(np.arange(start, i))
            start = None
    if start is not None:
        segments.append(np.arange(start, len(df)))

    return [seg for seg in segments if len(seg) >= min_segment_frames]


def _differentiate(t: np.ndarray, x: np.ndarray, y: np.ndarray, window: int, polyorder: int) -> Tuple[np.ndarray, ...]:
    median_dt = max(float(np.median(np.diff(t))), 1e-6)

    if len(t) >= window:
        vx = savgol_filter(x, window, polyorder, deriv=1, delta=median_dt)
        vy = savgol_filter(y, window, polyorder, deriv=1, delta=median_dt)
        ax = savgol_filter(x, window, polyorder, deriv=2, delta=median_dt)
        ay = savgol_filter(y, window, polyorder, deriv=2, delta=median_dt)
    else:
        # Too short for the Savitzky-Golay window (needs >= window points);
        # a plain gradient is noisier but at least defined for a short segment.
        vx, vy = np.gradient(x, t), np.gradient(y, t)
        ax, ay = np.gradient(vx, t), np.gradient(vy, t)

    return vx, vy, ax, ay


def compute_kinematics(
    df: pd.DataFrame,
    calibration: CalibrationResult,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    exclude_methods: Sequence[str] = DEFAULT_EXCLUDE_METHODS,
    min_segment_frames: int = DEFAULT_MIN_SEGMENT_FRAMES,
    savgol_window: int = DEFAULT_SAVGOL_WINDOW,
    savgol_polyorder: int = DEFAULT_SAVGOL_POLYORDER,
) -> pd.DataFrame:
    window = savgol_window if savgol_window % 2 == 1 else savgol_window + 1  # scipy requires an odd window

    segments = build_segments(df, min_confidence, exclude_methods, min_segment_frames)
    frame_col = df["frame"].to_numpy()
    time_col = df["time_s"].to_numpy()
    x_col = df["x"].to_numpy(dtype=float)
    y_col = df["y"].to_numpy(dtype=float)

    rows = [
        KinematicFrame(frame=int(frame_col[i]), time_s=float(time_col[i]), included=False, segment_id=None, x_px=None, y_px=None)
        for i in range(len(df))
    ]

    for segment_id, idx in enumerate(segments):
        t, x, y = time_col[idx], x_col[idx], y_col[idx]
        vx, vy, ax, ay = _differentiate(t, x, y, window, savgol_polyorder)
        speed = np.hypot(vx, vy)
        accel = np.hypot(ax, ay)

        speed_mm = speed / calibration.px_per_mm if calibration.px_per_mm else None
        speed_deg = speed * calibration.deg_per_px if calibration.deg_per_px else None

        for j, i in enumerate(idx):
            rows[i] = KinematicFrame(
                frame=int(frame_col[i]),
                time_s=float(time_col[i]),
                included=True,
                segment_id=segment_id,
                x_px=float(x[j]),
                y_px=float(y[j]),
                velocity_x_px_s=float(vx[j]),
                velocity_y_px_s=float(vy[j]),
                speed_px_s=float(speed[j]),
                acceleration_px_s2=float(accel[j]),
                speed_mm_s=float(speed_mm[j]) if speed_mm is not None else None,
                speed_deg_s=float(speed_deg[j]) if speed_deg is not None else None,
            )

    return pd.DataFrame([r.as_row() for r in rows])
