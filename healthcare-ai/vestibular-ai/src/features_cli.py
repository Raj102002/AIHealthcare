"""Stage 2 CLI: run trajectory-feature extraction over a Stage 1 trajectory.csv.

Example:
    python -m src.features_cli --trajectory outputs/trajectory.csv --output-dir outputs
"""
import argparse
import json

from .trajectory_features.pipeline import TrajectoryFeaturesPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 2: trajectory kinematic & nystagmus-beat feature extraction")
    parser.add_argument("--trajectory", required=True, help="Path to a Stage 1 trajectory.csv")
    parser.add_argument("--output-dir", default="outputs", help="Where to write kinematics.csv / beats.csv / etc.")
    parser.add_argument("--assumed-iris-mm", type=float, default=11.7, help="Adult default; override for pediatric subjects")
    parser.add_argument("--working-distance-mm", type=float, default=None, help="Enables deg/s output (small-angle approx); omit to leave deg/s unavailable rather than guessed")
    parser.add_argument("--deg-per-px", type=float, default=None, help="Direct px->deg factor from a real calibration procedure; overrides --working-distance-mm")
    parser.add_argument("--min-confidence", type=float, default=0.3, help="Frames below this confidence are excluded from kinematics/beat detection")
    parser.add_argument("--k-mad", type=float, default=3.0, help="Fast-phase velocity threshold = median + k*MAD (robust, per-segment)")
    args = parser.parse_args()

    pipeline = TrajectoryFeaturesPipeline(
        assumed_iris_mm=args.assumed_iris_mm,
        working_distance_mm=args.working_distance_mm,
        deg_per_px=args.deg_per_px,
        min_confidence=args.min_confidence,
        k_mad=args.k_mad,
    )
    summary = pipeline.process_trajectory(args.trajectory, args.output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
