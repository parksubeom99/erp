#!/usr/bin/env python3
"""
paramdb.py — 파라메트릭 DB 공통 코어

IFC/DXF 추출기 + 전파 솔버가 공유:
  - 스키마 초기화 + 표준 사전/의존 그래프/표준 상수 시드
  - 의미 매핑(원본 속성명 → 표준 파라미터)
  - 단위 정규화(길이 → mm)
  - EN 81 제약 검증 (순수 함수 check_en81 + DB 래퍼 validate_en81)
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
CONFIDENCE_THRESHOLD = 0.7

CANONICAL_MAP: dict[str, str] = {
    "carwidth": "car_width", "cw": "car_width",
    "cardepth": "car_depth", "cd": "car_depth",
    "carheight": "car_height", "ch": "car_height",
    "shaftwidth": "shaft_width", "hoistwaywidth": "shaft_width", "sw": "shaft_width",
    "shaftdepth": "shaft_depth", "hoistwaydepth": "shaft_depth", "sd": "shaft_depth",
    "doorwidth": "door_width", "clearopeningwidth": "door_width", "dw": "door_width",
    "doorheight": "door_height", "clearopeningheight": "door_height", "dh": "door_height",
    "capacity": "rated_load", "ratedload": "rated_load", "load": "rated_load",
    "speed": "rated_speed", "ratedspeed": "rated_speed",
    "travel": "travel_height", "overhead": "overhead", "oh": "overhead",
    "pit": "pit_depth", "pitdepth": "pit_depth",
    # 제조사별 표기 별칭 (낯선 스키마 온보딩으로 확장)
    "cabinclearwidth": "car_width", "cabincleardepth": "car_depth", "cabinclearheight": "car_height",
    "wellplanwidth": "shaft_width", "wellplandepth": "shaft_depth",
    "entranceclearwidth": "door_width", "entranceclearheight": "door_height",
    # IFC4.3 표준 Pset_TransportElementElevator 속성명
    "clearwidth": "car_width", "cleardepth": "car_depth", "clearheight": "car_height",
}

LENGTH_PARAMS: set[str] = {
    "car_width", "car_depth", "car_height", "shaft_width", "shaft_depth",
    "door_width", "door_height", "pit_depth", "overhead", "travel_height",
}
UNIT_OF: dict[str, str] = {"rated_load": "kg", "rated_speed": "mps"}

CANONICAL_TO_TYPE: dict[str, str] = {
    "car_width": "car", "car_depth": "car", "car_height": "car",
    "rated_load": "car", "rated_speed": "car",
    "door_width": "door", "door_height": "door",
    "shaft_width": "shaft", "shaft_depth": "shaft", "shaft_area": "shaft",
}

PARAM_DEFS: list[tuple[str, str, str, str, str]] = [
    ("car_width", "카 내부 폭", "mm", "shaft_width 보다 작아야 함", "CW,Car Width,캐빈폭"),
    ("car_depth", "카 내부 깊이", "mm", "shaft_depth 보다 작아야 함", "CD,Car Depth"),
    ("car_height", "카 내부 높이", "mm", ">= 2000 권장", "CH,Car Height"),
    ("shaft_width", "승강로 폭", "mm", "car_width + 2*clearance + rail_space", "Hoistway Width,승강로폭"),
    ("shaft_depth", "승강로 깊이", "mm", "car_depth + clearance", "Hoistway Depth"),
    ("door_width", "도어 유효 폭", "mm", "<= car_width", "Clear Opening Width,도어폭"),
    ("door_height", "도어 유효 높이", "mm", ">= 2000", "Clear Opening Height"),
    ("rated_load", "정원/적재하중", "kg", "> 0", "Capacity,Load,정원"),
    ("rated_speed", "정격 속도", "mps", "> 0", "Speed,속도"),
    ("pit_depth", "피트 깊이", "mm", "> 0", "Pit"),
    ("overhead", "오버헤드", "mm", "표준 최소치 이상", "OH"),
]

# 의존 그래프 시드. shaft_area 는 두 파생값에 의존 → 위상 정렬(체인) 시연.
DEPENDENCY_SEEDS: list[tuple[str, str, str, str, float]] = [
    ("shaft_width", "car_width + 2*side_clearance + rail_space",
     "car_width,side_clearance,rail_space", "standard", 0.9),
    ("shaft_depth", "car_depth + front_clearance + rear_clearance",
     "car_depth,front_clearance,rear_clearance", "standard", 0.9),
    ("shaft_area", "shaft_width * shaft_depth",
     "shaft_width,shaft_depth", "standard", 0.8),
]

# 표준 상수 (mm). shaft_width/shaft_depth 측정값과 일치하도록 보정된 예시값.
CONSTANT_SEEDS: list[tuple[str, float, str, str]] = [
    ("side_clearance", 50.0, "mm", "카 측면 클리어런스(편측)"),
    ("rail_space", 400.0, "mm", "가이드레일 + 균형추 점유"),
    ("front_clearance", 250.0, "mm", "전면 클리어런스"),
    ("rear_clearance", 150.0, "mm", "후면 클리어런스"),
]


def normalize_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]", "", raw.lower())


def map_canonical(raw_name: str) -> str | None:
    return CANONICAL_MAP.get(normalize_key(raw_name))


def to_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        m = re.search(r"-?\d+(?:\.\d+)?", value)
        return float(m.group()) if m else None
    return None


def normalize_value(canonical: str | None, value: float,
                    scale_to_mm: float | None) -> tuple[float, str | None]:
    if canonical in LENGTH_PARAMS:
        if scale_to_mm is not None:
            return round(value * scale_to_mm, 1), "mm"
        return value, None
    if canonical in UNIT_OF:
        return value, UNIT_OF[canonical]
    return value, None


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.executemany(
        "INSERT OR IGNORE INTO parameter_def "
        "(canonical_name, description, unit, en81_constraint, synonyms) VALUES (?,?,?,?,?)",
        PARAM_DEFS,
    )
    conn.executemany(
        "INSERT OR IGNORE INTO constant (name, value, unit, note) VALUES (?,?,?,?)",
        CONSTANT_SEEDS,
    )
    if conn.execute("SELECT COUNT(*) FROM dependency_edge").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO dependency_edge (target_param, expression, source_params, origin, confidence) "
            "VALUES (?,?,?,?,?)",
            DEPENDENCY_SEEDS,
        )
    conn.commit()


def check_en81(vals: dict[str, float]) -> list[tuple[str, str, str]]:
    """파라미터 dict 에 대한 EN 81 제약 검사 (순수 함수). 위반 목록 반환."""
    issues: list[tuple[str, str, str]] = []

    def has(*names: str) -> bool:
        return all(n in vals and vals[n] is not None for n in names)

    if has("car_width", "shaft_width") and not (vals["car_width"] < vals["shaft_width"]):
        issues.append(("car_width<shaft_width", "error",
                       f"car_width({vals['car_width']}) >= shaft_width({vals['shaft_width']})"))
    if has("car_depth", "shaft_depth") and not (vals["car_depth"] < vals["shaft_depth"]):
        issues.append(("car_depth<shaft_depth", "error",
                       f"car_depth({vals['car_depth']}) >= shaft_depth({vals['shaft_depth']})"))
    if has("door_width", "car_width") and not (vals["door_width"] <= vals["car_width"]):
        issues.append(("door_width<=car_width", "error",
                       f"door_width({vals['door_width']}) > car_width({vals['car_width']})"))
    if has("car_height") and vals["car_height"] < 2000:
        issues.append(("car_height>=2000", "warn", f"car_height({vals['car_height']}) < 2000"))
    if has("door_height") and vals["door_height"] < 2000:
        issues.append(("door_height>=2000", "warn", f"door_height({vals['door_height']}) < 2000"))
    if has("rated_load") and vals["rated_load"] <= 0:
        issues.append(("rated_load>0", "error", f"rated_load({vals['rated_load']}) <= 0"))
    if has("rated_speed") and vals["rated_speed"] <= 0:
        issues.append(("rated_speed>0", "error", f"rated_speed({vals['rated_speed']}) <= 0"))
    return issues


def validate_en81(conn: sqlite3.Connection, drawing_id: int) -> list[tuple[str, str, str]]:
    rows = conn.execute(
        "SELECT p.canonical_name, p.value FROM parameter p "
        "JOIN component c ON c.id = p.component_id "
        "WHERE c.drawing_id = ? AND p.canonical_name IS NOT NULL",
        (drawing_id,),
    ).fetchall()
    vals: dict[str, float] = {}
    for cn, v in rows:
        if v is not None and cn not in vals:
            vals[cn] = v
    issues = check_en81(vals)
    for rule, sev, detail in issues:
        conn.execute(
            "INSERT INTO validation_issue (drawing_id, rule, severity, detail) VALUES (?,?,?,?)",
            (drawing_id, rule, sev, detail),
        )
    conn.commit()
    return issues
