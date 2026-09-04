"""Evidence-based failure categorization for the closeup classical detector.

Used only by scripts/analyze_lpw_failures.py (Task 1 of the Stage 1
validation project) -- never imported by the live detection pipeline. Each
category is assigned only when a specific, measurable signal crosses a
documented threshold; anything that doesn't match a rule is labeled
"unknown/needs manual review" rather than guessed, per the project's "do not
fabricate labels" requirement. Categories are intentionally checked in order
from most to least specific -- the first rule that matches wins.

"motion_blur" is NOT decided here: it needs a per-video sharpness baseline
that isn't available frame-by-frame, so scripts/analyze_lpw_failures.py
computes it as a second pass over frames this module left as
"unknown/needs manual review" (see that script's `_apply_motion_blur_pass`).
"""
from typing import List, Optional, Tuple

import cv2
import numpy as np

from . import preprocessing
from .classical_detector import LocalDetection, generate_candidates

FAILURE_CATEGORIES = [
    "pupil_near_frame_boundary",
    "specular_glare",
    "eyelid_occlusion",
    "very_dark_iris",
    "low_contrast",
    "contour_fragmentation",
    "multiple_competing_dark_regions",
    "threshold_selects_iris_instead_of_pupil",
    "threshold_selects_eyelash_or_shadow_instead_of_pupil",
    "extreme_gaze_direction",
    "motion_blur",  # assigned only by the second pass, see module docstring
    "other/unknown",
]

# Pixel error above which a *found* detection still counts as a failure for
# categorization purposes (a few px of jitter isn't a "failure mode").
DEFAULT_FAIL_PX = 20.0


def _window_stats(img: np.ndarray, cx: float, cy: float, radius: int) -> Optional[np.ndarray]:
    h, w = img.shape[:2]
    x0, x1 = max(0, int(cx - radius)), min(w, int(cx + radius))
    y0, y1 = max(0, int(cy - radius)), min(h, int(cy + radius))
    if x1 <= x0 or y1 <= y0:
        return None
    return img[y0:y1, x0:x1]


def classify_frame(
    gray: np.ndarray,
    gt_xy: Tuple[float, float],
    det: LocalDetection,
    fail_px: float = DEFAULT_FAIL_PX,
) -> str:
    h, w = gray.shape[:2]
    gt_x, gt_y = gt_xy
    err = float(np.hypot(det.cx - gt_x, det.cy - gt_y)) if det.found else None
    is_failure = (err is None) or (err > fail_px)
    if not is_failure:
        return ""  # not a failure frame at all -- caller shouldn't classify these

    # 1. GT itself sits near the frame border -- centrality scoring and the
    #    morphological kernel both work worse near an edge, and the pupil may
    #    be partially cropped out of frame entirely. Evidence: ground truth
    #    coordinate is within 6% of image size from any edge.
    margin = 0.06 * min(w, h)
    if gt_x < margin or gt_x > w - margin or gt_y < margin or gt_y > h - margin:
        return "pupil_near_frame_boundary"

    # 2. Specular glint sits on/near the true pupil location. Evidence:
    #    a meaningful fraction of a small window around GT, in the RAW
    #    (pre-inpainting) image, is near-saturated bright.
    raw_window = _window_stats(gray, gt_x, gt_y, radius=12)
    if raw_window is not None and raw_window.size > 0:
        glare_frac = float(np.mean(raw_window > 240))
        if glare_frac > 0.15:
            return "specular_glare"

    # 3. The true pupil location itself reads bright/skin-toned rather than
    #    dark -- consistent with the eyelid covering the pupil that frame.
    #    Evidence: median raw brightness at GT is high (pupils are dark;
    #    sclera/skin/eyelid are not).
    if raw_window is not None and raw_window.size > 0:
        if float(np.median(raw_window)) > 120:
            return "eyelid_occlusion"

    # 4/5. Contrast around the true location, measured the same way
    #    detect_pupil measures contrast around its *chosen* candidate (ring
    #    of pixels just outside vs just inside), but centered on GT instead.
    prepped = preprocessing.prepare(gray)
    inner = _window_stats(prepped, gt_x, gt_y, radius=6)
    outer_full = _window_stats(prepped, gt_x, gt_y, radius=16)
    if inner is not None and outer_full is not None and inner.size and outer_full.size:
        inner_med = float(np.median(inner))
        outer_med = float(np.median(outer_full))
        contrast = outer_med - inner_med
        if contrast < 12:
            if inner_med < 60 and outer_med < 90:
                return "very_dark_iris"
            return "low_contrast"

    # 6/7. Look at what the detector's own candidate generation produced.
    _, mask, candidates = generate_candidates(gray)
    gt_window_mask = _window_stats(mask, gt_x, gt_y, radius=10)
    has_dark_near_gt = gt_window_mask is not None and gt_window_mask.size > 0 and np.any(gt_window_mask > 0)
    if not candidates:
        if has_dark_near_gt:
            # Something WAS flagged dark near GT by the threshold, but no
            # candidate survived the area filter -- it got broken into
            # fragments too small to pass, or merged into something too big.
            return "contour_fragmentation"
    else:
        scores = sorted((c[1] for c in candidates), reverse=True)
        if len(scores) >= 2 and (scores[0] - scores[1]) < 0.08:
            return "multiple_competing_dark_regions"

    if det.found:
        area_frac = det.axis_major * det.axis_minor * np.pi / 4 / (w * h)
        if area_frac > 0.08:
            return "threshold_selects_iris_instead_of_pupil"
        if err is not None and err > fail_px and det.confidence < 0.6:
            return "threshold_selects_eyelash_or_shadow_instead_of_pupil"

    # 8. Broad fallback for "GT is far from center but not at the edge" --
    #    checked last since it's the least specific signal.
    cx_frac = abs(gt_x - w / 2) / (w / 2)
    cy_frac = abs(gt_y - h / 2) / (h / 2)
    if max(cx_frac, cy_frac) > 0.55:
        return "extreme_gaze_direction"

    return "other/unknown"
