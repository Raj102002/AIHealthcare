"""Plain f-string HTML generation for the Stage 6 report (matching
scripts/build_local_report.py's existing convention -- no templating
engine anywhere in this codebase).

Hard rule enforced throughout this module: the ONLY free-form
explanatory sentence next to any Stage 5 finding is that finding's own
`caveat` string, rendered verbatim. This module may format, label, and
tabulate Stage 1-5 fields, and may turn a `pattern` snake_case name into
a readable heading, but must never write new interpretive prose (e.g.
"this may indicate a central cause"). The disclaimer/modality_limitation
text is imported directly from disorder_screening.pipeline and
interpolated unmodified -- never rewritten or shortened here.
"""
import html as html_lib
from typing import Dict, List, Optional

import pandas as pd

from ..disorder_screening.pipeline import DISCLAIMER, MODALITY_LIMITATION
from . import charts
from .data_loading import ReportInputs

# Evidence key -> (threshold key, comparison description) for patterns
# where a direct 1:1 mapping exists, so a measured value can be shown
# alongside the actual bar it was compared against (not just its
# default). central_gaze_evoked_pattern's separation check has two
# possible code paths (effect-size vs. absolute-pixel fallback) and the
# evidence dict doesn't record which one gated a given case, so both
# reference thresholds are shown there without claiming which applied --
# an honest limitation, not a fabrication.
_THRESHOLD_EVIDENCE_MAP: Dict[str, List[tuple]] = {
    "periodic_alternating_nystagmus_pattern": [
        ("alternation_count", "min_alternations", "required >="),
        ("interval_cv", "max_episode_period_cv", "required <="),
        ("min_inter_episode_gap_s", "min_null_gap_s", "required >="),
    ],
    "central_gaze_evoked_pattern": [
        ("separation_px", "min_separation_px", "compared against (absolute-px fallback path)"),
    ],
}

CSS = """
body { font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; line-height: 1.5; }
h1 { font-size: 22px; }
h2 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 36px; }
h3 { font-size: 15px; margin-bottom: 4px; }
.disclaimer { background: #fff3cd; border: 2px solid #e0a800; border-radius: 6px; padding: 14px 18px; margin-bottom: 8px; }
.disclaimer p { margin: 6px 0; font-size: 14px; }
.modality { background: #f0f0f0; border: 1px solid #bbb; border-radius: 6px; padding: 12px 18px; margin-bottom: 24px; font-size: 14px; }
.warning { background: #fdecea; border: 1px solid #d93025; border-radius: 6px; padding: 10px 14px; margin: 10px 0; font-size: 13px; }
.finding { border: 1px solid #ccc; border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
.finding .caveat { font-style: italic; color: #444; margin-top: 8px; }
.episode-block { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; margin: 10px 0; }
.cited-by { font-size: 12px; color: #666; }
table.evidence { border-collapse: collapse; font-size: 13px; margin: 8px 0; }
table.evidence td, table.evidence th { border: 1px solid #ccc; padding: 4px 10px; text-align: left; }
.not-assessable td { padding: 3px 10px; }
.not-available { color: #888; font-style: italic; }
img.chart { max-width: 100%; }
"""


def _esc(s) -> str:
    return html_lib.escape(str(s))


def _readable_pattern_name(pattern: str) -> str:
    words = pattern.replace("_", " ").split(" ")
    return " ".join(w.upper() if w in ("pan",) else w.capitalize() for w in words)


def _format_value(v) -> str:
    if isinstance(v, float):
        return f"{v:.4g}"
    if isinstance(v, list):
        return ", ".join(_format_value(x) for x in v)
    return _esc(v)


def _episode_lookup(characterization_summary: Optional[dict]) -> Dict[int, dict]:
    if characterization_summary is None:
        return {}
    return {e["episode_index"]: e for e in characterization_summary.get("episodes", [])}


def _episode_ref(idx: int, episode_lookup: Dict[int, dict]) -> str:
    ep = episode_lookup.get(idx)
    if ep is None:
        return f"episode {idx} (detail unavailable)"
    return (
        f"episode {idx} (direction: {_esc(ep['dominant_fast_phase_direction'])}, "
        f"shape: {_esc(ep['dominant_slow_phase_shape'])})"
    )


def _render_evidence_table(pattern: str, evidence: dict, thresholds: dict) -> str:
    threshold_rows = {ek: (tk, desc) for ek, tk, desc in _THRESHOLD_EVIDENCE_MAP.get(pattern, [])}
    rows = []
    for key, value in evidence.items():
        row = f"<tr><td>{_esc(key)}</td><td>{_format_value(value)}</td>"
        if key in threshold_rows:
            tk, desc = threshold_rows[key]
            threshold_val = thresholds.get(tk, "n/a")
            row += f"<td>{_esc(desc)} {_format_value(threshold_val)} (<code>{_esc(tk)}</code>)</td>"
        else:
            row += "<td></td>"
        row += "</tr>"
        rows.append(row)
    return (
        '<table class="evidence"><tr><th>evidence</th><th>value</th><th>threshold used</th></tr>'
        + "".join(rows)
        + "</table>"
    )


def _render_finding(finding: dict, thresholds: dict, episode_lookup: Dict[int, dict]) -> str:
    refs = "; ".join(_episode_ref(i, episode_lookup) for i in finding.get("episode_indices", []))
    evidence_table = _render_evidence_table(finding["pattern"], finding.get("supporting_evidence", {}), thresholds)
    # finding["caveat"] is Stage 5's own hardcoded per-pattern constant
    # (e.g. vestibular_pattern.CAVEAT), not user input -- interpolated
    # raw, like DISCLAIMER/MODALITY_LIMITATION above, so it stays
    # byte-for-byte verbatim rather than HTML-entity-escaped.
    return f"""
<div class="finding">
  <h3>{_esc(_readable_pattern_name(finding['pattern']))}</h3>
  <div>Episodes: {refs or '(none)'}</div>
  {evidence_table}
  <div class="caveat">{finding['caveat']}</div>
</div>"""


def _render_episode_block(
    episode: dict, kinematics_df: Optional[pd.DataFrame], cited_by: List[str]
) -> str:
    chart_html = ""
    if kinematics_df is not None:
        try:
            uri = charts.render_episode_chart(kinematics_df, episode)
            chart_html = f'<img class="chart" src="{uri}" alt="episode {episode["episode_index"]} chart">'
        except Exception:
            chart_html = '<div class="not-available">chart unavailable</div>'

    cited_html = (
        f'<div class="cited-by">Cited by: {_esc(", ".join(_readable_pattern_name(p) for p in cited_by))}</div>'
        if cited_by
        else ""
    )
    # Raw alexanders_law_correlation is UNSIGNED w.r.t. direction (see
    # vestibular_pattern.py's documented sign-correction) -- never shown
    # bare, always labeled, so this can't be misread as "alignment".
    rho = episode.get("alexanders_law_correlation")
    rho_html = (
        f"<div>Raw Spearman &rho; (unsigned w.r.t. direction -- see the linked finding's evidence "
        f"for the direction-corrected interpretation): {_format_value(rho)}</div>"
        if rho is not None
        else ""
    )

    return f"""
<div class="episode-block">
  <h3>Episode {episode['episode_index']} &mdash; {episode['start_s']:.2f}s to {episode['end_s']:.2f}s</h3>
  <div>Direction: {_esc(episode['dominant_fast_phase_direction'])} &middot;
       Shape: {_esc(episode['dominant_slow_phase_shape'])} ({'homogeneous' if episode['shape_homogeneous'] else 'mixed shapes'}) &middot;
       Beats: {episode['beat_count']}</div>
  {rho_html}
  {cited_html}
  {chart_html}
</div>"""


def _render_overview(inputs: ReportInputs) -> str:
    parts = ["<h2>Recording overview</h2>"]
    if inputs.trajectory is not None:
        found_frac = float(inputs.trajectory["found"].mean())
        methods = inputs.trajectory["method"].value_counts().to_dict()
        parts.append(
            f"<p>Stage 1: {len(inputs.trajectory)} frames, {found_frac:.0%} pupil-detection rate. "
            f"Methods used: {_esc(methods)}.</p>"
        )
    else:
        parts.append('<p class="not-available">trajectory.csv not found -- Stage 1 summary unavailable.</p>')

    if inputs.kinematics is not None:
        included_frac = float(inputs.kinematics["included"].mean())
        parts.append(f"<p>Stage 2: {included_frac:.0%} of frames included in kinematic analysis.</p>")
    else:
        parts.append('<p class="not-available">kinematics.csv not found -- Stage 2 summary unavailable.</p>')

    if inputs.movement_events is not None and not inputs.movement_events.empty:
        totals = inputs.movement_events.groupby("label")["duration_s"].sum().sort_values(ascending=False)
        rows = "".join(f"<li>{_esc(label)}: {dur:.2f}s</li>" for label, dur in totals.items())
        parts.append(f"<p>Stage 3 time-in-event-type:</p><ul>{rows}</ul>")
    else:
        parts.append('<p class="not-available">movement_events.csv not found -- Stage 3 summary unavailable.</p>')

    return "\n".join(parts)


def render_report(inputs: ReportInputs) -> str:
    # DISCLAIMER/MODALITY_LIMITATION are trusted, hardcoded Python
    # constants (not user input) interpolated RAW, not through _esc() --
    # they must appear byte-for-byte verbatim (regression-tested against
    # exact string equality), and HTML-escaping would rewrite apostrophes
    # into entities and silently break that guarantee.
    disclaimer_html = f"""
<div class="disclaimer">
  <p><strong>{DISCLAIMER}</strong></p>
</div>
<div class="modality">
  <p>{MODALITY_LIMITATION}</p>
</div>"""

    warnings_html = "".join(f'<div class="warning">{_esc(w)}</div>' for w in inputs.warnings)

    overview_html = _render_overview(inputs)

    timeline_html = "<h2>Event timeline</h2>"
    if inputs.kinematics is not None:
        try:
            uri = charts.render_timeline_chart(inputs.kinematics, inputs.movement_events)
            timeline_html += f'<img class="chart" src="{uri}" alt="recording timeline">'
        except Exception:
            timeline_html += '<p class="not-available">timeline chart unavailable</p>'
    else:
        timeline_html += '<p class="not-available">kinematics.csv not found -- timeline chart unavailable.</p>'

    episode_lookup = _episode_lookup(inputs.characterization_summary)
    findings = inputs.screening_summary.get("patterns_detected", [])
    thresholds = inputs.screening_summary.get("thresholds", {})

    cited_by_map: Dict[int, List[str]] = {}
    for f in findings:
        for idx in f.get("episode_indices", []):
            cited_by_map.setdefault(idx, []).append(f["pattern"])

    episodes_html = "<h2>Episode detail</h2>"
    if episode_lookup:
        episodes_html += "".join(
            _render_episode_block(ep, inputs.kinematics, cited_by_map.get(idx, []))
            for idx, ep in sorted(episode_lookup.items())
        )
    else:
        episodes_html += '<p class="not-available">Stage 4 output not found -- per-episode detail unavailable.</p>'

    findings_html = "<h2>Screening findings</h2>"
    if findings:
        findings_html += "".join(_render_finding(f, thresholds, episode_lookup) for f in findings)
    else:
        findings_html += "<p>No patterns were detected in this recording.</p>"

    not_assessable = inputs.screening_summary.get("patterns_not_assessable", [])
    # e["reason"] is one of not_assessable.py's hardcoded catalog
    # strings, interpolated raw for the same verbatim reason as the
    # disclaimer/caveats above.
    not_assessable_html = (
        '<h2>Not assessable by this pipeline</h2><table class="not-assessable">'
        + "".join(f"<tr><td><strong>{_esc(e['pattern'])}</strong></td><td>{e['reason']}</td></tr>" for e in not_assessable)
        + "</table>"
    )

    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Vestibular AI Report</title>
<style>{CSS}</style></head><body>
<h1>Vestibular AI &mdash; Explainable Report</h1>
{disclaimer_html}
{warnings_html}
{overview_html}
{timeline_html}
{episodes_html}
{findings_html}
{not_assessable_html}
</body></html>"""
