"""Generic run-length-encoding helpers shared by any binary-classification
threshold that needs "merge short runs into their longer neighbor" noise
rejection -- originally written for segmentation.py's fast/slow-phase
split, extracted here (unchanged behavior, just parameterized labels)
because movement_classification's fixation/motion split needs the exact
same logic.
"""
from typing import List, Tuple

import numpy as np


def label_runs(mask: np.ndarray, true_label: str, false_label: str) -> List[Tuple[int, int, str]]:
    """Run-length-encodes a boolean array into (start, end_exclusive, label) runs."""
    runs = []
    start = 0
    for i in range(1, len(mask) + 1):
        if i == len(mask) or mask[i] != mask[start]:
            runs.append((start, i, true_label if mask[start] else false_label))
            start = i
    return runs


def merge_short_runs(
    mask: np.ndarray,
    t: np.ndarray,
    min_true_s: float,
    min_false_s: float,
    true_label: str,
    false_label: str,
) -> np.ndarray:
    """Relabels runs shorter than their label's minimum duration to match
    their longer neighbor -- a single noisy sample shouldn't count as its
    own run. Iterates to convergence since one merge can shorten/extend an
    adjacent run enough to also need merging.
    """
    mask = mask.copy()
    min_needed = {true_label: min_true_s, false_label: min_false_s}
    for _ in range(len(mask)):  # generous upper bound; converges much sooner in practice
        runs = label_runs(mask, true_label, false_label)
        if len(runs) <= 1:
            break
        changed = False
        for k, (start, end, label) in enumerate(runs):
            duration = t[end - 1] - t[start] if end - start > 1 else 0.0
            if duration >= min_needed[label]:
                continue
            neighbors = [runs[k - 1]] if k > 0 else []
            if k < len(runs) - 1:
                neighbors.append(runs[k + 1])
            if not neighbors:
                continue
            target = max(neighbors, key=lambda r: r[1] - r[0])
            if target[2] != label:
                mask[start:end] = target[2] == true_label
                changed = True
        if not changed:
            break
    return mask
