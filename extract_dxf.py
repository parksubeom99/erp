#!/usr/bin/env python3
"""
extract_dxf.py - Phase 1 추출기 (DXF)

DXF 도면 한 개를 읽어 파라메트릭 DB(SQLite)에 적재한다.
Step 0(인입)-2(부품 검출)-3(치수 추출)-4(의미 매핑)-5(단위 정규화 + EN81 검증)-7(적재).
extract_ifc.py 와 동형: INSERT 엔티티 = component, 그에 붙은 ATTRIB(tag=value) = parameter
(IFC 의 element + Pset 속성 구조의 직역). 형상은 저장하지 않고 geometry_ref(kind=dwg)로 가리킨다.

사용:
    python extract_dxf.py <input.dxf> <output.db>
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sqlite3
import sys
from pathlib import Path

import ezdxf

import paramdb
from classifier import RuleBasedClassifier

# 블록 이름 -> component_type (결정론 1차, IFC 의 IFC_CLASS_MAP 대응)
BLOCK_TYPE_MAP: dict[str, str] = {
    "CAR": "car", "ELEVATOR_CAR": "car", "CABIN": "car",
    "DOOR": "door", "LANDING_DOOR": "door",
    "SHAFT": "shaft", "HOISTWAY": "shaft",
    "GUIDE_RAIL": "guide_rail",
    "COUNTERWEIGHT": "counterweight",
    "BUFFER": "buffer",
}
# 레이어 이름 힌트 (블록명 미매칭 시 보조, IFC 의 NAME_HINTS 대응)
LAYER_HINTS: list[tuple[str, str]] = [
    ("shaft", "shaft"), ("hoist", "shaft"), ("승강로", "shaft"),
    ("rail", "guide_rail"), ("가이드", "guide_rail"),
    ("counterweight", "counterweight"), ("균형추", "counterweight"),
    ("buffer", "buffer"), ("완충", "buffer"),
    ("car", "car"), ("cabin", "car"), ("카", "car"),
    ("door", "door"), ("도어", "door"),
]

# $INSUNITS -> mm 환산 계수. 0(unitless)은 미상 -> None.
INSUNITS_TO_MM: dict[int, float] = {
    1: 25.4,    # inch
    2: 304.8,   # foot
    4: 1.0,     # mm
    5: 10.0,    # cm
    6: 1000.0,  # m
}


def insunits_to_mm(insunits: int | None) -> float | None:
    """DXF $INSUNITS 헤더값 -> mm 환산 계수. 미상이면 None."""
    return INSUNITS_TO_MM.get(int(insunits or 0))


def map_component_type(block_name: str, layer: str | None) -> tuple[str, float]:
    key = (block_name or "").upper()
    if key in BLOCK_TYPE_MAP:
        return BLOCK_TYPE_MAP[key], 0.95
    lowered = (layer or "").lower()
    for token, ctype in LAYER_HINTS:
        if token in lowered:
            return ctype, 0.6
    return "unknown", 0.3


def extract(dxf_path: Path, db_path: Path) -> dict[str, int]:
    if not dxf_path.exists():
        raise FileNotFoundError(f"DXF 파일 없음: {dxf_path}")
    try:
        doc = ezdxf.readfile(str(dxf_path))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"DXF 열기 실패: {exc}") from exc

    scale_to_mm = insunits_to_mm(doc.units)
    msp = doc.modelspace()
    inserts = list(msp.query("INSERT"))

    # 도면 단위 분류 (seam 재사용): 레이어 이름 규칙 -> drawing_type
    layer_names = sorted({ins.dxf.layer for ins in inserts})
    drawing_type = RuleBasedClassifier().classify(layer_names)["drawing_type"]

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    paramdb.init_db(conn)
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO source_drawing "
        "(source, format, lod, file_hash, raw_ref, drawing_type, ingested_at) "
        "VALUES (?,?,?,?,?,?,?)",
        ("file", "DXF", None, paramdb.file_hash(dxf_path), str(dxf_path),
         drawing_type, dt.datetime.now().isoformat(timespec="seconds")),
    )
    drawing_id = cur.lastrowid

    counts = {"component": 0, "param_total": 0, "param_mapped": 0,
              "geometry_ref": 0, "review": 0}

    for ins in inserts:
        block_name = ins.dxf.name
        layer = ins.dxf.layer
        handle = ins.dxf.handle
        ctype, ctype_conf = map_component_type(block_name, layer)

        cur.execute(
            "INSERT INTO component "
            "(drawing_id, component_type, ifc_class, ifc_guid, name, confidence) "
            "VALUES (?,?,?,?,?,?)",
            (drawing_id, ctype, block_name, handle, block_name, ctype_conf),
        )
        component_id = cur.lastrowid
        counts["component"] += 1

        if ctype_conf < paramdb.CONFIDENCE_THRESHOLD:
            cur.execute(
                "INSERT INTO review_queue (item_type, item_ref, reason, confidence) "
                "VALUES (?,?,?,?)",
                ("component_type", component_id,
                 f"{block_name} 블록 타입 추정 모호", ctype_conf),
            )
            counts["review"] += 1

        cur.execute(
            "INSERT INTO geometry_ref (component_id, kind, uri, locator) VALUES (?,?,?,?)",
            (component_id, "dwg", str(dxf_path), handle),
        )
        counts["geometry_ref"] += 1

        for att in ins.attribs:
            raw_name = att.dxf.tag
            value = paramdb.to_float(att.dxf.text)
            if value is None:
                continue
            canonical = paramdb.map_canonical(raw_name)
            norm_value, unit = paramdb.normalize_value(canonical, value, scale_to_mm)
            p_conf = 0.95 if canonical else 0.4
            cur.execute(
                "INSERT INTO parameter "
                "(component_id, canonical_name, raw_name, value, unit, pset_name, confidence) "
                "VALUES (?,?,?,?,?,?,?)",
                (component_id, canonical, raw_name, norm_value, unit, block_name, p_conf),
            )
            param_id = cur.lastrowid
            counts["param_total"] += 1
            if canonical:
                counts["param_mapped"] += 1
            else:
                cur.execute(
                    "INSERT INTO review_queue (item_type, item_ref, reason, confidence) "
                    "VALUES (?,?,?,?)",
                    ("parameter_mapping", param_id, f"'{raw_name}' 표준 미매핑", p_conf),
                )
                counts["review"] += 1

    conn.commit()
    issues = paramdb.validate_en81(conn, drawing_id)
    counts["validation_issue"] = len(issues)
    counts["_issues"] = issues
    counts["_scale_known"] = scale_to_mm is not None
    conn.close()
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DXF -> 파라메트릭 DB 추출 (Phase 1)")
    parser.add_argument("dxf", help="입력 DXF 파일 경로")
    parser.add_argument("db", help="출력 SQLite DB 경로")
    args = parser.parse_args(argv)

    try:
        c = extract(Path(args.dxf), Path(args.db))
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"[오류] {exc}", file=sys.stderr)
        return 1

    total = c["param_total"]
    coverage = (c["param_mapped"] / total * 100.0) if total else 0.0
    print("[적재 완료]", os.path.basename(args.db))
    print(f"  단위 정규화   : {'적용(->mm)' if c['_scale_known'] else '단위 미상 - 원값 유지'}")
    print(f"  component     : {c['component']}")
    print(f"  parameter     : {total}  (표준 매핑 {c['param_mapped']} / 커버리지 {coverage:.0f}%)")
    print(f"  geometry_ref  : {c['geometry_ref']}")
    print(f"  review_queue  : {c['review']}")
    print(f"  EN81 위반     : {c['validation_issue']}")
    for rule, sev, detail in c["_issues"]:
        print(f"    - [{sev}] {rule}: {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
