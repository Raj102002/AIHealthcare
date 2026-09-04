"""Controlled corruption of a Stage 1 -shaped trajectory DataFrame, used by
Task 4 (error-propagation study) and Task 5 (Kalman gap-bridging regression
tests) of the Stage 1 validation project.

Every function takes a trajectory DataFrame (the same schema
synthetic_signals.py produces / Stage 1 actually writes) and returns a
NEW DataFrame -- the input is never mutated, so a caller can inject several
noise types onto the same clean baseline for comparison.
"""
import numpy as np
import pandas as pd


def gaussian_jitter(df: pd.DataFrame, pixel_std: float, seed: int = 0) -> pd.DataFrame:
    """Random per-frame jitter -- the generic "detector center estimate has
    some scatter" case."""
    rng = np.random.default_rng(seed)
    out = df.copy()
    mask = out["found"].to_numpy()
    n = int(mask.sum())
    if n and pixel_std > 0:
        out.loc[mask, "x"] = out.loc[mask, "x"].to_numpy() + rng.normal(0, pixel_std, n)
        out.loc[mask, "y"] = out.loc[mask, "y"].to_numpy() + rng.normal(0, pixel_std, n)
    return out


def constant_offset(df: pd.DataFrame, pixel_offset: float) -> pd.DataFrame:
    """Systematic calibration/localization bias -- every found frame shifted
    the same amount."""
    out = df.copy()
    mask = out["found"].to_numpy()
    out.loc[mask, "x"] = out.loc[mask, "x"].to_numpy() + pixel_offset
    return out


def outliers(df: pd.DataFrame, pixel_magnitude: float, rate: float = 0.02, seed: int = 0) -> pd.DataFrame:
    """Occasional large single-frame excursions -- a false pupil detection
    (e.g. an eyelash shadow briefly outscoring the real pupil) that snaps
    back the next frame."""
    rng = np.random.default_rng(seed)
    out = df.copy()
    if pixel_magnitude <= 0:
        return out
    idxs = np.where(out["found"].to_numpy())[0]
    n_outliers = max(1, int(round(len(idxs) * rate))) if len(idxs) else 0
    chosen = rng.choice(idxs, size=min(n_outliers, len(idxs)), replace=False) if n_outliers else []
    for i in chosen:
        angle = rng.uniform(0, 2 * np.pi)
        row = out.index[i]
        out.loc[row, "x"] += pixel_magnitude * np.cos(angle)
        out.loc[row, "y"] += pixel_magnitude * np.sin(angle)
    return out


def missing_gaps(df: pd.DataFrame, gap_frames: int, n_gaps: int = 3, seed: int = 0) -> pd.DataFrame:
    """Blocks of consecutive `found=False` frames -- a missed detection
    (blink, brief occlusion). `gap_frames` controls duration: short values
    are a blink, large values a long occlusion."""
    rng = np.random.default_rng(seed)
    out = df.copy()
    n = len(out)
    if gap_frames <= 0 or n_gaps <= 0 or n <= gap_frames:
        return out
    max_start = n - gap_frames
    n_possible = max(1, max_start // (gap_frames + 10))
    starts = rng.choice(np.arange(max_start), size=min(n_gaps, n_possible), replace=False)
    for s in starts:
        rows = out.index[s: s + gap_frames]
        out.loc[rows, "found"] = False
        out.loc[rows, "method"] = "none"
        out.loc[rows, "confidence"] = 0.0
        out.loc[rows, "x"] = np.nan
        out.loc[rows, "y"] = np.nan
    return out


def false_jumps(df: pd.DataFrame, pixel_magnitude: float, jump_frames: int = 5, n_jumps: int = 2, seed: int = 0) -> pd.DataFrame:
    """A short run of consecutively-offset frames -- a false pupil lock
    (shadow/glare) that persists for a few frames rather than a single
    outlier, so it can masquerade as real (fast) motion instead of noise."""
    rng = np.random.default_rng(seed)
    out = df.copy()
    n = len(out)
    if pixel_magnitude <= 0 or n_jumps <= 0 or n <= jump_frames:
        return out
    max_start = n - jump_frames
    n_possible = max(1, max_start // (jump_frames + 20))
    starts = rng.choice(np.arange(max_start), size=min(n_jumps, n_possible), replace=False)
    for s in starts:
        angle = rng.uniform(0, 2 * np.pi)
        rows = out.index[s: s + jump_frames]
        out.loc[rows, "x"] = out.loc[rows, "x"].to_numpy() + pixel_magnitude * np.cos(angle)
        out.loc[rows, "y"] = out.loc[rows, "y"].to_numpy() + pixel_magnitude * np.sin(angle)
    return out


NOISE_TYPES = {
    "gaussian_jitter": gaussian_jitter,
    "constant_offset": constant_offset,
    "outliers": outliers,
    "false_jumps": false_jumps,
}
