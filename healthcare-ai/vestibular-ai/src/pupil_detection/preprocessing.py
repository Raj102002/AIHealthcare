"""Lighting-robust preprocessing shared by all detectors."""
import cv2
import numpy as np

_CLAHE = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))


def to_gray(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 2:
        return frame
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def normalize_illumination(gray: np.ndarray) -> np.ndarray:
    """Contrast-limited adaptive histogram equalization.

    Makes pupil/iris contrast comparable across bright rooms, dim rooms,
    and IR eye-camera footage, instead of relying on one fixed threshold.
    """
    return _CLAHE.apply(gray)


def remove_specular_highlights(gray: np.ndarray, bright_thresh: int = 240) -> np.ndarray:
    """Inpaint corneal/glasses glint so it doesn't punch a hole in the pupil blob."""
    _, glint_mask = cv2.threshold(gray, bright_thresh, 255, cv2.THRESH_BINARY)
    if cv2.countNonZero(glint_mask) == 0:
        return gray
    glint_mask = cv2.dilate(glint_mask, np.ones((3, 3), np.uint8), iterations=1)
    return cv2.inpaint(gray, glint_mask, 3, cv2.INPAINT_TELEA)


def prepare(gray: np.ndarray, use_clahe: bool = True, remove_specular: bool = True) -> np.ndarray:
    """Full preprocessing chain used before pupil segmentation.

    `use_clahe`/`remove_specular` exist only for the Stage 1 ablation study
    (scripts/ablation_lpw.py) -- both default True, which is the unchanged
    production chain.
    """
    denoised = cv2.GaussianBlur(gray, (5, 5), 0)
    normalized = normalize_illumination(denoised) if use_clahe else denoised
    return remove_specular_highlights(normalized) if remove_specular else normalized
