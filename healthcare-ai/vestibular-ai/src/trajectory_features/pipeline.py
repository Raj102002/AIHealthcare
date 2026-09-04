"""Stage 2 orchestrator: a Stage 1 trajectory.csv in, kinematic +
nystagmus-beat (or pendular-fallback) features out.

Mirrors PupilDetectionPipeline.process_video's shape in
src/pupil_detection/pipeline.py: one `process_trajectory` call, artifacts
written to `output_dir`, a JSON-serializable summary dict returned.
"""
import dataclasses
import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from . import calibration as calibration_mod
from . import kinematics, pendular, segmentation
from .calibration import DEFAULT_ASSUMED_IRIS_MM
from .types import TrajectoryFeaturesSummary


class TrajectoryFeaturesPipeline:
    def __init__(
        self,
        assumed_iris_mm: float = DEFAULT_ASSUMED_IRIS_MM,
        working_distance_mm: Optional[float] = None,
        deg_per_px: Optional[float] = None,
        min_confidence: float = kinematics.DEFAULT_MIN_CONFIDENCE,
        min_segment_frames: int = kinematics.DEFAULT_MIN_SEGMENT_FRAMES,
        k_mad: float = segmentation.DEFAULT_K_MAD,
        min_fast_phase_duration_s: float = segmentation.DEFAULT_MIN_FAST_PHASE_DURATION_S,
        min_slow_phase_duration_s: float = segmentation.DEFAULT_MIN_SLOW_PHASE_DURATION_S,
        min_beats_for_jerk: int = segmentation.DEFAULT_MIN_BEATS_FOR_JERK,
    ):
        self.assumed_iris_mm = assumed_iris_mm
        self.working_distance_mm = working_distance_mm
        self.deg_per_px = deg_per_px
        self.min_confidence = min_confidence
        self.min_segment_frames = min_segment_frames
        self.k_mad = k_mad
        self.min_fast_phase_duration_s = min_fast_phase_duration_s
        self.min_slow_phase_duration_s = min_slow_phase_duration_s
        self.min_beats_for_jerk = min_beats_for_jerk

    def process_trajectory(self, trajectory_csv: str, output_dir: str) -> dict:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        df = pd.read_csv(trajectory_csv)

        cal = calibration_mod.calibrate(
            df,
            assumed_iris_mm=self.assumed_iris_mm,
            working_distance_mm=self.working_distance_mm,
            deg_per_px_override=self.deg_per_px,
        )

        kin_df = kinematics.compute_kinematics(
            df, cal, min_confidence=self.min_confidence, min_segment_frames=self.min_segment_frames
        )
        kinematics_path = output_dir / "kinematics.csv"
        kin_df.to_csv(kinematics_path, index=False)

        beats = segmentation.detect_beats(
            kin_df,
            k_mad=self.k_mad,
            min_fast_phase_duration_s=self.min_fast_phase_duration_s,
            min_slow_phase_duration_s=self.min_slow_phase_duration_s,
            calibration=cal,
        )
        classification = segmentation.classify_waveform(kin_df, beats, min_beats=self.min_beats_for_jerk)

        caveats = [cal.caveat, "Direction fields are image-space (+x/-x), not clinical left/right -- camera mirroring/mounting is unknown to Stage 1/2."]

        beats_path = None
        pendular_summary = None
        spectrum_path = None
        mean_spv_px = mean_spv_mm = mean_spv_deg = None
        beat_frequency_hz = None
        dominant_fast_phase_direction = None

        if classification == "jerk":
            good_beats = [b for b in beats if b.r_squared >= segmentation.DEFAULT_MIN_R_SQUARED]
            beats_path = output_dir / "beats.csv"
            pd.DataFrame([b.as_row() for b in beats]).to_csv(beats_path, index=False)

            duration_s = float(df["time_s"].max() - df["time_s"].min())
            beat_frequency_hz = len(good_beats) / duration_s if duration_s > 0 else None
            mean_spv_px = float(np.mean([b.slow_phase_velocity_px_s for b in good_beats]))
            mm_vals = [b.slow_phase_velocity_mm_s for b in good_beats if b.slow_phase_velocity_mm_s is not None]
            mean_spv_mm = float(np.mean(mm_vals)) if mm_vals else None
            deg_vals = [b.slow_phase_velocity_deg_s for b in good_beats if b.slow_phase_velocity_deg_s is not None]
            mean_spv_deg = float(np.mean(deg_vals)) if deg_vals else None
            directions = [b.fast_phase_direction for b in good_beats]
            dominant_fast_phase_direction = max(set(directions), key=directions.count) if directions else None
        else:
            if classification == "indeterminate":
                caveats.append(
                    "Waveform could not be confidently classified as jerk or pendular -- "
                    "the frequency/amplitude below may not reflect a genuine oscillation."
                )
            pendular_summary = pendular.analyze_pendular(kin_df, calibration=cal)
            if pendular_summary is not None:
                seg = pendular.longest_contiguous_segment(kin_df)
                t = kin_df["time_s"].to_numpy()[seg]
                x = kin_df["x_px"].to_numpy()[seg]
                freqs, magnitude = pendular.compute_spectrum(t, x)
                spectrum_path = output_dir / "spectrum.csv"
                pd.DataFrame({"frequency_hz": freqs, "magnitude": magnitude}).to_csv(spectrum_path, index=False)
            else:
                caveats.append("Not enough gap-free frames to estimate an oscillation spectrum either.")

        summary = TrajectoryFeaturesSummary(
            n_frames=int(len(df)),
            n_frames_included=int(kin_df["included"].sum()),
            calibration=cal,
            waveform_classification=classification,
            beats=beats if classification == "jerk" else [],
            pendular=pendular_summary,
            mean_slow_phase_velocity_px_s=mean_spv_px,
            mean_slow_phase_velocity_mm_s=mean_spv_mm,
            mean_slow_phase_velocity_deg_s=mean_spv_deg,
            beat_frequency_hz=beat_frequency_hz,
            dominant_fast_phase_direction=dominant_fast_phase_direction,
            caveats=caveats,
        )

        summary_path = output_dir / "features_summary.json"
        with open(summary_path, "w") as f:
            json.dump(dataclasses.asdict(summary), f, indent=2)

        result = dataclasses.asdict(summary)
        result.update(
            {
                "kinematics_csv_path": str(kinematics_path),
                "beats_csv_path": str(beats_path) if beats_path else None,
                "spectrum_csv_path": str(spectrum_path) if spectrum_path else None,
                "features_summary_path": str(summary_path),
            }
        )
        return result
