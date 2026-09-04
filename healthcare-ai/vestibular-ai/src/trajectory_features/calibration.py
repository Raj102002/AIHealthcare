"""Per-recording pixel->physical-unit calibration.

Stage 1's classical_detector.py measures `iris_diameter_px` each frame as
a *per-subject* reference (iris diameter is stable across frames, unlike
pupil size, which reacts to light) -- explicitly intended there for this
stage to use for px->mm conversion. This module is that conversion.

There is no px->deg conversion available from Stage 1's data alone: that
additionally needs eye-to-camera working distance (or focal length),
which Stage 1 never measures. Rather than assume a fixed eyeball-radius
constant (which would fabricate a number this codebase has no basis for),
deg/s is only produced when the caller explicitly supplies
`working_distance_mm` or a direct `deg_per_px_override` from a real
calibration procedure.
"""
from typing import Optional

import numpy as np
import pandas as pd

from .types import CalibrationResult

# Adult horizontal iris diameter is ~11.5-12.0mm, reached by ~age 2;
# infants run smaller (~10.0-10.5mm) -- same reference and caveat as
# classical_detector.LocalDetection.iris_diameter_px. Not applicable to
# pediatric subjects without an age-appropriate override.
DEFAULT_ASSUMED_IRIS_MM = 11.7

# Trustworthy-frame gate mirrors kinematics.build_segments' default: a
# "predicted" (Kalman-extrapolated through a blink) or "none" frame never
# carries a real iris measurement in the first place (Stage 1 leaves it
# NaN there), but excluding by method name too keeps this robust even if
# that incidental fact ever changes.
_TRUSTWORTHY_MIN_CONFIDENCE = 0.3
_UNTRUSTWORTHY_METHODS = ("predicted", "none")


def calibrate(
    df: pd.DataFrame,
    assumed_iris_mm: float = DEFAULT_ASSUMED_IRIS_MM,
    working_distance_mm: Optional[float] = None,
    deg_per_px_override: Optional[float] = None,
    min_samples: int = 10,
) -> CalibrationResult:
    trustworthy = (
        df["found"]
        & ~df["method"].isin(_UNTRUSTWORTHY_METHODS)
        & (df["confidence"] >= _TRUSTWORTHY_MIN_CONFIDENCE)
    )
    iris_samples = df.loc[trustworthy, "iris_diameter_px"].dropna()
    n_samples = int(len(iris_samples))

    if n_samples < min_samples:
        return CalibrationResult(
            px_per_mm=None,
            deg_per_px=_resolve_deg_per_px(None, working_distance_mm, deg_per_px_override),
            iris_diameter_px_median=None,
            n_iris_samples=n_samples,
            assumed_iris_mm=assumed_iris_mm,
            method="unavailable",
            caveat=(
                f"Only {n_samples} trustworthy iris-diameter measurements found "
                f"(need >= {min_samples}); px/mm calibration unavailable, "
                "mm/deg-unit features will be None for this recording."
            ),
        )

    iris_median = float(iris_samples.median())
    px_per_mm = iris_median / assumed_iris_mm
    deg_per_px = _resolve_deg_per_px(px_per_mm, working_distance_mm, deg_per_px_override)

    caveat = (
        f"px/mm calibration derived from median measured iris diameter "
        f"({iris_median:.1f}px) over {n_samples} trustworthy frames, assuming "
        f"a {assumed_iris_mm}mm adult iris -- not valid for pediatric subjects "
        "without an age-appropriate --assumed-iris-mm override."
    )
    if deg_per_px is None:
        caveat += (
            " No --working-distance-mm or --deg-per-px supplied, so "
            "degree-unit features are unavailable (px/mm only)."
        )

    return CalibrationResult(
        px_per_mm=px_per_mm,
        deg_per_px=deg_per_px,
        iris_diameter_px_median=iris_median,
        n_iris_samples=n_samples,
        assumed_iris_mm=assumed_iris_mm,
        method="explicit_override" if deg_per_px_override is not None else "iris_diameter_median",
        caveat=caveat,
    )


def _resolve_deg_per_px(
    px_per_mm: Optional[float],
    working_distance_mm: Optional[float],
    deg_per_px_override: Optional[float],
) -> Optional[float]:
    if deg_per_px_override is not None:
        return float(deg_per_px_override)
    if px_per_mm is None or working_distance_mm is None:
        return None
    mm_per_px = 1.0 / px_per_mm
    # Small-angle approximation: a displacement of mm_per_px millimeters at
    # working_distance_mm from the eye's rotation center subtends this many
    # degrees. Adequate for the small eye-movement amplitudes nystagmus
    # involves; not a substitute for real camera-geometry calibration.
    return float(np.degrees(mm_per_px / working_distance_mm))
