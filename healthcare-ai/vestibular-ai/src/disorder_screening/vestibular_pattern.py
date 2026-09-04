"""Vestibular-type jerk-nystagmus pattern: direction-fixed nystagmus with
a linear (constant-velocity) slow phase is the classic vestibular
signature -- but that alone doesn't distinguish PERIPHERAL from
CENTRAL-vestibular origin (both can produce it); that classically needs
fixation-suppression testing and/or positional/caloric data this
pipeline structurally cannot capture. Alexander's Law (intensity rising
toward the fast-phase side) is supporting, not required, evidence -- it
is also reported with some central/cerebellar lesions, so it isn't
dispositive either.
"""
from typing import List, Optional

from .types import PatternFinding

PATTERN_NAME = "vestibular_type_pattern"
CAVEAT = (
    "Direction-fixed jerk nystagmus with a linear (constant-velocity) slow phase is "
    "consistent with a vestibular-type pattern, but this cannot distinguish peripheral "
    "from central-vestibular origin -- that classically requires fixation-suppression "
    "testing and/or positional/caloric data this pipeline does not have. Alexander's Law "
    "alignment (when available) is supporting evidence only, not required or dispositive."
)


def detect_vestibular_type_pattern(summary: dict) -> Optional[PatternFinding]:
    # Deliberately NOT gated on summary["direction_consistency"] == "direction_fixed":
    # Stage 4 reports "indeterminate" (not "direction_fixed") for a recording with
    # only one accepted episode, since cross-episode CONSISTENCY is meaningless with
    # n=1 -- but a single sustained direction-fixed linear episode is the single most
    # common real-world presentation of vestibular nystagmus, and excluding it here
    # would make the most canonical case never detectable. Compute uniformity
    # directly instead: reject only when Stage 4 explicitly found >=2 DIFFERENT
    # directions ("direction_changing"); a lone episode or an all-agreeing set both
    # pass.
    if summary.get("direction_consistency") == "direction_changing":
        return None

    linear_episodes = [e for e in summary.get("episodes", []) if e["dominant_slow_phase_shape"] == "linear"]
    if not linear_episodes:
        return None

    aligned, considered = _alexanders_law_alignment(linear_episodes)

    return PatternFinding(
        pattern=PATTERN_NAME,
        episode_indices=[e["episode_index"] for e in linear_episodes],
        supporting_evidence={
            "direction_consistency": summary.get("direction_consistency"),
            "linear_shape_episode_count": len(linear_episodes),
            "alexanders_law_aligned_episodes": aligned,
            "alexanders_law_considered_episodes": considered,
        },
        caveat=CAVEAT,
    )


def _alexanders_law_alignment(episodes: List[dict]) -> tuple:
    """Counts episodes whose (sign-corrected) Alexander's Law correlation
    is positive, out of episodes where a correlation was available at
    all. The stored `alexanders_law_correlation` is UNSIGNED with respect
    to direction (Stage 4 computes plain corr(gaze_position, |SPV|)) --
    Alexander's Law predicts the *sign* of that relationship flips with
    fast-phase direction (intensity rises toward the fast-phase side), so
    the raw stored sign must be flipped for "-x" episodes before it means
    anything as supporting evidence. Using the raw sign uncorrected would
    be backwards for roughly half of all real "-x" episodes.
    """
    aligned, considered = 0, 0
    for e in episodes:
        rho = e.get("alexanders_law_correlation")
        direction = e.get("dominant_fast_phase_direction")
        if rho is None or direction not in ("+x", "-x"):
            continue
        considered += 1
        aligned_rho = rho if direction == "+x" else -rho
        if aligned_rho > 0:
            aligned += 1
    return aligned, considered
