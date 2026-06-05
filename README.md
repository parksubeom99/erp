# 엘리베이터 CAD → 파라메트릭 DB · 전체 파이프라인 프로토타입

임의의 엘리베이터 CAD(IFC·DXF)를 부품·파라미터·**의존 그래프**로 적재하고,
치수 하나를 조절하면 전체가 재계산되며(전파), 그 결과로 **3D 형상을 재생성**한다.
나아가 여러 도면에서 **의존 관계를 자동 추론**하고, 추출 품질을 **측정**한다.
원칙: "그림(B-rep)"은 저장하지 않고 `geometry_ref`로 참조. 측정값 불변, 솔버·재생성 결과 분리.

## 구성

| 파일 | 역할 |
|------|------|
| `paramdb.py` | 공통 코어 — 스키마·표준 사전·매핑·단위 정규화·EN81 검증·표준 상수 |
| `schema.sql` | 스키마 (parameter·dependency_edge·validation_issue·constant·solved_parameter 등) |
| `classifier.py` | 도면 분류 **AI 연결 시임** — 규칙기반 + 비전(VLM/YOLO) stub(동일 인터페이스) |
| `extract_ifc.py` | Phase 1 — IFC 추출: 표준 `Pset_TransportElementElevator`(ClearWidth/Depth/Height) + **형상 bbox 치수 추출**(Pset 없을 때) |
| `extract_dxf.py` | Phase 2/2.1 — DXF 추출: 블록→부품, 라벨→파라미터, **$INSUNITS 단위 + DIMENSION 자동연관** |
| `infer_edges.py` | ② **의존 그래프 자동 추론** — 여러 도면에서 선형 관계 회귀 발굴 (순수 파이썬 OLS) |
| `propagate.py` | 전파 솔버 — 드라이버 조절 → 의존 그래프 재계산 + EN81 재검증 |
| `regen_ifc.py` | 3D 재생성 — 전파 파라미터 → IFC 3D 형상(카·승강로·도어) + 역검증 |
| `measure.py` | ④ **정확도/커버리지 측정 하니스** |
| `make_sample_ifc.py` / `make_sample_dxf.py` / `make_series_ifc.py` | 테스트 생성기 |

## 실행

```
pip install ifcopenshell ezdxf

# 단일 도면: 추출 → 전파 → 3D 재생성
python make_sample_ifc.py sample.ifc
python extract_ifc.py sample.ifc out.db
python propagate.py out.db --set car_width=1300 --write
python regen_ifc.py out.db regen.ifc --scenario modified

# DXF (단위 + 치수 자동연관)
python make_sample_dxf.py sample.dxf && python extract_dxf.py sample.dxf dxf.db

# ② 여러 도면 → 의존 관계 자동 추론
python make_series_ifc.py series --n 5
for f in series/series_*.ifc; do python extract_ifc.py "$f" series.db; done
python infer_edges.py series.db                                   # 방향 불확정은 사람 확인
python infer_edges.py series.db --drivers car_width,car_depth,car_height --write   # 방향 확정 자동 기록

# ④ 추출 품질 측정
python measure.py series.db
python measure.py new.db --ifc 제조사도면.ifc      # 실제 파일 투입 시 그 기준 수치
```

## 검증된 동작 (컨테이너 실행)

- **IFC 추출**: m→mm 정규화, 커버리지 90%, EN81 위반 검출
- **DXF 추출(2.1)**: `$INSUNITS=mm` 자동 감지, 라벨 없는 DIMENSION(1100)을 최근접 부품(car)에 자동 연관
- **전파**: car_width 1100→1300 → shaft_width 1600→1800, shaft_area 2.88M→3.24M(2단 체인), EN81 위반 1→0
- **3D 재생성**: IFC 박스 3개 생성, 형상 치수 == 파라미터 역검증 PASS
- **② 자동 추론**: 심은 관계 `door_height=car_height-100` 을 데이터만으로 R²=1.0 재발견. 표준 엣지(shaft_*) 건너뜀. 드라이버 지정 시 단일 방향 기록 → 솔버에서 작동(car_height 2100→2400 ⇒ door_height 2000→2300)
- **④ 측정**: 도면별/전체 커버리지·EN81 위반·검수 큐 집계

## ② 의존 그래프 자동 추론 (정직한 한계)

회귀는 **상관**만 본다 → 인과 **방향**을 못 정한다(`door_height=car_height-100` 과 그 역이 둘 다 R²=1).
방향이 모호하면 자동 기록하지 않고 **사람 확인(review)** 으로 보낸다(잘못된 방향 기록 = 모델 오염).
도메인 지식(`--drivers`)을 주면 방향이 풀려 자동 기록. 비선형(shaft_area=폭*깊이)은 선형 회귀로 미발견 → 표준 시드 담당.

## 분류 AI 시임 (`classifier.py`)

구조화 도면은 규칙기반으로 충분. 스캔/레거시는 비전 AI(VLM/YOLO)가 필요하나 이 환경엔 모델 가중치가 없어
**stub + 동일 인터페이스**로 자리만 둔다(가짜 추론 없음). 실모델을 끼우면 파이프라인 변경 없이 교체.
부트스트랩: 비전 AI 1회 분류 → 카탈로그 등록 → 이후 결정론 처리.

## 실데이터 준비도

이 샌드박스에선 제조사 프로프라이어터리 도면을 받을 수 없어(포털/LFS/인증 차단) 합성·표준 픽스처로 검증한다.
대신 **공개 IFC 표준에 정합**시켜, 실제 표준 준수 파일이 들어오면 바로 매핑되게 했다:
- 표준 `Pset_TransportElementElevator` 속성명(`ClearWidth`·`ClearDepth`·`ClearHeight`)을 사전에 반영.
- 치수가 Pset에 없고 **형상에만 있는 실제 IFC**도 bbox에서 치수 추출(IFC 표준상 형상이 치수 우선).
- 낯선 제조사 표기는 `measure.py`로 누락을 표면화 → `CANONICAL_MAP` 보강 → 재측정으로 커버리지 상승.

검증: 표준 IFC(카=표준 Pset, 승강로·도어=형상만) → 커버리지 100%(카는 Pset 경로, 승강로·도어는 GEOMETRY 경로).
실제 제조사 파일을 올리면 `python measure.py new.db --ifc 도면.ifc` 로 그 파일 기준 수치가 나온다.

## 다음 단계

- 실제 제조사 `.ifc/.dxf` 투입 → `measure.py` 로 진짜 정확도 수치
- 비전 분류기 실모델 연결(별도 GPU 환경) — `classifier.py` 인터페이스에 맞춰
- 전파 결과 3D를 IFC 뷰어/Revit 렌더 검수
