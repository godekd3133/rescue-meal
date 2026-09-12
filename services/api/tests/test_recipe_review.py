from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

import app.main as main_module
from app.recipe_catalog import RecipeDraftIngredient, RecipeDraftRecord
from app.recipe_importer import COOKRCP_SERVICE_ID, parse_cookrcp_payload


client = TestClient(main_module.app)
REVIEW_TOKEN = "local-review-token"


def setup_function() -> None:
    main_module.store.reset()


def _headers() -> dict[str, str]:
    return {"X-Rescue-Meal-Recipe-Review-Token": REVIEW_TOKEN}


def _claim(draft_id: str, headers: dict[str, str] | None = None):
    response = client.post(f"/api/recipe-review/drafts/{draft_id}/claim", headers=headers or _headers())
    assert response.status_code == 200
    return response


def _register_recipe_admin(monkeypatch, email: str) -> dict[str, str]:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", email)
    registration = client.post(
        "/api/auth/register",
        json={"email": email, "password": "correct-horse-battery"},
    )
    assert registration.status_code == 201
    return {"Authorization": f"Bearer {registration.json()['access_token']}"}


def _source_payload() -> dict:
    return {
        COOKRCP_SERVICE_ID: {
            "total_count": "1",
            "row": [
                {
                    "RCP_SEQ": "review-1",
                    "RCP_NM": "곤약 두유 한 팬 요리",
                    "RCP_PAT2": "일품",
                    "RCP_WAY2": "볶음",
                    "RCP_PARTS_DTLS": "곤약 1팩\n두유 200ml",
                    "MANUAL01": "1. 재료의 상태를 확인합니다.",
                    "MANUAL02": "2. 충분히 가열합니다.",
                    "ATT_FILE_NO_MAIN": "https://example.test/review-recipe.png",
                }
            ],
        }
    }


def _seed_pending_draft(draft_id: str = "recipe-recovery-draft") -> RecipeDraftRecord:
    now = datetime(2026, 9, 2, tzinfo=timezone.utc)
    draft = RecipeDraftRecord(
        id=draft_id,
        source_id=f"cookrcp-{draft_id}",
        title="복구 테스트 레시피",
        ingredients=[
            RecipeDraftIngredient(
                raw_text="곤약 1팩",
                parsed_name="곤약",
                parsed_amount=1,
                parsed_unit="팩",
                canonical_name="곤약",
                canonical_amount=1,
                canonical_unit="팩",
                review_status="approved",
            )
        ],
        steps=["상태를 확인합니다."],
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url="https://example.test/source",
        license="public-api-terms-review-required",
        source_revision="COOKRCP01",
        retrieved_at=now,
        safety_note="상태를 확인하세요.",
        estimated_minutes=10,
        created_at=now,
        updated_at=now,
    )
    main_module.store.recipe_drafts[draft.id] = draft
    main_module.store.flush()
    return draft


def test_recipe_review_routes_require_a_separate_operator_token(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    disabled = client.get("/api/recipe-review/drafts")
    assert disabled.status_code == 503
    assert disabled.json()["detail"]["code"] == "recipe_review_configuration_missing"
    assert disabled.json()["detail"]["retryable"] is False
    assert disabled.json()["detail"]["action"] == "configure_server"

    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    forbidden = client.get("/api/recipe-review/drafts", headers={"X-Rescue-Meal-Recipe-Review-Token": "wrong"})
    assert forbidden.status_code == 403


def test_production_rejects_the_shared_recipe_review_legacy_token(monkeypatch) -> None:
    legacy_token = "legacy-review-token-that-must-not-ship"
    monkeypatch.setenv("RESCUE_MEAL_ENVIRONMENT", "production")
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", legacy_token)

    review = client.get("/api/recipe-review/drafts", headers={"X-Rescue-Meal-Recipe-Review-Token": legacy_token})
    assert review.status_code == 503
    assert review.json()["detail"]["code"] == "recipe_review_legacy_token_disabled"
    assert legacy_token not in review.text

    ready = client.get("/ready")
    assert ready.status_code == 503
    assert ready.json()["detail"]["code"] == "recipe_review_legacy_token_disabled"
    assert legacy_token not in ready.text


def test_recipe_import_rejects_a_reversed_row_range_before_external_fetch(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    response = client.post(
        "/api/recipe-review/drafts/import",
        headers=_headers(),
        json={"start_idx": 20, "end_idx": 1},
    )
    assert response.status_code == 422
    assert "끝 row는 시작 row보다" in str(response.json()["detail"])


def test_recipe_import_requires_source_configuration_with_typed_error(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    monkeypatch.delenv("FOODSAFETY_COOKRCP_API_KEY", raising=False)

    response = client.post(
        "/api/recipe-review/drafts/import",
        headers=_headers(),
        json={"start_idx": 1, "end_idx": 1},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "recipe_import_configuration_missing"
    assert response.json()["detail"]["retryable"] is False
    assert response.json()["detail"]["action"] == "configure_integration"
    assert "FOODSAFETY_COOKRCP_API_KEY" not in response.text


def test_recipe_import_flush_failure_restores_the_shared_draft_queue(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    monkeypatch.setenv("FOODSAFETY_COOKRCP_API_KEY", "test-source-key")

    class FakeCookRcpClient:
        def __init__(self, config) -> None:
            self.config = config

        def fetch(self, **kwargs):
            del kwargs
            return parse_cookrcp_payload(
                _source_payload(),
                retrieved_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
            )

        def close(self) -> None:
            return None

    monkeypatch.setattr(main_module, "CookRcpClient", FakeCookRcpClient)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated recipe catalog persistence outage")

    with patch.object(type(main_module.store._recipe_catalog), "flush", fail_flush):
        response = client.post(
            "/api/recipe-review/drafts/import",
            headers=_headers(),
            json={"start_idx": 1, "end_idx": 1},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "recipe_review_persistence_unavailable"
    assert main_module.store.recipe_drafts == {}
    assert main_module.store.recipe_review_events == []


def test_recipe_review_flush_failure_restores_draft_and_audit_state(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    draft = _seed_pending_draft()
    _claim(draft.id)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated recipe review persistence outage")

    with patch.object(type(main_module.store._recipe_catalog), "flush", fail_flush):
        response = client.patch(
            f"/api/recipe-review/drafts/{draft.id}",
            headers=_headers(),
            json={"title": "변경된 제목", "reviewer_note": "재검토"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "recipe_review_persistence_unavailable"
    assert main_module.store.recipe_drafts[draft.id].title == draft.title
    assert main_module.store.recipe_drafts[draft.id].reviewer_note == draft.reviewer_note
    assert [event.action for event in main_module.store.recipe_review_events] == ["claimed"]


def test_recipe_review_rejects_a_stale_catalog_revision_before_mutating(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    draft = _seed_pending_draft("recipe-stale-revision-draft")
    _claim(draft.id)

    response = client.patch(
        f"/api/recipe-review/drafts/{draft.id}",
        headers={**_headers(), "If-Rescue-Meal-Recipe-Catalog-Revision": "0"},
        json={"title": "stale 변경"},
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["code"] == "recipe_catalog_revision_conflict"
    assert payload["action"] == "reload_and_retry"
    assert payload["current_revision"] == 2
    assert response.headers["x-rescue-meal-recipe-catalog-revision"] == "2"
    assert main_module.store.recipe_drafts[draft.id].title == draft.title
    assert [event.action for event in main_module.store.recipe_review_events] == ["claimed"]


def test_recipe_review_claim_is_required_and_prevents_cross_admin_writes(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    first_email = f"recipe-owner-{uuid4().hex}@example.com"
    second_email = f"recipe-other-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", f"{first_email},{second_email}")
    first_registration = client.post(
        "/api/auth/register",
        json={"email": first_email, "password": "correct-horse-battery"},
    )
    second_registration = client.post(
        "/api/auth/register",
        json={"email": second_email, "password": "correct-horse-battery"},
    )
    assert first_registration.status_code == 201
    assert second_registration.status_code == 201
    first_headers = {"Authorization": f"Bearer {first_registration.json()['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second_registration.json()['access_token']}"}
    draft = _seed_pending_draft("recipe-claim-owner-draft")

    before_claim = client.patch(
        f"/api/recipe-review/drafts/{draft.id}",
        headers=first_headers,
        json={"reviewer_note": "should wait for an explicit claim"},
    )
    assert before_claim.status_code == 409
    assert before_claim.json()["detail"]["code"] == "recipe_review_claim_required"

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated recipe claim persistence outage")

    with patch.object(type(main_module.store._recipe_catalog), "flush", fail_flush):
        claim_failed = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=first_headers)
    assert claim_failed.status_code == 503
    assert claim_failed.json()["detail"]["code"] == "recipe_review_persistence_unavailable"
    assert main_module.store.recipe_drafts[draft.id].claimed_by is None
    assert main_module.store.recipe_review_events == []

    claimed = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=first_headers)
    assert claimed.status_code == 200
    assert claimed.json()["claimed_by_email"] == first_email
    assert claimed.json()["claim_expires_at"] is not None
    same_claim = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=first_headers)
    assert same_claim.status_code == 200
    assert [event["action"] for event in client.get(f"/api/recipe-review/drafts/{draft.id}/events", headers=first_headers).json()] == ["claimed"]

    other_claim = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=second_headers)
    assert other_claim.status_code == 409
    assert other_claim.json()["detail"]["code"] == "recipe_review_claim_conflict"
    assert other_claim.json()["detail"]["owner_email"] == first_email

    other_release = client.post(f"/api/recipe-review/drafts/{draft.id}/release", headers=second_headers)
    assert other_release.status_code == 409
    assert other_release.json()["detail"]["code"] == "recipe_review_claim_conflict"

    released = client.post(f"/api/recipe-review/drafts/{draft.id}/release", headers=first_headers)
    assert released.status_code == 200
    assert released.json()["claimed_by"] is None

    second_claim = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=second_headers)
    assert second_claim.status_code == 200
    assert second_claim.json()["claimed_by_email"] == second_email
    events = client.get(f"/api/recipe-review/drafts/{draft.id}/events", headers=first_headers)
    assert [event["action"] for event in events.json()] == ["claimed", "released", "claimed"]


def test_expired_recipe_review_claim_can_be_recovered_by_another_admin(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    owner_email = f"recipe-expired-owner-{uuid4().hex}@example.com"
    recovery_email = f"recipe-recovery-owner-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", f"{owner_email},{recovery_email}")
    registration = client.post(
        "/api/auth/register",
        json={"email": recovery_email, "password": "correct-horse-battery"},
    )
    assert registration.status_code == 201
    recovery_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    draft = _seed_pending_draft("recipe-expired-claim-draft")
    expired_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    main_module.store.recipe_drafts[draft.id] = draft.model_copy(
        update={
            "claimed_by": "previous-admin-id",
            "claimed_by_email": owner_email,
            "claimed_at": datetime(2026, 8, 31, tzinfo=timezone.utc),
            "claim_expires_at": expired_at,
        }
    )
    main_module.store.flush()

    blocked = client.patch(
        f"/api/recipe-review/drafts/{draft.id}",
        headers=recovery_headers,
        json={"reviewer_note": "claim expired"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "recipe_review_claim_expired"

    recovered = client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=recovery_headers)
    assert recovered.status_code == 200
    assert recovered.json()["claimed_by_email"] == recovery_email
    events = client.get(f"/api/recipe-review/drafts/{draft.id}/events", headers=recovery_headers)
    assert events.status_code == 200
    assert events.json()[-1]["action"] == "claimed"
    assert "expired_claim_reclaimed" in events.json()[-1]["changed_fields"]


def test_recipe_approve_flush_failure_keeps_the_draft_pending(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    draft = _seed_pending_draft("recipe-approve-recovery-draft")
    _claim(draft.id)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated recipe approve persistence outage")

    with patch.object(type(main_module.store._recipe_catalog), "flush", fail_flush):
        response = client.post(
            f"/api/recipe-review/drafts/{draft.id}/approve",
            headers=_headers(),
            json={"license_confirmed": True},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "recipe_review_persistence_unavailable"
    assert main_module.store.recipe_drafts[draft.id].status == "pending"
    assert main_module.store.recipe_drafts[draft.id].approved_at is None
    assert [event.action for event in main_module.store.recipe_review_events] == ["claimed"]


def test_recipe_admin_account_can_review_but_normal_account_cannot(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    admin_email = f"recipe-admin-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", admin_email)

    admin_registration = client.post(
        "/api/auth/register",
        json={"email": admin_email, "password": "correct-horse-battery"},
    )
    assert admin_registration.status_code == 201
    admin_payload = admin_registration.json()
    assert admin_payload["role"] == "recipe_admin"
    assert admin_payload["access_token"].startswith("ra1.")
    admin_headers = {"Authorization": f"Bearer {admin_payload['access_token']}"}
    assert client.get("/api/auth/me", headers=admin_headers).json()["role"] == "recipe_admin"
    assert client.get("/api/recipe-review/drafts", headers=admin_headers).status_code == 200

    user_registration = client.post(
        "/api/auth/register",
        json={"email": f"recipe-user-{uuid4().hex}@example.com", "password": "correct-horse-battery"},
    )
    assert user_registration.status_code == 201
    assert user_registration.json()["role"] == "user"
    user_headers = {"Authorization": f"Bearer {user_registration.json()['access_token']}"}
    assert client.get("/api/recipe-review/drafts", headers=user_headers).status_code == 403


def test_recipe_reviewer_can_edit_but_publisher_only_can_decide(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    reviewer_email = f"recipe-reviewer-{uuid4().hex}@example.com"
    publisher_email = f"recipe-publisher-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", f"{reviewer_email},{publisher_email}")
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS", publisher_email)
    reviewer_registration = client.post(
        "/api/auth/register",
        json={"email": reviewer_email, "password": "correct-horse-battery"},
    )
    publisher_registration = client.post(
        "/api/auth/register",
        json={"email": publisher_email, "password": "correct-horse-battery"},
    )
    assert reviewer_registration.status_code == 201
    assert publisher_registration.status_code == 201
    reviewer_headers = {"Authorization": f"Bearer {reviewer_registration.json()['access_token']}"}
    publisher_headers = {"Authorization": f"Bearer {publisher_registration.json()['access_token']}"}

    reviewer_capabilities = client.get("/api/recipe-review/capabilities", headers=reviewer_headers)
    publisher_capabilities = client.get("/api/recipe-review/capabilities", headers=publisher_headers)
    assert reviewer_capabilities.status_code == 200
    assert reviewer_capabilities.json() == {
        "can_review": True,
        "can_publish": False,
        "publisher_policy": "publisher_allowlist",
        "ownership_enabled": True,
        "actor_type": "account",
    }
    assert publisher_capabilities.status_code == 200
    assert publisher_capabilities.json()["can_publish"] is True

    draft = _seed_pending_draft("recipe-reviewer-publisher-draft")
    assert client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=reviewer_headers).status_code == 200
    edited = client.patch(
        f"/api/recipe-review/drafts/{draft.id}",
        headers=reviewer_headers,
        json={"reviewer_note": "검토자는 수정할 수 있음"},
    )
    assert edited.status_code == 200
    reviewer_approval = client.post(
        f"/api/recipe-review/drafts/{draft.id}/approve",
        headers=reviewer_headers,
        json={"license_confirmed": True},
    )
    assert reviewer_approval.status_code == 403
    assert reviewer_approval.json()["detail"]["code"] == "recipe_review_publish_forbidden"

    assert client.post(f"/api/recipe-review/drafts/{draft.id}/release", headers=reviewer_headers).status_code == 200
    assert client.post(f"/api/recipe-review/drafts/{draft.id}/claim", headers=publisher_headers).status_code == 200
    publisher_approval = client.post(
        f"/api/recipe-review/drafts/{draft.id}/approve",
        headers=publisher_headers,
        json={"license_confirmed": True},
    )
    assert publisher_approval.status_code == 200
    assert publisher_approval.json()["status"] == "approved"


def test_recipe_review_queue_filters_by_current_assignment(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    admin_email = f"recipe-filter-admin-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", admin_email)
    registration = client.post(
        "/api/auth/register",
        json={"email": admin_email, "password": "correct-horse-battery"},
    )
    assert registration.status_code == 201
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    mine = _seed_pending_draft("recipe-filter-mine")
    unassigned = _seed_pending_draft("recipe-filter-unassigned")
    expired = _seed_pending_draft("recipe-filter-expired")
    main_module.store.recipe_drafts[expired.id] = expired.model_copy(
        update={
            "claimed_by": "previous-admin",
            "claimed_by_email": "previous@example.com",
            "claimed_at": datetime.now(timezone.utc) - timedelta(hours=2),
            "claim_expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
        }
    )
    main_module.store.flush()
    assert client.post(f"/api/recipe-review/drafts/{mine.id}/claim", headers=headers).status_code == 200

    all_drafts = client.get("/api/recipe-review/drafts?status=pending&assignment=all", headers=headers)
    mine_drafts = client.get("/api/recipe-review/drafts?status=pending&assignment=mine", headers=headers)
    unassigned_drafts = client.get("/api/recipe-review/drafts?status=pending&assignment=unassigned", headers=headers)
    assert {draft["id"] for draft in all_drafts.json()} == {mine.id, unassigned.id, expired.id}
    assert [draft["id"] for draft in mine_drafts.json()] == [mine.id]
    assert {draft["id"] for draft in unassigned_drafts.json()} == {unassigned.id, expired.id}
    assert all(draft["claimed_by"] is None or draft["id"] == expired.id for draft in unassigned_drafts.json())


def test_recipe_review_revision_probe_returns_current_catalog_revision(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    draft = _seed_pending_draft("recipe-revision-probe")
    response = client.get("/api/recipe-review/revision", headers=_headers())
    assert response.status_code == 200
    assert response.json() == {"revision": 1}
    assert response.headers["x-rescue-meal-recipe-catalog-revision"] == "1"
    assert main_module.store.recipe_drafts[draft.id].status == "pending"


def test_recipe_admin_audit_records_account_actor(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", raising=False)
    admin_email = f"recipe-auditor-{uuid4().hex}@example.com"
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", admin_email)
    registration = client.post(
        "/api/auth/register",
        json={"email": admin_email, "password": "correct-horse-battery"},
    )
    assert registration.status_code == 201
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    now = datetime(2026, 9, 2, tzinfo=timezone.utc)
    main_module.store.recipe_drafts["account-audit-draft"] = RecipeDraftRecord(
        id="account-audit-draft",
        source_id="cookrcp-account-audit",
        title="계정 actor audit 레시피",
        ingredients=[
            RecipeDraftIngredient(
                raw_text="곤약 1팩",
                parsed_name="곤약",
                parsed_amount=1,
                parsed_unit="팩",
                canonical_name="곤약",
                canonical_amount=1,
                canonical_unit="팩",
                review_status="approved",
            )
        ],
        steps=["상태를 확인합니다."],
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url="https://example.test/source",
        license="public-api-terms-review-required",
        source_revision="COOKRCP01",
        retrieved_at=now,
        safety_note="상태를 확인하세요.",
        estimated_minutes=10,
        created_at=now,
        updated_at=now,
    )
    main_module.store.flush()
    _claim("account-audit-draft", headers)

    approved = client.post(
        "/api/recipe-review/drafts/account-audit-draft/approve",
        headers=headers,
        json={"license_confirmed": True},
    )
    assert approved.status_code == 200
    events = client.get("/api/recipe-review/drafts/account-audit-draft/events", headers=headers)
    assert events.status_code == 200
    assert events.json()[-1]["action"] == "approved"
    assert events.json()[-1]["actor_email"] == admin_email
    assert events.json()[-1]["actor_id"] == registration.json()["user_id"]


def test_import_review_approve_and_planner_use_only_approved_recipe(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", REVIEW_TOKEN)
    monkeypatch.setenv("FOODSAFETY_COOKRCP_API_KEY", "test-source-key")

    class FakeCookRcpClient:
        def __init__(self, config) -> None:
            self.config = config

        def fetch(self, **kwargs):
            del kwargs
            return parse_cookrcp_payload(
                _source_payload(),
                retrieved_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
            )

        def close(self) -> None:
            return None

    monkeypatch.setattr(main_module, "CookRcpClient", FakeCookRcpClient)

    imported = client.post(
        "/api/recipe-review/drafts/import",
        headers=_headers(),
        json={"start_idx": 1, "end_idx": 1},
    )
    assert imported.status_code == 200
    import_payload = imported.json()
    assert import_payload["accepted_count"] == 1
    assert import_payload["persisted_count"] == 1
    draft_id = import_payload["draft_ids"][0]

    pending = client.get("/api/recipe-review/drafts?status=pending", headers=_headers())
    assert pending.status_code == 200
    assert pending.json()[0]["id"] == draft_id
    assert pending.json()[0]["ingredients"][0]["review_status"] == "pending"
    _claim(draft_id)

    reviewed = client.patch(
        f"/api/recipe-review/drafts/{draft_id}",
        headers=_headers(),
        json={
            "safety_note": "상태를 확인하고 충분히 가열하세요.",
            "estimated_minutes": 12,
            "reviewer_note": "minutes estimate and source terms checked",
            "ingredients": [
                {"index": 0, "canonical_name": "곤약", "canonical_amount": 1, "canonical_unit": "팩", "review_status": "approved"},
                {"index": 1, "canonical_name": "두유", "canonical_amount": 200, "canonical_unit": "ml", "review_status": "approved"},
            ],
        },
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["safety_note"] == "상태를 확인하고 충분히 가열하세요."
    assert reviewed.json()["estimated_minutes"] == 12

    not_ready = client.post(
        f"/api/recipe-review/drafts/{draft_id}/approve",
        headers=_headers(),
        json={"license_confirmed": False},
    )
    assert not_ready.status_code == 422
    assert "이용조건" in not_ready.json()["detail"]["issues"][0]

    approved = client.post(
        f"/api/recipe-review/drafts/{draft_id}/approve",
        headers=_headers(),
        json={"license_confirmed": True},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["approved_at"] is not None
    assert approved.json()["claimed_by"] is None

    events = client.get(f"/api/recipe-review/drafts/{draft_id}/events", headers=_headers())
    assert events.status_code == 200
    assert [event["action"] for event in events.json()] == ["imported", "claimed", "updated", "approved"]
    assert all(event["actor_id"] == "legacy-review-token" for event in events.json())
    assert all(len(event["draft_snapshot_hash"]) == 64 for event in events.json())

    duplicate = client.post(
        "/api/recipe-review/drafts/import",
        headers=_headers(),
        json={"start_idx": 1, "end_idx": 1},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["persisted_count"] == 0
    assert client.get("/api/recipe-review/drafts?status=approved", headers=_headers()).json()[0]["id"] == draft_id

    main_module.store.foods.clear()
    main_module.store.foods["konjac-1"] = main_module._FoodRecord(
        main_module._seed_foods()[0].model_copy(update={
            "id": "konjac-1",
            "canonical_name": "곤약",
            "display_name": "곤약",
            "brand": "테스트 식품",
            "quantity": 1,
            "unit": "팩",
            "priority": 1,
        })
    )
    main_module.store.foods["soy-milk-1"] = main_module._FoodRecord(
        main_module._seed_foods()[0].model_copy(update={
            "id": "soy-milk-1",
            "canonical_name": "두유",
            "display_name": "두유",
            "brand": "테스트 음료",
            "quantity": 200,
            "unit": "ml",
            "priority": 2,
        })
    )
    preview = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["konjac-1", "soy-milk-1"], "max_minutes": 20},
    )
    assert preview.status_code == 200
    plan = preview.json()
    assert plan["recipe_id"] == f"catalog-{draft_id}"
    assert plan["source"] == "recipe_catalog"
    assert plan["recipe_source_name"] == "식품안전나라 조리식품 레시피 DB"
    assert plan["recipe_source_revision"] == "COOKRCP01"

    user_registration = client.post(
        "/api/auth/register",
        json={"email": f"recipe-consumer-{uuid4().hex}@example.com", "password": "correct-horse-battery"},
    )
    assert user_registration.status_code == 201
    user_headers = {"Authorization": f"Bearer {user_registration.json()['access_token']}"}
    user_food_ids = []
    for name, quantity, unit in (("곤약", 1, "팩"), ("두유", 200, "ml")):
        created_food = client.post(
            "/api/foods",
            headers=user_headers,
            json={"canonical_name": name, "quantity": quantity, "unit": unit, "storage_type": "refrigerated"},
        )
        assert created_food.status_code == 201
        user_food_ids.append(created_food.json()["id"])
    shared_preview = client.post(
        "/api/meal-plans/preview",
        headers=user_headers,
        json={"inventory_ids": user_food_ids, "max_minutes": 20},
    )
    assert shared_preview.status_code == 200
    assert shared_preview.json()["recipe_id"] == f"catalog-{draft_id}"

    cannot_edit = client.patch(
        f"/api/recipe-review/drafts/{draft_id}",
        headers=_headers(),
        json={"reviewer_note": "should not change"},
    )
    assert cannot_edit.status_code == 409
