"""Periodic Alternating Nystagmus (PAN) pattern: fast-phase direction
reverses on a roughly regular cycle, with a genuine quiescent gap between
alternations (not just "direction changes somewhere in the recording").

Two coincidentally near-periodic, unrelated episodes could otherwise
pass an alternation+regularity check alone, so this also requires the
inter-episode gaps themselves to clear a minimum duration -- a real
null period, not segmentation jitter. The interval-regularity threshold
is its OWN documented heuristic, not reused from Stage 3's beat-level
`DEFAULT_MAX_BEAT_PERIOD_CV=0.4` (tuned for sub-second beat intervals,
not tens-of-seconds episode cycles -- reusing it unexamined would be
exactly the kind of unjustified constant-copying this codebase avoids).

No specific expected PAN period (e.g. "90-120s") is cited anywhere --
not confident enough in that number's sourcing to state it as fact.
"""
from typing import List, Optional

import numpy as np

from .types import PatternFinding

PATTERN_NAME = "periodic_alternating_nystagmus_pattern"
DEFAULT_MIN_ALTERNATIONS = 3
DEFAULT_MAX_EPISODE_PERIOD_CV = 0.5
DEFAULT_MIN_NULL_GAP_S = 0.5

CAVEAT = (
    "A strictly alternating fast-phase direction sequence with regular timing and "
    "consistent quiescent gaps between episodes is consistent with periodic alternating "
    "nystagmus (PAN), a specific central pattern -- but this few alternations is far short "
    "of a real PAN diagnosis, which classically requires multiple cycles observed over "
    "minutes. This pipeline has not been validated against a recording long enough to span "
    "multiple genuine PAN cycles, and the absence of this finding should not be read as "
    "ruling PAN out."
)


def detect_periodic_alternating_pattern(
    episodes: List[dict],
    min_alternations: int = DEFAULT_MIN_ALTERNATIONS,
    max_period_cv: float = DEFAULT_MAX_EPISODE_PERIOD_CV,
    min_null_gap_s: float = DEFAULT_MIN_NULL_GAP_S,
) -> Optional[PatternFinding]:
    directed = sorted(
        (e for e in episodes if e["dominant_fast_phase_direction"] in ("+x", "-x")),
        key=lambda e: e["start_s"],
    )
    if len(directed) < min_alternations:
        return None

    best_run = _longest_alternating_run(directed)
    if len(best_run) < min_alternations:
        return None

    starts = [e["start_s"] for e in best_run]
    intervals = np.diff(starts)
    if len(intervals) < 2 or np.mean(intervals) <= 0:
        return None
    cv = float(np.std(intervals) / np.mean(intervals))
    if cv > max_period_cv:
        return None

    gaps = [best_run[i + 1]["start_s"] - best_run[i]["end_s"] for i in range(len(best_run) - 1)]
    if any(g < min_null_gap_s for g in gaps):
        return None

    return PatternFinding(
        pattern=PATTERN_NAME,
        episode_indices=[e["episode_index"] for e in best_run],
        supporting_evidence={
            "alternation_count": len(best_run),
            "interval_cv": cv,
            "min_inter_episode_gap_s": float(min(gaps)),
            "direction_sequence": [e["dominant_fast_phase_direction"] for e in best_run],
        },
        caveat=CAVEAT,
    )


def _longest_alternating_run(directed_episodes: List[dict]) -> List[dict]:
    if not directed_episodes:
        return []
    best_run = [directed_episodes[0]]
    current_run = [directed_episodes[0]]
    for e in directed_episodes[1:]:
        if e["dominant_fast_phase_direction"] != current_run[-1]["dominant_fast_phase_direction"]:
            current_run.append(e)
        else:
            current_run = [e]
        if len(current_run) > len(best_run):
            best_run = current_run
    return best_run
