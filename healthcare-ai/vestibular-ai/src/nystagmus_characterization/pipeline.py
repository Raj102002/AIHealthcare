"""Stage 4 orchestrator: a Stage 1 trajectory.csv in, descriptive
nystagmus-episode characterization out.

Reuses Stage 2's calibration/kinematics and Stage 3's
classifier.extract_segment_episodes directly (the same "finer-grained
analysis of the same signal" reasoning Stage 3 used for reusing Stage 2)
-- but deliberately does NOT call Stage 3's full
MovementClassificationPipeline: none of this stage's four analyses
(shape, direction consistency, Alexander's Law, temporal trend) need the
fixation/motion split, saccade classification, or event timeline, only
the episode beat-lists extract_segment_episodes already provides.
Pendular episodes are out of scope by definition (no slow/fast structure
to characterize) -- noted as a standing caveat, not dynamically counted.
"""
import dataclasses
import json
from collections import Counter
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

from ..movement_classification import classifier
from ..trajectory_features import calibration as calibration_mod
from ..trajectory_features import kinematics
from ..trajectory_features.calibration import DEFAULT_ASSUMED_IRIS_MM
from ..trajectory_features.types import Beat
from . import alexanders_law, shape, trend
from .types import BeatShape, EpisodeCharacterization, NystagmusCharacterizationSummary

HORIZONTAL_ONLY_CAVEAT = (
    "Direction and shape analysis is horizontal-only (x_px) -- vertical (downbeat/upbeat) "
    "and torsional nystagmus are not characterized by this pipeline."
)
PENDULAR_EXCLUDED_CAVEAT = (
    "Only jerk-type nystagmus is characterized here; pendular nystagmus (if present) has "
    "no discrete beats and is not covered by this stage's shape/Alexander's-law/direction analyses."
)
SHAPE_DESCRIPTIVE_CAVEAT = (
    "Slow-phase waveform shape (linear/increasing-velocity/decreasing-velocity) is a "
    "descriptive signal only, not a diagnosis -- shape alone cannot establish central vs. "
    "peripheral origin without much more clinical context."
)
TREND_DESCRIPTIVE_CAVEAT = (
    "Temporal trend reflects one spontaneous recording, not a repeated-trial paradigm -- a "
    "trend could be fatigue, attention drift, recording-quality drift, or a genuine "
    "physiological process, and this pipeline can't distinguish among them."
)
NO_EPISODES_CAVEAT = "No jerk-nystagmus episodes were detected in this recording; characterization is not applicable."

EPISODE_CSV_COLUMNS = [
    "episode_index",
    "segment_id",
    "start_s",
    "end_s",
    "beat_count",
    "dominant_fast_phase_direction",
    "dominant_slow_phase_shape",
    "shape_homogeneous",
    "alexanders_law_correlation",
    "n_beats_used_for_correlation",
    "mean_gaze_position_px",
    "shape_count_linear",
    "shape_count_increasing_velocity",
    "shape_count_decreasing_velocity",
    "shape_count_indeterminate",
]


def _dominant_direction(directions: List[str]) -> str:
    counts = Counter(directions).most_common()
    if len(counts) > 1 and counts[0][1] == counts[1][1]:
        return "mixed"
    return counts[0][0]


def _dominant_shape(shapes: List[str]) -> Tuple[str, bool]:
    counts = Counter(shapes).most_common()
    total = sum(c for _, c in counts)
    dominant = "mixed" if len(counts) > 1 and counts[0][1] == counts[1][1] else counts[0][0]
    homogeneous = not (len(counts) > 1 and counts[1][1] / total >= 1 / 3)
    return dominant, homogeneous


class NystagmusCharacterizationPipeline:
    def __init__(
        self,
        assumed_iris_mm: float = DEFAULT_ASSUMED_IRIS_MM,
        working_distance_mm: Optional[float] = None,
        deg_per_px: Optional[float] = None,
        min_confidence: float = kinematics.DEFAULT_MIN_CONFIDENCE,
        min_beats_local: int = classifier.DEFAULT_MIN_BEATS_LOCAL,
        max_beat_period_cv: float = classifier.DEFAULT_MAX_BEAT_PERIOD_CV,
        max_intra_episode_gap_s: float = classifier.DEFAULT_MAX_INTRA_EPISODE_GAP_S,
        min_samples_for_shape_fit: int = shape.DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT,
        min_r_squared_improvement: float = shape.DEFAULT_MIN_R_SQUARED_IMPROVEMENT,
        min_beats_for_correlation: int = alexanders_law.DEFAULT_MIN_BEATS_FOR_CORRELATION,
        min_episodes_for_trend: int = trend.DEFAULT_MIN_EPISODES_FOR_TREND,
        trend_threshold: float = trend.DEFAULT_TREND_THRESHOLD,
    ):
        self.assumed_iris_mm = assumed_iris_mm
        self.working_distance_mm = working_distance_mm
        self.deg_per_px = deg_per_px
        self.min_confidence = min_confidence
        self.min_beats_local = min_beats_local
        self.max_beat_period_cv = max_beat_period_cv
        self.max_intra_episode_gap_s = max_intra_episode_gap_s
        self.min_samples_for_shape_fit = min_samples_for_shape_fit
        self.min_r_squared_improvement = min_r_squared_improvement
        self.min_beats_for_correlation = min_beats_for_correlation
        self.min_episodes_for_trend = min_episodes_for_trend
        self.trend_threshold = trend_threshold

    def process_trajectory(self, trajectory_csv: str, output_dir: str) -> dict:
        df = pd.read_csv(trajectory_csv)
        cal = calibration_mod.calibrate(
            df,
            assumed_iris_mm=self.assumed_iris_mm,
            working_distance_mm=self.working_distance_mm,
            deg_per_px_override=self.deg_per_px,
        )
        kin_df = kinematics.compute_kinematics(df, cal, min_confidence=self.min_confidence)
        return self.process_kinematics(kin_df, cal, output_dir)

    def process_kinematics(self, kin_df: pd.DataFrame, calibration, output_dir: str) -> dict:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        segment_episodes = classifier.extract_segment_episodes(
            kin_df,
            calibration,
            min_beats_local=self.min_beats_local,
            max_beat_period_cv=self.max_beat_period_cv,
            max_intra_episode_gap_s=self.max_intra_episode_gap_s,
        )

        episodes: List[EpisodeCharacterization] = []
        mean_spv_magnitudes: List[float] = []

        for seg_id, clusters in segment_episodes.items():
            seg_kin = kin_df[kin_df["segment_id"] == seg_id].reset_index(drop=True)
            for beats in clusters:
                beat_shapes = [self._classify_one_beat_shape(b, seg_kin) for b in beats]
                shape_counts = dict(Counter(bs.shape for bs in beat_shapes))
                dominant_shape, homogeneous = _dominant_shape([bs.shape for bs in beat_shapes])
                dominant_direction = _dominant_direction([b.fast_phase_direction for b in beats])
                rho, n_used = alexanders_law.compute_alexanders_law_correlation(
                    beats, seg_kin, min_beats=self.min_beats_for_correlation
                )
                gaze_positions = alexanders_law.mean_slow_phase_positions(beats, seg_kin)
                mean_gaze_position = float(np.mean(gaze_positions)) if gaze_positions else None

                episodes.append(
                    EpisodeCharacterization(
                        episode_index=-1,  # renumbered below
                        segment_id=int(seg_id),
                        start_s=float(beats[0].slow_phase_start_s),
                        end_s=float(beats[-1].fast_phase_end_s),
                        beat_count=len(beats),
                        dominant_fast_phase_direction=dominant_direction,
                        dominant_slow_phase_shape=dominant_shape,
                        shape_counts=shape_counts,
                        shape_homogeneous=homogeneous,
                        alexanders_law_correlation=rho,
                        n_beats_used_for_correlation=n_used,
                        mean_gaze_position_px=mean_gaze_position,
                        beat_shapes=beat_shapes,
                    )
                )
                mean_spv_magnitudes.append(float(np.mean([abs(b.slow_phase_velocity_px_s) for b in beats])))

        episodes.sort(key=lambda e: e.start_s)
        for i, e in enumerate(episodes):
            e.episode_index = i

        direction_consistency = self._direction_consistency(episodes)
        temporal_trend, relative_change = trend.classify_temporal_trend(
            [e.start_s for e in episodes],
            mean_spv_magnitudes,
            min_episodes=self.min_episodes_for_trend,
            threshold=self.trend_threshold,
        )

        caveats = [HORIZONTAL_ONLY_CAVEAT, PENDULAR_EXCLUDED_CAVEAT, SHAPE_DESCRIPTIVE_CAVEAT, TREND_DESCRIPTIVE_CAVEAT]
        if not episodes:
            caveats.append(NO_EPISODES_CAVEAT)

        summary = NystagmusCharacterizationSummary(
            n_jerk_episodes=len(episodes),
            episodes=episodes,
            direction_consistency=direction_consistency,
            temporal_trend=temporal_trend,
            temporal_trend_relative_change=relative_change,
            caveats=caveats,
        )

        episodes_path = output_dir / "episode_characterization.csv"
        if episodes:
            pd.DataFrame([e.as_row() for e in episodes]).to_csv(episodes_path, index=False)
        else:
            pd.DataFrame(columns=EPISODE_CSV_COLUMNS).to_csv(episodes_path, index=False)

        summary_path = output_dir / "nystagmus_characterization_summary.json"
        with open(summary_path, "w") as f:
            json.dump(dataclasses.asdict(summary), f, indent=2)

        result = dataclasses.asdict(summary)
        result.update({"episode_characterization_path": str(episodes_path), "characterization_summary_path": str(summary_path)})
        return result

    def _classify_one_beat_shape(self, beat: Beat, seg_kin: pd.DataFrame) -> BeatShape:
        mask = (seg_kin["time_s"] >= beat.slow_phase_start_s) & (seg_kin["time_s"] <= beat.slow_phase_end_s)
        sub = seg_kin.loc[mask]
        label, tau, r2 = shape.classify_beat_shape(
            sub["time_s"].to_numpy(),
            sub["x_px"].to_numpy(),
            beat.r_squared,
            min_samples=self.min_samples_for_shape_fit,
            min_r_squared_improvement=self.min_r_squared_improvement,
        )
        return BeatShape(beat_index=beat.beat_index, shape=label, tau_s=tau, r_squared=r2)

    @staticmethod
    def _direction_consistency(episodes: List[EpisodeCharacterization]) -> str:
        if len(episodes) < 2:
            return "indeterminate"
        non_mixed = {e.dominant_fast_phase_direction for e in episodes if e.dominant_fast_phase_direction != "mixed"}
        if not non_mixed:
            return "indeterminate"
        return "direction_fixed" if len(non_mixed) == 1 else "direction_changing"
