import json
from datetime import date
from pathlib import Path

from app.inference import RULES, PriorityInferenceRequest, infer_priority


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
    assert "safe_to_eat" not in result.model_dump()


def test_opened_product_gets_shorter_reference_window() -> None:
    unopened = infer_priority(PriorityInferenceRequest(product_name="저지방 우유", storage_type="refrigerated", reference_date=date(2026, 9, 1)))
    opened = infer_priority(PriorityInferenceRequest(product_name="저지방 우유", storage_type="refrigerated", opened=True, reference_date=date(2026, 9, 1)))

    assert unopened.estimated_use_first_window is not None
    assert opened.estimated_use_first_window is not None
    assert opened.estimated_use_first_window.end_date < unopened.estimated_use_first_window.end_date


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
