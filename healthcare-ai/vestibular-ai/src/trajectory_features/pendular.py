"""Fallback frequency/amplitude analysis for waveforms with no reliable
fast/slow-phase structure (pendular nystagmus, or plain smooth pursuit).

Forcing a beat decomposition onto a signal that doesn't have one would
fabricate meaningless beats, so segmentation.classify_waveform falls back
to this module's spectral estimate instead when detect_beats can't find
enough well-fit beats.

Design choice: FFT (numpy.fft.rfft) on the single longest contiguous
trustworthy segment, not a Lomb-Scargle periodogram stitched across all
gapped samples. Concatenating across a dropped blink gap would inject a
spurious discontinuity into the spectrum; Lomb-Scargle handles irregular
sampling but its amplitude normalization is fiddly to get right for a
plain peak-to-peak amplitude claim. This is simpler, directly testable
against a known-frequency synthetic signal, and costs only frequency
resolution on short/fragmented recordings (stated in `PendularSummary.note`,
not hidden) -- consistent with this project's precedent of not adopting a
fancier method unless it measurably earns its complexity.
"""
from typing import Optional, Tuple

import numpy as np
import pandas as pd

from .types import CalibrationResult, PendularSummary

# Below this many samples, an FFT's frequency resolution/peak estimate is
# unreliable enough that reporting a number would be more misleading than
# admitting there isn't enough gap-free signal to analyze.
MIN_SPECTRUM_SAMPLES = 8


def longest_contiguous_segment(kin_df: pd.DataFrame) -> Optional[np.ndarray]:
    """Positional row-indices (into `kin_df`) of its largest included segment."""
    included = kin_df[kin_df["included"]]
    if included.empty:
        return None
    counts = included.groupby("segment_id").size()
    best_id = counts.idxmax()
    return kin_df.index[kin_df["segment_id"] == best_id].to_numpy()


def compute_spectrum(t: np.ndarray, x: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Detrended, Hann-windowed magnitude spectrum of a (roughly) uniformly
    sampled position signal. Detrending keeps a slow drift/DC offset from
    dominating the spectrum; the Hann window reduces spectral leakage from
    the segment's finite length not being an exact number of cycles.
    """
    dt = float(np.median(np.diff(t)))
    slope, intercept = np.polyfit(t, x, 1)
    detrended = x - (slope * t + intercept)
    windowed = detrended * np.hanning(len(x))
    spectrum = np.fft.rfft(windowed)
    freqs = np.fft.rfftfreq(len(x), d=dt)
    return freqs, np.abs(spectrum)


def analyze_pendular(
    kin_df: pd.DataFrame,
    position_col: str = "x_px",
    calibration: Optional[CalibrationResult] = None,
) -> Optional[PendularSummary]:
    seg = longest_contiguous_segment(kin_df)
    if seg is None or len(seg) < MIN_SPECTRUM_SAMPLES:
        return None

    t = kin_df["time_s"].to_numpy()[seg]
    x = kin_df[position_col].to_numpy()[seg]
    freqs, magnitude = compute_spectrum(t, x)

    peak_idx = int(np.argmax(magnitude[1:])) + 1 if len(magnitude) > 1 else 0
    dominant_freq = float(freqs[peak_idx])

    p95, p05 = np.percentile(x, [95, 5])
    amplitude_px = float(p95 - p05)
    amplitude_mm = amplitude_px / calibration.px_per_mm if calibration and calibration.px_per_mm else None
    amplitude_deg = amplitude_px * calibration.deg_per_px if calibration and calibration.deg_per_px else None

    return PendularSummary(
        dominant_frequency_hz=dominant_freq,
        peak_to_peak_amplitude_px=amplitude_px,
        axis="x" if position_col == "x_px" else "y",
        n_samples_used=int(len(seg)),
        note=(
            f"Estimated from the longest gap-free stretch only "
            f"({len(seg)} frames, {t[-1] - t[0]:.2f}s), not the full recording -- "
            "frequency resolution is limited accordingly for short/fragmented videos."
        ),
        peak_to_peak_amplitude_mm=amplitude_mm,
        peak_to_peak_amplitude_deg=amplitude_deg,
    )
