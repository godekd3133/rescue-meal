from __future__ import annotations

from datetime import date, datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
from threading import RLock
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import (
    AccountRecord,
    AccountRepository,
    DuplicateAccount,
    DEFAULT_WORKSPACE_ID,
    InvalidGuestToken,
    auth_required,
    auth_secret,
    create_account_workspace_id,
    create_guest_workspace_id,
    current_workspace_id,
    issue_guest_token,
    normalize_email,
    PostgresAccountRepository,
    reset_workspace,
    set_workspace_id,
    verify_guest_token,
)
from .barcode import ParsedBarcode, parse_barcode
from .inference import PriorityInferenceRequest, PriorityInferenceResponse, infer_priority
from .grocy import GrocyClient, GrocyConfig, GrocyError
from .pipeline.label_parser import LabelDateCandidate, ParsedLabel, parse_label_text
from .pipeline.image_quality import ImageQualityReport, assess_image_quality
from .pipeline.ocr import OcrRun, PaddleOcrEngine, RemoteOcrEngine
from .pipeline.receipt_parser import ParsedReceipt, parse_receipt_text, parse_receipt_observations
from .product_resolver import ProductLookupResult, resolve_product
from .planner import PlannedRecipe, plan_recipe
from .recipe_importer import COOKRCP_SERVICE_ID, COOKRCP_SOURCE_URL, CookRcpConfig


StorageCode = Literal["ambient", "refrigerated", "frozen"]
DateKind = Literal[
    "production_date",
    "packaging_date",
    "sell_by",
    "use_by",
    "best_before",
    "unknown",
    "estimated_use_first",
    "user_reminder",
]
DateSource = Literal["label_ocr", "gs1", "user_input", "category_rule", "receipt_ocr", "unknown"]
ReceiptStatus = Literal["uploaded", "extracting", "review_required", "confirmed", "committed", "rejected"]
ReviewStatus = Literal["pending", "confirmed", "excluded"]
LineType = Literal["product", "discount", "refund", "subtotal", "payment", "unknown"]
StorageEventType = Literal["moved", "opened", "frozen", "thawed", "consumed", "discarded"]


class DateAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: DateKind
    value: date | None = None
    display_label: str
    source: DateSource
    source_detail: str
    confidence: float = Field(ge=0, le=1)
    user_confirmed: bool = False


class DateAssertionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["use_by", "best_before", "user_reminder"]
    date_value: date
    source_detail: str = Field(default="사용자가 확인한 날짜", min_length=1, max_length=160)


class DateWindow(BaseModel):
    start_date: date
    end_date: date
    basis: str
    confidence: float = Field(ge=0, le=1)
    safety_disclaimer: str = "안전 판정이 아닌 먼저 확인할 순서입니다."


class FoodResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    parent_lot_id: str | None = None
    canonical_name: str
    display_name: str
    brand: str
    quantity: float
    unit: str
    storage_type: StorageCode
    opened: bool
    date_assertion: DateAssertion
    date_assertion_history: list[DateAssertion] = Field(default_factory=list)
    estimated_use_first_window: DateWindow | None = None
    priority: int
    category: str
    image_path: str
    note: str


class DashboardResponse(BaseModel):
    generated_at: datetime
    food_count: int
    rescue_count: int
    rescue_queue: list[FoodResponse]
    inventory: list[FoodResponse]


class GuestSessionResponse(BaseModel):
    mode: Literal["guest"] = "guest"
    workspace_id: str
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class AccountCredentialsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)


class AccountSessionResponse(BaseModel):
    mode: Literal["account"] = "account"
    user_id: str
    email: str
    workspace_id: str
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class AuthMeResponse(BaseModel):
    mode: Literal["guest", "account"]
    user_id: str | None = None
    email: str | None = None
    workspace_id: str


class GrocyStatusResponse(BaseModel):
    configured: bool
    status: Literal["disabled", "ok", "unavailable"]
    version: str | None = None
    detail: str


class RecipeSourceStatusResponse(BaseModel):
    provider: Literal["cookrcp01"] = "cookrcp01"
    service_id: str = COOKRCP_SERVICE_ID
    configured: bool
    status: Literal["disabled", "ready"]
    source_name: str
    source_url: str = COOKRCP_SOURCE_URL
    detail: str


class ReceiptLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_name: str = Field(min_length=1, max_length=160)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="개", min_length=1, max_length=30)
    # Discounts and refunds are represented as negative amounts, so prices are
    # intentionally not constrained to non-negative values at this layer.
    unit_price: int | None = None
    total_price: int | None = None
    line_type: LineType = "product"
    canonical_name: str | None = Field(default=None, max_length=160)
    match_confidence: float = Field(default=0, ge=0, le=1)


class ReceiptDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_filename: str = Field(min_length=1, max_length=255)
    purchased_at: datetime | None = None
    lines: list[ReceiptLineInput] = Field(min_length=1, max_length=200)


class ReceiptLineDraft(BaseModel):
    id: str
    raw_name: str
    canonical_name: str | None
    quantity: float
    unit: str
    unit_price: int | None
    total_price: int | None
    line_type: LineType
    match_confidence: float
    review_status: ReviewStatus
    review_reason: str | None = None


class ReceiptDraftResponse(BaseModel):
    id: str
    fingerprint: str
    status: ReceiptStatus
    source_filename: str
    purchased_at: datetime | None
    lines: list[ReceiptLineDraft]
    stock_created: bool = False


class ReceiptLineOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str | None = Field(default=None, max_length=160)
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)


class ReceiptCommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmed_line_ids: list[str] = Field(min_length=1, max_length=200)
    overrides: dict[str, ReceiptLineOverride] = Field(default_factory=dict)


class ReceiptCommitResponse(BaseModel):
    receipt_id: str
    status: Literal["committed"]
    commit_transaction_id: str
    created_lot_ids: list[str]
    skipped_line_ids: list[str]
    inventory: list[FoodResponse]


class CommitTransactionRecord(BaseModel):
    id: str
    receipt_id: str
    fingerprint: str
    status: Literal["pending", "committed", "needs_reconciliation", "rolled_back"]
    error_code: str | None = None


class StorageEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: StorageEventType
    to_storage_type: StorageCode | None = None
    quantity: float | None = Field(default=None, gt=0)


class StorageEventResponse(BaseModel):
    id: str
    food_id: str
    event_type: StorageEventType
    from_storage_type: StorageCode | None
    to_storage_type: StorageCode | None
    quantity: float | None
    occurred_at: datetime
    source: Literal["user_input"] = "user_input"
    created_child_food_id: str | None = None
    meal_plan_id: str | None = None


class MealPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_ids: list[str] = Field(default_factory=list, max_length=20)
    max_minutes: int = Field(default=30, ge=5, le=180)
    plan_id: str | None = Field(default=None, min_length=1, max_length=96)
    snapshot_hash: str | None = Field(default=None, min_length=16, max_length=128)


class MealIngredientAllocationResponse(BaseModel):
    food_id: str
    quantity: float
    unit: str = "개"


class MealIngredientResponse(BaseModel):
    canonical_name: str
    amount: float
    unit: str
    available: bool
    available_food_id: str | None = None
    available_quantity: float | None = None
    available_unit: str | None = None
    match_type: Literal["exact", "alias", "none"] = "none"
    allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)


class MealPlanResponse(BaseModel):
    id: str
    snapshot_hash: str = ""
    saved_at: datetime | None = None
    completed_at: datetime | None = None
    consumed_food_ids: list[str] = Field(default_factory=list)
    completed_skipped_ingredients: list[str] = Field(default_factory=list)
    consumed_allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)
    recipe_id: str
    planner_version: str
    source: str
    title: str
    minutes: int
    max_minutes: int = 30
    inventory_ids: list[str]
    ingredients: list[MealIngredientResponse]
    missing_ingredients: list[str]
    matched_ratio: float
    score: float
    reason: str
    steps: list[str]
    safety_note: str
    recipe_source_name: str = "unknown"
    recipe_source_url: str | None = None
    recipe_license: str = "unknown"
    recipe_source_revision: str = "unknown"


class MealPlanSkippedIngredientResponse(BaseModel):
    canonical_name: str
    food_id: str | None = None
    reason: str


class MealPlanConsumptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food_id: str = Field(min_length=1, max_length=96)
    quantity: float = Field(ge=0)


class MealPlanCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # None keeps the recipe's default allocations. An explicit list lets the
    # user reduce or zero individual lot quantities before completion.
    consumptions: list[MealPlanConsumptionRequest] | None = Field(default=None, max_length=100)


class MealPlanCompletionResponse(BaseModel):
    plan_id: str
    status: Literal["completed", "already_completed"]
    completed_at: datetime
    consumed_food_ids: list[str]
    consumed_allocations: list[MealIngredientAllocationResponse]
    skipped_ingredients: list[MealPlanSkippedIngredientResponse]


class MealPlanAuditEventResponse(BaseModel):
    id: str
    plan_id: str
    event_type: Literal["saved", "completed"]
    occurred_at: datetime
    snapshot_hash: str
    consumed_allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)
    skipped_ingredients: list[str] = Field(default_factory=list)


class BarcodeProductResponse(BaseModel):
    barcode: str
    match_status: Literal["matched", "not_found"]
    canonical_name: str | None = None
    brand: str | None = None
    category: str | None = None
    lookup_source: Literal["local_fixture", "none"]
    requires_label_confirmation: bool = True


class BarcodeParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_scan: str = Field(min_length=1, max_length=300)


class BarcodeDateAssertionResponse(BaseModel):
    kind: str
    value: date
    ai: str
    confidence: float


class BarcodeParseResponse(BaseModel):
    raw_scan: str
    barcode_type: str
    gtin: str | None
    lot: str | None
    date_assertions: list[BarcodeDateAssertionResponse]
    warnings: list[str]
    requires_review: bool


class ProductCandidateResponse(BaseModel):
    source: str
    source_url: str | None
    canonical_name: str
    brand: str | None
    category: str | None
    quantity_text: str | None
    confidence: float
    provenance_note: str


class ProductLookupResponse(BaseModel):
    barcode: str
    status: Literal["matched", "partial", "not_found", "provider_unavailable"]
    candidates: list[ProductCandidateResponse]
    warnings: list[str]
    requires_review: bool


class ManualFoodRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="개", min_length=1, max_length=30)
    storage_type: StorageCode = "refrigerated"
    category: str = Field(default="기타", max_length=80)
    note: str = Field(default="날짜와 보관 방법을 확인해 주세요.", max_length=300)
    brand: str = Field(default="직접 추가한 식품", max_length=160)
    image_path: str = Field(default="/assets/food/tomato.png", max_length=300)
    date_kind: DateKind = "unknown"
    date_value: date | None = None
    date_source: DateSource = "unknown"
    date_source_detail: str = Field(default="사용자 입력 대기", max_length=160)
    user_confirmed: bool = False


class ReceiptTextParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_filename: str = Field(default="ocr-text.txt", min_length=1, max_length=255)
    purchased_at: datetime | None = None
    ocr_text: str = Field(min_length=1, max_length=100_000)


class ReceiptTextParseResponse(BaseModel):
    kind: str
    warnings: list[str]
    draft: ReceiptDraftResponse


class ImageQualityResponse(BaseModel):
    status: Literal["pass", "review_required", "reject"]
    width: int | None
    height: int | None
    format: str | None
    brightness: float | None
    contrast: float | None
    edge_energy: float | None
    warnings: list[str]


class OcrIntakeResponse(BaseModel):
    status: Literal["review_required", "needs_ocr_engine", "failed"]
    source_filename: str
    file_sha256: str
    engine: str
    model_version: str | None
    observations_count: int
    message: str
    quality: ImageQualityResponse
    receipt_kind: str | None = None
    draft: ReceiptDraftResponse | None = None


class LabelDateCandidateResponse(BaseModel):
    kind: str
    value: date
    raw_text: str
    confidence: float
    requires_review: bool
    context: str


class LabelParseResponse(BaseModel):
    status: Literal["review_required", "needs_ocr_engine", "failed"]
    source_filename: str
    file_sha256: str | None
    engine: str
    model_version: str | None
    observations_count: int
    product_name: str | None
    barcode: str | None
    storage_hint: str
    date_candidates: list[LabelDateCandidateResponse]
    consumption_date_candidate: LabelDateCandidateResponse | None
    warnings: list[str]
    requires_review: bool
    quality: ImageQualityResponse | None = None


class _FoodRecord:
    def __init__(self, response: FoodResponse, *, purchased_at: datetime | None = None) -> None:
        self.response = response
        self.purchased_at = purchased_at


class _ReceiptRecord:
    def __init__(self, response: ReceiptDraftResponse) -> None:
        self.response = response
        self.committed = False


class InMemoryStore:
    """Small deterministic repository used by the local MVP and API tests.

    The production replacement is PostgreSQL + Grocy. The public models already
    carry the provenance fields needed for that adapter, so no endpoint should
    depend on this storage implementation.
    """

    def __init__(self, *, seed: bool = True) -> None:
        self.backend_name = "in-memory-mvp"
        self._seed_enabled = seed
        self.foods: dict[str, _FoodRecord] = {}
        self.receipts: dict[str, _ReceiptRecord] = {}
        self.committed_fingerprints: set[str] = set()
        self.storage_events: list[StorageEventResponse] = []
        self.commit_transactions: dict[str, CommitTransactionRecord] = {}
        self.meal_plans: dict[str, MealPlanResponse] = {}
        self.meal_plan_events: list[MealPlanAuditEventResponse] = []
        self.reset()

    def reset(self) -> None:
        self.foods.clear()
        self.receipts.clear()
        self.committed_fingerprints.clear()
        self.storage_events.clear()
        self.commit_transactions.clear()
        self.meal_plans.clear()
        self.meal_plan_events.clear()
        if self._seed_enabled:
            for food in _seed_foods():
                self.foods[food.id] = _FoodRecord(food)

    def dashboard(self) -> DashboardResponse:
        foods = self._sorted_foods()
        rescue = [food.response for food in foods if food.response.priority <= 3]
        return DashboardResponse(
            generated_at=datetime.now(timezone.utc),
            food_count=len(foods),
            rescue_count=len(rescue),
            rescue_queue=rescue,
            inventory=[food.response for food in foods],
        )

    def _sorted_foods(self) -> list[_FoodRecord]:
        return sorted(self.foods.values(), key=lambda item: (item.response.priority, item.response.display_name))

    def reprioritize(self) -> None:
        for index, record in enumerate(self._sorted_foods(), start=1):
            record.response.priority = index

    def flush(self) -> None:
        """Persist pending in-memory mutations when a durable adapter exists."""

    def snapshot(self) -> tuple[dict[str, _FoodRecord], dict[str, _ReceiptRecord], set[str], list[StorageEventResponse], list[MealPlanAuditEventResponse]]:
        return (
            {
                food_id: _FoodRecord(record.response.model_copy(deep=True), purchased_at=record.purchased_at)
                for food_id, record in self.foods.items()
            },
            {
                receipt_id: _receipt_snapshot(record)
                for receipt_id, record in self.receipts.items()
            },
            set(self.committed_fingerprints),
            [event.model_copy(deep=True) for event in self.storage_events],
            [event.model_copy(deep=True) for event in self.meal_plan_events],
        )

    def restore(self, snapshot: tuple[dict[str, _FoodRecord], dict[str, _ReceiptRecord], set[str], list[StorageEventResponse], list[MealPlanAuditEventResponse]]) -> None:
        foods, receipts, fingerprints, events, meal_plan_events = snapshot
        self.foods = foods
        self.receipts = receipts
        self.committed_fingerprints = fingerprints
        self.storage_events = events
        self.meal_plan_events = meal_plan_events

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
    ) -> str:
        canonical_name = (override.canonical_name if override and override.canonical_name else line.canonical_name) or _normalize_product_name(line.raw_name)
        quantity = override.quantity if override and override.quantity is not None else line.quantity
        unit = override.unit if override and override.unit else line.unit
        incoming = _receipt_food(canonical_name, quantity, unit, line.match_confidence, purchased_at)
        existing = next((record for record in self.foods.values() if record.response.canonical_name == incoming.canonical_name), None)
        if existing is not None:
            trusted_existing = existing.response.date_assertion.kind in {"use_by", "best_before"}
            if trusted_existing and incoming.date_assertion.kind == "unknown":
                incoming.date_assertion = existing.response.date_assertion
                incoming.estimated_use_first_window = existing.response.estimated_use_first_window
                incoming.note = existing.response.note
            incoming.id = existing.response.id
            incoming.priority = existing.response.priority
            incoming.storage_type = existing.response.storage_type
            incoming.opened = existing.response.opened
            self.foods[existing.response.id] = _FoodRecord(incoming, purchased_at=purchased_at)
            lot_id = f"lot-{existing.response.id}"
        else:
            lot_id = f"lot-{incoming.id}"
            self.foods[incoming.id] = _FoodRecord(incoming, purchased_at=purchased_at)
        return lot_id


def _receipt_snapshot(record: _ReceiptRecord) -> _ReceiptRecord:
    snapshot = _ReceiptRecord(record.response.model_copy(deep=True))
    snapshot.committed = record.committed
    return snapshot


class SqliteStore(InMemoryStore):
    """Durable local repository with the same contract as the MVP store.

    This is a development bridge, not a replacement for the PostgreSQL
    migration. Keeping the API-facing models identical lets local developers
    verify restart persistence before the production database adapter lands.
    """

    def __init__(self, database_path: str, *, seed: bool = True) -> None:
        self.backend_name = "sqlite-local"
        self.database_path = database_path
        self._seed_enabled = seed
        self._lock = RLock()
        self._connection = sqlite3.connect(database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self.foods = {}
        self.receipts = {}
        self.committed_fingerprints = set()
        self.storage_events = []
        self.commit_transactions = {}
        self.meal_plans = {}
        self.meal_plan_events = []
        self._initialize_schema()
        if self._has_rows():
            self._load_all()
        else:
            InMemoryStore.reset(self)
            self._persist_all()

    def _initialize_schema(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS foods (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                committed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS committed_fingerprints (
                fingerprint TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS storage_events (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS commit_transactions (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meal_plans (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meal_plan_events (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            """
        )
        self._connection.commit()

    def _has_rows(self) -> bool:
        for table_name in ("foods", "receipts", "storage_events", "commit_transactions", "meal_plans", "meal_plan_events"):
            row = self._connection.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
            if row and row["count"]:
                return True
        return False

    def _load_all(self) -> None:
        with self._lock:
            self.foods = {}
            self.receipts = {}
            self.committed_fingerprints = {
                row["fingerprint"] for row in self._connection.execute("SELECT fingerprint FROM committed_fingerprints")
            }
            self.storage_events = []
            self.commit_transactions = {}
            self.meal_plans = {}
            self.meal_plan_events = []
            for row in self._connection.execute("SELECT id, payload FROM foods"):
                self.foods[row["id"]] = _FoodRecord(FoodResponse.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT id, payload, committed FROM receipts"):
                record = _ReceiptRecord(ReceiptDraftResponse.model_validate(json.loads(row["payload"])))
                record.committed = bool(row["committed"])
                self.receipts[row["id"]] = record
            for row in self._connection.execute("SELECT id, payload FROM storage_events"):
                self.storage_events.append(StorageEventResponse.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT id, payload FROM commit_transactions"):
                self.commit_transactions[row["id"]] = CommitTransactionRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM meal_plans"):
                self.meal_plans[row["id"]] = MealPlanResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM meal_plan_events"):
                self.meal_plan_events.append(MealPlanAuditEventResponse.model_validate(json.loads(row["payload"])))

    def _persist_all(self) -> None:
        with self._lock:
            with self._connection:
                self._connection.execute("DELETE FROM foods")
                self._connection.execute("DELETE FROM receipts")
                self._connection.execute("DELETE FROM committed_fingerprints")
                self._connection.execute("DELETE FROM storage_events")
                self._connection.execute("DELETE FROM commit_transactions")
                self._connection.execute("DELETE FROM meal_plans")
                self._connection.execute("DELETE FROM meal_plan_events")
                self._connection.executemany(
                    "INSERT INTO foods (id, payload) VALUES (?, ?)",
                    [(food_id, json.dumps(record.response.model_dump(mode="json"), ensure_ascii=False)) for food_id, record in self.foods.items()],
                )
                self._connection.executemany(
                    "INSERT INTO receipts (id, payload, committed) VALUES (?, ?, ?)",
                    [(receipt_id, json.dumps(record.response.model_dump(mode="json"), ensure_ascii=False), int(record.committed)) for receipt_id, record in self.receipts.items()],
                )
                self._connection.executemany(
                    "INSERT INTO committed_fingerprints (fingerprint) VALUES (?)",
                    [(fingerprint,) for fingerprint in self.committed_fingerprints],
                )
                self._connection.executemany(
                    "INSERT INTO storage_events (id, payload) VALUES (?, ?)",
                    [(event.id, json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.storage_events],
                )
                self._connection.executemany(
                    "INSERT INTO commit_transactions (id, payload) VALUES (?, ?)",
                    [(transaction_id, json.dumps(transaction.model_dump(mode="json"), ensure_ascii=False)) for transaction_id, transaction in self.commit_transactions.items()],
                )
                self._connection.executemany(
                    "INSERT INTO meal_plans (id, payload) VALUES (?, ?)",
                    [(plan_id, json.dumps(plan.model_dump(mode="json"), ensure_ascii=False)) for plan_id, plan in self.meal_plans.items()],
                )
                self._connection.executemany(
                    "INSERT INTO meal_plan_events (id, payload) VALUES (?, ?)",
                    [(event.id, json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.meal_plan_events],
                )

    def flush(self) -> None:
        self._persist_all()

    def reset(self) -> None:
        InMemoryStore.reset(self)
        self._persist_all()

    def reprioritize(self) -> None:
        InMemoryStore.reprioritize(self)
        self._persist_all()

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
    ) -> str:
        lot_id = InMemoryStore.upsert_from_receipt(self, line=line, purchased_at=purchased_at, override=override)
        self._persist_all()
        return lot_id


class PostgresStore(InMemoryStore):
    """PostgreSQL-backed bridge for the current API projection.

    The normalized domain tables are created by the checked-in migration. This
    first adapter persists the same API-facing JSON models in projection tables
    so the UI can migrate without a breaking response change. Domain-table
    read/write mapping is the next production hardening step.
    """

    def __init__(self, database_url: str, *, workspace_id: str = DEFAULT_WORKSPACE_ID, seed: bool = True, connection=None) -> None:
        self.backend_name = "postgresql-projection"
        self.database_url = database_url
        self.workspace_id = workspace_id
        self._seed_enabled = seed
        self._lock = RLock()
        if connection is not None:
            self._connection = connection
        else:
            try:
                import psycopg
            except ImportError as exc:  # pragma: no cover - dependency is installed in normal sync
                raise RuntimeError("PostgreSQL 모드에는 psycopg가 필요합니다.") from exc
            try:
                self._connection = psycopg.connect(database_url)
            except Exception as exc:  # pragma: no cover - requires external PostgreSQL
                raise RuntimeError(f"PostgreSQL 연결에 실패했습니다: {exc.__class__.__name__}") from exc
        self.foods = {}
        self.receipts = {}
        self.committed_fingerprints = set()
        self.storage_events = []
        self.commit_transactions = {}
        self.meal_plans = {}
        self.meal_plan_events = []
        self._initialize_schema()
        if self._has_rows():
            self._load_all()
        else:
            InMemoryStore.reset(self)
            self._persist_all()

    def _initialize_schema(self) -> None:
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CREATE TABLE IF NOT EXISTS rescue_api_foods (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_receipts (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            committed boolean NOT NULL DEFAULT false,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_fingerprints (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            fingerprint text NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, fingerprint)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_storage_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_commit_transactions (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_meal_plans (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_meal_plan_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_receipts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_fingerprints ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_storage_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_commit_transactions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_meal_plans ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_meal_plan_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_foods DROP CONSTRAINT IF EXISTS rescue_api_foods_pkey;
                        ALTER TABLE rescue_api_receipts DROP CONSTRAINT IF EXISTS rescue_api_receipts_pkey;
                        ALTER TABLE rescue_api_fingerprints DROP CONSTRAINT IF EXISTS rescue_api_fingerprints_pkey;
                        ALTER TABLE rescue_api_storage_events DROP CONSTRAINT IF EXISTS rescue_api_storage_events_pkey;
                        ALTER TABLE rescue_api_commit_transactions DROP CONSTRAINT IF EXISTS rescue_api_commit_transactions_pkey;
                        ALTER TABLE rescue_api_meal_plans DROP CONSTRAINT IF EXISTS rescue_api_meal_plans_pkey;
                        ALTER TABLE rescue_api_meal_plan_events DROP CONSTRAINT IF EXISTS rescue_api_meal_plan_events_pkey;
                        ALTER TABLE rescue_api_foods ADD CONSTRAINT rescue_api_foods_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_receipts ADD CONSTRAINT rescue_api_receipts_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_fingerprints ADD CONSTRAINT rescue_api_fingerprints_pkey PRIMARY KEY (workspace_id, fingerprint);
                        ALTER TABLE rescue_api_storage_events ADD CONSTRAINT rescue_api_storage_events_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_commit_transactions ADD CONSTRAINT rescue_api_commit_transactions_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_meal_plans ADD CONSTRAINT rescue_api_meal_plans_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_meal_plan_events ADD CONSTRAINT rescue_api_meal_plan_events_pkey PRIMARY KEY (workspace_id, id);
                        """
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def _has_rows(self) -> bool:
        with self._lock:
            with self._connection.cursor() as cursor:
                for table_name in (
                    "rescue_api_foods",
                    "rescue_api_receipts",
                    "rescue_api_storage_events",
                    "rescue_api_commit_transactions",
                    "rescue_api_meal_plans",
                    "rescue_api_meal_plan_events",
                ):
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE workspace_id = %s", (self.workspace_id,))
                    row = cursor.fetchone()
                    if row and row[0]:
                        return True
        return False

    def _load_all(self) -> None:
        with self._lock:
            self.foods = {}
            self.receipts = {}
            self.committed_fingerprints = set()
            self.storage_events = []
            self.commit_transactions = {}
            self.meal_plan_events = []
            with self._connection.cursor() as cursor:
                cursor.execute("SELECT id, payload FROM rescue_api_foods WHERE workspace_id = %s", (self.workspace_id,))
                for food_id, payload in cursor.fetchall():
                    self.foods[food_id] = _FoodRecord(FoodResponse.model_validate(_json_payload(payload)))
                cursor.execute("SELECT id, payload, committed FROM rescue_api_receipts WHERE workspace_id = %s", (self.workspace_id,))
                for receipt_id, payload, committed in cursor.fetchall():
                    record = _ReceiptRecord(ReceiptDraftResponse.model_validate(_json_payload(payload)))
                    record.committed = bool(committed)
                    self.receipts[receipt_id] = record
                cursor.execute("SELECT fingerprint FROM rescue_api_fingerprints WHERE workspace_id = %s", (self.workspace_id,))
                self.committed_fingerprints = {row[0] for row in cursor.fetchall()}
                cursor.execute("SELECT id, payload FROM rescue_api_storage_events WHERE workspace_id = %s", (self.workspace_id,))
                self.storage_events = [StorageEventResponse.model_validate(_json_payload(payload)) for _, payload in cursor.fetchall()]
                cursor.execute("SELECT id, payload FROM rescue_api_commit_transactions WHERE workspace_id = %s", (self.workspace_id,))
                self.commit_transactions = {
                    transaction_id: CommitTransactionRecord.model_validate(_json_payload(payload))
                    for transaction_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_meal_plans WHERE workspace_id = %s", (self.workspace_id,))
                self.meal_plans = {
                    plan_id: MealPlanResponse.model_validate(_json_payload(payload))
                    for plan_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_meal_plan_events WHERE workspace_id = %s", (self.workspace_id,))
                self.meal_plan_events = [
                    MealPlanAuditEventResponse.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]

    def _persist_all(self) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute("DELETE FROM rescue_api_foods WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_receipts WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_fingerprints WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_storage_events WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_commit_transactions WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_meal_plans WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_meal_plan_events WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.executemany(
                        "INSERT INTO rescue_api_foods (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, food_id, Jsonb(record.response.model_dump(mode="json"))) for food_id, record in self.foods.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_receipts (workspace_id, id, payload, committed) VALUES (%s, %s, %s, %s)",
                        [(self.workspace_id, receipt_id, Jsonb(record.response.model_dump(mode="json")), record.committed) for receipt_id, record in self.receipts.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_fingerprints (workspace_id, fingerprint) VALUES (%s, %s)",
                        [(self.workspace_id, fingerprint) for fingerprint in self.committed_fingerprints],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_storage_events (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, event.id, Jsonb(event.model_dump(mode="json"))) for event in self.storage_events],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_commit_transactions (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, transaction_id, Jsonb(transaction.model_dump(mode="json"))) for transaction_id, transaction in self.commit_transactions.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_meal_plans (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, plan_id, Jsonb(plan.model_dump(mode="json"))) for plan_id, plan in self.meal_plans.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_meal_plan_events (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, event.id, Jsonb(event.model_dump(mode="json"))) for event in self.meal_plan_events],
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def flush(self) -> None:
        self._persist_all()

    def reset(self) -> None:
        InMemoryStore.reset(self)
        self._persist_all()

    def reprioritize(self) -> None:
        InMemoryStore.reprioritize(self)
        self._persist_all()

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
    ) -> str:
        lot_id = InMemoryStore.upsert_from_receipt(self, line=line, purchased_at=purchased_at, override=override)
        self._persist_all()
        return lot_id


class WorkspaceStoreRouter:
    """Route each verified workspace to an isolated local repository.

    SQLite workspaces use sibling database files and Postgres workspaces use a
    workspace key in every API projection row, so a guest can survive an API
    restart without sharing another user's food rows.
    """

    def __init__(self, base_store: InMemoryStore) -> None:
        self._base_store = base_store
        self._stores: dict[str, InMemoryStore] = {DEFAULT_WORKSPACE_ID: base_store}
        self._lock = RLock()

    def _workspace_store(self, workspace_id: str, *, seed: bool = True) -> InMemoryStore:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
            raise ValueError("invalid workspace id")
        with self._lock:
            existing = self._stores.get(workspace_id)
            if existing is not None:
                return existing
            if isinstance(self._base_store, PostgresStore):
                workspace_store = PostgresStore(
                    self._base_store.database_url,
                    workspace_id=workspace_id,
                    seed=seed,
                )
            elif isinstance(self._base_store, SqliteStore):
                base_path = Path(self._base_store.database_path)
                if str(base_path) == ":memory:":
                    workspace_store = InMemoryStore(seed=seed)
                else:
                    workspace_store_path = base_path.with_name(
                        f"{base_path.stem}.{workspace_id}{base_path.suffix or '.db'}"
                    )
                    workspace_store = SqliteStore(str(workspace_store_path), seed=seed)
            else:
                workspace_store = InMemoryStore(seed=seed)
            self._stores[workspace_id] = workspace_store
            return workspace_store

    def provision_workspace(self, workspace_id: str, *, seed: bool = True) -> None:
        self._workspace_store(workspace_id, seed=seed)

    @property
    def workspace_ids(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._stores.keys())

    def __getattr__(self, name: str):
        return getattr(self._workspace_store(current_workspace_id()), name)

    def __setattr__(self, name: str, value) -> None:
        if name.startswith("_"):
            object.__setattr__(self, name, value)
            return
        setattr(self._workspace_store(current_workspace_id()), name, value)


def _json_payload(payload: object) -> object:
    return payload if isinstance(payload, (dict, list)) else json.loads(str(payload))


def _seed_foods() -> list[FoodResponse]:
    return [
        _food(
            "spinach-1", "시금치", "국내산 시금치", 1, "팩", "refrigerated", "use_by", date(2026, 9, 2), "label_ocr", "포장지 표시", 1, "채소", "/assets/food/spinach.png", "포장지에서 유효년월일을 확인했어요.", opened=True,
        ),
        _food(
            "tofu-1", "국산콩 두부", "풀무원", 1, "모", "refrigerated", "unknown", None, "unknown", "상품 유형 + 보관 방식", 2, "두부·콩", "/assets/food/tofu.png", "실제 소비기한이 아니라 먼저 먹기 위한 추정 순서예요.", estimate=(date(2026, 9, 3), date(2026, 9, 4), 0.72),
        ),
        _food(
            "chicken-1", "닭가슴살", "무항생제 닭가슴살", 2, "팩", "frozen", "user_reminder", date(2026, 9, 6), "user_input", "사용자 입력", 3, "육류", "/assets/food/chicken.png", "사용자가 확인한 날짜를 우선 사용하고 있어요.", confidence=0.9,
        ),
        _food(
            "mushroom-1", "맛타리버섯", "국내산 맛타리", 2, "팩", "refrigerated", "unknown", None, "unknown", "영수증 + 상품 유형", 4, "채소", "/assets/food/mushroom.png", "신선식품은 날짜가 인쇄되지 않을 수 있어 우선순위로만 안내해요.", estimate=(date(2026, 9, 4), date(2026, 9, 5), 0.64), confidence=0.64,
        ),
        _food(
            "egg-1", "동물복지 달걀", "10구", 1, "판", "refrigerated", "use_by", date(2026, 9, 9), "label_ocr", "포장지 표시", 5, "달걀", "/assets/food/eggs.png", "달걀 포장지에 있는 표시 날짜를 기록했어요.",
        ),
        _food(
            "milk-1", "저지방 우유", "900ml", 1, "개", "refrigerated", "unknown", None, "unknown", "영수증 + 상품 유형", 6, "유제품", "/assets/food/milk.png", "개봉 후에는 별도의 사용자 확인이 필요해요.", estimate=(date(2026, 9, 5), date(2026, 9, 6), 0.68), opened=True, confidence=0.68,
        ),
        _food(
            "tomato-1", "대추방울토마토", "국내산", 1, "팩", "ambient", "unknown", None, "unknown", "상품 유형 + 보관 방식", 7, "채소", "/assets/food/tomato.png", "실온 보관 중인 신선식품은 상태 확인과 함께 드세요.", estimate=(date(2026, 9, 5), date(2026, 9, 6), 0.58), confidence=0.58,
        ),
    ]


def _food(
    food_id: str,
    name: str,
    brand: str,
    quantity: float,
    unit: str,
    storage_type: StorageCode,
    date_kind: DateKind,
    date_value: date | None,
    source: DateSource,
    source_detail: str,
    priority: int,
    category: str,
    image_path: str,
    note: str,
    *,
    estimate: tuple[date, date, float] | None = None,
    opened: bool = False,
    confidence: float = 1.0,
) -> FoodResponse:
    display_label = date_value.isoformat() if date_value else "확인 필요"
    assertion = DateAssertion(
        kind=date_kind,
        value=date_value,
        display_label=display_label,
        source=source,
        source_detail=source_detail,
        confidence=confidence,
        user_confirmed=date_kind == "user_reminder",
    )
    window = None
    if estimate:
        start, end, estimate_confidence = estimate
        window = DateWindow(start_date=start, end_date=end, basis=source_detail, confidence=estimate_confidence)
    return FoodResponse(
        id=food_id,
        canonical_name=name,
        display_name=name,
        brand=brand,
        quantity=quantity,
        unit=unit,
        storage_type=storage_type,
        opened=opened,
        date_assertion=assertion,
        estimated_use_first_window=window,
        priority=priority,
        category=category,
        image_path=image_path,
        note=note,
    )


def _refresh_estimated_window(food: FoodResponse) -> None:
    """Recalculate only the convenience window after state changes.

    A printed/user-confirmed date is immutable here. Only an unknown date may
    receive a new reference-priority window from the current storage/opened
    state, and the inference provider still requires user confirmation.
    """
    if food.date_assertion.kind != "unknown":
        return
    inference = infer_priority(
        PriorityInferenceRequest(
            product_name=food.canonical_name,
            storage_type=food.storage_type,
            opened=food.opened,
        )
    )
    if inference.estimated_use_first_window is None:
        food.estimated_use_first_window = None
        return
    food.estimated_use_first_window = DateWindow(
        start_date=inference.estimated_use_first_window.start_date,
        end_date=inference.estimated_use_first_window.end_date,
        basis=f"{inference.estimated_use_first_window.rule_id} · {food.storage_type}",
        confidence=inference.storage_confidence,
    )


def _receipt_food(name: str, quantity: float, unit: str, confidence: float, purchased_at: datetime | None) -> FoodResponse:
    del purchased_at
    image = "/assets/food/tomato.png"
    category = "기타"
    if "시금치" in name:
        image, category = "/assets/food/spinach.png", "채소"
    elif "두부" in name:
        image, category = "/assets/food/tofu.png", "두부·콩"
    elif "버섯" in name:
        image, category = "/assets/food/mushroom.png", "채소"
    elif "달걀" in name or "계란" in name:
        image, category = "/assets/food/eggs.png", "달걀"
    inference = infer_priority(PriorityInferenceRequest(product_name=name, storage_type="refrigerated"))
    estimate = None
    if inference.estimated_use_first_window is not None:
        estimate = (
            inference.estimated_use_first_window.start_date,
            inference.estimated_use_first_window.end_date,
            min(confidence, inference.storage_confidence),
        )
    return _food(
        create_id("food"),
        name,
        name,
        quantity,
        unit,
        "refrigerated",
        "unknown",
        None,
        "unknown",
        "영수증 + 상품 유형",
        99,
        category,
        image,
        "영수증 구매일은 기록했지만, 실제 소비기한은 포장지에서 확인해야 해요.",
        estimate=estimate,
        confidence=confidence,
    )


def _normalize_product_name(raw_name: str) -> str:
    normalized = raw_name.strip().replace("국내산 ", "")
    if "시금치" in normalized:
        return "시금치"
    if "두부" in normalized:
        return "국산콩 두부"
    if "버섯" in normalized:
        return "맛타리버섯"
    if "달걀" in normalized or "계란" in normalized:
        return "동물복지 달걀"
    return normalized


def create_id(prefix: str) -> str:
    now = datetime.now(timezone.utc).isoformat()
    return f"{prefix}-{sha256(now.encode()).hexdigest()[:12]}"


def _fingerprint(request: ReceiptDraftRequest) -> str:
    payload = "|".join([request.source_filename, *(f"{line.raw_name}:{line.quantity}:{line.total_price}" for line in request.lines)])
    return sha256(payload.encode("utf-8")).hexdigest()


def _draft_line(line: ReceiptLineInput, index: int) -> ReceiptLineDraft:
    line_id = f"line-{index + 1}"
    is_product = line.line_type == "product"
    needs_review = not is_product or line.match_confidence < 0.8 or not line.canonical_name
    reason = None
    if not is_product:
        reason = "상품 라인이 아니어서 재고로 만들지 않습니다."
    elif line.match_confidence < 0.8:
        reason = "상품명 후보의 신뢰도가 낮습니다."
    elif not line.canonical_name:
        reason = "상품 후보를 확인해 주세요."
    return ReceiptLineDraft(
        id=line_id,
        raw_name=line.raw_name,
        canonical_name=line.canonical_name,
        quantity=line.quantity,
        unit=line.unit,
        unit_price=line.unit_price,
        total_price=line.total_price,
        line_type=line.line_type,
        match_confidence=line.match_confidence,
        review_status="pending" if needs_review else "confirmed",
        review_reason=reason,
    )


def _build_store() -> InMemoryStore:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    if database_url:
        return PostgresStore(database_url)
    database_path = os.getenv("RESCUE_MEAL_SQLITE_PATH", "").strip()
    return SqliteStore(database_path) if database_path else InMemoryStore()


store = WorkspaceStoreRouter(_build_store())


def _build_auth_repository() -> AccountRepository:
    base_store = store._base_store
    if isinstance(base_store, PostgresStore):
        return PostgresAccountRepository(base_store.database_url)
    if isinstance(base_store, SqliteStore) and str(base_store.database_path) != ":memory:":
        base_path = Path(base_store.database_path)
        auth_path = base_path.with_name(f"{base_path.stem}.auth{base_path.suffix or '.db'}")
        return AccountRepository(str(auth_path))
    return AccountRepository()


auth_repository = _build_auth_repository()


def _build_grocy_client() -> GrocyClient | None:
    config = GrocyConfig.from_env()
    return GrocyClient(config) if config is not None else None


grocy_client = _build_grocy_client()


def _build_ocr_engine() -> PaddleOcrEngine | RemoteOcrEngine:
    worker_url = os.getenv("RESCUE_MEAL_OCR_URL", "").strip()
    return RemoteOcrEngine(worker_url) if worker_url else PaddleOcrEngine()


ocr_engine = _build_ocr_engine()
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

app = FastAPI(
    title="Rescue Meal API",
    version="0.1.0",
    description="영수증·라벨·보관 이력을 안전 경계와 함께 관리하는 MVP API",
)
default_cors_origins = ["http://127.0.0.1:4173", "http://localhost:4173"]
configured_cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("RESCUE_MEAL_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
cors_origins = list(dict.fromkeys(default_cors_origins + configured_cors_origins))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _workspace_request_is_public(path: str) -> bool:
    return path == "/health" or path.startswith("/api/auth/")


@app.middleware("http")
async def workspace_context_middleware(request: Request, call_next):
    authorization = request.headers.get("authorization", "").strip()
    workspace_id = DEFAULT_WORKSPACE_ID
    if authorization:
        scheme, separator, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token:
            return JSONResponse(status_code=401, content={"detail": "Bearer token이 필요합니다."})
        try:
            workspace_id = verify_guest_token(token)
        except InvalidGuestToken:
            return JSONResponse(status_code=401, content={"detail": "유효하지 않거나 만료된 guest workspace token입니다."})
        if auth_repository.is_token_revoked(token):
            return JSONResponse(status_code=401, content={"detail": "이미 로그아웃된 token입니다."})
    elif auth_required() and not _workspace_request_is_public(request.url.path) and request.url.path.startswith("/api/"):
        return JSONResponse(status_code=401, content={"detail": "인증이 필요합니다."})

    try:
        store.provision_workspace(
            workspace_id,
            seed=auth_repository.find_by_workspace(workspace_id) is None,
        )
    except RuntimeError:
        return JSONResponse(status_code=503, content={"detail": "현재 저장소가 workspace 격리를 지원하지 않습니다."})

    context_token = set_workspace_id(workspace_id)
    try:
        return await call_next(request)
    finally:
        reset_workspace(context_token)


def _receipt_request_from_parsed(
    *,
    source_filename: str,
    purchased_at: datetime | None,
    parsed: ParsedReceipt,
) -> ReceiptDraftRequest:
    if not parsed.lines:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="OCR 결과에서 영수증 line을 찾지 못했습니다.")
    inputs: list[ReceiptLineInput] = []
    for line in parsed.lines:
        line_type = line.line_type
        canonical_name = line.canonical_name
        confidence = line.match_confidence
        if parsed.kind == "restaurant_receipt" and line_type == "product":
            # Restaurant menu items are not grocery stock. Keep them visible in
            # review, but make commit impossible without a future leftover flow.
            line_type = "unknown"
            canonical_name = None
            confidence = 0
        inputs.append(
            ReceiptLineInput(
                raw_name=line.raw_name,
                quantity=line.quantity,
                unit=line.unit,
                unit_price=line.unit_price,
                total_price=line.total_price,
                line_type=line_type,
                canonical_name=canonical_name,
                match_confidence=confidence,
            )
        )
    return ReceiptDraftRequest(
        source_filename=source_filename,
        purchased_at=purchased_at or parsed.purchased_at,
        lines=inputs,
    )


def _label_response(
    *,
    source_filename: str,
    file_sha256: str | None,
    engine: str,
    model_version: str | None,
    observations_count: int,
    parsed: ParsedLabel,
    quality: ImageQualityResponse | None = None,
) -> LabelParseResponse:
    candidate = parsed.consumption_date_candidate
    candidates = [_label_candidate_response(candidate) for candidate in parsed.date_candidates]
    return LabelParseResponse(
        status="review_required",
        source_filename=source_filename,
        file_sha256=file_sha256,
        engine=engine,
        model_version=model_version,
        observations_count=observations_count,
        product_name=parsed.product_name,
        barcode=parsed.barcode,
        storage_hint=parsed.storage_hint,
        date_candidates=candidates,
        consumption_date_candidate=_label_candidate_response(candidate) if candidate else None,
        warnings=parsed.warnings,
        requires_review=parsed.requires_review,
        quality=quality,
    )


def _label_candidate_response(candidate: LabelDateCandidate) -> LabelDateCandidateResponse:
    return LabelDateCandidateResponse(
        kind=candidate.kind,
        value=candidate.value,
        raw_text=candidate.raw_text,
        confidence=candidate.confidence,
        requires_review=candidate.requires_review,
        context=candidate.context,
    )


def _barcode_response(parsed: ParsedBarcode) -> BarcodeParseResponse:
    return BarcodeParseResponse(
        raw_scan=parsed.raw_scan,
        barcode_type=parsed.barcode_type,
        gtin=parsed.gtin,
        lot=parsed.lot,
        date_assertions=[
            BarcodeDateAssertionResponse(kind=item.kind, value=item.value, ai=item.ai, confidence=item.confidence)
            for item in parsed.date_assertions
        ],
        warnings=parsed.warnings,
        requires_review=parsed.requires_review,
    )


def _product_lookup_response(result: ProductLookupResult) -> ProductLookupResponse:
    return ProductLookupResponse(
        barcode=result.barcode,
        status=result.status,
        candidates=[
            ProductCandidateResponse(
                source=candidate.source,
                source_url=candidate.source_url,
                canonical_name=candidate.canonical_name,
                brand=candidate.brand,
                category=candidate.category,
                quantity_text=candidate.quantity_text,
                confidence=candidate.confidence,
                provenance_note=candidate.provenance_note,
            )
            for candidate in result.candidates
        ],
        warnings=result.warnings,
        requires_review=result.requires_review,
    )


def _quality_response(report: ImageQualityReport) -> ImageQualityResponse:
    return ImageQualityResponse(
        status=report.status,
        width=report.width,
        height=report.height,
        format=report.format,
        brightness=report.brightness,
        contrast=report.contrast,
        edge_energy=report.edge_energy,
        warnings=report.warnings,
    )


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = file.filename or "upload.jpg"
    content_type = file.content_type or "application/octet-stream"
    if not (content_type.startswith("image/") or content_type == "application/pdf"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="이미지 또는 PDF만 업로드할 수 있습니다.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="빈 파일입니다.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="파일은 10MB 이하만 업로드할 수 있습니다.")
    return filename, data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rescue-meal-api", "storage": store.backend_name}


@app.get("/api/integrations/grocy/status", response_model=GrocyStatusResponse)
def grocy_status() -> GrocyStatusResponse:
    if grocy_client is None:
        return GrocyStatusResponse(configured=False, status="disabled", detail="GROCY_BASE_URL과 GROCY_API_KEY가 없어 비활성화되어 있습니다.")
    try:
        info = grocy_client.system_info()
        version_data = info.get("grocy_version") if isinstance(info, dict) else None
        version = version_data.get("Version") if isinstance(version_data, dict) else None
        return GrocyStatusResponse(configured=True, status="ok", version=version, detail="Grocy system info readback이 성공했습니다.")
    except GrocyError:
        return GrocyStatusResponse(configured=True, status="unavailable", detail="Grocy 연결을 확인하지 못했습니다.")


@app.get("/api/integrations/recipes/cookrcp/status", response_model=RecipeSourceStatusResponse)
def cookrcp_status() -> RecipeSourceStatusResponse:
    """Report importer configuration without making an external request."""
    configured = CookRcpConfig.from_env() is not None
    if not configured:
        return RecipeSourceStatusResponse(
            configured=False,
            status="disabled",
            source_name="식품안전나라 조리식품 레시피 DB",
            detail="FOODSAFETY_COOKRCP_API_KEY가 없어 비활성화되어 있습니다.",
        )
    return RecipeSourceStatusResponse(
        configured=True,
        status="ready",
        source_name="식품안전나라 조리식품 레시피 DB",
        detail="API key가 설정되었습니다. 외부 레시피는 검토 draft로만 수집됩니다.",
    )


@app.post("/api/auth/guest", response_model=GuestSessionResponse)
def create_guest_session() -> GuestSessionResponse:
    workspace_id = create_guest_workspace_id()
    _ensure_auth_secret()
    try:
        store.provision_workspace(workspace_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="workspace 저장소를 준비하지 못했습니다.",
        ) from exc
    access_token, expires_at = issue_guest_token(workspace_id)
    return GuestSessionResponse(
        workspace_id=workspace_id,
        access_token=access_token,
        expires_at=expires_at,
    )


def _ensure_account_auth_supported() -> None:
    _ensure_auth_secret()


def _ensure_auth_secret() -> None:
    try:
        auth_secret()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="인증 secret 설정이 필요합니다.") from exc


def _account_session(account: AccountRecord) -> AccountSessionResponse:
    try:
        access_token, expires_at = issue_guest_token(account.workspace_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="인증 secret 설정이 필요합니다.") from exc
    return AccountSessionResponse(
        user_id=account.id,
        email=account.email,
        workspace_id=account.workspace_id,
        access_token=access_token,
        expires_at=expires_at,
    )


@app.post("/api/auth/register", response_model=AccountSessionResponse, status_code=status.HTTP_201_CREATED)
def register_account(request: AccountCredentialsRequest) -> AccountSessionResponse:
    _ensure_account_auth_supported()
    try:
        normalized_email = normalize_email(request.email)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이메일 형식을 확인해 주세요.") from exc
    if auth_repository.find_by_email(normalized_email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")
    workspace_id = create_account_workspace_id()
    try:
        store.provision_workspace(workspace_id, seed=False)
        account = auth_repository.register(normalized_email, request.password, workspace_id)
    except DuplicateAccount as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.") from exc
    return _account_session(account)


@app.post("/api/auth/login", response_model=AccountSessionResponse)
def login_account(request: AccountCredentialsRequest) -> AccountSessionResponse:
    _ensure_account_auth_supported()
    try:
        account = auth_repository.authenticate(request.email, request.password)
    except ValueError:
        account = None
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호를 확인해 주세요.")
    return _account_session(account)


@app.get("/api/auth/me", response_model=AuthMeResponse)
def get_auth_me(request: Request) -> AuthMeResponse:
    if not request.headers.get("authorization"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    workspace_id = current_workspace_id()
    account = auth_repository.find_by_workspace(workspace_id)
    if account is None:
        return AuthMeResponse(mode="guest", workspace_id=workspace_id)
    return AuthMeResponse(mode="account", user_id=account.id, email=account.email, workspace_id=workspace_id)


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_auth(request: Request) -> Response:
    authorization = request.headers.get("authorization", "").strip()
    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token이 필요합니다.")
    auth_repository.revoke_token(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/inference/priority", response_model=PriorityInferenceResponse)
def infer_consumption_priority(request: PriorityInferenceRequest) -> PriorityInferenceResponse:
    return infer_priority(request)


@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard() -> DashboardResponse:
    return store.dashboard()


@app.get("/api/products/by-barcode/{barcode}", response_model=BarcodeProductResponse)
def lookup_barcode(barcode: str) -> BarcodeProductResponse:
    if barcode == "8801114167523":
        return BarcodeProductResponse(
            barcode=barcode,
            match_status="matched",
            canonical_name="국산콩 두부",
            brand="풀무원",
            category="두부·콩",
            lookup_source="local_fixture",
        )
    return BarcodeProductResponse(barcode=barcode, match_status="not_found", lookup_source="none")


@app.get("/api/products/resolve/{barcode}", response_model=ProductLookupResponse)
def resolve_product_by_barcode(barcode: str) -> ProductLookupResponse:
    return _product_lookup_response(resolve_product(barcode))


@app.post("/api/barcodes/parse", response_model=BarcodeParseResponse)
def parse_barcode_endpoint(request: BarcodeParseRequest) -> BarcodeParseResponse:
    return _barcode_response(parse_barcode(request.raw_scan))


@app.post("/api/receipts/parse-text", response_model=ReceiptTextParseResponse, status_code=status.HTTP_201_CREATED)
def parse_receipt_text_endpoint(request: ReceiptTextParseRequest) -> ReceiptTextParseResponse:
    parsed = parse_receipt_text(request.ocr_text)
    draft = create_receipt_draft(
        _receipt_request_from_parsed(
            source_filename=request.source_filename,
            purchased_at=request.purchased_at,
            parsed=parsed,
        )
    )
    return ReceiptTextParseResponse(kind=parsed.kind, warnings=parsed.warnings, draft=draft)


@app.post("/api/labels/parse-text", response_model=LabelParseResponse)
def parse_label_text_endpoint(request: ReceiptTextParseRequest) -> LabelParseResponse:
    parsed = parse_label_text(request.ocr_text)
    return _label_response(
        source_filename=request.source_filename,
        file_sha256=None,
        engine="provided_ocr_text",
        model_version=None,
        observations_count=len([line for line in request.ocr_text.splitlines() if line.strip()]),
        parsed=parsed,
    )


@app.post("/api/receipts/intake", response_model=OcrIntakeResponse)
async def intake_receipt(file: UploadFile = File(...)) -> OcrIntakeResponse:
    filename, data = await _read_upload(file)
    file_hash = sha256(data).hexdigest()
    quality = _quality_response(assess_image_quality(data))
    if quality.status == "reject":
        return OcrIntakeResponse(
            status="failed",
            source_filename=filename,
            file_sha256=file_hash,
            engine="quality-gate",
            model_version=None,
            observations_count=0,
            message=quality.warnings[0] if quality.warnings else "이미지 품질이 낮습니다.",
            quality=quality,
        )
    run: OcrRun = await run_in_threadpool(ocr_engine.extract, data, filename)
    if run.status == "unavailable":
        return OcrIntakeResponse(
            status="needs_ocr_engine",
            source_filename=filename,
            file_sha256=file_hash,
            engine=run.engine,
            model_version=run.model_version,
            observations_count=0,
            message=run.message or "OCR 엔진이 필요합니다.",
            quality=quality,
        )
    if run.status == "failed":
        return OcrIntakeResponse(
            status="failed",
            source_filename=filename,
            file_sha256=file_hash,
            engine=run.engine,
            model_version=run.model_version,
            observations_count=0,
            message=run.message or "OCR을 완료하지 못했습니다.",
            quality=quality,
        )
    parsed = parse_receipt_observations(run.observations)
    draft = create_receipt_draft(
        _receipt_request_from_parsed(source_filename=filename, purchased_at=parsed.purchased_at, parsed=parsed)
    )
    return OcrIntakeResponse(
        status="review_required",
        source_filename=filename,
        file_sha256=file_hash,
        engine=run.engine,
        model_version=run.model_version,
        observations_count=len(run.observations),
        message="OCR draft가 생성되었습니다. review 후 반영하세요.",
        quality=quality,
        receipt_kind=parsed.kind,
        draft=draft,
    )


@app.post("/api/labels/intake", response_model=LabelParseResponse)
async def intake_label(file: UploadFile = File(...)) -> LabelParseResponse:
    filename, data = await _read_upload(file)
    file_hash = sha256(data).hexdigest()
    quality = _quality_response(assess_image_quality(data))
    if quality.status == "reject":
        return LabelParseResponse(
            status="failed",
            source_filename=filename,
            file_sha256=file_hash,
            engine="quality-gate",
            model_version=None,
            observations_count=0,
            product_name=None,
            barcode=None,
            storage_hint="unknown",
            date_candidates=[],
            consumption_date_candidate=None,
            warnings=quality.warnings,
            requires_review=True,
            quality=quality,
        )
    run: OcrRun = await run_in_threadpool(ocr_engine.extract, data, filename)
    if run.status == "unavailable":
        return LabelParseResponse(
            status="needs_ocr_engine",
            source_filename=filename,
            file_sha256=file_hash,
            engine=run.engine,
            model_version=run.model_version,
            observations_count=0,
            product_name=None,
            barcode=None,
            storage_hint="unknown",
            date_candidates=[],
            consumption_date_candidate=None,
            warnings=[run.message or "PaddleOCR 런타임이 설치되지 않았습니다."],
            requires_review=True,
            quality=quality,
        )
    if run.status == "failed":
        return LabelParseResponse(
            status="failed",
            source_filename=filename,
            file_sha256=file_hash,
            engine=run.engine,
            model_version=run.model_version,
            observations_count=0,
            product_name=None,
            barcode=None,
            storage_hint="unknown",
            date_candidates=[],
            consumption_date_candidate=None,
            warnings=[run.message or "OCR을 완료하지 못했습니다."],
            requires_review=True,
            quality=quality,
        )
    parsed = parse_label_text("\n".join(observation.text for observation in run.observations))
    return _label_response(
        source_filename=filename,
        file_sha256=file_hash,
        engine=run.engine,
        model_version=run.model_version,
        observations_count=len(run.observations),
        parsed=parsed,
        quality=quality,
    )


@app.post("/api/foods", response_model=FoodResponse, status_code=status.HTTP_201_CREATED)
def create_manual_food(request: ManualFoodRequest) -> FoodResponse:
    date_requires_value = request.date_kind in {
        "production_date",
        "packaging_date",
        "sell_by",
        "use_by",
        "best_before",
        "user_reminder",
    }
    if date_requires_value and request.date_value is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="확정 날짜 유형에는 date_value가 필요합니다.")

    inference = infer_priority(
        PriorityInferenceRequest(product_name=request.canonical_name, storage_type=request.storage_type)
    )
    estimate = None
    if inference.estimated_use_first_window is not None:
        estimate = (
            inference.estimated_use_first_window.start_date,
            inference.estimated_use_first_window.end_date,
            inference.storage_confidence,
        )
    food = _food(
        create_id("food"),
        request.canonical_name,
        request.brand,
        request.quantity,
        request.unit,
        request.storage_type,
        request.date_kind,
        request.date_value,
        request.date_source,
        request.date_source_detail,
        99,
        request.category,
        request.image_path,
        request.note,
        estimate=estimate if request.date_kind in {"unknown", "estimated_use_first"} else None,
        confidence=1.0 if request.user_confirmed else inference.storage_confidence,
    )
    food.date_assertion.user_confirmed = request.user_confirmed

    existing = next((record for record in store.foods.values() if record.response.canonical_name == request.canonical_name), None)
    if existing is not None:
        trusted_existing = existing.response.date_assertion.kind in {"production_date", "packaging_date", "sell_by", "use_by", "best_before", "user_reminder"}
        preserve_existing_date = trusted_existing and request.date_kind in {"unknown", "estimated_use_first"}
        existing.response.brand = request.brand
        existing.response.quantity = request.quantity
        existing.response.unit = request.unit
        existing.response.storage_type = request.storage_type
        existing.response.category = request.category
        existing.response.image_path = request.image_path
        existing.response.note = request.note
        if not preserve_existing_date:
            existing.response.date_assertion = food.date_assertion
            existing.response.estimated_use_first_window = food.estimated_use_first_window
        elif existing.response.estimated_use_first_window is None and food.estimated_use_first_window is not None:
            existing.response.estimated_use_first_window = food.estimated_use_first_window
        store.reprioritize()
        return existing.response

    store.foods[food.id] = _FoodRecord(food)
    store.reprioritize()
    return food


@app.post("/api/receipts/drafts", response_model=ReceiptDraftResponse, status_code=status.HTTP_201_CREATED)
def create_receipt_draft(request: ReceiptDraftRequest) -> ReceiptDraftResponse:
    fingerprint = _fingerprint(request)
    if fingerprint in store.committed_fingerprints:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 반영된 영수증입니다.")
    draft = ReceiptDraftResponse(
        id=create_id("receipt"),
        fingerprint=fingerprint,
        status="review_required",
        source_filename=request.source_filename,
        purchased_at=request.purchased_at,
        lines=[_draft_line(line, index) for index, line in enumerate(request.lines)],
    )
    store.receipts[draft.id] = _ReceiptRecord(draft)
    store.flush()
    return draft


@app.post("/api/receipts/{receipt_id}/commit", response_model=ReceiptCommitResponse)
def commit_receipt(receipt_id: str, request: ReceiptCommitRequest) -> ReceiptCommitResponse:
    record = store.receipts.get(receipt_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 draft를 찾을 수 없습니다.")
    if record.committed or record.response.status == "committed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 반영된 영수증입니다.")
    if record.response.fingerprint in store.committed_fingerprints:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="동일 fingerprint의 영수증이 이미 반영되었습니다.")

    line_map = {line.id: line for line in record.response.lines}
    missing_ids = [line_id for line_id in request.confirmed_line_ids if line_id not in line_map]
    if missing_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"없는 line id: {missing_ids}")

    transaction = CommitTransactionRecord(
        id=create_id("commit"),
        receipt_id=receipt_id,
        fingerprint=record.response.fingerprint,
        status="pending",
    )
    snapshot = store.snapshot()
    store.commit_transactions[transaction.id] = transaction
    store.flush()
    created_lots: list[str] = []
    skipped: list[str] = []
    try:
        for line_id in request.confirmed_line_ids:
            line = line_map[line_id]
            if line.line_type != "product":
                skipped.append(line_id)
                continue
            if line.review_status == "pending" and line_id not in request.overrides:
                skipped.append(line_id)
                continue
            created_lots.append(store.upsert_from_receipt(line=line, purchased_at=record.response.purchased_at, override=request.overrides.get(line_id)))

        record.committed = True
        record.response.status = "committed"
        record.response.stock_created = bool(created_lots)
        store.committed_fingerprints.add(record.response.fingerprint)
        transaction.status = "committed"
        store.reprioritize()
        store.flush()
        return ReceiptCommitResponse(
            receipt_id=receipt_id,
            status="committed",
            commit_transaction_id=transaction.id,
            created_lot_ids=created_lots,
            skipped_line_ids=skipped,
            inventory=[item.response for item in store._sorted_foods()],
        )
    except Exception as exc:
        store.restore(snapshot)
        transaction.status = "needs_reconciliation"
        transaction.error_code = exc.__class__.__name__
        store.commit_transactions[transaction.id] = transaction
        store.flush()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"영수증 반영을 롤백했습니다. 재시도 transaction: {transaction.id}",
        ) from exc


@app.get("/api/commit-transactions", response_model=list[CommitTransactionRecord])
def list_commit_transactions() -> list[CommitTransactionRecord]:
    return list(store.commit_transactions.values())


def _split_food_for_event(record: _FoodRecord, quantity: float, *, storage_type: StorageCode | None = None, opened: bool | None = None) -> str:
    if quantity >= record.response.quantity:
        raise ValueError("partial split requires a quantity smaller than the source lot")
    child = record.response.model_copy(deep=True)
    child.id = create_id("lot")
    child.parent_lot_id = record.response.id
    child.quantity = quantity
    if storage_type is not None:
        child.storage_type = storage_type
    if opened is not None:
        child.opened = opened
    _refresh_estimated_window(child)
    record.response.quantity = round(record.response.quantity - quantity, 3)
    _refresh_estimated_window(record.response)
    store.foods[child.id] = _FoodRecord(child, purchased_at=record.purchased_at)
    return child.id


@app.post("/api/foods/{food_id}/storage-events", response_model=StorageEventResponse)
def create_storage_event(food_id: str, request: StorageEventRequest) -> StorageEventResponse:
    record = store.foods.get(food_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    current_storage = record.response.storage_type
    current_quantity = record.response.quantity
    if request.quantity is not None and request.quantity > current_quantity:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이벤트 수량이 현재 lot 수량보다 큽니다.")
    event_quantity = request.quantity or current_quantity
    target_storage: StorageCode | None = None
    created_child_food_id: str | None = None
    if request.event_type == "moved":
        if request.to_storage_type is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="moved 이벤트에는 to_storage_type이 필요합니다.")
        target_storage = request.to_storage_type
    elif request.event_type == "frozen":
        target_storage = "frozen"
    elif request.event_type == "thawed":
        target_storage = "refrigerated"
    if target_storage is not None:
        if request.quantity is not None and request.quantity < current_quantity:
            created_child_food_id = _split_food_for_event(record, request.quantity, storage_type=target_storage)
        else:
            record.response.storage_type = target_storage
            _refresh_estimated_window(record.response)
    elif request.event_type == "opened":
        if request.quantity is not None and request.quantity < current_quantity:
            created_child_food_id = _split_food_for_event(record, request.quantity, opened=True)
        else:
            record.response.opened = True
            _refresh_estimated_window(record.response)
    elif request.event_type in {"consumed", "discarded"}:
        if request.quantity is not None and request.quantity < current_quantity:
            record.response.quantity = round(current_quantity - request.quantity, 3)
        else:
            del store.foods[food_id]

    event = StorageEventResponse(
        id=create_id("event"),
        food_id=food_id,
        event_type=request.event_type,
        from_storage_type=current_storage,
        to_storage_type=target_storage,
        quantity=event_quantity,
        occurred_at=datetime.now(timezone.utc),
        created_child_food_id=created_child_food_id,
    )
    store.storage_events.append(event)
    store.reprioritize()
    return event


@app.patch("/api/foods/{food_id}/date-assertion", response_model=FoodResponse)
def confirm_food_date(food_id: str, request: DateAssertionUpdateRequest) -> FoodResponse:
    record = store.foods.get(food_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    current = record.response.date_assertion
    if current.kind not in {"unknown", "estimated_use_first"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 확인된 표시 날짜는 이 화면에서 덮어쓰지 않습니다.",
        )
    record.response.date_assertion_history.append(current.model_copy(deep=True))
    record.response.date_assertion = DateAssertion(
        kind=request.kind,
        value=request.date_value,
        display_label=request.date_value.isoformat(),
        source="user_input",
        source_detail=request.source_detail,
        confidence=1.0,
        user_confirmed=True,
    )
    record.response.estimated_use_first_window = None
    store.reprioritize()
    return record.response


@app.get("/api/foods/{food_id}/storage-events", response_model=list[StorageEventResponse])
def list_storage_events(food_id: str) -> list[StorageEventResponse]:
    if food_id not in store.foods and not any(event.food_id == food_id for event in store.storage_events):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    return [event for event in store.storage_events if event.food_id == food_id]


def _build_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    selected = [store.foods[food_id].response for food_id in request.inventory_ids if food_id in store.foods]
    if not selected:
        selected = [record.response for record in store._sorted_foods()[:3]]
    planned: PlannedRecipe | None = plan_recipe(selected, request.max_minutes)
    if planned is None:
        return MealPlanResponse(
            id=create_id("meal"),
            recipe_id="no-match",
            saved_at=None,
            completed_at=None,
            planner_version="recipe-planner-v2",
            source="recipe_fixture",
            title="재료를 조금 더 추가해 주세요",
            minutes=0,
            max_minutes=request.max_minutes,
            inventory_ids=[],
            ingredients=[],
            missing_ingredients=[],
            matched_ratio=0,
            score=0,
            reason="레시피 후보를 만들려면 식품을 먼저 추가해 주세요.",
            steps=[],
            safety_note="식품 상태가 이상하면 사용하지 마세요.",
        )
    return MealPlanResponse(
        id=create_id("meal"),
        completed_at=None,
        saved_at=None,
        recipe_id=planned.recipe_id,
        planner_version=planned.planner_version,
        source=planned.source,
        title=planned.title,
        minutes=planned.minutes,
        max_minutes=request.max_minutes,
        inventory_ids=list(planned.inventory_ids),
        ingredients=[
            MealIngredientResponse(
                canonical_name=ingredient.canonical_name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                available=ingredient.available,
                available_food_id=ingredient.available_food_id,
                available_quantity=ingredient.available_quantity,
                available_unit=ingredient.available_unit,
                match_type=ingredient.match_type,
                allocations=[
                    MealIngredientAllocationResponse(food_id=allocation.food_id, quantity=allocation.quantity, unit=allocation.unit)
                    for allocation in ingredient.allocations
                ],
            )
            for ingredient in planned.ingredients
        ],
        missing_ingredients=list(planned.missing_ingredients),
        matched_ratio=planned.matched_ratio,
        score=planned.score,
        reason=planned.reason,
        steps=list(planned.steps),
        safety_note=planned.safety_note,
        recipe_source_name=planned.source_name,
        recipe_source_url=planned.source_url,
        recipe_license=planned.license,
        recipe_source_revision=planned.source_revision,
    )


def _meal_plan_snapshot_hash(plan: MealPlanResponse) -> str:
    payload = plan.model_dump(
        mode="json",
        exclude={
            "id",
            "snapshot_hash",
            "saved_at",
            "completed_at",
            "consumed_food_ids",
            "completed_skipped_ingredients",
            "consumed_allocations",
        },
    )
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


def _with_meal_plan_snapshot_hash(plan: MealPlanResponse) -> MealPlanResponse:
    if plan.recipe_id != "no-match":
        plan.snapshot_hash = _meal_plan_snapshot_hash(plan)
    return plan


@app.post("/api/meal-plans/preview", response_model=MealPlanResponse)
def preview_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    """Calculate a recipe without creating a saved plan."""
    return _with_meal_plan_snapshot_hash(_build_meal_plan(request))


@app.post("/api/meal-plans", response_model=MealPlanResponse)
def create_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    """Calculate and persist the user's selected recipe plan."""
    if request.plan_id:
        existing = store.meal_plans.get(request.plan_id)
        if existing is not None:
            if request.snapshot_hash and existing.snapshot_hash and request.snapshot_hash != existing.snapshot_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 식단 snapshot을 저장할 수 없습니다.")
            return existing
    plan = _with_meal_plan_snapshot_hash(_build_meal_plan(request))
    if plan.recipe_id != "no-match":
        if request.snapshot_hash and request.snapshot_hash != plan.snapshot_hash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="식단 snapshot이 미리보기와 달라졌습니다.")
        if request.plan_id:
            plan.id = request.plan_id
        plan.saved_at = datetime.now(timezone.utc)
        store.meal_plans[plan.id] = plan
        store.meal_plan_events.append(
            MealPlanAuditEventResponse(
                id=create_id("meal-event"),
                plan_id=plan.id,
                event_type="saved",
                occurred_at=plan.saved_at,
                snapshot_hash=plan.snapshot_hash,
            )
        )
        store.flush()
    return plan


@app.get("/api/meal-plans/latest", response_model=MealPlanResponse | None)
def get_latest_meal_plan() -> MealPlanResponse | None:
    saved_plans = [plan for plan in store.meal_plans.values() if plan.saved_at is not None]
    return max(saved_plans, key=lambda plan: plan.saved_at or datetime.min.replace(tzinfo=timezone.utc), default=None)


@app.get("/api/meal-plans/history", response_model=list[MealPlanResponse])
def list_meal_plan_history(limit: int = Query(default=20, ge=1, le=50)) -> list[MealPlanResponse]:
    saved_plans = [plan for plan in store.meal_plans.values() if plan.saved_at is not None]
    return sorted(
        saved_plans,
        key=lambda plan: plan.saved_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:limit]


@app.get("/api/meal-plans/{plan_id}/events", response_model=list[MealPlanAuditEventResponse])
def list_meal_plan_events(plan_id: str) -> list[MealPlanAuditEventResponse]:
    if plan_id not in store.meal_plans and not any(event.plan_id == plan_id for event in store.meal_plan_events):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식단 이력을 찾을 수 없습니다.")
    return [event for event in store.meal_plan_events if event.plan_id == plan_id]


def _same_quantity_unit(left: str, right: str) -> bool:
    return left.strip().casefold().replace(" ", "") == right.strip().casefold().replace(" ", "")


def _plan_allocations(ingredient: MealIngredientResponse) -> list[tuple[str, float, str]]:
    if ingredient.allocations:
        return [(allocation.food_id, allocation.quantity, allocation.unit) for allocation in ingredient.allocations]
    if ingredient.available and ingredient.available_food_id:
        return [(ingredient.available_food_id, ingredient.amount, ingredient.unit)]
    return []


@app.post("/api/meal-plans/{plan_id}/complete", response_model=MealPlanCompletionResponse)
def complete_meal_plan(plan_id: str, request: MealPlanCompletionRequest) -> MealPlanCompletionResponse:
    plan = store.meal_plans.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 식단을 찾을 수 없습니다.")
    if plan.completed_at is not None:
        return MealPlanCompletionResponse(
            plan_id=plan.id,
            status="already_completed",
            completed_at=plan.completed_at,
            consumed_food_ids=list(plan.consumed_food_ids),
            consumed_allocations=list(plan.consumed_allocations),
            skipped_ingredients=[
                MealPlanSkippedIngredientResponse(
                    canonical_name=name,
                    reason="이전 조리 완료에서 현재 재고 확인이 필요해 제외된 재료입니다.",
                )
                for name in plan.completed_skipped_ingredients
            ],
        )

    requested_quantities: dict[str, float] | None = None
    if request.consumptions is not None:
        requested_quantities = {}
        for consumption in request.consumptions:
            if consumption.food_id in requested_quantities:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="같은 lot의 사용량을 중복해서 보낼 수 없습니다.")
            requested_quantities[consumption.food_id] = round(consumption.quantity, 3)
        allowed_quantities: dict[str, float] = {}
        for ingredient in plan.ingredients:
            for food_id, allocation_quantity, _ in _plan_allocations(ingredient):
                allowed_quantities[food_id] = round(allowed_quantities.get(food_id, 0) + allocation_quantity, 3)
        unknown_food_ids = sorted(set(requested_quantities) - set(allowed_quantities))
        if unknown_food_ids:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="식단에 배정되지 않은 lot의 사용량입니다.")
        exceeding_food_ids = sorted(
            food_id
            for food_id, quantity in requested_quantities.items()
            if quantity > allowed_quantities[food_id] + 1e-9
        )
        if exceeding_food_ids:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="사용량이 식단 배정량을 초과했습니다.")

    snapshot = store.snapshot()
    plan_snapshot = plan.model_copy(deep=True)
    consumed_food_ids: list[str] = []
    consumed_allocations: list[MealIngredientAllocationResponse] = []
    skipped_ingredients: list[MealPlanSkippedIngredientResponse] = []
    try:
        for ingredient in plan.ingredients:
            planned_allocations = _plan_allocations(ingredient)
            if requested_quantities is None:
                allocations = planned_allocations
            else:
                allocations = [
                    (food_id, requested_quantities.get(food_id, 0), unit)
                    for food_id, _, unit in planned_allocations
                    if requested_quantities.get(food_id, 0) > 0
                ]
            if not ingredient.available or not allocations:
                skipped_ingredients.append(
                    MealPlanSkippedIngredientResponse(
                        canonical_name=ingredient.canonical_name,
                        food_id=ingredient.available_food_id,
                        reason=(
                            "사용량을 0으로 설정해 소비하지 않았습니다."
                            if requested_quantities is not None and planned_allocations
                            else "추천 시점에 필요한 수량이 없어 소비 기록에서 제외했습니다."
                        ),
                    )
                )
                continue
            allocation_records: list[tuple[str, float, _FoodRecord]] = []
            skip_reason: str | None = None
            for food_id, allocation_quantity, allocation_unit in allocations:
                record = store.foods.get(food_id)
                if record is None:
                    skip_reason = "현재 재고에서 식품을 찾지 못했습니다."
                    break
                if not _same_quantity_unit(record.response.unit, allocation_unit):
                    skip_reason = "현재 재고 단위가 레시피 단위와 달라 자동 차감하지 않았습니다."
                    break
                if record.response.quantity < allocation_quantity:
                    skip_reason = "현재 재고 수량이 레시피 필요량보다 적어 차감하지 않았습니다."
                    break
                allocation_records.append((food_id, allocation_quantity, record))
            if skip_reason:
                skipped_ingredients.append(
                    MealPlanSkippedIngredientResponse(
                        canonical_name=ingredient.canonical_name,
                        food_id=allocations[0][0],
                        reason=skip_reason,
                    )
                )
                continue

            for food_id, allocation_quantity, record in allocation_records:
                current_storage = record.response.storage_type
                remaining_quantity = round(record.response.quantity - allocation_quantity, 3)
                if remaining_quantity <= 0:
                    del store.foods[food_id]
                else:
                    record.response.quantity = remaining_quantity
                store.storage_events.append(
                    StorageEventResponse(
                        id=create_id("event"),
                        food_id=food_id,
                        event_type="consumed",
                        from_storage_type=current_storage,
                        to_storage_type=None,
                        quantity=allocation_quantity,
                        occurred_at=datetime.now(timezone.utc),
                        meal_plan_id=plan.id,
                    )
                )
                consumed_food_ids.append(food_id)
                consumed_allocations.append(MealIngredientAllocationResponse(food_id=food_id, quantity=allocation_quantity, unit=allocation_unit))

        if not consumed_food_ids:
            store.restore(snapshot)
            store.meal_plans[plan_id] = plan_snapshot
            store.flush()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="현재 재고가 바뀌어 조리 완료를 기록할 수 없습니다.")

        completed_at = datetime.now(timezone.utc)
        plan.completed_at = completed_at
        plan.consumed_food_ids = consumed_food_ids
        plan.consumed_allocations = consumed_allocations
        plan.completed_skipped_ingredients = [item.canonical_name for item in skipped_ingredients]
        store.meal_plans[plan_id] = plan
        store.meal_plan_events.append(
            MealPlanAuditEventResponse(
                id=create_id("meal-event"),
                plan_id=plan.id,
                event_type="completed",
                occurred_at=completed_at,
                snapshot_hash=plan.snapshot_hash,
                consumed_allocations=consumed_allocations,
                skipped_ingredients=list(plan.completed_skipped_ingredients),
            )
        )
        store.reprioritize()
        store.flush()
    except HTTPException:
        raise
    except Exception as exc:
        store.restore(snapshot)
        store.meal_plans[plan_id] = plan_snapshot
        store.flush()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="식단 완료를 롤백했습니다.") from exc

    return MealPlanCompletionResponse(
        plan_id=plan.id,
        status="completed",
        completed_at=plan.completed_at,
        consumed_food_ids=consumed_food_ids,
        consumed_allocations=consumed_allocations,
        skipped_ingredients=skipped_ingredients,
    )
