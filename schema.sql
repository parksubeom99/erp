-- 엘리베이터 CAD → 파라메트릭 DB · Phase 1 MVP 스키마 (SQLite)
-- 설계안 §03 의 엔티티를 충실히 반영. "그림"이 아니라 "레시피"(파라미터+제약그래프+지오참조)를 저장.
PRAGMA foreign_keys = ON;

-- 원본 도면 메타 (불변 raw 참조)
CREATE TABLE IF NOT EXISTS source_drawing (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT,                 -- 출처 (manufacturer / file / portal)
    format        TEXT NOT NULL,        -- IFC / DWG / DXF / RFA
    lod           TEXT,                 -- LOD 100 / 300 등 (미상이면 NULL)
    file_hash     TEXT NOT NULL,        -- 원본 해시 (중복 식별)
    raw_ref       TEXT NOT NULL,        -- 원본 파일 경로/URI
    manufacturer  TEXT,
    series        TEXT,
    drawing_type  TEXT,                 -- ga / car / shaft / door ...
    ingested_at   TEXT NOT NULL
);

-- 부품 인스턴스
CREATE TABLE IF NOT EXISTS component (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    drawing_id      INTEGER NOT NULL REFERENCES source_drawing(id),
    component_type  TEXT NOT NULL,      -- car / door / shaft / guide_rail / counterweight / unknown
    ifc_class       TEXT,               -- IfcTransportElement 등 원본 클래스
    ifc_guid        TEXT,               -- 원본 식별자 (geometry_ref 와 연결)
    name            TEXT,
    confidence      REAL NOT NULL DEFAULT 1.0
);

-- 표준 파라미터 사전 (온톨로지). 측정값을 이 canonical 이름에 정렬한다.
CREATE TABLE IF NOT EXISTS parameter_def (
    canonical_name   TEXT PRIMARY KEY,  -- car_width / shaft_width ...
    description       TEXT,
    unit              TEXT,             -- mm / kg / mps
    en81_constraint   TEXT,             -- 표준 제약 메모 (검증용)
    synonyms          TEXT              -- 동의어 목록 (콤마구분)
);

-- 측정·정규화된 파라미터 값
CREATE TABLE IF NOT EXISTS parameter (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id        INTEGER NOT NULL REFERENCES component(id),
    canonical_name      TEXT,           -- parameter_def.canonical_name (정규화 성공 시)
    raw_name            TEXT NOT NULL,  -- 원본 속성명 (출처 추적)
    value               REAL,
    unit                TEXT,
    pset_name           TEXT,           -- 출처 PropertySet 이름
    confidence          REAL NOT NULL DEFAULT 1.0
);

-- 제약·의존 그래프 (DB의 뇌). "조절 시 전체 재계산"의 근거.
CREATE TABLE IF NOT EXISTS dependency_edge (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_param  TEXT NOT NULL,        -- 결과 파라미터 (canonical)
    expression    TEXT NOT NULL,        -- 관계식 (예: car_width + 2*clearance + rail_space)
    source_params TEXT NOT NULL,        -- 입력 파라미터 목록 (콤마구분)
    origin        TEXT NOT NULL,        -- standard / inferred / manufacturer
    confidence    REAL NOT NULL DEFAULT 1.0
);

-- 3D 형상 포인터 (B-rep 은 DB 밖, 여기서 가리킨다)
CREATE TABLE IF NOT EXISTS geometry_ref (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id  INTEGER NOT NULL REFERENCES component(id),
    kind          TEXT NOT NULL,        -- ifc / dwg / mesh
    uri           TEXT NOT NULL,        -- 원본 파일
    locator       TEXT                  -- GUID / block handle 등 내부 위치
);

-- 휴먼 검수 큐 (신뢰도 낮은 매핑/관계만 사람에게)
CREATE TABLE IF NOT EXISTS review_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type     TEXT NOT NULL,        -- parameter_mapping / dependency / component_type
    item_ref      INTEGER,              -- 대상 행 id
    reason        TEXT,
    confidence    REAL,
    status        TEXT NOT NULL DEFAULT 'open'   -- open / approved / rejected
);

-- 부트스트랩 카탈로그 (등록되면 다음 도면은 결정론 매칭 → AI 의존 감소)
CREATE TABLE IF NOT EXISTS catalog_item (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    component_type  TEXT NOT NULL,
    manufacturer    TEXT,
    series          TEXT,
    param_template  TEXT              -- 표준 파라미터 셋 (JSON)
);

-- EN 81 제약 검증 결과 (Step 5). 위반 항목을 도면 단위로 기록.
CREATE TABLE IF NOT EXISTS validation_issue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    drawing_id  INTEGER NOT NULL REFERENCES source_drawing(id),
    rule        TEXT NOT NULL,        -- 위반 규칙명
    severity    TEXT NOT NULL,        -- error / warn
    detail      TEXT,                 -- 구체 수치
    status      TEXT NOT NULL DEFAULT 'open'
);

-- 표준 상수 (클리어런스·레일 공간 등). 의존식의 입력으로 쓰인다.
CREATE TABLE IF NOT EXISTS constant (
    name   TEXT PRIMARY KEY,
    value  REAL NOT NULL,
    unit   TEXT,
    note   TEXT
);

-- 전파 솔버 스냅샷. 측정값(parameter)은 불변으로 두고, 솔버 결과는 여기 분리 저장.
CREATE TABLE IF NOT EXISTS solved_parameter (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    drawing_id  INTEGER NOT NULL REFERENCES source_drawing(id),
    scenario    TEXT NOT NULL,        -- baseline / modified
    name        TEXT NOT NULL,        -- canonical 파라미터명
    value       REAL,
    unit        TEXT,
    role        TEXT NOT NULL         -- driver / derived / constant
);
