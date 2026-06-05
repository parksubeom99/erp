#!/usr/bin/env python3
"""
propagate.py — 전파 솔버 (설계안의 "조절 시 전체 재계산" 실증)

파라메트릭 DB의 의존 그래프(dependency_edge)를 따라:
  드라이버(측정값) 1개를 조절 → 종속(derived) 파라미터를 위상정렬 순서로 재계산.

설계 원칙:
  - 측정값(parameter 테이블)은 불변. 솔버 결과는 solved_parameter 스냅샷으로 분리.
  - 표현식 평가는 eval 금지 → AST 화이트리스트 평가기 사용.
  - 재계산 후 EN 81 재검증으로 위반 발생/해소를 보고.

사용:
    python propagate.py <db> --set car_width=1300 [--set ...] [--drawing 1] [--write]
"""
from __future__ import annotations

import argparse
import ast
import operator
import sqlite3
import sys
from pathlib import Path

import paramdb

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def safe_eval(expr: str, ns: dict[str, float]) -> float:
    """산술 표현식만 허용하는 AST 평가기. 미정의 변수는 KeyError."""
    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name):
            if node.id in ns:
                return float(ns[node.id])
            raise KeyError(node.id)
        raise ValueError(f"허용되지 않은 표현식 요소: {ast.dump(node)}")
    return ev(ast.parse(expr, mode="eval").body)


class ParametricModel:
    def __init__(self, conn: sqlite3.Connection, drawing_id: int):
        self.drawing_id = drawing_id
        # 측정 파라미터 (canonical → 대표값)
        self.measured: dict[str, float] = {}
        for cn, v in conn.execute(
            "SELECT p.canonical_name, p.value FROM parameter p "
            "JOIN component c ON c.id = p.component_id "
            "WHERE c.drawing_id = ? AND p.canonical_name IS NOT NULL",
            (drawing_id,),
        ):
            if v is not None and cn not in self.measured:
                self.measured[cn] = v
        # 표준 상수
        self.constants: dict[str, float] = {
            n: v for n, v in conn.execute("SELECT name, value FROM constant")
        }
        # 의존 그래프
        self.edges: list[tuple[str, str, list[str]]] = []
        for target, expr, srcs in conn.execute(
            "SELECT target_param, expression, source_params FROM dependency_edge"
        ):
            self.edges.append((target, expr, [s.strip() for s in srcs.split(",")]))
        self.derived: set[str] = {t for t, _, _ in self.edges}
        # 독립(드라이버) = 측정값 중 파생이 아닌 것
        self.independent: dict[str, float] = {
            k: v for k, v in self.measured.items() if k not in self.derived
        }

    def topo_order(self) -> list[str]:
        """파생 파라미터를 의존 순서로 정렬. 사이클이면 ValueError."""
        deps = {t: {s for s in srcs if s in self.derived} for t, _, srcs in self.edges}
        order: list[str] = []
        done: set[str] = set()
        while len(order) < len(deps):
            progressed = False
            for target, pre in deps.items():
                if target not in done and pre <= done:
                    order.append(target)
                    done.add(target)
                    progressed = True
            if not progressed:
                raise ValueError(f"의존 그래프 사이클 감지: {set(deps) - done}")
        return order

    def solve(self, overrides: dict[str, float] | None = None) -> dict[str, dict]:
        """전체 해를 계산. 반환: name → {value, role}."""
        ns: dict[str, float] = {}
        ns.update(self.constants)
        ns.update(self.independent)
        if overrides:
            ns.update(overrides)  # 드라이버 조절

        result: dict[str, dict] = {}
        for name, val in self.constants.items():
            result[name] = {"value": val, "role": "constant"}
        for name in {**self.independent, **(overrides or {})}:
            if name not in self.derived:
                result[name] = {"value": ns[name], "role": "driver"}

        expr_of = {t: e for t, e, _ in self.edges}
        for target in self.topo_order():
            try:
                value = round(safe_eval(expr_of[target], ns), 1)
                ns[target] = value
                result[target] = {"value": value, "role": "derived"}
            except KeyError as missing:
                result[target] = {"value": None, "role": "derived",
                                  "error": f"입력 누락: {missing}"}
        return result


def fmt(v) -> str:
    return "—" if v is None else (f"{v:.0f}" if float(v).is_integer() else f"{v:.1f}")


def run(db_path: Path, sets: dict[str, float], drawing_id: int, write: bool) -> int:
    conn = sqlite3.connect(str(db_path))
    model = ParametricModel(conn, drawing_id)

    if not model.edges:
        print("[오류] 의존 그래프(dependency_edge)가 비어 있음", file=sys.stderr)
        conn.close()
        return 1

    baseline = model.solve()
    modified = model.solve(overrides=sets)

    # 조절 요약
    print("[조절]")
    for name, value in sets.items():
        old = model.independent.get(name)
        kind = "" if name in model.independent else "  (독립 드라이버 아님 — 주의)"
        print(f"  {name}: {fmt(old)} → {fmt(value)}{kind}")

    # 전파 결과 (변경된 항목만)
    print("\n[전파 — 재계산된 값]")
    names = sorted(set(baseline) | set(modified))
    changed = 0
    for name in names:
        b = baseline.get(name, {}).get("value")
        m = modified.get(name, {}).get("value")
        role = modified.get(name, baseline.get(name, {})).get("role", "")
        if b != m:
            print(f"  {name:<14} [{role:<8}] {fmt(b)} → {fmt(m)}")
            changed += 1
    if changed == 0:
        print("  (변경 없음)")

    # EN 81 재검증 (baseline vs modified)
    def vals_of(solved):
        out = dict(model.independent)
        out.update({k: d["value"] for k, d in solved.items() if d.get("value") is not None})
        return out

    base_issues = paramdb.check_en81(vals_of(baseline))
    mod_issues = paramdb.check_en81(vals_of(modified))
    print("\n[EN 81 재검증]")
    print(f"  baseline 위반 {len(base_issues)}건 → modified 위반 {len(mod_issues)}건")
    base_set = {i[0] for i in base_issues}
    mod_set = {i[0] for i in mod_issues}
    for rule in base_set - mod_set:
        print(f"  해소  ✓ {rule}")
    for rule in mod_set - base_set:
        detail = next(i[2] for i in mod_issues if i[0] == rule)
        print(f"  신규  ✗ {rule}: {detail}")

    if write:
        conn.execute("DELETE FROM solved_parameter WHERE drawing_id = ?", (drawing_id,))
        for scenario, solved in (("baseline", baseline), ("modified", modified)):
            for name, d in solved.items():
                conn.execute(
                    "INSERT INTO solved_parameter (drawing_id, scenario, name, value, unit, role) "
                    "VALUES (?,?,?,?,?,?)",
                    (drawing_id, scenario, name, d["value"], None, d["role"]),
                )
        conn.commit()
        print("\n[저장] solved_parameter 에 baseline/modified 스냅샷 기록")

    conn.close()
    return 0


def parse_sets(items: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"--set 형식 오류 (name=value): {item}")
        name, raw = item.split("=", 1)
        out[name.strip()] = float(raw)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="전파 솔버 — 치수 조절 → 전체 재계산")
    parser.add_argument("db", help="파라메트릭 DB 경로")
    parser.add_argument("--set", action="append", default=[], metavar="name=value",
                        help="조절할 드라이버 (반복 가능)")
    parser.add_argument("--drawing", type=int, default=1, help="대상 도면 id (기본 1)")
    parser.add_argument("--write", action="store_true", help="solved_parameter 스냅샷 저장")
    args = parser.parse_args(argv)

    if not Path(args.db).exists():
        print(f"[오류] DB 없음: {args.db}", file=sys.stderr)
        return 1
    try:
        sets = parse_sets(args.set)
    except ValueError as exc:
        print(f"[오류] {exc}", file=sys.stderr)
        return 1
    return run(Path(args.db), sets, args.drawing, args.write)


if __name__ == "__main__":
    raise SystemExit(main())
