from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event, Thread

from app.auth import reset_workspace, set_workspace_id
from app.main import (
    CommitTransactionRecord,
    DateAssertion,
    FoodProductInfoSnapshot,
    GrocyLocationMappingResponse,
    GrocyOutboxRecord,
    GrocyProductMappingAuditEvent,
    GrocyProductMappingResponse,
    MealIngredientResponse,
    MealPlanAuditEventResponse,
    MealPlanResponse,
    ManualFoodOperationRecord,
    MultiDayMealPlanDayResponse,
    MultiDayMealPlanResponse,
    MealPreferences,
    ProductProvenance,
    ShoppingListItemResponse,
    ShoppingListReceiveOperation,
    ShoppingListSourceResponse,
    ReceiptDraftResponse,
    ReceiptLineDraft,
    SqliteStore,
    WorkspaceStoreRouter,
    _ReceiptRecord,
)
from app.recipe_catalog import RecipeCatalogMutation, RecipeDraftIngredient, RecipeDraftRecord, RecipeReviewAuditEvent, SharedRecipeCatalogStore
from app.grocy_worker import GrocyWorkerHeartbeatRecord
from app.notifications import NotificationPreferences, PushSubscriptionRequest, push_endpoint_fingerprint


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


def test_sqlite_store_persists_opened_at_across_repository_reconstruction(tmp_path: Path) -> None:
    database_path = tmp_path / "opened-at.db"
    opened_at = datetime(2026, 9, 3, 12, 30, tzinfo=timezone.utc)
    first = SqliteStore(str(database_path))
    first.foods["tofu-1"].response.opened = True
    first.foods["tofu-1"].response.opened_at = opened_at
    first.flush()

    second = SqliteStore(str(database_path))
    assert second.foods["tofu-1"].response.opened_at == opened_at


def test_sqlite_store_persists_product_candidate_provenance_across_repository_reconstruction(tmp_path: Path) -> None:
    database_path = tmp_path / "product-provenance.db"
    first = SqliteStore(str(database_path))
    first.foods["tofu-1"].response.product_provenance = ProductProvenance(
        source="open_food_facts",
        source_url="https://world.openfoodfacts.org/product/8801045426204",
        confidence=0.62,
        note="공개 상품 후보; 개별 라벨 확인 필요",
        storage_hint=None,
        source_freshness="current",
    )
    first.foods["tofu-1"].response.date_assertion = DateAssertion(
        kind="use_by",
        value=datetime(2026, 9, 12, tzinfo=timezone.utc).date(),
        display_label="2026-09-12",
        source="label_ocr",
        source_detail="라벨 확인",
        confidence=1.0,
        user_confirmed=True,
        applicable_storage_type="ambient",
        storage_condition_text="실온 보관",
    )
    first.record_product_provenance_audit(
        food_id="tofu-1",
        before=None,
        after=first.foods["tofu-1"].response.product_provenance,
        reason="sqlite fixture",
    )
    first.flush()

    second = SqliteStore(str(database_path))
    provenance = second.foods["tofu-1"].response.product_provenance
    assert provenance is not None
    assert provenance.source == "open_food_facts"
    assert provenance.confidence == 0.62
    assert provenance.source_freshness == "current"
    assert second.foods["tofu-1"].response.date_assertion.kind == "use_by"
    assert second.foods["tofu-1"].response.date_assertion.applicable_storage_type == "ambient"
    assert second.foods["tofu-1"].response.date_assertion.storage_condition_text == "실온 보관"
    events = second.list_product_provenance_audit_events("tofu-1")
    assert len(events) == 1
    assert events[0].action == "applied"
    before_info = FoodProductInfoSnapshot(
        canonical_name=second.foods["tofu-1"].response.canonical_name,
        display_name=second.foods["tofu-1"].response.display_name,
        brand=second.foods["tofu-1"].response.brand,
        category=second.foods["tofu-1"].response.category,
        product_provenance=provenance,
    )
    second.foods["tofu-1"].response.canonical_name = "확인한 두부"
    second.foods["tofu-1"].response.display_name = "확인한 두부"
    second.foods["tofu-1"].response.product_provenance = None
    after_info = FoodProductInfoSnapshot(
        canonical_name="확인한 두부",
        display_name="확인한 두부",
        brand=second.foods["tofu-1"].response.brand,
        category=second.foods["tofu-1"].response.category,
        product_provenance=None,
    )
    second.record_product_provenance_audit(
        food_id="tofu-1",
        before=provenance,
        after=None,
        reason="sqlite correction",
    )
    second.record_product_info_audit(
        food_id="tofu-1",
        before=before_info,
        after=after_info,
        reason="sqlite correction",
    )
    second.flush()
    third = SqliteStore(str(database_path))
    assert len(third.list_product_provenance_audit_events("tofu-1")) == 2
    info_events = third.list_product_info_audit_events("tofu-1")
    assert len(info_events) == 1
    assert info_events[0].after.canonical_name == "확인한 두부"


def test_sqlite_store_persists_product_aliases(tmp_path: Path) -> None:
    database_path = tmp_path / "product-aliases.db"
    first = SqliteStore(str(database_path), seed=False)
    first.upsert_product_alias(raw_name="서울우유1L", canonical_name="서울우유 나100% 1L")
    first.upsert_product_alias(raw_name="서울우유1L", canonical_name="서울우유 나100% 1L")

    second = SqliteStore(str(database_path), seed=False)
    aliases = second.list_product_aliases("서울우유")

    assert aliases[0].raw_name_key == "서울우유1l"
    assert aliases[0].canonical_name == "서울우유 나100% 1L"
    assert aliases[0].use_count == 2
    assert second.product_alias_map()["서울우유1l"] == "서울우유 나100% 1L"


def test_sqlite_store_persists_receipt_privacy_redaction_without_losing_commit_state(tmp_path: Path) -> None:
    database_path = tmp_path / "receipt-privacy.db"
    first = SqliteStore(str(database_path), seed=False)
    receipt = ReceiptDraftResponse(
        id="receipt-private",
        fingerprint="fingerprint-private",
        status="committed",
        source_filename="private-receipt.jpg",
        purchased_at=datetime(2026, 9, 1, 13, 20, tzinfo=timezone.utc),
        lines=[
            ReceiptLineDraft(
                id="line-1",
                raw_name="맛타리버섯",
                canonical_name="맛타리버섯",
                quantity=2,
                unit="팩",
                storage_suggestion="refrigerated",
                unit_price=None,
                total_price=3980,
                line_type="product",
                match_confidence=0.63,
                review_status="confirmed",
            )
        ],
        stock_created=True,
    )
    first.receipts[receipt.id] = _ReceiptRecord(receipt)
    first.receipts[receipt.id].committed = True
    first.committed_fingerprints.add(receipt.fingerprint)
    first.flush()

    erased = first.privacy_erase_receipt(receipt.id)
    assert erased.status == "redacted_committed"

    second = SqliteStore(str(database_path), seed=False)
    assert second.receipts[receipt.id].committed is True
    assert second.receipts[receipt.id].response.status == "committed"
    assert second.receipts[receipt.id].response.source_filename == "원본 영수증 정보 삭제됨"
    assert second.receipts[receipt.id].response.lines[0].raw_name == "삭제된 OCR 원문"
    assert second.receipt_summaries()[0].source_redacted is True
    assert "fingerprint-private" in second.committed_fingerprints


def test_sqlite_store_persists_notification_preferences_and_push_subscription_summary(tmp_path: Path) -> None:
    database_path = tmp_path / "notification-preferences.db"
    first = SqliteStore(str(database_path), seed=False)
    first.update_meal_preferences(MealPreferences(avoid_allergens=["soy"]), persist=False)
    first.update_notification_preferences(NotificationPreferences(lead_days=5, quiet_hours_start="22:00", quiet_hours_end="07:00"), persist=False)
    subscription = PushSubscriptionRequest(endpoint="https://push.example.test/subscription/sqlite", p256dh="p" * 32, auth="a" * 16)
    first.upsert_push_subscription(subscription, persist=False)
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    assert second.get_meal_preferences().avoid_allergens == ["soy"]
    assert second.get_notification_preferences().lead_days == 5
    assert second.get_notification_preferences().timezone == "Asia/Seoul"
    assert second.get_notification_preferences().quiet_hours_start == "22:00"
    assert second.list_push_subscription_summaries()[0].endpoint_fingerprint == push_endpoint_fingerprint(subscription.endpoint)
    assert "push.example.test" not in second.list_push_subscription_summaries()[0].model_dump_json()


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


def test_sqlite_store_persists_manual_food_operation_for_replay(tmp_path: Path) -> None:
    database_path = tmp_path / "manual-food-idempotency.db"
    first = SqliteStore(str(database_path), seed=False)
    first.manual_food_operations["manual-food-op-1"] = ManualFoodOperationRecord(
        id="manual-food-op-1",
        food_id="food-1",
        lot_action="create",
        idempotency_key_digest="a" * 64,
        request_payload_fingerprint="b" * 64,
        occurred_at=datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc),
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    operation = second.manual_food_operations["manual-food-op-1"]
    assert operation.food_id == "food-1"
    assert operation.lot_action == "create"
    assert operation.idempotency_key_digest == "a" * 64
    assert operation.request_payload_fingerprint == "b" * 64


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


def test_sqlite_store_refresh_keeps_the_previous_read_snapshot_until_reload_finishes(tmp_path: Path) -> None:
    database_path = tmp_path / "atomic-refresh.db"
    store = SqliteStore(str(database_path), seed=False)
    saved = MealPlanResponse(
        id="meal-refresh-1",
        saved_at=datetime.now(timezone.utc),
        recipe_id="spinach-tofu-chicken-bowl",
        planner_version="recipe-planner-v2",
        source="recipe_fixture",
        title="재로드 중에도 보이는 식단",
        minutes=15,
        inventory_ids=[],
        ingredients=[],
        missing_ingredients=[],
        matched_ratio=1,
        score=100,
        reason="기존 읽기 snapshot",
        steps=["확인합니다."],
        safety_note="상태를 확인하세요.",
    )
    store.meal_plans[saved.id] = saved
    store.flush()

    original_connection = store._connection
    reload_started = Event()
    allow_reload = Event()

    class BlockingConnection:
        def execute(self, query, parameters=()):
            if query == "SELECT id, payload FROM meal_plans":
                reload_started.set()
                assert allow_reload.wait(timeout=2), "test reload did not resume"
            return original_connection.execute(query, parameters)

        def __enter__(self):
            return original_connection.__enter__()

        def __exit__(self, exc_type, exc, traceback):
            return original_connection.__exit__(exc_type, exc, traceback)

        def __getattr__(self, name):
            return getattr(original_connection, name)

    store._connection = BlockingConnection()
    errors: list[BaseException] = []

    def refresh() -> None:
        try:
            store.refresh()
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    thread = Thread(target=refresh)
    thread.start()
    assert reload_started.wait(timeout=2)
    assert store.meal_plans[saved.id].title == "재로드 중에도 보이는 식단"
    allow_reload.set()
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert errors == []
    assert store.meal_plans[saved.id].saved_at is not None


def test_sqlite_store_refresh_does_not_drop_a_local_write_during_reload(tmp_path: Path) -> None:
    database_path = tmp_path / "atomic-refresh-write.db"
    store = SqliteStore(str(database_path), seed=False)
    saved = MealPlanResponse(
        id="meal-refresh-write-1",
        saved_at=datetime.now(timezone.utc),
        recipe_id="spinach-tofu-chicken-bowl",
        planner_version="recipe-planner-v2",
        source="recipe_fixture",
        title="재로드 중 저장한 식단",
        minutes=15,
        inventory_ids=[],
        ingredients=[],
        missing_ingredients=[],
        matched_ratio=1,
        score=100,
        reason="reload 중 local write",
        steps=["확인합니다."],
        safety_note="상태를 확인하세요.",
    )

    original_connection = store._connection
    reload_started = Event()
    allow_reload = Event()

    class BlockingConnection:
        def execute(self, query, parameters=()):
            if query == "SELECT id, payload FROM meal_plans":
                reload_started.set()
                assert allow_reload.wait(timeout=2), "test reload did not resume"
            return original_connection.execute(query, parameters)

        def __enter__(self):
            return original_connection.__enter__()

        def __exit__(self, exc_type, exc, traceback):
            return original_connection.__exit__(exc_type, exc, traceback)

        def __getattr__(self, name):
            return getattr(original_connection, name)

    store._connection = BlockingConnection()
    errors: list[BaseException] = []

    def refresh() -> None:
        try:
            store.refresh()
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    thread = Thread(target=refresh)
    thread.start()
    assert reload_started.wait(timeout=2)

    # API mutation routes update the in-memory collection before calling flush.
    store.meal_plans[saved.id] = saved
    allow_reload.set()
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert errors == []
    store.flush()

    reopened = SqliteStore(str(database_path), seed=False)
    assert reopened.meal_plans[saved.id].title == "재로드 중 저장한 식단"


def test_sqlite_store_persists_saved_multi_day_bundle(tmp_path: Path) -> None:
    database_path = tmp_path / "multi-day-meal-plan.db"
    saved_at = datetime.now(timezone.utc)
    first = SqliteStore(str(database_path), seed=False)
    saved = MultiDayMealPlanResponse(
        id="multi-day-1",
        snapshot_hash="b" * 64,
        generated_at=saved_at,
        saved_at=saved_at,
        max_minutes=30,
        inventory_ids=["spinach-1"],
        days=[
            MultiDayMealPlanDayResponse(
                day_index=1,
                plan_date=saved_at.date(),
                status="saved",
                meal_plan_id="meal-day-1",
                plan=MealPlanResponse(
                    id="meal-day-1",
                    snapshot_hash="c" * 64,
                    recipe_id="spinach-tofu-chicken-bowl",
                    planner_version="recipe-planner-v2",
                    source="recipe_fixture",
                    title="시금치 두부 닭가슴살 덮밥",
                    minutes=15,
                    inventory_ids=["spinach-1"],
                    ingredients=[MealIngredientResponse(canonical_name="시금치", amount=1, unit="팩", available=True, available_food_id="spinach-1")],
                    missing_ingredients=[],
                    matched_ratio=1,
                    score=121,
                    reason="현재 식품만으로 만들 수 있어요.",
                    steps=["조리합니다."],
                    safety_note="상태를 확인하세요.",
                ),
            )
        ],
    )
    first.multi_day_meal_plans[saved.id] = saved
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    restored = second.multi_day_meal_plans["multi-day-1"]
    assert restored.snapshot_hash == "b" * 64
    assert restored.saved_at == saved_at
    assert restored.days[0].status == "saved"
    assert restored.days[0].meal_plan_id == "meal-day-1"
    assert restored.days[0].plan.title == "시금치 두부 닭가슴살 덮밥"


def test_sqlite_store_persists_shopping_list_sources_and_checked_state(tmp_path: Path) -> None:
    database_path = tmp_path / "shopping-list.db"
    now = datetime.now(timezone.utc)
    first = SqliteStore(str(database_path), seed=False)
    first.shopping_list["shopping-tofu"] = ShoppingListItemResponse(
        id="shopping-tofu",
        canonical_name="국산콩 두부",
        quantity=3,
        unit="모",
        checked=True,
        sources=[
            ShoppingListSourceResponse(source_type="manual", source_id="manual:shopping-tofu", quantity=1),
            ShoppingListSourceResponse(source_type="meal_plan", source_id="meal-1", quantity=1),
            ShoppingListSourceResponse(source_type="multi_day", source_id="bundle-1", day_index=2, quantity=1),
        ],
        created_at=now,
        updated_at=now,
    )
    first.shopping_receive_operations["shopping-op-1"] = ShoppingListReceiveOperation(
        id="shopping-op-1",
        shopping_item_id="shopping-tofu",
        food_id="shopping-lot-1",
        canonical_name="국산콩 두부",
        unit="모",
        quantity=2,
        storage_type="refrigerated",
        request_fingerprint="a" * 64,
        occurred_at=now,
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    restored = second.shopping_list["shopping-tofu"]
    assert restored.checked is True
    assert restored.quantity == 3
    assert {(source.source_type, source.source_id, source.day_index) for source in restored.sources} == {
        ("manual", "manual:shopping-tofu", None),
        ("meal_plan", "meal-1", None),
        ("multi_day", "bundle-1", 2),
    }
    restored_operation = second.shopping_receive_operations["shopping-op-1"]
    assert restored_operation.shopping_item_id == "shopping-tofu"
    assert restored_operation.food_id == "shopping-lot-1"
    assert restored_operation.quantity == 2
    assert restored_operation.storage_type == "refrigerated"
    assert restored_operation.request_fingerprint == "a" * 64


def test_sqlite_store_persists_meal_preferences(tmp_path: Path) -> None:
    database_path = tmp_path / "meal-preferences.db"
    first = SqliteStore(str(database_path), seed=False)
    first.update_meal_preferences(MealPreferences(avoid_allergens=["soy", "milk"]))

    second = SqliteStore(str(database_path), seed=False)
    assert second.get_meal_preferences().avoid_allergens == ["soy", "milk"]


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


def test_sqlite_store_persists_recipe_review_draft(tmp_path: Path) -> None:
    database_path = tmp_path / "recipe-review.db"
    now = datetime.now(timezone.utc)
    first = SqliteStore(str(database_path), seed=False)
    first.recipe_drafts["draft-1"] = RecipeDraftRecord(
        id="draft-1",
        source_id="cookrcp-1",
        title="검토 대기 레시피",
        ingredients=[
            RecipeDraftIngredient(
                raw_text="시금치 100g",
                parsed_name="시금치",
                parsed_amount=100,
                parsed_unit="g",
            )
        ],
        steps=["상태를 확인합니다."],
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url="https://example.test/cookrcp",
        license="public-api-terms-review-required",
        source_revision="COOKRCP01",
        retrieved_at=now,
        created_at=now,
        updated_at=now,
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    restored = second.recipe_drafts["draft-1"]
    assert restored.status == "pending"
    assert restored.ingredients[0].parsed_name == "시금치"
    assert restored.license == "public-api-terms-review-required"


def test_sqlite_store_persists_recipe_review_audit_event(tmp_path: Path) -> None:
    database_path = tmp_path / "recipe-review-events.db"
    first = SqliteStore(str(database_path), seed=False)
    first.recipe_review_events.append(
        RecipeReviewAuditEvent(
            id="review-event-1",
            draft_id="draft-1",
            action="approved",
            actor_id="account-admin",
            actor_email="admin@example.com",
            occurred_at=datetime.now(timezone.utc),
            before_status="pending",
            after_status="approved",
            changed_fields=["status"],
            draft_snapshot_hash="a" * 64,
        )
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    assert len(second.recipe_review_events) == 1
    assert second.recipe_review_events[0].action == "approved"
    assert second.recipe_review_events[0].actor_email == "admin@example.com"


def test_shared_recipe_catalog_survives_restart_outside_user_workspace(tmp_path: Path) -> None:
    database_path = tmp_path / "shared-recipe-catalog.db"
    base = SqliteStore(str(database_path), seed=False)
    catalog = SharedRecipeCatalogStore(sqlite_connection=base._connection)
    now = datetime.now(timezone.utc)
    draft = RecipeDraftRecord(
        id="shared-draft-1",
        source_id="cookrcp-shared-1",
        title="공용 검토 레시피",
        ingredients=[],
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url="https://example.test/cookrcp",
        license="public-api-terms-review-required",
        source_revision="COOKRCP01",
        retrieved_at=now,
        created_at=now,
        updated_at=now,
        claimed_by="account-recipe-admin",
        claimed_by_email="admin@example.com",
        claimed_at=now,
        claim_expires_at=now + timedelta(hours=1),
    )
    event = RecipeReviewAuditEvent(
        id="shared-review-event-1",
        draft_id="shared-draft-1",
        action="claimed",
        actor_id="recipe-admin",
        occurred_at=now,
        after_status="pending",
        changed_fields=["claimed_by", "claim_expires_at"],
        draft_snapshot_hash="b" * 64,
    )
    RecipeCatalogMutation(catalog).run(
        lambda: (
            catalog.drafts.__setitem__(draft.id, draft),
            catalog.record_recipe_review_event(event, persist=False),
        )
    )

    reopened_base = SqliteStore(str(database_path), seed=False)
    reopened_catalog = SharedRecipeCatalogStore(sqlite_connection=reopened_base._connection)
    assert reopened_catalog.drafts["shared-draft-1"].title == "공용 검토 레시피"
    assert reopened_catalog.drafts["shared-draft-1"].claimed_by_email == "admin@example.com"
    assert reopened_catalog.review_events[0].action == "claimed"


def test_sqlite_store_persists_grocy_mapping_and_outbox(tmp_path: Path) -> None:
    database_path = tmp_path / "grocy-sync.db"
    now = datetime.now(timezone.utc)
    first = SqliteStore(str(database_path), seed=False)
    first.grocy_mappings["곤약"] = GrocyProductMappingResponse(
        canonical_name="곤약",
        grocy_product_id=42,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="account-1",
        updated_by_email="owner@example.com",
        updated_at=now,
    )
    first.grocy_location_mappings["refrigerated"] = GrocyLocationMappingResponse(
        storage_type="refrigerated",
        grocy_location_id=20,
        source="user_confirmed",
        updated_at=now,
    )
    first.grocy_outbox["outbox-1"] = GrocyOutboxRecord(
        id="outbox-1",
        operation="receipt_add",
        aggregate_id="lot-1",
        idempotency_key="receipt:r-1:lot:lot-1",
        canonical_name="곤약",
        grocy_product_id=42,
        quantity=1,
        unit="팩",
        payload={"receipt_id": "r-1"},
        status="pending",
        manual_retry_count=1,
        last_retry_note="운영자 재시도",
        last_retry_at=now,
        created_at=now,
        updated_at=now,
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    assert second.grocy_mappings["곤약"].grocy_product_id == 42
    assert second.grocy_mappings["곤약"].updated_by == "account-1"
    assert second.grocy_mappings["곤약"].updated_by_email == "owner@example.com"
    assert second.grocy_location_mappings["refrigerated"].grocy_location_id == 20
    assert second.grocy_outbox["outbox-1"].status == "pending"
    assert second.grocy_outbox["outbox-1"].manual_retry_count == 1
    assert second.grocy_outbox["outbox-1"].last_retry_note == "운영자 재시도"


def test_sqlite_store_appends_and_reloads_grocy_mapping_audit_event(tmp_path: Path) -> None:
    database_path = tmp_path / "grocy-mapping-audit.db"
    occurred_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    before = GrocyProductMappingResponse(
        canonical_name="닭가슴살",
        grocy_product_id=88,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="account-1",
        updated_by_email="owner@example.com",
        updated_at=occurred_at - timedelta(minutes=1),
    )
    after = before.model_copy(update={"grocy_product_id": 89, "grocy_unit": "개", "updated_at": occurred_at})
    first = SqliteStore(str(database_path), seed=False)
    first.record_grocy_mapping_audit_event(
        GrocyProductMappingAuditEvent(
            id="grocy-mapping-audit-1",
            canonical_name="닭가슴살",
            action="updated",
            actor_id="account-1",
            actor_email="owner@example.com",
            occurred_at=occurred_at,
            before=before,
            after=after,
        ),
        persist=False,
    )
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    events = second.list_grocy_mapping_audit_events()
    assert len(events) == 1
    assert events[0].id == "grocy-mapping-audit-1"
    assert events[0].before is not None
    assert events[0].before.grocy_product_id == 88
    assert events[0].after.grocy_product_id == 89


def test_workspace_router_flushes_mapping_to_the_active_workspace(tmp_path: Path) -> None:
    database_path = tmp_path / "workspace-routing.db"
    base_store = SqliteStore(str(database_path), seed=False)
    router = WorkspaceStoreRouter(base_store)
    router.provision_workspace("account-one", seed=False)
    occurred_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    mapping = GrocyProductMappingResponse(
        canonical_name="곤약",
        grocy_product_id=42,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="account-one",
        updated_at=occurred_at,
    )
    workspace_token = set_workspace_id("account-one")
    try:
        router.grocy_mappings["곤약"] = mapping
        router.flush()
    finally:
        reset_workspace(workspace_token)

    workspace_database_path = database_path.with_name(f"{database_path.stem}.account-one{database_path.suffix}")
    reopened = SqliteStore(str(workspace_database_path), seed=False)
    assert reopened.grocy_mappings["곤약"].grocy_product_id == 42


def test_sqlite_store_persists_notification_read_state(tmp_path: Path) -> None:
    database_path = tmp_path / "notification-read-state.db"
    read_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    first = SqliteStore(str(database_path), seed=False)
    first.mark_notification_read("food-date:milk:use_by:2026-09-02", read_at=read_at, persist=False)
    first.flush()

    second = SqliteStore(str(database_path), seed=False)
    assert second.list_notification_read_states() == {"food-date:milk:use_by:2026-09-02": read_at}


def test_sqlite_store_uses_expiring_workspace_worker_lease(tmp_path: Path) -> None:
    database_path = tmp_path / "grocy-worker-lease.db"
    first = SqliteStore(str(database_path), seed=False)
    acquired_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)

    assert first.acquire_grocy_worker_lease(lease_key="grocy-outbox", worker_id="worker-a", lease_seconds=120, now=acquired_at) is True
    second = SqliteStore(str(database_path), seed=False)
    assert second.acquire_grocy_worker_lease(lease_key="grocy-outbox", worker_id="worker-b", lease_seconds=120, now=acquired_at + timedelta(seconds=30)) is False
    assert second.acquire_grocy_worker_lease(lease_key="grocy-outbox", worker_id="worker-b", lease_seconds=120, now=acquired_at + timedelta(seconds=121)) is True
    assert second.release_grocy_worker_lease(lease_key="grocy-outbox", worker_id="worker-b") is True

    reopened = SqliteStore(str(database_path), seed=False)
    assert reopened.grocy_worker_leases == {}


def test_sqlite_store_reads_worker_heartbeat_after_reconstruction(tmp_path: Path) -> None:
    database_path = tmp_path / "grocy-worker-heartbeat.db"
    first = SqliteStore(str(database_path), seed=False)
    tick_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    first.record_grocy_worker_heartbeat(
        GrocyWorkerHeartbeatRecord(
            workspace_id="demo",
            worker_id="worker-a",
            last_tick_at=tick_at,
            last_success_at=tick_at,
            lease_acquired=True,
            grocy_configured=False,
        )
    )

    second = SqliteStore(str(database_path), seed=False)
    heartbeats = second.list_grocy_worker_heartbeats()

    assert len(heartbeats) == 1
    assert heartbeats[0].worker_id == "worker-a"
    assert heartbeats[0].last_success_at == tick_at
