"""Persistence: one JSON file per subject at history/<subject_id>/history.json.

Given this project's own earlier concurrent-session file-clobbering
incident, writes are atomic (temp file + os.replace -- never a torn file
on crash) and guarded by an optimistic-concurrency check (a `version`
counter, re-checked immediately before the final replace). This is
DETECTION of a concurrent write, not prevention: a race window still
exists between the recheck and the replace. A real file lock (e.g. the
`filelock` package) is overscoped for an unconfirmed concurrency need in
this project and is explicitly deferred, not silently ignored.
"""
import dataclasses
import json
import os
from pathlib import Path

from .types import SessionRecord, SubjectHistory


class ConcurrentModificationError(Exception):
    """Raised when the on-disk history changed since it was loaded."""


def _history_path(history_dir: str, subject_id: str) -> Path:
    return Path(history_dir) / subject_id / "history.json"


def load_history(history_dir: str, subject_id: str) -> SubjectHistory:
    path = _history_path(history_dir, subject_id)
    if not path.exists():
        return SubjectHistory(subject_id=subject_id)
    with open(path) as f:
        data = json.load(f)
    sessions = [SessionRecord(**s) for s in data.get("sessions", [])]
    return SubjectHistory(subject_id=data["subject_id"], version=data.get("version", 0), sessions=sessions)


def save_history_atomic(history_dir: str, history: SubjectHistory, expected_version: int) -> None:
    path = _history_path(history_dir, history.subject_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        with open(path) as f:
            on_disk = json.load(f)
        if on_disk.get("version", 0) != expected_version:
            raise ConcurrentModificationError(
                f"history for subject {history.subject_id!r} was modified since it was loaded "
                f"(expected version {expected_version}, found {on_disk.get('version', 0)}) -- "
                "reload and retry rather than overwrite."
            )

    history.version = expected_version + 1
    tmp_path = path.with_suffix(".json.tmp")
    with open(tmp_path, "w") as f:
        json.dump(dataclasses.asdict(history), f, indent=2)
    os.replace(tmp_path, path)
