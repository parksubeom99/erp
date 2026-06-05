#!/usr/bin/env python3
"""
paramdb.py — 공통 코어

엘리베이터 CAD → 파라메트릭 DB 파이프라인의 표준 지식·유틸리티를 한곳에 모은다.
- 스키마 초기화(schema.sql 실행) + 표준 시드(parameter_def · constant · dependency_edge)
- 표준 파라미터 사전 / 동의어 매핑(map_canonical)
- 단위 정규화(normalize_value: 길이 → mm)
- EN 81 제약 검증(validate_en81)
- 파일 해시 등 보조 함수

원칙: "그림(B-rep)"은 저장하지 않는다. 측정값(parameter)은 불변, 솔버 결과는 분리.
다른 모듈(extract_ifc.py 등)은 이 모듈의 인터페이스에만 의존한다.
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
from pathlib import Path

# 타입 추정/매핑 신뢰도가 이 값 미만이면 review_queue 로 보낸다.
CONFIDENCE_THRESHOLD: float = 0.5

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


# ──────────────────────────────────────────────────────────────────────────
# 표준 파라미터 사전 (온톨로지)
#   canonical : (설명, 단위, EN81 메모, [동의어...])
#   단위가 "mm" 인 항목만 길이 정규화(scale_to_mm) 대상.
# ──────────────────────────────────────────────────────────────────────────
PARAM_DEFS: list[tuple[str, str, str, str, list[str]]] = [
    ("car_width",   "카 내부 폭",        "mm",  "door_width 이상", ["CarWidth", "ClearWidth", "CabWidth", "CarInternalWidth"]),
    ("car_depth",   "카 내부 깊이",      "mm",  "",                ["CarDepth", "ClearDepth", "CabDepth", "CarInternalDepth"]),
    ("car_height",  "카 내부 높이",      "mm",  "door_height 이상",["CarHeight", "ClearHeight", "CabHeight", "CarInternalHeight"]),
    ("door_width",  "도어 유효 폭",      "mm",  "car_width 이하",  ["DoorWidth", "DoorClearWidth", "ClearOpeningWidth", "EntranceWidth"]),
    ("door_height", "도어 유효 높이",    "mm",  "car_height 이하", ["DoorHeight", "DoorClearHeight", "ClearOpeningHeight", "EntranceHeight"]),
    ("shaft_width", "승강로 폭",         "mm",  "car_width 이상",  ["ShaftWidth", "HoistwayWidth", "WellWidth"]),
    ("shaft_depth", "승강로 깊이",       "mm",  "car_depth 이상",  ["ShaftDepth", "HoistwayDepth", "WellDepth"]),
    ("shaft_area",  "승강로 단면적",     "mm2", "shaft_width*shaft_depth", ["ShaftArea", "WellArea"]),
    ("capacity",    "정격 적재량",       "kg",  "",                ["Capacity", "LoadCapacity", "RatedLoad", "Load"]),
    ("speed",       "정격 속도",         "mps", "",                ["Speed", "RatedSpeed", "NominalSpeed"]),
]

# canonical → 표준 단위
UNIT_OF: dict[str, str] = {canon: unit for canon, _desc, unit, _en, _syn in PARAM_DEFS}


def _norm_key(name: str) -> str:
    """매핑 키 정규화: 소문자 + 영숫자만 (CarWidth/car_width/CAR WIDTH 동일 취급)."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


# 동의어(+canonical 자기 자신) → canonical
CANONICAL_MAP: dict[str, str] = {}
for _canon, _desc, _unit, _en, _syns in PARAM_DEFS:
    for _s in [_canon, *_syns]:
        CANONICAL_MAP[_norm_key(_s)] = _canon


# 표준 상수 (의존식 입력). README 검증 수치와 정합:
#   shaft_width = car_width + 500  → 1100+500=1600
#   shaft_depth = car_depth + 400  → 1400+400=1800
CONSTANTS: list[tuple[str, float, str, str]] = [
    ("rail_space_w", 500.0, "mm", "카 양측 가이드레일+클리어런스 합 폭"),
    ("rail_space_d", 400.0, "mm", "카 전후 클리어런스 합 깊이"),
]

# 표준 의존 그래프 (origin='standard'). 비선형(area)은 회귀로 못 찾으므로 여기서 시드.
STANDARD_EDGES: list[tuple[str, str, str]] = [
    ("shaft_width", "car_width + rail_space_w", "car_width,rail_space_w"),
    ("shaft_depth", "car_depth + rail_space_d", "car_depth,rail_space_d"),
    ("shaft_area",  "shaft_width * shaft_depth", "shaft_width,shaft_depth"),
]


# ──────────────────────────────────────────────────────────────────────────
# 스키마 초기화 + 표준 시드
# ──────────────────────────────────────────────────────────────────────────
def init_db(conn: sqlite3.Connection) -> None:
    """schema.sql 로 테이블 생성 후 표준 사전/상수/의존엣지를 멱등 시드."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"스키마 파일 없음: {SCHEMA_PATH}")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    cur = conn.cursor()
    for canon, desc, unit, en81, syns in PARAM_DEFS:
        cur.execute(
            "INSERT OR IGNORE INTO parameter_def "
            "(canonical_name, description, unit, en81_constraint, synonyms) VALUES (?,?,?,?,?)",
            (canon, desc, unit, en81, ",".join(syns)),
        )
    for name, value, unit, note in CONSTANTS:
        cur.execute(
            "INSERT OR IGNORE INTO constant (name, value, unit, note) VALUES (?,?,?,?)",
            (name, value, unit, note),
        )
    # dependency_edge 는 자연키가 없으므로 standard 가 없을 때만 시드(중복 방지).
    have_std = cur.execute(
        "SELECT COUNT(*) FROM dependency_edge WHERE origin='standard'"
    ).fetchone()[0]
    if not have_std:
        for target, expr, sources in STANDARD_EDGES:
            cur.execute(
                "INSERT INTO dependency_edge (target_param, expression, source_params, origin, confidence) "
                "VALUES (?,?,?,?,?)",
                (target, expr, sources, "standard", 1.0),
            )
    conn.commit()


# ──────────────────────────────────────────────────────────────────────────
# 보조 함수
# ──────────────────────────────────────────────────────────────────────────
def file_hash(path: Path | str) -> str:
    """원본 파일 SHA-256 (중복 도면 식별용)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def to_float(raw_value) -> float | None:
    """속성값 → float. bool/비수치/None 은 None (FireRating=120.0 은 통과)."""
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, (int, float)):
        return float(raw_value)
    if isinstance(raw_value, str):
        try:
            return float(raw_value.strip())
        except ValueError:
            return None
    return None


def map_canonical(raw_name: str) -> str | None:
    """원본 속성명 → 표준 canonical 이름. 미매핑이면 None."""
    return CANONICAL_MAP.get(_norm_key(raw_name))


def normalize_value(canonical: str | None, value: float,
                    scale_to_mm: float | None) -> tuple[float, str | None]:
    """
    측정값 정규화.
    - 길이(unit=mm) 이고 scale 정보가 있으면 → mm 환산(반올림 1자리).
    - 비길이(kg/mps) 또는 단위 미상은 원값 유지.
    반환: (정규화값, 단위)
    """
    unit = UNIT_OF.get(canonical) if canonical else None
    if unit == "mm" and scale_to_mm:
        return round(value * scale_to_mm, 1), "mm"
    return value, unit


# ──────────────────────────────────────────────────────────────────────────
# EN 81 제약 검증
# ──────────────────────────────────────────────────────────────────────────
def _drawing_params(conn: sqlite3.Connection, drawing_id: int) -> dict[str, float]:
    """도면의 canonical 파라미터 값 모음 (동일 canonical 중복 시 마지막 값)."""
    rows = conn.execute(
        "SELECT p.canonical_name, p.value "
        "FROM parameter p JOIN component c ON p.component_id = c.id "
        "WHERE c.drawing_id = ? AND p.canonical_name IS NOT NULL AND p.value IS NOT NULL",
        (drawing_id,),
    ).fetchall()
    out: dict[str, float] = {}
    for name, value in rows:
        out[name] = float(value)
    return out


# (규칙명, 심각도, 검사 함수: params → 위반 detail 문자열 or None)
def _en81_rules() -> list[tuple[str, str, callable]]:
    def rule_door_not_wider(p):
        if "door_width" in p and "car_width" in p and p["door_width"] > p["car_width"]:
            return f"door_width={p['door_width']:.0f} > car_width={p['car_width']:.0f}"
        return None

    def rule_door_not_taller(p):
        if "door_height" in p and "car_height" in p and p["door_height"] > p["car_height"]:
            return f"door_height={p['door_height']:.0f} > car_height={p['car_height']:.0f}"
        return None

    def rule_shaft_fits_width(p):
        if "shaft_width" in p and "car_width" in p and p["shaft_width"] < p["car_width"]:
            return f"shaft_width={p['shaft_width']:.0f} < car_width={p['car_width']:.0f}"
        return None

    def rule_shaft_fits_depth(p):
        if "shaft_depth" in p and "car_depth" in p and p["shaft_depth"] < p["car_depth"]:
            return f"shaft_depth={p['shaft_depth']:.0f} < car_depth={p['car_depth']:.0f}"
        return None

    return [
        ("door_width<=car_width",   "error", rule_door_not_wider),
        ("door_height<=car_height", "error", rule_door_not_taller),
        ("shaft_width>=car_width",  "error", rule_shaft_fits_width),
        ("shaft_depth>=car_depth",  "error", rule_shaft_fits_depth),
    ]


def validate_en81(conn: sqlite3.Connection, drawing_id: int) -> list[tuple[str, str, str]]:
    """
    도면 단위 EN81 제약 검증. 위반을 validation_issue 에 기록하고
    (rule, severity, detail) 리스트로 반환. (재실행 시 해당 도면 기존 이슈는 갱신)
    """
    params = _drawing_params(conn, drawing_id)
    conn.execute("DELETE FROM validation_issue WHERE drawing_id = ?", (drawing_id,))
    issues: list[tuple[str, str, str]] = []
    cur = conn.cursor()
    for rule, severity, check in _en81_rules():
        detail = check(params)
        if detail:
            cur.execute(
                "INSERT INTO validation_issue (drawing_id, rule, severity, detail) VALUES (?,?,?,?)",
                (drawing_id, rule, severity, detail),
            )
            issues.append((rule, severity, detail))
    conn.commit()
    return issues
