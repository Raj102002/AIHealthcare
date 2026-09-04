"""Fixed catalog of clinically-relevant entities this pipeline
structurally cannot evaluate, and why -- always listed in full,
regardless of input, so the boundary of what was and wasn't checked is
never implicit. No detection logic here, only the static list.
"""
from typing import List

from .types import NotAssessableEntry

CATALOG: List[NotAssessableEntry] = [
    NotAssessableEntry(
        pattern="BPPV (Benign Paroxysmal Positional Vertigo)",
        reason="Requires positional/provocation-maneuver context (e.g. Dix-Hallpike) -- this pipeline has no record of head position or test maneuver, only eye movement.",
    ),
    NotAssessableEntry(
        pattern="Vertical (downbeat/upbeat) and torsional nystagmus",
        reason="This entire pipeline (Stages 2-5) analyzes horizontal eye-movement position only (x_px) -- vertical and torsional eye movement were never measured.",
    ),
    NotAssessableEntry(
        pattern="Fixation suppression",
        reason="Requires knowing whether the subject was visually fixating during the recording -- not captured by this pipeline.",
    ),
    NotAssessableEntry(
        pattern="Congenital/infantile nystagmus",
        reason="Requires age and onset history -- this pipeline has no patient history of any kind.",
    ),
    NotAssessableEntry(
        pattern="Any condition requiring caloric, rotational, audiometric, or imaging data",
        reason="This project has never incorporated any modality beyond 2D eye-movement video, despite the original project name's 'multimodal' aspiration.",
    ),
]


def get_catalog() -> List[NotAssessableEntry]:
    return list(CATALOG)
