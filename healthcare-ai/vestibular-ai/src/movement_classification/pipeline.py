"""Stage 3 orchestrator: a Stage 1 trajectory.csv in, a windowed
eye-movement event timeline out.

Reuses Stage 2's calibration/kinematics/beat-detection code directly
(see README's Stage 3 section for why this is a code-reuse boundary,
unlike the pure-CSV boundary between Stage 1 and Stage 2).
"""
import dataclasses
import json
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import pandas as pd

from ..trajectory_features import calibration as calibration_mod
from ..trajectory_features import kinematics, run_utils, segmentation
from ..trajectory_features.calibration import DEFAULT_ASSUMED_IRIS_MM
from . import classifier, windowing
from .types import MovementClassificationSummary, MovementEvent

HORIZONTAL_ONLY_CAVEAT = (
    "Direction and waveform analysis is horizontal-only (x_px) -- vertical "
    "(downbeat/upbeat) and torsional nystagmus are not detected by this pipeline."
)
PURSUIT_VS_DRIFT_CAVEAT = (
    '"smooth_pursuit_or_drift" cannot be distinguished from a pathological sustained '
    "drift without knowing whether a target was being tracked -- Stage 1/2/3 have no "
    "such task/target context."
)
# Threshold above which a segment's own fixation/motion split is flagged as
# possibly unreliable -- see windowing.py's docstring for why a
# motion-dominated segment can bias the self-calibrating threshold.
DOMINANT_MOTION_FRACTION = 0.5


class MovementClassificationPipeline:
    def __init__(
        self,
        assumed_iris_mm: float = DEFAULT_ASSUMED_IRIS_MM,
        working_distance_mm: Optional[float] = None,
        deg_per_px: Optional[float] = None,
        min_confidence: float = kinematics.DEFAULT_MIN_CONFIDENCE,
        k_fix: float = windowing.DEFAULT_K_FIX,
        min_beats_local: int = classifier.DEFAULT_MIN_BEATS_LOCAL,
        max_saccade_duration_s: float = classifier.DEFAULT_MAX_SACCADE_DURATION_S,
        max_beat_period_cv: float = classifier.DEFAULT_MAX_BEAT_PERIOD_CV,
        min_samples_for_local_pendular: int = classifier.DEFAULT_MIN_SAMPLES_FOR_LOCAL_PENDULAR,
    ):
        self.assumed_iris_mm = assumed_iris_mm
        self.working_distance_mm = working_distance_mm
        self.deg_per_px = deg_per_px
        self.min_confidence = min_confidence
        self.k_fix = k_fix
        self.min_beats_local = min_beats_local
        self.max_saccade_duration_s = max_saccade_duration_s
        self.max_beat_period_cv = max_beat_period_cv
        self.min_samples_for_local_pendular = min_samples_for_local_pendular

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
        """Lower-level entry point: skips re-parsing a CSV for a caller
        that already has `kin_df`/`calibration` in hand (e.g. a future
        orchestrator running Stage 2 and Stage 3 in one process).
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        segment_episodes = classifier.extract_segment_episodes(
            kin_df,
            calibration,
            min_beats_local=self.min_beats_local,
            max_beat_period_cv=self.max_beat_period_cv,
        )

        included_col = kin_df["included"].to_numpy()
        segment_col = kin_df["segment_id"].to_numpy()

        def _key(i):
            return (included_col[i], segment_col[i] if included_col[i] else None)

        runs = []
        start = 0
        for i in range(1, len(kin_df) + 1):
            if i == len(kin_df) or _key(i) != _key(start):
                runs.append((start, i, included_col[start], segment_col[start] if included_col[start] else None))
                start = i

        events = []
        segment_waveform_classifications: Dict[int, str] = {}
        segment_motion_fraction: Dict[int, float] = {}
        dynamic_caveats = []

        for run_start, run_end, included, seg_id in runs:
            sub = kin_df.iloc[run_start:run_end].reset_index(drop=True)

            if not included:
                events.append(_span_event(sub, "gap"))
                continue

            if seg_id not in segment_waveform_classifications:
                seg_kin = kin_df[kin_df["segment_id"] == seg_id].reset_index(drop=True)
                seg_beats = segmentation.detect_beats(seg_kin, calibration=calibration)
                segment_waveform_classifications[seg_id] = segmentation.classify_waveform(seg_kin, seg_beats)

            # Beats found across the WHOLE segment were already clustered
            # into episodes above, before any fixation/motion split -- a
            # fixed speed threshold can't tell a nystagmus episode's
            # low-velocity slow phase from real rest (confirmed
            # empirically: it fragmented a genuine 3s jerk episode into
            # alternating short "saccade"/"fixation" slivers instead of one
            # continuous event). Extracting episodes from the segment's own
            # beats first, and only running the coarser fixation/motion
            # split on whatever is left over, avoids that.
            t_arr = sub["time_s"].to_numpy()
            covered = np.zeros(len(sub), dtype=bool)
            for cluster in segment_episodes.get(seg_id, []):
                idx = np.where((t_arr >= cluster[0].slow_phase_start_s) & (t_arr <= cluster[-1].fast_phase_end_s))[0]
                if len(idx) == 0:
                    continue
                covered[idx[0] : idx[-1] + 1] = True
                episode_sub = sub.iloc[idx[0] : idx[-1] + 1].reset_index(drop=True)
                events.append(classifier.build_episode_event(episode_sub, cluster))

            for leftover_start, leftover_end, leftover_label in run_utils.label_runs(~covered, "leftover", "covered"):
                if leftover_label == "covered":
                    continue
                leftover = sub.iloc[leftover_start:leftover_end].reset_index(drop=True)

                fm_runs = windowing.split_fixation_motion(leftover, k_fix=self.k_fix)
                motion_frames = sum(end - start for start, end, label in fm_runs if label == "motion")
                segment_motion_fraction[seg_id] = segment_motion_fraction.get(seg_id, 0.0) + motion_frames

                # Recovery for the remaining real median+MAD failure mode: a
                # PENDULAR segment (no slow/fast structure for
                # cluster_beats_into_episodes to find at all -- jerk segments
                # no longer need this, their beats were just extracted above)
                # with no true quiet baseline, where the threshold rises
                # until nothing crosses it -- confirmed against
                # outputs/demo/trajectory.csv's ~1.5Hz sine (median speed
                # 184px/s, MAD 98px/s, threshold 478px/s, just under its own
                # 479.5px/s peak). `not segment_episodes[seg_id]` (rather than
                # this specific leftover slice) is the right scope: it means
                # NO episode was extracted anywhere in the segment, so this
                # leftover run necessarily *is* the whole segment.
                if (
                    motion_frames == 0
                    and not segment_episodes[seg_id]
                    and segment_waveform_classifications[seg_id] == "pendular"
                ):
                    events.append(
                        classifier.classify_motion_run(
                            leftover,
                            calibration,
                            min_beats_local=self.min_beats_local,
                            max_saccade_duration_s=self.max_saccade_duration_s,
                            max_beat_period_cv=self.max_beat_period_cv,
                            min_samples_for_local_pendular=self.min_samples_for_local_pendular,
                        )
                    )
                    dynamic_caveats.append(
                        f"Segment {int(seg_id)}: the fixation/motion threshold found no motion at all, but "
                        "Stage 2's whole-segment check independently found a genuine pendular pattern -- "
                        "classified the whole segment directly as a fallback instead of trusting the "
                        "(here, clearly wrong) all-fixation split."
                    )
                    continue

                for fm_start, fm_end, label in fm_runs:
                    run_sub = leftover.iloc[fm_start:fm_end].reset_index(drop=True)
                    if label == "fixation":
                        events.append(_span_event(run_sub, "fixation"))
                    else:
                        events.append(
                            classifier.classify_motion_run(
                                run_sub,
                                calibration,
                                min_beats_local=self.min_beats_local,
                                max_saccade_duration_s=self.max_saccade_duration_s,
                                max_beat_period_cv=self.max_beat_period_cv,
                                min_samples_for_local_pendular=self.min_samples_for_local_pendular,
                            )
                        )

        # Episodes are extracted (and appended) before the leftover chunks
        # around them are processed, so construction order isn't
        # chronological -- sort once, globally, before numbering.
        events.sort(key=lambda e: e.start_frame)
        for i, e in enumerate(events):
            e.event_index = i

        n_frames = int(len(kin_df))
        total_duration_s = float(kin_df["time_s"].iloc[-1] - kin_df["time_s"].iloc[0]) if n_frames else 0.0

        label_durations: Dict[str, float] = {}
        for e in events:
            label_durations[e.label] = label_durations.get(e.label, 0.0) + e.duration_s
        label_fractions = {
            k: (v / total_duration_s if total_duration_s > 0 else 0.0) for k, v in label_durations.items()
        }

        nystagmus_events = [e for e in events if e.label in ("nystagmus_jerk", "nystagmus_pendular")]
        longest_nystagmus_episode_s = max((e.duration_s for e in nystagmus_events), default=0.0)

        caveats = [HORIZONTAL_ONLY_CAVEAT, PURSUIT_VS_DRIFT_CAVEAT] + dynamic_caveats
        for seg_id, seg_id_group in kin_df[kin_df["included"]].groupby("segment_id"):
            total_seg_frames = len(seg_id_group)
            if total_seg_frames == 0:
                continue
            motion_frac = segment_motion_fraction.get(seg_id, 0.0) / total_seg_frames
            if motion_frac > DOMINANT_MOTION_FRACTION:
                caveats.append(
                    f"Segment {int(seg_id)} is motion-dominated ({motion_frac:.0%} of frames) -- the "
                    "self-calibrating fixation threshold assumes fixation is the majority baseline and "
                    "may under-detect motion here."
                )

        summary = MovementClassificationSummary(
            n_frames=n_frames,
            total_duration_s=total_duration_s,
            label_durations_s=label_durations,
            label_fractions=label_fractions,
            nystagmus_episode_count=len(nystagmus_events),
            longest_nystagmus_episode_s=longest_nystagmus_episode_s,
            segment_waveform_classifications={int(k): v for k, v in segment_waveform_classifications.items()},
            events=events,
            caveats=caveats,
        )

        events_path = output_dir / "movement_events.csv"
        pd.DataFrame([e.as_row() for e in events]).to_csv(events_path, index=False)

        summary_path = output_dir / "movement_summary.json"
        with open(summary_path, "w") as f:
            json.dump(dataclasses.asdict(summary), f, indent=2)

        result = dataclasses.asdict(summary)
        result.update({"events_csv_path": str(events_path), "movement_summary_path": str(summary_path)})
        return result


def _span_event(sub: pd.DataFrame, label: str) -> MovementEvent:
    t = sub["time_s"].to_numpy()
    speed = sub["speed_px_s"].to_numpy() if "speed_px_s" in sub and label != "gap" else None
    return MovementEvent(
        event_index=-1,
        label=label,
        start_frame=int(sub["frame"].iloc[0]),
        end_frame=int(sub["frame"].iloc[-1]),
        start_s=float(t[0]),
        end_s=float(t[-1]),
        duration_s=float(t[-1] - t[0]),
        mean_speed_px_s=float(np.mean(speed)) if speed is not None else None,
        peak_speed_px_s=float(np.max(speed)) if speed is not None else None,
    )
