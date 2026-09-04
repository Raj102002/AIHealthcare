"""Stage 3 CLI: classify eye-movement events (fixation/saccade/nystagmus/
smooth-pursuit-or-drift) over a Stage 1 trajectory.csv.

Example:
    python -m src.movement_cli --trajectory outputs/trajectory.csv --output-dir outputs
"""
import argparse
import json

from .movement_classification.classifier import (
    DEFAULT_MAX_BEAT_PERIOD_CV,
    DEFAULT_MAX_SACCADE_DURATION_S,
    DEFAULT_MIN_BEATS_LOCAL,
    DEFAULT_MIN_SAMPLES_FOR_LOCAL_PENDULAR,
)
from .movement_classification.pipeline import MovementClassificationPipeline
from .movement_classification.windowing import DEFAULT_K_FIX


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 3: eye-movement event classification")
    parser.add_argument("--trajectory", required=True, help="Path to a Stage 1 trajectory.csv")
    parser.add_argument("--output-dir", default="outputs", help="Where to write movement_events.csv / movement_summary.json")
    parser.add_argument("--assumed-iris-mm", type=float, default=11.7, help="Adult default; override for pediatric subjects")
    parser.add_argument("--working-distance-mm", type=float, default=None, help="Enables deg/s output (small-angle approx)")
    parser.add_argument("--deg-per-px", type=float, default=None, help="Direct px->deg factor; overrides --working-distance-mm")
    parser.add_argument("--min-confidence", type=float, default=0.3, help="Frames below this confidence are excluded")
    parser.add_argument("--k-fix", type=float, default=DEFAULT_K_FIX, help="Fixation/motion threshold = median + k*MAD (robust, per-segment)")
    parser.add_argument("--min-beats-local", type=int, default=DEFAULT_MIN_BEATS_LOCAL, help="Minimum well-fit beats to call a motion run nystagmus_jerk")
    parser.add_argument("--max-saccade-duration-s", type=float, default=DEFAULT_MAX_SACCADE_DURATION_S)
    parser.add_argument("--max-beat-period-cv", type=float, default=DEFAULT_MAX_BEAT_PERIOD_CV, help="Max inter-beat-interval coefficient of variation to call beats rhythmic")
    parser.add_argument("--min-samples-for-local-pendular", type=int, default=DEFAULT_MIN_SAMPLES_FOR_LOCAL_PENDULAR, help="Minimum frames in a local motion run before trusting a pendular FFT call (short windows are prone to spurious peaks)")
    args = parser.parse_args()

    pipeline = MovementClassificationPipeline(
        assumed_iris_mm=args.assumed_iris_mm,
        working_distance_mm=args.working_distance_mm,
        deg_per_px=args.deg_per_px,
        min_confidence=args.min_confidence,
        k_fix=args.k_fix,
        min_beats_local=args.min_beats_local,
        max_saccade_duration_s=args.max_saccade_duration_s,
        max_beat_period_cv=args.max_beat_period_cv,
        min_samples_for_local_pendular=args.min_samples_for_local_pendular,
    )
    summary = pipeline.process_trajectory(args.trajectory, args.output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
