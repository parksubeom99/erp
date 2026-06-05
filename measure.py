#!/usr/bin/env python3
"""
measure.py — ④ 정확도/커버리지 측정 하니스

적재된 DB(또는 직접 투입한 .ifc/.dxf)에 대해 추출 품질을 측정·리포트한다.

정직한 정의:
  - ground-truth(정답 치수표)가 없으면 '정확도'를 직접 못 잰다.
  - 대신 **canonical 매핑 커버리지**(표준명으로 해석된 파라미터 비율)를 정확도 프록시로 보고.
  - 매핑 누락 raw_name을 나열 → paramdb.CANONICAL_MAP에 추가하면 커버리지가 오른다.
  - EN81 위반·치수 자동연관·검수 큐도 함께 집계.
실제 제조사 도면을 투입하면 그 파일 기준 수치가 그대로 나온다.

사용:
    python measure.py <db>
    python measure.py <db> --ifc drawing.ifc      # 추출 후 측정
    python measure.py <db> --dxf drawing.dxf
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


def measure(conn: sqlite3.Connection) -> dict:
    drawings = conn.execute(
        "SELECT id, format, drawing_type FROM source_drawing ORDER BY id"
    ).fetchall()
    report = []
    agg = {"total": 0, "mapped": 0, "violations": 0, "dim_assoc": 0}
    for did, fmt, dtype in drawings:
        rows = conn.execute(
            "SELECT p.canonical_name, p.raw_name, p.pset_name "
            "FROM parameter p JOIN component c ON c.id = p.component_id "
            "WHERE c.drawing_id = ?", (did,)
        ).fetchall()
        total = len(rows)
        mapped = sum(1 for r in rows if r[0] is not None)
        unmapped = sorted({r[1] for r in rows if r[0] is None})
        dim_assoc = sum(1 for r in rows if r[2] == "DIMENSION")
        issues = conn.execute(
            "SELECT rule, severity, detail FROM validation_issue WHERE drawing_id = ?", (did,)
        ).fetchall()
        report.append({
            "id": did, "format": fmt, "drawing_type": dtype,
            "total": total, "mapped": mapped,
            "coverage": (mapped / total * 100.0) if total else 0.0,
            "unmapped": unmapped, "dim_assoc": dim_assoc, "issues": issues,
        })
        agg["total"] += total
        agg["mapped"] += mapped
        agg["violations"] += len(issues)
        agg["dim_assoc"] += dim_assoc
    review = conn.execute("SELECT COUNT(*) FROM review_queue").fetchone()[0]
    agg["review"] = review
    agg["n_draw"] = len(drawings)
    agg["coverage"] = (agg["mapped"] / agg["total"] * 100.0) if agg["total"] else 0.0
    return {"per": report, "agg": agg}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="④ 정확도/커버리지 측정 하니스")
    parser.add_argument("db")
    parser.add_argument("--ifc", help="측정 전 이 IFC를 db로 추출")
    parser.add_argument("--dxf", help="측정 전 이 DXF를 db로 추출")
    args = parser.parse_args(argv)

    if args.ifc:
        import extract_ifc
        if extract_ifc.main([args.ifc, args.db]) != 0:
            return 1
    if args.dxf:
        import extract_dxf
        if extract_dxf.main([args.dxf, args.db]) != 0:
            return 1
    if not Path(args.db).exists():
        print(f"[오류] DB 없음: {args.db} (또는 --ifc/--dxf 로 투입)", file=sys.stderr)
        return 1

    conn = sqlite3.connect(args.db)
    r = measure(conn)
    conn.close()
    a = r["agg"]

    print("=" * 60)
    print(f"측정 대상: {args.db}  (도면 {a['n_draw']}개)")
    print("=" * 60)
    for d in r["per"]:
        print(f"[도면 #{d['id']}] {d['format']} / {d['drawing_type']}")
        print(f"  파라미터 {d['total']}개 | 표준매핑 {d['mapped']} | "
              f"커버리지 {d['coverage']:.0f}% | 치수자동연관 {d['dim_assoc']}")
        if d["unmapped"]:
            print(f"  매핑 누락(raw): {d['unmapped']}  ← CANONICAL_MAP 보강 대상")
        for rule, sev, detail in d["issues"]:
            print(f"  [EN81 {sev}] {rule}: {detail}")
    print("-" * 60)
    print(f"[전체] 파라미터 {a['total']} | 표준매핑 {a['mapped']} | "
          f"커버리지 {a['coverage']:.0f}% | EN81 위반 {a['violations']} | "
          f"치수연관 {a['dim_assoc']} | 검수 큐 {a['review']}")
    print("주: 커버리지 = canonical 매핑률(정확도 프록시). 실제 정확도는 정답 치수표가 있어야 직접 측정 가능.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
