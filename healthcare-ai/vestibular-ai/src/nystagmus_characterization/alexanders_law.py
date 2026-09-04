"""Alexander's Law check: classically, peripheral vestibular nystagmus
intensifies (higher slow-phase velocity) when gaze is deviated toward the
fast-phase direction. Testable directly from data already in hand:
correlate each beat's mean gaze position during its slow phase against
its |slow-phase velocity|, across one episode's beats.

Spearman (not Pearson): invariant to any monotonic transform, including
px<->mm<->deg calibration, so this is the one Stage 4 metric that needs
no calibration-status caveat at all. No p-value is reported: beats within
one episode are not independent samples (same underlying drift-and-reset
process), so a classical significance test's core assumption is violated
by construction -- reporting one would be a worse violation of "never
fabricate a claim" than simply omitting it.
"""
from typing import List, Optional, Tuple

import pandas as pd
from scipy.stats import spearmanr

from ..trajectory_features.types import Beat

DEFAULT_MIN_BEATS_FOR_CORRELATION = 5
ALEXANDERS_LAW_NOTE = (
    "Descriptive only, not diagnostic; beats within one episode are not independent "
    "samples, so no significance test is reported."
)


def _beats_with_slow_phase_positions(
    beats: List[Beat], seg_kin: pd.DataFrame, position_col: str = "x_px"
) -> List[Tuple[Beat, float]]:
    """(beat, mean_position) pairs for beats with >=1 sample in their
    slow-phase window -- kept paired so a caller can align a second
    per-beat quantity (e.g. |SPV|) without an index-mismatch risk from
    filtering the two independently.
    """
    pairs = []
    for b in beats:
        mask = (seg_kin["time_s"] >= b.slow_phase_start_s) & (seg_kin["time_s"] <= b.slow_phase_end_s)
        pos = seg_kin.loc[mask, position_col]
        if not pos.empty:
            pairs.append((b, float(pos.mean())))
    return pairs


def mean_slow_phase_positions(beats: List[Beat], seg_kin: pd.DataFrame, position_col: str = "x_px") -> List[float]:
    """Mean `position_col` during each beat's slow phase, one value per
    beat that has any samples in its slow-phase window (skips beats with
    none, rather than fabricating a position for them). Shared by
    `compute_alexanders_law_correlation` below and by
    `pipeline.py`'s per-episode `mean_gaze_position_px` -- one computation,
    not two potentially-divergent ones.
    """
    return [pos for _, pos in _beats_with_slow_phase_positions(beats, seg_kin, position_col)]


def compute_alexanders_law_correlation(
    beats: List[Beat],
    seg_kin: pd.DataFrame,
    position_col: str = "x_px",
    min_beats: int = DEFAULT_MIN_BEATS_FOR_CORRELATION,
) -> Tuple[Optional[float], int]:
    """Returns (spearman_rho_or_None, n_beats_used)."""
    pairs = _beats_with_slow_phase_positions(beats, seg_kin, position_col)
    if len(pairs) < min_beats:
        return None, len(pairs)

    positions = [pos for _, pos in pairs]
    magnitudes = [abs(b.slow_phase_velocity_px_s) for b, _ in pairs]
    rho, _ = spearmanr(positions, magnitudes)
    return float(rho), len(pairs)
