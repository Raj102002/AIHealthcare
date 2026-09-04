"""Orchestrates one session's ingestion into a subject's longitudinal history.

See types.py, history_store.py, identity_guard.py, sourcing.py, and
trend.py for the design decisions each step below leans on.
"""
import dataclasses
from datetime import date
from pathlib import Path
from typing import List, Optional

from . import identity_guard
from .history_store import ConcurrentModificationError, load_history, save_history_atomic
from .report import render_longitudinal_report
from .sourcing import extract_session_metrics
from .trend import DEFAULT_LONGITUDINAL_TREND_THRESHOLD, DEFAULT_MIN_SESSIONS_FOR_TREND, classify_longitudinal_trend
from .types import LongitudinalTrend, PatternPresenceChange, SessionRecord, SubjectHistory

MIXED_UNIT_CAVEAT = (
    "Sessions used in this trend calculation reported slow-phase velocity in different units "
    "(different calibration methods succeeded across visits) -- rather than compare "
    "incompatible units, no trend is computed and the result is reported as 'indeterminate'."
)


def _uncalibrated_session_caveat(session_dates: List[str]) -> str:
    joined = ", ".join(session_dates)
    return (
        f"Session(s) {joined} had no successful Stage 2 calibration (method 'unavailable') -- "
        "their contribution to this trend rests on unverified/uncalibrated footing."
    )


class LongitudinalMonitoringPipeline:
    def ingest_session(
        self,
        subject_id: str,
        session_date: str,
        output_dir: str,
        history_dir: str,
        force: bool = False,
    ) -> dict:
        parsed_date = date.fromisoformat(session_date)
        if parsed_date > date.today():
            raise ValueError(f"session_date {session_date!r} is in the future.")

        identity_warnings = identity_guard.check_subject_id(subject_id)

        history = load_history(history_dir, subject_id)
        expected_version = history.version

        output_dir_path = Path(output_dir)
        history_dir_path = Path(history_dir)
        try:
            relative_output_dir = str(output_dir_path.resolve().relative_to(history_dir_path.resolve()))
        except ValueError:
            import os

            relative_output_dir = os.path.relpath(output_dir_path.resolve(), history_dir_path.resolve())
        relative_output_dir = relative_output_dir.replace("\\", "/")

        existing = next((s for s in history.sessions if s.output_dir == relative_output_dir), None)
        if existing is not None and not force:
            raise ValueError(
                f"output_dir {relative_output_dir!r} was already ingested for subject {subject_id!r} "
                f"(session_date {existing.session_date}) -- pass force=True to re-ingest/upsert it."
            )

        metrics = extract_session_metrics(output_dir)

        record = SessionRecord(
            subject_id=subject_id,
            session_date=session_date,
            output_dir=relative_output_dir,
            identity_warnings=identity_warnings,
            **metrics,
        )

        sessions = [s for s in history.sessions if s.output_dir != relative_output_dir]
        sessions.append(record)
        sessions.sort(key=lambda s: s.session_date)
        history.sessions = sessions

        trend = self._compute_trend(history.sessions)
        pattern_changes = self._compute_pattern_changes(history.sessions)

        try:
            save_history_atomic(history_dir, history, expected_version)
        except ConcurrentModificationError:
            raise

        report_html = render_longitudinal_report(history, trend, pattern_changes)
        report_path = Path(history_dir) / subject_id / "longitudinal_report.html"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_html, encoding="utf-8")

        return {
            "subject_id": subject_id,
            "n_sessions": len(history.sessions),
            "trend": dataclasses.asdict(trend),
            "pattern_changes": [dataclasses.asdict(pc) for pc in pattern_changes],
            "identity_warnings": identity_warnings,
            "history_path": str(Path(history_dir) / subject_id / "history.json"),
            "report_path": str(report_path),
        }

    def _compute_trend(self, sessions: List[SessionRecord]) -> LongitudinalTrend:
        usable = [s for s in sessions if s.mean_spv_magnitude is not None]

        caveats: List[str] = []
        units = {s.spv_unit for s in usable}
        if len(units) > 1:
            return LongitudinalTrend(
                trend="indeterminate",
                relative_change=None,
                n_sessions_used=len(usable),
                caveats=[MIXED_UNIT_CAVEAT],
            )

        uncalibrated = [s.session_date for s in usable if s.calibration_method == "unavailable"]
        if uncalibrated:
            caveats.append(_uncalibrated_session_caveat(uncalibrated))

        if len(usable) < DEFAULT_MIN_SESSIONS_FOR_TREND:
            return LongitudinalTrend(
                trend="indeterminate",
                relative_change=None,
                n_sessions_used=len(usable),
                caveats=caveats
                + [
                    f"Fewer than {DEFAULT_MIN_SESSIONS_FOR_TREND} sessions with measured SPV "
                    "are available -- a trend is not computed."
                ],
            )

        trend_label, relative_change = classify_longitudinal_trend(
            [s.session_date for s in usable],
            [s.mean_spv_magnitude for s in usable],
            min_sessions=DEFAULT_MIN_SESSIONS_FOR_TREND,
            threshold=DEFAULT_LONGITUDINAL_TREND_THRESHOLD,
        )
        return LongitudinalTrend(
            trend=trend_label,
            relative_change=relative_change,
            n_sessions_used=len(usable),
            caveats=caveats,
        )

    def _compute_pattern_changes(self, sessions: List[SessionRecord]) -> List[PatternPresenceChange]:
        all_patterns = sorted({p for s in sessions for p in s.patterns_detected})
        changes = []
        for pattern in all_patterns:
            present_dates = [s.session_date for s in sessions if pattern in s.patterns_detected]

            newly_appeared_in: Optional[str] = None
            newly_resolved_in: Optional[str] = None
            previously_present = False
            for s in sessions:
                is_present = pattern in s.patterns_detected
                if is_present and not previously_present and s.session_date != sessions[0].session_date:
                    newly_appeared_in = s.session_date
                if not is_present and previously_present:
                    newly_resolved_in = s.session_date
                previously_present = is_present

            changes.append(
                PatternPresenceChange(
                    pattern=pattern,
                    sessions_present=present_dates,
                    newly_appeared_in=newly_appeared_in,
                    newly_resolved_in=newly_resolved_in,
                )
            )
        return changes
