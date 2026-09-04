"""Slow-phase waveform-shape classification.

Jerk-nystagmus slow phases have three recognizable position-vs-time
shapes (Leigh & Zee, "The Neurology of Eye Movements"): constant-
velocity/linear (classic peripheral-vestibular pattern), decreasing-
velocity/concave (deceleration within the slow phase), increasing-
velocity/convex-exponential (an unstable "leaky neural integrator"
pattern classically associated with gaze-evoked/central nystagmus).
**This is a shape descriptor, not a diagnosis** -- shape alone cannot
diagnose central vs. peripheral origin without much more clinical
context; every caller of this module must carry that caveat forward.

Both exponential models are linear in (a, b) for a *fixed* tau, so tau is
grid-searched and (a, b) solved in closed form via np.linalg.lstsq at
each candidate -- this can never fail to converge and needs no initial
guess, unlike scipy.optimize.curve_fit, and is simpler for the same
reason this codebase prefers simple methods until a fancier one
demonstrably earns its complexity (see pendular.py's docstring).
"""
from typing import Optional, Tuple

import numpy as np

DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT = 6
DEFAULT_MIN_R_SQUARED_IMPROVEMENT = 0.05
DEFAULT_TAU_GRID_POINTS = 25


def _fit_exponential(t_rel: np.ndarray, x: np.ndarray, growth: bool) -> Tuple[Optional[float], float]:
    """Grid-searches tau for x(t) = a + b*(exp(t/tau)-1) (growth=True,
    "increasing_velocity") or x(t) = a + b*(1-exp(-t/tau)) (growth=False,
    "decreasing_velocity"), solving (a, b) in closed form at each
    candidate. Returns (tau, r_squared), or (None, -inf) if the best fit
    is pinned to a grid edge -- that means the optimizer wants "more
    exponential" or "more linear" than the grid allowed, i.e. a
    degenerate, not a real characteristic, tau.
    """
    duration = float(t_rel[-1] - t_rel[0])
    if duration <= 0:
        return None, -np.inf

    taus = np.geomspace(0.1 * duration, 5 * duration, DEFAULT_TAU_GRID_POINTS)
    ss_tot = float(np.sum((x - x.mean()) ** 2))
    if ss_tot <= 0:
        return None, -np.inf

    best_tau, best_r2 = None, -np.inf
    for tau in taus:
        basis = np.exp(t_rel / tau) - 1 if growth else 1 - np.exp(-t_rel / tau)
        design = np.column_stack([np.ones_like(t_rel), basis])
        coeffs, _, _, _ = np.linalg.lstsq(design, x, rcond=None)
        pred = design @ coeffs
        ss_res = float(np.sum((x - pred) ** 2))
        r2 = 1.0 - ss_res / ss_tot
        if r2 > best_r2:
            best_tau, best_r2 = float(tau), r2

    if best_tau <= taus[0] * 1.0001 or best_tau >= taus[-1] * 0.9999:
        return None, -np.inf
    return best_tau, best_r2


def classify_beat_shape(
    t: np.ndarray,
    x: np.ndarray,
    linear_r_squared: float,
    min_samples: int = DEFAULT_MIN_SAMPLES_FOR_SHAPE_FIT,
    min_r_squared_improvement: float = DEFAULT_MIN_R_SQUARED_IMPROVEMENT,
) -> Tuple[str, Optional[float], float]:
    """Returns (shape_label, tau_s_or_None, winning_r_squared).

    `linear_r_squared` is Stage 2's already-computed slow-phase linear
    fit R^2 -- never refit here. `t`/`x` are the beat's raw slow-phase
    samples; callers MUST pass them still in absolute time -- recentering
    to the beat's own start happens internally, since fitting exp(t/tau)
    against an absolute-time offset (a beat occurring 200s into a
    recording) would produce nonsensical/overflowing values.
    """
    if len(t) < min_samples:
        return "indeterminate", None, linear_r_squared

    t_rel = t - t[0]
    tau_inc, r2_inc = _fit_exponential(t_rel, x, growth=True)
    tau_dec, r2_dec = _fit_exponential(t_rel, x, growth=False)

    candidates = [("linear", None, linear_r_squared)]
    if tau_inc is not None:
        candidates.append(("increasing_velocity", tau_inc, r2_inc))
    if tau_dec is not None:
        candidates.append(("decreasing_velocity", tau_dec, r2_dec))

    label, tau, r2 = max(candidates, key=lambda c: c[2])
    if label != "linear" and r2 - linear_r_squared < min_r_squared_improvement:
        return "linear", None, linear_r_squared
    return label, tau, r2
