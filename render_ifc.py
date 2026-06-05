#!/usr/bin/env python3
"""
render_ifc.py — IFC 형상 헤드리스 렌더 (시각 QA)

재생성한 IFC(regen.ifc 등)의 요소 형상을 PNG로 그린다. Revit/뷰어 GUI 없이
파이프라인 안에서 시각 확인하는 단계. (실제 .ifc는 표준이라 BIMvision/Revit에서도 그대로 열림)

사용:
    python render_ifc.py <input.ifc> <output.png> [--title "..."]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.geom
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

# 블루프린트 팔레트 (부품별 색·투명도 — 카가 승강로 안에 보이도록)
STYLE = {
    "shaft": ("#4ea1d3", 0.10), "car": ("#e8833a", 0.55),
    "door": ("#2ec4b6", 0.80), "_default": ("#9aa6b2", 0.45),
}


def style_for(name: str) -> tuple[str, float]:
    low = (name or "").lower()
    if "shaft" in low or "hoist" in low:
        return STYLE["shaft"]
    if "car" in low:
        return STYLE["car"]
    if "door" in low:
        return STYLE["door"]
    return STYLE["_default"]


def render(ifc_path: Path, out_png: Path, title: str | None) -> int:
    model = ifcopenshell.open(str(ifc_path))
    settings = ifcopenshell.geom.settings()

    fig = plt.figure(figsize=(9, 8), facecolor="#0d1b2a")
    ax = fig.add_subplot(111, projection="3d")
    ax.set_facecolor("#0d1b2a")

    lo = np.array([np.inf] * 3)
    hi = np.array([-np.inf] * 3)
    drawn = 0
    for el in model.by_type("IfcElement"):
        if not el.Representation:
            continue
        shape = ifcopenshell.geom.create_shape(settings, el)
        verts = np.array(shape.geometry.verts).reshape(-1, 3)
        faces = np.array(shape.geometry.faces).reshape(-1, 3)
        if len(verts) == 0:
            continue
        color, alpha = style_for(el.Name)
        ax.add_collection3d(Poly3DCollection(
            verts[faces], facecolor=color, edgecolor=color, linewidths=0.6, alpha=alpha))
        lo = np.minimum(lo, verts.min(axis=0))
        hi = np.maximum(hi, verts.max(axis=0))
        drawn += 1

    if drawn == 0:
        print("[오류] 렌더할 형상 없음", file=sys.stderr)
        return 1

    span = hi - lo
    ax.set_xlim(lo[0], hi[0]); ax.set_ylim(lo[1], hi[1]); ax.set_zlim(lo[2], hi[2])
    ax.set_box_aspect(tuple(span))
    ax.view_init(elev=22, azim=-58)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.label.set_color("#9aa6b2"); axis.pane.set_alpha(0.0)
    ax.tick_params(colors="#5a6b7a", labelsize=7)
    ax.set_xlabel("X (m)"); ax.set_ylabel("Y (m)"); ax.set_zlabel("Z (m)")
    ax.grid(True, color="#22344a")
    ax.set_title(title or f"{ifc_path.name} — {drawn} elements", color="#e0e6ed", pad=14)

    handles = [plt.Line2D([0], [0], marker="s", linestyle="", markersize=10,
                          markerfacecolor=STYLE[k][0], markeredgecolor="none", label=k)
               for k in ("shaft", "car", "door")]
    leg = ax.legend(handles=handles, loc="upper left", facecolor="#0d1b2a",
                    edgecolor="#22344a", labelcolor="#e0e6ed", fontsize=8)
    for t in leg.get_texts():
        t.set_color("#e0e6ed")

    fig.savefig(str(out_png), dpi=140, facecolor="#0d1b2a", bbox_inches="tight")
    plt.close(fig)
    print(f"[렌더 완료] {out_png}  (요소 {drawn}개)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IFC 형상 헤드리스 렌더 → PNG")
    parser.add_argument("ifc")
    parser.add_argument("out")
    parser.add_argument("--title", default=None)
    args = parser.parse_args(argv)
    if not Path(args.ifc).exists():
        print(f"[오류] IFC 없음: {args.ifc}", file=sys.stderr)
        return 1
    return render(Path(args.ifc), Path(args.out), args.title)


if __name__ == "__main__":
    raise SystemExit(main())
