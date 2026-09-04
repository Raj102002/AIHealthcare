"""Central/gaze-evoked pattern findings.

Two independent, hedged signals feed into this, deliberately kept
separate rather than merged into one boolean:

1. Per-episode slow-phase shape: an increasing-velocity (exponential)
   slow phase is classically associated with a gaze-evoked/central
   pattern (an unstable "leaky neural integrator") -- Stage 4 already
   documents this hedge; it's carried forward verbatim here, not
   paraphrased more confidently.
2. Cross-episode gaze-position linkage: gaze-evoked nystagmus is defined
   by fast-phase direction TRACKING eye position (right-beating on right
   gaze, left-beating on left gaze) -- NOT merely by direction differing
   somewhere in a recording. Stage 4's `direction_consistency ==
   "direction_changing"` only means "two accepted episodes had different
   dominant directions" -- confirmed against this project's own existing
   test suite, two same-gaze-position, opposite-direction episodes 3s
   apart already produce "direction_changing". Naming that scenario
   "central_gaze_evoked_pattern" without checking the position link would
   be indefensible, so `central_gaze_evoked_pattern` only fires when
   direction-grouped episodes also show a real, direction-matched
   separation in mean gaze position; otherwise the weaker, explicitly
   hedged `direction_changing_unexplained` fires instead.
"""
from typing import List, Optional

import numpy as np

from .types import PatternFinding

SHAPE_PATTERN_NAME = "central_pattern_consistent_shape"
GAZE_EVOKED_PATTERN_NAME = "central_gaze_evoked_pattern"
UNEXPLAINED_PATTERN_NAME = "direction_changing_unexplained"

# Documented heuristics, not literature-tuned: when both direction groups
# have >=2 episodes, require the between-group position separation to be
# at least this many pooled within-group standard deviations (a Cohen's-
# d-style effect size); otherwise (too little data to estimate spread)
# fall back to a minimum absolute pixel separation. Raw pixels, not
# calibrated to mm/deg -- meaningfulness depends on the recording setup.
DEFAULT_MIN_EFFECT_SIZE = 1.0
DEFAULT_MIN_SEPARATION_PX = 15.0

SHAPE_CAVEAT = (
    "An increasing-velocity (exponential) slow phase is classically associated with a "
    "gaze-evoked/central pattern (an unstable 'leaky neural integrator'), but shape alone "
    "cannot establish central origin without much more clinical context."
)
GAZE_EVOKED_CAVEAT = (
    "Fast-phase direction differs across episodes AND tracks a real, direction-matched "
    "difference in mean gaze position -- consistent with gaze-evoked nystagmus. This "
    "project has no record of an instructed gaze target, only measured eye position, and "
    "the position values are raw image-space pixels, not calibrated to a physical unit -- "
    "this is a pattern-matching signal, not a diagnosis."
)
UNEXPLAINED_CAVEAT = (
    "Fast-phase direction differs across episodes in this recording, but no direction-"
    "matched difference in gaze position was found -- direction differing over time alone "
    "does not establish gaze-evoked nystagmus, which requires direction to track eye position."
)


def _gaze_direction_linkage(
    episodes: List[dict],
    min_effect_size: float = DEFAULT_MIN_EFFECT_SIZE,
    min_separation_px: float = DEFAULT_MIN_SEPARATION_PX,
) -> Optional[dict]:
    plus = [
        e["mean_gaze_position_px"]
        for e in episodes
        if e["dominant_fast_phase_direction"] == "+x" and e["mean_gaze_position_px"] is not None
    ]
    minus = [
        e["mean_gaze_position_px"]
        for e in episodes
        if e["dominant_fast_phase_direction"] == "-x" and e["mean_gaze_position_px"] is not None
    ]
    if not plus or not minus:
        return None

    mean_plus, mean_minus = float(np.mean(plus)), float(np.mean(minus))
    # Gaze-evoked nystagmus beats TOWARD the direction of gaze -- "+x"-beating
    # episodes should occupy higher mean gaze position than "-x"-beating
    # ones. The wrong-direction relationship isn't gaze-evoked-consistent
    # regardless of separation size.
    if mean_plus <= mean_minus:
        return None

    separation = mean_plus - mean_minus
    spreads = [float(np.std(g)) for g in (plus, minus) if len(g) >= 2]
    if spreads:
        scale = max(float(np.mean(spreads)), 1e-9)
        strong_enough = (separation / scale) >= min_effect_size
    else:
        strong_enough = separation >= min_separation_px

    if not strong_enough:
        return None
    return {
        "mean_position_plus_x_px": mean_plus,
        "mean_position_minus_x_px": mean_minus,
        "separation_px": separation,
        "n_plus_x_episodes": len(plus),
        "n_minus_x_episodes": len(minus),
    }


def detect_central_pattern_findings(
    summary: dict,
    min_effect_size: float = DEFAULT_MIN_EFFECT_SIZE,
    min_separation_px: float = DEFAULT_MIN_SEPARATION_PX,
) -> List[PatternFinding]:
    findings: List[PatternFinding] = []
    episodes = summary.get("episodes", [])

    for e in episodes:
        if e["dominant_slow_phase_shape"] == "increasing_velocity":
            findings.append(
                PatternFinding(
                    pattern=SHAPE_PATTERN_NAME,
                    episode_indices=[e["episode_index"]],
                    supporting_evidence={"dominant_slow_phase_shape": "increasing_velocity", "beat_count": e["beat_count"]},
                    caveat=SHAPE_CAVEAT,
                )
            )

    if summary.get("direction_consistency") == "direction_changing":
        linkage = _gaze_direction_linkage(episodes, min_effect_size, min_separation_px)
        directed_indices = [e["episode_index"] for e in episodes if e["dominant_fast_phase_direction"] in ("+x", "-x")]
        if linkage is not None:
            findings.append(
                PatternFinding(
                    pattern=GAZE_EVOKED_PATTERN_NAME,
                    episode_indices=directed_indices,
                    supporting_evidence=linkage,
                    caveat=GAZE_EVOKED_CAVEAT,
                )
            )
        else:
            findings.append(
                PatternFinding(
                    pattern=UNEXPLAINED_PATTERN_NAME,
                    episode_indices=directed_indices,
                    supporting_evidence={"direction_consistency": "direction_changing", "gaze_position_linkage_established": False},
                    caveat=UNEXPLAINED_CAVEAT,
                )
            )

    return findings
