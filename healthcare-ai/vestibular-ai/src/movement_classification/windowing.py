"""Fixation/motion split within one Stage-2 segment.

Same statistic family as segmentation.py's fast/slow-phase threshold
(self-calibrating median+MAD, not a fixed px/s or deg/s constant this
codebase has no basis for) and the same known failure mode one level up:
if a segment is genuinely motion-dominated (continuous nystagmus for
most of the recording, or a long pursuit task), the median drifts into
motion territory and the threshold rises, under-detecting real motion.
Not solved here with a fancier bimodal/Otsu-style threshold -- that's
real complexity to tune against zero ground truth, and this project's
precedent (see pendular.py's docstring) is not to reach for
sophistication until a simpler approach demonstrably fails. Instead:
`k_fix` is tunable, and pipeline.py adds an explicit caveat to the
output whenever a segment ends up majority "motion" (see
DOMINANT_MOTION_FRACTION_CAVEAT there) so the limitation is inspectable,
not silently wrong.
"""
from typing import List, Tuple

import numpy as np
import pandas as pd
from scipy.stats import median_abs_deviation

from ..trajectory_features import run_utils

DEFAULT_K_FIX = 3.0
DEFAULT_MIN_FIXATION_DURATION_S = 0.1
DEFAULT_MIN_MOTION_DURATION_S = 0.05


def split_fixation_motion(
    kin_segment: pd.DataFrame,
    speed_col: str = "speed_px_s",
    k_fix: float = DEFAULT_K_FIX,
    min_fixation_s: float = DEFAULT_MIN_FIXATION_DURATION_S,
    min_motion_s: float = DEFAULT_MIN_MOTION_DURATION_S,
) -> List[Tuple[int, int, str]]:
    """Returns (start, end_exclusive, label) runs -- positional indices
    into `kin_segment` -- labeling each maximal contiguous stretch
    "fixation" or "motion". `kin_segment` must already be one Stage-2
    segment's included=True rows (contiguous, no gaps).
    """
    speed = kin_segment[speed_col].to_numpy()
    t = kin_segment["time_s"].to_numpy()

    threshold = float(np.median(speed) + k_fix * median_abs_deviation(speed, scale="normal"))
    is_motion = run_utils.merge_short_runs(
        speed > threshold, t, min_motion_s, min_fixation_s, "motion", "fixation"
    )
    return run_utils.label_runs(is_motion, "motion", "fixation")
