#!/usr/bin/env python3
"""
make_series_ifc.py — ② 의존 그래프 자동 추론 검증용 시리즈 생성기

같은 시리즈의 여러 도면을 *알려진 관계를 심어서* 생성한다.
infer_edges.py 가 이 관계를 데이터만으로 되찾으면 추론이 진짜임이 증명된다.

심은 관계:
  - door_height = car_height - 100      (표준 시드에 없음 → 추론이 새로 발견해야 함)
  - shaft_width = car_width + 500        (표준 시드와 동형 → 추론은 '이미 커버됨'으로 보고)
  - shaft_depth = car_depth + 400        (동일)
car_width 와 car_height 는 서로 비례하지 않게(non-collinear) 흔들어 가짜 상관을 배제.

사용:
    python make_series_ifc.py <outdir> [--n 5]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.root
import ifcopenshell.api.pset
import ifcopenshell.api.unit

# 세 드라이버를 서로 비공선형(mutually non-collinear)으로 흔들어 가짜 상관 배제
_PERM_W = [0, 1, 2, 3, 4]
_PERM_D = [3, 1, 4, 0, 2]
_PERM_H = [2, 4, 0, 3, 1]


def build_one(path: Path, cw, cd, ch, sw, sd, dw, dh, load, speed) -> None:
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name=path.stem)
    unit = ifcopenshell.api.unit.add_si_unit(model, unit_type="LENGTHUNIT")
    ifcopenshell.api.unit.assign_unit(model, units=[unit])
    specs = [
        ("IfcTransportElement", "Elevator Car", "Pset_ElevatorCarCommon",
         {"CarWidth": cw / 1000, "CarDepth": cd / 1000, "CarHeight": ch / 1000,
          "Capacity": float(load), "Speed": float(speed)}),
        ("IfcDoor", "Landing Door", "Pset_DoorCommon",
         {"DoorWidth": dw / 1000, "DoorHeight": dh / 1000}),
        ("IfcBuildingElementProxy", "Hoistway Shaft", "Pset_ShaftCommon",
         {"ShaftWidth": sw / 1000, "ShaftDepth": sd / 1000}),
    ]
    for cls, name, pset_name, props in specs:
        product = ifcopenshell.api.root.create_entity(model, ifc_class=cls, name=name)
        pset = ifcopenshell.api.pset.add_pset(model, product=product, name=pset_name)
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=props)
    model.write(str(path))


def build_series(outdir: Path, n: int) -> int:
    outdir.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        k = i % 5
        cw = 1000 + 100 * _PERM_W[k]
        cd = 1300 + 50 * _PERM_D[k]
        ch = 2000 + 50 * _PERM_H[k]
        build_one(
            outdir / f"series_{i}.ifc",
            cw=cw, cd=cd, ch=ch,
            sw=cw + 500,        # 심은 관계
            sd=cd + 400,        # 심은 관계
            dw=900,             # 고정(유효)
            dh=ch - 100,        # 심은 관계 (표준 시드에 없음)
            load=1000, speed=1.0,
        )
    return n


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="② 추론 검증용 IFC 시리즈 생성")
    parser.add_argument("outdir", help="출력 디렉토리")
    parser.add_argument("--n", type=int, default=5, help="생성 개수 (기본 5)")
    args = parser.parse_args(argv)
    try:
        n = build_series(Path(args.outdir), args.n)
    except Exception as exc:  # noqa: BLE001
        print(f"[오류] 생성 실패: {exc}", file=sys.stderr)
        return 1
    print(f"[생성 완료] {args.outdir}  (IFC {n}개, 관계 심음: door_height=car_height-100 등)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
