"""Single-video entry point chaining vestibular-ai Stages 1-6.

Wired up for the healthcare-ai chatbot's "vestibular screening" feature
(app/api/vestibular-screening/route.ts): given one eye-tracking video, this
runs pupil detection, feature extraction, movement classification, nystagmus
characterization, disorder-pattern screening, and the explainable HTML report
in one process, then prints a single JSON object to stdout so the calling
Node process doesn't have to shell out to six separate CLIs and parse their
individual outputs.

This is descriptive pattern-matching against literature-described
eye-movement signatures, not a diagnosis -- see src/disorder_screening's own
docstrings and the parent vestibular-ai README for what Stage 5 does and does
not claim.

Example:
    python run_screening.py --video /tmp/upload.mp4 --output-dir /tmp/out
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.disorder_screening.pipeline import DisorderScreeningPipeline
from src.explainable_reports.pipeline import ReportPipeline
from src.movement_classification.pipeline import MovementClassificationPipeline
from src.nystagmus_characterization.pipeline import NystagmusCharacterizationPipeline
from src.pupil_detection.pipeline import VALID_MODES, PupilDetectionPipeline
from src.trajectory_features.pipeline import TrajectoryFeaturesPipeline

MODELS_DIR = Path(__file__).resolve().parent / "models"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Stages 1-6 of vestibular-ai over one video")
    parser.add_argument("--video", required=True, help="Path to input eye/face video")
    parser.add_argument("--output-dir", required=True, help="Directory to write all stage outputs + report.html")
    parser.add_argument("--mode", choices=VALID_MODES, default="auto")
    parser.add_argument("--eye", choices=["left", "right"], default="right")
    parser.add_argument("--assumed-iris-mm", type=float, default=11.7)
    parser.add_argument("--working-distance-mm", type=float, default=None)
    parser.add_argument("--min-confidence", type=float, default=0.3)
    args = parser.parse_args()

    output_dir = args.output_dir
    common = dict(
        assumed_iris_mm=args.assumed_iris_mm,
        working_distance_mm=args.working_distance_mm,
        min_confidence=args.min_confidence,
    )

    model_path = MODELS_DIR / "face_landmarker.task"
    stage1 = PupilDetectionPipeline(
        mode=args.mode,
        eye=args.eye,
        model_path=str(model_path) if model_path.exists() else None,
    )
    stage1_summary = stage1.process_video(args.video, output_dir, save_annotated=False)
    trajectory_csv = str(Path(output_dir) / "trajectory.csv")

    stage2_summary = TrajectoryFeaturesPipeline(**common).process_trajectory(trajectory_csv, output_dir)
    stage3_summary = MovementClassificationPipeline(**common).process_trajectory(trajectory_csv, output_dir)
    stage4_summary = NystagmusCharacterizationPipeline(**common).process_trajectory(trajectory_csv, output_dir)
    stage5_summary = DisorderScreeningPipeline(**common).process_trajectory(trajectory_csv, output_dir)
    report_path = ReportPipeline().generate(output_dir)

    print(json.dumps({
        "pupil_detection": stage1_summary,
        "trajectory_features": stage2_summary,
        "movement_classification": stage3_summary,
        "nystagmus_characterization": stage4_summary,
        "screening": stage5_summary,
        "report_path": report_path,
    }))


if __name__ == "__main__":
    main()
