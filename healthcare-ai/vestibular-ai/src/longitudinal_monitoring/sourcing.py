"""Reads Stage 2/4/5 outputs for one session (never re-runs them).

`screening_summary.json` (Stage 5) is REQUIRED -- the same "clean bill
of health by omission" risk Stage 6 identified for its own report,
applied per session here: a session ingested with no Stage 5 output at
all would be indistinguishable from a session that was actually clean.
`features_summary.json` (Stage 2, needed for SPV) and
`nystagmus_characterization_summary.json` (Stage 4) are optional and
degrade gracefully -- a missing one only blanks that session's specific
fields, it doesn't fail ingestion of the whole session.
"""
import json
from pathlib import Path
from typing import Optional, Tuple

# Preference order: most-calibrated unit first. Stage 2 only populates
# a unit when its calibration actually succeeded for that unit (deg_s
# needs explicit camera geometry, mm_s needs iris-based calibration,
# px_s is always available when the recording is jerk-classified).
_SPV_FIELDS = (
    ("mean_slow_phase_velocity_deg_s", "deg_s"),
    ("mean_slow_phase_velocity_mm_s", "mm_s"),
    ("mean_slow_phase_velocity_px_s", "px_s"),
)


def _load_json_optional(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def _extract_spv(features_summary: Optional[dict]) -> Tuple[Optional[float], Optional[str]]:
    """abs()'d: Stage 2's value is signed, and a direction_changing
    recording's raw signed mean can cancel toward a small number even
    with real bidirectional intensity -- Stage 7 tracks intensity
    magnitude across sessions, not net direction.
    """
    if features_summary is None:
        return None, None
    for key, unit in _SPV_FIELDS:
        value = features_summary.get(key)
        if value is not None:
            return abs(float(value)), unit
    return None, None


def extract_session_metrics(output_dir: str) -> dict:
    output_dir = Path(output_dir)
    screening_path = output_dir / "screening_summary.json"
    if not screening_path.exists():
        raise FileNotFoundError(
            f"{screening_path} not found -- Stage 5 (disorder screening) must be run for this "
            "session before it can be ingested."
        )
    with open(screening_path) as f:
        screening_summary = json.load(f)

    features_summary = _load_json_optional(output_dir / "features_summary.json")
    characterization_summary = _load_json_optional(output_dir / "nystagmus_characterization_summary.json")

    mean_spv_magnitude, spv_unit = _extract_spv(features_summary)
    waveform_classification = features_summary.get("waveform_classification") if features_summary else None
    calibration_method = None
    if features_summary and features_summary.get("calibration"):
        calibration_method = features_summary["calibration"].get("method")

    return {
        "waveform_classification": waveform_classification,
        "mean_spv_magnitude": mean_spv_magnitude,
        "spv_unit": spv_unit,
        "calibration_method": calibration_method,
        "n_jerk_episodes": characterization_summary.get("n_jerk_episodes") if characterization_summary else None,
        "direction_consistency": characterization_summary.get("direction_consistency") if characterization_summary else None,
        "patterns_detected": [f["pattern"] for f in screening_summary.get("patterns_detected", [])],
    }
