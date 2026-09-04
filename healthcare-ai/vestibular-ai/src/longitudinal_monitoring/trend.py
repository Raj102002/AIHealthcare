"""Reuses Stage 4's classify_temporal_trend directly -- a between-session
trend is structurally the same problem as Stage 4's within-recording
episode-to-episode trend, one level up (sessions instead of episodes).
Deliberately NOT reusing Stage 4's DEFAULT_TREND_THRESHOLD/
DEFAULT_MIN_EPISODES_FOR_TREND by import: between-session noise
(different calibration, lighting, day-to-day physiology) is a different
noise regime than within-recording episode noise -- the same reasoning
Stage 5's pan_pattern.py used to justify its own interval-CV threshold
instead of reusing Stage 3's beat-level one.

The underlying formula (relative_change = slope * span / median) is
dimensionless and invariant to any linear rescaling of the x-axis, so
converting session_date strings to ordinal-day integers doesn't change
the result numerically -- it's just a convenient, monotonic numeric
x-axis for scipy.stats.theilslopes underneath.
"""
from datetime import date
from typing import List, Optional, Tuple

from ..nystagmus_characterization.trend import classify_temporal_trend

DEFAULT_MIN_SESSIONS_FOR_TREND = 3
DEFAULT_LONGITUDINAL_TREND_THRESHOLD = 0.3


def classify_longitudinal_trend(
    session_dates: List[str],
    spv_magnitudes: List[float],
    min_sessions: int = DEFAULT_MIN_SESSIONS_FOR_TREND,
    threshold: float = DEFAULT_LONGITUDINAL_TREND_THRESHOLD,
) -> Tuple[str, Optional[float]]:
    ordinals = [float(date.fromisoformat(d).toordinal()) for d in session_dates]
    return classify_temporal_trend(ordinals, spv_magnitudes, min_episodes=min_sessions, threshold=threshold)
