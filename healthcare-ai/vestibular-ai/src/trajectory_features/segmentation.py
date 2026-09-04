"""Jerk-nystagmus beat detection: slow-phase (drift) / fast-phase
(corrective saccade) segmentation, and the jerk-vs-pendular-vs-
indeterminate classification that decides whether beat-based features
apply at all.

The clinically important number per beat is **slow-phase velocity**: the
slope of a line fit to position *during the slow phase only*, not raw
instantaneous velocity (which is noisier and includes the saccade). See
`Beat` in types.py for the direction-labeling convention.
"""
from typing import List, Optional

import numpy as np
import pandas as pd
from scipy.stats import median_abs_deviation

from . import pendular, run_utils
from .types import Beat, CalibrationResult

DEFAULT_K_MAD = 3.0
DEFAULT_MIN_FAST_PHASE_DURATION_S = 0.02
DEFAULT_MIN_SLOW_PHASE_DURATION_S = 0.08
DEFAULT_MIN_BEATS_FOR_JERK = 3
DEFAULT_MIN_R_SQUARED = 0.5
# How much stronger the dominant FFT bin must be than the typical
# (median) bin to call a waveform confidently "pendular" rather than
# "indeterminate" -- an arbitrary-but-documented bar, not a literature
# constant, since there's no calibrated ground truth to tune it against yet.
DEFAULT_PEAK_STRENGTH_THRESHOLD = 4.0
# Discovered via the Stage 1 validation project's error-propagation study
# (Task 4/5): PupilTracker's Kalman smoothing colors per-frame jitter
# enough that a long, perfectly quiet fixation recording can clear
# DEFAULT_PEAK_STRENGTH_THRESHOLD on a sub-pixel peak-to-peak "oscillation"
# (observed: 0.67px, threshold-crossing peak_strength=4.67) -- a spurious
# spectral peak, not a real one. peak_strength alone can't tell "genuinely
# periodic" from "smoothed noise with an accidentally prominent bin" at
# small amplitude, so a real oscillation must ALSO clear an absolute
# peak-to-peak floor. 2.0px is well above typical detector/tracker jitter
# (the false positive that motivated this was 0.67px) and two orders of
# magnitude below every real pendular signal already covered by this
# module's tests (15-25px amplitude) -- not a claim about the smallest
# clinically-real pendular amplitude, which this codebase has no basis to
# state.
DEFAULT_MIN_PENDULAR_AMPLITUDE_PX = 2.0


def detect_beats(
    kin_df: pd.DataFrame,
    position_col: str = "x_px",
    velocity_col: str = "velocity_x_px_s",
    k_mad: float = DEFAULT_K_MAD,
    explicit_velocity_threshold: Optional[float] = None,
    min_fast_phase_duration_s: float = DEFAULT_MIN_FAST_PHASE_DURATION_S,
    min_slow_phase_duration_s: float = DEFAULT_MIN_SLOW_PHASE_DURATION_S,
    calibration: Optional[CalibrationResult] = None,
) -> List[Beat]:
    beats: List[Beat] = []
    included = kin_df[kin_df["included"]]
    if included.empty:
        return beats

    for segment_id in sorted(included["segment_id"].unique()):
        seg = kin_df[kin_df["segment_id"] == segment_id].reset_index(drop=True)
        if len(seg) < 3:
            continue

        t = seg["time_s"].to_numpy()
        x = seg[position_col].to_numpy()
        v = seg[velocity_col].to_numpy()
        abs_v = np.abs(v)

        # Threshold is self-calibrating per segment (not global over the
        # whole recording) so a mid-recording detector-quality shift
        # doesn't bias the split -- mirrors Stage 1's per-frame, not
        # per-video, thresholding philosophy. MAD (not std) is used
        # because fast-phase velocity outliers would blow out a
        # std-based threshold, defeating the point of a robust statistic;
        # scale="normal" makes it a normal-consistent robust-sigma
        # estimate so k_mad behaves like a familiar "~k sigma" cutoff.
        if explicit_velocity_threshold is not None:
            threshold = explicit_velocity_threshold
        else:
            mad = median_abs_deviation(abs_v, scale="normal")
            threshold = float(np.median(abs_v) + k_mad * mad)

        # Runs shorter than their phase's minimum duration get relabeled to
        # match their longer neighbor -- a single noisy sample isn't a fast
        # phase, and a sliver "slow phase" can't support a meaningful linear
        # fit (same noise-rejection spirit as classical_detector's
        # circularity/area scoring).
        is_fast = run_utils.merge_short_runs(
            abs_v > threshold, t, min_fast_phase_duration_s, min_slow_phase_duration_s, "fast", "slow"
        )
        runs = run_utils.label_runs(is_fast, "fast", "slow")

        for k in range(len(runs) - 1):
            s_start, s_end, s_label = runs[k]
            f_start, f_end, f_label = runs[k + 1]
            if s_label != "slow" or f_label != "fast":
                continue

            t_slow, x_slow = t[s_start:s_end], x[s_start:s_end]
            if len(t_slow) < 2:
                continue
            slope, intercept = np.polyfit(t_slow, x_slow, 1)
            residual = x_slow - (slope * t_slow + intercept)
            ss_res = float(np.sum(residual**2))
            ss_tot = float(np.sum((x_slow - x_slow.mean()) ** 2))
            r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

            v_fast = v[f_start:f_end]
            fast_peak_v = float(v_fast[np.argmax(np.abs(v_fast))])
            amplitude_px = float(abs(x[f_end - 1] - x[s_start]))

            px_per_mm = calibration.px_per_mm if calibration else None
            deg_per_px = calibration.deg_per_px if calibration else None

            beats.append(
                Beat(
                    beat_index=len(beats),
                    slow_phase_start_s=float(t[s_start]),
                    slow_phase_end_s=float(t[s_end - 1]),
                    fast_phase_start_s=float(t[f_start]),
                    fast_phase_end_s=float(t[f_end - 1]),
                    slow_phase_velocity_px_s=float(slope),
                    slow_phase_direction="+x" if slope >= 0 else "-x",
                    fast_phase_peak_velocity_px_s=fast_peak_v,
                    fast_phase_direction="+x" if fast_peak_v >= 0 else "-x",
                    amplitude_px=amplitude_px,
                    r_squared=float(r_squared),
                    slow_phase_velocity_mm_s=float(slope) / px_per_mm if px_per_mm else None,
                    slow_phase_velocity_deg_s=float(slope) * deg_per_px if deg_per_px else None,
                    amplitude_mm=amplitude_px / px_per_mm if px_per_mm else None,
                    amplitude_deg=amplitude_px * deg_per_px if deg_per_px else None,
                )
            )

    return beats


def classify_waveform(
    kin_df: pd.DataFrame,
    beats: List[Beat],
    position_col: str = "x_px",
    min_beats: int = DEFAULT_MIN_BEATS_FOR_JERK,
    min_r_squared: float = DEFAULT_MIN_R_SQUARED,
    peak_strength_threshold: float = DEFAULT_PEAK_STRENGTH_THRESHOLD,
    min_amplitude_px: float = DEFAULT_MIN_PENDULAR_AMPLITUDE_PX,
) -> str:
    """"jerk" if enough well-fit beats were found; else "pendular" if the
    longest trustworthy segment has one clearly dominant oscillation
    frequency AT A REAL AMPLITUDE; else "indeterminate" -- reported
    honestly rather than forced into either bucket, the same way
    iris_diameter_px reports None instead of a guessed value when it can't
    be measured.

    `min_amplitude_px` exists because peak_strength alone is scale-free --
    it can't distinguish a real oscillation from smoothed sub-pixel jitter
    that happens to have a prominent spectral bin (see this constant's
    docstring for the false positive that motivated it). Checked against
    the DETRENDED residual (the same signal `compute_spectrum` analyzes,
    recomputed here with the same linear fit), not raw position -- raw
    peak-to-peak range is trivially large for any sustained-motion segment
    (e.g. smooth pursuit) regardless of whether it oscillates at all, so
    checking it directly reintroduced the same false-positive class this
    guard exists to close (discovered on gap-bridged smooth pursuit: 29.8px
    raw range, entirely from the linear drift itself, not an oscillation).
    """
    good_beats = [b for b in beats if b.r_squared >= min_r_squared]
    if len(good_beats) >= min_beats:
        return "jerk"

    seg = pendular.longest_contiguous_segment(kin_df)
    if seg is None or len(seg) < pendular.MIN_SPECTRUM_SAMPLES:
        return "indeterminate"

    t = kin_df["time_s"].to_numpy()[seg]
    x = kin_df[position_col].to_numpy()[seg]

    slope, intercept = np.polyfit(t, x, 1)
    detrended = x - (slope * t + intercept)
    p95, p05 = np.percentile(detrended, [95, 5])
    if (p95 - p05) < min_amplitude_px:
        return "indeterminate"

    freqs, magnitude = pendular.compute_spectrum(t, x)
    if len(magnitude) < 3:
        return "indeterminate"

    peak_idx = int(np.argmax(magnitude[1:])) + 1
    others = np.delete(magnitude[1:], peak_idx - 1)
    baseline = float(np.median(others)) if len(others) else 0.0
    peak_strength = magnitude[peak_idx] / (baseline + 1e-9)

    return "pendular" if peak_strength >= peak_strength_threshold else "indeterminate"
