#!/usr/bin/env python3
"""
infer_edges.py — ② 의존 그래프 자동 추론

여러 도면(인스턴스)에 걸쳐 파라미터 간 선형 관계를 회귀로 발굴해
dependency_edge(origin='inferred')로 제안한다.

정직 원칙:
  - 이미 표준 엣지가 있는 타깃은 건너뜀(신규 지식만 추가).
  - 회귀는 상관만 본다 → 인과 '방향'을 못 정한다. door_height=car_height-100 과
    그 역(car_height=door_height+100)이 둘 다 R²=1로 잡힌다. 방향이 모호하면
    **자동 기록하지 않고 사람 확인(review)** 으로 보낸다 (잘못된 방향 기록 = 모델 오염).
  - 도메인 지식(--drivers: 드라이버 파라미터 목록)을 주면 방향이 풀려 자동 기록.
  - 비선형(예: shaft_area=폭*깊이)은 선형 회귀로 미발견 → 정직 보고.
  - 외부 ML 라이브러리 없음. 순수 파이썬 최소제곱.

사용:
    python infer_edges.py <db> [--min-r2 0.99] [--write]
    python infer_edges.py <db> --drivers car_width,car_depth,car_height --write
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx == 0 or syy == 0:
        return None
    slope = sxy / sxx
    return slope, my - slope * mx, (sxy * sxy) / (sxx * syy)


def per_drawing_values(conn):
    rows = conn.execute(
        "SELECT c.drawing_id, p.canonical_name, p.value "
        "FROM parameter p JOIN component c ON c.id = p.component_id "
        "WHERE p.canonical_name IS NOT NULL AND p.value IS NOT NULL"
    ).fetchall()
    acc = {}
    for did, canon, val in rows:
        acc.setdefault(did, {}).setdefault(canon, []).append(val)
    return {did: {k: sum(v) / len(v) for k, v in d.items()} for did, d in acc.items()}


def fmt_expr(slope, intercept, predictor):
    s = f"{slope:.4g} * {predictor}"
    if abs(intercept) < 1e-9:
        return s
    return f"{s} {'-' if intercept < 0 else '+'} {abs(intercept):.4g}"


def infer(db_path, min_r2, write, drivers):
    conn = sqlite3.connect(str(db_path))
    existing = {r[0] for r in conn.execute("SELECT target_param FROM dependency_edge")}
    data = per_drawing_values(conn)
    freq = {}
    for d in data.values():
        for k in d:
            freq[k] = freq.get(k, 0) + 1
    canonicals = [k for k, c in freq.items() if c >= 3]
    drivers = set(drivers)

    targets_pool = [k for k in canonicals if k not in existing and k not in drivers]
    predictors = [k for k in canonicals if k not in existing]

    proposals, ambiguous, weak, seen = [], [], [], set()
    for target in sorted(targets_pool):
        best = None
        for pred in predictors:
            if pred == target:
                continue
            pairs = [(d[pred], d[target]) for d in data.values() if pred in d and target in d]
            if len(pairs) < 3:
                continue
            fit = ols([p for p, _ in pairs], [t for _, t in pairs])
            if fit is None:
                continue
            slope, intercept, r2 = fit
            if best is None or r2 > best[0]:
                best = (r2, slope, intercept, pred)
        if not best:
            continue
        r2, slope, intercept, pred = best
        if r2 < min_r2:
            weak.append(f"{target} (최적 R²={r2:.3f})")
            continue
        if pred in targets_pool and not drivers:
            key = frozenset({target, pred})
            if key in seen:
                continue
            seen.add(key)
            ambiguous.append((target, pred, round(r2, 4)))
        else:
            proposals.append((target, fmt_expr(slope, intercept, pred), pred, round(r2, 4)))

    written = 0
    if write:
        for target, expr, pred, r2 in proposals:
            conn.execute(
                "INSERT INTO dependency_edge (target_param, expression, source_params, origin, confidence) "
                "VALUES (?,?,?,?,?)", (target, expr, pred, "inferred", r2))
            written += 1
        for target, pred, r2 in ambiguous:
            conn.execute(
                "INSERT INTO review_queue (item_type, item_ref, reason, confidence) VALUES (?,?,?,?)",
                ("inferred_edge_direction", None,
                 f"{target} ↔ {pred} 관계 발견(R²={r2}) — 인과 방향 불확정, 사람 확인 필요", r2))
        conn.commit()
    conn.close()
    return {"n_draw": len(data), "canonicals": canonicals, "existing": sorted(existing),
            "proposals": proposals, "ambiguous": ambiguous, "weak": weak, "written": written}


def main(argv=None):
    parser = argparse.ArgumentParser(description="② 의존 그래프 자동 추론(회귀)")
    parser.add_argument("db")
    parser.add_argument("--min-r2", type=float, default=0.99)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--drivers", default="", help="드라이버 canonical 목록(쉼표) — 방향 결정용")
    args = parser.parse_args(argv)

    if not Path(args.db).exists():
        print(f"[오류] DB 없음: {args.db}", file=sys.stderr)
        return 1
    drivers = [s.strip() for s in args.drivers.split(",") if s.strip()]
    r = infer(Path(args.db), args.min_r2, args.write, drivers)
    if r["n_draw"] < 3:
        print(f"[경고] 도면 {r['n_draw']}개 — 회귀엔 최소 3개 권장.")

    print(f"[자동 추론] 도면 {r['n_draw']}개, 수치 파라미터 {len(r['canonicals'])}종, 임계 R²={args.min_r2}"
          + (f", 드라이버={drivers}" if drivers else ""))
    print(f"  건너뜀(이미 표준 엣지): {r['existing']}")
    print(f"  발견(신규 추론 엣지, 방향 확정) {len(r['proposals'])}건:")
    for target, expr, pred, r2 in r["proposals"]:
        print(f"    + {target} = {expr}   (R²={r2}, ← {pred})")
    if r["ambiguous"]:
        print(f"  방향 불확정 {len(r['ambiguous'])}건 → 사람 확인(자동기록 안 함):")
        for target, pred, r2 in r["ambiguous"]:
            print(f"    ? {target} ↔ {pred} (R²={r2}) — --drivers 로 방향 지정 가능")
    if r["weak"]:
        print(f"  약한 후보(임계 미달): {r['weak']}")
    print("  (비선형 예 shaft_area=폭*깊이 는 선형 회귀로 미발견 — 표준 시드 담당)")
    if args.write:
        print(f"[기록] inferred 엣지 {r['written']}건 + 모호 {len(r['ambiguous'])}건 검수 큐")
    else:
        print("[안내] --write 로 DB 반영")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
