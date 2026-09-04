"""Minimal longitudinal HTML report: an SPV-vs-session-date chart plus a
pattern-presence-by-session table. Reuses Stage 5's
DISCLAIMER/MODALITY_LIMITATION verbatim (imported, not copied -- the
same treatment Stage 6 gives them) and Stage 6's fig_to_data_uri (base64
embedding) rather than duplicating either. Does NOT re-embed each
session's full report.html (would be multi-MB x N sessions) -- links out
by relative path instead.
"""
import html as html_lib
from typing import List, Optional

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from ..disorder_screening.pipeline import DISCLAIMER, MODALITY_LIMITATION
from ..explainable_reports.charts import fig_to_data_uri
from .types import LongitudinalTrend, PatternPresenceChange, SubjectHistory

CROSS_SESSION_CALIBRATION_CAVEAT = (
    "SPV is compared across recordings taken under potentially different calibration setups "
    "on different dates -- unlike every earlier stage, which only ever compares values within "
    "one recording under one fixed calibration. A trend here could reflect a genuine "
    "physiological change, or a change in camera setup/distance between sessions; this "
    "pipeline cannot distinguish the two."
)

CSS = """
body { font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; line-height: 1.5; }
h1 { font-size: 22px; }
h2 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 32px; }
.disclaimer { background: #fff3cd; border: 2px solid #e0a800; border-radius: 6px; padding: 14px 18px; margin-bottom: 8px; }
.modality { background: #f0f0f0; border: 1px solid #bbb; border-radius: 6px; padding: 12px 18px; margin-bottom: 24px; font-size: 14px; }
.caveat { background: #fdecea; border: 1px solid #d93025; border-radius: 6px; padding: 10px 14px; margin: 10px 0; font-size: 13px; }
table { border-collapse: collapse; font-size: 13px; margin: 8px 0; width: 100%; }
td, th { border: 1px solid #ccc; padding: 4px 10px; text-align: left; }
img.chart { max-width: 100%; }
.not-available { color: #888; font-style: italic; }
"""


def _esc(s) -> str:
    return html_lib.escape(str(s))


def _render_spv_chart(history: SubjectHistory) -> Optional[str]:
    dated = [(s.session_date, s.mean_spv_magnitude) for s in history.sessions if s.mean_spv_magnitude is not None]
    if not dated:
        return None
    dated.sort(key=lambda t: t[0])
    dates, values = zip(*dated)

    fig, ax = plt.subplots(figsize=(8, 3))
    ax.plot(dates, values, marker="o", color="#1f77b4")
    ax.set_xlabel("session date")
    ax.set_ylabel("mean |SPV|")
    ax.set_title("Slow-phase velocity magnitude across sessions")
    fig.autofmt_xdate()
    fig.tight_layout()
    return fig_to_data_uri(fig)


def _render_sessions_table(history: SubjectHistory) -> str:
    rows = []
    for s in sorted(history.sessions, key=lambda r: r.session_date):
        rows.append(
            f"<tr><td>{_esc(s.session_date)}</td><td>{_esc(s.waveform_classification)}</td>"
            f"<td>{_esc(s.mean_spv_magnitude)} {_esc(s.spv_unit or '')}</td>"
            f"<td>{_esc(s.n_jerk_episodes)}</td><td>{_esc(s.direction_consistency)}</td>"
            f"<td>{_esc(', '.join(s.patterns_detected) or '(none)')}</td>"
            f'<td><a href="{_esc(s.output_dir)}/report.html">session report</a></td></tr>'
        )
    return (
        "<table><tr><th>date</th><th>waveform</th><th>mean |SPV|</th><th>jerk episodes</th>"
        "<th>direction consistency</th><th>patterns detected</th><th></th></tr>"
        + "".join(rows)
        + "</table>"
    )


def _render_pattern_presence_table(pattern_changes: List[PatternPresenceChange]) -> str:
    if not pattern_changes:
        return "<p>No patterns have been detected in any ingested session.</p>"
    rows = []
    for pc in pattern_changes:
        note = ""
        if pc.newly_appeared_in:
            note = f"newly appeared in {_esc(pc.newly_appeared_in)}"
        elif pc.newly_resolved_in:
            note = f"resolved as of {_esc(pc.newly_resolved_in)}"
        rows.append(f"<tr><td>{_esc(pc.pattern)}</td><td>{_esc(', '.join(pc.sessions_present))}</td><td>{note}</td></tr>")
    return "<table><tr><th>pattern</th><th>sessions present</th><th>change</th></tr>" + "".join(rows) + "</table>"


def render_longitudinal_report(
    history: SubjectHistory, trend: LongitudinalTrend, pattern_changes: List[PatternPresenceChange]
) -> str:
    # DISCLAIMER/MODALITY_LIMITATION interpolated raw (not HTML-escaped),
    # same treatment as Stage 6's report -- they are trusted, hardcoded
    # Python constants, and escaping would rewrite apostrophes into
    # entities and break byte-for-byte verbatim presence.
    disclaimer_html = f"""
<div class="disclaimer"><p><strong>{DISCLAIMER}</strong></p></div>
<div class="modality"><p>{MODALITY_LIMITATION}</p></div>"""

    chart_uri = _render_spv_chart(history)
    chart_html = (
        f'<img class="chart" src="{chart_uri}" alt="SPV across sessions">'
        if chart_uri
        else '<p class="not-available">Not enough sessions with measured SPV to chart a trend.</p>'
    )

    trend_caveats_html = "".join(f'<div class="caveat">{_esc(c)}</div>' for c in trend.caveats)
    relative_change_html = (
        f" (relative change: {trend.relative_change:.2f})" if trend.relative_change is not None else ""
    )

    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Longitudinal Report</title>
<style>{CSS}</style></head><body>
<h1>Vestibular AI &mdash; Longitudinal Report</h1>
{disclaimer_html}
<h2>SPV trend ({len(history.sessions)} session(s) ingested)</h2>
<p>Trend: <strong>{_esc(trend.trend)}</strong>{relative_change_html} &mdash; based on
   {trend.n_sessions_used} session(s) with measured SPV.</p>
<div class="caveat">{CROSS_SESSION_CALIBRATION_CAVEAT}</div>
{trend_caveats_html}
{chart_html}
<h2>Sessions</h2>
{_render_sessions_table(history)}
<h2>Pattern presence across sessions</h2>
{_render_pattern_presence_table(pattern_changes)}
</body></html>"""
