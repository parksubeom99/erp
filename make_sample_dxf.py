#!/usr/bin/env python3
"""
make_sample_dxf.py - 테스트 픽스처 (미터 단위)

make_sample_ifc.py 와 동일 스토리를 DXF 로 합성한다 (바이너리 픽스처 비커밋 규약 -> tmp 합성).
- $INSUNITS=6(meter) -> 추출기가 1000x 환산 (예: 1.1 -> 1100mm)
- door_width=1.2m(1200mm)를 일부러 car_width=1.1m(1100mm)보다 크게 -> EN81 검증 위반 유도
- FireRating: 표준 미매핑 속성 -> review_queue 유도
- shaft 는 일반 블록(GENERIC)+레이어 힌트로만 분류 -> conf 0.6 < 0.7 -> review_queue 유도
  (IFC 샘플의 IfcBuildingElementProxy 가 0.6 받는 구조의 직역)

부품 = 블록 INSERT, 파라미터 = INSERT 에 붙인 ATTRIB(tag=value).

사용:
    python make_sample_dxf.py <output.dxf>
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ezdxf

# (블록명, 레이어, {ATTRIB tag: text(미터값 문자열)})
SPECS: list[tuple[str, str, dict[str, str]]] = [
    ("CAR", "A-ELEV-CAR",
     {"CarWidth": "1.1", "CarDepth": "1.4", "CarHeight": "2.2",
      "Capacity": "1000", "Speed": "1.0"}),
    ("DOOR", "A-ELEV-DOOR",
     {"DoorWidth": "1.2", "DoorHeight": "2.1"}),    # 1.2m > 카폭 1.1m -> 위반 유도
    ("GENERIC", "A-ELEV-SHAFT",
     {"ShaftWidth": "1.6", "ShaftDepth": "1.8", "FireRating": "120"}),
]


def build(out_path: Path) -> dict[str, int]:
    doc = ezdxf.new("R2010")
    doc.units = 6  # meter -> $INSUNITS=6 (정규화 테스트의 핵심)
    msp = doc.modelspace()

    for _block, layer, _attribs in SPECS:
        if layer not in doc.layers:
            doc.layers.add(layer)

    for block_name, layer, attribs in SPECS:
        if block_name not in doc.blocks:
            blk = doc.blocks.new(name=block_name)
            blk.add_line((0, 0), (1, 0))  # 블록이 비어있지 않도록 최소 형상
        ref = msp.add_blockref(block_name, (0, 0), dxfattribs={"layer": layer})
        for tag, text in attribs.items():
            ref.add_attrib(tag, text)

    doc.saveas(str(out_path))
    return {"components": len(SPECS),
            "params": sum(len(a) for _, _, a in SPECS)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="합성 엘리베이터 DXF 생성 (미터 단위, 테스트용)")
    parser.add_argument("out", help="출력 DXF 경로")
    args = parser.parse_args(argv)
    try:
        result = build(Path(args.out))
    except Exception as exc:  # noqa: BLE001
        print(f"[오류] DXF 생성 실패: {exc}", file=sys.stderr)
        return 1
    print(f"[생성 완료] {args.out}  "
          f"(부품 {result['components']}개, 속성 {result['params']}개, 단위=meter)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
