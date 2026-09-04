"""Per-motion-run classification: is this run a saccade, a genuine
rhythmic nystagmus beat pattern (jerk or pendular), or sustained
drift/pursuit with no clear structure?

Reuses Stage 2's segmentation.detect_beats / classify_waveform directly
(see run_kin's segment_id trick below) rather than reimplementing
threshold/FFT logic -- Stage 3 is the same machinery at finer time
granularity, not a separate algorithm.
"""
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from ..trajectory_features import pendular, segmentation
from ..trajectory_features.types import Beat, CalibrationResult
from .types import MovementEvent

DEFAULT_MIN_BEATS_LOCAL = 2
DEFAULT_MAX_SACCADE_DURATION_S = 0.15
# Beats whose gap (previous beat's fast-phase end -> next beat's
# slow-phase start) is within this many seconds are considered part of
# the same candidate episode. Deliberately generous (real back-to-back
# nystagmus beats in this codebase's own sawtooth tests are ~0.02s apart)
# -- an over-generous cluster that accidentally bridges two unrelated
# episodes still gets rejected by beats_are_regular below, so this value
# mainly needs to avoid comparing beats that are obviously unrelated for
# regularity at all, not to precisely delimit episode boundaries itself.
DEFAULT_MAX_INTRA_EPISODE_GAP_S = 0.5
# Coefficient of variation of inter-beat-start intervals. min_beats_local
# alone isn't sufficient protection against misclassifying a saccade as
# nystagmus: a single ballistic movement's Savitzky-Golay-smoothed
# velocity profile is a smooth ramp-up/peak/ramp-down bump, which can
# produce exactly ONE spurious (slow, fast) pair -- but never two, since
# one bump only has one rising edge. Two "beats" that aren't actually
# periodic (e.g. a saccade plus an unrelated later micro-saccade) would
# still pass a bare min_beats_local>=2 check without this gate.
DEFAULT_MAX_BEAT_PERIOD_CV = 0.4
# Stage 2's pendular.MIN_SPECTRUM_SAMPLES=8 is calibrated for whole-file
# analysis, where reaching even 8 samples already implies a reasonably
# long recording. Local motion runs can be far shorter: empirically, a
# ~21-frame (0.35s) pure-noise leftover run was misclassified
# "nystagmus_pendular" because so few FFT bins make a spuriously large
# peak-vs-baseline ratio common by chance (fewer bins also means the
# "baseline" -- the median of the rest -- is itself a noisy estimate).
# This raises the bar specifically for the local check; Stage 2's own
# whole-file threshold is untouched.
DEFAULT_MIN_SAMPLES_FOR_LOCAL_PENDULAR = 30


def beats_are_regular(beats: List[Beat], max_cv: float = DEFAULT_MAX_BEAT_PERIOD_CV) -> bool:
    """True only if inter-beat-start intervals are consistent (low
    coefficient of variation) -- nystagmus is defined by rhythmicity, not
    merely "two beat-shaped events exist somewhere in this window."
    Conservatively False (not True) for < 2 beats: regularity can't be
    confirmed from a single interval, and this codebase doesn't claim
    things it can't verify.
    """
    if len(beats) < 2:
        return False
    starts = sorted(b.fast_phase_start_s for b in beats)
    periods = np.diff(starts)
    mean_period = float(np.mean(periods))
    if mean_period <= 0:
        return False
    return float(np.std(periods) / mean_period) <= max_cv


def cluster_beats_into_episodes(
    beats: List[Beat],
    min_beats_local: int = DEFAULT_MIN_BEATS_LOCAL,
    max_beat_period_cv: float = DEFAULT_MAX_BEAT_PERIOD_CV,
    max_intra_episode_gap_s: float = DEFAULT_MAX_INTRA_EPISODE_GAP_S,
) -> List[List[Beat]]:
    """Groups temporally-close beats (already filtered to good-fit ones by
    the caller) into candidate episodes by proximity, then keeps only the
    clusters that are both long enough (`min_beats_local`) and rhythmic
    (`beats_are_regular`) -- run directly on a whole Stage-2 segment's
    beats, so a nystagmus episode embedded in an otherwise-normal
    recording is recovered as ONE contiguous event instead of being cut
    into alternating fixation/saccade slivers by a fixed speed threshold
    that can't tell slow-phase drift from real rest (see pipeline.py).
    """
    ordered = sorted(beats, key=lambda b: b.slow_phase_start_s)
    clusters: List[List[Beat]] = []
    for b in ordered:
        if clusters and (b.slow_phase_start_s - clusters[-1][-1].fast_phase_end_s) <= max_intra_episode_gap_s:
            clusters[-1].append(b)
        else:
            clusters.append([b])

    return [
        cluster
        for cluster in clusters
        if len(cluster) >= min_beats_local and beats_are_regular(cluster, max_beat_period_cv)
    ]


def extract_segment_episodes(
    kin_df: pd.DataFrame,
    calibration: Optional[CalibrationResult] = None,
    min_beats_local: int = DEFAULT_MIN_BEATS_LOCAL,
    max_beat_period_cv: float = DEFAULT_MAX_BEAT_PERIOD_CV,
    max_intra_episode_gap_s: float = DEFAULT_MAX_INTRA_EPISODE_GAP_S,
) -> Dict[object, List[List[Beat]]]:
    """Per Stage-2 segment: detect_beats -> filter to r_squared-good ->
    cluster into accepted episodes. Shared by MovementClassificationPipeline
    (Stage 3) and NystagmusCharacterizationPipeline (Stage 4) so both see
    IDENTICAL episodes for the same recording -- extracted from what used
    to be Stage 3's inlined per-segment loop. A caller re-deriving this
    independently (skipping the per-segment scoping, or the r_squared
    pre-filter) would silently diverge: pooling beats across segments risks
    merging two unrelated episodes across a gap Stage 3 would never cross,
    and skipping the pre-filter lets poorly-fit "beats" pollute the
    regularity check.
    """
    episodes: Dict[object, List[List[Beat]]] = {}
    included = kin_df[kin_df["included"]]
    for seg_id in sorted(included["segment_id"].unique()):
        seg_kin = kin_df[kin_df["segment_id"] == seg_id].reset_index(drop=True)
        seg_beats = segmentation.detect_beats(seg_kin, calibration=calibration)
        seg_good_beats = [b for b in seg_beats if b.r_squared >= segmentation.DEFAULT_MIN_R_SQUARED]
        episodes[seg_id] = cluster_beats_into_episodes(
            seg_good_beats,
            min_beats_local=min_beats_local,
            max_beat_period_cv=max_beat_period_cv,
            max_intra_episode_gap_s=max_intra_episode_gap_s,
        )
    return episodes


def _jerk_stats(beats: List[Beat]) -> dict:
    mm_vals = [b.slow_phase_velocity_mm_s for b in beats if b.slow_phase_velocity_mm_s is not None]
    deg_vals = [b.slow_phase_velocity_deg_s for b in beats if b.slow_phase_velocity_deg_s is not None]
    directions = [b.fast_phase_direction for b in beats]
    return {
        "beat_count": len(beats),
        "mean_slow_phase_velocity_px_s": float(np.mean([b.slow_phase_velocity_px_s for b in beats])),
        "mean_slow_phase_velocity_mm_s": float(np.mean(mm_vals)) if mm_vals else None,
        "mean_slow_phase_velocity_deg_s": float(np.mean(deg_vals)) if deg_vals else None,
        "dominant_fast_phase_direction": max(set(directions), key=directions.count),
    }


def build_episode_event(run_sub: pd.DataFrame, beats: List[Beat]) -> MovementEvent:
    """Builds a "nystagmus_jerk" MovementEvent directly from an
    already-accepted beat cluster (see cluster_beats_into_episodes),
    instead of re-running detect_beats on the narrowed clip -- a clip
    trimmed to exactly the beat span has no genuine low-speed baseline
    left in it at all, which would bias detect_beats' own self-calibrating
    threshold the same way windowing.py's fixation/motion threshold can
    (see pipeline.py's docstring on the no-quiet-baseline failure mode).
    Reusing the beats already found against the untrimmed segment avoids
    that risk entirely.
    """
    t = run_sub["time_s"].to_numpy()
    speed = run_sub["speed_px_s"].to_numpy()
    return MovementEvent(
        event_index=-1,
        label="nystagmus_jerk",
        start_frame=int(run_sub["frame"].iloc[0]),
        end_frame=int(run_sub["frame"].iloc[-1]),
        start_s=float(t[0]),
        end_s=float(t[-1]),
        duration_s=float(t[-1] - t[0]),
        mean_speed_px_s=float(np.mean(speed)),
        peak_speed_px_s=float(np.max(speed)),
        **_jerk_stats(beats),
    )


def classify_motion_run(
    run_kin: pd.DataFrame,
    calibration: Optional[CalibrationResult],
    min_beats_local: int = DEFAULT_MIN_BEATS_LOCAL,
    max_saccade_duration_s: float = DEFAULT_MAX_SACCADE_DURATION_S,
    max_beat_period_cv: float = DEFAULT_MAX_BEAT_PERIOD_CV,
    min_samples_for_local_pendular: int = DEFAULT_MIN_SAMPLES_FOR_LOCAL_PENDULAR,
) -> MovementEvent:
    run_kin = run_kin.reset_index(drop=True).assign(segment_id=0)  # one run == one segment for detect_beats' grouping

    t = run_kin["time_s"].to_numpy()
    speed = run_kin["speed_px_s"].to_numpy()
    start_frame, end_frame = int(run_kin["frame"].iloc[0]), int(run_kin["frame"].iloc[-1])
    start_s, end_s = float(t[0]), float(t[-1])
    duration_s = end_s - start_s
    mean_speed = float(np.mean(speed))
    peak_speed = float(np.max(speed))

    def _event(label: str, **extra) -> MovementEvent:
        return MovementEvent(
            event_index=-1,  # renumbered by the pipeline once all events are assembled
            label=label,
            start_frame=start_frame,
            end_frame=end_frame,
            start_s=start_s,
            end_s=end_s,
            duration_s=duration_s,
            mean_speed_px_s=mean_speed,
            peak_speed_px_s=peak_speed,
            **extra,
        )

    # Stage 2's own duration floors are kept unchanged here (not shrunk
    # for "more sensitive" local detection): min_slow_phase_duration_s is
    # what merges a saccade's brief ramp-up into its fast run before it
    # can even form a spurious (slow, fast) pair -- lowering it would
    # reopen exactly the false-positive risk this module exists to avoid.
    beats = segmentation.detect_beats(run_kin, calibration=calibration)
    good_beats = [b for b in beats if b.r_squared >= segmentation.DEFAULT_MIN_R_SQUARED]

    if len(good_beats) >= min_beats_local and beats_are_regular(good_beats, max_beat_period_cv):
        return _event("nystagmus_jerk", **_jerk_stats(good_beats))

    if duration_s <= max_saccade_duration_s:
        return _event("saccade")

    # Passing beats=[] forces classify_waveform past its jerk branch
    # (len([]) < any positive min_beats) straight to its FFT
    # peak-strength check -- reuses that logic instead of duplicating it.
    if len(run_kin) >= min_samples_for_local_pendular:
        classification = segmentation.classify_waveform(run_kin, beats=[])
        if classification == "pendular":
            summary = pendular.analyze_pendular(run_kin, calibration=calibration)
            if summary is not None:
                return _event("nystagmus_pendular", dominant_frequency_hz=summary.dominant_frequency_hz)

    return _event("smooth_pursuit_or_drift")
