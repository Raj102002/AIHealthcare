"""Shared data types for the Stage 2 trajectory-feature pipeline."""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class CalibrationResult:
    """Per-recording pixel->physical-unit conversion, derived once from the
    whole trajectory rather than per-frame (see calibration.py) since a
    subject's iris diameter is stable across frames, unlike pupil size.

    Only ever reports a factor it actually has evidence for -- `px_per_mm`
    and `deg_per_px` are `None`, not a guessed constant, when the inputs to
    compute them aren't available. A consumer that needs mm/deg values
    must handle `None` rather than assume calibration always succeeds.
    """

    px_per_mm: Optional[float]
    # Only set if the caller supplied --working-distance-mm or
    # --deg-per-px -- Stage 1 has no camera-geometry calibration (no
    # working distance, no focal length), so this is never derived from a
    # fixed eyeball-radius constant, which would fabricate a number this
    # codebase has no basis for.
    deg_per_px: Optional[float]
    iris_diameter_px_median: Optional[float]
    n_iris_samples: int
    assumed_iris_mm: float
    # "iris_diameter_median" | "explicit_override" | "unavailable"
    method: str
    caveat: str


@dataclass
class KinematicFrame:
    """Per-frame kinematics. `included=False` frames (gaps, low-confidence,
    or `method in ("predicted", "none")`) carry `None` kinematics -- they
    are never differenced across, since that would fabricate a velocity
    spike out of a blink/occlusion gap (see kinematics.py).
    """

    frame: int
    time_s: float
    included: bool
    segment_id: Optional[int]
    x_px: Optional[float]
    y_px: Optional[float]
    velocity_x_px_s: Optional[float] = None
    velocity_y_px_s: Optional[float] = None
    speed_px_s: Optional[float] = None
    acceleration_px_s2: Optional[float] = None
    speed_mm_s: Optional[float] = None
    speed_deg_s: Optional[float] = None

    def as_row(self) -> dict:
        return {
            "frame": self.frame,
            "time_s": round(self.time_s, 4),
            "included": self.included,
            "segment_id": self.segment_id,
            "x_px": self.x_px,
            "y_px": self.y_px,
            "velocity_x_px_s": self.velocity_x_px_s,
            "velocity_y_px_s": self.velocity_y_px_s,
            "speed_px_s": self.speed_px_s,
            "acceleration_px_s2": self.acceleration_px_s2,
            "speed_mm_s": self.speed_mm_s,
            "speed_deg_s": self.speed_deg_s,
        }


@dataclass
class Beat:
    """One slow-phase-drift + fast-phase-saccade cycle of jerk nystagmus.

    Nystagmus is conventionally *named/directioned* by its FAST phase
    (e.g. "right-beating"), even though the slow phase is the pathological
    drift -- both directions are reported explicitly, separately, so a
    downstream consumer can't accidentally use the wrong one. Directions
    are image-space (+x/-x), not true clinical left/right: Stage 1 doesn't
    know camera mirroring/mounting, so claiming an absolute side would be
    a fabrication.
    """

    beat_index: int
    slow_phase_start_s: float
    slow_phase_end_s: float
    fast_phase_start_s: float
    fast_phase_end_s: float
    # Slope of a line fit to position over the slow phase only -- the
    # actual clinical definition of slow-phase velocity, not raw
    # instantaneous velocity (which is noisier and includes the saccade).
    slow_phase_velocity_px_s: float
    slow_phase_direction: str  # "+x" | "-x"
    fast_phase_peak_velocity_px_s: float
    fast_phase_direction: str  # "+x" | "-x"
    amplitude_px: float
    # R^2 of the slow-phase linear fit -- a bad fit is visible here, not
    # silently hidden behind a confident-looking SPV number.
    r_squared: float
    slow_phase_velocity_mm_s: Optional[float] = None
    slow_phase_velocity_deg_s: Optional[float] = None
    amplitude_mm: Optional[float] = None
    amplitude_deg: Optional[float] = None

    def as_row(self) -> dict:
        return {
            "beat_index": self.beat_index,
            "slow_phase_start_s": round(self.slow_phase_start_s, 4),
            "slow_phase_end_s": round(self.slow_phase_end_s, 4),
            "fast_phase_start_s": round(self.fast_phase_start_s, 4),
            "fast_phase_end_s": round(self.fast_phase_end_s, 4),
            "slow_phase_velocity_px_s": self.slow_phase_velocity_px_s,
            "slow_phase_velocity_mm_s": self.slow_phase_velocity_mm_s,
            "slow_phase_velocity_deg_s": self.slow_phase_velocity_deg_s,
            "slow_phase_direction": self.slow_phase_direction,
            "fast_phase_peak_velocity_px_s": self.fast_phase_peak_velocity_px_s,
            "fast_phase_direction": self.fast_phase_direction,
            "amplitude_px": self.amplitude_px,
            "amplitude_mm": self.amplitude_mm,
            "amplitude_deg": self.amplitude_deg,
            "r_squared": self.r_squared,
        }


@dataclass
class PendularSummary:
    """Fallback report for a waveform with no reliable fast/slow-phase
    structure (e.g. pendular nystagmus, or plain smooth pursuit): a beat
    decomposition would be fabricated here, so this reports the
    oscillation's dominant frequency/amplitude instead -- estimated from
    the longest gap-free stretch only (see pendular.py), not the whole
    recording, which the `note` states explicitly.
    """

    dominant_frequency_hz: float
    peak_to_peak_amplitude_px: float
    axis: str  # "x" | "y"
    n_samples_used: int
    note: str
    peak_to_peak_amplitude_mm: Optional[float] = None
    peak_to_peak_amplitude_deg: Optional[float] = None


@dataclass
class TrajectoryFeaturesSummary:
    """Top-level Stage 2 result -- returned by
    TrajectoryFeaturesPipeline.process_trajectory and mirrored into
    features_summary.json.
    """

    n_frames: int
    n_frames_included: int
    calibration: CalibrationResult
    waveform_classification: str  # "jerk" | "pendular" | "indeterminate"
    beats: List[Beat] = field(default_factory=list)
    pendular: Optional[PendularSummary] = None
    mean_slow_phase_velocity_px_s: Optional[float] = None
    mean_slow_phase_velocity_mm_s: Optional[float] = None
    mean_slow_phase_velocity_deg_s: Optional[float] = None
    beat_frequency_hz: Optional[float] = None
    dominant_fast_phase_direction: Optional[str] = None
    caveats: List[str] = field(default_factory=list)
