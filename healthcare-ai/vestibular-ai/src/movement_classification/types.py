"""Shared data types for the Stage 3 movement-classification pipeline."""
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class MovementEvent:
    """One maximal contiguous stretch of a single eye-movement type.

    Nystagmus-specific fields are only populated for
    "nystagmus_jerk"/"nystagmus_pendular" events -- everything else
    (fixation, saccade, smooth_pursuit_or_drift, gap) leaves them `None`
    rather than a meaningless zero.
    """

    event_index: int
    # "fixation" | "saccade" | "smooth_pursuit_or_drift" | "nystagmus_jerk"
    # | "nystagmus_pendular" | "gap"
    label: str
    start_frame: int
    end_frame: int
    start_s: float
    end_s: float
    duration_s: float
    mean_speed_px_s: Optional[float]
    peak_speed_px_s: Optional[float]
    beat_count: Optional[int] = None
    mean_slow_phase_velocity_px_s: Optional[float] = None
    mean_slow_phase_velocity_mm_s: Optional[float] = None
    mean_slow_phase_velocity_deg_s: Optional[float] = None
    dominant_fast_phase_direction: Optional[str] = None
    dominant_frequency_hz: Optional[float] = None  # nystagmus_pendular only

    def as_row(self) -> dict:
        return {
            "event_index": self.event_index,
            "label": self.label,
            "start_frame": self.start_frame,
            "end_frame": self.end_frame,
            "start_s": round(self.start_s, 4),
            "end_s": round(self.end_s, 4),
            "duration_s": round(self.duration_s, 4),
            "mean_speed_px_s": self.mean_speed_px_s,
            "peak_speed_px_s": self.peak_speed_px_s,
            "beat_count": self.beat_count,
            "mean_slow_phase_velocity_px_s": self.mean_slow_phase_velocity_px_s,
            "mean_slow_phase_velocity_mm_s": self.mean_slow_phase_velocity_mm_s,
            "mean_slow_phase_velocity_deg_s": self.mean_slow_phase_velocity_deg_s,
            "dominant_fast_phase_direction": self.dominant_fast_phase_direction,
            "dominant_frequency_hz": self.dominant_frequency_hz,
        }


@dataclass
class MovementClassificationSummary:
    """Top-level Stage 3 result -- returned by
    MovementClassificationPipeline.process_trajectory/process_kinematics
    and mirrored into movement_summary.json.
    """

    n_frames: int
    total_duration_s: float
    label_durations_s: Dict[str, float]
    label_fractions: Dict[str, float]
    nystagmus_episode_count: int
    longest_nystagmus_episode_s: float
    # Stage 2's own whole-segment classify_waveform call, one per Stage-2
    # segment -- a reference point showing what Stage 2 alone would have
    # said about this same recording, so the value of Stage 3's windowed
    # timeline (below) is visible in the artifact itself, not just prose.
    segment_waveform_classifications: Dict[int, str]
    events: List[MovementEvent] = field(default_factory=list)
    caveats: List[str] = field(default_factory=list)
