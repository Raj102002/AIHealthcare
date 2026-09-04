"""Synthetic (x, y, t) trajectory generators with KNOWN ground truth, used by
Tasks 4/5/6 of the Stage 1 validation project (error-propagation study,
Kalman gap-bridging regression tests, Stage 2-5 benchmark suite).

Every generator returns `(trajectory_df, ground_truth)`:
  - `trajectory_df` matches the Stage 1 CSV schema every Stage 2-5 pipeline
    already expects (frame, time_s, found, x, y, axis_major, axis_minor,
    angle_deg, iris_diameter_px, confidence, method) -- same convention as
    tests/test_kinematics.py's/test_movement_pipeline.py's `_make_trajectory`/
    `_write_trajectory` helpers.
  - `ground_truth` is a plain dict of the parameters used to generate the
    signal (expected beat count, SPV, frequency, direction, waveform shape,
    etc.) -- this is the "true answer" downstream stages are compared
    against; nothing here is inferred, it's exactly what was synthesized.

This is "synthetic algorithmic validation" (does the pipeline recover a
known, hand-specified signal?), never "clinical"/"diagnostic" performance --
see README's Stage validation caveats and the Task 7 report's Known
Limitations section.

Only `jerk_linear` had a prior form in this codebase (triplicated across
test_movement_pipeline.py/test_screening_pipeline.py/
test_characterization_pipeline.py's local `_jerk_segment` helpers) --
consolidated here. Every other generator (fixation with a real duration
param, saccade, accelerating/decelerating-slow-phase jerk, pendular, PAN,
gaze-dependent/Alexander's-law) is new.
"""
from typing import Dict, Tuple

import numpy as np
import pandas as pd

DEFAULT_FPS = 60.0
DEFAULT_IRIS_DIAMETER_PX = 110.0
DEFAULT_CONFIDENCE = 0.7


def _build_df(x: np.ndarray, y: np.ndarray, fps: float = DEFAULT_FPS) -> pd.DataFrame:
    n = len(x)
    return pd.DataFrame(
        {
            "frame": np.arange(n),
            "time_s": np.arange(n) / fps,
            "found": True,
            "x": x,
            "y": y,
            "axis_major": 20.0,
            "axis_minor": 18.0,
            "angle_deg": 0.0,
            "iris_diameter_px": DEFAULT_IRIS_DIAMETER_PX,
            "confidence": DEFAULT_CONFIDENCE,
            "method": "classical",
        }
    )


def fixation(
    n: int = 180, fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0,
    noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    rng = np.random.default_rng(seed)
    x = x0 + rng.normal(0, noise_std, n)
    y = y0 + rng.normal(0, noise_std, n)
    df = _build_df(x, y, fps)
    gt = {
        "signal_type": "fixation", "expected_waveform": None, "expected_beat_count": 0,
        "expected_spv_px_s": 0.0, "expected_frequency_hz": 0.0, "expected_fast_phase_direction": None,
    }
    return df, gt


def saccade(
    fps: float = DEFAULT_FPS, n_pre: int = 60, n_post: int = 60, amplitude_px: float = 30.0,
    duration_s: float = 0.05, x0: float = 100.0, y0: float = 50.0, noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    rng = np.random.default_rng(seed)
    n_sacc = max(2, int(round(duration_s * fps)))
    pre = x0 + rng.normal(0, noise_std, n_pre)
    t_rel = np.arange(n_sacc) / fps
    ramp = pre[-1] + amplitude_px * (t_rel / t_rel[-1] if t_rel[-1] > 0 else np.ones(n_sacc))
    post = ramp[-1] + rng.normal(0, noise_std, n_post)
    x = np.concatenate([pre, ramp, post])
    y = y0 + rng.normal(0, noise_std, len(x))
    df = _build_df(x, y, fps)
    gt = {
        "signal_type": "saccade", "onset_frame": n_pre, "expected_duration_s": duration_s,
        "expected_peak_velocity_px_s": amplitude_px / duration_s, "expected_amplitude_px": amplitude_px,
        "expected_direction": "+x" if amplitude_px > 0 else "-x",
    }
    return df, gt


def jerk_linear(
    n: int = 600, fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0,
    beat_period_s: float = 0.5, slow_velocity_px_s: float = -10.0, reset_amplitude_px: float = 20.0,
    noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    """Constant slow-phase velocity ("linear" waveform shape) -- the
    consolidated form of the jerk generator previously duplicated 3x.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n) / fps
    x = np.zeros(n)
    cur, last_reset = x0, 0.0
    n_beats = 0
    for i in range(n):
        if t[i] - last_reset >= beat_period_s:
            cur += reset_amplitude_px
            last_reset = t[i]
            n_beats += 1
        cur += slow_velocity_px_s / fps
        x[i] = cur
    x = x + rng.normal(0, noise_std, n)
    y = y0 + rng.normal(0, noise_std, n)
    df = _build_df(x, y, fps)
    gt = {
        "signal_type": "jerk_linear", "expected_waveform": "linear",
        "expected_beat_count": n_beats, "expected_spv_px_s": abs(slow_velocity_px_s),
        "expected_frequency_hz": 1.0 / beat_period_s, "expected_amplitude_px": abs(reset_amplitude_px),
        "expected_fast_phase_direction": "+x" if reset_amplitude_px > 0 else "-x",
    }
    return df, gt


def _exp_slow_phase(t_rel: np.ndarray, total_disp: float, tau: float, growth: bool) -> np.ndarray:
    if growth:
        denom = np.exp(t_rel[-1] / tau) - 1
        b = total_disp / denom if denom != 0 else 0.0
        return b * (np.exp(t_rel / tau) - 1)
    denom = 1 - np.exp(-t_rel[-1] / tau)
    b = total_disp / denom if denom != 0 else 0.0
    return b * (1 - np.exp(-t_rel / tau))


def jerk_shaped(
    n: int = 900, fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0,
    beat_period_s: float = 0.5, total_slow_disp_px: float = -6.0, reset_amplitude_px: float = 20.0,
    tau_s: float = 0.15, growth: bool = True, noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    """Exponential-approach slow phase (Leigh & Zee): `growth=True` is
    "increasing_velocity" (x(t)=a+b*(exp(t/tau)-1), unstable/leaky-
    integrator pattern), `growth=False` is "decreasing_velocity"
    (x(t)=a+b*(1-exp(-t/tau)), decelerating slow phase) -- same formulas
    src/nystagmus_characterization/shape.py fits, so a correctly-recovered
    label/tau here is a genuine algorithmic check, not a coincidence.
    """
    rng = np.random.default_rng(seed)
    frame_period = max(2, int(round(beat_period_s * fps)))
    x = np.zeros(n)
    cur = x0
    idx = 0
    n_beats = 0
    while idx < n:
        this_len = min(frame_period, n - idx)
        t_rel = np.arange(this_len) / fps
        slow = cur + _exp_slow_phase(t_rel, total_slow_disp_px, tau_s, growth)
        x[idx: idx + this_len] = slow
        cur = float(slow[-1])
        idx += this_len
        if idx < n:
            cur += reset_amplitude_px
            n_beats += 1
    x = x + rng.normal(0, noise_std, n)
    y = y0 + rng.normal(0, noise_std, n)
    df = _build_df(x, y, fps)
    label = "increasing_velocity" if growth else "decreasing_velocity"
    gt = {
        "signal_type": f"jerk_{label}", "expected_waveform": label,
        "expected_beat_count": n_beats, "expected_tau_s": tau_s,
        "expected_fast_phase_direction": "+x" if reset_amplitude_px > 0 else "-x",
        "expected_mean_spv_px_s": abs(total_slow_disp_px) / beat_period_s,
        "expected_frequency_hz": 1.0 / beat_period_s,
    }
    return df, gt


def pendular(
    n: int = 300, fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0,
    amplitude_px: float = 25.0, freq_hz: float = 1.5, noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    rng = np.random.default_rng(seed)
    t = np.arange(n) / fps
    x = x0 + amplitude_px * np.sin(2 * np.pi * freq_hz * t) + rng.normal(0, noise_std, n)
    y = y0 + rng.normal(0, noise_std, n)
    df = _build_df(x, y, fps)
    gt = {
        "signal_type": "pendular", "expected_waveform": "pendular",
        "expected_amplitude_px": amplitude_px, "expected_frequency_hz": freq_hz,
        "expected_beat_count": 0,
    }
    return df, gt


def periodic_alternating(
    fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0, n_blocks: int = 4,
    beats_per_block: int = 6, beat_period_s: float = 0.4, slow_velocity_px_s: float = -12.0,
    reset_amplitude_px: float = 18.0, gap_s: float = 1.0, noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    """Alternating-direction jerk blocks separated by real fixation gaps
    long enough (`gap_s`, default 1.0s) to clear both Stage 4's episode-
    clustering gap (classifier.DEFAULT_MAX_INTRA_EPISODE_GAP_S=0.5s) and
    Stage 5's PAN null-gap requirement (pan_pattern.DEFAULT_MIN_NULL_GAP_S=
    0.5s) -- so each block becomes its own detected episode, not one
    merged blob, which is what src/disorder_screening/pan_pattern.py needs
    to see an alternation.
    """
    rng = np.random.default_rng(seed)
    block_n = int(round(beats_per_block * beat_period_s * fps))
    gap_n = int(round(gap_s * fps))
    x_parts, y_parts = [], []
    cur = x0
    directions = []
    for block in range(n_blocks):
        direction_sign = 1 if block % 2 == 0 else -1
        directions.append("+x" if direction_sign > 0 else "-x")
        block_x = np.zeros(block_n)
        t = np.arange(block_n) / fps
        last_reset = 0.0
        for i in range(block_n):
            if t[i] - last_reset >= beat_period_s:
                cur += direction_sign * reset_amplitude_px
                last_reset = t[i]
            cur += direction_sign * slow_velocity_px_s / fps
            block_x[i] = cur
        x_parts.append(block_x)
        if block < n_blocks - 1:
            x_parts.append(np.full(gap_n, cur))
    x = np.concatenate(x_parts)
    x = x + rng.normal(0, noise_std, len(x))
    y = np.full(len(x), y0) + rng.normal(0, noise_std, len(x))
    df = _build_df(x, y, fps)
    gt = {
        "signal_type": "periodic_alternating", "expected_waveform": "linear",
        "expected_n_episodes": n_blocks, "expected_direction_sequence": directions,
        "expected_frequency_hz": 1.0 / beat_period_s,
    }
    return df, gt


def gaze_dependent(
    n: int = 1800, fps: float = DEFAULT_FPS, x0: float = 100.0, y0: float = 50.0,
    beat_period_s: float = 0.4, base_slow_velocity_px_s: float = -4.0,
    velocity_gain_per_px: float = 0.15, reset_amplitude_px: float = 20.0,
    noise_std: float = 0.3, seed: int = 0,
) -> Tuple[pd.DataFrame, Dict]:
    """Synthetic Alexander's-Law signal: slow-phase velocity magnitude is
    made an explicit linear function of gaze eccentricity
    (`velocity_gain_per_px > 0`), which -- because each beat's net drift is
    reset_amplitude - |slow-phase displacement| -- produces a naturally
    increasing eccentricity over time and a genuine positive correlation
    between per-beat mean gaze position and |SPV|, the exact relationship
    src/nystagmus_characterization/alexanders_law.py tests for.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n) / fps
    x = np.zeros(n)
    cur, last_reset = x0, 0.0
    n_beats = 0
    beat_positions, beat_velocities = [], []
    slow_velocity = base_slow_velocity_px_s
    for i in range(n):
        if t[i] - last_reset >= beat_period_s:
            gaze_ecc = cur - x0
            slow_velocity = base_slow_velocity_px_s - velocity_gain_per_px * gaze_ecc
            beat_positions.append(gaze_ecc)
            beat_velocities.append(abs(slow_velocity))
            cur += reset_amplitude_px
            last_reset = t[i]
            n_beats += 1
        cur += slow_velocity / fps
        x[i] = cur
    x = x + rng.normal(0, noise_std, n)
    y = y0 + rng.normal(0, noise_std, n)
    df = _build_df(x, y, fps)
    expected_corr = None
    if len(beat_positions) >= 2 and np.std(beat_positions) > 0 and np.std(beat_velocities) > 0:
        expected_corr = float(np.corrcoef(beat_positions, beat_velocities)[0, 1])
    gt = {
        "signal_type": "gaze_dependent", "expected_waveform": "linear",
        "expected_beat_count": n_beats,
        "expected_fast_phase_direction": "+x" if reset_amplitude_px > 0 else "-x",
        "expected_alexanders_law_correlation_sign": "positive" if velocity_gain_per_px > 0 else "negative",
        "expected_alexanders_law_correlation_approx": expected_corr,
    }
    return df, gt
