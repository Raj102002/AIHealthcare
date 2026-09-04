"""Stage 6 orchestrator: reads Stages 1-5's outputs from a shared
--output-dir (does not re-run them -- Stage 1 especially is expensive)
and writes one self-contained report.html.
"""
from pathlib import Path
from typing import Optional

from .data_loading import load_report_inputs
from .render import render_report


class ReportPipeline:
    def generate(self, output_dir: str, report_path: Optional[str] = None) -> str:
        inputs = load_report_inputs(output_dir)
        html = render_report(inputs)

        path = Path(report_path) if report_path else Path(output_dir) / "report.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")
        return str(path)
