#!/usr/bin/env python3
"""
extract_ifc.py — Phase 1 추출기 (IFC)

IFC 도면 한 개를 읽어 파라메트릭 DB(SQLite)에 적재한다.
Step 0(인입)·2(부품 검출)·3(치수 추출)·4(의미 매핑)·5(단위 정규화 + EN81 검증)·7(적재).
B-rep(3D 형상)은 저장하지 않고 geometry_ref 로 가리킨다.

사용:
    python extract_ifc.py <input.ifc> <output.db>
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sqlite3
import sys
from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as ifc_element
import ifcopenshell.util.unit as ifc_unit

import paramdb

# IFC 클래스 → component_type (결정론 1차)
IFC_CLASS_MAP: dict[str, str] = {
    "IfcTransportElement": "car",
    "IfcDoor": "door",
    "IfcRailing": "guide_rail",
}
# 이름 힌트 (모호 클래스 보조)
NAME_HINTS: list[tuple[str, str]] = [
    ("shaft", "shaft"), ("hoistway", "shaft"), ("승강로", "shaft"),
    ("rail", "guide_rail"), ("가이드", "guide_rail"),
    ("counterweight", "counterweight"), ("균형추", "counterweight"),
    ("buffer", "buffer"), ("완충", "buffer"),
    ("car", "car"), ("cabin", "car"), ("카", "car"),
    ("door", "door"), ("도어", "door"),
]


# component_type → 형상 bbox 축에서 뽑을 치수 (축: 0=X폭 1=Y깊이 2=Z높이)
CTYPE_GEOM_DIMS: dict[str, list[tuple[str, int]]] = {
    "car": [("car_width", 0), ("car_depth", 1), ("car_height", 2)],
    "shaft": [("shaft_width", 0), ("shaft_depth", 1)],
    "door": [("door_width", 0), ("door_height", 2)],
}


def element_bbox_mm(settings, element, scale_to_mm: float | None) -> tuple[float, float, float] | None:
    """요소 형상의 월드 bbox 치수(mm). 축정렬 가정(회전 요소는 근사)."""
    try:
        shape = ifcopenshell.geom.create_shape(settings, element)
    except Exception:  # noqa: BLE001
        return None
    verts = shape.geometry.verts
    if not verts:
        return None
    arr = np.array(verts).reshape(-1, 3)
    span = arr.max(axis=0) - arr.min(axis=0)
    s = scale_to_mm if scale_to_mm else 1.0
    return (float(span[0] * s), float(span[1] * s), float(span[2] * s))


def map_component_type(ifc_class: str, name: str | None) -> tuple[str, float]:
    if ifc_class in IFC_CLASS_MAP:
        return IFC_CLASS_MAP[ifc_class], 0.95
    lowered = (name or "").lower()
    for token, ctype in NAME_HINTS:
        if token in lowered:
            return ctype, 0.6
    return "unknown", 0.3


def length_scale_to_mm(model) -> float | None:
    """프로젝트 길이 단위 → mm 환산 계수. 단위 정보 없으면 None."""
    try:
        scale_to_m = ifc_unit.calculate_unit_scale(model)  # 모델 길이단위 → meter
    except Exception:
        return None
    if not scale_to_m:
        return None
    return scale_to_m * 1000.0  # meter → mm


def extract(ifc_path: Path, db_path: Path) -> dict[str, int]:
    if not ifc_path.exists():
        raise FileNotFoundError(f"IFC 파일 없음: {ifc_path}")
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"IFC 열기 실패: {exc}") from exc

    scale_to_mm = length_scale_to_mm(model)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    paramdb.init_db(conn)
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO source_drawing (source, format, lod, file_hash, raw_ref, ingested_at) "
        "VALUES (?,?,?,?,?,?)",
        ("file", "IFC", None, paramdb.file_hash(ifc_path), str(ifc_path),
         dt.datetime.now().isoformat(timespec="seconds")),
    )
    drawing_id = cur.lastrowid

    counts = {"component": 0, "param_total": 0, "param_mapped": 0,
              "geometry_ref": 0, "review": 0, "geom_dims": 0}

    geom_settings = ifcopenshell.geom.settings()

    for element in model.by_type("IfcElement"):
        ifc_class = element.is_a()
        name = getattr(element, "Name", None)
        guid = getattr(element, "GlobalId", None)
        ctype, ctype_conf = map_component_type(ifc_class, name)

        cur.execute(
            "INSERT INTO component (drawing_id, component_type, ifc_class, ifc_guid, name, confidence) "
            "VALUES (?,?,?,?,?,?)",
            (drawing_id, ctype, ifc_class, guid, name, ctype_conf),
        )
        component_id = cur.lastrowid
        counts["component"] += 1

        if ctype_conf < paramdb.CONFIDENCE_THRESHOLD:
            cur.execute(
                "INSERT INTO review_queue (item_type, item_ref, reason, confidence) VALUES (?,?,?,?)",
                ("component_type", component_id, f"{ifc_class} 타입 추정 모호", ctype_conf),
            )
            counts["review"] += 1

        cur.execute(
            "INSERT INTO geometry_ref (component_id, kind, uri, locator) VALUES (?,?,?,?)",
            (component_id, "ifc", str(ifc_path), guid),
        )
        counts["geometry_ref"] += 1

        set_canon: set[str] = set()
        for pset_name, props in ifc_element.get_psets(element).items():
            for raw_name, raw_value in props.items():
                if raw_name == "id":
                    continue
                value = paramdb.to_float(raw_value)
                if value is None:
                    continue
                canonical = paramdb.map_canonical(raw_name)
                norm_value, unit = paramdb.normalize_value(canonical, value, scale_to_mm)
                p_conf = 0.95 if canonical else 0.4
                cur.execute(
                    "INSERT INTO parameter "
                    "(component_id, canonical_name, raw_name, value, unit, pset_name, confidence) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (component_id, canonical, raw_name, norm_value, unit, pset_name, p_conf),
                )
                param_id = cur.lastrowid
                counts["param_total"] += 1
                if canonical:
                    counts["param_mapped"] += 1
                    set_canon.add(canonical)
                else:
                    cur.execute(
                        "INSERT INTO review_queue (item_type, item_ref, reason, confidence) "
                        "VALUES (?,?,?,?)",
                        ("parameter_mapping", param_id, f"'{raw_name}' 표준 미매핑", p_conf),
                    )
                    counts["review"] += 1

        # 형상 기반 치수 추출 — Pset에 없으면 bbox에서 보충 (실제 IFC 대비; 표준은 형상 우선)
        geom_dims = CTYPE_GEOM_DIMS.get(ctype)
        if geom_dims and element.Representation and any(cn not in set_canon for cn, _ in geom_dims):
            bbox = element_bbox_mm(geom_settings, element, scale_to_mm)
            if bbox:
                for canonical, axis in geom_dims:
                    if canonical in set_canon:
                        continue
                    cur.execute(
                        "INSERT INTO parameter "
                        "(component_id, canonical_name, raw_name, value, unit, pset_name, confidence) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (component_id, canonical, f"bbox_{'xyz'[axis]}",
                         round(bbox[axis], 1), "mm", "GEOMETRY", 0.7),
                    )
                    counts["param_total"] += 1
                    counts["param_mapped"] += 1
                    counts["geom_dims"] += 1
                    set_canon.add(canonical)

    conn.commit()
    issues = paramdb.validate_en81(conn, drawing_id)
    counts["validation_issue"] = len(issues)
    counts["_issues"] = issues
    counts["_scale_known"] = scale_to_mm is not None
    conn.close()
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IFC → 파라메트릭 DB 추출 (Phase 1)")
    parser.add_argument("ifc", help="입력 IFC 파일 경로")
    parser.add_argument("db", help="출력 SQLite DB 경로")
    args = parser.parse_args(argv)

    try:
        c = extract(Path(args.ifc), Path(args.db))
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"[오류] {exc}", file=sys.stderr)
        return 1

    total = c["param_total"]
    coverage = (c["param_mapped"] / total * 100.0) if total else 0.0
    print("[적재 완료]", os.path.basename(args.db))
    print(f"  단위 정규화   : {'적용(→mm)' if c['_scale_known'] else '단위 미상 — 원값 유지'}")
    print(f"  component     : {c['component']}")
    print(f"  parameter     : {total}  (표준 매핑 {c['param_mapped']} / 커버리지 {coverage:.0f}%)")
    print(f"  geometry_ref  : {c['geometry_ref']}")
    print(f"  형상기반 치수 : {c['geom_dims']}  (Pset 없을 때 bbox에서 보충)")
    print(f"  review_queue  : {c['review']}")
    print(f"  EN81 위반     : {c['validation_issue']}")
    for rule, sev, detail in c["_issues"]:
        print(f"    - [{sev}] {rule}: {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
