"""Stage 6 CLI: build a self-contained explainable HTML report from
Stages 1-5's outputs already written to --output-dir.

Does NOT run Stages 1-5 itself -- run the five prior CLIs first
(python -m src.cli, src.features_cli, src.movement_cli,
src.characterization_cli, src.screening_cli), all pointed at the same
--output-dir, then run this.

Example:
    python -m src.report_cli --output-dir outputs
"""
import argparse

from .explainable_reports.pipeline import ReportPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 6: build a self-contained explainable HTML report")
    parser.add_argument("--output-dir", default="outputs", help="Directory containing Stages 1-5's outputs")
    parser.add_argument("--report-path", default=None, help="Output path (default: <output-dir>/report.html)")
    args = parser.parse_args()

    path = ReportPipeline().generate(args.output_dir, args.report_path)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
