"""Stage 1 CLI: run the pupil-detection pipeline over a video file.

Example:
    python -m src.cli --video data/sample/eye.mp4 --mode closeup --save-annotated
"""
import argparse
import json
from pathlib import Path

from .pupil_detection.pipeline import VALID_MODES, PupilDetectionPipeline

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task"
DEFAULT_CNN_PATH = Path(__file__).resolve().parent.parent / "models" / "pupil_cnn.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 1: robust pupil detection & tracking")
    parser.add_argument("--video", required=True, help="Path to input eye/face video")
    parser.add_argument("--output-dir", default="outputs", help="Where to write trajectory.csv / annotated.mp4")
    parser.add_argument("--mode", choices=VALID_MODES, default="auto")
    parser.add_argument("--eye", choices=["left", "right"], default="right")
    parser.add_argument("--model-path", default=str(DEFAULT_MODEL_PATH), help="MediaPipe face_landmarker.task path")
    parser.add_argument("--no-mediapipe", action="store_true", help="Disable MediaPipe even if the model is present")
    parser.add_argument(
        "--pupil-cnn-path", default=None, metavar="PATH",
        # Opt-in, not on-by-default: evaluate_lpw.py --split test shows this
        # checkpoint currently *underperforms* the classical detector on
        # truly held-out participants (worse median error and e<=5/10px
        # rates, just a higher detection rate) -- see README. Pass
        # explicitly (e.g. --pupil-cnn-path models/pupil_cnn.pt) to try it.
        help="Trained pupil-center CNN checkpoint (closeup mode only, see cnn_detector.py); "
             f"not used unless passed explicitly, e.g. {DEFAULT_CNN_PATH}",
    )
    parser.add_argument("--save-annotated", action="store_true", help="Write an overlay QA video")
    parser.add_argument("--save-masks", action="store_true", help="Include per-frame segmentation masks")
    args = parser.parse_args()

    pipeline = PupilDetectionPipeline(
        mode=args.mode,
        eye=args.eye,
        model_path=None if args.no_mediapipe else args.model_path,
        pupil_cnn_path=args.pupil_cnn_path,
        save_masks=args.save_masks,
    )
    summary = pipeline.process_video(args.video, args.output_dir, save_annotated=args.save_annotated)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
