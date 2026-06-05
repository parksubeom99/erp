#!/usr/bin/env python3
"""
make_sample_ifc.py — 테스트 픽스처 (미터 단위)

단위 정규화(m→mm)와 EN81 검증을 실증하기 위해 *미터 단위*로 IFC를 생성한다.
- 길이는 m (예: 1.1) → 추출기가 1100mm 로 환산해야 정상
- door_width=1.2m(1200mm)를 일부러 car_width=1.1m(1100mm)보다 크게 → 검증 위반 유도
- FireRating: 표준 미매핑 속성 → review_queue 유도

사용:
    python make_sample_ifc.py <output.ifc>
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.root
import ifcopenshell.api.pset
import ifcopenshell.api.unit


def build(out_path: Path) -> dict[str, int]:
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Sample Elevator Project")

    # 프로젝트 길이 단위 = METRE (정규화 테스트의 핵심)
    length_unit = ifcopenshell.api.unit.add_si_unit(model, unit_type="LENGTHUNIT")
    ifcopenshell.api.unit.assign_unit(model, units=[length_unit])

    specs = [
        ("IfcTransportElement", "Elevator Car", "Pset_ElevatorCarCommon",
         {"CarWidth": 1.1, "CarDepth": 1.4, "CarHeight": 2.2,
          "Capacity": 1000.0, "Speed": 1.0}),
        ("IfcDoor", "Landing Door", "Pset_DoorCommon",
         {"DoorWidth": 1.2, "DoorHeight": 2.1}),   # 1.2m > 카폭 1.1m → 위반 유도
        ("IfcBuildingElementProxy", "Hoistway Shaft", "Pset_ShaftCommon",
         {"ShaftWidth": 1.6, "ShaftDepth": 1.8, "FireRating": 120.0}),
    ]

    for ifc_class, name, pset_name, props in specs:
        product = ifcopenshell.api.root.create_entity(model, ifc_class=ifc_class, name=name)
        pset = ifcopenshell.api.pset.add_pset(model, product=product, name=pset_name)
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=props)

    model.write(str(out_path))
    return {"elements": len(specs)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="합성 엘리베이터 IFC 생성 (미터 단위, 테스트용)")
    parser.add_argument("out", help="출력 IFC 경로")
    args = parser.parse_args(argv)
    try:
        result = build(Path(args.out))
    except Exception as exc:  # noqa: BLE001
        print(f"[오류] IFC 생성 실패: {exc}", file=sys.stderr)
        return 1
    print(f"[생성 완료] {args.out}  (부품 {result['elements']}개, 단위=metre)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
