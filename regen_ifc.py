#!/usr/bin/env python3
"""
regen_ifc.py — Phase 5: 3D 재생성 (전파 파라미터 → 형상이 든 IFC)

전파(propagate.py) 결과 파라미터로 카/승강로/도어를 *형상(geometry)이 든* IFC 요소로
재생성한다. 이 IFC는 render_ifc.py 로 그릴 수 있고(기존 make_sample_ifc 의 Pset-only IFC는
형상이 없어 못 그림), 생성 직후 bbox 역검증으로 형상 치수 == 입력 파라미터를 확인한다.

원칙:
  - 측정/전파 값(DB, mm)을 읽어 metre(SI)로 형상 생성 — re-extract 시 scale 일관.
  - 배치 오프셋은 ObjectPlacement 가 아니라 representation(IfcExtrudedAreaSolid.Position)에
    구워 넣는다 (render_ifc 가 로컬 verts 를 그대로 쓰므로 그래야 카가 승강로 안에 보임).
  - paramdb/extract_ifc 코어를 재사용(중복 정의 금지). 역검증은 extract_ifc.element_bbox_mm 재사용.

사용:
    python regen_ifc.py <in.db> <out.ifc> [--scenario {baseline|modified}] [--drawing 1]
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.guid
import ifcopenshell.geom
import ifcopenshell.api.root
import ifcopenshell.api.unit
import ifcopenshell.api.context

import extract_ifc

# 시각화 전용 상수 (검증/전파 파라미터 아님)
HEADROOM_MM = 700.0    # shaft_height = car_height + 헤드룸 (DB에 pit/overhead 없을 때)
DOOR_THICK_MM = 100.0  # 도어 두께(Y) — 얇은 판 표현
TOL_MM = 1.0           # 역검증 허용오차

# 부품별 (canonical 파라미터, bbox 축) — 역검증 대상. 축: 0=X폭 1=Y깊이 2=Z높이
VERIFY_DIMS: dict[str, list[tuple[str, int]]] = {
    "car":   [("car_width", 0), ("car_depth", 1), ("car_height", 2)],
    "shaft": [("shaft_width", 0), ("shaft_depth", 1)],   # 높이 제외(cosmetic)
    "door":  [("door_width", 0), ("door_height", 2)],    # 두께 Y 제외(cosmetic)
}
REQUIRED = {"car_width", "car_depth", "car_height",
            "shaft_width", "shaft_depth", "door_width", "door_height"}


def kind_of(name: str | None) -> str | None:
    """요소 이름 → 부품 종류 (render_ifc STYLE 규약과 동일)."""
    low = (name or "").lower()
    if "shaft" in low or "hoist" in low:
        return "shaft"
    if "car" in low:
        return "car"
    if "door" in low:
        return "door"
    return None


def read_params(conn: sqlite3.Connection, drawing_id: int,
                scenario: str) -> tuple[dict[str, float], str]:
    """시나리오 스냅샷(solved_parameter) 우선, 없으면 측정값(parameter) 폴백."""
    rows = conn.execute(
        "SELECT name, value FROM solved_parameter "
        "WHERE drawing_id=? AND scenario=? AND value IS NOT NULL",
        (drawing_id, scenario),
    ).fetchall()
    if rows:
        return {n: float(v) for n, v in rows}, f"solved_parameter[{scenario}]"

    rows = conn.execute(
        "SELECT p.canonical_name, p.value FROM parameter p "
        "JOIN component c ON c.id = p.component_id "
        "WHERE c.drawing_id=? AND p.canonical_name IS NOT NULL AND p.value IS NOT NULL",
        (drawing_id,),
    ).fetchall()
    vals: dict[str, float] = {}
    for name, value in rows:
        vals.setdefault(name, float(value))
    return vals, "parameter(measured)"


def _box(model, body, ifc_class: str, name: str,
         x0: float, y0: float, z0: float, w: float, d: float, h: float):
    """축정렬 박스 요소(단위 metre). 오프셋은 solid Position 에 구워 넣음."""
    el = model.create_entity(ifc_class, GlobalId=ifcopenshell.guid.new(), Name=name)
    profile = model.create_entity(
        "IfcRectangleProfileDef", ProfileType="AREA",
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0))),
        XDim=float(w), YDim=float(d))
    solid = model.create_entity(
        "IfcExtrudedAreaSolid", SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(float(x0 + w / 2), float(y0 + d / 2), float(z0)))),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=float(h))
    shape = model.create_entity(
        "IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
    el.Representation = model.create_entity("IfcProductDefinitionShape", Representations=[shape])
    el.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))))
    return el


def build_model(p: dict[str, float]):
    """파라미터(mm) → 형상 IFC(metre). 카는 승강로 중앙, 도어는 전면."""
    mm = 1000.0
    cw, cd, ch = p["car_width"] / mm, p["car_depth"] / mm, p["car_height"] / mm
    sw, sd = p["shaft_width"] / mm, p["shaft_depth"] / mm
    dw, dh = p["door_width"] / mm, p["door_height"] / mm
    # shaft_height: 표준식(pit+car+overhead) 가능하면 사용, 아니면 헤드룸(둘 다 cosmetic)
    if "pit_depth" in p and "overhead" in p:
        sh = (p["pit_depth"] + p["car_height"] + p["overhead"]) / mm
    else:
        sh = (p["car_height"] + HEADROOM_MM) / mm
    dt = DOOR_THICK_MM / mm

    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Regenerated Elevator")
    ifcopenshell.api.unit.assign_unit(
        model, units=[ifcopenshell.api.unit.add_si_unit(model, unit_type="LENGTHUNIT")])
    ctx = ifcopenshell.api.context.add_context(model, context_type="Model")
    body = ifcopenshell.api.context.add_context(
        model, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx)

    _box(model, body, "IfcBuildingElementProxy", "Hoistway Shaft", 0.0, 0.0, 0.0, sw, sd, sh)
    _box(model, body, "IfcTransportElement", "Elevator Car",
         (sw - cw) / 2, (sd - cd) / 2, 0.0, cw, cd, ch)
    _box(model, body, "IfcDoor", "Landing Door", (sw - dw) / 2, 0.0, 0.0, dw, dt, dh)
    return model


def reverse_verify(out_ifc: Path, p: dict[str, float]) -> list[tuple[str, str, float, float, bool]]:
    """생성 IFC 의 bbox 를 재측정해 입력 파라미터와 대조 (extract_ifc 재사용)."""
    model = ifcopenshell.open(str(out_ifc))
    scale = extract_ifc.length_scale_to_mm(model)
    settings = ifcopenshell.geom.settings()
    out: list[tuple[str, str, float, float, bool]] = []
    for el in model.by_type("IfcElement"):
        kind = kind_of(getattr(el, "Name", None))
        if not kind or not el.Representation:
            continue
        bbox = extract_ifc.element_bbox_mm(settings, el, scale)
        if bbox is None:
            out.append((kind, "(no shape)", 0.0, 0.0, False))
            continue
        for key, axis in VERIFY_DIMS[kind]:
            exp = round(p[key], 1)
            got = round(bbox[axis], 1)
            out.append((kind, key, exp, got, abs(got - exp) <= TOL_MM))
    return out


def regen(db_path: Path, out_ifc: Path, scenario: str, drawing_id: int) -> int:
    conn = sqlite3.connect(str(db_path))
    params, source = read_params(conn, drawing_id, scenario)
    conn.close()

    missing = REQUIRED - set(params)
    if missing:
        print(f"[오류] 필수 파라미터 누락({source}): {sorted(missing)}", file=sys.stderr)
        return 1

    model = build_model(params)
    model.write(str(out_ifc))
    print(f"[재생성] {out_ifc}  (소스: {source}, 시나리오: {scenario})")
    print(f"  car   {params['car_width']:.0f} x {params['car_depth']:.0f} x {params['car_height']:.0f}")
    print(f"  shaft {params['shaft_width']:.0f} x {params['shaft_depth']:.0f}  (height=cosmetic)")
    print(f"  door  {params['door_width']:.0f} x {params['door_height']:.0f}")

    results = reverse_verify(out_ifc, params)
    print("[역검증] 생성 형상 bbox == 입력 파라미터")
    ok_all = True
    for kind, key, exp, got, ok in results:
        mark = "OK " if ok else "FAIL"
        ok_all = ok_all and ok
        print(f"  [{mark}] {kind:<5} {key:<12} expect={exp:>9.1f}  got={got:>9.1f} mm")

    if not ok_all:
        print("[실패] 역검증 불일치 — 생성 형상이 파라미터와 다름", file=sys.stderr)
        return 1
    print("[검증 PASS] 형상 치수가 전파 파라미터와 일치")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="전파 파라미터 → 형상 IFC 재생성 + 역검증")
    parser.add_argument("db", help="입력 파라메트릭 DB")
    parser.add_argument("out", help="출력 IFC 경로")
    parser.add_argument("--scenario", choices=["baseline", "modified"], default="modified",
                        help="solved_parameter 시나리오 (기본 modified)")
    parser.add_argument("--drawing", type=int, default=1, help="대상 도면 id (기본 1)")
    args = parser.parse_args(argv)

    if not Path(args.db).exists():
        print(f"[오류] DB 없음: {args.db}", file=sys.stderr)
        return 1
    return regen(Path(args.db), Path(args.out), args.scenario, args.drawing)


if __name__ == "__main__":
    raise SystemExit(main())
