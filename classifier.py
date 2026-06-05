#!/usr/bin/env python3
"""
classifier.py — 도면 분류 AI 연결 시임 (seam)

구조화 IFC/DXF는 규칙 기반으로 충분하지만, 스캔/레거시 도면은 비전 AI(VLM/YOLO)가 필요하다.
이 환경엔 모델 가중치가 없으므로 *실모델은 stub* 으로 두고, 동일 인터페이스를 정의해
나중에 실제 모델을 끼우면 파이프라인 변경 없이 교체되도록 한다 (정직: 가짜 추론 없음).

부트스트랩 전략: 비전 AI는 신규/미상 도면 1회 분류 → 카탈로그 등록 → 이후 결정론 처리.
"""
from __future__ import annotations

from typing import Protocol, TypedDict


class Detection(TypedDict):
    type: str            # car / door / shaft / guide_rail ...
    bbox: tuple[float, float, float, float]
    confidence: float


class Classification(TypedDict):
    drawing_type: str    # elevator_ga / section / unknown ...
    components: list[Detection]
    confidence: float


class DrawingClassifier(Protocol):
    """모든 분류기가 따르는 계약. 입력은 구현별로 다르나 출력은 Classification 통일."""
    def classify(self, source) -> Classification: ...


class RuleBasedClassifier:
    """구조화 도면용 — 레이어/블록 이름 규칙. 결정론·무비용 (현 extract_*가 쓰는 로직)."""

    def classify(self, layer_names: list[str]) -> Classification:
        joined = " ".join(layer_names).upper()
        if "ELEV" in joined or "LIFT" in joined:
            dtype, conf = "elevator_ga", 0.9
        elif any(k in joined for k in ("CAR", "DOOR", "SHAFT", "HOIST")):
            dtype, conf = "elevator_ga", 0.6
        else:
            dtype, conf = "unknown", 0.3
        return {"drawing_type": dtype, "components": [], "confidence": conf}


class VisionClassifier:
    """스캔/레거시 도면용 — 비전 모델 자리. 실모델 연결 전까지 호출 시 명시적 실패."""

    def __init__(self, model_path: str | None = None) -> None:
        self.model_path = model_path

    def classify(self, image_path: str) -> Classification:
        raise NotImplementedError(
            "VisionClassifier: 실제 비전 모델(VLM/YOLO) 미연결. 이 환경엔 가중치 없음.\n"
            "기대 동작: image_path → {drawing_type, components:[{type,bbox,confidence}], confidence}.\n"
            "연결 지점: 여기서 모델 추론을 호출하고 결과를 Classification 형태로 정규화해 반환."
        )


def get_classifier(kind: str = "rule", **kw) -> DrawingClassifier:
    if kind == "rule":
        return RuleBasedClassifier()
    if kind == "vision":
        return VisionClassifier(**kw)
    raise ValueError(f"알 수 없는 분류기: {kind}")


if __name__ == "__main__":
    clf = get_classifier("rule")
    demo = clf.classify(["A-ELEV-CAR", "A-ELEV-DOOR"])
    print("RuleBasedClassifier 데모:", demo)
    try:
        get_classifier("vision").classify("scan.png")
    except NotImplementedError as exc:
        print("\nVisionClassifier (예상된 미연결):")
        print("  " + str(exc).replace("\n", "\n  "))
