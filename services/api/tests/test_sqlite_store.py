from datetime import datetime, timezone
from pathlib import Path

from app.main import CommitTransactionRecord, MealIngredientResponse, MealPlanAuditEventResponse, MealPlanResponse, SqliteStore


def test_sqlite_store_survives_repository_reconstruction(tmp_path: Path) -> None:
    database_path = tmp_path / "rescue-meal.db"
    first = SqliteStore(str(database_path))
    first.foods["tofu-1"].response.storage_type = "frozen"
    first.reprioritize()

    second = SqliteStore(str(database_path))
    assert second.backend_name == "sqlite-local"
    assert second.foods["tofu-1"].response.storage_type == "frozen"
    assert second.foods["tofu-1"].response.date_assertion.value is None
    assert second.foods["tofu-1"].response.estimated_use_first_window is not None


def test_sqlite_store_persists_reconciliation_transaction(tmp_path: Path) -> None:
    database_path = tmp_path / "reconciliation.db"
    first = SqliteStore(str(database_path))
    first.commit_transactions["commit-1"] = CommitTransactionRecord(
        id="commit-1",
        receipt_id="receipt-1",
        fingerprint="fingerprint-1",
        status="needs_reconciliation",
        error_code="grocy-timeout",
    )
    first.flush()

    second = SqliteStore(str(database_path))
    assert second.commit_transactions["commit-1"].status == "needs_reconciliation"
    assert second.commit_transactions["commit-1"].error_code == "grocy-timeout"


def test_sqlite_store_persists_saved_meal_plan(tmp_path: Path) -> None:
    database_path = tmp_path / "meal-plan.db"
    first = SqliteStore(str(database_path))
    saved = MealPlanResponse(
        id="meal-1",
        saved_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        consumed_food_ids=["spinach-1"],
        recipe_id="spinach-tofu-chicken-bowl",
        planner_version="recipe-planner-v2",
        source="recipe_fixture",
        title="시금치 두부 닭가슴살 덮밥",
        minutes=15,
        inventory_ids=["spinach-1", "tofu-1", "chicken-1"],
        ingredients=[MealIngredientResponse(canonical_name="시금치", amount=1, unit="팩", available=True, available_food_id="spinach-1")],
        missing_ingredients=[],
        matched_ratio=1,
        score=121,
        reason="현재 식품만으로 만들 수 있어요.",
        steps=["조리합니다."],
        safety_note="상태를 확인하세요.",
    )
    first.meal_plans[saved.id] = saved
    first.flush()

    second = SqliteStore(str(database_path))
    assert second.meal_plans["meal-1"].title == "시금치 두부 닭가슴살 덮밥"
    assert second.meal_plans["meal-1"].saved_at is not None
    assert second.meal_plans["meal-1"].completed_at is not None
    assert second.meal_plans["meal-1"].consumed_food_ids == ["spinach-1"]


def test_sqlite_store_persists_meal_plan_audit_events(tmp_path: Path) -> None:
    database_path = tmp_path / "meal-plan-events.db"
    first = SqliteStore(str(database_path))
    first.meal_plan_events.append(
        MealPlanAuditEventResponse(
            id="meal-event-1",
            plan_id="meal-1",
            event_type="saved",
            occurred_at=datetime.now(timezone.utc),
            snapshot_hash="a" * 64,
        )
    )
    first.flush()

    second = SqliteStore(str(database_path))
    assert len(second.meal_plan_events) == 1
    assert second.meal_plan_events[0].plan_id == "meal-1"
    assert second.meal_plan_events[0].snapshot_hash == "a" * 64
