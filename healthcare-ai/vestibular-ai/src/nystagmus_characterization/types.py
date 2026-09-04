"""Shared data types for the Stage 4 nystagmus-characterization pipeline."""
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class BeatShape:
    """Per-beat slow-phase waveform-shape classification. `tau_s` is only
    set for a non-"linear"/"indeterminate" shape -- the fitted exponential
    time constant, in seconds.
    """

    beat_index: int
    shape: str  # "linear" | "increasing_velocity" | "decreasing_velocity" | "indeterminate"
    tau_s: Optional[float]
    r_squared: float


@dataclass
class EpisodeCharacterization:
    """Descriptive characterization of one nystagmus_jerk episode. Every
    field here is descriptive, not diagnostic -- see the pipeline's
    standing caveats.
    """

    episode_index: int
    segment_id: int
    start_s: float
    end_s: float
    beat_count: int
    # "+x" | "-x" | "mixed" -- "mixed" reports a genuine tie rather than
    # silently picking a side (see classifier._jerk_stats' known gap).
    dominant_fast_phase_direction: str
    dominant_slow_phase_shape: str  # "linear"|"increasing_velocity"|"decreasing_velocity"|"mixed"|"indeterminate"
    shape_counts: Dict[str, int]
    # False if a second shape label is well-represented (>=1/3 of beats) --
    # a mix of shapes within one episode is itself a real descriptive
    # signal and shouldn't be flattened into a bare mode.
    shape_homogeneous: bool
    # Spearman rho between each beat's mean slow-phase gaze position and
    # |slow-phase velocity| -- None below min_beats_for_correlation.
    alexanders_law_correlation: Optional[float]
    n_beats_used_for_correlation: int
    # Mean gaze position (x_px) across the episode's beats' slow phases --
    # None if no beat had any in-window samples. Raw image-space pixels,
    # not calibrated to mm/deg (see calibration.py) -- consumers comparing
    # this across episodes need it to be the same recording/setup, since
    # it isn't normalized to a physical unit.
    mean_gaze_position_px: Optional[float] = None
    beat_shapes: List[BeatShape] = field(default_factory=list)

    def as_row(self) -> dict:
        row = {
            "episode_index": self.episode_index,
            "segment_id": self.segment_id,
            "start_s": round(self.start_s, 4),
            "end_s": round(self.end_s, 4),
            "beat_count": self.beat_count,
            "dominant_fast_phase_direction": self.dominant_fast_phase_direction,
            "dominant_slow_phase_shape": self.dominant_slow_phase_shape,
            "shape_homogeneous": self.shape_homogeneous,
            "alexanders_law_correlation": self.alexanders_law_correlation,
            "n_beats_used_for_correlation": self.n_beats_used_for_correlation,
            "mean_gaze_position_px": self.mean_gaze_position_px,
        }
        for label in ("linear", "increasing_velocity", "decreasing_velocity", "indeterminate"):
            row[f"shape_count_{label}"] = self.shape_counts.get(label, 0)
        return row


@dataclass
class NystagmusCharacterizationSummary:
    """Top-level Stage 4 result -- returned by
    NystagmusCharacterizationPipeline.process_trajectory/process_kinematics
    and mirrored into nystagmus_characterization_summary.json.
    """

    n_jerk_episodes: int
    episodes: List[EpisodeCharacterization] = field(default_factory=list)
    direction_consistency: str = "indeterminate"  # "direction_fixed"|"direction_changing"|"indeterminate"
    temporal_trend: str = "indeterminate"  # "waxing"|"waning"|"stable"|"indeterminate"
    temporal_trend_relative_change: Optional[float] = None
    caveats: List[str] = field(default_factory=list)
