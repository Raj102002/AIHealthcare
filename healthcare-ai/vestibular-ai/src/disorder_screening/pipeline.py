"""Stage 5 orchestrator: a Stage 1 trajectory.csv in, unimodal disorder-
pattern screening out.

Runs Stage 4's full NystagmusCharacterizationPipeline (unlike Stage 3->4,
Stage 5 legitimately needs Stage 4's complete per-episode characterization,
not just a lower-level primitive), then pattern-matches the result against
literature-described eye-movement signatures. Every finding is a
"consistent with" descriptive flag, never a diagnosis -- see DISCLAIMER
and MODALITY_LIMITATION below, always present in every output.
"""
import dataclasses
import json
from pathlib import Path
from typing import Optional

from ..movement_classification.classifier import (
    DEFAULT_MAX_BEAT_PERIOD_CV,
    DEFAULT_MAX_INTRA_EPISODE_GAP_S,
    DEFAULT_MIN_BEATS_LOCAL,
)
from ..nystagmus_characterization.alexanders_law import DEFAULT_MIN_BEATS_FOR_CORRELATION
from ..nystagmus_characterization.pipeline import NystagmusCharacterizationPipeline
from ..nystagmus_characterization.shape import DEFAULT_MIN_R_SQUARED_IMPROVEMENT, DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT
from ..nystagmus_characterization.trend import DEFAULT_MIN_EPISODES_FOR_TREND, DEFAULT_TREND_THRESHOLD
from ..trajectory_features.calibration import DEFAULT_ASSUMED_IRIS_MM
from ..trajectory_features.kinematics import DEFAULT_MIN_CONFIDENCE
from . import gaze_evoked_pattern, not_assessable, pan_pattern, vestibular_pattern
from .gaze_evoked_pattern import DEFAULT_MIN_EFFECT_SIZE, DEFAULT_MIN_SEPARATION_PX
from .pan_pattern import DEFAULT_MAX_EPISODE_PERIOD_CV, DEFAULT_MIN_ALTERNATIONS, DEFAULT_MIN_NULL_GAP_S
from .types import ScreeningSummary

DISCLAIMER = (
    "This is NOT a medical diagnosis. Findings below are descriptive pattern-matches "
    "against literature-described eye-movement signatures, applied to a single recording, "
    "using thresholds that are documented heuristics -- not literature-tuned or validated "
    "against any real patient data. This pipeline's own upstream detectors (Stages 1-4) "
    "are themselves validated only against synthetic data -- an apparent pattern below "
    "could equally be a Stage 1-4 measurement artifact (tracking noise, a segmentation-"
    "boundary effect, a threshold crossing) rather than a genuine physiological finding. "
    "Clinical correlation by a qualified professional is required for any actual clinical use."
)
MODALITY_LIMITATION = (
    "This project's name describes an eventual multimodal system, but Stage 5 remains "
    "strictly UNIMODAL: it analyzes horizontal eye-movement position from 2D video only. "
    "There is no audiometry, caloric/rotational testing, positional-maneuver context, "
    "imaging, or patient history anywhere in this pipeline."
)


class DisorderScreeningPipeline:
    def __init__(
        self,
        assumed_iris_mm: float = DEFAULT_ASSUMED_IRIS_MM,
        working_distance_mm: Optional[float] = None,
        deg_per_px: Optional[float] = None,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
        min_beats_local: int = DEFAULT_MIN_BEATS_LOCAL,
        max_beat_period_cv: float = DEFAULT_MAX_BEAT_PERIOD_CV,
        max_intra_episode_gap_s: float = DEFAULT_MAX_INTRA_EPISODE_GAP_S,
        min_samples_for_shape_fit: int = DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT,
        min_r_squared_improvement: float = DEFAULT_MIN_R_SQUARED_IMPROVEMENT,
        min_beats_for_correlation: int = DEFAULT_MIN_BEATS_FOR_CORRELATION,
        min_episodes_for_trend: int = DEFAULT_MIN_EPISODES_FOR_TREND,
        trend_threshold: float = DEFAULT_TREND_THRESHOLD,
        min_effect_size: float = DEFAULT_MIN_EFFECT_SIZE,
        min_separation_px: float = DEFAULT_MIN_SEPARATION_PX,
        min_alternations: int = DEFAULT_MIN_ALTERNATIONS,
        max_episode_period_cv: float = DEFAULT_MAX_EPISODE_PERIOD_CV,
        min_null_gap_s: float = DEFAULT_MIN_NULL_GAP_S,
    ):
        self._characterization_pipeline = NystagmusCharacterizationPipeline(
            assumed_iris_mm=assumed_iris_mm,
            working_distance_mm=working_distance_mm,
            deg_per_px=deg_per_px,
            min_confidence=min_confidence,
            min_beats_local=min_beats_local,
            max_beat_period_cv=max_beat_period_cv,
            max_intra_episode_gap_s=max_intra_episode_gap_s,
            min_samples_for_shape_fit=min_samples_for_shape_fit,
            min_r_squared_improvement=min_r_squared_improvement,
            min_beats_for_correlation=min_beats_for_correlation,
            min_episodes_for_trend=min_episodes_for_trend,
            trend_threshold=trend_threshold,
        )
        self.min_effect_size = min_effect_size
        self.min_separation_px = min_separation_px
        self.min_alternations = min_alternations
        self.max_episode_period_cv = max_episode_period_cv
        self.min_null_gap_s = min_null_gap_s

    def process_trajectory(self, trajectory_csv: str, output_dir: str) -> dict:
        characterization = self._characterization_pipeline.process_trajectory(trajectory_csv, output_dir)
        return self.process_characterization(characterization, output_dir)

    def process_characterization(self, characterization: dict, output_dir: str) -> dict:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        findings = []
        vestibular = vestibular_pattern.detect_vestibular_type_pattern(characterization)
        if vestibular is not None:
            findings.append(vestibular)

        findings.extend(
            gaze_evoked_pattern.detect_central_pattern_findings(
                characterization, self.min_effect_size, self.min_separation_px
            )
        )

        pan = pan_pattern.detect_periodic_alternating_pattern(
            characterization.get("episodes", []),
            self.min_alternations,
            self.max_episode_period_cv,
            self.min_null_gap_s,
        )
        if pan is not None:
            findings.append(pan)

        summary = ScreeningSummary(
            modality_limitation=MODALITY_LIMITATION,
            disclaimer=DISCLAIMER,
            patterns_detected=findings,
            patterns_not_assessable=not_assessable.get_catalog(),
            thresholds={
                "min_effect_size": self.min_effect_size,
                "min_separation_px": self.min_separation_px,
                "min_alternations": self.min_alternations,
                "max_episode_period_cv": self.max_episode_period_cv,
                "min_null_gap_s": self.min_null_gap_s,
            },
        )

        summary_path = output_dir / "screening_summary.json"
        with open(summary_path, "w") as f:
            json.dump(dataclasses.asdict(summary), f, indent=2)

        result = dataclasses.asdict(summary)
        result["screening_summary_path"] = str(summary_path)
        return result
