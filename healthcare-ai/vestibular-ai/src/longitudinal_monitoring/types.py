"""Shared data types for the Stage 7 longitudinal-monitoring pipeline.

This is the first stage that persists anything linking separate
recordings together under one identifier -- see `SubjectHistory`'s
docstring for the privacy posture that follows from that.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SessionRecord:
    """One ingested recording session. `subject_id` is an opaque,
    caller-supplied string -- never a real name/DOB field, and this
    pipeline never infers or stores any identifying information beyond
    it. `output_dir` is stored RELATIVE to --history-dir, not absolute --
    an absolute/verbatim path is outside this pipeline's control (a
    clinician's own directory naming could itself be identifying) and
    storing it durably here would reintroduce exactly the risk the
    opaque subject_id is meant to avoid.
    """

    subject_id: str
    session_date: str  # ISO date (YYYY-MM-DD), caller-supplied -- no timestamp exists upstream
    output_dir: str  # relative to --history-dir
    waveform_classification: Optional[str] = None  # Stage 2
    mean_spv_magnitude: Optional[float] = None  # abs()'d; see trend.py's docstring
    spv_unit: Optional[str] = None  # "deg_s" | "mm_s" | "px_s" | None
    calibration_method: Optional[str] = None  # Stage 2's CalibrationResult.method
    n_jerk_episodes: Optional[int] = None  # Stage 4, optional
    direction_consistency: Optional[str] = None  # Stage 4, optional
    patterns_detected: List[str] = field(default_factory=list)  # Stage 5 pattern names
    # Non-blocking sanity-check warnings from identity_guard.py -- e.g.
    # "subject_id looks like it might be a real name". Never blocks
    # ingestion; see identity_guard.py's docstring for why.
    identity_warnings: List[str] = field(default_factory=list)


@dataclass
class LongitudinalTrend:
    trend: str  # "waxing" | "waning" | "stable" | "indeterminate"
    relative_change: Optional[float]
    n_sessions_used: int
    caveats: List[str] = field(default_factory=list)


@dataclass
class PatternPresenceChange:
    pattern: str
    sessions_present: List[str]  # session_dates where this pattern was detected
    newly_appeared_in: Optional[str] = None  # session_date, if absent then present
    newly_resolved_in: Optional[str] = None  # session_date, if present then absent


@dataclass
class SubjectHistory:
    """Persisted as history/<subject_id>/history.json. This file is the
    first place in the whole project that permanently links N recordings
    together under one identifier -- a materially higher-value target
    than any single session's own output directory, even with a fully
    opaque subject_id (see SessionRecord's docstring on output_dir).
    `version` is an optimistic-concurrency counter (see history_store.py)
    -- detection of a concurrent write, not prevention of one.
    """

    subject_id: str
    version: int = 0
    sessions: List[SessionRecord] = field(default_factory=list)
