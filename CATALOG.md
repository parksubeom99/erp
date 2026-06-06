# 카탈로그 부트스트랩 (Step 7)

설계안의 핵심 주장 **"AI로 1회 분류 → 카탈로그 등록 → 이후 결정론 재매칭(AI 의존 감소)"** 을
코드로 증명하는 모듈입니다. (`catalog.py`)

## 동작

- **register** `python catalog.py register <db> [--drawing N]`
  - 추출된 도면의 component를 `(component_type, manufacturer, series)` 키로 묶어
    표준 파라미터 셋을 `catalog_item.param_template` (JSON)에 등록합니다.
  - dedup: 같은 키가 이미 있으면 skip. (현재 extract_ifc는 manufacturer/series를
    NULL로 적재하므로 실질 키는 `component_type`.)
- **match** `python catalog.py match <db> [--drawing N]`
  - 새 도면의 component를 `catalog_item`과 **결정론**으로 매칭합니다.
  - 매칭 시: 등록된 `param_template` 재사용 + 해당 타입 검수(review) skip.
  - **classifier(vision) 호출 0건** — `classifier.VisionClassifier`는 stub 그대로 둡니다.

## 코어 재사용 (중복 정의 0)

- 표준 파라미터 이름(canonical)과 component_type은 **DB에서 read만** 합니다.
  extract_ifc가 paramdb 정의로 이미 써 넣은 값을 사용하며, catalog.py 안에서
  표준사전을 새로 정의하지 않습니다.

## "AI 의존 감소" 증명

`run_demo.sh` STAGE 9:

```
extract sample.ifc -> catalog.db   (도면 1)
catalog register catalog.db --drawing 1   -> car/door/shaft 3건 등록
extract sample.ifc -> catalog.db   (도면 2)
catalog match catalog.db --drawing 2      -> 3건 매칭, classifier 호출 0
```

정직한 프레이밍: 현재 IFC 경로는 이미 RuleBased 결정론이라 Vision이 실제로 도는 게
아닙니다. 따라서 이 증명은 "돌던 AI를 껐다"가 아니라 **"1회 등록 → 이후 결정론
재매칭" 메커니즘이 성립함**을 보입니다. 스캔/레거시 도면(Vision 필요)이 들어올 때
이 메커니즘이 첫 분류 1회 이후의 AI 호출을 제거합니다.
