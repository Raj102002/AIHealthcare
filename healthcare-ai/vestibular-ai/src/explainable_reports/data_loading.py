"""Loads Stage 1-5 outputs from a shared --output-dir for Stage 6's report.

`screening_summary.json` (Stage 5) is REQUIRED -- a report showing Stage
2-4 detail with no Stage 5 disclaimer/findings would be the single worst
partial-report outcome this stage could produce (could read as a clean
bill of health by omission), so this raises rather than degrades.
Everything else degrades gracefully, tracked as present/absent so the
render layer can say "not available" per section instead of silently
omitting it or crashing.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import pandas as pd


@dataclass
class ReportInputs:
    output_dir: Path
    screening_summary: dict  # Stage 5, required
    characterization_summary: Optional[dict]  # Stage 4, optional
    movement_events: Optional[pd.DataFrame]  # Stage 3, optional
    kinematics: Optional[pd.DataFrame]  # Stage 2, optional
    trajectory: Optional[pd.DataFrame]  # Stage 1, optional
    warnings: List[str] = field(default_factory=list)


def load_report_inputs(output_dir: str) -> ReportInputs:
    output_dir = Path(output_dir)
    screening_path = output_dir / "screening_summary.json"
    if not screening_path.exists():
        raise FileNotFoundError(
            f"{screening_path} not found -- Stage 5 (disorder screening) must be run first. "
            "Refusing to build a report without it: showing Stage 2-4 detail with no Stage 5 "
            "disclaimer/findings could read as a clean bill of health by omission."
        )
    with open(screening_path) as f:
        screening_summary = json.load(f)

    warnings: List[str] = []

    characterization_summary = _load_json_optional(output_dir / "nystagmus_characterization_summary.json")
    if characterization_summary is None:
        warnings.append("nystagmus_characterization_summary.json not found -- per-episode detail unavailable.")

    movement_events = _load_csv_optional(output_dir / "movement_events.csv")
    if movement_events is None:
        warnings.append("movement_events.csv not found -- event timeline unavailable.")

    kinematics = _load_csv_optional(output_dir / "kinematics.csv")
    if kinematics is None:
        warnings.append("kinematics.csv not found -- recording overview/charts unavailable.")

    trajectory = _load_csv_optional(output_dir / "trajectory.csv")
    if trajectory is None:
        warnings.append("trajectory.csv not found -- Stage 1 detection summary unavailable.")

    # Defensive check, not a fix: do the findings' episode_indices exist
    # in the loaded characterization data? A mismatch can happen if the
    # five CLIs were run with inconsistent thresholds across separate
    # invocations against the same --output-dir (screening_cli re-runs
    # Stage 4 internally -- see disorder_screening/pipeline.py). Not
    # solved here, just surfaced rather than silently trusted.
    if characterization_summary is not None:
        n_episodes = len(characterization_summary.get("episodes", []))
        for findingdict in screening_summary.get("patterns_detected", []):
            for idx in findingdict.get("episode_indices", []):
                if idx < 0 or idx >= n_episodes:
                    warnings.append(
                        f"Finding '{findingdict.get('pattern')}' cites episode_index {idx}, which is "
                        f"out of range for the loaded characterization data ({n_episodes} episodes) -- "
                        "the on-disk Stage 4 output may not match what produced this Stage 5 finding "
                        "(e.g. the five CLIs were run with different thresholds in separate invocations)."
                    )

    return ReportInputs(
        output_dir=output_dir,
        screening_summary=screening_summary,
        characterization_summary=characterization_summary,
        movement_events=movement_events,
        kinematics=kinematics,
        trajectory=trajectory,
        warnings=warnings,
    )


def _load_json_optional(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def _load_csv_optional(path: Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    return pd.read_csv(path)
