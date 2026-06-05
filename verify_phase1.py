#!/usr/bin/env python3
"""Phase 1 검증 — 추출 결과(out.db)를 사람이 읽기 좋게 덤프."""
import sqlite3
import sys

db = sys.argv[1] if len(sys.argv) > 1 else "out.db"
c = sqlite3.connect(db)

print("=== component ===")
for r in c.execute("SELECT id, component_type, ifc_class, name, confidence FROM component ORDER BY id"):
    print(f"  #{r[0]} {r[1]:<10} {r[2]:<22} {r[3]!s:<16} conf={r[4]}")

print("=== parameter (canonical / raw / value / unit / pset) ===")
q = ("SELECT co.component_type, p.canonical_name, p.raw_name, p.value, p.unit, p.pset_name "
     "FROM parameter p JOIN component co ON p.component_id=co.id ORDER BY co.id, p.canonical_name")
for r in c.execute(q):
    canon = r[1] or "(unmapped)"
    print(f"  {r[0]:<8} {canon:<12} <- {r[2]:<12} = {r[3]!s:>8} {r[4] or '':<4} [{r[5]}]")

print("=== review_queue ===")
for r in c.execute("SELECT item_type, reason, confidence FROM review_queue"):
    print(f"  {r[0]:<18} {r[1]} (conf={r[2]})")

print("=== EN81 validation_issue ===")
for r in c.execute("SELECT rule, severity, detail FROM validation_issue"):
    print(f"  [{r[1]}] {r[0]}: {r[2]}")

print("=== standard dependency_edge (Phase 2 솔버 입력) ===")
for r in c.execute("SELECT target_param, expression FROM dependency_edge WHERE origin='standard'"):
    print(f"  {r[0]} = {r[1]}")

c.close()
