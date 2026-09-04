"""Stage 7 CLI: ingest one session's Stages 1-5 outputs into a subject's
longitudinal history, and re-render that subject's longitudinal report.

Does NOT run Stages 1-6 itself -- run those first for one recording,
pointed at some --output-dir, then ingest that --output-dir here under
a subject/session-date. Run once per session per subject; run again
later (with a new --session-date/--output-dir) as more sessions arrive.

Example:
    python -m src.longitudinal_cli --subject-id subject-001 \\
        --session-date 2026-01-15 --output-dir outputs/visit1 \\
        --history-dir history
"""
import argparse
import json

from .longitudinal_monitoring.pipeline import LongitudinalMonitoringPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage 7: ingest one session into a subject's longitudinal history")
    parser.add_argument("--subject-id", required=True, help="Opaque subject identifier -- never a real name/DOB/MRN")
    parser.add_argument("--session-date", required=True, help="ISO date (YYYY-MM-DD) this recording was taken")
    parser.add_argument("--output-dir", required=True, help="Directory containing this session's Stages 1-5 outputs")
    parser.add_argument("--history-dir", default="history", help="Directory where subject history is persisted")
    parser.add_argument("--force", action="store_true", help="Re-ingest/upsert if this output-dir was already ingested")
    args = parser.parse_args()

    result = LongitudinalMonitoringPipeline().ingest_session(
        subject_id=args.subject_id,
        session_date=args.session_date,
        output_dir=args.output_dir,
        history_dir=args.history_dir,
        force=args.force,
    )

    if result["identity_warnings"]:
        print("WARNINGS about --subject-id:")
        for w in result["identity_warnings"]:
            print(f"  - {w}")

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
