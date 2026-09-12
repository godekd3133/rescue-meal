import json
from datetime import date
from pathlib import Path

import httpx

from app.inference import (
    RULES,
    OllamaConfig,
    OllamaInferenceUnavailable,
    OllamaPriorityProvider,
    PriorityInferenceRequest,
    infer_priority,
)


def test_known_product_returns_priority_window_not_safety_verdict() -> None:
    result = infer_priority(
        PriorityInferenceRequest(
            product_name="국산콩 두부",
            storage_type="refrigerated",
            reference_date=date(2026, 9, 1),
        )
    )

    assert result.abstained is False
    assert result.category == "두부·콩"
    assert result.estimated_use_first_window is not None
    assert result.estimated_use_first_window.start_date == date(2026, 9, 3)
    assert result.requires_confirmation is True
    assert result.safety_disclaimer.startswith("안전 판정")
    assert len(result.input_sha256) == 64
    assert result.estimated_use_first_window.rule_id == "priority.tofu.v1"
    assert "safe_to_eat" not in result.model_dump()


def test_opened_product_gets_shorter_reference_window() -> None:
    unopened = infer_priority(PriorityInferenceRequest(product_name="저지방 우유", storage_type="refrigerated", reference_date=date(2026, 9, 1)))
    opened = infer_priority(PriorityInferenceRequest(product_name="저지방 우유", storage_type="refrigerated", opened=True, reference_date=date(2026, 9, 1)))

    assert unopened.estimated_use_first_window is not None
    assert opened.estimated_use_first_window is not None
    assert opened.estimated_use_first_window.end_date < unopened.estimated_use_first_window.end_date
    assert opened.input_sha256 != unopened.input_sha256


def test_opened_date_is_the_reference_anchor_for_unknown_expiry_estimates() -> None:
    result = infer_priority(
        PriorityInferenceRequest(
            product_name="저지방 우유",
            storage_type="refrigerated",
            opened=True,
            opened_at=date(2026, 9, 10),
            reference_date=date(2026, 9, 1),
        )
    )

    assert result.estimated_use_first_window is not None
    assert result.estimated_use_first_window.start_date == date(2026, 9, 11)
    assert result.estimated_use_first_window.end_date == date(2026, 9, 13)
    assert "개봉일 2026-09-10" in result.reasoning[1]

    purchase_anchored = infer_priority(
        PriorityInferenceRequest(
            product_name="저지방 우유",
            storage_type="refrigerated",
            opened=True,
            reference_date=date(2026, 9, 1),
        )
    )
    assert result.input_sha256 != purchase_anchored.input_sha256


def test_unknown_product_or_missing_storage_abstains() -> None:
    unknown = infer_priority(PriorityInferenceRequest(product_name="정체불명 수제 소스", storage_type="refrigerated"))
    missing_storage = infer_priority(PriorityInferenceRequest(product_name="시금치"))

    assert unknown.abstained is True
    assert unknown.estimated_use_first_window is None
    assert missing_storage.abstained is True
    assert missing_storage.requires_confirmation is True


def test_development_rule_fixture_matches_embedded_provider_ids() -> None:
    fixture_path = Path(__file__).resolve().parents[3] / "data" / "fixtures" / "rules" / "priority-rules-v1.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    assert fixture["status"] == "development_only"
    assert {rule["rule_id"] for rule in fixture["rules"]} == {rule.rule_id for rule in RULES}


def test_ollama_structured_output_becomes_a_review_only_priority_window() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "test-model",
                "message": {
                    "role": "assistant",
                    "content": json.dumps(
                        {
                            "canonical_name": "수제 토마토 소스",
                            "category": "가공 소스",
                            "storage_type": "refrigerated",
                            "unopened_days_min": 2,
                            "unopened_days_max": 5,
                            "confidence": 0.96,
                            "reasoning": ["상품명에 소스가 포함됨"],
                            "abstain": False,
                            "abstain_reason": None,
                        },
                        ensure_ascii=False,
                    ),
                },
            },
        )

    request = PriorityInferenceRequest(
        product_name="정체불명 수제 토마토 소스",
        storage_type="refrigerated",
        reference_date=date(2026, 9, 1),
    )
    config = OllamaConfig(base_url="http://ollama.test", model="test-model")
    with httpx.Client(base_url=config.base_url, transport=httpx.MockTransport(handler)) as http_client:
        with OllamaPriorityProvider(config, client=http_client) as provider:
            result = provider.infer(request)

    assert result.provider == "ollama-structured-output"
    assert result.provider_version == "ollama:test-model"
    assert result.category == "가공 소스"
    assert result.estimated_use_first_window is not None
    assert result.estimated_use_first_window.start_date == date(2026, 9, 3)
    assert result.estimated_use_first_window.end_date == date(2026, 9, 6)
    assert result.estimated_use_first_window.rule_id == "priority.ollama-unverified.v1"
    assert result.storage_confidence == 0.75
    assert result.requires_confirmation is True
    assert result.abstained is False
    assert "안전 여부" in result.safety_disclaimer
    assert "safe_to_eat" not in result.model_dump()
    assert captured["stream"] is False
    assert captured["options"] == {"temperature": 0}
    assert isinstance(captured["format"], dict)
    assert "정체불명 수제 토마토 소스" in str(captured["messages"])


def test_ollama_opened_window_uses_server_reference_anchor_and_never_printed_date() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps(
                        {
                            "canonical_name": None,
                            "category": "알 수 없는 냉장 식품",
                            "storage_type": "refrigerated",
                            "unopened_days_min": 2,
                            "unopened_days_max": 5,
                            "confidence": 0.7,
                            "reasoning": [],
                            "abstain": False,
                            "abstain_reason": None,
                        },
                        ensure_ascii=False,
                    )
                }
            },
        )

    request = PriorityInferenceRequest(
        product_name="정체불명 냉장 식품",
        storage_type=None,
        opened=True,
        opened_at=date(2026, 9, 10),
        reference_date=date(2026, 9, 1),
    )
    config = OllamaConfig(base_url="http://ollama.test", model="test-model")
    with httpx.Client(base_url=config.base_url, transport=httpx.MockTransport(handler)) as http_client:
        with OllamaPriorityProvider(config, client=http_client) as provider:
            result = provider.infer(request)

    assert result.storage_type == "refrigerated"
    assert result.estimated_use_first_window is not None
    assert result.estimated_use_first_window.start_date == date(2026, 9, 11)
    assert result.estimated_use_first_window.end_date == date(2026, 9, 13)
    assert result.storage_confidence == 0.56
    assert all("소비기한" not in reason for reason in result.reasoning)


def test_ollama_invalid_structured_output_is_rejected_before_any_estimate() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps(
                        {
                            "category": "unknown",
                            "storage_type": "ambient",
                            "unopened_days_min": 1,
                            "unopened_days_max": 2,
                            "confidence": 0.8,
                            "reasoning": [],
                            "abstain": False,
                            "abstain_reason": None,
                            "safe_to_eat": True,
                        }
                    )
                }
            },
        )

    config = OllamaConfig(base_url="http://ollama.test", model="test-model")
    request = PriorityInferenceRequest(product_name="정체불명 상품", storage_type="ambient")
    with httpx.Client(base_url=config.base_url, transport=httpx.MockTransport(handler)) as http_client:
        with OllamaPriorityProvider(config, client=http_client) as provider:
            try:
                provider.infer(request)
            except OllamaInferenceUnavailable:
                pass
            else:
                raise AssertionError("invalid Ollama output must be rejected")


def test_ollama_oversized_response_is_rejected_before_json_parsing() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"{" + (b"x" * (64 * 1024)) + b"}")

    config = OllamaConfig(base_url="http://ollama.test", model="test-model")
    request = PriorityInferenceRequest(product_name="정체불명 상품", storage_type="ambient")
    with httpx.Client(base_url=config.base_url, transport=httpx.MockTransport(handler)) as http_client:
        with OllamaPriorityProvider(config, client=http_client) as provider:
            try:
                provider.infer(request)
            except OllamaInferenceUnavailable:
                pass
            else:
                raise AssertionError("oversized Ollama output must be rejected")
