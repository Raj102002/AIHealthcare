"""Matplotlib charts for the Stage 6 report, embedded as base64 PNG data
URIs (no temp files, one self-contained report.html).

The per-episode chart deliberately does NOT mark individual beats: Stage
4's episodes come from Stage 3's `extract_segment_episodes` (not from
Stage 2's `beats.csv`), so the two can legitimately disagree slightly on
beat boundaries for the same time span even though they describe the
same recording -- drawing Stage 2's beat timings on a Stage-4-episode
chart would be the report visibly contradicting itself right next to
Stage 5's findings. This only plots the raw position/speed trace (purely
descriptive, no claims attached) for the episode's own window.
"""
import base64
import io
from typing import Optional

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

EVENT_COLORS = {
    "fixation": "#9e9e9e",
    "saccade": "#f4a300",
    "nystagmus_jerk": "#d62728",
    "nystagmus_pendular": "#9467bd",
    "smooth_pursuit_or_drift": "#1f77b4",
    "gap": "#e0e0e0",
}
EPISODE_HIGHLIGHT_COLOR = "#d62728"


def fig_to_data_uri(fig) -> str:
    """Public (not module-private) since Stage 7's longitudinal report
    reuses this directly rather than duplicating a base64-embedding
    helper -- this project's established "import the real prior-stage
    code" pattern from Stage 3 onward.
    """
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode("ascii")


def render_timeline_chart(kinematics_df: pd.DataFrame, movement_events_df: Optional[pd.DataFrame]) -> str:
    fig, ax = plt.subplots(figsize=(10, 3))
    included = kinematics_df[kinematics_df["included"]]
    ax.plot(included["time_s"], included["speed_px_s"], color="#333333", linewidth=0.8)

    if movement_events_df is not None and not movement_events_df.empty:
        labels_present = []
        for _, row in movement_events_df.iterrows():
            color = EVENT_COLORS.get(row["label"], "#cccccc")
            ax.axvspan(row["start_s"], row["end_s"], color=color, alpha=0.3, linewidth=0)
            if row["label"] not in labels_present:
                labels_present.append(row["label"])
        handles = [plt.Rectangle((0, 0), 1, 1, color=EVENT_COLORS.get(lbl, "#cccccc"), alpha=0.5) for lbl in labels_present]
        ax.legend(handles, labels_present, loc="upper right", fontsize=7, ncol=2)

    ax.set_xlabel("time (s)")
    ax.set_ylabel("speed (px/s)")
    ax.set_title("Recording timeline (shaded by Stage 3 event type)")
    fig.tight_layout()
    return fig_to_data_uri(fig)


def render_episode_chart(kinematics_df: pd.DataFrame, episode: dict) -> str:
    start_s, end_s = episode["start_s"], episode["end_s"]
    pad = max((end_s - start_s) * 0.15, 0.1)
    mask = (
        (kinematics_df["time_s"] >= start_s - pad)
        & (kinematics_df["time_s"] <= end_s + pad)
        & kinematics_df["included"]
    )
    window = kinematics_df.loc[mask]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 4), sharex=True)
    ax1.plot(window["time_s"], window["x_px"], color="#1f77b4")
    ax1.axvspan(start_s, end_s, color=EPISODE_HIGHLIGHT_COLOR, alpha=0.12)
    ax1.set_ylabel("x position (px)")

    ax2.plot(window["time_s"], window["speed_px_s"], color="#333333")
    ax2.axvspan(start_s, end_s, color=EPISODE_HIGHLIGHT_COLOR, alpha=0.12)
    ax2.set_ylabel("speed (px/s)")
    ax2.set_xlabel("time (s)")

    fig.suptitle(f"Episode {episode['episode_index']}  ({start_s:.2f}s - {end_s:.2f}s)")
    fig.tight_layout()
    return fig_to_data_uri(fig)
