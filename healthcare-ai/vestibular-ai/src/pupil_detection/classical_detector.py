"""Classical (non-learned) pupil segmentation.

Dependency-light fallback that works directly on a close-up eye-camera
frame or on an eye ROI cropped by `eye_localizer`/MediaPipe. It assumes
the pupil is the largest sufficiently-circular dark region in the frame,
which holds for both visible-light and IR VOG/VNG footage.

Robustness choices (each maps to a condition called out in the Stage 1
spec):
  - CLAHE + relative (percentile) thresholding -> lighting changes.
  - specular-highlight inpainting              -> glasses/cornea glint.
  - morphological open/close                   -> eyelashes, sensor noise.
  - circularity + centrality + area scoring     -> pick the pupil, not an
                                                    eyebrow shadow or frame edge.
"""
from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np

from . import preprocessing


@dataclass
class LocalDetection:
    """Detection result in the coordinate frame of the ROI passed in."""

    found: bool
    cx: float = 0.0
    cy: float = 0.0
    axis_major: float = 0.0
    axis_minor: float = 0.0
    angle_deg: float = 0.0
    confidence: float = 0.0
    mask: Optional[np.ndarray] = None  # uint8 0/255, same shape as input ROI
    # Measured iris (limbus) diameter in pixels, or None if it couldn't be
    # measured this frame. Iris diameter is nearly constant across frames
    # for a given subject (unlike pupil size, which changes with light) --
    # it's a per-subject calibration reference for converting later pixel
    # measurements to mm/degrees. Adult horizontal iris diameter is ~11.5-
    # 12.0mm and reaches that size by ~age 2, but infants run smaller
    # (~10.0-10.5mm) -- a real gap, so any future px-to-mm conversion
    # (Stage 2) should use an age-appropriate reference, not one fixed
    # constant, if pediatric patients are in scope. Never a hardcoded
    # fallback here: downstream code decides how to handle a gap (e.g.
    # carry forward the last valid measurement).
    iris_diameter_px: Optional[float] = None


def _kernel(roi_w: int, frac: float, min_size: int = 3, max_size: int = 21) -> np.ndarray:
    # Capped in absolute pixels, not just fraction-of-width: at real eye-
    # camera resolutions (e.g. LPW's 640x480) an uncapped fraction blows a
    # kernel up to ~50px, which made morphologyEx/dilate cost ~24ms/frame
    # combined -- most of detect_pupil's total runtime -- for no accuracy
    # benefit past a certain absolute size. 21 keeps behavior unchanged at
    # the small (~200px) synthetic test resolution while bounding cost at
    # real resolutions.
    size = max(min_size, min(int(round(roi_w * frac)) | 1, max_size))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def _ellipse_validation_score(contour: np.ndarray) -> Optional[float]:
    """How well a contour's own shape matches an ellipse: high for a clean
    blob, low for an eyelash/shadow streak (elongated, contour area far from
    the area its fitted ellipse implies). Not part of the shipped detector's
    default scoring (see `use_ellipse_validation` on `detect_pupil`) -- added
    for the Stage 1 ablation study (scripts/ablation_lpw.py) to test whether
    an explicit ellipse-shape check helps reject eyelash/shadow candidates
    beyond what `circularity` (a perimeter/area ratio, blind to elongation
    orientation) already catches.
    """
    if len(contour) < 5:
        return None
    (_, _), (ax1, ax2), _ = cv2.fitEllipse(contour)
    if ax1 <= 0 or ax2 <= 0:
        return None
    ellipse_area = np.pi * (ax1 / 2) * (ax2 / 2)
    contour_area = cv2.contourArea(contour)
    if ellipse_area <= 0 or contour_area <= 0:
        return None
    area_ratio = min(contour_area, ellipse_area) / max(contour_area, ellipse_area)
    aspect = min(ax1, ax2) / max(ax1, ax2)
    return float(np.clip(0.6 * area_ratio + 0.4 * aspect, 0.0, 1.0))


def _score_contour(
    contour: np.ndarray,
    roi_w: int,
    roi_h: int,
    area_total: float,
    use_circularity: bool = True,
    use_centrality: bool = True,
    use_ellipse_validation: bool = False,
):
    area = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return None
    circularity = min(4 * np.pi * area / (perimeter**2), 1.0)
    m = cv2.moments(contour)
    if m["m00"] == 0:
        return None
    cx, cy = m["m10"] / m["m00"], m["m01"] / m["m00"]
    centrality = 1 - (abs(cx - roi_w / 2) / (roi_w / 2) + abs(cy - roi_h / 2) / (roi_h / 2)) / 2
    centrality = max(centrality, 0.0)
    size_score = min(area / (0.15 * area_total), 1.0)

    # Terms are summed unweighted-total (not renormalized) when a flag turns
    # one off: `score` is only ever used to argmax candidates within the same
    # frame, so a smaller max-possible score from a missing term doesn't
    # change ranking -- it just means "no default-behavior guarantee unless
    # every flag is at its default", which holds since 0.55+0.25+0.20 == 1.0
    # exactly matches the original fixed formula when all three are on and
    # `use_ellipse_validation` (new, off by default) is off.
    score = 0.0
    if use_circularity:
        score += 0.55 * circularity
    if use_centrality:
        score += 0.25 * centrality
    score += 0.20 * size_score
    if use_ellipse_validation:
        ellipse_score = _ellipse_validation_score(contour)
        if ellipse_score is not None:
            score += 0.20 * ellipse_score
    return score, area, circularity


_IRIS_WORKING_MAX_DIM = 240  # px; iris diameter only needs to be right to a few px


def _measure_iris_diameter(
    gray_roi: np.ndarray, w: int, h: int, pupil_cx: float, pupil_cy: float
) -> Optional[float]:
    """Fit an ellipse to the iris+pupil blob (both darker than sclera) and
    return its diameter in pixels, or None if no plausible iris boundary
    is found this frame.

    Uses Otsu's threshold rather than CLAHE + a fixed percentile: the
    iris+pupil region is a variable, unknown fraction of the ROI (unlike
    the pupil, which is reliably small), so a threshold that adapts to
    the actual bimodal sclera-vs-iris histogram is needed instead of one
    that assumes a fixed area fraction. CLAHE's per-tile equalization
    also distorts that histogram on frames with large flat regions, so
    it's deliberately skipped here (denoise + glint removal only).

    Runs on a downscaled copy: at real eye-camera resolutions (e.g.
    640x480) the morphology + inpainting here cost ~35ms/frame at full
    size -- more than the rest of detect_pupil combined -- for a
    measurement that only needs to be right to within a few pixels, not
    pixel-exact. Downscaling to `_IRIS_WORKING_MAX_DIM` cuts that to
    single-digit ms with no measurable accuracy loss (see
    test_iris_diameter_is_measured_not_assumed).
    """
    scale = min(1.0, _IRIS_WORKING_MAX_DIM / max(w, h))
    if scale < 1.0:
        small = cv2.resize(gray_roi, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    else:
        small = gray_roi
    sh, sw = small.shape[:2]
    area_total = float(sh * sw)

    denoised = cv2.GaussianBlur(small, (5, 5), 0)
    denoised = preprocessing.remove_specular_highlights(denoised)
    _, mask = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _kernel(sw, 0.06), iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(sw, 0.02), iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    pupil_pt = (pupil_cx * scale, pupil_cy * scale)
    best_c, best_area = None, 0.0
    for c in contours:
        if len(c) < 5:
            continue
        area = cv2.contourArea(c)
        if area < 0.03 * area_total or area > 0.9 * area_total:
            continue
        if cv2.pointPolygonTest(c, pupil_pt, False) < 0:
            continue  # iris must contain the already-found pupil center
        if area > best_area:
            best_c, best_area = c, area

    if best_c is None:
        return None
    (_, _), (ax1, ax2), _ = cv2.fitEllipse(best_c)
    return float(max(ax1, ax2) / scale)


def threshold_mask(
    prepped: np.ndarray,
    w: int,
    threshold_mode: str = "percentile",
    percentile: float = 8.0,
    fixed_value: float = 60.0,
) -> Tuple[np.ndarray, float]:
    """Binarize a preprocessed frame into a candidate-region mask.

    `threshold_mode="fixed"` (using `fixed_value`, a plausible fixed cutoff
    for CLAHE-normalized IR/close-up footage) exists only for the Stage 1
    ablation study -- production code always uses the default relative
    (percentile) threshold, since a fixed cutoff can't track per-frame/
    per-subject brightness the way the percentile can.
    """
    if threshold_mode == "fixed":
        thresh_val = float(fixed_value)
    else:
        thresh_val = float(np.percentile(prepped, percentile))
    _, mask = cv2.threshold(prepped, thresh_val, 255, cv2.THRESH_BINARY_INV)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(w, 0.02), iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _kernel(w, 0.05), iterations=2)
    return mask, thresh_val


def generate_candidates(
    gray_roi: np.ndarray,
    min_area_frac: float = 0.01,
    max_area_frac: float = 0.6,
    use_clahe: bool = True,
    remove_specular: bool = True,
    threshold_mode: str = "percentile",
    use_circularity: bool = True,
    use_centrality: bool = True,
    use_ellipse_validation: bool = False,
) -> Tuple[np.ndarray, np.ndarray, List[Tuple[np.ndarray, float, float, float]]]:
    """Shared candidate-generation step behind `detect_pupil`.

    Also used directly by scripts/analyze_lpw_failures.py (to see *why* a
    frame failed -- how many candidates survived, what scored where) and
    scripts/ablation_lpw.py (to run the same variants `detect_pupil` picks
    its default behavior from). Returns (preprocessed_frame, mask, candidates)
    where each candidate is (contour, score, area, circularity).
    """
    h, w = gray_roi.shape[:2]
    area_total = float(h * w)

    prepped = preprocessing.prepare(gray_roi, use_clahe=use_clahe, remove_specular=remove_specular)
    mask, _ = threshold_mask(prepped, w, threshold_mode=threshold_mode)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: List[Tuple[np.ndarray, float, float, float]] = []
    for c in contours:
        if len(c) < 5:
            continue
        area = cv2.contourArea(c)
        if area < min_area_frac * area_total or area > max_area_frac * area_total:
            continue
        scored = _score_contour(
            c, w, h, area_total,
            use_circularity=use_circularity,
            use_centrality=use_centrality,
            use_ellipse_validation=use_ellipse_validation,
        )
        if scored is None:
            continue
        score, area, circularity = scored
        candidates.append((c, score, area, circularity))

    return prepped, mask, candidates


def detect_pupil(
    gray_roi: np.ndarray,
    min_area_frac: float = 0.01,
    max_area_frac: float = 0.6,
    use_clahe: bool = True,
    remove_specular: bool = True,
    threshold_mode: str = "percentile",
    use_circularity: bool = True,
    use_centrality: bool = True,
    use_ellipse_validation: bool = False,
) -> LocalDetection:
    h, w = gray_roi.shape[:2]
    area_total = float(h * w)

    prepped, mask, candidates = generate_candidates(
        gray_roi, min_area_frac, max_area_frac,
        use_clahe=use_clahe,
        remove_specular=remove_specular,
        threshold_mode=threshold_mode,
        use_circularity=use_circularity,
        use_centrality=use_centrality,
        use_ellipse_validation=use_ellipse_validation,
    )

    if not candidates:
        return LocalDetection(found=False)

    best_c, best_score, best_area, best_circ = max(candidates, key=lambda t: t[1])
    ellipse = cv2.fitEllipse(best_c)
    (cx, cy), (ax1, ax2), angle = ellipse

    filled = np.zeros_like(mask)
    cv2.drawContours(filled, [best_c], -1, 255, -1)
    ring = cv2.dilate(filled, _kernel(w, 0.08), iterations=2)
    ring = cv2.bitwise_and(ring, cv2.bitwise_not(filled))

    inside_vals = prepped[filled == 255]
    outside_vals = prepped[ring == 255]
    if inside_vals.size == 0 or outside_vals.size == 0:
        contrast = 0.0
    else:
        contrast = float(np.clip((outside_vals.mean() - inside_vals.mean()) / 128.0, 0.0, 1.0))

    confidence = float(np.clip(0.5 * best_circ + 0.3 * contrast + 0.2 * min(best_area / (0.15 * area_total), 1.0), 0.0, 1.0))

    iris_diameter_px = _measure_iris_diameter(gray_roi, w, h, float(cx), float(cy))

    return LocalDetection(
        found=True,
        cx=float(cx),
        cy=float(cy),
        axis_major=float(max(ax1, ax2)),
        axis_minor=float(min(ax1, ax2)),
        angle_deg=float(angle),
        confidence=confidence,
        mask=filled,
        iris_diameter_px=iris_diameter_px,
    )
