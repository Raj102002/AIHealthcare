"""Overlay drawing for QA video export."""
import cv2
import numpy as np

from .types import PupilDetection

_METHOD_COLORS = {
    "mediapipe": (60, 200, 60),
    "classical": (60, 160, 255),
    "cnn": (200, 60, 200),
    "predicted": (0, 165, 255),
    "none": (0, 0, 255),
}


def draw_overlay(frame: np.ndarray, det: PupilDetection) -> np.ndarray:
    out = frame.copy()
    color = _METHOD_COLORS.get(det.method, (200, 200, 200))
    if det.found and det.center_x is not None:
        cx, cy = int(round(det.center_x)), int(round(det.center_y))
        cv2.drawMarker(out, (cx, cy), color, markerType=cv2.MARKER_CROSS, markerSize=12, thickness=2)
        if det.axis_major and det.axis_minor:
            axes = (max(int(det.axis_major / 2), 1), max(int(det.axis_minor / 2), 1))
            cv2.ellipse(out, (cx, cy), axes, det.angle_deg or 0.0, 0, 360, color, 2)
        label = f"{det.method} conf={det.confidence:.2f}"
    else:
        label = "no detection"
    cv2.putText(out, label, (10, out.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    cv2.putText(
        out, f"t={det.time_s:.2f}s", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA
    )
    return out


_BLACK = (20, 20, 20)
_WHITE = (255, 255, 255)
_ORANGE = (52, 104, 235)  # BGR for #eb6834 -- detected point


def draw_ring(img: np.ndarray, pt, color, r: int = 11, thickness: int = 2) -> None:
    """Ground-truth marker convention shared with scripts/build_local_report.py."""
    cv2.circle(img, (int(round(pt[0])), int(round(pt[1]))), r, _BLACK, thickness + 2, cv2.LINE_AA)
    cv2.circle(img, (int(round(pt[0])), int(round(pt[1]))), r, color, thickness, cv2.LINE_AA)


def draw_cross(img: np.ndarray, pt, color, size: int = 9, thickness: int = 2) -> None:
    """Detected-point marker convention shared with scripts/build_local_report.py."""
    x, y = int(round(pt[0])), int(round(pt[1]))
    cv2.line(img, (x - size, y), (x + size, y), _BLACK, thickness + 2, cv2.LINE_AA)
    cv2.line(img, (x, y - size), (x, y + size), _BLACK, thickness + 2, cv2.LINE_AA)
    cv2.line(img, (x - size, y), (x + size, y), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x, y - size), (x, y + size), color, thickness, cv2.LINE_AA)


def save_diagnostic_still(
    gray: np.ndarray,
    out_path: str,
    gt_xy=None,
    det_xy=None,
    label: str = "",
    scale: int = 2,
) -> None:
    """Save one frame with ground-truth (white ring) and/or detected (orange
    cross) markers -- used by scripts/analyze_lpw_failures.py for the Task 1
    failure-mode diagnostic image dumps. Not used by the live pipeline.
    """
    color_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR) if gray.ndim == 2 else gray.copy()
    big = cv2.resize(color_img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if gt_xy is not None:
        draw_ring(big, (gt_xy[0] * scale, gt_xy[1] * scale), _WHITE)
    if det_xy is not None:
        draw_cross(big, (det_xy[0] * scale, det_xy[1] * scale), _ORANGE)
    if label:
        cv2.putText(big, label, (10, big.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, _WHITE, 1, cv2.LINE_AA)
    cv2.imwrite(str(out_path), big)


class AnnotatedVideoWriter:
    def __init__(self, path: str, fps: float, frame_size: tuple):
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self._writer = cv2.VideoWriter(str(path), fourcc, fps, frame_size)

    def write(self, frame: np.ndarray) -> None:
        self._writer.write(frame)

    def close(self) -> None:
        self._writer.release()
