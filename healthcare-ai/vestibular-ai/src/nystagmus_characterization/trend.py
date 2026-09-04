"""Temporal trend (waxing/waning) of nystagmus intensity across episodes
in one recording.

Uses Theil-Sen (median of pairwise slopes), not ordinary least squares --
matches this codebase's existing preference for robust statistics
(median+MAD elsewhere) over a mean-based fit one outlier episode could
dominate. Deliberately avoids the word "habituation": this is one
spontaneous recording, not a repeated-trial paradigm, so a trend could
reflect fatigue, attention drift, recording-quality drift, or a genuine
physiological process, and this pipeline has no way to distinguish
among them -- callers must carry that caveat forward.
"""
from typing import List, Optional, Tuple

import numpy as np
from scipy.stats import theilslopes

DEFAULT_MIN_EPISODES_FOR_TREND = 3
# Net fractional change in SPV magnitude over the recording, relative to
# its typical level, needed to call a trend "waxing"/"waning" rather than
# "stable" -- a documented-but-arbitrary bar (same status as
# max_beat_period_cv=0.4 elsewhere), not tuned against any ground truth.
DEFAULT_TREND_THRESHOLD = 0.3


def classify_temporal_trend(
    episode_starts: List[float],
    spv_magnitudes: List[float],
    min_episodes: int = DEFAULT_MIN_EPISODES_FOR_TREND,
    threshold: float = DEFAULT_TREND_THRESHOLD,
) -> Tuple[str, Optional[float]]:
    """Returns ("waxing"|"waning"|"stable"|"indeterminate", relative_change_or_None).

    `min_episodes=3` is deliberate, not just "more is better": two points
    always form a perfectly-fit "trend" with zero ability to distinguish
    signal from noise, and Theil-Sen needs at least 3 points (3 pairwise
    slopes) before "robust median-of-slopes" means anything at all.
    """
    if len(episode_starts) < min_episodes:
        return "indeterminate", None

    median_spv = float(np.median(spv_magnitudes))
    if median_spv == 0:
        return "indeterminate", None

    slope, _, _, _ = theilslopes(spv_magnitudes, episode_starts)
    span = episode_starts[-1] - episode_starts[0]
    relative_change = float(slope * span / median_spv)

    if relative_change > threshold:
        return "waxing", relative_change
    if relative_change < -threshold:
        return "waning", relative_change
    return "stable", relative_change
