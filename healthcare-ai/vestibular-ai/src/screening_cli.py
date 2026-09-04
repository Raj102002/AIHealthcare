"""Stage 5 CLI: unimodal disorder-pattern screening (descriptive,
non-diagnostic pattern-matching against literature-described eye-movement
signatures) over a Stage 1 trajectory.csv.

Example:
    python -m src.screening_cli --trajectory outputs/trajectory.csv --output-dir outputs
"""
import argparse
import json

from .disorder_screening.gaze_evoked_pattern import DEFAULT_MIN_EFFECT_SIZE, DEFAULT_MIN_SEPARATION_PX
from .disorder_screening.pan_pattern import DEFAULT_MAX_EPISODE_PERIOD_CV, DEFAULT_MIN_ALTERNATIONS, DEFAULT_MIN_NULL_GAP_S
from .disorder_screening.pipeline import DisorderScreeningPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 5: unimodal disorder-pattern screening (not a diagnosis)")
    parser.add_argument("--trajectory", required=True, help="Path to a Stage 1 trajectory.csv")
    parser.add_argument("--output-dir", default="outputs", help="Where to write screening_summary.json (and Stage 4's own outputs)")
    parser.add_argument("--assumed-iris-mm", type=float, default=11.7)
    parser.add_argument("--working-distance-mm", type=float, default=None)
    parser.add_argument("--deg-per-px", type=float, default=None)
    parser.add_argument("--min-confidence", type=float, default=0.3)
    parser.add_argument("--min-effect-size", type=float, default=DEFAULT_MIN_EFFECT_SIZE, help="Gaze-position/direction linkage effect-size threshold")
    parser.add_argument("--min-separation-px", type=float, default=DEFAULT_MIN_SEPARATION_PX)
    parser.add_argument("--min-alternations", type=int, default=DEFAULT_MIN_ALTERNATIONS, help="Minimum direction alternations for a PAN-consistent finding")
    parser.add_argument("--max-episode-period-cv", type=float, default=DEFAULT_MAX_EPISODE_PERIOD_CV)
    parser.add_argument("--min-null-gap-s", type=float, default=DEFAULT_MIN_NULL_GAP_S)
    args = parser.parse_args()

    pipeline = DisorderScreeningPipeline(
        assumed_iris_mm=args.assumed_iris_mm,
        working_distance_mm=args.working_distance_mm,
        deg_per_px=args.deg_per_px,
        min_confidence=args.min_confidence,
        min_effect_size=args.min_effect_size,
        min_separation_px=args.min_separation_px,
        min_alternations=args.min_alternations,
        max_episode_period_cv=args.max_episode_period_cv,
        min_null_gap_s=args.min_null_gap_s,
    )
    summary = pipeline.process_trajectory(args.trajectory, args.output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
