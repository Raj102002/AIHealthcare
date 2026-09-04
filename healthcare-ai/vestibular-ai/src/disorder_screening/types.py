"""Shared data types for the Stage 5 disorder-screening pipeline.

Every field here is descriptive pattern-matching against literature
criteria, applied to ONE eye-movement recording -- never a diagnosis.
See pipeline.py's `DISCLAIMER`/`MODALITY_LIMITATION` for the full,
always-present caveat text.
"""
from dataclasses import dataclass, field
from typing import List


@dataclass
class PatternFinding:
    """One detected pattern, citing exactly which Stage 4 episodes support it."""

    pattern: str
    episode_indices: List[int]
    supporting_evidence: dict
    caveat: str


@dataclass
class NotAssessableEntry:
    """One clinically-relevant entity this pipeline structurally cannot
    evaluate, and why -- always listed in full, regardless of input, so
    the boundary of what was and wasn't checked is never implicit.
    """

    pattern: str
    reason: str


@dataclass
class ScreeningSummary:
    modality_limitation: str
    disclaimer: str
    patterns_detected: List[PatternFinding] = field(default_factory=list)
    patterns_not_assessable: List[NotAssessableEntry] = field(default_factory=list)
    # The pipeline's actual configured thresholds for this run (not just
    # their defaults) -- lets a downstream consumer (e.g. Stage 6's
    # report) show how close a borderline finding was, instead of a bare
    # measured value with no visible bar to compare it against.
    thresholds: dict = field(default_factory=dict)
