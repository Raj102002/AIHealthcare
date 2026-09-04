"""Stage 4 CLI: descriptive nystagmus-episode characterization (slow-phase
waveform shape, direction consistency, Alexander's Law, temporal trend)
over a Stage 1 trajectory.csv.

Example:
    python -m src.characterization_cli --trajectory outputs/trajectory.csv --output-dir outputs
"""
import argparse
import json

from .nystagmus_characterization.alexanders_law import DEFAULT_MIN_BEATS_FOR_CORRELATION
from .nystagmus_characterization.pipeline import NystagmusCharacterizationPipeline
from .nystagmus_characterization.shape import DEFAULT_MIN_R_SQUARED_IMPROVEMENT, DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT
from .nystagmus_characterization.trend import DEFAULT_MIN_EPISODES_FOR_TREND, DEFAULT_TREND_THRESHOLD


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 4: descriptive nystagmus-episode characterization")
    parser.add_argument("--trajectory", required=True, help="Path to a Stage 1 trajectory.csv")
    parser.add_argument("--output-dir", default="outputs", help="Where to write episode_characterization.csv / nystagmus_characterization_summary.json")
    parser.add_argument("--assumed-iris-mm", type=float, default=11.7, help="Adult default; override for pediatric subjects")
    parser.add_argument("--working-distance-mm", type=float, default=None, help="Enables deg/s output (small-angle approx)")
    parser.add_argument("--deg-per-px", type=float, default=None, help="Direct px->deg factor; overrides --working-distance-mm")
    parser.add_argument("--min-confidence", type=float, default=0.3, help="Frames below this confidence are excluded")
    parser.add_argument("--min-samples-for-shape-fit", type=int, default=DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT)
    parser.add_argument("--min-r-squared-improvement", type=float, default=DEFAULT_MIN_R_SQUARED_IMPROVEMENT)
    parser.add_argument("--min-beats-for-correlation", type=int, default=DEFAULT_MIN_BEATS_FOR_CORRELATION)
    parser.add_argument("--min-episodes-for-trend", type=int, default=DEFAULT_MIN_EPISODES_FOR_TREND)
    parser.add_argument("--trend-threshold", type=float, default=DEFAULT_TREND_THRESHOLD)
    args = parser.parse_args()

    pipeline = NystagmusCharacterizationPipeline(
        assumed_iris_mm=args.assumed_iris_mm,
        working_distance_mm=args.working_distance_mm,
        deg_per_px=args.deg_per_px,
        min_confidence=args.min_confidence,
        min_samples_for_shape_fit=args.min_samples_for_shape_fit,
        min_r_squared_improvement=args.min_r_squared_improvement,
        min_beats_for_correlation=args.min_beats_for_correlation,
        min_episodes_for_trend=args.min_episodes_for_trend,
        trend_threshold=args.trend_threshold,
    )
    summary = pipeline.process_trajectory(args.trajectory, args.output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
