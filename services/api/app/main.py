from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from copy import deepcopy
from contextlib import asynccontextmanager, contextmanager
from functools import partial
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
from threading import RLock, get_ident
from typing import Callable, Literal
from weakref import WeakValueDictionary
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .auth import (
    AccountRecord,
    AccountRepository,
    DuplicateAccount,
    DEFAULT_WORKSPACE_ID,
    InvalidGuestToken,
    auth_required,
    auth_secret,
    current_auth_context,
    create_account_workspace_id,
    create_guest_workspace_id,
    current_workspace_id,
    issue_account_token,
    issue_guest_token,
    normalize_email,
    PASSWORD_RESET_TTL,
    PostgresAccountRepository,
    reset_auth_context,
    reset_workspace,
    set_auth_context,
    set_workspace_id,
    verify_access_token,
    verify_password,
    verify_guest_token,
)
from .barcode import ParsedBarcode, parse_barcode
from .inference import InferenceTrace, PriorityInferenceRequest, PriorityInferenceResponse, infer_priority, infer_priority_for_api
from .email_delivery import PasswordResetDeliverySettings, submit_password_reset_email
from .grocy import GrocyClient, GrocyConfig, GrocyError
from .grocy_worker import GROCY_OUTBOX_LEASE_KEY, GrocyWorker, GrocyWorkerHeartbeatRecord, GrocyWorkerSettings
from .inventory_repository import InventoryInvariantError, InventoryNotFoundError, InventoryRepository
from .normalized_inventory import NormalizedInventoryAdapter
from .notifications import (
    FoodNotificationInput,
    GrocyNotificationInput,
    NotificationPreferences,
    NotificationReadAllResponse,
    NotificationResponse,
    PushSubscriptionRecord,
    PushSubscriptionDeleteResponse,
    PushSubscriptionRequest,
    PushSubscriptionSummaryResponse,
    build_notifications,
    notification_zone,
    push_endpoint_fingerprint,
)
from .meal_preferences import MealPreferences
from .notification_delivery import (
    NotificationDeliveryRecord,
    NotificationDeliveryRuntimeMetrics,
    NotificationDeliveryWorker,
    NotificationWorkerHeartbeatRecord,
    NotificationWorkerLeaseRecord,
    NotificationWorkerSettings,
    NotificationWorkerTickRequest,
    NotificationWorkerTickResponse,
)
from .operation_ledger import InvalidOperationKey, OperationLedger
from .product_enrichment import (
    ProductEnrichmentJobRecord,
    ProductEnrichmentWorker,
    ProductEnrichmentWorkerHeartbeatRecord,
    ProductEnrichmentWorkerLeaseRecord,
    ProductEnrichmentWorkerSettings,
    ProductEnrichmentWorkerTickRequest,
    ProductEnrichmentWorkerTickResponse,
)
from .postgres_readiness import check_postgres_migration_ledger, check_postgres_schema
from .postgres_connection import PostgresConnectionUnavailable, ReconnectablePostgresConnection
from .postgres_pool import PostgresOperationPool, PostgresPoolUnavailable, PooledConnectionProxy
from .workspace_mutation import WorkspaceMutation
from .observability import (
    REQUEST_ID_HEADER,
    RequestRuntimeMetrics,
    get_request_id,
    log_client_error,
    log_request,
    request_id_from_header,
    reset_request_id,
    route_template_from_scope,
    set_request_id,
    start_timer,
)
from .pipeline.label_parser import LabelDateCandidate, ParsedLabel, parse_label_text
from .pipeline.image_quality import (
    ImageQualityReport,
    OcrInputProfile,
    assess_image_quality,
    normalize_image_orientation,
    prepare_ocr_image,
)
from .pipeline.ocr import OcrObservation, OcrRun, PaddleOcrEngine, RemoteOcrEngine
from .pipeline.pdf_receipt import extract_pdf_text, looks_like_pdf
from .pipeline.pdf_renderer import render_pdf_pages
from .pipeline.receipt_parser import ParsedReceipt, parse_receipt_text, parse_receipt_observations
from .product_resolver import (
    MfdsI1250Resolver,
    OpenFoodFactsResolver,
    ProductLookupResult,
    ProductNameLookupCache,
    ProductNameFallbackResolver,
    ProductNameLookupResult,
    ProductLookupCache,
    ProductProviderRateLimiter,
    ProductProviderRuntimeMetrics,
    ProductSource,
    ReceiptNameResolution,
    SharedProductLookupCache,
    SharedProductNameLookupCache,
    SharedProductProviderRateLimiter,
    SourceFreshness,
    StorageHint,
    external_lookups_enabled,
    normalize_product_name,
    resolve_product,
    resolve_receipt_name,
)
from .meal_optimizer import optimize_multi_day_plans, warm_up_cp_sat
from .planner import MAX_SERVINGS, MIN_SERVINGS, PlannedRecipe, RecipeSpec, load_recipe_specs, normalize_unit, plan_recipe
from .rate_limit import PersistentSlidingWindowRateLimiter, SlidingWindowRateLimiter, opaque_rate_limit_key
from .recipe_catalog import (
    RecipeDraftIngredient,
    RecipeDraftRecord,
    RecipeReviewAuditEvent,
    RecipeCatalogConcurrentWriteError,
    approval_issues,
    approved_recipe_specs,
    draft_snapshot_hash,
    draft_from_cookrcp,
    RecipeCatalogMutation,
    SharedRecipeCatalogStore,
)
from .recipe_importer import COOKRCP_SERVICE_ID, COOKRCP_SOURCE_URL, CookRcpClient, CookRcpConfig, CookRcpImportError


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
ReceiptMatchSource = Literal["user_confirmed_alias", "local_rule", "parser", "local_fixture", "mfds_c005", "mfds_i1250", "open_food_facts", "unmatched"]
ProductProvenanceSource = Literal[
    "local_fixture",
    "open_food_facts",
    "mfds_c005",
    "mfds_i1250",
    "user_confirmed_alias",
    "local_rule",
    "parser",
]
StorageEventType = Literal["moved", "opened", "frozen", "thawed", "consumed", "discarded"]
GrocySyncStatus = Literal["not_configured", "needs_mapping", "queued", "in_flight", "succeeded", "dead_letter", "needs_reconciliation"]
GrocyOutboxStatus = Literal["blocked", "pending", "in_flight", "succeeded", "dead_letter", "reconciliation_required"]
GrocyOutboxOperation = Literal["receipt_add", "consume", "open", "transfer"]
GrocyReconciliationDecision = Literal["already_applied", "not_applied"]

REDACTED_RECEIPT_SOURCE_FILENAME = "원본 영수증 정보 삭제됨"
REDACTED_RECEIPT_RAW_NAME = "삭제된 OCR 원문"
operation_ledger = OperationLedger()


class ConcurrentWorkspaceWriteError(RuntimeError):
    """A PostgreSQL workspace changed after this store loaded its snapshot."""

    def __init__(
        self,
        message: str,
        *,
        expected_revision: int | None = None,
        current_revision: int | None = None,
    ) -> None:
        super().__init__(message)
        self.expected_revision = expected_revision
        self.current_revision = current_revision


class WorkspaceDeletionInProgress(RuntimeError):
    """Raised when a request races with the account workspace delete fence."""

    def __init__(self, workspace_id: str) -> None:
        super().__init__(f"workspace deletion is in progress: {workspace_id}")
        self.workspace_id = workspace_id


WORKSPACE_REVISION_REQUEST_HEADER = "If-Rescue-Meal-Revision"
WORKSPACE_REVISION_RESPONSE_HEADER = "X-Rescue-Meal-Workspace-Revision"
WORKSPACE_CONFLICT_HEADER = "X-Rescue-Meal-Conflict"
RECIPE_CATALOG_REVISION_REQUEST_HEADER = "If-Rescue-Meal-Recipe-Catalog-Revision"
RECIPE_CATALOG_REVISION_RESPONSE_HEADER = "X-Rescue-Meal-Recipe-Catalog-Revision"
WORKSPACE_REVISION_READ_ONLY_POST_PATHS = frozenset({
    "/api/account/delete",
    "/api/account/guest-transfer/preview",
    "/api/barcodes/parse",
    "/api/inference/priority",
    "/api/labels/intake",
    "/api/labels/parse-text",
    "/api/meal-plans/multi-day-preview",
    "/api/meal-plans/options",
    "/api/meal-plans/preview",
})


class DateAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: DateKind
    value: date | None = None
    display_label: str
    source: DateSource
    source_detail: str
    confidence: float = Field(ge=0, le=1)
    user_confirmed: bool = False
    applicable_storage_type: StorageCode | None = None
    storage_condition_text: str | None = Field(default=None, max_length=160)


class DateAssertionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["sell_by", "use_by", "best_before", "user_reminder"]
    date_value: date
    source_detail: str = Field(default="사용자가 확인한 날짜", min_length=1, max_length=160)
    applicable_storage_type: StorageCode | None = None
    storage_condition_text: str | None = Field(default=None, max_length=160)


class DateWindow(BaseModel):
    start_date: date
    end_date: date
    basis: str
    confidence: float = Field(ge=0, le=1)
    safety_disclaimer: str = "안전 판정이 아닌 먼저 확인할 순서입니다."
    inference_trace: InferenceTrace | None = None


class ProductProvenance(BaseModel):
    """The reviewed source behind a product-level candidate.

    This is intentionally separate from ``DateAssertion``. A provider can
    identify a product and suggest a storage hint without knowing the date
    printed on the individual package in the user's kitchen.
    """

    model_config = ConfigDict(extra="forbid")

    source: ProductProvenanceSource
    source_url: str | None = Field(default=None, max_length=2_000, pattern=r"^https?://")
    confidence: float = Field(ge=0, le=1)
    note: str = Field(min_length=1, max_length=240)
    storage_hint: StorageHint | None = None
    source_freshness: SourceFreshness = "unknown"


class ProductProvenanceAuditEvent(BaseModel):
    """Append-only before/after record for a reviewed product source."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    food_id: str = Field(min_length=1, max_length=160)
    action: Literal["applied", "replaced", "removed"]
    actor_id: str = Field(min_length=1, max_length=96)
    actor_role: Literal["guest", "user", "recipe_admin"]
    occurred_at: datetime
    before: ProductProvenance | None = None
    after: ProductProvenance | None = None
    reason: str = Field(min_length=1, max_length=240)


class FoodProductInfoSnapshot(BaseModel):
    """User-visible product fields captured by a correction audit."""

    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    display_name: str = Field(min_length=1, max_length=160)
    brand: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    product_provenance: ProductProvenance | None = None


class FoodProductInfoAuditEvent(BaseModel):
    """Append-only before/after record for a product profile correction."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    food_id: str = Field(min_length=1, max_length=160)
    action: Literal["updated"] = "updated"
    actor_id: str = Field(min_length=1, max_length=96)
    actor_role: Literal["guest", "user", "recipe_admin"]
    occurred_at: datetime
    before: FoodProductInfoSnapshot
    after: FoodProductInfoSnapshot
    reason: str = Field(min_length=1, max_length=240)


class FoodResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    parent_lot_id: str | None = None
    source_receipt_id: str | None = Field(default=None, max_length=160)
    source_receipt_line_id: str | None = Field(default=None, max_length=160)
    purchased_at: datetime | None = None
    barcode: str | None = Field(default=None, max_length=300)
    barcode_lot: str | None = Field(default=None, max_length=160)
    product_provenance: ProductProvenance | None = None
    canonical_name: str
    display_name: str
    brand: str
    quantity: float
    unit: str
    storage_type: StorageCode
    storage_location_id: str | None = Field(default=None, max_length=96)
    opened: bool
    opened_at: datetime | None = None
    date_assertion: DateAssertion
    date_assertion_history: list[DateAssertion] = Field(default_factory=list)
    estimated_use_first_window: DateWindow | None = None
    priority: int
    category: str
    image_path: str
    note: str


def _food_product_info_snapshot(food: FoodResponse) -> FoodProductInfoSnapshot:
    return FoodProductInfoSnapshot(
        canonical_name=food.canonical_name,
        display_name=food.display_name,
        brand=food.brand,
        category=food.category,
        product_provenance=food.product_provenance.model_copy(deep=True) if food.product_provenance else None,
    )


class StorageLocationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    name: str = Field(min_length=1, max_length=80)
    storage_type: StorageCode
    temperature_celsius: float | None = None
    temperature_source: Literal["sensor", "user_input", "not_measured"] = "not_measured"
    created_at: datetime


class StorageLocationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    storage_type: StorageCode

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not normalized:
            raise ValueError("storage location name must not be blank")
        return normalized


class StorageLocationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not normalized:
            raise ValueError("storage location name must not be blank")
        return normalized


BUILTIN_STORAGE_LOCATION_IDS = frozenset({"ambient", "refrigerated", "frozen"})


def _builtin_storage_locations() -> list[StorageLocationResponse]:
    created_at = datetime(1970, 1, 1, tzinfo=timezone.utc)
    return [
        StorageLocationResponse(id="ambient", name="실온", storage_type="ambient", created_at=created_at),
        StorageLocationResponse(id="refrigerated", name="냉장", storage_type="refrigerated", created_at=created_at),
        StorageLocationResponse(id="frozen", name="냉동", storage_type="frozen", created_at=created_at),
    ]


class StorageLocationDuplicateError(RuntimeError):
    """A workspace already has a custom location with the same name/class."""


class StorageLocationInUseError(RuntimeError):
    """A custom location cannot be deleted while current or historical data references it."""


class DashboardResponse(BaseModel):
    generated_at: datetime
    food_count: int
    rescue_count: int
    rescue_queue: list[FoodResponse]
    inventory: list[FoodResponse]
    storage_locations: list[StorageLocationResponse] = Field(default_factory=list)


class InventorySearchResponse(BaseModel):
    items: list[FoodResponse]
    total: int = Field(ge=0)
    offset: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    has_more: bool
    query: str
    storage_type: StorageCode | None = None
    storage_location_id: str | None = None


class WorkspaceRevisionResponse(BaseModel):
    """A payload-free read marker for bounded cross-device refresh probes."""

    revision: int = Field(ge=0)


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


class PasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=8, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class AccountDeletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=8, max_length=256)
    confirmation: Literal["DELETE"]


class AccountDeletionResponse(BaseModel):
    status: Literal["deleted"] = "deleted"
    message: str


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)


class PasswordResetRequestResponse(BaseModel):
    accepted: Literal[True] = True
    delivery_status: Literal["accepted"] = "accepted"
    message: str


class PasswordResetCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=40, max_length=512)
    new_password: str = Field(min_length=8, max_length=256)


class AccountSessionResponse(BaseModel):
    mode: Literal["account"] = "account"
    user_id: str
    email: str
    workspace_id: str
    role: Literal["user", "recipe_admin"] = "user"
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class AuthMeResponse(BaseModel):
    mode: Literal["guest", "account"]
    user_id: str | None = None
    email: str | None = None
    workspace_id: str
    role: Literal["guest", "user", "recipe_admin"] = "guest"
    account_status: Literal["active", "deleting"] | None = None


class GrocyStatusResponse(BaseModel):
    configured: bool
    status: Literal["disabled", "ok", "unavailable"]
    version: str | None = None
    detail: str


class ReadinessResponse(BaseModel):
    status: Literal["ready"] = "ready"
    storage: str
    database: Literal["not_applicable", "ok"]
    grocy_configured: bool
    auth_required: bool
    auth_configured: bool
    rate_limit_enabled: bool


ClientErrorKind = Literal["error", "type_error", "range_error", "reference_error", "syntax_error", "chunk_load_error", "unknown"]


class ClientErrorReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    surface: Literal["prototype"] = "prototype"
    error_kind: ClientErrorKind = "unknown"
    release: str = Field(default="web-unknown", min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._+-]+$")


class ClientErrorReportResponse(BaseModel):
    status: Literal["accepted", "disabled"]
    request_id: str


class RecipeSourceStatusResponse(BaseModel):
    provider: Literal["cookrcp01"] = "cookrcp01"
    service_id: str = COOKRCP_SERVICE_ID
    configured: bool
    status: Literal["disabled", "ready"]
    source_name: str
    source_url: str = COOKRCP_SOURCE_URL
    detail: str


class RecipeReviewCapabilitiesResponse(BaseModel):
    can_review: bool = True
    can_publish: bool
    publisher_policy: Literal["all_recipe_admins", "publisher_allowlist"]
    ownership_enabled: bool = True
    actor_type: Literal["account", "legacy_token"]


class RecipeReviewRevisionResponse(BaseModel):
    revision: int = Field(ge=0)


class RecipeDraftImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_idx: int = Field(default=1, ge=1)
    end_idx: int = Field(default=20, ge=1, le=100)
    menu_name: str | None = Field(default=None, max_length=160)
    ingredient_text: str | None = Field(default=None, max_length=300)
    changed_after: str | None = Field(default=None, max_length=30)
    category: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_range(self) -> "RecipeDraftImportRequest":
        if self.end_idx < self.start_idx:
            raise ValueError("COOKRCP 조회 범위의 끝 row는 시작 row보다 작을 수 없습니다.")
        return self


class RecipeDraftImportRejectedRowResponse(BaseModel):
    row_index: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=300)


class RecipeDraftImportResponse(BaseModel):
    total_count: int = Field(ge=0)
    accepted_count: int = Field(ge=0)
    persisted_count: int = Field(ge=0)
    rejected_count: int = Field(ge=0)
    draft_ids: list[str]
    rejected_rows: list[RecipeDraftImportRejectedRowResponse]
    source_name: str
    source_url: str
    source_revision: str
    retrieved_at: datetime


class RecipeDraftIngredientReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0, le=99)
    canonical_name: str | None = Field(default=None, max_length=160)
    canonical_amount: float | None = Field(default=None, gt=0)
    canonical_unit: str | None = Field(default=None, max_length=30)
    review_status: Literal["pending", "approved", "rejected"] = "approved"


class RecipeDraftReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=240)
    safety_note: str | None = Field(default=None, max_length=500)
    estimated_minutes: int | None = Field(default=None, ge=5, le=180)
    reviewer_note: str | None = Field(default=None, max_length=1_000)
    ingredients: list[RecipeDraftIngredientReviewUpdate] | None = Field(default=None, max_length=100)


class RecipeDraftApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    license_confirmed: bool = False


class RecipeDraftRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewer_note: str = Field(min_length=1, max_length=1_000)


class ReceiptMatchCandidateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: ReceiptMatchSource
    canonical_name: str = Field(min_length=1, max_length=160)
    source_url: str | None = Field(default=None, max_length=2_000, pattern=r"^https?://")
    brand: str | None = Field(default=None, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    quantity_text: str | None = Field(default=None, max_length=80)
    confidence: float = Field(ge=0, le=1)
    provenance_note: str = Field(min_length=1, max_length=240)
    shelf_life_text: str | None = Field(default=None, max_length=160)
    storage_hint: Literal["ambient", "refrigerated", "frozen"] | None = None
    source_freshness: Literal["current", "legacy", "unknown"] = "unknown"


class ProductAliasResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_name_key: str = Field(min_length=1, max_length=160)
    raw_name: str = Field(min_length=1, max_length=160)
    canonical_name: str = Field(min_length=1, max_length=160)
    source: Literal["user_confirmed", "local_rule"]
    confidence: float = Field(ge=0, le=1)
    use_count: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime


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
    match_source: ReceiptMatchSource = "parser"
    match_candidates: list[ReceiptMatchCandidateResponse] = Field(default_factory=list, max_length=10)
    source_observation_ids: list[str] = Field(default_factory=list, max_length=32)
    # Receipt barcode rows identify the product record only. They never carry
    # an individual package's consumption date or safety decision.
    barcode: str | None = Field(default=None, max_length=80)

    @field_validator("barcode")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        return _normalize_receipt_barcode(value)


class ReceiptDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_filename: str = Field(min_length=1, max_length=255)
    purchased_at: datetime | None = None
    template_id: Literal["grocery-mart-v1", "retail-beverage-v1", "restaurant-card-v1", "grocery-generic-v1", "generic-v1"] = "generic-v1"
    template_confidence: float = Field(default=0, ge=0, le=1)
    merchant_name: str | None = Field(default=None, min_length=1, max_length=80)
    lines: list[ReceiptLineInput] = Field(min_length=1, max_length=200)


class ReceiptLineDraft(BaseModel):
    id: str
    raw_name: str
    canonical_name: str | None
    quantity: float
    unit: str
    storage_suggestion: StorageCode | None = None
    unit_price: int | None
    total_price: int | None
    line_type: LineType
    match_confidence: float
    review_status: ReviewStatus
    review_reason: str | None = None
    match_source: ReceiptMatchSource = "parser"
    match_candidates: list[ReceiptMatchCandidateResponse] = Field(default_factory=list, max_length=10)
    source_observation_ids: list[str] = Field(default_factory=list, max_length=32)
    barcode: str | None = Field(default=None, max_length=80)

    @field_validator("barcode")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        return _normalize_receipt_barcode(value)


class ReceiptDraftResponse(BaseModel):
    id: str
    fingerprint: str
    status: ReceiptStatus
    source_filename: str
    purchased_at: datetime | None
    template_id: Literal["grocery-mart-v1", "retail-beverage-v1", "restaurant-card-v1", "grocery-generic-v1", "generic-v1"] = "generic-v1"
    template_confidence: float = Field(default=0, ge=0, le=1)
    merchant_name: str | None = Field(default=None, min_length=1, max_length=80)
    lines: list[ReceiptLineDraft]
    stock_created: bool = False


class ReceiptLineOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str | None = Field(default=None, min_length=1, max_length=160)
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    storage_type: StorageCode | None = None
    storage_location_id: str | None = Field(default=None, min_length=1, max_length=96)
    match_source: ReceiptMatchSource | None = None
    match_candidates: list[ReceiptMatchCandidateResponse] | None = Field(default=None, max_length=10)
    barcode: str | None = Field(default=None, max_length=80)

    @field_validator("barcode")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        return _normalize_receipt_barcode(value)

    @field_validator("canonical_name", "unit")
    @classmethod
    def trim_non_empty_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


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
    grocy_sync_status: GrocySyncStatus = "not_configured"
    idempotency_replayed: bool = False


class ReceiptSummaryResponse(BaseModel):
    id: str
    status: ReceiptStatus
    purchased_at: datetime | None
    merchant_name: str | None = Field(default=None, min_length=1, max_length=80)
    stock_created: bool
    line_count: int
    source_redacted: bool


class ReceiptPrivacyPolicyResponse(BaseModel):
    raw_upload_retention: Literal["transient"] = "transient"
    raw_upload_retention_days: int = 0
    draft_metadata: Literal["user_deletable"] = "user_deletable"
    committed_receipt_behavior: Literal["redact_source_preserve_inventory"] = "redact_source_preserve_inventory"
    message: str


class ReceiptPrivacyEraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm: Literal[True]


class ReceiptPrivacyEraseResponse(BaseModel):
    receipt_id: str
    status: Literal["deleted_draft", "redacted_pending", "redacted_committed"]
    inventory_preserved: bool
    raw_upload_retained: bool = False
    redacted_fields: list[str] = Field(default_factory=list)


class CommitTransactionRecord(BaseModel):
    id: str
    receipt_id: str
    fingerprint: str
    status: Literal["pending", "committed", "needs_reconciliation", "rolled_back"]
    error_code: str | None = None
    grocy_sync_status: GrocySyncStatus = "not_configured"
    idempotency_key_digest: str | None = Field(default=None, min_length=64, max_length=64)
    request_payload_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    created_lot_ids: list[str] = Field(default_factory=list, max_length=200)
    skipped_line_ids: list[str] = Field(default_factory=list, max_length=200)


class GrocyProductMappingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    grocy_product_id: int = Field(gt=0)
    grocy_unit: str | None = Field(default=None, max_length=30)
    barcode: str | None = Field(default=None, max_length=80)
    source: Literal["user_confirmed", "grocy_barcode", "admin"] = "user_confirmed"
    updated_by: str | None = Field(default=None, max_length=96)
    updated_by_email: str | None = Field(default=None, max_length=254)
    updated_at: datetime


class GrocyProductMappingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grocy_product_id: int = Field(gt=0)
    grocy_unit: str | None = Field(default=None, max_length=30)
    barcode: str | None = Field(default=None, max_length=80)
    source: Literal["user_confirmed", "grocy_barcode", "admin"] = "user_confirmed"


class GrocyProductMappingAuditEvent(BaseModel):
    """Immutable before/after record for a user-confirmed Grocy mapping change."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    canonical_name: str = Field(min_length=1, max_length=160)
    action: Literal["created", "updated"]
    actor_id: str = Field(min_length=1, max_length=96)
    actor_email: str | None = Field(default=None, max_length=254)
    occurred_at: datetime
    before: GrocyProductMappingResponse | None = None
    after: GrocyProductMappingResponse


class GrocyLocationMappingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    storage_type: StorageCode
    grocy_location_id: int = Field(gt=0)
    source: Literal["user_confirmed", "admin"] = "user_confirmed"
    updated_at: datetime


class GrocyLocationMappingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grocy_location_id: int = Field(gt=0)
    source: Literal["user_confirmed", "admin"] = "user_confirmed"


class GrocyOutboxRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    operation: GrocyOutboxOperation
    aggregate_id: str = Field(min_length=1, max_length=160)
    idempotency_key: str = Field(min_length=1, max_length=200)
    canonical_name: str = Field(min_length=1, max_length=160)
    grocy_product_id: int | None = Field(default=None, gt=0)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=30)
    spoiled: bool = False
    from_grocy_location_id: int | None = Field(default=None, gt=0)
    to_grocy_location_id: int | None = Field(default=None, gt=0)
    payload: dict[str, object] = Field(default_factory=dict)
    status: GrocyOutboxStatus = "pending"
    attempts: int = Field(default=0, ge=0, le=10)
    last_error: str | None = Field(default=None, max_length=300)
    last_dead_letter_error: str | None = Field(default=None, max_length=300)
    manual_retry_count: int = Field(default=0, ge=0, le=100)
    last_retry_note: str | None = Field(default=None, max_length=300)
    last_retry_at: datetime | None = None
    in_flight_started_at: datetime | None = None
    last_in_flight_started_at: datetime | None = None
    reconciliation_count: int = Field(default=0, ge=0, le=100)
    last_reconciliation_decision: GrocyReconciliationDecision | None = None
    last_reconciliation_note: str | None = Field(default=None, max_length=300)
    last_reconciled_at: datetime | None = None
    grocy_transaction_id: str | None = Field(default=None, max_length=160)
    created_at: datetime
    updated_at: datetime


class GrocyWorkerLeaseRecord(BaseModel):
    lease_key: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    acquired_at: datetime
    expires_at: datetime


class GrocyWorkerTickRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1, max_length=160)
    lease_seconds: int = Field(default=120, ge=30, le=3600)
    stale_after_seconds: int = Field(default=900, ge=60, le=86_400)
    process_limit: int = Field(default=20, ge=1, le=100)


class GrocyWorkerTickResponse(BaseModel):
    workspace_id: str
    worker_id: str
    lease_acquired: bool
    grocy_configured: bool
    scanned: int = Field(default=0, ge=0)
    reconciliation_marked: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    blocked: int = Field(default=0, ge=0)
    error: str | None = None


class GrocyOutboxProcessResponse(BaseModel):
    processed: int = Field(ge=0)
    succeeded: int = Field(ge=0)
    retried: int = Field(ge=0)
    dead_lettered: int = Field(ge=0)
    blocked: int = Field(ge=0)
    records: list[GrocyOutboxRecord]


class GrocyOutboxProcessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=20, ge=1, le=100)


class GrocyOutboxRetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operator_note: str | None = Field(default=None, max_length=300)


class GrocyOutboxReconcileScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stale_after_seconds: int = Field(default=900, ge=60, le=86_400)
    limit: int = Field(default=100, ge=1, le=100)


class GrocyOutboxReconcileScanResponse(BaseModel):
    scanned: int = Field(ge=0)
    marked: int = Field(ge=0)
    records: list[GrocyOutboxRecord]


class GrocyOutboxReconcileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: GrocyReconciliationDecision
    grocy_transaction_id: str | None = Field(default=None, max_length=160)
    operator_note: str | None = Field(default=None, max_length=300)


class StorageEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: StorageEventType
    to_storage_type: StorageCode | None = None
    to_storage_location_id: str | None = Field(default=None, min_length=1, max_length=96)
    quantity: float | None = Field(default=None, gt=0)


class StorageEventResponse(BaseModel):
    id: str
    food_id: str
    event_type: StorageEventType
    from_storage_type: StorageCode | None
    to_storage_type: StorageCode | None
    from_storage_location_id: str | None = None
    to_storage_location_id: str | None = None
    quantity: float | None
    occurred_at: datetime
    source: Literal["user_input"] = "user_input"
    created_child_food_id: str | None = None
    meal_plan_id: str | None = None
    grocy_sync_status: GrocySyncStatus = "not_configured"
    # Additive read model snapshot for clients that must preserve a successful
    # storage mutation when a follow-up dashboard read is stale or unavailable.
    inventory: list[FoodResponse] = Field(default_factory=list)


def _storage_event_persistence_payload(event: StorageEventResponse) -> dict[str, object]:
    """Serialize durable event metadata without response-only inventory data."""
    payload = event.model_dump(mode="json")
    payload.pop("inventory", None)
    return payload


class StorageEventSequenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[StorageEventRequest] = Field(min_length=1, max_length=2)


class StorageEventSequenceResponse(BaseModel):
    events: list[StorageEventResponse] = Field(min_length=1, max_length=2)
    final_food_id: str
    idempotency_replayed: bool = False


class MealPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_ids: list[str] = Field(default_factory=list, max_length=20)
    max_minutes: int = Field(default=30, ge=5, le=180)
    servings: int = Field(default=1, ge=MIN_SERVINGS, le=MAX_SERVINGS)
    plan_id: str | None = Field(default=None, min_length=1, max_length=96)
    recipe_id: str | None = Field(default=None, min_length=1, max_length=160)
    bundle_id: str | None = Field(default=None, min_length=1, max_length=96)
    bundle_day_index: int | None = Field(default=None, ge=1, le=3)
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
    quantity_match: Literal["exact", "converted", "incompatible", "missing"] = "missing"
    allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)


class MealPlanResponse(BaseModel):
    id: str
    snapshot_hash: str = ""
    saved_at: datetime | None = None
    completed_at: datetime | None = None
    consumed_food_ids: list[str] = Field(default_factory=list)
    completed_skipped_ingredients: list[str] = Field(default_factory=list)
    consumed_allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)
    bundle_id: str | None = None
    bundle_day_index: int | None = Field(default=None, ge=1, le=3)
    allergens: list[str] | None = None
    allergen_metadata_status: Literal["known", "unknown"] = "unknown"
    preference_filtered: bool = False
    preference_note: str | None = None
    date_review_required: bool = False
    date_review_foods: list[str] = Field(default_factory=list, max_length=20)
    date_review_note: str | None = None
    recipe_id: str
    planner_version: str
    source: str
    title: str
    minutes: int
    max_minutes: int = 30
    servings: int = Field(default=1, ge=MIN_SERVINGS, le=MAX_SERVINGS)
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


class MealPlanOptionsResponse(BaseModel):
    options: list[MealPlanResponse]
    max_minutes: int
    servings: int = Field(default=1, ge=MIN_SERVINGS, le=MAX_SERVINGS)
    inventory_ids: list[str]


class MultiDayMealPlanDayResponse(BaseModel):
    day_index: int = Field(ge=1, le=3)
    plan_date: date
    plan: MealPlanResponse
    status: Literal["planned", "saved", "completed"] = "planned"
    meal_plan_id: str | None = None
    completed_at: datetime | None = None


class MultiDayMealPlanResponse(BaseModel):
    id: str
    snapshot_hash: str
    generated_at: datetime
    saved_at: datetime | None = None
    optimization_engine: Literal["or-tools-cp-sat", "deterministic-greedy"] = "deterministic-greedy"
    max_minutes: int
    servings: int = Field(default=1, ge=MIN_SERVINGS, le=MAX_SERVINGS)
    inventory_ids: list[str]
    days: list[MultiDayMealPlanDayResponse] = Field(max_length=3)


class MultiDayMealPlanSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_ids: list[str] = Field(default_factory=list, max_length=20)
    max_minutes: int = Field(default=30, ge=5, le=180)
    servings: int = Field(default=1, ge=MIN_SERVINGS, le=MAX_SERVINGS)
    bundle_id: str | None = Field(default=None, min_length=1, max_length=96)
    snapshot_hash: str | None = Field(default=None, min_length=16, max_length=128)


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
    grocy_sync_status: GrocySyncStatus = "not_configured"


class MealPlanAuditEventResponse(BaseModel):
    id: str
    plan_id: str
    event_type: Literal["saved", "completed"]
    occurred_at: datetime
    snapshot_hash: str
    consumed_allocations: list[MealIngredientAllocationResponse] = Field(default_factory=list)
    skipped_ingredients: list[str] = Field(default_factory=list)


class ShoppingListSourceResponse(BaseModel):
    source_type: Literal["meal_plan", "multi_day", "manual"]
    source_id: str
    day_index: int | None = Field(default=None, ge=1, le=3)
    quantity: float = Field(gt=0)


class ShoppingListItemResponse(BaseModel):
    id: str
    canonical_name: str
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=30)
    checked: bool = False
    sources: list[ShoppingListSourceResponse] = Field(default_factory=list, max_length=100)
    created_at: datetime
    updated_at: datetime


class ShoppingListBuildRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: Literal["meal_plan", "multi_day"]
    source_id: str = Field(min_length=1, max_length=160)


class ShoppingListManualItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    quantity: float = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=30)


class ShoppingListMutationResponse(BaseModel):
    items: list[ShoppingListItemResponse]
    added_count: int
    updated_count: int
    removed_count: int


class ShoppingListReceiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: float = Field(gt=0, le=100000)
    storage_type: StorageCode = "refrigerated"
    storage_location_id: str | None = Field(default=None, min_length=1, max_length=96)


class ShoppingListReceiveResponse(BaseModel):
    status: Literal["received"] = "received"
    shopping_item_id: str
    received_quantity: float
    inventory_lot: FoodResponse
    items: list[ShoppingListItemResponse]
    removed_planned_source_count: int = Field(default=0, ge=0)
    idempotency_replayed: bool = False


class ShoppingListReceiveOperation(BaseModel):
    """Durable receipt of a user-confirmed shopping-list receive command."""

    model_config = ConfigDict(extra="forbid")

    id: str
    shopping_item_id: str
    food_id: str
    canonical_name: str
    unit: str
    quantity: float = Field(gt=0)
    storage_type: StorageCode
    storage_location_id: str | None = Field(default=None, max_length=96)
    request_fingerprint: str = Field(min_length=64, max_length=64)
    idempotency_key_digest: str | None = Field(default=None, min_length=64, max_length=64)
    request_payload_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    occurred_at: datetime


class ManualFoodOperationRecord(BaseModel):
    """Durable replay record for a client-confirmed manual food command."""

    model_config = ConfigDict(extra="forbid")

    id: str
    food_id: str
    lot_action: Literal["create", "correct"]
    idempotency_key_digest: str = Field(min_length=64, max_length=64)
    request_payload_fingerprint: str = Field(min_length=64, max_length=64)
    occurred_at: datetime


class WorkspaceExportAuditEvent(BaseModel):
    """Server-side audit record for a generated workspace export.

    This record is deliberately not part of the user-facing export payload:
    it identifies who requested a sensitive snapshot and correlates the
    request without copying credentials, IP addresses, or the snapshot itself
    into the downloaded file.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    actor_id: str = Field(min_length=1, max_length=96)
    actor_role: Literal["guest", "user", "recipe_admin"]
    request_id: str = Field(min_length=1, max_length=96)
    schema_version: Literal["rescue-meal-export-v1"] = "rescue-meal-export-v1"
    exported_at: datetime


class ShoppingListItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checked: bool


class WorkspaceExportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["rescue-meal-export-v1"] = "rescue-meal-export-v1"
    exported_at: datetime
    workspace_id: str
    inventory: list[FoodResponse]
    storage_locations: list[StorageLocationResponse] = Field(default_factory=list)
    product_provenance_events: list[ProductProvenanceAuditEvent] = Field(default_factory=list)
    product_info_events: list[FoodProductInfoAuditEvent] = Field(default_factory=list)
    receipt_summaries: list[ReceiptSummaryResponse]
    storage_events: list[StorageEventResponse]
    commit_transactions: list[CommitTransactionRecord]
    meal_plans: list[MealPlanResponse]
    multi_day_meal_plans: list[MultiDayMealPlanResponse]
    shopping_list: list[ShoppingListItemResponse]
    shopping_receive_operations: list[ShoppingListReceiveOperation] = Field(default_factory=list)
    meal_preferences: MealPreferences
    notification_preferences: NotificationPreferences
    push_subscriptions: list[PushSubscriptionSummaryResponse]
    manual_food_operations: list[ManualFoodOperationRecord] = Field(default_factory=list)


class GuestTransferRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    guest_access_token: str = Field(min_length=32, max_length=512)
    confirm: bool = False


class GuestTransferPreviewResponse(BaseModel):
    status: Literal["ready", "empty", "already_transferred", "conflict"]
    food_count: int
    receipt_count: int
    storage_event_count: int
    meal_plan_count: int
    multi_day_plan_count: int
    shopping_list_count: int
    shopping_receive_operation_count: int = Field(default=0, ge=0)
    storage_location_count: int = Field(default=0, ge=0)
    meal_preferences_changed: bool
    push_subscription_count: int
    notification_preferences_changed: bool
    message: str


class GuestTransferResponse(BaseModel):
    status: Literal["completed", "already_transferred"]
    imported_food_count: int
    imported_receipt_count: int
    imported_storage_event_count: int
    imported_meal_plan_count: int
    imported_multi_day_plan_count: int
    imported_shopping_list_count: int
    imported_shopping_receive_operation_count: int = Field(default=0, ge=0)
    imported_storage_location_count: int = Field(default=0, ge=0)
    imported_meal_preferences: bool
    imported_push_subscription_count: int
    imported_notification_preferences: bool
    message: str


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
    source: ProductSource
    source_url: str | None
    canonical_name: str
    brand: str | None
    category: str | None
    quantity_text: str | None
    confidence: float = Field(ge=0, le=1)
    provenance_note: str
    shelf_life_text: str | None = None
    storage_hint: StorageHint | None = None
    source_freshness: Literal["current", "legacy", "unknown"] = "unknown"


class ProductLookupResponse(BaseModel):
    barcode: str
    status: Literal["matched", "partial", "not_found", "provider_unavailable"]
    candidates: list[ProductCandidateResponse]
    warnings: list[str]
    requires_review: bool
    provider_statuses: dict[str, Literal["matched", "not_found", "unavailable", "rate_limited", "disabled"]] = Field(default_factory=dict)


class ProductProviderMetricResponse(BaseModel):
    scope: Literal["barcode", "product_name", "single_flight"]
    provider: str
    cache_hits: int = 0
    cache_misses: int = 0
    single_flight_waits: int = 0
    single_flight_hits: int = 0
    single_flight_timeouts: int = 0
    provider_calls: int = 0
    rate_limited: int = 0
    matched: int = 0
    not_found: int = 0
    unavailable: int = 0
    last_latency_ms: float | None = None
    last_status: str | None = None
    last_event_at: float | None = None


class ProductProviderRuntimeStatusResponse(BaseModel):
    external_lookup_enabled: bool
    product_cache_backend: Literal["shared_sql", "process_local"]
    product_name_cache_backend: Literal["shared_sql", "process_local"]
    provider_rate_limiter_backend: Literal["shared_sql", "process_local"]
    metrics: list[ProductProviderMetricResponse]


class ProductNameLookupResponse(BaseModel):
    query: str
    provider: Literal["mfds_i1250", "open_food_facts"] = "mfds_i1250"
    status: Literal["matched", "not_found", "unavailable", "rate_limited", "disabled"]
    candidates: list[ProductCandidateResponse]
    warnings: list[str]
    requires_review: bool = True


class ProductInfoUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    brand: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)

    @field_validator("canonical_name", "brand", "category")
    @classmethod
    def trim_non_empty_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class ManualFoodRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str = Field(min_length=1, max_length=160)
    lot_action: Literal["create", "correct"] | None = None
    target_food_id: str | None = Field(default=None, min_length=1, max_length=160)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="개", min_length=1, max_length=30)
    storage_type: StorageCode = "refrigerated"
    storage_location_id: str | None = Field(default=None, min_length=1, max_length=96)
    category: str = Field(default="기타", max_length=80)
    note: str = Field(default="날짜와 보관 방법을 확인해 주세요.", max_length=300)
    brand: str = Field(default="직접 추가한 식품", max_length=160)
    image_path: str = Field(default="/assets/food/tomato.png", max_length=300)
    date_kind: DateKind = "unknown"
    date_value: date | None = None
    date_source: DateSource = "unknown"
    date_source_detail: str = Field(default="사용자 입력 대기", max_length=160)
    barcode: str | None = Field(default=None, max_length=300)
    barcode_lot: str | None = Field(default=None, max_length=160)
    product_provenance: ProductProvenance | None = None
    applicable_storage_type: StorageCode | None = None
    storage_condition_text: str | None = Field(default=None, max_length=160)
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
    blur_score: float | None
    warnings: list[str]
    orientation_corrected: bool = False


class OcrReviewObservationResponse(BaseModel):
    """Safe source-location metadata for the receipt review overlay.

    OCR text is deliberately excluded because a receipt observation may be a
    phone number, address, loyalty identifier, or payment detail. The review
    UI only needs a stable id, confidence, and normalized location to connect
    a product line back to the uploaded image.
    """

    id: str
    bbox: list[float] = Field(min_length=4, max_length=4)
    confidence: float = Field(ge=0, le=1)


class OcrIntakeResponse(BaseModel):
    status: Literal["review_required", "needs_ocr_engine", "failed"]
    source_filename: str
    file_sha256: str
    engine: str
    model_version: str | None
    observations_count: int
    message: str
    quality: ImageQualityResponse
    ocr_input_profile: OcrInputProfile = "source"
    receipt_kind: str | None = None
    review_observations: list[OcrReviewObservationResponse] = Field(default_factory=list, max_length=200)
    draft: ReceiptDraftResponse | None = None


class LabelDateCandidateResponse(BaseModel):
    kind: str
    value: date
    raw_text: str
    confidence: float
    requires_review: bool
    context: str
    source_observation_ids: list[str] = Field(default_factory=list, max_length=32)


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
    storage_condition_text: str | None = None
    date_candidates: list[LabelDateCandidateResponse]
    consumption_date_candidate: LabelDateCandidateResponse | None
    review_observations: list[OcrReviewObservationResponse] = Field(default_factory=list, max_length=200)
    warnings: list[str]
    requires_review: bool
    quality: ImageQualityResponse | None = None
    ocr_input_profile: OcrInputProfile = "source"


class _FoodRecord:
    def __init__(self, response: FoodResponse, *, purchased_at: datetime | None = None) -> None:
        self.response = response
        self.purchased_at = purchased_at if purchased_at is not None else response.purchased_at

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, _FoodRecord):
            return NotImplemented
        return self.response == other.response and self.purchased_at == other.purchased_at


class _ReceiptRecord:
    def __init__(self, response: ReceiptDraftResponse) -> None:
        self.response = response
        self.committed = False

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, _ReceiptRecord):
            return NotImplemented
        return self.response == other.response and self.committed == other.committed


_ATOMIC_STORE_STATE_FIELDS = frozenset({
    "foods",
    "receipts",
    "committed_fingerprints",
    "storage_events",
    "commit_transactions",
    "meal_plans",
    "multi_day_meal_plans",
    "shopping_list",
    "shopping_receive_operations",
    "manual_food_operations",
    "meal_preferences",
    "meal_plan_events",
    "recipe_drafts",
    "recipe_review_events",
    "grocy_mappings",
    "grocy_mapping_audit_events",
    "product_provenance_audit_events",
    "product_info_audit_events",
    "product_aliases",
    "product_enrichment_jobs",
    "product_enrichment_worker_leases",
    "product_enrichment_worker_heartbeats",
    "notification_read_at",
    "notification_preferences",
    "push_subscriptions",
    "notification_deliveries",
    "notification_worker_leases",
    "notification_worker_heartbeats",
    "grocy_location_mappings",
    "grocy_outbox",
    "grocy_worker_leases",
    "grocy_worker_heartbeats",
    "storage_locations",
    "export_audit_events",
})


class _AtomicStoreStateMixin:
    """Expose durable store state through a copy-on-write read snapshot.

    Durable stores refresh their in-memory projection while requests may still
    be reading it. Building into a private state dictionary prevents readers
    from observing the transient empty collections used by the loader. The
    loader thread is routed to that private dictionary until the complete
    projection is ready, then one state reference is swapped in.
    """

    def _initialize_atomic_state(self) -> None:
        object.__setattr__(self, "_state", {})
        object.__setattr__(self, "_atomic_loading_state", None)
        object.__setattr__(self, "_atomic_loading_owner", None)

    @contextmanager
    def _atomic_reload(self):
        previous_state = object.__getattribute__(self, "_state")
        previous_snapshot = {
            field: deepcopy(previous_state.get(field))
            for field in _ATOMIC_STORE_STATE_FIELDS
        }
        loading_state: dict[str, object] = {}
        object.__setattr__(self, "_atomic_loading_state", loading_state)
        object.__setattr__(self, "_atomic_loading_owner", get_ident())
        try:
            yield
        except BaseException:
            raise
        else:
            # A route may have appended to the current in-memory projection
            # while the database reload was in progress. Preserve such a
            # local mutation instead of replacing it with the older database
            # snapshot that the loader started from. PostgreSQL's revision
            # guard still decides whether that state may be flushed.
            for field, original_value in previous_snapshot.items():
                current_value = previous_state.get(field)
                if current_value != original_value:
                    loading_state[field] = current_value
            object.__setattr__(self, "_state", loading_state)
        finally:
            object.__setattr__(self, "_atomic_loading_state", None)
            object.__setattr__(self, "_atomic_loading_owner", None)

    def __getattribute__(self, name: str):
        if name in _ATOMIC_STORE_STATE_FIELDS:
            try:
                state = object.__getattribute__(self, "_state")
            except AttributeError:
                return object.__getattribute__(self, name)
            loading_state = object.__getattribute__(self, "_atomic_loading_state")
            loading_owner = object.__getattribute__(self, "_atomic_loading_owner")
            if loading_state is not None and loading_owner == get_ident():
                state = loading_state
            if name in state:
                return state[name]
        return object.__getattribute__(self, name)

    def __setattr__(self, name: str, value) -> None:
        if name in _ATOMIC_STORE_STATE_FIELDS:
            try:
                state = object.__getattribute__(self, "_state")
            except AttributeError:
                object.__setattr__(self, name, value)
                return
            loading_state = object.__getattribute__(self, "_atomic_loading_state")
            loading_owner = object.__getattribute__(self, "_atomic_loading_owner")
            if loading_state is not None and loading_owner == get_ident():
                state = loading_state
            state[name] = value
            return
        object.__setattr__(self, name, value)


class InMemoryStore:
    """Small deterministic repository used by the local MVP and API tests.

    The production replacement is PostgreSQL + Grocy. The public models already
    carry the provenance fields needed for that adapter, so no endpoint should
    depend on this storage implementation.
    """

    def __init__(self, *, seed: bool = True) -> None:
        self.backend_name = "in-memory-mvp"
        self._seed_enabled = seed
        self._lock = RLock()
        self._workspace_revision = 0
        self._workspace_write_guard: Callable[[str], None] | None = None
        self._workspace_write_bypass = False
        self.foods: dict[str, _FoodRecord] = {}
        self.receipts: dict[str, _ReceiptRecord] = {}
        self.committed_fingerprints: set[str] = set()
        self.storage_events: list[StorageEventResponse] = []
        self.commit_transactions: dict[str, CommitTransactionRecord] = {}
        self.meal_plans: dict[str, MealPlanResponse] = {}
        self.multi_day_meal_plans: dict[str, MultiDayMealPlanResponse] = {}
        self.shopping_list: dict[str, ShoppingListItemResponse] = {}
        self.shopping_receive_operations: dict[str, ShoppingListReceiveOperation] = {}
        self.manual_food_operations: dict[str, ManualFoodOperationRecord] = {}
        self.meal_preferences = MealPreferences()
        self.meal_plan_events: list[MealPlanAuditEventResponse] = []
        self.recipe_drafts: dict[str, RecipeDraftRecord] = {}
        self.recipe_review_events: list[RecipeReviewAuditEvent] = []
        self.grocy_mappings: dict[str, GrocyProductMappingResponse] = {}
        self.grocy_mapping_audit_events: list[GrocyProductMappingAuditEvent] = []
        self.product_provenance_audit_events: list[ProductProvenanceAuditEvent] = []
        self.product_info_audit_events: list[FoodProductInfoAuditEvent] = []
        self.product_aliases: dict[str, ProductAliasResponse] = {}
        self.product_enrichment_jobs: dict[str, ProductEnrichmentJobRecord] = {}
        self.product_enrichment_worker_leases: dict[str, ProductEnrichmentWorkerLeaseRecord] = {}
        self.product_enrichment_worker_heartbeats: dict[str, ProductEnrichmentWorkerHeartbeatRecord] = {}
        self.notification_read_at: dict[str, datetime] = {}
        self.notification_preferences = NotificationPreferences()
        self.push_subscriptions: dict[str, PushSubscriptionRecord] = {}
        self.notification_deliveries: dict[str, NotificationDeliveryRecord] = {}
        self.notification_worker_leases: dict[str, NotificationWorkerLeaseRecord] = {}
        self.notification_worker_heartbeats: dict[str, NotificationWorkerHeartbeatRecord] = {}
        self.grocy_location_mappings: dict[StorageCode, GrocyLocationMappingResponse] = {}
        self.grocy_outbox: dict[str, GrocyOutboxRecord] = {}
        self.grocy_worker_leases: dict[str, GrocyWorkerLeaseRecord] = {}
        self.grocy_worker_heartbeats: dict[str, GrocyWorkerHeartbeatRecord] = {}
        self.storage_locations: dict[str, StorageLocationResponse] = {}
        self.export_audit_events: list[WorkspaceExportAuditEvent] = []
        self.reset()

    def reset(self) -> None:
        self.foods.clear()
        self.receipts.clear()
        self.committed_fingerprints.clear()
        self.storage_events.clear()
        self.commit_transactions.clear()
        self.meal_plans.clear()
        self.multi_day_meal_plans.clear()
        self.shopping_list.clear()
        self.shopping_receive_operations.clear()
        self.manual_food_operations.clear()
        self.meal_preferences = MealPreferences()
        self.meal_plan_events.clear()
        self.recipe_drafts.clear()
        self.recipe_review_events.clear()
        self.grocy_mappings.clear()
        self.grocy_mapping_audit_events.clear()
        self.product_provenance_audit_events.clear()
        self.product_info_audit_events.clear()
        self.product_aliases.clear()
        self.product_enrichment_jobs.clear()
        self.product_enrichment_worker_leases.clear()
        self.product_enrichment_worker_heartbeats.clear()
        self.notification_read_at.clear()
        self.notification_preferences = NotificationPreferences()
        self.push_subscriptions.clear()
        self.notification_deliveries.clear()
        self.notification_worker_leases.clear()
        self.notification_worker_heartbeats.clear()
        self.grocy_location_mappings.clear()
        self.grocy_outbox.clear()
        self.grocy_worker_leases.clear()
        self.grocy_worker_heartbeats.clear()
        self.storage_locations.clear()
        self.export_audit_events.clear()
        if self._seed_enabled:
            for food in _seed_foods():
                self.foods[food.id] = _FoodRecord(food)

    @contextmanager
    def receipt_commit_lock(self, receipt_id: str):
        """Serialize commit attempts for one receipt within this API process.

        PostgreSQL's workspace revision still owns the cross-process boundary.
        This narrower lock closes the in-process window where two request
        threads could both observe an uncommitted draft and create duplicate
        lots before either request flips the receipt state.
        """

        with self._lock:
            locks = getattr(self, "_receipt_commit_locks", None)
            if locks is None:
                # Active context managers keep a strong reference to their
                # RLock. Completed receipt IDs therefore disappear from this
                # registry instead of growing for the life of the process.
                locks = WeakValueDictionary()
                self._receipt_commit_locks = locks
            if receipt_id in self.receipts:
                lock = locks.setdefault(receipt_id, RLock())
            else:
                # Do not let arbitrary 404 paths grow the per-receipt lock
                # registry. A draft created between this lookup and the
                # guarded read is still revalidated by the commit helper.
                lock = getattr(self, "_unknown_receipt_commit_lock", None)
                if lock is None:
                    lock = RLock()
                    self._unknown_receipt_commit_lock = lock
        with lock:
            yield

    @contextmanager
    def receipt_draft_lock(self, fingerprint: str):
        """Serialize duplicate receipt-draft creation within this API process.

        PostgreSQL's workspace revision remains the cross-process guard. This
        narrower lock prevents two local request threads from both observing
        the same pending fingerprint before either one flushes it.
        """

        with self._lock:
            locks = getattr(self, "_receipt_draft_locks", None)
            if locks is None:
                locks = WeakValueDictionary()
                self._receipt_draft_locks = locks
            lock = locks.setdefault(fingerprint, RLock())
        with lock:
            yield

    @contextmanager
    def manual_food_lock(self, identity: str):
        """Serialize manual lot creation or correction for one food identity.

        A manual request can either create a new lot or enrich an existing lot
        selected by the client. PostgreSQL's workspace revision protects the
        cross-process boundary; this narrower lock prevents two local request
        threads from both appending the same date history or applying the same
        target correction before either one flushes.
        """

        with self._lock:
            locks = getattr(self, "_manual_food_locks", None)
            if locks is None:
                locks = WeakValueDictionary()
                self._manual_food_locks = locks
            lock = locks.setdefault(identity, RLock())
        with lock:
            yield

    @contextmanager
    def meal_plan_lock(self, plan_id: str):
        """Serialize save/complete attempts for one saved meal plan."""

        with self._lock:
            locks = getattr(self, "_meal_plan_locks", None)
            if locks is None:
                locks = WeakValueDictionary()
                self._meal_plan_locks = locks
            if plan_id in self.meal_plans:
                lock = locks.setdefault(plan_id, RLock())
            else:
                lock = getattr(self, "_unknown_meal_plan_lock", None)
                if lock is None:
                    lock = RLock()
                    self._unknown_meal_plan_lock = lock
        with lock:
            yield

    @contextmanager
    def multi_day_plan_lock(self, bundle_id: str):
        """Serialize save attempts for one multi-day bundle."""

        with self._lock:
            locks = getattr(self, "_multi_day_plan_locks", None)
            if locks is None:
                locks = WeakValueDictionary()
                self._multi_day_plan_locks = locks
            if bundle_id in self.multi_day_meal_plans:
                lock = locks.setdefault(bundle_id, RLock())
            else:
                lock = getattr(self, "_unknown_multi_day_plan_lock", None)
                if lock is None:
                    lock = RLock()
                    self._unknown_multi_day_plan_lock = lock
        with lock:
            yield

    def purge(self) -> None:
        """Remove one workspace's data without restoring development fixtures."""

        with self._lock:
            seed_enabled = self._seed_enabled
            self._seed_enabled = False
            self._workspace_write_bypass = True
            try:
                self.reset()
            finally:
                self._workspace_write_bypass = False
                self._seed_enabled = seed_enabled

    def dashboard(self) -> DashboardResponse:
        foods = self._sorted_foods()
        rescue = [food.response for food in foods if food.response.priority <= 3]
        return DashboardResponse(
            generated_at=datetime.now(timezone.utc),
            food_count=len(foods),
            rescue_count=len(rescue),
            rescue_queue=rescue,
            inventory=[food.response for food in foods],
            storage_locations=self.list_storage_locations(),
        )

    def search_inventory(
        self,
        query: str = "",
        *,
        storage_type: StorageCode | None = None,
        storage_location_id: str | None = None,
        offset: int = 0,
        limit: int = 40,
    ) -> InventorySearchResponse:
        normalized_query = normalize_product_name(query)
        bounded_offset = max(0, offset)
        bounded_limit = max(1, min(limit, 100))
        with self._lock:
            matches: list[FoodResponse] = []
            for record in self._sorted_foods():
                response = record.response
                if storage_type is not None and response.storage_type != storage_type:
                    continue
                if storage_location_id is not None and response.storage_location_id != storage_location_id:
                    continue
                if normalized_query:
                    searchable = (
                        response.canonical_name,
                        response.display_name,
                        response.brand,
                        response.category,
                    )
                    if not any(normalized_query in normalize_product_name(value) for value in searchable):
                        continue
                matches.append(response.model_copy(deep=True))
        page = matches[bounded_offset:bounded_offset + bounded_limit]
        return InventorySearchResponse(
            items=page,
            total=len(matches),
            offset=bounded_offset,
            limit=bounded_limit,
            has_more=bounded_offset + len(page) < len(matches),
            query=query.strip(),
            storage_type=storage_type,
            storage_location_id=storage_location_id,
        )

    def get_meal_preferences(self) -> MealPreferences:
        with self._lock:
            return self.meal_preferences.model_copy(deep=True)

    def list_storage_locations(self) -> list[StorageLocationResponse]:
        with self._lock:
            custom = sorted(
                (location.model_copy(deep=True) for location in self.storage_locations.values()),
                key=lambda location: (normalize_product_name(location.name), location.id),
            )
        return _builtin_storage_locations() + custom

    def get_storage_location(self, location_id: str) -> StorageLocationResponse | None:
        if location_id in BUILTIN_STORAGE_LOCATION_IDS:
            return next((location for location in _builtin_storage_locations() if location.id == location_id), None)
        with self._lock:
            location = self.storage_locations.get(location_id)
            return location.model_copy(deep=True) if location is not None else None

    def create_storage_location(
        self,
        request: StorageLocationCreateRequest,
        *,
        persist: bool = True,
    ) -> StorageLocationResponse:
        name_key = normalize_product_name(request.name)
        with self._lock:
            if any(
                normalize_product_name(location.name) == name_key
                and location.storage_type == request.storage_type
                for location in self.storage_locations.values()
            ):
                raise StorageLocationDuplicateError("같은 canonical 보관 위치가 이미 있습니다.")
            location = StorageLocationResponse(
                id=create_id("storage-location"),
                name=request.name,
                storage_type=request.storage_type,
                temperature_source="not_measured",
                created_at=datetime.now(timezone.utc),
            )
            self.storage_locations[location.id] = location
            if persist:
                self.flush()
            return location.model_copy(deep=True)

    def update_storage_location(
        self,
        location_id: str,
        request: StorageLocationUpdateRequest,
        *,
        persist: bool = True,
    ) -> StorageLocationResponse:
        if location_id in BUILTIN_STORAGE_LOCATION_IDS:
            raise KeyError(location_id)
        name_key = normalize_product_name(request.name)
        with self._lock:
            location = self.storage_locations.get(location_id)
            if location is None:
                raise KeyError(location_id)
            if any(
                candidate.id != location_id
                and normalize_product_name(candidate.name) == name_key
                and candidate.storage_type == location.storage_type
                for candidate in self.storage_locations.values()
            ):
                raise StorageLocationDuplicateError("같은 canonical 보관 위치가 이미 있습니다.")
            location.name = request.name
            if persist:
                self.flush()
            return location.model_copy(deep=True)

    def delete_storage_location(self, location_id: str, *, persist: bool = True) -> bool:
        if location_id in BUILTIN_STORAGE_LOCATION_IDS:
            raise KeyError(location_id)
        with self._lock:
            if location_id not in self.storage_locations:
                raise KeyError(location_id)
            if any(record.response.storage_location_id == location_id for record in self.foods.values()):
                raise StorageLocationInUseError("이 보관 위치를 사용 중인 식품이 있습니다.")
            if any(
                event.from_storage_location_id == location_id
                or event.to_storage_location_id == location_id
                for event in self.storage_events
            ):
                raise StorageLocationInUseError("이 보관 위치를 참조하는 보관 기록이 있습니다.")
            if any(
                operation.storage_location_id == location_id
                for operation in self.shopping_receive_operations.values()
            ):
                raise StorageLocationInUseError("이 보관 위치를 참조하는 입고 기록이 있습니다.")
            del self.storage_locations[location_id]
            if persist:
                self.flush()
            return True

    def update_meal_preferences(self, preferences: MealPreferences, *, persist: bool = True) -> MealPreferences:
        with self._lock:
            self.meal_preferences = preferences.model_copy(deep=True)
            if persist:
                self.flush()
            return self.meal_preferences.model_copy(deep=True)

    def _sorted_foods(self) -> list[_FoodRecord]:
        return sorted(self.foods.values(), key=lambda item: (item.response.priority, item.response.display_name))

    def reprioritize(self, *, persist: bool = True) -> None:
        del persist
        for index, record in enumerate(self._sorted_foods(), start=1):
            record.response.priority = index

    def flush(self) -> None:
        """Persist pending in-memory mutations when a durable adapter exists."""

        self._assert_workspace_writable()
        self._workspace_revision += 1

    @property
    def workspace_revision(self) -> int:
        """Process-local revision used by the demo and SQLite adapters."""

        return self._workspace_revision

    @workspace_revision.setter
    def workspace_revision(self, value: int) -> None:
        self._workspace_revision = value

    @contextmanager
    def mutation_lock(self):
        """Serialize snapshot, mutation, and flush for one workspace."""

        with self._lock:
            yield

    def _assert_workspace_writable(self) -> None:
        if getattr(self, "_workspace_write_bypass", False):
            return
        guard = getattr(self, "_workspace_write_guard", None)
        if guard is not None:
            guard(getattr(self, "workspace_id", current_workspace_id()))

    def acquire_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.grocy_worker_leases.get(lease_key)
            if existing is not None and existing.expires_at > current_time and existing.worker_id != worker_id:
                return False
            self.grocy_worker_leases[lease_key] = GrocyWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=current_time + timedelta(seconds=lease_seconds),
            )
            self.flush()
            return True

    def renew_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.grocy_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            existing.expires_at = current_time + timedelta(seconds=lease_seconds)
            self.flush()
            return True

    def release_grocy_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            existing = self.grocy_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            del self.grocy_worker_leases[lease_key]
            self.flush()
            return True

    def record_grocy_worker_heartbeat(self, heartbeat: GrocyWorkerHeartbeatRecord) -> None:
        with self._lock:
            self.grocy_worker_heartbeats[heartbeat.worker_id] = heartbeat
            self.flush()

    def list_grocy_worker_heartbeats(self) -> list[GrocyWorkerHeartbeatRecord]:
        with self._lock:
            return sorted(self.grocy_worker_heartbeats.values(), key=lambda item: (item.last_tick_at, item.worker_id), reverse=True)

    def record_grocy_mapping_audit_event(self, event: GrocyProductMappingAuditEvent, *, persist: bool = True) -> None:
        with self._lock:
            self.grocy_mapping_audit_events.append(event)
            if persist:
                self.flush()

    def list_grocy_mapping_audit_events(self) -> list[GrocyProductMappingAuditEvent]:
        with self._lock:
            return sorted(
                (event.model_copy(deep=True) for event in self.grocy_mapping_audit_events),
                key=lambda event: (event.occurred_at, event.id),
                reverse=True,
            )

    def record_product_provenance_audit(
        self,
        *,
        food_id: str,
        before: ProductProvenance | None,
        after: ProductProvenance | None,
        reason: str,
    ) -> ProductProvenanceAuditEvent | None:
        """Append a changed product provenance snapshot without mutating it."""

        if before == after:
            return None
        auth_context = current_auth_context()
        event = ProductProvenanceAuditEvent(
            id=create_id("product-provenance-event"),
            food_id=food_id,
            action="applied" if before is None and after is not None else "removed" if after is None else "replaced",
            actor_id=auth_context.subject_id or "guest",
            actor_role=auth_context.role,
            occurred_at=datetime.now(timezone.utc),
            before=before.model_copy(deep=True) if before else None,
            after=after.model_copy(deep=True) if after else None,
            reason=reason.strip() or "상품 정보 provenance 변경",
        )
        with self._lock:
            self.product_provenance_audit_events.append(event)
        return event

    def list_product_provenance_audit_events(self, food_id: str, *, limit: int = 50) -> list[ProductProvenanceAuditEvent]:
        bounded_limit = max(1, min(limit, 100))
        with self._lock:
            return sorted(
                (
                    event.model_copy(deep=True)
                    for event in self.product_provenance_audit_events
                    if event.food_id == food_id
                ),
                key=lambda event: (event.occurred_at, event.id),
                reverse=True,
            )[:bounded_limit]

    def record_product_info_audit(
        self,
        *,
        food_id: str,
        before: FoodProductInfoSnapshot,
        after: FoodProductInfoSnapshot,
        reason: str,
    ) -> FoodProductInfoAuditEvent | None:
        if before == after:
            return None
        auth_context = current_auth_context()
        event = FoodProductInfoAuditEvent(
            id=create_id("product-info-event"),
            food_id=food_id,
            actor_id=auth_context.subject_id or "guest",
            actor_role=auth_context.role,
            occurred_at=datetime.now(timezone.utc),
            before=before.model_copy(deep=True),
            after=after.model_copy(deep=True),
            reason=reason.strip() or "상품 정보를 수정했습니다.",
        )
        with self._lock:
            self.product_info_audit_events.append(event)
        return event

    def list_product_info_audit_events(self, food_id: str, *, limit: int = 50) -> list[FoodProductInfoAuditEvent]:
        bounded_limit = max(1, min(limit, 100))
        with self._lock:
            return sorted(
                (
                    event.model_copy(deep=True)
                    for event in self.product_info_audit_events
                    if event.food_id == food_id
                ),
                key=lambda event: (event.occurred_at, event.id),
                reverse=True,
            )[:bounded_limit]

    def product_alias_map(self) -> dict[str, str]:
        with self._lock:
            return {key: record.canonical_name for key, record in self.product_aliases.items()}

    def upsert_product_alias(
        self,
        *,
        raw_name: str,
        canonical_name: str,
        confidence: float = 1.0,
        persist: bool = True,
    ) -> ProductAliasResponse:
        raw = raw_name.strip()
        canonical = canonical_name.strip()
        raw_name_key = normalize_product_name(raw)
        if not raw_name_key or not canonical:
            raise ValueError("상품 별칭과 canonical 상품명이 필요합니다.")
        now = datetime.now(timezone.utc)
        with self._lock:
            existing = self.product_aliases.get(raw_name_key)
            record = ProductAliasResponse(
                raw_name_key=raw_name_key,
                raw_name=raw,
                canonical_name=canonical,
                source="user_confirmed",
                confidence=max(0.0, min(1.0, confidence)),
                use_count=(existing.use_count + 1) if existing else 1,
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            self.product_aliases[raw_name_key] = record
            if persist:
                self.flush()
            return record.model_copy(deep=True)

    def list_product_aliases(self, query: str | None = None, *, limit: int = 100) -> list[ProductAliasResponse]:
        normalized_query = normalize_product_name(query or "")
        with self._lock:
            records = [
                record.model_copy(deep=True)
                for key, record in self.product_aliases.items()
                if not normalized_query or normalized_query in key or normalized_query in normalize_product_name(record.canonical_name)
            ]
        return sorted(records, key=lambda item: (item.updated_at, item.raw_name_key), reverse=True)[:limit]

    def acquire_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.product_enrichment_worker_leases.get(lease_key)
            if existing is not None and existing.expires_at > current_time and existing.worker_id != worker_id:
                return False
            self.product_enrichment_worker_leases[lease_key] = ProductEnrichmentWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=current_time + timedelta(seconds=lease_seconds),
            )
            self.flush()
            return True

    def renew_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.product_enrichment_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            existing.expires_at = current_time + timedelta(seconds=lease_seconds)
            self.flush()
            return True

    def release_product_enrichment_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            existing = self.product_enrichment_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            del self.product_enrichment_worker_leases[lease_key]
            self.flush()
            return True

    def record_product_enrichment_worker_heartbeat(self, heartbeat: ProductEnrichmentWorkerHeartbeatRecord) -> None:
        with self._lock:
            self.product_enrichment_worker_heartbeats[heartbeat.worker_id] = heartbeat
            self.flush()

    def list_product_enrichment_worker_heartbeats(self) -> list[ProductEnrichmentWorkerHeartbeatRecord]:
        with self._lock:
            return sorted(
                self.product_enrichment_worker_heartbeats.values(),
                key=lambda item: (item.last_tick_at, item.worker_id),
                reverse=True,
            )

    def list_notification_read_states(self) -> dict[str, datetime]:
        with self._lock:
            return dict(self.notification_read_at)

    def mark_notification_read(
        self,
        notification_id: str,
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        with self._lock:
            self.notification_read_at[notification_id] = read_at or datetime.now(timezone.utc)
            if persist:
                self.flush()

    def mark_notifications_read(
        self,
        notification_ids: list[str],
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        if not notification_ids:
            return
        current_time = read_at or datetime.now(timezone.utc)
        with self._lock:
            for notification_id in notification_ids:
                self.notification_read_at[notification_id] = current_time
            if persist:
                self.flush()

    def get_notification_preferences(self) -> NotificationPreferences:
        with self._lock:
            return self.notification_preferences.model_copy(deep=True)

    def update_notification_preferences(
        self,
        preferences: NotificationPreferences,
        *,
        persist: bool = True,
    ) -> NotificationPreferences:
        with self._lock:
            self.notification_preferences = preferences.model_copy(deep=True)
            if persist:
                self.flush()
            return self.notification_preferences.model_copy(deep=True)

    def list_push_subscription_summaries(self) -> list[PushSubscriptionSummaryResponse]:
        with self._lock:
            return [
                PushSubscriptionSummaryResponse(
                    endpoint_fingerprint=push_endpoint_fingerprint(record.endpoint),
                    created_at=record.created_at,
                    updated_at=record.updated_at,
                )
                for record in sorted(self.push_subscriptions.values(), key=lambda item: (item.updated_at, item.endpoint), reverse=True)
            ]

    def upsert_push_subscription(
        self,
        request: PushSubscriptionRequest,
        *,
        persist: bool = True,
    ) -> PushSubscriptionSummaryResponse:
        now = datetime.now(timezone.utc)
        key = push_endpoint_fingerprint(request.endpoint)
        with self._lock:
            existing = self.push_subscriptions.get(key)
            record = PushSubscriptionRecord(
                endpoint=request.endpoint,
                p256dh=request.p256dh,
                auth=request.auth,
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            self.push_subscriptions[key] = record
            if persist:
                self.flush()
            return PushSubscriptionSummaryResponse(
                endpoint_fingerprint=key,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

    def delete_push_subscription(self, endpoint: str, *, persist: bool = True) -> bool:
        key = push_endpoint_fingerprint(endpoint)
        with self._lock:
            removed = self.push_subscriptions.pop(key, None) is not None
            if removed and persist:
                self.flush()
            return removed

    def delete_push_subscription_fingerprint(self, endpoint_fingerprint: str, *, persist: bool = True) -> bool:
        if not re.fullmatch(r"[0-9a-f]{16}", endpoint_fingerprint):
            return False
        with self._lock:
            removed = self.push_subscriptions.pop(endpoint_fingerprint, None) is not None
            if removed and persist:
                self.flush()
            return removed

    def acquire_notification_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.notification_worker_leases.get(lease_key)
            if existing is not None and existing.expires_at > current_time and existing.worker_id != worker_id:
                return False
            self.notification_worker_leases[lease_key] = NotificationWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=current_time + timedelta(seconds=lease_seconds),
            )
            self.flush()
            return True

    def renew_notification_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            existing = self.notification_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            existing.expires_at = current_time + timedelta(seconds=lease_seconds)
            self.flush()
            return True

    def release_notification_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            existing = self.notification_worker_leases.get(lease_key)
            if existing is None or existing.worker_id != worker_id:
                return False
            del self.notification_worker_leases[lease_key]
            self.flush()
            return True

    def record_notification_worker_heartbeat(self, heartbeat: NotificationWorkerHeartbeatRecord) -> None:
        with self._lock:
            self.notification_worker_heartbeats[heartbeat.worker_id] = heartbeat
            self.flush()

    def list_notification_worker_heartbeats(self) -> list[NotificationWorkerHeartbeatRecord]:
        with self._lock:
            return sorted(
                self.notification_worker_heartbeats.values(),
                key=lambda item: (item.last_tick_at, item.worker_id),
                reverse=True,
            )

    def snapshot(self) -> tuple[dict[str, _FoodRecord], dict[str, _ReceiptRecord], set[str], dict[str, CommitTransactionRecord], list[StorageEventResponse], list[MealPlanAuditEventResponse], dict[str, MealPlanResponse], dict[str, MultiDayMealPlanResponse], MealPreferences, dict[str, ShoppingListItemResponse], dict[str, RecipeDraftRecord], list[RecipeReviewAuditEvent], dict[str, GrocyProductMappingResponse], list[GrocyProductMappingAuditEvent], dict[str, ProductAliasResponse], dict[str, ProductEnrichmentJobRecord], dict[str, datetime], NotificationPreferences, dict[str, PushSubscriptionRecord], dict[StorageCode, GrocyLocationMappingResponse], dict[str, GrocyOutboxRecord], list[ProductProvenanceAuditEvent], list[FoodProductInfoAuditEvent], dict[str, ShoppingListReceiveOperation], dict[str, ManualFoodOperationRecord], dict[str, StorageLocationResponse]]:
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
            {transaction_id: transaction.model_copy(deep=True) for transaction_id, transaction in self.commit_transactions.items()},
            [event.model_copy(deep=True) for event in self.storage_events],
            [event.model_copy(deep=True) for event in self.meal_plan_events],
            {plan_id: plan.model_copy(deep=True) for plan_id, plan in self.meal_plans.items()},
            {bundle_id: bundle.model_copy(deep=True) for bundle_id, bundle in self.multi_day_meal_plans.items()},
            self.meal_preferences.model_copy(deep=True),
            {item_id: item.model_copy(deep=True) for item_id, item in self.shopping_list.items()},
            {draft_id: draft.model_copy(deep=True) for draft_id, draft in self.recipe_drafts.items()},
            [event.model_copy(deep=True) for event in self.recipe_review_events],
            {name: mapping.model_copy(deep=True) for name, mapping in self.grocy_mappings.items()},
            [event.model_copy(deep=True) for event in self.grocy_mapping_audit_events],
            {key: alias.model_copy(deep=True) for key, alias in self.product_aliases.items()},
            {job_id: job.model_copy(deep=True) for job_id, job in self.product_enrichment_jobs.items()},
            dict(self.notification_read_at),
            self.notification_preferences.model_copy(deep=True),
            {key: record.model_copy(deep=True) for key, record in self.push_subscriptions.items()},
            {storage_type: mapping.model_copy(deep=True) for storage_type, mapping in self.grocy_location_mappings.items()},
            {outbox_id: record.model_copy(deep=True) for outbox_id, record in self.grocy_outbox.items()},
            [event.model_copy(deep=True) for event in self.product_provenance_audit_events],
            [event.model_copy(deep=True) for event in self.product_info_audit_events],
            {operation_id: operation.model_copy(deep=True) for operation_id, operation in self.shopping_receive_operations.items()},
            {operation_id: operation.model_copy(deep=True) for operation_id, operation in self.manual_food_operations.items()},
            {location_id: location.model_copy(deep=True) for location_id, location in self.storage_locations.items()},
        )

    def restore(self, snapshot: tuple[dict[str, _FoodRecord], dict[str, _ReceiptRecord], set[str], dict[str, CommitTransactionRecord], list[StorageEventResponse], list[MealPlanAuditEventResponse], dict[str, MealPlanResponse], dict[str, MultiDayMealPlanResponse], MealPreferences, dict[str, ShoppingListItemResponse], dict[str, RecipeDraftRecord], list[RecipeReviewAuditEvent], dict[str, GrocyProductMappingResponse], list[GrocyProductMappingAuditEvent], dict[str, ProductAliasResponse], dict[str, ProductEnrichmentJobRecord], dict[str, datetime], NotificationPreferences, dict[str, PushSubscriptionRecord], dict[StorageCode, GrocyLocationMappingResponse], dict[str, GrocyOutboxRecord], list[ProductProvenanceAuditEvent], list[FoodProductInfoAuditEvent], dict[str, ShoppingListReceiveOperation], dict[str, ManualFoodOperationRecord], dict[str, StorageLocationResponse]]) -> None:
        foods, receipts, fingerprints, commit_transactions, events, meal_plan_events, meal_plans, multi_day_meal_plans, meal_preferences, shopping_list, recipe_drafts, recipe_review_events, grocy_mappings, grocy_mapping_audit_events, product_aliases, product_enrichment_jobs, notification_read_at, notification_preferences, push_subscriptions, grocy_location_mappings, grocy_outbox, product_provenance_audit_events, product_info_audit_events, shopping_receive_operations, manual_food_operations, storage_locations = snapshot
        self.foods = foods
        self.receipts = receipts
        self.committed_fingerprints = fingerprints
        self.commit_transactions = commit_transactions
        self.storage_events = events
        self.meal_plan_events = meal_plan_events
        self.meal_plans = meal_plans
        self.multi_day_meal_plans = multi_day_meal_plans
        self.meal_preferences = meal_preferences
        self.shopping_list = shopping_list
        self.recipe_drafts = recipe_drafts
        self.recipe_review_events = recipe_review_events
        self.grocy_mappings = grocy_mappings
        self.grocy_mapping_audit_events = grocy_mapping_audit_events
        self.product_aliases = product_aliases
        self.product_enrichment_jobs = product_enrichment_jobs
        self.notification_read_at = notification_read_at
        self.notification_preferences = notification_preferences
        self.push_subscriptions = push_subscriptions
        self.grocy_location_mappings = grocy_location_mappings
        self.grocy_outbox = grocy_outbox
        self.product_provenance_audit_events = product_provenance_audit_events
        self.product_info_audit_events = product_info_audit_events
        self.shopping_receive_operations = shopping_receive_operations
        self.manual_food_operations = manual_food_operations
        self.storage_locations = storage_locations

    def upsert_recipe_draft(self, draft: RecipeDraftRecord) -> RecipeDraftRecord:
        existing = self.recipe_drafts.get(draft.id)
        if existing is not None:
            return existing
        self.recipe_drafts[draft.id] = draft
        return draft

    def approved_recipe_specs(self) -> tuple[RecipeSpec, ...]:
        return approved_recipe_specs(list(self.recipe_drafts.values()))

    def record_recipe_review_event(self, event: RecipeReviewAuditEvent) -> None:
        self.recipe_review_events.append(event)
        self.flush()

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
        source_receipt_id: str | None = None,
        persist: bool = True,
    ) -> str:
        del persist
        canonical_name = (override.canonical_name if override and override.canonical_name else line.canonical_name) or _normalize_product_name(line.raw_name)
        quantity = override.quantity if override and override.quantity is not None else line.quantity
        unit = override.unit if override and override.unit else line.unit
        storage_type = override.storage_type if override and override.storage_type is not None else (line.storage_suggestion or "refrigerated")
        storage_location_id = override.storage_location_id if override is not None else None
        validated_storage_location = _validate_storage_location_for_store(self, storage_location_id, storage_type)
        barcode = _normalize_receipt_barcode(
            override.barcode if override and override.barcode is not None else line.barcode
        )
        product_candidate = _receipt_product_candidate(line, canonical_name)
        if product_candidate is None and line.match_candidates:
            # The review line may still contain candidates for the OCR name
            # after a user edits the canonical name. Do not persist that stale
            # evidence alongside the committed lot.
            line.match_candidates = []
            if line.match_source != "unmatched":
                line.match_source = "parser"
        incoming = _receipt_food(
            canonical_name,
            quantity,
            unit,
            line.match_confidence,
            purchased_at,
            storage_type=storage_type,
            brand_override=product_candidate.brand if product_candidate else None,
            category_override=product_candidate.category if product_candidate else None,
            product_provenance=_receipt_product_provenance(line, canonical_name),
            barcode=barcode,
            storage_location_id=validated_storage_location.id if validated_storage_location else None,
        )
        incoming.source_receipt_id = source_receipt_id
        incoming.source_receipt_line_id = f"{source_receipt_id}:{line.id}" if source_receipt_id else line.id
        incoming.purchased_at = purchased_at
        lot_id = _inventory_authority(self).create_receipt_lot(incoming, purchased_at=purchased_at)
        if incoming.product_provenance is not None:
            self.record_product_provenance_audit(
                food_id=lot_id,
                before=None,
                after=incoming.product_provenance,
                reason="영수증 검토에서 확인한 상품 후보를 구매 lot에 적용했습니다.",
            )
        return lot_id

    def receipt_summaries(self) -> list[ReceiptSummaryResponse]:
        with self._lock:
            summaries = [
                ReceiptSummaryResponse(
                    id=receipt_id,
                    status=record.response.status,
                    purchased_at=record.response.purchased_at,
                    merchant_name=record.response.merchant_name,
                    stock_created=record.response.stock_created,
                    line_count=len(record.response.lines),
                    source_redacted=record.response.source_filename == REDACTED_RECEIPT_SOURCE_FILENAME,
                )
                for receipt_id, record in self.receipts.items()
            ]
        return sorted(
            summaries,
            key=lambda item: (item.purchased_at or datetime.min.replace(tzinfo=timezone.utc), item.id),
            reverse=True,
        )

    def privacy_erase_receipt(self, receipt_id: str, *, persist: bool = True) -> ReceiptPrivacyEraseResponse:
        with self._lock:
            record = self.receipts.get(receipt_id)
            if record is None:
                raise KeyError(receipt_id)
            has_transaction = any(transaction.receipt_id == receipt_id for transaction in self.commit_transactions.values())
            if not record.committed and record.response.status != "committed" and not has_transaction:
                del self.receipts[receipt_id]
                if persist:
                    self.flush()
                return ReceiptPrivacyEraseResponse(
                    receipt_id=receipt_id,
                    status="deleted_draft",
                    inventory_preserved=True,
                    redacted_fields=["receipt_metadata"],
                )

            already_redacted = record.response.source_filename == REDACTED_RECEIPT_SOURCE_FILENAME
            record.response.source_filename = REDACTED_RECEIPT_SOURCE_FILENAME
            for line in record.response.lines:
                line.raw_name = REDACTED_RECEIPT_RAW_NAME
                line.review_reason = None
            if persist:
                self.flush()
            return ReceiptPrivacyEraseResponse(
                receipt_id=receipt_id,
                status="redacted_committed" if record.committed or record.response.status == "committed" else "redacted_pending",
                inventory_preserved=True,
                redacted_fields=[] if already_redacted else ["source_filename", "raw_name"],
            )

    def export_workspace_data(self, workspace_id: str) -> WorkspaceExportResponse:
        with self._lock:
            return WorkspaceExportResponse(
                exported_at=datetime.now(timezone.utc),
                workspace_id=workspace_id,
                inventory=[record.response.model_copy(deep=True) for record in self._sorted_foods()],
                storage_locations=self.list_storage_locations(),
                product_provenance_events=self.list_product_provenance_audit_events_for_export(),
                product_info_events=self.list_product_info_audit_events_for_export(),
                receipt_summaries=self.receipt_summaries(),
                storage_events=[event.model_copy(deep=True) for event in self.storage_events],
                commit_transactions=[transaction.model_copy(deep=True) for transaction in self.commit_transactions.values()],
                meal_plans=[plan.model_copy(deep=True) for plan in self.meal_plans.values()],
                multi_day_meal_plans=[plan.model_copy(deep=True) for plan in self.multi_day_meal_plans.values()],
                shopping_list=[item.model_copy(deep=True) for item in self.shopping_list.values()],
                shopping_receive_operations=[
                    operation.model_copy(deep=True)
                    for operation in sorted(
                        self.shopping_receive_operations.values(),
                        key=lambda item: (item.occurred_at, item.id),
                    )
                ],
                meal_preferences=self.meal_preferences.model_copy(deep=True),
                notification_preferences=self.notification_preferences.model_copy(deep=True),
                push_subscriptions=self.list_push_subscription_summaries(),
                manual_food_operations=[
                    operation.model_copy(deep=True)
                    for operation in sorted(
                        self.manual_food_operations.values(),
                        key=lambda item: (item.occurred_at, item.id),
                    )
                ],
            )

    def record_export_audit_event(self, event: WorkspaceExportAuditEvent, *, persist: bool = True) -> None:
        del persist
        with self._lock:
            if any(existing.id == event.id for existing in self.export_audit_events):
                return
            self.export_audit_events.append(event.model_copy(deep=True))

    def list_export_audit_events(self, *, limit: int = 100) -> list[WorkspaceExportAuditEvent]:
        bounded_limit = max(1, min(int(limit), 1000))
        with self._lock:
            events = sorted(
                (event.model_copy(deep=True) for event in self.export_audit_events),
                key=lambda item: (item.exported_at, item.id),
                reverse=True,
            )
        return events[:bounded_limit]

    def list_product_provenance_audit_events_for_export(self) -> list[ProductProvenanceAuditEvent]:
        with self._lock:
            return [
                event.model_copy(deep=True)
                for event in sorted(
                    self.product_provenance_audit_events,
                    key=lambda item: (item.occurred_at, item.id),
                )
            ]

    def list_product_info_audit_events_for_export(self) -> list[FoodProductInfoAuditEvent]:
        with self._lock:
            return [
                event.model_copy(deep=True)
                for event in sorted(
                    self.product_info_audit_events,
                    key=lambda item: (item.occurred_at, item.id),
                )
            ]


def _receipt_snapshot(record: _ReceiptRecord) -> _ReceiptRecord:
    snapshot = _ReceiptRecord(record.response.model_copy(deep=True))
    snapshot.committed = record.committed
    return snapshot


class SqliteStore(_AtomicStoreStateMixin, InMemoryStore):
    """Durable local repository with the same contract as the MVP store.

    This is a development bridge, not a replacement for the PostgreSQL
    migration. Keeping the API-facing models identical lets local developers
    verify restart persistence before the production database adapter lands.
    """

    def __init__(self, database_path: str, *, seed: bool = True) -> None:
        self._initialize_atomic_state()
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
        self.multi_day_meal_plans = {}
        self.shopping_list = {}
        self.shopping_receive_operations = {}
        self.manual_food_operations = {}
        self.meal_preferences = MealPreferences()
        self.meal_plan_events = []
        self.recipe_drafts = {}
        self.recipe_review_events = []
        self.grocy_mappings = {}
        self.grocy_mapping_audit_events = []
        self.product_provenance_audit_events = []
        self.product_info_audit_events = []
        self.product_aliases = {}
        self.product_enrichment_jobs = {}
        self.product_enrichment_worker_leases = {}
        self.product_enrichment_worker_heartbeats = {}
        self.notification_read_at = {}
        self.notification_preferences = NotificationPreferences()
        self.push_subscriptions = {}
        self.notification_deliveries = {}
        self.notification_worker_leases = {}
        self.notification_worker_heartbeats = {}
        self.grocy_location_mappings = {}
        self.grocy_outbox = {}
        self.grocy_worker_leases = {}
        self.grocy_worker_heartbeats = {}
        self.storage_locations = {}
        self.export_audit_events = []
        self._workspace_revision = 0
        self._initialize_schema()
        self._workspace_revision = self._read_workspace_revision()
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
            CREATE TABLE IF NOT EXISTS multi_day_meal_plans (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shopping_list (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shopping_receive_operations (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS manual_food_operations (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meal_preferences (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meal_plan_events (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recipe_drafts (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recipe_review_events (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_mappings (
                canonical_name TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_mapping_audit_events (
                id TEXT PRIMARY KEY,
                canonical_name TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS grocy_mapping_audit_events_name_time_idx
                ON grocy_mapping_audit_events (canonical_name, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS product_provenance_audit_events (
                id TEXT PRIMARY KEY,
                food_id TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS product_provenance_audit_events_food_time_idx
                ON product_provenance_audit_events (food_id, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS product_info_audit_events (
                id TEXT PRIMARY KEY,
                food_id TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS product_info_audit_events_food_time_idx
                ON product_info_audit_events (food_id, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS product_aliases (
                raw_name_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS product_enrichment_jobs (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS product_enrichment_worker_leases (
                lease_key TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                acquired_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS product_enrichment_worker_heartbeats (
                worker_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_read_states (
                notification_id TEXT PRIMARY KEY,
                read_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id TEXT PRIMARY KEY CHECK (id = 'workspace'),
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint_hash TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_deliveries (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_worker_leases (
                lease_key TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                acquired_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_worker_heartbeats (
                worker_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_location_mappings (
                storage_type TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_outbox (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_worker_leases (
                lease_key TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                acquired_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grocy_worker_heartbeats (
                worker_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS storage_locations (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS export_audit_events (
                id TEXT PRIMARY KEY,
                actor_id TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                request_id TEXT NOT NULL,
                schema_version TEXT NOT NULL,
                exported_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS export_audit_events_time_idx
                ON export_audit_events (exported_at DESC, id DESC);
            CREATE TABLE IF NOT EXISTS workspace_metadata (
                id TEXT PRIMARY KEY CHECK (id = 'workspace'),
                revision INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO workspace_metadata (id, revision) VALUES ('workspace', 0);
            """
        )
        self._connection.commit()

    def _read_workspace_revision(self) -> int:
        row = self._connection.execute(
            "SELECT revision FROM workspace_metadata WHERE id = 'workspace'"
        ).fetchone()
        return int(row["revision"]) if row is not None else 0

    def refresh(self) -> None:
        """Reload the local projection so another process's write is visible."""
        with self._lock:
            self._workspace_revision = self._read_workspace_revision()
            if self._has_rows():
                self._load_all()

    def _has_rows(self) -> bool:
        for table_name in ("foods", "receipts", "storage_events", "commit_transactions", "meal_plans", "multi_day_meal_plans", "shopping_list", "shopping_receive_operations", "manual_food_operations", "meal_preferences", "meal_plan_events", "recipe_drafts", "recipe_review_events", "grocy_mappings", "grocy_mapping_audit_events", "product_provenance_audit_events", "product_info_audit_events", "product_aliases", "product_enrichment_jobs", "product_enrichment_worker_leases", "product_enrichment_worker_heartbeats", "notification_read_states", "notification_preferences", "push_subscriptions", "notification_deliveries", "notification_worker_leases", "notification_worker_heartbeats", "grocy_location_mappings", "grocy_outbox", "storage_locations", "export_audit_events"):
            row = self._connection.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
            if row and row["count"]:
                return True
        return False

    def _load_all(self) -> None:
        with self._lock, self._atomic_reload():
            self.foods = {}
            self.receipts = {}
            self.committed_fingerprints = {
                row["fingerprint"] for row in self._connection.execute("SELECT fingerprint FROM committed_fingerprints")
            }
            self.storage_events = []
            self.commit_transactions = {}
            self.meal_plans = {}
            self.multi_day_meal_plans = {}
            self.shopping_list = {}
            self.shopping_receive_operations = {}
            self.manual_food_operations = {}
            self.meal_preferences = MealPreferences()
            self.meal_plan_events = []
            self.recipe_drafts = {}
            self.recipe_review_events = []
            self.grocy_mappings = {}
            self.grocy_mapping_audit_events = []
            self.product_provenance_audit_events = []
            self.product_info_audit_events = []
            self.product_aliases = {}
            self.product_enrichment_jobs = {}
            self.product_enrichment_worker_leases = {}
            self.product_enrichment_worker_heartbeats = {}
            self.notification_read_at = {}
            self.notification_preferences = NotificationPreferences()
            self.push_subscriptions = {}
            self.notification_deliveries = {}
            self.notification_worker_leases = {}
            self.notification_worker_heartbeats = {}
            self.grocy_location_mappings = {}
            self.grocy_outbox = {}
            self.grocy_worker_leases = {}
            self.grocy_worker_heartbeats = {}
            self.storage_locations = {}
            self.export_audit_events = []
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
            for row in self._connection.execute("SELECT id, payload FROM multi_day_meal_plans"):
                self.multi_day_meal_plans[row["id"]] = MultiDayMealPlanResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM shopping_list"):
                self.shopping_list[row["id"]] = ShoppingListItemResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM shopping_receive_operations"):
                self.shopping_receive_operations[row["id"]] = ShoppingListReceiveOperation.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM manual_food_operations"):
                self.manual_food_operations[row["id"]] = ManualFoodOperationRecord.model_validate(json.loads(row["payload"]))
            preferences_row = self._connection.execute("SELECT payload FROM meal_preferences WHERE id = 'workspace'").fetchone()
            if preferences_row:
                self.meal_preferences = MealPreferences.model_validate(json.loads(preferences_row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM meal_plan_events"):
                self.meal_plan_events.append(MealPlanAuditEventResponse.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT id, payload FROM recipe_drafts"):
                self.recipe_drafts[row["id"]] = RecipeDraftRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM recipe_review_events"):
                self.recipe_review_events.append(RecipeReviewAuditEvent.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT canonical_name, payload FROM grocy_mappings"):
                self.grocy_mappings[row["canonical_name"]] = GrocyProductMappingResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM grocy_mapping_audit_events ORDER BY occurred_at DESC, id DESC"):
                self.grocy_mapping_audit_events.append(GrocyProductMappingAuditEvent.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT id, payload FROM product_provenance_audit_events ORDER BY occurred_at DESC, id DESC"):
                self.product_provenance_audit_events.append(ProductProvenanceAuditEvent.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT id, payload FROM product_info_audit_events ORDER BY occurred_at DESC, id DESC"):
                self.product_info_audit_events.append(FoodProductInfoAuditEvent.model_validate(json.loads(row["payload"])))
            for row in self._connection.execute("SELECT raw_name_key, payload FROM product_aliases"):
                self.product_aliases[row["raw_name_key"]] = ProductAliasResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM product_enrichment_jobs"):
                self.product_enrichment_jobs[row["id"]] = ProductEnrichmentJobRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM product_enrichment_worker_leases"):
                self.product_enrichment_worker_leases[row["lease_key"]] = ProductEnrichmentWorkerLeaseRecord(
                    lease_key=row["lease_key"],
                    worker_id=row["worker_id"],
                    acquired_at=datetime.fromisoformat(row["acquired_at"]),
                    expires_at=datetime.fromisoformat(row["expires_at"]),
                )
            for row in self._connection.execute("SELECT worker_id, payload FROM product_enrichment_worker_heartbeats"):
                self.product_enrichment_worker_heartbeats[row["worker_id"]] = ProductEnrichmentWorkerHeartbeatRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT notification_id, read_at FROM notification_read_states"):
                self.notification_read_at[row["notification_id"]] = datetime.fromisoformat(row["read_at"])
            preferences_row = self._connection.execute("SELECT payload FROM notification_preferences WHERE id = 'workspace'").fetchone()
            if preferences_row:
                self.notification_preferences = NotificationPreferences.model_validate(json.loads(preferences_row["payload"]))
            for row in self._connection.execute("SELECT endpoint_hash, payload FROM push_subscriptions"):
                self.push_subscriptions[row["endpoint_hash"]] = PushSubscriptionRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM notification_deliveries"):
                self.notification_deliveries[row["id"]] = NotificationDeliveryRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM notification_worker_leases"):
                self.notification_worker_leases[row["lease_key"]] = NotificationWorkerLeaseRecord(
                    lease_key=row["lease_key"],
                    worker_id=row["worker_id"],
                    acquired_at=datetime.fromisoformat(row["acquired_at"]),
                    expires_at=datetime.fromisoformat(row["expires_at"]),
                )
            for row in self._connection.execute("SELECT worker_id, payload FROM notification_worker_heartbeats"):
                self.notification_worker_heartbeats[row["worker_id"]] = NotificationWorkerHeartbeatRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT storage_type, payload FROM grocy_location_mappings"):
                self.grocy_location_mappings[row["storage_type"]] = GrocyLocationMappingResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM grocy_outbox"):
                self.grocy_outbox[row["id"]] = GrocyOutboxRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM grocy_worker_leases"):
                self.grocy_worker_leases[row["lease_key"]] = GrocyWorkerLeaseRecord(
                    lease_key=row["lease_key"],
                    worker_id=row["worker_id"],
                    acquired_at=datetime.fromisoformat(row["acquired_at"]),
                    expires_at=datetime.fromisoformat(row["expires_at"]),
                )
            for row in self._connection.execute("SELECT worker_id, payload FROM grocy_worker_heartbeats"):
                self.grocy_worker_heartbeats[row["worker_id"]] = GrocyWorkerHeartbeatRecord.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM storage_locations"):
                self.storage_locations[row["id"]] = StorageLocationResponse.model_validate(json.loads(row["payload"]))
            for row in self._connection.execute("SELECT id, payload FROM export_audit_events ORDER BY exported_at DESC, id DESC"):
                self.export_audit_events.append(WorkspaceExportAuditEvent.model_validate(json.loads(row["payload"])))

    def _persist_all(self) -> None:
        with self._lock:
            self._assert_workspace_writable()
            next_revision = self._workspace_revision + 1
            with self._connection:
                self._connection.execute(
                    """
                    INSERT INTO workspace_metadata (id, revision) VALUES ('workspace', ?)
                    ON CONFLICT (id) DO UPDATE SET revision = excluded.revision
                    """,
                    (next_revision,),
                )
                self._connection.execute("DELETE FROM foods")
                self._connection.execute("DELETE FROM receipts")
                self._connection.execute("DELETE FROM committed_fingerprints")
                self._connection.execute("DELETE FROM storage_events")
                self._connection.execute("DELETE FROM commit_transactions")
                self._connection.execute("DELETE FROM meal_plans")
                self._connection.execute("DELETE FROM multi_day_meal_plans")
                self._connection.execute("DELETE FROM shopping_list")
                self._connection.execute("DELETE FROM shopping_receive_operations")
                self._connection.execute("DELETE FROM manual_food_operations")
                self._connection.execute("DELETE FROM meal_preferences")
                self._connection.execute("DELETE FROM meal_plan_events")
                self._connection.execute("DELETE FROM recipe_drafts")
                self._connection.execute("DELETE FROM recipe_review_events")
                self._connection.execute("DELETE FROM grocy_mappings")
                self._connection.execute("DELETE FROM product_aliases")
                self._connection.execute("DELETE FROM product_enrichment_jobs")
                self._connection.execute("DELETE FROM product_enrichment_worker_leases")
                self._connection.execute("DELETE FROM product_enrichment_worker_heartbeats")
                self._connection.execute("DELETE FROM notification_read_states")
                self._connection.execute("DELETE FROM notification_preferences")
                self._connection.execute("DELETE FROM push_subscriptions")
                self._connection.execute("DELETE FROM notification_deliveries")
                self._connection.execute("DELETE FROM notification_worker_leases")
                self._connection.execute("DELETE FROM notification_worker_heartbeats")
                self._connection.execute("DELETE FROM grocy_location_mappings")
                self._connection.execute("DELETE FROM grocy_outbox")
                self._connection.execute("DELETE FROM storage_locations")
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
                    [(event.id, json.dumps(_storage_event_persistence_payload(event), ensure_ascii=False)) for event in self.storage_events],
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
                    "INSERT INTO multi_day_meal_plans (id, payload) VALUES (?, ?)",
                    [(plan_id, json.dumps(plan.model_dump(mode="json"), ensure_ascii=False)) for plan_id, plan in self.multi_day_meal_plans.items()],
                )
                self._connection.executemany(
                    "INSERT INTO shopping_list (id, payload) VALUES (?, ?)",
                    [(item_id, json.dumps(item.model_dump(mode="json"), ensure_ascii=False)) for item_id, item in self.shopping_list.items()],
                )
                self._connection.executemany(
                    "INSERT INTO shopping_receive_operations (id, payload) VALUES (?, ?)",
                    [(operation_id, json.dumps(operation.model_dump(mode="json"), ensure_ascii=False)) for operation_id, operation in self.shopping_receive_operations.items()],
                )
                self._connection.executemany(
                    "INSERT INTO manual_food_operations (id, payload) VALUES (?, ?)",
                    [(operation_id, json.dumps(operation.model_dump(mode="json"), ensure_ascii=False)) for operation_id, operation in self.manual_food_operations.items()],
                )
                self._connection.execute(
                    "INSERT INTO meal_preferences (id, payload) VALUES (?, ?)",
                    ("workspace", json.dumps(self.meal_preferences.model_dump(mode="json"), ensure_ascii=False)),
                )
                self._connection.executemany(
                    "INSERT INTO meal_plan_events (id, payload) VALUES (?, ?)",
                    [(event.id, json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.meal_plan_events],
                )
                self._connection.executemany(
                    "INSERT INTO recipe_drafts (id, payload) VALUES (?, ?)",
                    [(draft_id, json.dumps(draft.model_dump(mode="json"), ensure_ascii=False)) for draft_id, draft in self.recipe_drafts.items()],
                )
                self._connection.executemany(
                    "INSERT INTO recipe_review_events (id, payload) VALUES (?, ?)",
                    [(event.id, json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.recipe_review_events],
                )
                self._connection.executemany(
                    "INSERT INTO grocy_mappings (canonical_name, payload) VALUES (?, ?)",
                    [(name, json.dumps(mapping.model_dump(mode="json"), ensure_ascii=False)) for name, mapping in self.grocy_mappings.items()],
                )
                self._connection.executemany(
                    "INSERT OR IGNORE INTO grocy_mapping_audit_events (id, canonical_name, occurred_at, payload) VALUES (?, ?, ?, ?)",
                    [
                        (
                            event.id,
                            event.canonical_name,
                            event.occurred_at.isoformat(),
                            json.dumps(event.model_dump(mode="json"), ensure_ascii=False),
                        )
                        for event in self.grocy_mapping_audit_events
                    ],
                )
                self._connection.executemany(
                    "INSERT OR IGNORE INTO product_provenance_audit_events (id, food_id, occurred_at, payload) VALUES (?, ?, ?, ?)",
                    [(event.id, event.food_id, event.occurred_at.isoformat(), json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.product_provenance_audit_events],
                )
                self._connection.executemany(
                    "INSERT OR IGNORE INTO product_info_audit_events (id, food_id, occurred_at, payload) VALUES (?, ?, ?, ?)",
                    [(event.id, event.food_id, event.occurred_at.isoformat(), json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.product_info_audit_events],
                )
                self._connection.executemany(
                    "INSERT INTO product_aliases (raw_name_key, payload) VALUES (?, ?)",
                    [(raw_name_key, json.dumps(alias.model_dump(mode="json"), ensure_ascii=False)) for raw_name_key, alias in self.product_aliases.items()],
                )
                self._connection.executemany(
                    "INSERT INTO product_enrichment_jobs (id, payload) VALUES (?, ?)",
                    [(job_id, json.dumps(job.model_dump(mode="json"), ensure_ascii=False)) for job_id, job in self.product_enrichment_jobs.items()],
                )
                self._connection.executemany(
                    "INSERT INTO product_enrichment_worker_leases (lease_key, worker_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)",
                    [(lease_key, lease.worker_id, lease.acquired_at.isoformat(), lease.expires_at.isoformat()) for lease_key, lease in self.product_enrichment_worker_leases.items()],
                )
                self._connection.executemany(
                    "INSERT INTO product_enrichment_worker_heartbeats (worker_id, payload) VALUES (?, ?)",
                    [(worker_id, json.dumps(heartbeat.model_dump(mode="json"), ensure_ascii=False)) for worker_id, heartbeat in self.product_enrichment_worker_heartbeats.items()],
                )
                self._connection.executemany(
                    "INSERT INTO notification_read_states (notification_id, read_at) VALUES (?, ?)",
                    [(notification_id, read_at.isoformat()) for notification_id, read_at in self.notification_read_at.items()],
                )
                self._connection.execute(
                    "INSERT INTO notification_preferences (id, payload) VALUES (?, ?)",
                    ("workspace", json.dumps(self.notification_preferences.model_dump(mode="json"), ensure_ascii=False)),
                )
                self._connection.executemany(
                    "INSERT INTO push_subscriptions (endpoint_hash, payload) VALUES (?, ?)",
                    [(endpoint_hash, json.dumps(record.model_dump(mode="json"), ensure_ascii=False)) for endpoint_hash, record in self.push_subscriptions.items()],
                )
                self._connection.executemany(
                    "INSERT INTO notification_deliveries (id, payload) VALUES (?, ?)",
                    [(delivery_id, json.dumps(record.model_dump(mode="json"), ensure_ascii=False)) for delivery_id, record in self.notification_deliveries.items()],
                )
                self._connection.executemany(
                    "INSERT INTO notification_worker_leases (lease_key, worker_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)",
                    [(lease_key, lease.worker_id, lease.acquired_at.isoformat(), lease.expires_at.isoformat()) for lease_key, lease in self.notification_worker_leases.items()],
                )
                self._connection.executemany(
                    "INSERT INTO notification_worker_heartbeats (worker_id, payload) VALUES (?, ?)",
                    [(worker_id, json.dumps(heartbeat.model_dump(mode="json"), ensure_ascii=False)) for worker_id, heartbeat in self.notification_worker_heartbeats.items()],
                )
                self._connection.executemany(
                    "INSERT INTO grocy_location_mappings (storage_type, payload) VALUES (?, ?)",
                    [(storage_type, json.dumps(mapping.model_dump(mode="json"), ensure_ascii=False)) for storage_type, mapping in self.grocy_location_mappings.items()],
                )
                self._connection.executemany(
                    "INSERT INTO grocy_outbox (id, payload) VALUES (?, ?)",
                    [(outbox_id, json.dumps(record.model_dump(mode="json"), ensure_ascii=False)) for outbox_id, record in self.grocy_outbox.items()],
                )
                self._connection.executemany(
                    "INSERT INTO storage_locations (id, payload) VALUES (?, ?)",
                    [(location_id, json.dumps(location.model_dump(mode="json"), ensure_ascii=False)) for location_id, location in self.storage_locations.items()],
                )
            self._workspace_revision = next_revision

    def flush(self) -> None:
        self._persist_all()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def record_export_audit_event(self, event: WorkspaceExportAuditEvent, *, persist: bool = True) -> None:
        with self._lock:
            if any(existing.id == event.id for existing in self.export_audit_events):
                return
            if persist:
                try:
                    self._connection.execute(
                        """
                        INSERT OR IGNORE INTO export_audit_events
                            (id, actor_id, actor_role, request_id, schema_version, exported_at, payload)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            event.id,
                            event.actor_id,
                            event.actor_role,
                            event.request_id,
                            event.schema_version,
                            event.exported_at.isoformat(),
                            json.dumps(event.model_dump(mode="json"), ensure_ascii=False),
                        ),
                    )
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self.export_audit_events.append(event.model_copy(deep=True))

    def list_export_audit_events(self, *, limit: int = 100) -> list[WorkspaceExportAuditEvent]:
        bounded_limit = max(1, min(int(limit), 1000))
        with self._lock:
            rows = self._connection.execute(
                "SELECT id, payload FROM export_audit_events ORDER BY exported_at DESC, id DESC LIMIT ?",
                (bounded_limit,),
            ).fetchall()
            self.export_audit_events = [
                WorkspaceExportAuditEvent.model_validate(json.loads(row["payload"]))
                for row in rows
            ]
            return [event.model_copy(deep=True) for event in self.export_audit_events]

    def record_grocy_mapping_audit_event(self, event: GrocyProductMappingAuditEvent, *, persist: bool = True) -> None:
        with self._lock:
            if persist:
                self._connection.execute(
                    "INSERT INTO grocy_mapping_audit_events (id, canonical_name, occurred_at, payload) VALUES (?, ?, ?, ?)",
                    (
                        event.id,
                        event.canonical_name,
                        event.occurred_at.isoformat(),
                        json.dumps(event.model_dump(mode="json"), ensure_ascii=False),
                    ),
                )
                self._connection.commit()
            self.grocy_mapping_audit_events.append(event)

    def list_grocy_mapping_audit_events(self) -> list[GrocyProductMappingAuditEvent]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT id, payload FROM grocy_mapping_audit_events ORDER BY occurred_at DESC, id DESC"
            ).fetchall()
            self.grocy_mapping_audit_events = [
                GrocyProductMappingAuditEvent.model_validate(json.loads(row["payload"]))
                for row in rows
            ]
            return [event.model_copy(deep=True) for event in self.grocy_mapping_audit_events]

    def mark_notification_read(
        self,
        notification_id: str,
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        current_time = read_at or datetime.now(timezone.utc)
        with self._lock:
            if persist:
                self._connection.execute(
                    "INSERT OR REPLACE INTO notification_read_states (notification_id, read_at) VALUES (?, ?)",
                    (notification_id, current_time.isoformat()),
                )
                self._connection.commit()
            self.notification_read_at[notification_id] = current_time

    def mark_notifications_read(
        self,
        notification_ids: list[str],
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        if not notification_ids:
            return
        current_time = read_at or datetime.now(timezone.utc)
        with self._lock:
            if persist:
                self._connection.executemany(
                    "INSERT OR REPLACE INTO notification_read_states (notification_id, read_at) VALUES (?, ?)",
                    [(notification_id, current_time.isoformat()) for notification_id in notification_ids],
                )
                self._connection.commit()
            self.notification_read_at.update({notification_id: current_time for notification_id in notification_ids})

    def get_notification_preferences(self) -> NotificationPreferences:
        with self._lock:
            return self.notification_preferences.model_copy(deep=True)

    def update_notification_preferences(
        self,
        preferences: NotificationPreferences,
        *,
        persist: bool = True,
    ) -> NotificationPreferences:
        with self._lock:
            self.notification_preferences = preferences.model_copy(deep=True)
            if persist:
                self.flush()
            return self.notification_preferences.model_copy(deep=True)

    def list_push_subscription_summaries(self) -> list[PushSubscriptionSummaryResponse]:
        with self._lock:
            return [
                PushSubscriptionSummaryResponse(
                    endpoint_fingerprint=push_endpoint_fingerprint(record.endpoint),
                    created_at=record.created_at,
                    updated_at=record.updated_at,
                )
                for record in sorted(self.push_subscriptions.values(), key=lambda item: (item.updated_at, item.endpoint), reverse=True)
            ]

    def upsert_push_subscription(
        self,
        request: PushSubscriptionRequest,
        *,
        persist: bool = True,
    ) -> PushSubscriptionSummaryResponse:
        now = datetime.now(timezone.utc)
        key = push_endpoint_fingerprint(request.endpoint)
        with self._lock:
            existing = self.push_subscriptions.get(key)
            record = PushSubscriptionRecord(
                endpoint=request.endpoint,
                p256dh=request.p256dh,
                auth=request.auth,
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            self.push_subscriptions[key] = record
            if persist:
                self.flush()
            return PushSubscriptionSummaryResponse(
                endpoint_fingerprint=key,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

    def delete_push_subscription(self, endpoint: str, *, persist: bool = True) -> bool:
        key = push_endpoint_fingerprint(endpoint)
        with self._lock:
            removed = self.push_subscriptions.pop(key, None) is not None
            if removed and persist:
                self.flush()
            return removed

    def delete_push_subscription_fingerprint(self, endpoint_fingerprint: str, *, persist: bool = True) -> bool:
        if not re.fullmatch(r"[0-9a-f]{16}", endpoint_fingerprint):
            return False
        with self._lock:
            removed = self.push_subscriptions.pop(endpoint_fingerprint, None) is not None
            if removed and persist:
                self.flush()
            return removed

    def acquire_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE")
            try:
                row = self._connection.execute(
                    "SELECT worker_id, expires_at FROM grocy_worker_leases WHERE lease_key = ?",
                    (lease_key,),
                ).fetchone()
                if row is not None:
                    expires_at = datetime.fromisoformat(row["expires_at"])
                    if expires_at > current_time and row["worker_id"] != worker_id:
                        self._connection.rollback()
                        return False
                expires_at = current_time + timedelta(seconds=lease_seconds)
                self._connection.execute(
                    "INSERT OR REPLACE INTO grocy_worker_leases (lease_key, worker_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)",
                    (lease_key, worker_id, current_time.isoformat(), expires_at.isoformat()),
                )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.grocy_worker_leases[lease_key] = GrocyWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=expires_at,
            )
            return True

    def renew_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            cursor = self._connection.execute(
                "UPDATE grocy_worker_leases SET expires_at = ? WHERE lease_key = ? AND worker_id = ?",
                (expires_at.isoformat(), lease_key, worker_id),
            )
            self._connection.commit()
            if cursor.rowcount != 1:
                return False
            existing = self.grocy_worker_leases.get(lease_key)
            if existing is not None:
                existing.expires_at = expires_at
            return True

    def release_grocy_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            cursor = self._connection.execute(
                "DELETE FROM grocy_worker_leases WHERE lease_key = ? AND worker_id = ?",
                (lease_key, worker_id),
            )
            self._connection.commit()
            if cursor.rowcount != 1:
                return False
            self.grocy_worker_leases.pop(lease_key, None)
            return True

    def record_grocy_worker_heartbeat(self, heartbeat: GrocyWorkerHeartbeatRecord) -> None:
        with self._lock:
            self._connection.execute(
                "INSERT OR REPLACE INTO grocy_worker_heartbeats (worker_id, payload) VALUES (?, ?)",
                (heartbeat.worker_id, json.dumps(heartbeat.model_dump(mode="json"), ensure_ascii=False)),
            )
            self._connection.commit()
            self.grocy_worker_heartbeats[heartbeat.worker_id] = heartbeat

    def list_grocy_worker_heartbeats(self) -> list[GrocyWorkerHeartbeatRecord]:
        with self._lock:
            rows = self._connection.execute("SELECT worker_id, payload FROM grocy_worker_heartbeats").fetchall()
            self.grocy_worker_heartbeats = {
                row["worker_id"]: GrocyWorkerHeartbeatRecord.model_validate(json.loads(row["payload"]))
                for row in rows
            }
            return sorted(self.grocy_worker_heartbeats.values(), key=lambda item: (item.last_tick_at, item.worker_id), reverse=True)

    def acquire_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE")
            try:
                row = self._connection.execute(
                    "SELECT worker_id, expires_at FROM product_enrichment_worker_leases WHERE lease_key = ?",
                    (lease_key,),
                ).fetchone()
                if row is not None and datetime.fromisoformat(row["expires_at"]) > current_time and row["worker_id"] != worker_id:
                    self._connection.rollback()
                    return False
                self._connection.execute(
                    "INSERT OR REPLACE INTO product_enrichment_worker_leases (lease_key, worker_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)",
                    (lease_key, worker_id, current_time.isoformat(), expires_at.isoformat()),
                )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.product_enrichment_worker_leases[lease_key] = ProductEnrichmentWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=expires_at,
            )
            return True

    def renew_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            cursor = self._connection.execute(
                "UPDATE product_enrichment_worker_leases SET expires_at = ? WHERE lease_key = ? AND worker_id = ?",
                (expires_at.isoformat(), lease_key, worker_id),
            )
            self._connection.commit()
            if cursor.rowcount != 1:
                return False
            existing = self.product_enrichment_worker_leases.get(lease_key)
            if existing is not None:
                existing.expires_at = expires_at
            return True

    def release_product_enrichment_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            cursor = self._connection.execute(
                "DELETE FROM product_enrichment_worker_leases WHERE lease_key = ? AND worker_id = ?",
                (lease_key, worker_id),
            )
            self._connection.commit()
            if cursor.rowcount != 1:
                return False
            self.product_enrichment_worker_leases.pop(lease_key, None)
            return True

    def record_product_enrichment_worker_heartbeat(self, heartbeat: ProductEnrichmentWorkerHeartbeatRecord) -> None:
        with self._lock:
            self._connection.execute(
                "INSERT OR REPLACE INTO product_enrichment_worker_heartbeats (worker_id, payload) VALUES (?, ?)",
                (heartbeat.worker_id, json.dumps(heartbeat.model_dump(mode="json"), ensure_ascii=False)),
            )
            self._connection.commit()
            self.product_enrichment_worker_heartbeats[heartbeat.worker_id] = heartbeat

    def list_product_enrichment_worker_heartbeats(self) -> list[ProductEnrichmentWorkerHeartbeatRecord]:
        with self._lock:
            rows = self._connection.execute("SELECT worker_id, payload FROM product_enrichment_worker_heartbeats").fetchall()
            self.product_enrichment_worker_heartbeats = {
                row["worker_id"]: ProductEnrichmentWorkerHeartbeatRecord.model_validate(json.loads(row["payload"]))
                for row in rows
            }
            return sorted(self.product_enrichment_worker_heartbeats.values(), key=lambda item: (item.last_tick_at, item.worker_id), reverse=True)

    def reset(self) -> None:
        InMemoryStore.reset(self)
        with self._lock:
            self._connection.execute("DELETE FROM grocy_mapping_audit_events")
            self._connection.execute("DELETE FROM product_provenance_audit_events")
            self._connection.execute("DELETE FROM product_info_audit_events")
            self._connection.execute("DELETE FROM notification_read_states")
            self._connection.execute("DELETE FROM grocy_worker_leases")
            self._connection.execute("DELETE FROM grocy_worker_heartbeats")
            self._connection.execute("DELETE FROM export_audit_events")
            self._connection.commit()
        self._persist_all()

    def reprioritize(self, *, persist: bool = True) -> None:
        InMemoryStore.reprioritize(self)
        if persist:
            self._persist_all()

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
        source_receipt_id: str | None = None,
        persist: bool = True,
    ) -> str:
        lot_id = InMemoryStore.upsert_from_receipt(
            self,
            line=line,
            purchased_at=purchased_at,
            override=override,
            source_receipt_id=source_receipt_id,
            persist=False,
        )
        if persist:
            self._persist_all()
        return lot_id


@contextmanager
def _postgres_read_cursor(connection):
    """Run a read-only cursor and always end psycopg's implicit transaction.

    psycopg starts a transaction for a plain ``SELECT`` even when no write is
    performed. Leaving that transaction idle holds a snapshot and can block
    later schema maintenance. Store reads are not part of a caller-owned
    transaction, so rollback is the safest way to release it.
    """

    try:
        with connection.cursor() as cursor:
            yield cursor
    finally:
        connection.rollback()


class PostgresStore(_AtomicStoreStateMixin, InMemoryStore):
    """PostgreSQL-backed bridge for the current API projection.

    The normalized domain tables are created by the checked-in migration. The
    compatibility projection remains available, while an explicit
    ``RESCUE_MEAL_INVENTORY_MODE=normalized`` setting dual-writes and reads the
    workspace-scoped relational inventory adapter.
    """

    def __init__(
        self,
        database_url: str,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        seed: bool = True,
        connection=None,
        operation_pool: PostgresOperationPool | None = None,
        initialize_schema: bool = True,
        require_migration_gate: bool = False,
    ) -> None:
        self._initialize_atomic_state()
        self.database_url = database_url
        self.workspace_id = workspace_id
        inventory_mode = os.getenv("RESCUE_MEAL_INVENTORY_MODE", "projection").strip().lower() or "projection"
        if inventory_mode not in {"projection", "normalized"}:
            raise RuntimeError("RESCUE_MEAL_INVENTORY_MODE는 projection 또는 normalized여야 합니다.")
        self.inventory_mode = inventory_mode
        self.backend_name = "postgresql-normalized-inventory" if inventory_mode == "normalized" else "postgresql-projection"
        self._seed_enabled = seed
        self._lock = RLock()
        self._closed = False
        if connection is not None and operation_pool is not None:
            raise ValueError("connection and operation_pool are mutually exclusive")
        if operation_pool is not None:
            self._connection = PooledConnectionProxy(operation_pool)
        elif connection is not None:
            self._connection = connection
        else:
            try:
                import psycopg
            except ImportError as exc:  # pragma: no cover - dependency is installed in normal sync
                raise RuntimeError("PostgreSQL 모드에는 psycopg가 필요합니다.") from exc
            try:
                self._connection = ReconnectablePostgresConnection(database_url)
            except Exception as exc:  # pragma: no cover - requires external PostgreSQL
                raise RuntimeError(f"PostgreSQL 연결에 실패했습니다: {exc.__class__.__name__}") from exc
        self.foods = {}
        self.receipts = {}
        self.committed_fingerprints = set()
        self.storage_events = []
        self.commit_transactions = {}
        self.meal_plans = {}
        self.multi_day_meal_plans = {}
        self.shopping_list = {}
        self.shopping_receive_operations = {}
        self.manual_food_operations = {}
        self.meal_preferences = MealPreferences()
        self.meal_plan_events = []
        self.recipe_drafts = {}
        self.recipe_review_events = []
        self.grocy_mappings = {}
        self.grocy_mapping_audit_events = []
        self.product_provenance_audit_events = []
        self.product_info_audit_events = []
        self.product_aliases = {}
        self.product_enrichment_jobs = {}
        self.product_enrichment_worker_leases = {}
        self.product_enrichment_worker_heartbeats = {}
        self.notification_read_at = {}
        self.notification_preferences = NotificationPreferences()
        self.push_subscriptions = {}
        self.notification_deliveries = {}
        self.notification_worker_leases = {}
        self.notification_worker_heartbeats = {}
        self.grocy_location_mappings = {}
        self.grocy_outbox = {}
        self.grocy_worker_leases = {}
        self.grocy_worker_heartbeats = {}
        self.storage_locations = {}
        self.export_audit_events = []
        self._normalized_inventory = NormalizedInventoryAdapter(workspace_id) if inventory_mode == "normalized" else None
        self._workspace_revision = 0
        if initialize_schema:
            self._initialize_schema()
        if require_migration_gate:
            check_postgres_migration_ledger(self._connection)
            check_postgres_schema(self._connection, inventory_mode=self.inventory_mode)
        self._workspace_revision = self._read_workspace_revision()
        normalized_has_rows = self._normalized_inventory.has_rows(self._connection) if self._normalized_inventory is not None else False
        self._normalized_inventory_has_rows = normalized_has_rows
        has_rows = self._has_rows()
        if has_rows:
            self._load_all()
            if self._normalized_inventory is not None and not normalized_has_rows:
                self._persist_all()
        else:
            InMemoryStore.reset(self)
            try:
                self._persist_all()
            except ConcurrentWorkspaceWriteError:
                # Two API processes can bootstrap an empty PostgreSQL database
                # at the same time. The process that wins the workspace
                # revision owns the initial snapshot; the other process must
                # adopt that durable snapshot instead of failing startup with
                # a false database-unavailable error.
                self._workspace_revision = self._read_workspace_revision()
                if self._normalized_inventory is not None:
                    self._normalized_inventory_has_rows = self._normalized_inventory.has_rows(self._connection)
                self._load_all()

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
                            search_text text NOT NULL DEFAULT '',
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';
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
                        CREATE TABLE IF NOT EXISTS rescue_api_multi_day_meal_plans (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_shopping_list (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_shopping_receive_operations (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_manual_food_operations (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_meal_preferences (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_meal_plan_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_recipe_drafts (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_recipe_review_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_mappings (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            canonical_name text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, canonical_name)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_mapping_audit_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            canonical_name text NOT NULL,
                            payload jsonb NOT NULL,
                            occurred_at timestamptz NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_product_provenance_audit_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            food_id text NOT NULL,
                            action text NOT NULL CHECK (action IN ('applied', 'replaced', 'removed')),
                            occurred_at timestamptz NOT NULL,
                            payload jsonb NOT NULL,
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE INDEX IF NOT EXISTS rescue_api_product_provenance_audit_events_food_time_idx
                            ON rescue_api_product_provenance_audit_events (workspace_id, food_id, occurred_at DESC, id DESC);
                        CREATE TABLE IF NOT EXISTS rescue_api_product_info_audit_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            food_id text NOT NULL,
                            action text NOT NULL CHECK (action IN ('updated')),
                            occurred_at timestamptz NOT NULL,
                            payload jsonb NOT NULL,
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE INDEX IF NOT EXISTS rescue_api_product_info_audit_events_food_time_idx
                            ON rescue_api_product_info_audit_events (workspace_id, food_id, occurred_at DESC, id DESC);
                        CREATE INDEX IF NOT EXISTS rescue_api_grocy_mapping_audit_events_name_time_idx
                            ON rescue_api_grocy_mapping_audit_events (workspace_id, canonical_name, occurred_at DESC);
                        CREATE TABLE IF NOT EXISTS rescue_api_product_aliases (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            raw_name_key text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, raw_name_key)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_jobs (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_worker_leases (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            lease_key text NOT NULL,
                            worker_id text NOT NULL,
                            acquired_at timestamptz NOT NULL,
                            expires_at timestamptz NOT NULL,
                            PRIMARY KEY (workspace_id, lease_key)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_worker_heartbeats (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            worker_id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, worker_id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_notification_read_states (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            notification_id text NOT NULL,
                            read_at timestamptz NOT NULL,
                            PRIMARY KEY (workspace_id, notification_id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_notification_preferences (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL DEFAULT 'workspace',
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_push_subscriptions (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            endpoint_hash text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, endpoint_hash)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_notification_deliveries (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_notification_worker_leases (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            lease_key text NOT NULL,
                            worker_id text NOT NULL,
                            acquired_at timestamptz NOT NULL,
                            expires_at timestamptz NOT NULL,
                            PRIMARY KEY (workspace_id, lease_key)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_notification_worker_heartbeats (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            worker_id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, worker_id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_location_mappings (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            storage_type text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, storage_type)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_storage_locations (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_export_audit_events (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            actor_id text NOT NULL,
                            actor_role text NOT NULL,
                            request_id text NOT NULL,
                            schema_version text NOT NULL,
                            exported_at timestamptz NOT NULL,
                            payload jsonb NOT NULL,
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE INDEX IF NOT EXISTS rescue_api_export_audit_events_workspace_time_idx
                            ON rescue_api_export_audit_events (workspace_id, exported_at DESC, id DESC);
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_outbox (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_worker_leases (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            lease_key text NOT NULL,
                            worker_id text NOT NULL,
                            acquired_at timestamptz NOT NULL,
                            expires_at timestamptz NOT NULL,
                            PRIMARY KEY (workspace_id, lease_key)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_grocy_worker_heartbeats (
                            workspace_id text NOT NULL DEFAULT 'demo',
                            worker_id text NOT NULL,
                            payload jsonb NOT NULL,
                            updated_at timestamptz NOT NULL DEFAULT now(),
                            PRIMARY KEY (workspace_id, worker_id)
                        );
                        CREATE TABLE IF NOT EXISTS rescue_api_workspace_revisions (
                            workspace_id text PRIMARY KEY,
                            revision bigint NOT NULL DEFAULT 0,
                            updated_at timestamptz NOT NULL DEFAULT now()
                        );
                        ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_receipts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_fingerprints ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_storage_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_commit_transactions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_meal_plans ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_manual_food_operations ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_meal_plan_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_recipe_drafts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_recipe_review_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_grocy_mappings ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_grocy_mapping_audit_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_provenance_audit_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_info_audit_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_aliases ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_enrichment_jobs ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_enrichment_worker_leases ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_product_enrichment_worker_heartbeats ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_notification_deliveries ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_notification_worker_leases ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_notification_worker_heartbeats ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_grocy_location_mappings ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_grocy_outbox ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
                        ALTER TABLE rescue_api_foods DROP CONSTRAINT IF EXISTS rescue_api_foods_pkey;
                        ALTER TABLE rescue_api_receipts DROP CONSTRAINT IF EXISTS rescue_api_receipts_pkey;
                        ALTER TABLE rescue_api_fingerprints DROP CONSTRAINT IF EXISTS rescue_api_fingerprints_pkey;
                        ALTER TABLE rescue_api_storage_events DROP CONSTRAINT IF EXISTS rescue_api_storage_events_pkey;
                        ALTER TABLE rescue_api_commit_transactions DROP CONSTRAINT IF EXISTS rescue_api_commit_transactions_pkey;
                        ALTER TABLE rescue_api_meal_plans DROP CONSTRAINT IF EXISTS rescue_api_meal_plans_pkey;
                        ALTER TABLE rescue_api_manual_food_operations DROP CONSTRAINT IF EXISTS rescue_api_manual_food_operations_pkey;
                        ALTER TABLE rescue_api_meal_plan_events DROP CONSTRAINT IF EXISTS rescue_api_meal_plan_events_pkey;
                        ALTER TABLE rescue_api_recipe_drafts DROP CONSTRAINT IF EXISTS rescue_api_recipe_drafts_pkey;
                        ALTER TABLE rescue_api_recipe_review_events DROP CONSTRAINT IF EXISTS rescue_api_recipe_review_events_pkey;
                        ALTER TABLE rescue_api_grocy_mappings DROP CONSTRAINT IF EXISTS rescue_api_grocy_mappings_pkey;
                        ALTER TABLE rescue_api_product_aliases DROP CONSTRAINT IF EXISTS rescue_api_product_aliases_pkey;
                        ALTER TABLE rescue_api_product_enrichment_jobs DROP CONSTRAINT IF EXISTS rescue_api_product_enrichment_jobs_pkey;
                        ALTER TABLE rescue_api_product_enrichment_worker_leases DROP CONSTRAINT IF EXISTS rescue_api_product_enrichment_worker_leases_pkey;
                        ALTER TABLE rescue_api_product_enrichment_worker_heartbeats DROP CONSTRAINT IF EXISTS rescue_api_product_enrichment_worker_heartbeats_pkey;
                        ALTER TABLE rescue_api_notification_deliveries DROP CONSTRAINT IF EXISTS rescue_api_notification_deliveries_pkey;
                        ALTER TABLE rescue_api_notification_worker_leases DROP CONSTRAINT IF EXISTS rescue_api_notification_worker_leases_pkey;
                        ALTER TABLE rescue_api_notification_worker_heartbeats DROP CONSTRAINT IF EXISTS rescue_api_notification_worker_heartbeats_pkey;
                        ALTER TABLE rescue_api_grocy_location_mappings DROP CONSTRAINT IF EXISTS rescue_api_grocy_location_mappings_pkey;
                        ALTER TABLE rescue_api_grocy_outbox DROP CONSTRAINT IF EXISTS rescue_api_grocy_outbox_pkey;
                        ALTER TABLE rescue_api_foods ADD CONSTRAINT rescue_api_foods_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_receipts ADD CONSTRAINT rescue_api_receipts_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_fingerprints ADD CONSTRAINT rescue_api_fingerprints_pkey PRIMARY KEY (workspace_id, fingerprint);
                        ALTER TABLE rescue_api_storage_events ADD CONSTRAINT rescue_api_storage_events_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_commit_transactions ADD CONSTRAINT rescue_api_commit_transactions_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_meal_plans ADD CONSTRAINT rescue_api_meal_plans_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_manual_food_operations ADD CONSTRAINT rescue_api_manual_food_operations_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_meal_plan_events ADD CONSTRAINT rescue_api_meal_plan_events_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_recipe_drafts ADD CONSTRAINT rescue_api_recipe_drafts_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_recipe_review_events ADD CONSTRAINT rescue_api_recipe_review_events_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_grocy_mappings ADD CONSTRAINT rescue_api_grocy_mappings_pkey PRIMARY KEY (workspace_id, canonical_name);
                        ALTER TABLE rescue_api_product_aliases ADD CONSTRAINT rescue_api_product_aliases_pkey PRIMARY KEY (workspace_id, raw_name_key);
                        ALTER TABLE rescue_api_product_enrichment_jobs ADD CONSTRAINT rescue_api_product_enrichment_jobs_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_product_enrichment_worker_leases ADD CONSTRAINT rescue_api_product_enrichment_worker_leases_pkey PRIMARY KEY (workspace_id, lease_key);
                        ALTER TABLE rescue_api_product_enrichment_worker_heartbeats ADD CONSTRAINT rescue_api_product_enrichment_worker_heartbeats_pkey PRIMARY KEY (workspace_id, worker_id);
                        ALTER TABLE rescue_api_notification_deliveries ADD CONSTRAINT rescue_api_notification_deliveries_pkey PRIMARY KEY (workspace_id, id);
                        ALTER TABLE rescue_api_notification_worker_leases ADD CONSTRAINT rescue_api_notification_worker_leases_pkey PRIMARY KEY (workspace_id, lease_key);
                        ALTER TABLE rescue_api_notification_worker_heartbeats ADD CONSTRAINT rescue_api_notification_worker_heartbeats_pkey PRIMARY KEY (workspace_id, worker_id);
                        ALTER TABLE rescue_api_grocy_location_mappings ADD CONSTRAINT rescue_api_grocy_location_mappings_pkey PRIMARY KEY (workspace_id, storage_type);
                        ALTER TABLE rescue_api_grocy_outbox ADD CONSTRAINT rescue_api_grocy_outbox_pkey PRIMARY KEY (workspace_id, id);
                        """
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def _read_workspace_revision(self) -> int:
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rescue_api_workspace_revisions (workspace_id, revision)
                        VALUES (%s, 0)
                        ON CONFLICT (workspace_id) DO NOTHING
                        """,
                        (self.workspace_id,),
                    )
                    cursor.execute(
                        "SELECT revision FROM rescue_api_workspace_revisions WHERE workspace_id = %s",
                        (self.workspace_id,),
                    )
                    row = cursor.fetchone()
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            return int(row[0]) if row else 0

    def _has_rows(self) -> bool:
        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                table_names = (
                    "rescue_api_foods",
                    "rescue_api_receipts",
                    "rescue_api_storage_events",
                    "rescue_api_commit_transactions",
                    "rescue_api_meal_plans",
                    "rescue_api_multi_day_meal_plans",
                    "rescue_api_shopping_list",
                    "rescue_api_shopping_receive_operations",
                    "rescue_api_manual_food_operations",
                    "rescue_api_meal_preferences",
                    "rescue_api_meal_plan_events",
                    "rescue_api_recipe_drafts",
                    "rescue_api_recipe_review_events",
                    "rescue_api_grocy_mappings",
                    "rescue_api_grocy_mapping_audit_events",
                    "rescue_api_product_provenance_audit_events",
                    "rescue_api_product_info_audit_events",
                    "rescue_api_export_audit_events",
                    "rescue_api_product_aliases",
                    "rescue_api_product_enrichment_jobs",
                    "rescue_api_product_enrichment_worker_leases",
                    "rescue_api_product_enrichment_worker_heartbeats",
                    "rescue_api_notification_read_states",
                    "rescue_api_notification_preferences",
                    "rescue_api_push_subscriptions",
                    "rescue_api_notification_deliveries",
                    "rescue_api_notification_worker_leases",
                    "rescue_api_notification_worker_heartbeats",
                    "rescue_api_grocy_location_mappings",
                    "rescue_api_storage_locations",
                    "rescue_api_grocy_outbox",
                )
                if self._normalized_inventory is not None:
                    table_names += self._normalized_inventory.TABLES
                for table_name in table_names:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE workspace_id = %s", (self.workspace_id,))
                    row = cursor.fetchone()
                    if row and row[0]:
                        return True
        return False

    def _load_all(self) -> None:
        with self._lock, self._atomic_reload():
            self.foods = {}
            self.receipts = {}
            self.committed_fingerprints = set()
            self.storage_events = []
            self.commit_transactions = {}
            self.meal_plans = {}
            self.multi_day_meal_plans = {}
            self.shopping_list = {}
            self.shopping_receive_operations = {}
            self.manual_food_operations = {}
            self.meal_preferences = MealPreferences()
            self.meal_plan_events = []
            self.recipe_drafts = {}
            self.recipe_review_events = []
            self.grocy_mappings = {}
            self.grocy_mapping_audit_events = []
            self.product_provenance_audit_events = []
            self.product_info_audit_events = []
            self.notification_read_at = {}
            self.notification_preferences = NotificationPreferences()
            self.push_subscriptions = {}
            self.notification_deliveries = {}
            self.notification_worker_leases = {}
            self.notification_worker_heartbeats = {}
            self.grocy_location_mappings = {}
            self.grocy_outbox = {}
            self.grocy_worker_leases = {}
            self.grocy_worker_heartbeats = {}
            self.storage_locations = {}
            self.export_audit_events = []
            with _postgres_read_cursor(self._connection) as cursor:
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
                cursor.execute("SELECT id, payload FROM rescue_api_multi_day_meal_plans WHERE workspace_id = %s", (self.workspace_id,))
                self.multi_day_meal_plans = {
                    plan_id: MultiDayMealPlanResponse.model_validate(_json_payload(payload))
                    for plan_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_shopping_list WHERE workspace_id = %s", (self.workspace_id,))
                self.shopping_list = {
                    item_id: ShoppingListItemResponse.model_validate(_json_payload(payload))
                    for item_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_shopping_receive_operations WHERE workspace_id = %s", (self.workspace_id,))
                self.shopping_receive_operations = {
                    operation_id: ShoppingListReceiveOperation.model_validate(_json_payload(payload))
                    for operation_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_manual_food_operations WHERE workspace_id = %s", (self.workspace_id,))
                self.manual_food_operations = {
                    operation_id: ManualFoodOperationRecord.model_validate(_json_payload(payload))
                    for operation_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT payload FROM rescue_api_meal_preferences WHERE workspace_id = %s AND id = 'workspace'", (self.workspace_id,))
                preferences_row = cursor.fetchone()
                if preferences_row:
                    preferences_payload = _json_payload(preferences_row[0])
                    if isinstance(preferences_payload, dict):
                        self.meal_preferences = MealPreferences.model_validate(preferences_payload)
                cursor.execute("SELECT id, payload FROM rescue_api_meal_plan_events WHERE workspace_id = %s", (self.workspace_id,))
                self.meal_plan_events = [
                    MealPlanAuditEventResponse.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT id, payload FROM rescue_api_recipe_drafts WHERE workspace_id = %s", (self.workspace_id,))
                self.recipe_drafts = {
                    draft_id: RecipeDraftRecord.model_validate(_json_payload(payload))
                    for draft_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_recipe_review_events WHERE workspace_id = %s", (self.workspace_id,))
                self.recipe_review_events = [
                    RecipeReviewAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT canonical_name, payload FROM rescue_api_grocy_mappings WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_mappings = {
                    canonical_name: GrocyProductMappingResponse.model_validate(_json_payload(payload))
                    for canonical_name, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_grocy_mapping_audit_events WHERE workspace_id = %s ORDER BY occurred_at DESC, id DESC", (self.workspace_id,))
                self.grocy_mapping_audit_events = [
                    GrocyProductMappingAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT id, payload FROM rescue_api_product_provenance_audit_events WHERE workspace_id = %s ORDER BY occurred_at DESC, id DESC", (self.workspace_id,))
                self.product_provenance_audit_events = [
                    ProductProvenanceAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT id, payload FROM rescue_api_product_info_audit_events WHERE workspace_id = %s ORDER BY occurred_at DESC, id DESC", (self.workspace_id,))
                self.product_info_audit_events = [
                    FoodProductInfoAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT id, payload FROM rescue_api_export_audit_events WHERE workspace_id = %s ORDER BY exported_at DESC, id DESC", (self.workspace_id,))
                self.export_audit_events = [
                    WorkspaceExportAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
                cursor.execute("SELECT raw_name_key, payload FROM rescue_api_product_aliases WHERE workspace_id = %s", (self.workspace_id,))
                self.product_aliases = {
                    raw_name_key: ProductAliasResponse.model_validate(_json_payload(payload))
                    for raw_name_key, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_product_enrichment_jobs WHERE workspace_id = %s", (self.workspace_id,))
                self.product_enrichment_jobs = {
                    job_id: ProductEnrichmentJobRecord.model_validate(_json_payload(payload))
                    for job_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM rescue_api_product_enrichment_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                self.product_enrichment_worker_leases = {
                    lease_key: ProductEnrichmentWorkerLeaseRecord(
                        lease_key=lease_key,
                        worker_id=worker_id,
                        acquired_at=acquired_at if not isinstance(acquired_at, str) else datetime.fromisoformat(acquired_at),
                        expires_at=expires_at if not isinstance(expires_at, str) else datetime.fromisoformat(expires_at),
                    )
                    for lease_key, worker_id, acquired_at, expires_at in cursor.fetchall()
                }
                cursor.execute("SELECT worker_id, payload FROM rescue_api_product_enrichment_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                self.product_enrichment_worker_heartbeats = {
                    worker_id: ProductEnrichmentWorkerHeartbeatRecord.model_validate(_json_payload(payload))
                    for worker_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT notification_id, read_at FROM rescue_api_notification_read_states WHERE workspace_id = %s", (self.workspace_id,))
                self.notification_read_at = {
                    notification_id: read_at if not isinstance(read_at, str) else datetime.fromisoformat(read_at)
                    for notification_id, read_at in cursor.fetchall()
                }
                cursor.execute("SELECT payload FROM rescue_api_notification_preferences WHERE workspace_id = %s AND id = 'workspace'", (self.workspace_id,))
                preferences_row = cursor.fetchone()
                if preferences_row:
                    preferences_payload = _json_payload(preferences_row[0])
                    if isinstance(preferences_payload, dict):
                        self.notification_preferences = NotificationPreferences.model_validate(preferences_payload)
                cursor.execute("SELECT endpoint_hash, payload FROM rescue_api_push_subscriptions WHERE workspace_id = %s", (self.workspace_id,))
                self.push_subscriptions = {
                    endpoint_hash: PushSubscriptionRecord.model_validate(_json_payload(payload))
                    for endpoint_hash, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_notification_deliveries WHERE workspace_id = %s", (self.workspace_id,))
                self.notification_deliveries = {
                    delivery_id: NotificationDeliveryRecord.model_validate(_json_payload(payload))
                    for delivery_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM rescue_api_notification_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                self.notification_worker_leases = {
                    lease_key: NotificationWorkerLeaseRecord(
                        lease_key=lease_key,
                        worker_id=worker_id,
                        acquired_at=acquired_at if not isinstance(acquired_at, str) else datetime.fromisoformat(acquired_at),
                        expires_at=expires_at if not isinstance(expires_at, str) else datetime.fromisoformat(expires_at),
                    )
                    for lease_key, worker_id, acquired_at, expires_at in cursor.fetchall()
                }
                cursor.execute("SELECT worker_id, payload FROM rescue_api_notification_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                self.notification_worker_heartbeats = {
                    worker_id: NotificationWorkerHeartbeatRecord.model_validate(_json_payload(payload))
                    for worker_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT storage_type, payload FROM rescue_api_grocy_location_mappings WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_location_mappings = {
                    storage_type: GrocyLocationMappingResponse.model_validate(_json_payload(payload))
                    for storage_type, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_storage_locations WHERE workspace_id = %s", (self.workspace_id,))
                self.storage_locations = {
                    location_id: StorageLocationResponse.model_validate(_json_payload(payload))
                    for location_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT id, payload FROM rescue_api_grocy_outbox WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_outbox = {
                    outbox_id: GrocyOutboxRecord.model_validate(_json_payload(payload))
                    for outbox_id, payload in cursor.fetchall()
                }
                cursor.execute("SELECT lease_key, worker_id, acquired_at, expires_at FROM rescue_api_grocy_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_worker_leases = {
                    lease_key: GrocyWorkerLeaseRecord(
                        lease_key=lease_key,
                        worker_id=worker_id,
                        acquired_at=acquired_at if not isinstance(acquired_at, str) else datetime.fromisoformat(acquired_at),
                        expires_at=expires_at if not isinstance(expires_at, str) else datetime.fromisoformat(expires_at),
                    )
                    for lease_key, worker_id, acquired_at, expires_at in cursor.fetchall()
                }
                cursor.execute("SELECT worker_id, payload FROM rescue_api_grocy_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_worker_heartbeats = {
                    worker_id: GrocyWorkerHeartbeatRecord.model_validate(_json_payload(payload))
                    for worker_id, payload in cursor.fetchall()
                }
                if self._normalized_inventory is not None and self._normalized_inventory_has_rows:
                    normalized_state = self._normalized_inventory.load_state(cursor)
                    self.foods = normalized_state.foods
                    self.receipts = normalized_state.receipts
                    self.storage_events = normalized_state.storage_events
                    self.commit_transactions = normalized_state.commit_transactions
                    self.committed_fingerprints = normalized_state.committed_fingerprints

    def search_inventory(
        self,
        query: str = "",
        *,
        storage_type: StorageCode | None = None,
        storage_location_id: str | None = None,
        offset: int = 0,
        limit: int = 40,
    ) -> InventorySearchResponse:
        normalized_query = normalize_product_name(query)
        bounded_offset = max(0, offset)
        bounded_limit = max(1, min(limit, 100))
        clauses = ["workspace_id = %s"]
        base_params: list[object] = [self.workspace_id]
        if normalized_query:
            clauses.append("search_text LIKE %s")
            base_params.append(f"%{normalized_query}%")
        if storage_type is not None:
            clauses.append("(payload ->> 'storage_type') = %s")
            base_params.append(storage_type)
        if storage_location_id is not None:
            clauses.append("(payload ->> 'storage_location_id') = %s")
            base_params.append(storage_location_id)
        where_clause = " AND ".join(clauses)

        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                cursor.execute(
                    f"SELECT COUNT(*) FROM rescue_api_foods WHERE {where_clause}",
                    tuple(base_params),
                )
                total_row = cursor.fetchone()
                total = int(total_row[0]) if total_row else 0
                cursor.execute(
                    f"""
                    SELECT payload
                    FROM rescue_api_foods
                    WHERE {where_clause}
                    ORDER BY (payload ->> 'priority')::integer, payload ->> 'display_name', id
                    OFFSET %s LIMIT %s
                    """,
                    (*base_params, bounded_offset, bounded_limit),
                )
                rows = cursor.fetchall()
        items = [FoodResponse.model_validate(_json_payload(row[0])) for row in rows]
        return InventorySearchResponse(
            items=items,
            total=total,
            offset=bounded_offset,
            limit=bounded_limit,
            has_more=bounded_offset + len(items) < total,
            query=query.strip(),
            storage_type=storage_type,
            storage_location_id=storage_location_id,
        )

    def _persist_all(self) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT revision FROM rescue_api_workspace_revisions WHERE workspace_id = %s FOR UPDATE",
                        (self.workspace_id,),
                    )
                    revision_row = cursor.fetchone()
                    self._assert_workspace_writable()
                    current_revision = int(revision_row[0]) if revision_row else 0
                    if revision_row is None:
                        if self._workspace_revision != 0:
                            raise ConcurrentWorkspaceWriteError(
                                f"workspace revision disappeared: {self.workspace_id}"
                            )
                        cursor.execute(
                            "INSERT INTO rescue_api_workspace_revisions (workspace_id, revision) VALUES (%s, 0)",
                            (self.workspace_id,),
                        )
                    elif current_revision != self._workspace_revision:
                        raise ConcurrentWorkspaceWriteError(
                            f"workspace changed while this process was writing: {self.workspace_id}"
                        )
                    cursor.execute("DELETE FROM rescue_api_foods WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_receipts WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_fingerprints WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_storage_events WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_commit_transactions WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_meal_plans WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_multi_day_meal_plans WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_shopping_list WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_shopping_receive_operations WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_manual_food_operations WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_meal_preferences WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_meal_plan_events WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_recipe_drafts WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_recipe_review_events WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_grocy_mappings WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_product_aliases WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_product_enrichment_jobs WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_product_enrichment_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_product_enrichment_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_notification_read_states WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_notification_preferences WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_push_subscriptions WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_notification_deliveries WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_notification_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_notification_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_grocy_location_mappings WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_storage_locations WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.execute("DELETE FROM rescue_api_grocy_outbox WHERE workspace_id = %s", (self.workspace_id,))
                    cursor.executemany(
                        "INSERT INTO rescue_api_foods (workspace_id, id, payload, search_text) VALUES (%s, %s, %s, %s)",
                        [
                            (
                                self.workspace_id,
                                food_id,
                                Jsonb(record.response.model_dump(mode="json")),
                                _inventory_search_text(record.response),
                            )
                            for food_id, record in self.foods.items()
                        ],
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
                        [(self.workspace_id, event.id, Jsonb(_storage_event_persistence_payload(event))) for event in self.storage_events],
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
                        "INSERT INTO rescue_api_multi_day_meal_plans (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, plan_id, Jsonb(plan.model_dump(mode="json"))) for plan_id, plan in self.multi_day_meal_plans.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_shopping_list (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, item_id, Jsonb(item.model_dump(mode="json"))) for item_id, item in self.shopping_list.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_shopping_receive_operations (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, operation_id, Jsonb(operation.model_dump(mode="json"))) for operation_id, operation in self.shopping_receive_operations.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_manual_food_operations (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, operation_id, Jsonb(operation.model_dump(mode="json"))) for operation_id, operation in self.manual_food_operations.items()],
                    )
                    cursor.execute(
                        "INSERT INTO rescue_api_meal_preferences (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        (self.workspace_id, "workspace", Jsonb(self.meal_preferences.model_dump(mode="json"))),
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_meal_plan_events (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, event.id, Jsonb(event.model_dump(mode="json"))) for event in self.meal_plan_events],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_recipe_drafts (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, draft_id, Jsonb(draft.model_dump(mode="json"))) for draft_id, draft in self.recipe_drafts.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_recipe_review_events (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, event.id, Jsonb(event.model_dump(mode="json"))) for event in self.recipe_review_events],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_grocy_mappings (workspace_id, canonical_name, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, canonical_name, Jsonb(mapping.model_dump(mode="json"))) for canonical_name, mapping in self.grocy_mappings.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_grocy_mapping_audit_events (workspace_id, id, canonical_name, payload, occurred_at) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (workspace_id, id) DO NOTHING",
                        [
                            (
                                self.workspace_id,
                                event.id,
                                event.canonical_name,
                                Jsonb(event.model_dump(mode="json")),
                                event.occurred_at,
                            )
                            for event in self.grocy_mapping_audit_events
                        ],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_provenance_audit_events (workspace_id, id, food_id, action, occurred_at, payload) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (workspace_id, id) DO NOTHING",
                        [
                            (
                                self.workspace_id,
                                event.id,
                                event.food_id,
                                event.action,
                                event.occurred_at,
                                Jsonb(event.model_dump(mode="json")),
                            )
                            for event in self.product_provenance_audit_events
                        ],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_info_audit_events (workspace_id, id, food_id, action, occurred_at, payload) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (workspace_id, id) DO NOTHING",
                        [
                            (
                                self.workspace_id,
                                event.id,
                                event.food_id,
                                event.action,
                                event.occurred_at,
                                Jsonb(event.model_dump(mode="json")),
                            )
                            for event in self.product_info_audit_events
                        ],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_aliases (workspace_id, raw_name_key, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, raw_name_key, Jsonb(alias.model_dump(mode="json"))) for raw_name_key, alias in self.product_aliases.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_enrichment_jobs (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, job_id, Jsonb(job.model_dump(mode="json"))) for job_id, job in self.product_enrichment_jobs.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_enrichment_worker_leases (workspace_id, lease_key, worker_id, acquired_at, expires_at) VALUES (%s, %s, %s, %s, %s)",
                        [(self.workspace_id, lease_key, lease.worker_id, lease.acquired_at, lease.expires_at) for lease_key, lease in self.product_enrichment_worker_leases.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_product_enrichment_worker_heartbeats (workspace_id, worker_id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, worker_id, Jsonb(heartbeat.model_dump(mode="json"))) for worker_id, heartbeat in self.product_enrichment_worker_heartbeats.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_notification_read_states (workspace_id, notification_id, read_at) VALUES (%s, %s, %s)",
                        [(self.workspace_id, notification_id, read_at) for notification_id, read_at in self.notification_read_at.items()],
                    )
                    cursor.execute(
                        "INSERT INTO rescue_api_notification_preferences (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        (self.workspace_id, "workspace", Jsonb(self.notification_preferences.model_dump(mode="json"))),
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_push_subscriptions (workspace_id, endpoint_hash, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, endpoint_hash, Jsonb(record.model_dump(mode="json"))) for endpoint_hash, record in self.push_subscriptions.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_notification_deliveries (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, delivery_id, Jsonb(record.model_dump(mode="json"))) for delivery_id, record in self.notification_deliveries.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_notification_worker_leases (workspace_id, lease_key, worker_id, acquired_at, expires_at) VALUES (%s, %s, %s, %s, %s)",
                        [(self.workspace_id, lease_key, lease.worker_id, lease.acquired_at, lease.expires_at) for lease_key, lease in self.notification_worker_leases.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_notification_worker_heartbeats (workspace_id, worker_id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, worker_id, Jsonb(heartbeat.model_dump(mode="json"))) for worker_id, heartbeat in self.notification_worker_heartbeats.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_grocy_location_mappings (workspace_id, storage_type, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, storage_type, Jsonb(mapping.model_dump(mode="json"))) for storage_type, mapping in self.grocy_location_mappings.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_storage_locations (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, location_id, Jsonb(location.model_dump(mode="json"))) for location_id, location in self.storage_locations.items()],
                    )
                    cursor.executemany(
                        "INSERT INTO rescue_api_grocy_outbox (workspace_id, id, payload) VALUES (%s, %s, %s)",
                        [(self.workspace_id, outbox_id, Jsonb(record.model_dump(mode="json"))) for outbox_id, record in self.grocy_outbox.items()],
                    )
                    if self._normalized_inventory is not None:
                        self._normalized_inventory.write_state(
                            cursor,
                            foods=self.foods,
                            receipts=self.receipts,
                            storage_events=self.storage_events,
                            commit_transactions=self.commit_transactions,
                        )
                    cursor.execute(
                        """
                        UPDATE rescue_api_workspace_revisions
                        SET revision = revision + 1, updated_at = now()
                        WHERE workspace_id = %s AND revision = %s
                        RETURNING revision
                        """,
                        (self.workspace_id, current_revision),
                    )
                    next_revision_row = cursor.fetchone()
                    if next_revision_row is None:
                        raise ConcurrentWorkspaceWriteError(
                            f"workspace revision changed during write: {self.workspace_id}"
                        )
                    next_revision = int(next_revision_row[0])
                self._connection.commit()
                self._workspace_revision = next_revision
            except Exception:
                self._connection.rollback()
                raise

    def flush(self) -> None:
        try:
            self._persist_all()
        except ConcurrentWorkspaceWriteError as exc:
            self._reload_after_workspace_conflict()
            if exc.current_revision is None:
                exc.current_revision = self._workspace_revision
            raise

    def _reload_after_workspace_conflict(self) -> None:
        """Adopt the latest durable workspace after an optimistic-write miss."""

        self._workspace_revision = self._read_workspace_revision()
        if self._normalized_inventory is not None:
            self._normalized_inventory_has_rows = self._normalized_inventory.has_rows(self._connection)
        self._load_all()

    @property
    def workspace_revision(self) -> int:
        """Latest durable revision loaded for this workspace."""

        return self._workspace_revision

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            close = getattr(self._connection, "close", None)
            if callable(close):
                close()

    def refresh(self) -> None:
        """Reload this workspace before a read or background worker tick."""
        with self._lock:
            self._workspace_revision = self._read_workspace_revision()
            if self._normalized_inventory is not None:
                self._normalized_inventory_has_rows = self._normalized_inventory.has_rows(self._connection)
            self._load_all()

    def record_grocy_mapping_audit_event(self, event: GrocyProductMappingAuditEvent, *, persist: bool = True) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            if persist:
                try:
                    with self._connection.cursor() as cursor:
                        cursor.execute(
                            """
                            INSERT INTO rescue_api_grocy_mapping_audit_events
                                (workspace_id, id, canonical_name, payload, occurred_at)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                self.workspace_id,
                                event.id,
                                event.canonical_name,
                                Jsonb(event.model_dump(mode="json")),
                                event.occurred_at,
                            ),
                        )
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self.grocy_mapping_audit_events.append(event)

    def list_grocy_mapping_audit_events(self) -> list[GrocyProductMappingAuditEvent]:
        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                cursor.execute(
                    "SELECT id, payload FROM rescue_api_grocy_mapping_audit_events WHERE workspace_id = %s ORDER BY occurred_at DESC, id DESC",
                    (self.workspace_id,),
                )
                self.grocy_mapping_audit_events = [
                    GrocyProductMappingAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
            return [event.model_copy(deep=True) for event in self.grocy_mapping_audit_events]

    def mark_notification_read(
        self,
        notification_id: str,
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        current_time = read_at or datetime.now(timezone.utc)
        with self._lock:
            if persist:
                try:
                    with self._connection.cursor() as cursor:
                        cursor.execute(
                            """
                            INSERT INTO rescue_api_notification_read_states
                                (workspace_id, notification_id, read_at)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (workspace_id, notification_id) DO UPDATE SET
                                read_at = EXCLUDED.read_at
                            """,
                            (self.workspace_id, notification_id, current_time),
                        )
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self.notification_read_at[notification_id] = current_time

    def mark_notifications_read(
        self,
        notification_ids: list[str],
        *,
        read_at: datetime | None = None,
        persist: bool = True,
    ) -> None:
        if not notification_ids:
            return
        current_time = read_at or datetime.now(timezone.utc)
        with self._lock:
            if persist:
                try:
                    with self._connection.cursor() as cursor:
                        cursor.executemany(
                            """
                            INSERT INTO rescue_api_notification_read_states
                                (workspace_id, notification_id, read_at)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (workspace_id, notification_id) DO UPDATE SET
                                read_at = EXCLUDED.read_at
                            """,
                            [(self.workspace_id, notification_id, current_time) for notification_id in notification_ids],
                        )
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self.notification_read_at.update({notification_id: current_time for notification_id in notification_ids})

    def acquire_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT worker_id, expires_at FROM rescue_api_grocy_worker_leases WHERE workspace_id = %s AND lease_key = %s FOR UPDATE",
                        (self.workspace_id, lease_key),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        current_expires_at = row[1] if not isinstance(row[1], str) else datetime.fromisoformat(row[1])
                        if current_expires_at > current_time and row[0] != worker_id:
                            self._connection.rollback()
                            return False
                    cursor.execute(
                        """
                        INSERT INTO rescue_api_grocy_worker_leases
                            (workspace_id, lease_key, worker_id, acquired_at, expires_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (workspace_id, lease_key) DO UPDATE SET
                            worker_id = EXCLUDED.worker_id,
                            acquired_at = EXCLUDED.acquired_at,
                            expires_at = EXCLUDED.expires_at
                        """,
                        (self.workspace_id, lease_key, worker_id, current_time, expires_at),
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.grocy_worker_leases[lease_key] = GrocyWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=expires_at,
            )
            return True

    def renew_grocy_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE rescue_api_grocy_worker_leases SET expires_at = %s WHERE workspace_id = %s AND lease_key = %s AND worker_id = %s RETURNING lease_key",
                        (expires_at, self.workspace_id, lease_key, worker_id),
                    )
                    row = cursor.fetchone()
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            if row is None:
                return False
            existing = self.grocy_worker_leases.get(lease_key)
            if existing is not None:
                existing.expires_at = expires_at
            return True

    def release_grocy_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM rescue_api_grocy_worker_leases WHERE workspace_id = %s AND lease_key = %s AND worker_id = %s RETURNING lease_key",
                        (self.workspace_id, lease_key, worker_id),
                    )
                    row = cursor.fetchone()
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            if row is None:
                return False
            self.grocy_worker_leases.pop(lease_key, None)
            return True

    def record_grocy_worker_heartbeat(self, heartbeat: GrocyWorkerHeartbeatRecord) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rescue_api_grocy_worker_heartbeats
                            (workspace_id, worker_id, payload, updated_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (workspace_id, worker_id) DO UPDATE SET
                            payload = EXCLUDED.payload,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (self.workspace_id, heartbeat.worker_id, Jsonb(heartbeat.model_dump(mode="json")), heartbeat.last_tick_at),
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.grocy_worker_heartbeats[heartbeat.worker_id] = heartbeat

    def list_grocy_worker_heartbeats(self) -> list[GrocyWorkerHeartbeatRecord]:
        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                cursor.execute("SELECT worker_id, payload FROM rescue_api_grocy_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
                self.grocy_worker_heartbeats = {
                    worker_id: GrocyWorkerHeartbeatRecord.model_validate(_json_payload(payload))
                    for worker_id, payload in cursor.fetchall()
                }
            return sorted(self.grocy_worker_heartbeats.values(), key=lambda item: (item.last_tick_at, item.worker_id), reverse=True)

    def acquire_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT worker_id, expires_at FROM rescue_api_product_enrichment_worker_leases WHERE workspace_id = %s AND lease_key = %s FOR UPDATE",
                        (self.workspace_id, lease_key),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        current_expires_at = row[1] if not isinstance(row[1], str) else datetime.fromisoformat(row[1])
                        if current_expires_at > current_time and row[0] != worker_id:
                            self._connection.rollback()
                            return False
                    cursor.execute(
                        """
                        INSERT INTO rescue_api_product_enrichment_worker_leases
                            (workspace_id, lease_key, worker_id, acquired_at, expires_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (workspace_id, lease_key) DO UPDATE SET
                            worker_id = EXCLUDED.worker_id,
                            acquired_at = EXCLUDED.acquired_at,
                            expires_at = EXCLUDED.expires_at
                        """,
                        (self.workspace_id, lease_key, worker_id, current_time, expires_at),
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.product_enrichment_worker_leases[lease_key] = ProductEnrichmentWorkerLeaseRecord(
                lease_key=lease_key,
                worker_id=worker_id,
                acquired_at=current_time,
                expires_at=expires_at,
            )
            return True

    def renew_product_enrichment_worker_lease(
        self,
        *,
        lease_key: str,
        worker_id: str,
        lease_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or datetime.now(timezone.utc)
        expires_at = current_time + timedelta(seconds=lease_seconds)
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE rescue_api_product_enrichment_worker_leases SET expires_at = %s WHERE workspace_id = %s AND lease_key = %s AND worker_id = %s RETURNING lease_key",
                        (expires_at, self.workspace_id, lease_key, worker_id),
                    )
                    row = cursor.fetchone()
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            if row is None:
                return False
            existing = self.product_enrichment_worker_leases.get(lease_key)
            if existing is not None:
                existing.expires_at = expires_at
            return True

    def release_product_enrichment_worker_lease(self, *, lease_key: str, worker_id: str) -> bool:
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM rescue_api_product_enrichment_worker_leases WHERE workspace_id = %s AND lease_key = %s AND worker_id = %s RETURNING lease_key",
                        (self.workspace_id, lease_key, worker_id),
                    )
                    row = cursor.fetchone()
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            if row is None:
                return False
            self.product_enrichment_worker_leases.pop(lease_key, None)
            return True

    def record_product_enrichment_worker_heartbeat(self, heartbeat: ProductEnrichmentWorkerHeartbeatRecord) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rescue_api_product_enrichment_worker_heartbeats
                            (workspace_id, worker_id, payload, updated_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (workspace_id, worker_id) DO UPDATE SET
                            payload = EXCLUDED.payload,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (self.workspace_id, heartbeat.worker_id, Jsonb(heartbeat.model_dump(mode="json")), heartbeat.last_tick_at),
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.product_enrichment_worker_heartbeats[heartbeat.worker_id] = heartbeat

    def list_product_enrichment_worker_heartbeats(self) -> list[ProductEnrichmentWorkerHeartbeatRecord]:
        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                cursor.execute(
                    "SELECT worker_id, payload FROM rescue_api_product_enrichment_worker_heartbeats WHERE workspace_id = %s",
                    (self.workspace_id,),
                )
                self.product_enrichment_worker_heartbeats = {
                    worker_id: ProductEnrichmentWorkerHeartbeatRecord.model_validate(_json_payload(payload))
                    for worker_id, payload in cursor.fetchall()
                }
            return sorted(
                self.product_enrichment_worker_heartbeats.values(),
                key=lambda item: (item.last_tick_at, item.worker_id),
                reverse=True,
            )

    def record_export_audit_event(self, event: WorkspaceExportAuditEvent, *, persist: bool = True) -> None:
        from psycopg.types.json import Jsonb

        with self._lock:
            if any(existing.id == event.id for existing in self.export_audit_events):
                return
            try:
                if persist:
                    with self._connection.cursor() as cursor:
                        cursor.execute(
                            """
                            INSERT INTO rescue_api_export_audit_events
                                (workspace_id, id, actor_id, actor_role, request_id, schema_version, exported_at, payload)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (workspace_id, id) DO NOTHING
                            """,
                            (
                                self.workspace_id,
                                event.id,
                                event.actor_id,
                                event.actor_role,
                                event.request_id,
                                event.schema_version,
                                event.exported_at,
                                Jsonb(event.model_dump(mode="json")),
                            ),
                        )
                    self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self.export_audit_events.append(event.model_copy(deep=True))

    def list_export_audit_events(self, *, limit: int = 100) -> list[WorkspaceExportAuditEvent]:
        bounded_limit = max(1, min(int(limit), 1000))
        with self._lock:
            with _postgres_read_cursor(self._connection) as cursor:
                cursor.execute(
                    "SELECT id, payload FROM rescue_api_export_audit_events WHERE workspace_id = %s ORDER BY exported_at DESC, id DESC LIMIT %s",
                    (self.workspace_id, bounded_limit),
                )
                self.export_audit_events = [
                    WorkspaceExportAuditEvent.model_validate(_json_payload(payload))
                    for _, payload in cursor.fetchall()
                ]
            return [event.model_copy(deep=True) for event in self.export_audit_events]

    def reset(self) -> None:
        InMemoryStore.reset(self)
        with self._lock:
            with self._connection.cursor() as cursor:
                cursor.execute("DELETE FROM rescue_api_grocy_mapping_audit_events WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_product_provenance_audit_events WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_product_info_audit_events WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_export_audit_events WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_notification_read_states WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_notification_preferences WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_push_subscriptions WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_workspace_revisions WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_grocy_worker_leases WHERE workspace_id = %s", (self.workspace_id,))
                cursor.execute("DELETE FROM rescue_api_grocy_worker_heartbeats WHERE workspace_id = %s", (self.workspace_id,))
            self._connection.commit()
            self._workspace_revision = 0
        self._persist_all()

    def purge(self) -> None:
        """Purge workspace data without leaving a revision-only tombstone."""

        # ``reset`` persists an empty snapshot so the live workspace can keep
        # serving normally. Account deletion has a stricter boundary: the
        # revision row is workspace metadata too, so remove the row after the
        # empty snapshot has been committed. The account lifecycle fence keeps
        # other processes from writing a new revision during this sequence.
        InMemoryStore.purge(self)
        with self._lock:
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM rescue_api_workspace_revisions WHERE workspace_id = %s",
                        (self.workspace_id,),
                    )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def reprioritize(self, *, persist: bool = True) -> None:
        InMemoryStore.reprioritize(self)
        if persist:
            try:
                self._persist_all()
            except ConcurrentWorkspaceWriteError:
                # ``reprioritize`` is an immediate-persist compatibility method.
                # If another process wins before this write, callers must inspect
                # the winner's snapshot rather than this request's stale objects.
                self._reload_after_workspace_conflict()
                raise

    def upsert_from_receipt(
        self,
        *,
        line: ReceiptLineDraft,
        purchased_at: datetime | None,
        override: ReceiptLineOverride | None,
        source_receipt_id: str | None = None,
        persist: bool = True,
    ) -> str:
        lot_id = InMemoryStore.upsert_from_receipt(
            self,
            line=line,
            purchased_at=purchased_at,
            override=override,
            source_receipt_id=source_receipt_id,
            persist=False,
        )
        if persist:
            self._persist_all()
        return lot_id


def _validate_workspace_store_cache_size(value: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 256:
        raise ValueError("workspace store cache size must be an integer between 1 and 256")
    return value


def _workspace_store_cache_size() -> int:
    raw_value = os.getenv("RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE", "16").strip()
    try:
        value = int(raw_value)
    except ValueError:
        value = 16
    return _validate_workspace_store_cache_size(max(1, min(256, value)))


class WorkspaceStoreRouter:
    """Route each verified workspace to an isolated local repository.

    SQLite workspaces use sibling database files and Postgres workspaces use a
    workspace key in every API projection row, so a guest can survive an API
    restart without sharing another user's food rows.
    """

    def __init__(
        self,
        base_store: InMemoryStore,
        recipe_catalog_store: SharedRecipeCatalogStore | None = None,
        *,
        workspace_store_cache_size: int | None = None,
        workspace_connection_pool: PostgresOperationPool | None = None,
    ) -> None:
        self._base_store = base_store
        self._recipe_catalog = recipe_catalog_store or SharedRecipeCatalogStore()
        self._workspace_connection_pool = workspace_connection_pool
        self._stores: dict[str, InMemoryStore] = {DEFAULT_WORKSPACE_ID: base_store}
        self._workspace_leases: dict[str, int] = {}
        self._workspace_access_order: dict[str, int] = {}
        self._access_counter = 0
        self._workspace_store_cache_size = (
            _workspace_store_cache_size()
            if workspace_store_cache_size is None
            else _validate_workspace_store_cache_size(workspace_store_cache_size)
        )
        self._lock = RLock()
        self._workspace_write_guard: Callable[[str], None] | None = None

    def set_workspace_write_guard(self, guard: Callable[[str], None] | None) -> None:
        """Install the account-lifecycle fence on every routed workspace store."""

        with self._lock:
            self._workspace_write_guard = guard
            for active_store in self._stores.values():
                active_store._workspace_write_guard = guard

    def _assert_workspace_writable(self, workspace_id: str | None = None) -> None:
        guard = self._workspace_write_guard
        if guard is not None:
            guard(workspace_id or current_workspace_id())

    def reset(self) -> None:
        self._base_store.reset()
        self._recipe_catalog.reset()

    def purge_workspace(self, workspace_id: str, *, allow_current_lease: bool = False) -> None:
        if workspace_id == DEFAULT_WORKSPACE_ID:
            raise ValueError("the default workspace cannot be purged")
        with self._lock:
            active_lease_count = self._workspace_leases.get(workspace_id, 0)
            if active_lease_count and not (allow_current_lease and active_lease_count == 1):
                raise RuntimeError("workspace has active operations and cannot be purged yet")
            active_store = self._stores.get(workspace_id)
            if active_store is None:
                active_store = self._workspace_store(workspace_id, seed=False)
            active_store.purge()
            self._close_store(active_store)
            self._stores.pop(workspace_id, None)
            self._workspace_leases.pop(workspace_id, None)
            self._workspace_access_order.pop(workspace_id, None)

    @contextmanager
    def workspace_session(self, workspace_id: str, *, seed: bool = True):
        """Lease one workspace store for a request or background tick.

        Durable workspace stores may own a database connection. The lease keeps
        that store alive for the whole operation, while allowing the router to
        close idle stores after the operation completes. In-memory stores do
        not participate because closing one would destroy their only copy of
        the data.
        """

        self.acquire_workspace(workspace_id, seed=seed)
        workspace_token = set_workspace_id(workspace_id)
        try:
            yield
        finally:
            reset_workspace(workspace_token)
            self.release_workspace(workspace_id)

    def acquire_workspace(self, workspace_id: str, *, seed: bool = True) -> InMemoryStore:
        """Acquire an explicit workspace lease and return its local store."""

        with self._lock:
            active_store = self._workspace_store(workspace_id, seed=seed)
            if workspace_id != DEFAULT_WORKSPACE_ID and self._is_evictable_store(active_store):
                self._workspace_leases[workspace_id] = self._workspace_leases.get(workspace_id, 0) + 1
            self._touch_workspace_locked(workspace_id)
            return active_store

    def release_workspace(self, workspace_id: str) -> None:
        """Release one workspace lease and evict the oldest idle store if needed."""

        if workspace_id == DEFAULT_WORKSPACE_ID:
            return
        with self._lock:
            lease_count = self._workspace_leases.get(workspace_id, 0)
            if lease_count <= 1:
                self._workspace_leases.pop(workspace_id, None)
            else:
                self._workspace_leases[workspace_id] = lease_count - 1
            self._touch_workspace_locked(workspace_id)
            self._evict_idle_stores_locked()

    @property
    def workspace_store_cache_size(self) -> int:
        return self._workspace_store_cache_size

    @property
    def active_workspace_leases(self) -> dict[str, int]:
        with self._lock:
            return dict(self._workspace_leases)

    @property
    def cached_durable_workspace_count(self) -> int:
        with self._lock:
            return sum(
                1
                for workspace_id, active_store in self._stores.items()
                if workspace_id != DEFAULT_WORKSPACE_ID and self._is_evictable_store(active_store)
            )

    def close(self) -> None:
        """Close all workspace/base stores during application shutdown."""

        with self._lock:
            stores = list(dict.fromkeys(self._stores.values()))
            self._stores = {DEFAULT_WORKSPACE_ID: self._base_store}
            self._workspace_leases.clear()
            self._workspace_access_order.clear()
            for active_store in stores:
                self._close_store(active_store)
            if self._workspace_connection_pool is not None:
                try:
                    self._workspace_connection_pool.close()
                except Exception:
                    # Store cleanup must not mask process shutdown. The pool
                    # itself is idempotent and will surface failures on the
                    # next startup/readiness check.
                    pass

    @staticmethod
    def _is_evictable_store(active_store: InMemoryStore) -> bool:
        return isinstance(active_store, (PostgresStore, SqliteStore))

    @staticmethod
    def _close_store(active_store: InMemoryStore) -> None:
        close = getattr(active_store, "close", None)
        if not callable(close):
            return
        try:
            close()
        except Exception:
            # Cleanup must not turn a completed request into a 500. Readiness
            # and the next lease will surface a connection that cannot reopen.
            return

    def _touch_workspace_locked(self, workspace_id: str) -> None:
        if workspace_id == DEFAULT_WORKSPACE_ID:
            return
        self._access_counter += 1
        self._workspace_access_order[workspace_id] = self._access_counter

    def _evict_idle_stores_locked(self) -> None:
        durable_workspace_ids = [
            workspace_id
            for workspace_id, active_store in self._stores.items()
            if workspace_id != DEFAULT_WORKSPACE_ID and self._is_evictable_store(active_store)
        ]
        while len(durable_workspace_ids) > self._workspace_store_cache_size:
            idle_workspace_ids = [
                workspace_id
                for workspace_id in durable_workspace_ids
                if self._workspace_leases.get(workspace_id, 0) == 0
            ]
            if not idle_workspace_ids:
                return
            victim_workspace_id = min(
                idle_workspace_ids,
                key=lambda workspace_id: (
                    self._workspace_access_order.get(workspace_id, 0),
                    workspace_id,
                ),
            )
            victim = self._stores.pop(victim_workspace_id, None)
            self._workspace_leases.pop(victim_workspace_id, None)
            self._workspace_access_order.pop(victim_workspace_id, None)
            if victim is not None:
                self._close_store(victim)
            durable_workspace_ids.remove(victim_workspace_id)

    def flush(self) -> None:
        self._assert_workspace_writable()
        active_store = self._workspace_store(current_workspace_id(), seed=False)
        active_store.flush()
        self._recipe_catalog.flush()

    @contextmanager
    def mutation_lock(self):
        """Expose the active workspace's process-local mutation lock."""

        active_store = self._workspace_store(current_workspace_id(), seed=False)
        with active_store.mutation_lock():
            yield

    def _workspace_store(self, workspace_id: str, *, seed: bool = True) -> InMemoryStore:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
            raise ValueError("invalid workspace id")
        with self._lock:
            existing = self._stores.get(workspace_id)
            if existing is not None:
                existing._workspace_write_guard = self._workspace_write_guard
                self._touch_workspace_locked(workspace_id)
                return existing
            if isinstance(self._base_store, PostgresStore):
                workspace_store = PostgresStore(
                    self._base_store.database_url,
                    workspace_id=workspace_id,
                    seed=seed,
                    operation_pool=self._workspace_connection_pool,
                    initialize_schema=False,
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
            workspace_store._workspace_write_guard = self._workspace_write_guard
            self._stores[workspace_id] = workspace_store
            self._touch_workspace_locked(workspace_id)
            self._evict_idle_stores_locked()
            return workspace_store

    def provision_workspace(self, workspace_id: str, *, seed: bool = True) -> None:
        self._assert_workspace_writable(workspace_id)
        self._workspace_store(workspace_id, seed=seed)

    def refresh_workspace(self, workspace_id: str) -> None:
        active_store = self._workspace_store(workspace_id, seed=False)
        refresh = getattr(active_store, "refresh", None)
        if callable(refresh):
            refresh()

    @property
    def workspace_ids(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._stores.keys())

    def __getattr__(self, name: str):
        if name == "recipe_drafts":
            return self._recipe_catalog.drafts
        if name == "recipe_review_events":
            return self._recipe_catalog.review_events
        if name in {"upsert_recipe_draft", "record_recipe_review_event", "approved_recipe_specs"}:
            return getattr(self._recipe_catalog, name)
        value = getattr(self._workspace_store(current_workspace_id()), name)
        if not callable(value):
            return value

        def guarded_workspace_call(*args, **kwargs):
            self._assert_workspace_writable()
            return value(*args, **kwargs)

        return guarded_workspace_call

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
    inference: PriorityInferenceResponse | None = None,
    opened: bool = False,
    opened_at: datetime | None = None,
    confidence: float = 1.0,
    barcode: str | None = None,
    barcode_lot: str | None = None,
    product_provenance: ProductProvenance | None = None,
    applicable_storage_type: StorageCode | None = None,
    storage_condition_text: str | None = None,
    storage_location_id: str | None = None,
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
        applicable_storage_type=applicable_storage_type,
        storage_condition_text=storage_condition_text,
    )
    window = None
    if estimate:
        start, end, estimate_confidence = estimate
        window = DateWindow(
            start_date=start,
            end_date=end,
            basis=source_detail,
            confidence=estimate_confidence,
            safety_disclaimer=inference.safety_disclaimer if inference else "안전 판정이 아닌 먼저 확인할 순서입니다.",
            inference_trace=InferenceTrace(
                provider=inference.provider,
                provider_version=inference.provider_version,
                rule_id=inference.estimated_use_first_window.rule_id if inference and inference.estimated_use_first_window else None,
                evidence_refs=list(inference.evidence_refs),
                reasoning=list(inference.reasoning),
                input_sha256=inference.input_sha256,
            ) if inference else None,
        )
    return FoodResponse(
        id=food_id,
        canonical_name=name,
        display_name=name,
        brand=brand,
        quantity=quantity,
        unit=unit,
        storage_type=storage_type,
        storage_location_id=storage_location_id,
        opened=opened,
        opened_at=opened_at,
        barcode=barcode,
        barcode_lot=barcode_lot,
        product_provenance=product_provenance,
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
            opened_at=food.opened_at.date() if food.opened_at else None,
            reference_date=food.purchased_at.date() if food.purchased_at else None,
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
        safety_disclaimer=inference.safety_disclaimer,
        inference_trace=InferenceTrace(
            provider=inference.provider,
            provider_version=inference.provider_version,
            rule_id=inference.estimated_use_first_window.rule_id,
            evidence_refs=list(inference.evidence_refs),
            reasoning=list(inference.reasoning),
            input_sha256=inference.input_sha256,
        ),
    )


def _inventory_authority(store_instance) -> InventoryRepository:
    return InventoryRepository(
        foods_provider=lambda: store_instance.foods,
        record_factory=lambda response, purchased_at: _FoodRecord(response, purchased_at=purchased_at),
        id_factory=create_id,
        recalculate_window=_refresh_estimated_window,
    )


def _validate_storage_location_for_store(
    store_instance,
    location_id: str | None,
    storage_type: StorageCode,
) -> StorageLocationResponse | None:
    if location_id is None:
        return None
    if location_id in BUILTIN_STORAGE_LOCATION_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "storage_location_invalid",
                "detail": "기본 보관 분류는 custom location ID로 보낼 수 없습니다.",
            },
        )
    location = store_instance.storage_locations.get(location_id)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "storage_location_not_found",
                "detail": "선택한 사용자 정의 보관 위치를 찾을 수 없습니다.",
            },
        )
    if location.storage_type != storage_type:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "storage_location_type_mismatch",
                "detail": "선택한 보관 위치의 canonical 보관 분류가 현재 요청과 다릅니다.",
                "storage_type": location.storage_type,
            },
        )
    return location.model_copy(deep=True)


def _receipt_product_candidate(line: ReceiptLineDraft, canonical_name: str) -> ReceiptMatchCandidateResponse | None:
    """Return the candidate that supplied the committed receipt name.

    The effective canonical name can come from a commit override, so a
    candidate is usable only when it still names that exact product. This
    prevents a stale provider candidate from being attached after a user
    edits the receipt line.
    """

    matching_candidates = [
        candidate
        for candidate in line.match_candidates
        if candidate.source != "unmatched" and candidate.canonical_name == canonical_name
    ]
    selected = next(
        (candidate for candidate in matching_candidates if candidate.source == line.match_source),
        None,
    )
    return selected or (matching_candidates[0] if matching_candidates else None)


def _receipt_product_provenance(line: ReceiptLineDraft, canonical_name: str) -> ProductProvenance | None:
    """Materialize reviewed receipt matching as lot-level product provenance."""

    candidate = _receipt_product_candidate(line, canonical_name)
    if candidate is None:
        # A manually edited canonical name must not inherit a stale provider
        # candidate from the OCR draft. Only an exact reviewed candidate is
        # strong enough to become lot-level product provenance.
        return None
    return ProductProvenance(
        source=candidate.source,
        source_url=candidate.source_url,
        confidence=candidate.confidence,
        note=candidate.provenance_note,
        storage_hint=candidate.storage_hint,
        source_freshness=candidate.source_freshness,
    )


def _receipt_food(
    name: str,
    quantity: float,
    unit: str,
    confidence: float,
    purchased_at: datetime | None,
    *,
    storage_type: StorageCode = "refrigerated",
    brand_override: str | None = None,
    category_override: str | None = None,
    product_provenance: ProductProvenance | None = None,
    barcode: str | None = None,
    storage_location_id: str | None = None,
) -> FoodResponse:
    image = "/assets/food/tomato.png"
    category = category_override.strip() if category_override and category_override.strip() else "기타"
    if not category_override or not category_override.strip():
        if "시금치" in name:
            image, category = "/assets/food/spinach.png", "채소"
        elif "두부" in name:
            image, category = "/assets/food/tofu.png", "두부·콩"
        elif "버섯" in name:
            image, category = "/assets/food/mushroom.png", "채소"
        elif "달걀" in name or "계란" in name:
            image, category = "/assets/food/eggs.png", "달걀"
    inference = infer_priority(
        PriorityInferenceRequest(
            product_name=name,
            storage_type=storage_type,
            reference_date=purchased_at.date() if purchased_at else None,
        )
    )
    storage_note = f"영수증 + 상품 유형 · {storage_type} 보관 기준"
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
        brand_override.strip() if brand_override and brand_override.strip() else name,
        quantity,
        unit,
        storage_type,
        "unknown",
        None,
        "unknown",
        storage_note,
        99,
        category,
        image,
        "영수증 구매일은 기록했지만, 실제 소비기한은 포장지에서 확인해야 해요.",
        estimate=estimate,
        inference=inference,
        confidence=confidence,
        product_provenance=product_provenance,
        barcode=barcode,
        storage_location_id=storage_location_id,
    )


def _normalize_receipt_barcode(value: str | None) -> str | None:
    """Keep only a parser-confirmed normal GTIN on receipt-created lots."""

    if not value or not value.strip():
        return None
    parsed = parse_barcode(value)
    return parsed.gtin if parsed.barcode_type == "gtin" else None


def _inventory_search_text(food: FoodResponse) -> str:
    return "".join(
        normalize_product_name(value)
        for value in (food.canonical_name, food.display_name, food.brand, food.category)
        if value
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


def _suggested_receipt_storage(raw_name: str) -> StorageCode:
    normalized = re.sub(r"\s+", "", raw_name)
    if re.search(r"냉동|아이스", normalized):
        return "frozen"
    if re.search(r"생수|음료|주류|맥주|소주|와인|라면|가루|밀가루|빵가루|통조림|과자|커피|설탕|소금|식용유|캔", normalized):
        return "ambient"
    return "refrigerated"


def create_id(prefix: str) -> str:
    now = datetime.now(timezone.utc).isoformat()
    return f"{prefix}-{sha256(now.encode()).hexdigest()[:12]}"


def _fingerprint(request: ReceiptDraftRequest) -> str:
    """Hash the full receipt input so unrelated shopping trips do not collide."""

    payload = json.dumps(
        request.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(payload.encode("utf-8")).hexdigest()


def _legacy_fingerprint(request: ReceiptDraftRequest) -> str:
    """Return the pre-versioned fingerprint used by existing persisted drafts."""

    payload = "|".join(
        [request.source_filename, *(f"{line.raw_name}:{line.quantity}:{line.total_price}" for line in request.lines)]
    )
    return sha256(payload.encode("utf-8")).hexdigest()


def _receipt_request_matches_draft(request: ReceiptDraftRequest, draft: ReceiptDraftResponse) -> bool:
    """Compare the request fields available in a persisted safe draft."""

    if (
        request.source_filename != draft.source_filename
        or request.purchased_at != draft.purchased_at
        or request.template_id != draft.template_id
        or abs(request.template_confidence - draft.template_confidence) > 1e-9
        or request.merchant_name != draft.merchant_name
        or len(request.lines) != len(draft.lines)
    ):
        return False
    for input_line, draft_line in zip(request.lines, draft.lines):
        if (
            input_line.raw_name != draft_line.raw_name
            or abs(input_line.quantity - draft_line.quantity) > 1e-9
            or input_line.unit != draft_line.unit
            or input_line.total_price != draft_line.total_price
            or input_line.line_type != draft_line.line_type
            or input_line.canonical_name != draft_line.canonical_name
            or input_line.barcode != draft_line.barcode
        ):
            return False
    return True


def _receipt_record_matches_request(
    record: _ReceiptRecord,
    request: ReceiptDraftRequest,
    fingerprint: str,
    legacy_fingerprint: str,
) -> bool:
    """Match current fingerprints directly and legacy rows conservatively."""

    if record.response.fingerprint == fingerprint:
        # The current fingerprint hashes the validated full request, including
        # fields that older normalized receipt rows did not persist (merchant,
        # template metadata, and line provenance).
        return True
    return (
        record.response.fingerprint == legacy_fingerprint
        and _receipt_request_matches_draft(request, record.response)
    )


def _normalize_idempotency_key(value: str | None) -> str | None:
    try:
        return operation_ledger.normalize_key(value)
    except InvalidOperationKey as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency-Key 형식을 확인해 주세요.") from exc


def _request_idempotency_key(http_request: Request) -> str | None:
    return _normalize_idempotency_key(http_request.headers.get("Idempotency-Key"))


def _idempotency_key_digest(idempotency_key: str) -> str:
    return operation_ledger.key_digest(idempotency_key)


def _receipt_commit_key_digest(idempotency_key: str) -> str:
    return _idempotency_key_digest(idempotency_key)


def _manual_food_operation_id(idempotency_key_digest: str) -> str:
    return f"manual-food-op-{idempotency_key_digest}"


def _manual_food_payload_fingerprint(request: ManualFoodRequest) -> str:
    return operation_ledger.fingerprint(request.model_dump(mode="json"))


def _manual_food_replay_response(
    *,
    operation: ManualFoodOperationRecord,
    payload_fingerprint: str,
    http_response: Response,
) -> FoodResponse:
    if operation.request_payload_fingerprint != payload_fingerprint:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "manual_food_idempotency_conflict",
                "detail": "같은 Idempotency-Key로 다른 식품 입력을 요청할 수 없습니다.",
            },
        )
    record = store.foods.get(operation.food_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "manual_food_operation_lot_missing",
                "detail": "같은 입력의 lot이 이미 소비·폐기되어 다시 만들 수 없습니다.",
            },
        )
    http_response.headers["X-Idempotency-Replayed"] = "true"
    return record.response


def _receipt_commit_payload_fingerprint(receipt_id: str, request: ReceiptCommitRequest) -> str:
    return operation_ledger.fingerprint(
        {
            "receipt_id": receipt_id,
            "confirmed_line_ids": request.confirmed_line_ids,
            "overrides": {
                line_id: override.model_dump(mode="json")
                for line_id, override in sorted(request.overrides.items())
            },
        }
    )


def _idempotent_storage_event_id(idempotency_key: str) -> str:
    return operation_ledger.scoped_id("event-idem", current_workspace_id(), idempotency_key)


def _idempotent_storage_event_sequence_id(idempotency_key: str, index: int) -> str:
    return operation_ledger.scoped_id("event-sequence-idem", current_workspace_id(), idempotency_key, index)


def _storage_event_matches_request(event: StorageEventResponse, food_id: str, request: StorageEventRequest) -> bool:
    if (
        event.food_id != food_id
        or event.event_type != request.event_type
        or event.to_storage_type != request.to_storage_type
        or event.to_storage_location_id != request.to_storage_location_id
    ):
        return False
    if request.quantity is None:
        return True
    return event.quantity is not None and abs(event.quantity - request.quantity) <= 1e-9


def _existing_storage_event_sequence(
    *,
    food_id: str,
    requests: list[StorageEventRequest],
    idempotency_key: str,
) -> tuple[list[StorageEventResponse], str] | None:
    existing_by_id = {event.id: event for event in store.storage_events}
    sequence_event_ids = [
        _idempotent_storage_event_sequence_id(idempotency_key, index)
        for index in range(2)
    ]
    if sequence_event_ids[1] in existing_by_id and sequence_event_ids[0] not in existing_by_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="storage event sequence가 부분적으로 저장되어 재조정이 필요합니다.",
        )

    existing_events: list[StorageEventResponse] = []
    target_food_id = food_id
    for index, event_request in enumerate(requests):
        existing = existing_by_id.get(sequence_event_ids[index])
        if existing is None:
            if existing_events:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="storage event sequence가 부분적으로 저장되어 재조정이 필요합니다.",
                )
            return None
        if not _storage_event_matches_request(existing, target_food_id, event_request):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 보관 event sequence를 요청할 수 없습니다.")
        existing_events.append(existing.model_copy(deep=True))
        target_food_id = existing.created_child_food_id or existing.food_id
    if len(requests) < len(sequence_event_ids) and sequence_event_ids[len(requests)] in existing_by_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 보관 event sequence를 요청할 수 없습니다.")
    return existing_events, target_food_id


def _storage_event_sequence_replay_response(
    *,
    events: list[StorageEventResponse],
    final_food_id: str,
) -> StorageEventSequenceResponse:
    return StorageEventSequenceResponse(
        events=[event.model_copy(deep=True) for event in events],
        final_food_id=final_food_id,
        idempotency_replayed=True,
    )


def _storage_inventory_snapshot() -> list[FoodResponse]:
    return [record.response.model_copy(deep=True) for record in store._sorted_foods()]


def _storage_event_response_with_inventory(event: StorageEventResponse) -> StorageEventResponse:
    response = event.model_copy(deep=True)
    response.inventory = _storage_inventory_snapshot()
    return response


def _storage_event_sequence_response_with_inventory(
    response: StorageEventSequenceResponse,
) -> StorageEventSequenceResponse:
    inventory = _storage_inventory_snapshot()
    return StorageEventSequenceResponse(
        events=[
            event.model_copy(update={"inventory": [food.model_copy(deep=True) for food in inventory]}, deep=True)
            for event in response.events
        ],
        final_food_id=response.final_food_id,
        idempotency_replayed=response.idempotency_replayed,
    )


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
        storage_suggestion=_suggested_receipt_storage(line.canonical_name or line.raw_name) if is_product else None,
        unit_price=line.unit_price,
        total_price=line.total_price,
        line_type=line.line_type,
        match_confidence=line.match_confidence,
        review_status="pending" if needs_review else "confirmed",
        review_reason=reason,
        match_source=line.match_source,
        match_candidates=[candidate.model_copy(deep=True) for candidate in line.match_candidates],
        source_observation_ids=list(line.source_observation_ids),
        barcode=line.barcode,
    )


def _runtime_schema_ddl_allowed() -> bool:
    return os.getenv("RESCUE_MEAL_ALLOW_RUNTIME_SCHEMA_DDL", "").strip().lower() == "true"


def _build_store() -> InMemoryStore:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    if database_url:
        allow_runtime_schema_ddl = _runtime_schema_ddl_allowed()
        return PostgresStore(
            database_url,
            initialize_schema=allow_runtime_schema_ddl,
            require_migration_gate=not allow_runtime_schema_ddl,
        )
    database_path = os.getenv("RESCUE_MEAL_SQLITE_PATH", "").strip()
    return SqliteStore(database_path) if database_path else InMemoryStore()


base_store = _build_store()


def _build_product_runtime(base: InMemoryStore):
    if isinstance(base, SqliteStore) and base.database_path != ":memory:":
        return (
            SharedProductLookupCache.from_env(base._connection, dialect="sqlite", lock=base._lock),
            SharedProductNameLookupCache.from_env(base._connection, dialect="sqlite", lock=base._lock),
            SharedProductProviderRateLimiter.from_env(base._connection, dialect="sqlite", lock=base._lock),
        )
    if isinstance(base, PostgresStore):
        return (
            SharedProductLookupCache.from_env(base._connection, dialect="postgres", lock=base._lock, initialize_schema=_runtime_schema_ddl_allowed()),
            SharedProductNameLookupCache.from_env(base._connection, dialect="postgres", lock=base._lock, initialize_schema=_runtime_schema_ddl_allowed()),
            SharedProductProviderRateLimiter.from_env(base._connection, dialect="postgres", lock=base._lock, initialize_schema=_runtime_schema_ddl_allowed()),
        )
    return ProductLookupCache.from_env(), ProductNameLookupCache.from_env(), ProductProviderRateLimiter.from_env()


product_lookup_cache, product_name_lookup_cache, product_provider_rate_limiter = _build_product_runtime(base_store)
product_provider_metrics = ProductProviderRuntimeMetrics()
notification_delivery_metrics = NotificationDeliveryRuntimeMetrics()
request_runtime_metrics = RequestRuntimeMetrics()


def _build_recipe_catalog_store(base: InMemoryStore) -> SharedRecipeCatalogStore:
    if isinstance(base, SqliteStore):
        return SharedRecipeCatalogStore(sqlite_connection=base._connection, lock=base._lock)
    if isinstance(base, PostgresStore):
        return SharedRecipeCatalogStore(postgres_connection=base._connection, lock=base._lock, initialize_schema=_runtime_schema_ddl_allowed())
    return SharedRecipeCatalogStore()


def _build_workspace_connection_pool(base: InMemoryStore) -> PostgresOperationPool | None:
    if not isinstance(base, PostgresStore):
        return None
    return PostgresOperationPool(base.database_url)


workspace_connection_pool = _build_workspace_connection_pool(base_store)
store = WorkspaceStoreRouter(
    base_store,
    _build_recipe_catalog_store(base_store),
    workspace_connection_pool=workspace_connection_pool,
)
workspace_mutation = WorkspaceMutation(store, ConcurrentWorkspaceWriteError)
recipe_catalog_mutation = RecipeCatalogMutation(store._recipe_catalog)


def _build_auth_repository() -> AccountRepository:
    base_store = store._base_store
    if isinstance(base_store, PostgresStore):
        repository = PostgresAccountRepository(base_store.database_url, initialize_schema=_runtime_schema_ddl_allowed())
        repository.cleanup_expired_security_records()
        return repository
    if isinstance(base_store, SqliteStore) and str(base_store.database_path) != ":memory:":
        base_path = Path(base_store.database_path)
        auth_path = base_path.with_name(f"{base_path.stem}.auth{base_path.suffix or '.db'}")
        repository = AccountRepository(str(auth_path))
        repository.cleanup_expired_security_records()
        return repository
    return AccountRepository()


auth_repository = _build_auth_repository()


def _assert_workspace_writable_for_account_lifecycle(workspace_id: str) -> None:
    if auth_repository.is_workspace_deletion_in_progress(workspace_id):
        raise WorkspaceDeletionInProgress(workspace_id)


store.set_workspace_write_guard(_assert_workspace_writable_for_account_lifecycle)


class AccountDeletionCoordinator:
    """Run account deletion as a fenced, retryable local saga.

    The account lifecycle transition is durable in the auth repository. The
    process lock only serializes overlapping requests in this API process; the
    repository status and workspace write guard remain the source of truth for
    requests handled by another process.
    """

    def __init__(self, account_repository: AccountRepository, workspace_store: WorkspaceStoreRouter) -> None:
        self._account_repository = account_repository
        self._workspace_store = workspace_store
        self._lock = RLock()

    def run(self, context) -> None:
        if context.role == "guest" or not context.subject_id:
            raise ValueError("account context is required")
        with self._lock:
            deletion = self._account_repository.begin_account_deletion(
                context.subject_id,
                expected_session_version=context.session_version,
            )
            if deletion is None or deletion.status != "deleting":
                raise RuntimeError("account deletion fence could not be acquired")
            self._workspace_store.purge_workspace(context.workspace_id, allow_current_lease=True)
            if not self._account_repository.delete_account(
                context.subject_id,
                expected_session_version=context.session_version,
            ):
                raise RuntimeError("account deletion credential step did not complete")


account_deletion_coordinator = AccountDeletionCoordinator(auth_repository, store)


def _build_grocy_client() -> GrocyClient | None:
    config = GrocyConfig.from_env()
    return GrocyClient(config) if config is not None else None


grocy_client = _build_grocy_client()


def _build_ocr_engine() -> PaddleOcrEngine | RemoteOcrEngine:
    worker_url = os.getenv("RESCUE_MEAL_OCR_URL", "").strip()
    return RemoteOcrEngine(worker_url) if worker_url else PaddleOcrEngine()


ocr_engine = _build_ocr_engine()
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def application_lifespan(_app: FastAPI):
    """Own process-level storage and integration lifecycles explicitly."""

    try:
        # OR-Tools has a one-time cold import that can be much slower than a
        # normal preview request. Load it before /ready so the first user
        # request never pays the dependency startup cost. A missing/broken
        # install remains a safe deterministic-greedy fallback.
        warm_up_cp_sat()
        if workspace_connection_pool is not None:
            # Open and fill the configured minimum at startup so a process
            # cannot report healthy while the operation store is unable to
            # serve its first workspace request. Keeping startup inside this
            # try/finally also closes direct owners if pool startup fails.
            workspace_connection_pool.open(wait=True)
        yield
    finally:
        # Workspace stores share the base PostgreSQL connection with product
        # caches and the recipe catalog, so close the router before auth and
        # external clients. Cleanup is idempotent and must not mask shutdown.
        for resource in (store, auth_repository, grocy_client):
            close = getattr(resource, "close", None)
            if not callable(close):
                continue
            try:
                close()
            except Exception:
                continue


app = FastAPI(
    title="Rescue Meal API",
    version="0.1.0",
    description="영수증·라벨·보관 이력을 안전 경계와 함께 관리하는 MVP API",
    lifespan=application_lifespan,
)


def _workspace_revision_conflict_response(exc: ConcurrentWorkspaceWriteError) -> JSONResponse:
    headers = {WORKSPACE_CONFLICT_HEADER: "workspace_revision"}
    if exc.current_revision is not None:
        headers[WORKSPACE_REVISION_RESPONSE_HEADER] = str(exc.current_revision)
    content: dict[str, object] = {
        "code": "workspace_revision_conflict",
        "detail": "다른 기기에서 workspace가 먼저 변경되었습니다. 최신 목록을 다시 불러온 뒤 재시도해 주세요.",
        "retryable": True,
        "action": "reload_and_retry",
    }
    if exc.expected_revision is not None:
        content["expected_revision"] = exc.expected_revision
    if exc.current_revision is not None:
        content["current_revision"] = exc.current_revision
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        headers=headers,
        content=content,
    )


def _workspace_deletion_in_progress_response() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_423_LOCKED,
        content={
            "code": "account_deletion_in_progress",
            "detail": "계정 삭제가 진행 중입니다. 삭제가 끝날 때까지 workspace를 변경할 수 없습니다.",
            "retryable": True,
            "action": "retry_account_deletion",
        },
    )


def _typed_service_unavailable(
    code: str,
    detail: str,
    *,
    retryable: bool,
    action: str,
) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={"Retry-After": "1"} if retryable else None,
        detail={
            "code": code,
            "detail": detail,
            "retryable": retryable,
            "action": action,
        },
    )


def _postgres_pool_unavailable_response() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={"Retry-After": "1"},
        content={
            "code": "postgres_pool_unavailable",
            "detail": "현재 저장소 연결 풀이 준비되지 않았거나 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
            "retryable": True,
            "action": "retry_later",
        },
    )


def _workspace_storage_unavailable_response() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "code": "workspace_storage_unavailable",
            "detail": "현재 저장소가 workspace 격리를 지원하지 않습니다. 서버 저장소 설정을 확인해 주세요.",
            "retryable": False,
            "action": "configure_storage",
        },
    )


def _recipe_catalog_revision_conflict_response(exc: RecipeCatalogConcurrentWriteError) -> JSONResponse:
    headers = {RECIPE_CATALOG_REVISION_RESPONSE_HEADER: str(exc.current_revision or 0)}
    content: dict[str, object] = {
        "code": "recipe_catalog_revision_conflict",
        "detail": "다른 운영자가 recipe catalog를 먼저 변경했습니다. 최신 draft를 다시 불러온 뒤 재시도해 주세요.",
        "retryable": True,
        "action": "reload_and_retry",
    }
    if exc.expected_revision is not None:
        content["expected_revision"] = exc.expected_revision
    if exc.current_revision is not None:
        content["current_revision"] = exc.current_revision
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        headers=headers,
        content=content,
    )


@app.exception_handler(ConcurrentWorkspaceWriteError)
async def concurrent_workspace_write_handler(_request: Request, exc: ConcurrentWorkspaceWriteError) -> JSONResponse:
    return _workspace_revision_conflict_response(exc)


@app.exception_handler(RecipeCatalogConcurrentWriteError)
async def recipe_catalog_concurrent_write_handler(_request: Request, exc: RecipeCatalogConcurrentWriteError) -> JSONResponse:
    return _recipe_catalog_revision_conflict_response(exc)


@app.exception_handler(WorkspaceDeletionInProgress)
async def workspace_deletion_in_progress_handler(_request: Request, _exc: WorkspaceDeletionInProgress) -> JSONResponse:
    return _workspace_deletion_in_progress_response()


@app.exception_handler(PostgresPoolUnavailable)
async def postgres_pool_unavailable_handler(_request: Request, _exc: PostgresPoolUnavailable) -> JSONResponse:
    return _postgres_pool_unavailable_response()


@app.exception_handler(PostgresConnectionUnavailable)
async def postgres_connection_unavailable_handler(_request: Request, _exc: PostgresConnectionUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={"Retry-After": "1"},
        content={
            "code": "postgres_connection_unavailable",
            "detail": "현재 저장소 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.",
            "retryable": True,
            "action": "retry_later",
        },
    )


def build_cors_origins(*, auth_required_mode: bool, configured: str) -> list[str]:
    default_origins = [] if auth_required_mode else ["http://127.0.0.1:4173", "http://localhost:4173"]
    configured_origins = [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]
    return list(dict.fromkeys(default_origins + configured_origins))


cors_origins = build_cors_origins(
    auth_required_mode=auth_required(),
    configured=os.getenv("RESCUE_MEAL_CORS_ORIGINS", ""),
)


def _workspace_request_is_public(path: str) -> bool:
    return path in {"/health", "/ready", "/api/client-errors", "/api/internal/metrics"} or path.startswith("/api/auth/") or path.startswith("/api/internal/grocy/") or path.startswith("/api/internal/notifications/") or path.startswith("/api/internal/product-enrichment/") or path.startswith("/api/internal/product-runtime/")


def _expected_workspace_revision(request: Request) -> int | None:
    raw_value = request.headers.get(WORKSPACE_REVISION_REQUEST_HEADER)
    if raw_value is None or not raw_value.strip():
        return None
    normalized = raw_value.strip()
    if not re.fullmatch(r"[0-9]{1,19}", normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{WORKSPACE_REVISION_REQUEST_HEADER}는 0 이상의 정수여야 합니다.",
        )
    return int(normalized)


def _expected_recipe_catalog_revision(request: Request) -> int | None:
    raw_value = request.headers.get(RECIPE_CATALOG_REVISION_REQUEST_HEADER)
    if raw_value is None or not raw_value.strip():
        return None
    normalized = raw_value.strip()
    if not re.fullmatch(r"[0-9]{1,19}", normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{RECIPE_CATALOG_REVISION_REQUEST_HEADER}는 0 이상의 정수여야 합니다.",
        )
    return int(normalized)


def _workspace_request_requires_revision(request: Request) -> bool:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return False
    if not request.url.path.startswith("/api/") or _workspace_request_is_public(request.url.path):
        return False
    if request.url.path.startswith("/api/recipe-review/"):
        return False
    return request.url.path not in WORKSPACE_REVISION_READ_ONLY_POST_PATHS


@app.middleware("http")
async def workspace_context_middleware(request: Request, call_next):
    authorization = request.headers.get("authorization", "").strip()
    observability_metrics_request = request.url.path == "/api/internal/metrics"
    account_deletion_request = request.url.path == "/api/account/delete"
    account_deletion_recovery_request = request.url.path == "/api/auth/me"
    workspace_id = DEFAULT_WORKSPACE_ID
    auth_context = current_auth_context()
    if authorization and not observability_metrics_request:
        scheme, separator, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token:
            return JSONResponse(status_code=401, content={"detail": "Bearer token이 필요합니다."})
        try:
            auth_context = verify_access_token(token)
            workspace_id = auth_context.workspace_id
        except InvalidGuestToken:
            return JSONResponse(status_code=401, content={"detail": "유효하지 않거나 만료된 access token입니다."})
        if auth_repository.is_token_revoked(token):
            return JSONResponse(status_code=401, content={"detail": "이미 로그아웃된 token입니다."})
        if not auth_repository.is_context_current(auth_context):
            if auth_repository.is_account_deletion_in_progress(auth_context):
                if not (account_deletion_request or account_deletion_recovery_request):
                    return _workspace_deletion_in_progress_response()
            else:
                return JSONResponse(status_code=401, content={"detail": "account session이 더 이상 유효하지 않습니다. 다시 로그인해 주세요."})
    elif not observability_metrics_request and auth_required() and not _workspace_request_is_public(request.url.path) and request.url.path.startswith("/api/"):
        return JSONResponse(status_code=401, content={"detail": "인증이 필요합니다."})

    expected_revision: int | None = None
    if _workspace_request_requires_revision(request):
        # Validate before acquiring a durable workspace lease so malformed
        # client headers cannot leak a store lease on the short-circuit path.
        try:
            expected_revision = _expected_workspace_revision(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    workspace_acquired = False
    active_store: InMemoryStore | None = None
    try:
        active_store = store.acquire_workspace(
            workspace_id,
            seed=auth_repository.find_by_workspace(workspace_id) is None,
        )
        workspace_acquired = True
        store.refresh_workspace(workspace_id)
    except PostgresPoolUnavailable:
        if workspace_acquired:
            store.release_workspace(workspace_id)
        return _postgres_pool_unavailable_response()
    except RuntimeError:
        if workspace_acquired:
            store.release_workspace(workspace_id)
        return _workspace_storage_unavailable_response()

    workspace_context_token = set_workspace_id(workspace_id)
    auth_context_token = set_auth_context(auth_context)
    try:
        current_revision = getattr(active_store, "workspace_revision", None)
        if expected_revision is not None and current_revision is not None and expected_revision != current_revision:
            return _workspace_revision_conflict_response(
                ConcurrentWorkspaceWriteError(
                    "client workspace revision is stale",
                    expected_revision=expected_revision,
                    current_revision=current_revision,
                )
            )
        if auth_context.role != "guest" and not auth_repository.is_context_current(auth_context):
            if not auth_repository.is_account_deletion_in_progress(auth_context):
                return JSONResponse(status_code=401, content={"detail": "account session이 더 이상 유효하지 않습니다. 다시 로그인해 주세요."})
            if not (account_deletion_request or account_deletion_recovery_request):
                return _workspace_deletion_in_progress_response()
        response = await call_next(request)
        current_revision = getattr(active_store, "workspace_revision", None)
        if current_revision is not None and WORKSPACE_REVISION_RESPONSE_HEADER not in response.headers:
            response.headers[WORKSPACE_REVISION_RESPONSE_HEADER] = str(current_revision)
        return response
    finally:
        reset_auth_context(auth_context_token)
        reset_workspace(workspace_context_token)
        if workspace_acquired:
            store.release_workspace(workspace_id)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request_id_from_header(request.headers.get(REQUEST_ID_HEADER))
    request_id_token = set_request_id(request_id)
    request.state.request_id = get_request_id()
    started_at = start_timer()
    request_runtime_metrics.start()
    try:
        response = await call_next(request)
    except Exception:
        request_runtime_metrics.observe(
            method=request.method,
            route=route_template_from_scope(request.scope),
            status_code=500,
            duration_seconds=max(0.0, start_timer() - started_at),
        )
        log_request(
            request_id=request_id,
            method=request.method,
            scope=request.scope,
            status_code=500,
            started_at=started_at,
        )
        raise
    finally:
        reset_request_id(request_id_token)
    response.headers[REQUEST_ID_HEADER] = request_id
    request_runtime_metrics.observe(
        method=request.method,
        route=route_template_from_scope(request.scope),
        status_code=response.status_code,
        duration_seconds=max(0.0, start_timer() - started_at),
    )
    log_request(
        request_id=request_id,
        method=request.method,
        scope=request.scope,
        status_code=response.status_code,
        started_at=started_at,
    )
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    return response


# Keep CORS outside the request-context middleware so short-circuit responses
# (for example invalid-token 401s) receive the same browser headers as normal
# route responses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER, WORKSPACE_REVISION_RESPONSE_HEADER, WORKSPACE_CONFLICT_HEADER, RECIPE_CATALOG_REVISION_RESPONSE_HEADER, "X-Idempotency-Replayed"],
)


def _receipt_request_from_parsed(
    *,
    source_filename: str,
    purchased_at: datetime | None,
    parsed: ParsedReceipt,
) -> ReceiptDraftRequest:
    if not parsed.lines:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="OCR 결과에서 영수증 line을 찾지 못했습니다.")
    inputs: list[ReceiptLineInput] = []
    user_aliases = store.product_alias_map()
    for line in parsed.lines:
        line_type = line.line_type
        resolution = resolve_receipt_name(
            line.raw_name,
            parser_name=line.canonical_name,
            parser_confidence=line.match_confidence,
            user_aliases=user_aliases,
        )
        canonical_name = resolution.canonical_name
        confidence = resolution.confidence
        if parsed.kind == "restaurant_receipt" and line_type == "product":
            # Restaurant menu items are not grocery stock. Keep them visible in
            # review, but make commit impossible without a future leftover flow.
            line_type = "unknown"
            canonical_name = None
            confidence = 0
            resolution = ReceiptNameResolution(canonical_name=None, source="unmatched", confidence=0, candidates=[])
        inputs.append(
            ReceiptLineInput(
                raw_name=line.raw_name,
                barcode=line.barcode,
                quantity=line.quantity,
                unit=line.unit,
                unit_price=line.unit_price,
                total_price=line.total_price,
                line_type=line_type,
                canonical_name=canonical_name,
                match_confidence=confidence,
                match_source=resolution.source,
                match_candidates=[
                    ReceiptMatchCandidateResponse(
                        source=candidate.source,
                        canonical_name=candidate.canonical_name,
                        source_url=candidate.source_url,
                        brand=candidate.brand,
                        category=candidate.category,
                        quantity_text=candidate.quantity_text,
                        confidence=candidate.confidence,
                        provenance_note=candidate.provenance_note,
                        shelf_life_text=candidate.shelf_life_text,
                        storage_hint=candidate.storage_hint,
                        source_freshness=candidate.source_freshness,
                    )
                    for candidate in resolution.candidates
                ],
                source_observation_ids=[f"obs-{index + 1}" for index in line.observation_indices],
            )
        )
    return ReceiptDraftRequest(
        source_filename=source_filename,
        purchased_at=purchased_at or parsed.purchased_at,
        template_id=parsed.template_id,
        template_confidence=parsed.template_confidence,
        merchant_name=parsed.merchant_name,
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
    review_observations: list[OcrReviewObservationResponse] | None = None,
    candidate_source_observation_ids: list[list[str]] | None = None,
    ocr_input_profile: OcrInputProfile = "source",
) -> LabelParseResponse:
    candidate = parsed.consumption_date_candidate
    candidates = [
        _label_candidate_response(
            candidate,
            source_observation_ids=(candidate_source_observation_ids[index] if candidate_source_observation_ids and index < len(candidate_source_observation_ids) else []),
        )
        for index, candidate in enumerate(parsed.date_candidates)
    ]
    consumption_source_observation_ids: list[str] = []
    if candidate is not None and candidate_source_observation_ids:
        for index, parsed_candidate in enumerate(parsed.date_candidates):
            if parsed_candidate is candidate and index < len(candidate_source_observation_ids):
                consumption_source_observation_ids = candidate_source_observation_ids[index]
                break
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
        storage_condition_text=parsed.storage_condition_text,
        date_candidates=candidates,
        consumption_date_candidate=(
            _label_candidate_response(candidate, source_observation_ids=consumption_source_observation_ids)
            if candidate
            else None
        ),
        review_observations=review_observations or [],
        warnings=parsed.warnings,
        requires_review=parsed.requires_review,
        quality=quality,
        ocr_input_profile=ocr_input_profile,
    )


def _label_candidate_response(
    candidate: LabelDateCandidate,
    *,
    source_observation_ids: list[str] | None = None,
) -> LabelDateCandidateResponse:
    return LabelDateCandidateResponse(
        kind=candidate.kind,
        value=candidate.value,
        raw_text=candidate.raw_text,
        confidence=candidate.confidence,
        requires_review=candidate.requires_review,
        context=candidate.context,
        source_observation_ids=source_observation_ids or [],
    )


def _label_review_links(
    run: OcrRun,
    parsed: ParsedLabel,
) -> tuple[list[OcrReviewObservationResponse], list[list[str]]]:
    """Link date candidates to safe OCR locations without returning OCR text.

    Label parsing is intentionally text-based because the semantic meaning of a
    date may live in an adjacent observation (for example, a separate
    ``소비기한`` heading). The link step is conservative: it only exposes a
    date observation when its numeric value can be matched to one OCR
    observation, or to a small group of split year/month/day observations.
    """

    candidate_ids: list[list[str]] = []
    allowed_indices: set[int] = set()
    for candidate in parsed.date_candidates:
        indices = _find_label_date_observation_indices(run, candidate)
        ids: list[str] = []
        for index in indices:
            if index < 0 or index >= len(run.observations):
                continue
            if _normalise_review_bbox(run.observations[index].bbox) is None:
                continue
            allowed_indices.add(index)
            ids.append(f"obs-{index + 1}")
        candidate_ids.append(ids)
    return _review_observations_response(run, allowed_indices=allowed_indices), candidate_ids


def _find_label_date_observation_indices(run: OcrRun, candidate: LabelDateCandidate) -> list[int]:
    target_digits = candidate.value.strftime("%Y%m%d")
    target_raw = re.sub(r"\s+", "", candidate.raw_text)
    date_context_markers = ("소비기한", "유통기한", "품질유지기한", "유효기간", "제조일", "생산일", "포장일", "expiration", "sellby", "bestbefore")
    exact_matches: list[int] = []
    for index, observation in enumerate(run.observations):
        compact_text = re.sub(r"\s+", "", observation.text)
        digits = re.sub(r"\D", "", observation.text)
        has_observation_date_marker = bool(re.search(r"[./-]|년|월|일", observation.text))
        has_date_context = any(marker in observation.text.lower() for marker in date_context_markers)
        if (target_raw and target_raw in compact_text) or (digits == target_digits and (has_observation_date_marker or has_date_context)):
            exact_matches.append(index)
    if exact_matches:
        return exact_matches[:8]

    # OCR may split a date into three observations. Keep this fallback tight
    # so unrelated numeric fields on a dense price label are not highlighted.
    parts = [candidate.value.strftime("%Y"), candidate.value.strftime("%m"), candidate.value.strftime("%d")]
    matched: list[int] = []
    search_start = 0
    for part in parts:
        found = next(
            (
                index
                for index in range(search_start, min(len(run.observations), search_start + 4))
                if re.sub(r"\D", "", run.observations[index].text) == part
            ),
            None,
        )
        if found is None:
            return []
        matched.append(found)
        search_start = found + 1
    return matched


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
                shelf_life_text=candidate.shelf_life_text,
                storage_hint=candidate.storage_hint,
                source_freshness=candidate.source_freshness,
            )
            for candidate in result.candidates
        ],
        warnings=result.warnings,
        requires_review=result.requires_review,
        provider_statuses=result.provider_statuses,
    )


def _product_name_lookup_response(query: str, result: ProductNameLookupResult) -> ProductNameLookupResponse:
    return ProductNameLookupResponse(
        query=query,
        provider=result.provider,
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
                shelf_life_text=candidate.shelf_life_text,
                storage_hint=candidate.storage_hint,
                source_freshness=candidate.source_freshness,
            )
            for candidate in result.candidates
        ],
        warnings=[result.detail] if result.detail else [],
        requires_review=True,
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
        blur_score=report.blur_score,
        warnings=report.warnings,
        orientation_corrected=report.orientation_corrected,
    )


def _pdf_quality_response(warnings: list[str] | None = None) -> ImageQualityResponse:
    return ImageQualityResponse(
        status="review_required",
        width=None,
        height=None,
        format="PDF",
        brightness=None,
        contrast=None,
        edge_energy=None,
        blur_score=None,
        warnings=warnings or ["전자 영수증 PDF의 텍스트를 읽었어요. 원본과 상품 항목을 확인해 주세요."],
        orientation_corrected=False,
    )


def _extract_pdf_ocr(data: bytes) -> OcrRun:
    text_run = extract_pdf_text(data)
    if text_run.status != "unavailable" or "텍스트 레이어가 없는 스캔 PDF" not in (text_run.message or ""):
        return text_run

    render_result = render_pdf_pages(data)
    if render_result.status == "too_many_pages":
        return OcrRun(
            status="unavailable",
            engine="pypdfium2+paddleocr",
            observations=[],
            message="스캔 PDF가 3쪽을 넘어 한 번에 처리할 수 없습니다. PDF를 나누거나 사진으로 다시 올려 주세요.",
            model_version=None,
        )
    if render_result.status != "ready" or not render_result.pages:
        return OcrRun(
            status="unavailable",
            engine="pypdfium2+paddleocr",
            observations=[],
            message="스캔 PDF를 이미지로 변환하지 못했습니다. PDF를 이미지로 저장하거나 사진으로 다시 올려 주세요.",
            model_version=None,
        )

    observations: list[OcrObservation] = []
    model_versions: list[str] = []
    for page_index, page_bytes in enumerate(render_result.pages, start=1):
        page_run = ocr_engine.extract(page_bytes, f"scanned-pdf-page-{page_index}.png")
        if page_run.model_version:
            model_versions.append(page_run.model_version)
        if page_run.status != "complete":
            continue
        # Page-local bbox values cannot be safely overlaid on the original
        # multi-page PDF preview, so keep only text/confidence for parsing.
        observations.extend(
            OcrObservation(text=item.text, confidence=item.confidence, bbox=None)
            for item in page_run.observations
            if item.text.strip()
        )

    if not observations:
        return OcrRun(
            status="unavailable",
            engine="paddleocr-pdf",
            observations=[],
            message="스캔 PDF에서 OCR 결과를 읽지 못했습니다. 사진으로 다시 올려 주세요.",
            model_version=model_versions[0] if model_versions else None,
        )
    return OcrRun(
        status="complete",
        engine="paddleocr-pdf",
        observations=observations,
        message="스캔 PDF 페이지를 이미지로 변환해 OCR했어요. 원본과 상품 항목을 확인해 주세요.",
        model_version=model_versions[0] if model_versions else None,
    )


def _review_observations_response(run: OcrRun, *, allowed_indices: set[int] | None = None) -> list[OcrReviewObservationResponse]:
    observations: list[OcrReviewObservationResponse] = []
    for index, observation in enumerate(run.observations):
        if allowed_indices is not None and index not in allowed_indices:
            continue
        bbox = _normalise_review_bbox(observation.bbox)
        if bbox is None:
            continue
        confidence = observation.confidence
        if not math.isfinite(confidence):
            confidence = 0.0
        observations.append(
            OcrReviewObservationResponse(
                id=f"obs-{index + 1}",
                bbox=bbox,
                confidence=max(0.0, min(confidence, 1.0)),
            )
        )
    return observations


def _normalise_review_bbox(bbox: tuple[float, ...] | None) -> list[float] | None:
    """Accept normalized bottom-left x/y/width/height coordinates only."""

    if bbox is None or len(bbox) < 4:
        return None
    try:
        values = tuple(float(value) for value in bbox[:4])
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(value) for value in values):
        return None
    x, y, width, height = values
    if width <= 0 or height <= 0 or x < 0 or y < 0 or x >= 1 or y >= 1:
        return None
    right = min(1.0, x + width)
    top = min(1.0, y + height)
    if right <= x or top <= y:
        return None
    return [round(x, 6), round(y, 6), round(right - x, 6), round(top - y, 6)]


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
    if content_type == "application/pdf" and not looks_like_pdf(data):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="유효한 PDF 파일을 선택해 주세요.")
    return filename, data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rescue-meal-api", "storage": store.backend_name}


@app.get("/ready", response_model=ReadinessResponse)
def readiness() -> ReadinessResponse:
    base_store = store._base_store
    database_status: Literal["not_applicable", "ok"] = "not_applicable"
    auth_is_configured = bool(os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip())
    if _production_environment() and os.getenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", "").strip():
        raise _legacy_recipe_review_token_error()
    try:
        _ensure_auth_secret()
    except HTTPException as exc:
        if exc.status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        raise _typed_service_unavailable(
            "auth_configuration_missing",
            "인증 secret 설정이 필요합니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        ) from exc
    try:
        if isinstance(base_store, SqliteStore):
            row = base_store._connection.execute("SELECT 1").fetchone()
            if not row or row[0] != 1:
                raise RuntimeError("sqlite readiness query returned no row")
            database_status = "ok"
        elif isinstance(base_store, PostgresStore):
            # The base connection is shared by the base snapshot, shared SQL
            # caches, and the recipe catalog. Serialize the readiness probe
            # with those owners while the reconnectable adapter swaps a dead
            # psycopg connection for a fresh one.
            with base_store._lock:
                with base_store._connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                    row = cursor.fetchone()
                if not row or row[0] != 1:
                    raise RuntimeError("postgres readiness query returned no row")
                check_postgres_migration_ledger(base_store._connection)
                check_postgres_schema(base_store._connection, inventory_mode=base_store.inventory_mode)
            database_status = "ok"
    except Exception as exc:
        raise _typed_service_unavailable(
            "readiness_storage_unavailable",
            "저장소 readiness 확인에 실패했습니다. 잠시 후 다시 확인해 주세요.",
            retryable=True,
            action="retry_later",
        ) from exc
    return ReadinessResponse(
        storage=base_store.backend_name,
        database=database_status,
        grocy_configured=grocy_client is not None,
        auth_required=auth_required(),
        auth_configured=auth_is_configured,
        rate_limit_enabled=_auth_rate_limit_enabled(),
    )


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


@app.get("/api/integrations/grocy/worker/status", response_model=list[GrocyWorkerHeartbeatRecord])
def grocy_worker_status() -> list[GrocyWorkerHeartbeatRecord]:
    return store.list_grocy_worker_heartbeats()


@app.get("/api/integrations/notifications/worker/status", response_model=list[NotificationWorkerHeartbeatRecord])
def notification_worker_status() -> list[NotificationWorkerHeartbeatRecord]:
    return store.list_notification_worker_heartbeats()


@app.get("/api/integrations/product-enrichment/worker/status", response_model=list[ProductEnrichmentWorkerHeartbeatRecord])
def product_enrichment_worker_status() -> list[ProductEnrichmentWorkerHeartbeatRecord]:
    return store.list_product_enrichment_worker_heartbeats()


def _require_grocy_worker_token(request: Request) -> None:
    expected = os.getenv("RESCUE_MEAL_GROCY_WORKER_TOKEN", "").strip()
    if not expected:
        raise _typed_service_unavailable(
            "grocy_worker_configuration_missing",
            "Grocy worker token이 설정되지 않았습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        )
    provided = request.headers.get("x-rescue-meal-grocy-worker-token", "").strip()
    if not provided:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grocy worker token이 필요합니다.")
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Grocy worker token이 유효하지 않습니다.")


def _require_notification_worker_token(request: Request) -> None:
    expected = os.getenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "").strip()
    if not expected:
        raise _typed_service_unavailable(
            "notification_worker_configuration_missing",
            "notification worker token이 설정되지 않았습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        )
    provided = request.headers.get("x-rescue-meal-notification-worker-token", "").strip()
    if not provided:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="notification worker token이 필요합니다.")
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="notification worker token이 유효하지 않습니다.")


def _require_product_enrichment_worker_token(request: Request) -> None:
    expected = os.getenv("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "").strip()
    if not expected:
        raise _typed_service_unavailable(
            "product_enrichment_worker_configuration_missing",
            "product enrichment worker token이 설정되지 않았습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        )
    provided = request.headers.get("x-rescue-meal-product-enrichment-worker-token", "").strip()
    if not provided:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="product enrichment worker token이 필요합니다.")
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="product enrichment worker token이 유효하지 않습니다.")


def _require_observability_token(request: Request) -> None:
    expected = os.getenv("RESCUE_MEAL_OBSERVABILITY_TOKEN", "").strip()
    if not expected:
        raise _typed_service_unavailable(
            "observability_configuration_missing",
            "observability token이 설정되지 않았습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        )
    provided = request.headers.get("authorization", "").strip()
    scheme, separator, token = provided.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="observability bearer token이 필요합니다.")
    if not secrets.compare_digest(token.strip(), expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="observability bearer token이 유효하지 않습니다.")


def _runtime_metrics_prometheus_text() -> str:
    parts = [
        request_runtime_metrics.prometheus_text().rstrip(),
        product_provider_metrics.prometheus_text().rstrip(),
        notification_delivery_metrics.prometheus_text().rstrip(),
    ]
    return "\n".join(part for part in parts if part) + "\n"


@app.get("/api/internal/product-runtime/status", response_model=ProductProviderRuntimeStatusResponse)
def product_runtime_status(request: Request) -> ProductProviderRuntimeStatusResponse:
    """Return safe, worker-local provider runtime counters for operators."""

    _require_product_enrichment_worker_token(request)
    return ProductProviderRuntimeStatusResponse(
        external_lookup_enabled=external_lookups_enabled(),
        product_cache_backend="shared_sql" if isinstance(product_lookup_cache, SharedProductLookupCache) else "process_local",
        product_name_cache_backend="shared_sql" if isinstance(product_name_lookup_cache, SharedProductNameLookupCache) else "process_local",
        provider_rate_limiter_backend="shared_sql" if isinstance(product_provider_rate_limiter, SharedProductProviderRateLimiter) else "process_local",
        metrics=[ProductProviderMetricResponse(**item) for item in product_provider_metrics.snapshot()],
    )


@app.get("/api/internal/product-runtime/metrics", response_class=Response)
def product_runtime_metrics(request: Request) -> Response:
    """Return a safe Prometheus text scrape for the current API worker."""

    _require_product_enrichment_worker_token(request)
    return Response(
        content=product_provider_metrics.prometheus_text(),
        media_type="text/plain; version=0.0.4",
    )


@app.get("/api/internal/notifications/metrics", response_class=Response)
def notification_worker_metrics(request: Request) -> Response:
    """Return safe, worker-local notification delivery counters."""

    _require_notification_worker_token(request)
    return Response(
        content=notification_delivery_metrics.prometheus_text(),
        media_type="text/plain; version=0.0.4",
    )


@app.get("/api/internal/metrics", response_class=Response)
def runtime_metrics(request: Request) -> Response:
    """Return one token-protected scrape surface for API runtime signals."""

    _require_observability_token(request)
    return Response(
        content=_runtime_metrics_prometheus_text(),
        media_type="text/plain; version=0.0.4",
    )


@app.post("/api/internal/grocy/workspaces/{workspace_id}/tick", response_model=GrocyWorkerTickResponse)
def run_internal_grocy_worker_tick(workspace_id: str, request: Request, payload: GrocyWorkerTickRequest) -> GrocyWorkerTickResponse:
    _require_grocy_worker_token(request)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="workspace ID 형식이 잘못되었습니다.")
    worker = GrocyWorker(
        store=store,
        settings=GrocyWorkerSettings(
            workspace_ids=(workspace_id,),
            worker_id=payload.worker_id,
            lease_seconds=payload.lease_seconds,
            stale_after_seconds=payload.stale_after_seconds,
            process_limit=payload.process_limit,
        ),
        grocy_configured=lambda: grocy_client is not None,
        scan=_scan_stale_grocy_outbox,
        process=_process_grocy_outbox,
    )
    result = worker.tick_workspace(workspace_id)
    return GrocyWorkerTickResponse(**result.as_dict())


@app.post("/api/internal/notifications/workspaces/{workspace_id}/tick", response_model=NotificationWorkerTickResponse)
def run_internal_notification_worker_tick(workspace_id: str, request: Request, payload: NotificationWorkerTickRequest) -> NotificationWorkerTickResponse:
    _require_notification_worker_token(request)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="workspace ID 형식이 잘못되었습니다.")
    worker = NotificationDeliveryWorker(
        store=store,
        settings=NotificationWorkerSettings(
            workspace_ids=(workspace_id,),
            worker_id=payload.worker_id,
            lease_seconds=payload.lease_seconds,
            stale_after_seconds=payload.stale_after_seconds,
            process_limit=payload.process_limit,
        ),
        notifications=lambda: _current_notifications(for_push=True),
        metrics=notification_delivery_metrics,
    )
    result = worker.tick_workspace(workspace_id)
    return NotificationWorkerTickResponse(**result.as_dict())


@app.post("/api/internal/product-enrichment/workspaces/{workspace_id}/tick", response_model=ProductEnrichmentWorkerTickResponse)
def run_internal_product_enrichment_worker_tick(workspace_id: str, request: Request, payload: ProductEnrichmentWorkerTickRequest) -> ProductEnrichmentWorkerTickResponse:
    _require_product_enrichment_worker_token(request)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="workspace ID 형식이 잘못되었습니다.")
    worker = ProductEnrichmentWorker(
        store=store,
        settings=ProductEnrichmentWorkerSettings(
            workspace_ids=(workspace_id,),
            worker_id=payload.worker_id,
            lease_seconds=payload.lease_seconds,
            stale_after_seconds=payload.stale_after_seconds,
            process_limit=payload.process_limit,
            max_attempts=payload.max_attempts,
        ),
        resolver_factory=lambda: ProductNameFallbackResolver(
            primary=MfdsI1250Resolver(
                cache=product_name_lookup_cache,
                rate_limiter=product_provider_rate_limiter,
                metrics=product_provider_metrics,
            ),
            fallback=OpenFoodFactsResolver(
                cache=product_name_lookup_cache,
                rate_limiter=product_provider_rate_limiter,
                metrics=product_provider_metrics,
            ),
        ),
    )
    result = worker.tick_workspace(workspace_id)
    return ProductEnrichmentWorkerTickResponse(**result.as_dict())


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


def _canonical_key(value: str) -> str:
    return " ".join(value.strip().casefold().split())


PRODUCT_MAPPING_REQUIRED = "Grocy product mapping과 단위 확인이 필요합니다."
LOCATION_MAPPING_REQUIRED = "Grocy 상품·단위 매핑과 보관 위치 매핑 확인이 필요합니다."
RECONCILIATION_REQUIRED = "Grocy 외부 반영 여부 확인이 필요합니다."


def _grocy_worker_lease_seconds() -> int:
    try:
        value = int(os.getenv("RESCUE_MEAL_GROCY_WORKER_LEASE_SECONDS", "120"))
    except ValueError:
        value = 120
    return max(30, min(3600, value))


def _aggregate_grocy_sync_status(statuses: list[GrocySyncStatus]) -> GrocySyncStatus:
    if not statuses or all(item == "not_configured" for item in statuses):
        return "not_configured"
    if any(item == "dead_letter" for item in statuses):
        return "dead_letter"
    if any(item == "needs_reconciliation" for item in statuses):
        return "needs_reconciliation"
    if any(item == "needs_mapping" for item in statuses):
        return "needs_mapping"
    if any(item in {"queued", "in_flight"} for item in statuses):
        return "queued"
    return "succeeded"


def _grocy_sync_status_for_outbox(record: GrocyOutboxRecord) -> GrocySyncStatus:
    if record.status == "blocked":
        return "needs_mapping"
    if record.status in {"pending", "in_flight"}:
        return "queued"
    if record.status == "dead_letter":
        return "dead_letter"
    if record.status == "reconciliation_required":
        return "needs_reconciliation"
    return "succeeded"


def _grocy_transaction_id(payload: object) -> str | None:
    if isinstance(payload, dict):
        for key in ("transaction_id", "transactionId", "id"):
            value = payload.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
    if isinstance(payload, list):
        for item in payload:
            transaction_id = _grocy_transaction_id(item)
            if transaction_id:
                return transaction_id
    return None


def _outbox_id(idempotency_key: str) -> str:
    return f"grocy-outbox-{sha256(idempotency_key.encode('utf-8')).hexdigest()[:20]}"


def _resolve_grocy_outbox_mapping(
    record: GrocyOutboxRecord,
) -> tuple[bool, int | None, int | None, int | None, str | None]:
    mapping = store.grocy_mappings.get(_canonical_key(record.canonical_name))
    product_ready = bool(mapping and mapping.grocy_unit and _same_quantity_unit(mapping.grocy_unit, record.unit))
    product_id = mapping.grocy_product_id if product_ready and mapping else None
    if not product_ready:
        return False, product_id, None, None, PRODUCT_MAPPING_REQUIRED

    if record.operation != "transfer":
        storage_type = record.payload.get(
            "storage_type" if record.operation == "receipt_add" else "from_storage_type"
        )
        location_mapping = (
            store.grocy_location_mappings.get(storage_type)
            if isinstance(storage_type, str)
            else None
        )
        location_id = location_mapping.grocy_location_id if location_mapping else None
        if record.operation == "consume":
            return True, product_id, location_id, None, None
        if record.operation == "receipt_add":
            return True, product_id, None, location_id, None
        return True, product_id, None, None, None

    from_storage_type = record.payload.get("from_storage_type")
    to_storage_type = record.payload.get("to_storage_type")
    from_mapping = (
        store.grocy_location_mappings.get(from_storage_type)
        if isinstance(from_storage_type, str)
        else None
    )
    to_mapping = (
        store.grocy_location_mappings.get(to_storage_type)
        if isinstance(to_storage_type, str)
        else None
    )
    if from_mapping is None or to_mapping is None:
        return (
            False,
            product_id,
            from_mapping.grocy_location_id if from_mapping else None,
            to_mapping.grocy_location_id if to_mapping else None,
            LOCATION_MAPPING_REQUIRED,
        )
    return True, product_id, from_mapping.grocy_location_id, to_mapping.grocy_location_id, None


def _refresh_grocy_outbox_mapping(record: GrocyOutboxRecord) -> None:
    if record.status not in {"blocked", "pending"}:
        return
    ready, product_id, from_location_id, to_location_id, error = _resolve_grocy_outbox_mapping(record)
    record.grocy_product_id = product_id
    record.from_grocy_location_id = from_location_id
    record.to_grocy_location_id = to_location_id
    record.status = "pending" if ready else "blocked"
    record.last_error = None if ready else error
    record.updated_at = datetime.now(timezone.utc)


def _queue_grocy_receipt_sync(
    *,
    receipt_id: str,
    transaction_id: str,
    lot_id: str,
    canonical_name: str,
    quantity: float,
    unit: str,
    purchased_at: datetime | None,
) -> GrocySyncStatus:
    if grocy_client is None:
        return "not_configured"
    idempotency_key = f"receipt:{receipt_id}:lot:{lot_id}"
    existing = store.grocy_outbox.get(_outbox_id(idempotency_key))
    if existing is not None:
        _refresh_grocy_outbox_mapping(existing)
        return _grocy_sync_status_for_outbox(existing)
    now = datetime.now(timezone.utc)
    outbox = GrocyOutboxRecord(
        id=_outbox_id(idempotency_key),
        operation="receipt_add",
        aggregate_id=lot_id,
        idempotency_key=idempotency_key,
        canonical_name=canonical_name,
        grocy_product_id=None,
        quantity=quantity,
        unit=unit,
        payload={
            "receipt_id": receipt_id,
            "commit_transaction_id": transaction_id,
            "lot_id": lot_id,
            "purchased_at": purchased_at.isoformat() if purchased_at else None,
            "storage_type": store.foods[lot_id].response.storage_type if lot_id in store.foods else None,
        },
        status="blocked",
        last_error=PRODUCT_MAPPING_REQUIRED,
        created_at=now,
        updated_at=now,
    )
    store.grocy_outbox[outbox.id] = outbox
    _refresh_grocy_outbox_mapping(outbox)
    return _grocy_sync_status_for_outbox(outbox)


def _queue_grocy_storage_sync(
    *,
    event: StorageEventResponse,
    canonical_name: str,
    quantity: float,
    unit: str,
) -> GrocySyncStatus:
    if grocy_client is None:
        return "not_configured"
    if event.event_type == "moved" and event.from_storage_type == event.to_storage_type:
        return "succeeded"
    if event.event_type in {"consumed", "discarded"}:
        operation: GrocyOutboxOperation = "consume"
    elif event.event_type == "opened":
        operation = "open"
    else:
        operation = "transfer"
    idempotency_key = f"storage-event:{event.id}"
    existing = store.grocy_outbox.get(_outbox_id(idempotency_key))
    if existing is not None:
        _refresh_grocy_outbox_mapping(existing)
        return _grocy_sync_status_for_outbox(existing)
    now = datetime.now(timezone.utc)
    outbox = GrocyOutboxRecord(
        id=_outbox_id(idempotency_key),
        operation=operation,
        aggregate_id=event.food_id,
        idempotency_key=idempotency_key,
        canonical_name=canonical_name,
        grocy_product_id=None,
        quantity=quantity,
        unit=unit,
        spoiled=event.event_type == "discarded",
        payload={
            "storage_event_id": event.id,
            "food_id": event.food_id,
            "event_type": event.event_type,
            "from_storage_type": event.from_storage_type,
            "to_storage_type": event.to_storage_type,
            "created_child_food_id": event.created_child_food_id,
            "meal_plan_id": event.meal_plan_id,
        },
        status="blocked",
        last_error=PRODUCT_MAPPING_REQUIRED,
        created_at=now,
        updated_at=now,
    )
    store.grocy_outbox[outbox.id] = outbox
    _refresh_grocy_outbox_mapping(outbox)
    return _grocy_sync_status_for_outbox(outbox)


def _refresh_grocy_event_status(storage_event_id: str) -> None:
    event = next((item for item in store.storage_events if item.id == storage_event_id), None)
    if event is None:
        return
    related = [
        record
        for record in store.grocy_outbox.values()
        if record.payload.get("storage_event_id") == storage_event_id
    ]
    if related:
        event.grocy_sync_status = _aggregate_grocy_sync_status(
            [_grocy_sync_status_for_outbox(record) for record in related]
        )


def _refresh_grocy_projection(record: GrocyOutboxRecord) -> None:
    storage_event_id = record.payload.get("storage_event_id")
    if isinstance(storage_event_id, str):
        _refresh_grocy_event_status(storage_event_id)
    transaction_id = record.payload.get("commit_transaction_id")
    if isinstance(transaction_id, str):
        _refresh_grocy_transaction_status(transaction_id)


def _queue_grocy_receipt_syncs(
    *,
    receipt_id: str,
    transaction_id: str,
    items: list[tuple[str, str, float, str, datetime | None]],
) -> GrocySyncStatus:
    statuses = [
        _queue_grocy_receipt_sync(
            receipt_id=receipt_id,
            transaction_id=transaction_id,
            lot_id=lot_id,
            canonical_name=canonical_name,
            quantity=quantity,
            unit=unit,
            purchased_at=purchased_at,
        )
        for lot_id, canonical_name, quantity, unit, purchased_at in items
    ]
    return _aggregate_grocy_sync_status(statuses)


def _refresh_grocy_transaction_status(transaction_id: str) -> None:
    transaction = store.commit_transactions.get(transaction_id)
    if transaction is None:
        return
    related = [
        record
        for record in store.grocy_outbox.values()
        if record.payload.get("commit_transaction_id") == transaction_id
    ]
    if not related:
        return
    if any(record.status == "dead_letter" for record in related):
        transaction.grocy_sync_status = "dead_letter"
    elif any(record.status == "reconciliation_required" for record in related):
        transaction.grocy_sync_status = "needs_reconciliation"
    elif any(record.status == "blocked" for record in related):
        transaction.grocy_sync_status = "needs_mapping"
    elif any(record.status in {"pending", "in_flight"} for record in related):
        transaction.grocy_sync_status = "queued"
    elif all(record.status == "succeeded" for record in related):
        transaction.grocy_sync_status = "succeeded"


def _execute_grocy_outbox(record: GrocyOutboxRecord) -> object:
    if record.grocy_product_id is None:
        raise GrocyError(PRODUCT_MAPPING_REQUIRED)
    if record.operation == "receipt_add":
        return grocy_client.add_product(
            record.grocy_product_id,
            record.quantity,
            location_id=record.to_grocy_location_id,
            note=f"rescue-meal:{record.idempotency_key}",
        )
    if record.operation == "consume":
        return grocy_client.consume_product(
            record.grocy_product_id,
            record.quantity,
            spoiled=record.spoiled,
            location_id=record.from_grocy_location_id,
            exact_amount=True,
        )
    if record.operation == "open":
        return grocy_client.open_product(record.grocy_product_id, record.quantity)
    if record.operation == "transfer":
        if record.from_grocy_location_id is None or record.to_grocy_location_id is None:
            raise GrocyError(LOCATION_MAPPING_REQUIRED)
        return grocy_client.transfer_product(
            record.grocy_product_id,
            record.quantity,
            record.from_grocy_location_id,
            record.to_grocy_location_id,
        )
    raise GrocyError("지원하지 않는 Grocy outbox operation입니다.")


def _process_grocy_outbox_unleased(
    limit: int,
    *,
    worker_id: str,
    lease_key: str,
    lease_seconds: int,
) -> GrocyOutboxProcessResponse:
    if grocy_client is None:
        raise _typed_service_unavailable(
            "grocy_integration_not_configured",
            "Grocy integration이 비활성화되어 있습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_integration",
        )
    candidates = sorted(
        (record for record in store.grocy_outbox.values() if record.status == "pending"),
        key=lambda record: (record.created_at, record.id),
    )[:limit]
    succeeded = 0
    retried = 0
    dead_lettered = 0
    blocked = 0
    for record in candidates:
        if not store.renew_grocy_worker_lease(
            lease_key=lease_key,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Grocy outbox worker lease가 만료되었습니다.")
        now = datetime.now(timezone.utc)
        record.status = "in_flight"
        record.attempts += 1
        record.in_flight_started_at = now
        record.last_in_flight_started_at = now
        record.updated_at = now
        store.flush()
        try:
            ready, product_id, from_location_id, to_location_id, mapping_error = _resolve_grocy_outbox_mapping(record)
            record.grocy_product_id = product_id
            record.from_grocy_location_id = from_location_id
            record.to_grocy_location_id = to_location_id
            if not ready:
                record.status = "blocked"
                record.last_error = mapping_error or PRODUCT_MAPPING_REQUIRED
                record.in_flight_started_at = None
                blocked += 1
            else:
                response = _execute_grocy_outbox(record)
                transaction_id = _grocy_transaction_id(response)
                if transaction_id is None:
                    raise GrocyError("Grocy transaction readback이 없습니다.")
                record.status = "succeeded"
                record.grocy_transaction_id = transaction_id
                record.last_error = None
                record.in_flight_started_at = None
                succeeded += 1
        except GrocyError:
            if record.attempts >= 3:
                record.status = "dead_letter"
                dead_lettered += 1
            else:
                record.status = "pending"
                retried += 1
            record.last_error = "Grocy stock sync 실패; reconciliation 확인이 필요합니다."
            record.in_flight_started_at = None
            if record.status == "dead_letter":
                record.last_dead_letter_error = record.last_error
        record.updated_at = datetime.now(timezone.utc)
        _refresh_grocy_projection(record)
        store.flush()
    return GrocyOutboxProcessResponse(
        processed=len(candidates),
        succeeded=succeeded,
        retried=retried,
        dead_lettered=dead_lettered,
        blocked=blocked,
        records=candidates,
    )


def _process_grocy_outbox(
    limit: int,
    *,
    worker_id: str | None = None,
    lease_key: str = GROCY_OUTBOX_LEASE_KEY,
    lease_seconds: int | None = None,
    lease_held: bool = False,
) -> GrocyOutboxProcessResponse:
    owner = worker_id or f"api-grocy-process-{secrets.token_urlsafe(8)}"
    duration = lease_seconds or _grocy_worker_lease_seconds()
    acquired_here = False
    if not lease_held:
        if not store.acquire_grocy_worker_lease(
            lease_key=lease_key,
            worker_id=owner,
            lease_seconds=duration,
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="다른 Grocy worker가 이 workspace를 처리 중입니다.")
        acquired_here = True
    try:
        return _process_grocy_outbox_unleased(
            limit,
            worker_id=owner,
            lease_key=lease_key,
            lease_seconds=duration,
        )
    finally:
        if acquired_here:
            store.release_grocy_worker_lease(lease_key=lease_key, worker_id=owner)


def _scan_stale_grocy_outbox_unleased(
    *,
    stale_after_seconds: int,
    limit: int,
) -> GrocyOutboxReconcileScanResponse:
    now = datetime.now(timezone.utc)
    cutoff = now.timestamp() - stale_after_seconds
    candidates = sorted(
        (
            record
            for record in store.grocy_outbox.values()
            if record.status == "in_flight"
            and (
                record.in_flight_started_at
                or record.last_in_flight_started_at
                or record.updated_at
            ).timestamp() <= cutoff
        ),
        key=lambda record: (record.in_flight_started_at or record.last_in_flight_started_at or record.updated_at, record.id),
    )[:limit]
    for record in candidates:
        record.status = "reconciliation_required"
        record.last_error = RECONCILIATION_REQUIRED
        record.in_flight_started_at = None
        record.updated_at = now
        _refresh_grocy_projection(record)
    if candidates:
        store.flush()
    return GrocyOutboxReconcileScanResponse(
        scanned=len(candidates),
        marked=len(candidates),
        records=candidates,
    )


def _scan_stale_grocy_outbox(
    *,
    stale_after_seconds: int,
    limit: int,
    worker_id: str | None = None,
    lease_key: str = GROCY_OUTBOX_LEASE_KEY,
    lease_seconds: int | None = None,
    lease_held: bool = False,
) -> GrocyOutboxReconcileScanResponse:
    owner = worker_id or f"api-grocy-scan-{secrets.token_urlsafe(8)}"
    duration = lease_seconds or _grocy_worker_lease_seconds()
    acquired_here = False
    if not lease_held:
        if not store.acquire_grocy_worker_lease(
            lease_key=lease_key,
            worker_id=owner,
            lease_seconds=duration,
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="다른 Grocy worker가 이 workspace를 처리 중입니다.")
        acquired_here = True
    try:
        return _scan_stale_grocy_outbox_unleased(
            stale_after_seconds=stale_after_seconds,
            limit=limit,
        )
    finally:
        if acquired_here:
            store.release_grocy_worker_lease(lease_key=lease_key, worker_id=owner)


def _current_mapping_actor() -> tuple[str, str | None]:
    auth_context = current_auth_context()
    account = auth_repository.find_by_workspace(current_workspace_id())
    if account is not None and account.id == auth_context.subject_id:
        return account.id, account.email
    return auth_context.subject_id or "guest", None


@app.get("/api/integrations/grocy/mappings", response_model=list[GrocyProductMappingResponse])
def list_grocy_mappings(
    search: str | None = Query(default=None, min_length=1, max_length=160, alias="q"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[GrocyProductMappingResponse]:
    mappings = list(store.grocy_mappings.values())
    if search:
        normalized_search = _canonical_key(search)
        mappings = [mapping for mapping in mappings if normalized_search in _canonical_key(mapping.canonical_name)]
    return sorted(mappings, key=lambda mapping: mapping.canonical_name)[:limit]


@app.get("/api/integrations/grocy/mappings/{canonical_name}/events", response_model=list[GrocyProductMappingAuditEvent])
def list_grocy_mapping_audit_events(
    canonical_name: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[GrocyProductMappingAuditEvent]:
    normalized_name = " ".join(canonical_name.strip().split())
    if not normalized_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="canonical 상품명이 필요합니다.")
    normalized_key = _canonical_key(normalized_name)
    events = [
        event
        for event in store.list_grocy_mapping_audit_events()
        if _canonical_key(event.canonical_name) == normalized_key
    ]
    return events[:limit]


@app.put("/api/integrations/grocy/mappings/{canonical_name}", response_model=GrocyProductMappingResponse)
def upsert_grocy_mapping(canonical_name: str, request: GrocyProductMappingRequest) -> GrocyProductMappingResponse:
    normalized_name = " ".join(canonical_name.strip().split())
    if not normalized_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="canonical 상품명이 필요합니다.")
    actor_id, actor_email = _current_mapping_actor()
    previous_mapping = store.grocy_mappings.get(_canonical_key(normalized_name))
    mapping = GrocyProductMappingResponse(
        canonical_name=normalized_name,
        grocy_product_id=request.grocy_product_id,
        grocy_unit=request.grocy_unit,
        barcode=request.barcode,
        source=request.source,
        updated_by=actor_id,
        updated_by_email=actor_email,
        updated_at=datetime.now(timezone.utc),
    )
    def mutate() -> GrocyProductMappingResponse:
        store.grocy_mappings[_canonical_key(normalized_name)] = mapping
        for outbox in store.grocy_outbox.values():
            if _canonical_key(outbox.canonical_name) == _canonical_key(normalized_name) and outbox.status in {"blocked", "pending"}:
                _refresh_grocy_outbox_mapping(outbox)
                _refresh_grocy_projection(outbox)
        store.record_grocy_mapping_audit_event(
            GrocyProductMappingAuditEvent(
                id=create_id("grocy-mapping-audit"),
                canonical_name=normalized_name,
                action="created" if previous_mapping is None else "updated",
                actor_id=actor_id,
                actor_email=actor_email,
                occurred_at=mapping.updated_at,
                before=previous_mapping.model_copy(deep=True) if previous_mapping is not None else None,
                after=mapping.model_copy(deep=True),
            ),
            persist=False,
        )
        return mapping

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "grocy_mapping_persistence_unavailable",
                "detail": "Grocy 상품 매핑을 저장하지 못했습니다. 기존 매핑과 outbox 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/integrations/grocy/location-mappings", response_model=list[GrocyLocationMappingResponse])
def list_grocy_location_mappings() -> list[GrocyLocationMappingResponse]:
    return sorted(store.grocy_location_mappings.values(), key=lambda mapping: mapping.storage_type)


@app.put("/api/integrations/grocy/location-mappings/{storage_type}", response_model=GrocyLocationMappingResponse)
def upsert_grocy_location_mapping(storage_type: StorageCode, request: GrocyLocationMappingRequest) -> GrocyLocationMappingResponse:
    mapping = GrocyLocationMappingResponse(
        storage_type=storage_type,
        grocy_location_id=request.grocy_location_id,
        source=request.source,
        updated_at=datetime.now(timezone.utc),
    )
    def mutate() -> GrocyLocationMappingResponse:
        store.grocy_location_mappings[storage_type] = mapping
        for outbox in store.grocy_outbox.values():
            if outbox.status in {"blocked", "pending"}:
                _refresh_grocy_outbox_mapping(outbox)
                _refresh_grocy_projection(outbox)
        return mapping

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "grocy_location_mapping_persistence_unavailable",
                "detail": "Grocy 보관 위치 매핑을 저장하지 못했습니다. 기존 매핑과 outbox 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/integrations/grocy/outbox", response_model=list[GrocyOutboxRecord])
def list_grocy_outbox(
    outbox_status: GrocyOutboxStatus | None = Query(default=None, alias="status"),
) -> list[GrocyOutboxRecord]:
    records = list(store.grocy_outbox.values())
    if outbox_status is not None:
        records = [record for record in records if record.status == outbox_status]
    return sorted(records, key=lambda record: (record.created_at, record.id), reverse=True)


@app.post("/api/integrations/grocy/outbox/process", response_model=GrocyOutboxProcessResponse)
def process_grocy_outbox(request: Request, payload: GrocyOutboxProcessRequest) -> GrocyOutboxProcessResponse:
    if not request.headers.get("authorization", "").strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grocy sync에는 workspace 인증이 필요합니다.")
    return _process_grocy_outbox(payload.limit)


@app.post("/api/integrations/grocy/outbox/reconciliation-scan", response_model=GrocyOutboxReconcileScanResponse)
def scan_grocy_outbox_reconciliation(request: Request, payload: GrocyOutboxReconcileScanRequest) -> GrocyOutboxReconcileScanResponse:
    if not request.headers.get("authorization", "").strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grocy sync에는 workspace 인증이 필요합니다.")
    return _scan_stale_grocy_outbox(stale_after_seconds=payload.stale_after_seconds, limit=payload.limit)


@app.post("/api/integrations/grocy/outbox/{outbox_id}/reconcile", response_model=GrocyOutboxRecord)
def reconcile_grocy_outbox(outbox_id: str, request: Request, payload: GrocyOutboxReconcileRequest) -> GrocyOutboxRecord:
    if not request.headers.get("authorization", "").strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grocy sync에는 workspace 인증이 필요합니다.")
    record = store.grocy_outbox.get(outbox_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grocy outbox를 찾을 수 없습니다.")
    if record.status != "reconciliation_required":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="reconciliation_required 상태의 outbox만 판정할 수 있습니다.")
    transaction_id = payload.grocy_transaction_id.strip() if payload.grocy_transaction_id else ""
    if payload.decision == "already_applied" and not transaction_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="반영됨 판정에는 Grocy transaction ID가 필요합니다.")
    def mutate() -> GrocyOutboxRecord:
        now = datetime.now(timezone.utc)
        record.reconciliation_count += 1
        record.last_reconciliation_decision = payload.decision
        record.last_reconciliation_note = payload.operator_note.strip() if payload.operator_note and payload.operator_note.strip() else None
        record.last_reconciled_at = now
        record.in_flight_started_at = None
        if payload.decision == "already_applied":
            record.status = "succeeded"
            record.grocy_transaction_id = transaction_id
            record.last_error = None
        else:
            record.status = "pending"
            record.attempts = 0
            record.grocy_transaction_id = None
            record.last_error = None
        record.updated_at = now
        _refresh_grocy_projection(record)
        return record

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "grocy_outbox_persistence_unavailable",
                "detail": "Grocy 외부 반영 확인 결과를 저장하지 못했습니다. 기존 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/integrations/grocy/outbox/{outbox_id}/retry", response_model=GrocyOutboxRecord)
def retry_grocy_outbox(outbox_id: str, request: Request, payload: GrocyOutboxRetryRequest) -> GrocyOutboxRecord:
    if not request.headers.get("authorization", "").strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Grocy sync에는 workspace 인증이 필요합니다.")
    record = store.grocy_outbox.get(outbox_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grocy outbox를 찾을 수 없습니다.")
    if record.status != "dead_letter":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="dead_letter 상태의 outbox만 운영자 재시도할 수 있습니다.")
    if record.manual_retry_count >= 100:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="수동 재시도 횟수 상한에 도달한 outbox입니다.")
    def mutate() -> GrocyOutboxRecord:
        now = datetime.now(timezone.utc)
        record.last_dead_letter_error = record.last_error
        record.last_error = None
        record.attempts = 0
        record.manual_retry_count += 1
        record.last_retry_note = payload.operator_note.strip() if payload.operator_note and payload.operator_note.strip() else None
        record.last_retry_at = now
        record.status = "pending"
        record.updated_at = now
        _refresh_grocy_projection(record)
        return record

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "grocy_outbox_persistence_unavailable",
                "detail": "Grocy outbox 재시도 상태를 저장하지 못했습니다. 기존 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


def _require_recipe_review_token(request: Request) -> tuple[str, str | None]:
    auth_context = current_auth_context()
    account = auth_repository.find_by_workspace(current_workspace_id())
    if (
        auth_context.role == "recipe_admin"
        and account is not None
        and account.id == auth_context.subject_id
        and account.role == "recipe_admin"
    ):
        return account.id, account.email

    if account is not None and auth_context.subject_id == account.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="recipe_admin 권한이 필요합니다.")

    # Temporary local migration path. Production should leave this unset and
    # use a recipe_admin account token instead.
    expected = os.getenv("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", "").strip()
    if not expected:
        raise _typed_service_unavailable(
            "recipe_review_configuration_missing",
            "recipe review endpoint가 비활성화되어 있습니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        )
    if _production_environment():
        raise _legacy_recipe_review_token_error()
    provided = request.headers.get("x-rescue-meal-recipe-review-token", "")
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="recipe review 권한이 없습니다.")
    return "legacy-review-token", None


def _recipe_publisher_allowlist() -> set[str]:
    return {
        item.strip().lower()
        for item in os.getenv("RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS", "").split(",")
        if item.strip()
    }


def _recipe_can_publish(actor_email: str | None) -> bool:
    allowlist = _recipe_publisher_allowlist()
    return not allowlist or (actor_email is not None and actor_email.strip().lower() in allowlist)


def _require_recipe_publish_permission(actor_email: str | None) -> None:
    if _recipe_can_publish(actor_email):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "recipe_review_publish_forbidden",
            "detail": "현재 계정은 recipe 검토는 할 수 있지만 승인·반려 권한이 없습니다.",
            "retryable": False,
            "action": "contact_recipe_publisher",
        },
    )


def _recipe_review_claim_ttl_seconds() -> int:
    raw_value = os.getenv("RESCUE_MEAL_RECIPE_REVIEW_CLAIM_TTL_SECONDS", "3600").strip()
    try:
        value = int(raw_value)
    except ValueError:
        value = 3600
    return min(max(value, 300), 86_400)


def _recipe_claim_is_active(draft: RecipeDraftRecord, *, now: datetime) -> bool:
    return draft.claimed_by is not None and (
        draft.claim_expires_at is None or draft.claim_expires_at > now
    )


def _recipe_claim_error(draft: RecipeDraftRecord, *, code: str, detail: str) -> HTTPException:
    claim_detail: dict[str, object] = {
        "code": code,
        "detail": detail,
        "retryable": code != "recipe_review_claim_unavailable",
        "action": "claim" if code != "recipe_review_claim_unavailable" else "reload_and_retry",
    }
    if draft.claimed_by_email:
        claim_detail["owner_email"] = draft.claimed_by_email
    if draft.claimed_at is not None:
        claim_detail["claimed_at"] = draft.claimed_at.isoformat()
    if draft.claim_expires_at is not None:
        claim_detail["claim_expires_at"] = draft.claim_expires_at.isoformat()
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=claim_detail)


def _require_recipe_claim(draft: RecipeDraftRecord, actor_id: str, *, now: datetime) -> None:
    if draft.claimed_by is None:
        raise _recipe_claim_error(
            draft,
            code="recipe_review_claim_required",
            detail="이 draft를 수정하려면 먼저 명시적으로 review를 맡아야 합니다.",
        )
    if not _recipe_claim_is_active(draft, now=now):
        raise _recipe_claim_error(
            draft,
            code="recipe_review_claim_expired",
            detail="이 draft의 review claim이 만료되었습니다. 다시 맡은 뒤 수정해 주세요.",
        )
    if draft.claimed_by != actor_id:
        raise _recipe_claim_error(
            draft,
            code="recipe_review_claim_conflict",
            detail="다른 운영자가 이 draft를 검토 중입니다. 해당 운영자가 해제하거나 claim이 만료된 뒤 다시 시도해 주세요.",
        )


def _clear_recipe_claim(draft: RecipeDraftRecord) -> dict[str, object]:
    return {
        "claimed_by": None,
        "claimed_by_email": None,
        "claimed_at": None,
        "claim_expires_at": None,
    }


def _get_recipe_draft_or_404(draft_id: str) -> RecipeDraftRecord:
    draft = store.recipe_drafts.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recipe draft를 찾을 수 없습니다.")
    return draft


def _set_recipe_catalog_revision_header(response: Response) -> None:
    response.headers[RECIPE_CATALOG_REVISION_RESPONSE_HEADER] = str(store._recipe_catalog.revision)


def _record_recipe_review_audit(
    *,
    draft: RecipeDraftRecord,
    action: Literal["imported", "updated", "approved", "rejected", "claimed", "released"],
    actor_id: str,
    actor_email: str | None,
    before_status: Literal["pending", "approved", "rejected"] | None,
    changed_fields: list[str],
    persist: bool = True,
) -> None:
    store.record_recipe_review_event(
        RecipeReviewAuditEvent(
            id=create_id("recipe-review-event"),
            draft_id=draft.id,
            action=action,
            actor_id=actor_id,
            actor_email=actor_email,
            occurred_at=datetime.now(timezone.utc),
            before_status=before_status,
            after_status=draft.status,
            changed_fields=changed_fields,
            draft_snapshot_hash=draft_snapshot_hash(draft),
        ),
        persist=persist,
    )


def _review_changed_fields(request: RecipeDraftReviewRequest) -> list[str]:
    fields = [field for field in ("title", "safety_note", "estimated_minutes", "reviewer_note") if field in request.model_fields_set]
    if request.ingredients is not None:
        fields.append("ingredients")
    return fields


def _review_draft(draft: RecipeDraftRecord, request: RecipeDraftReviewRequest) -> RecipeDraftRecord:
    if draft.status == "approved":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="approved recipe는 다시 수정할 수 없습니다.")
    updates = request.ingredients
    ingredients = list(draft.ingredients)
    if updates is not None:
        seen_indexes: set[int] = set()
        for update in updates:
            if update.index >= len(ingredients):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"없는 재료 index: {update.index}")
            if update.index in seen_indexes:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"중복 재료 index: {update.index}")
            seen_indexes.add(update.index)
            changes = {
                field: getattr(update, field)
                for field in ("canonical_name", "canonical_amount", "canonical_unit", "review_status")
                if field in update.model_fields_set
            }
            ingredients[update.index] = ingredients[update.index].model_copy(update=changes)
    changes: dict[str, object] = {"ingredients": ingredients, "updated_at": datetime.now(timezone.utc)}
    for field in ("title", "safety_note", "estimated_minutes", "reviewer_note"):
        if field in request.model_fields_set:
            changes[field] = getattr(request, field)
    reviewed = draft.model_copy(update=changes)
    store.recipe_drafts[draft.id] = reviewed
    return reviewed


@app.post("/api/recipe-review/drafts/import", response_model=RecipeDraftImportResponse)
async def import_recipe_review_drafts(request: Request, response: Response, payload: RecipeDraftImportRequest) -> RecipeDraftImportResponse:
    """Fetch COOKRCP rows into the protected review queue, never into planner fixtures."""
    actor_id, actor_email = _require_recipe_review_token(request)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    config = CookRcpConfig.from_env()
    if config is None:
        raise _typed_service_unavailable(
            "recipe_import_configuration_missing",
            "recipe import를 사용할 수 없습니다. 서버 integration 설정을 확인해 주세요.",
            retryable=False,
            action="configure_integration",
        )
    client = CookRcpClient(config)
    try:
        result = await run_in_threadpool(
            partial(
                client.fetch,
                start_idx=payload.start_idx,
                end_idx=payload.end_idx,
                menu_name=payload.menu_name,
                ingredient_text=payload.ingredient_text,
                changed_after=payload.changed_after,
                category=payload.category,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except CookRcpImportError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    finally:
        client.close()

    def persist_import() -> tuple[list[str], list[RecipeDraftImportRejectedRowResponse], int]:
        draft_ids: list[str] = []
        conversion_rejected: list[RecipeDraftImportRejectedRowResponse] = []
        persisted_count = 0
        for source_index, source in enumerate(result.drafts):
            try:
                draft = draft_from_cookrcp(source)
            except ValueError:
                conversion_rejected.append(
                    RecipeDraftImportRejectedRowResponse(
                        row_index=source_index,
                        reason="recipe draft schema validation failed.",
                    )
                )
                continue
            is_new = draft.id not in store.recipe_drafts
            if is_new:
                persisted_count += 1
            stored = store.upsert_recipe_draft(draft)
            draft_ids.append(stored.id)
            if is_new:
                _record_recipe_review_audit(
                    draft=stored,
                    action="imported",
                    actor_id=actor_id,
                    actor_email=actor_email,
                    before_status=None,
                    changed_fields=["source", "ingredients", "steps"],
                    persist=False,
                )
        return draft_ids, conversion_rejected, persisted_count

    try:
        draft_ids, conversion_rejected, persisted_count = recipe_catalog_mutation.run(
            persist_import,
            expected_revision=expected_catalog_revision,
        )
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe review draft를 저장하지 못했습니다. 기존 검토 queue를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    _set_recipe_catalog_revision_header(response)
    return RecipeDraftImportResponse(
        total_count=result.total_count,
        accepted_count=len(result.drafts),
        persisted_count=persisted_count,
        rejected_count=len(result.rejected_rows) + len(conversion_rejected),
        draft_ids=draft_ids,
        rejected_rows=[
            RecipeDraftImportRejectedRowResponse(row_index=item.row_index, reason=item.reason)
            for item in result.rejected_rows
        ] + conversion_rejected,
        source_name=result.source_name,
        source_url=result.source_url,
        source_revision=result.source_revision,
        retrieved_at=result.retrieved_at,
    )


@app.get("/api/recipe-review/drafts", response_model=list[RecipeDraftRecord])
def list_recipe_review_drafts(
    request: Request,
    response: Response,
    draft_status: Literal["pending", "approved", "rejected"] | None = Query(default=None, alias="status"),
    assignment: Literal["all", "mine", "unassigned"] = Query(default="all"),
) -> list[RecipeDraftRecord]:
    actor_id, _actor_email = _require_recipe_review_token(request)
    drafts = list(store.recipe_drafts.values())
    if draft_status is not None:
        drafts = [draft for draft in drafts if draft.status == draft_status]
    if assignment != "all":
        now = datetime.now(timezone.utc)
        if assignment == "mine":
            drafts = [
                draft
                for draft in drafts
                if _recipe_claim_is_active(draft, now=now) and draft.claimed_by == actor_id
            ]
        else:
            drafts = [draft for draft in drafts if not _recipe_claim_is_active(draft, now=now)]
    _set_recipe_catalog_revision_header(response)
    return sorted(drafts, key=lambda draft: (draft.updated_at, draft.id), reverse=True)


@app.get("/api/recipe-review/capabilities", response_model=RecipeReviewCapabilitiesResponse)
def recipe_review_capabilities(request: Request) -> RecipeReviewCapabilitiesResponse:
    actor_id, actor_email = _require_recipe_review_token(request)
    return RecipeReviewCapabilitiesResponse(
        can_review=True,
        can_publish=_recipe_can_publish(actor_email),
        publisher_policy="publisher_allowlist" if _recipe_publisher_allowlist() else "all_recipe_admins",
        ownership_enabled=True,
        actor_type="legacy_token" if actor_id == "legacy-review-token" else "account",
    )


@app.get("/api/recipe-review/revision", response_model=RecipeReviewRevisionResponse)
def recipe_review_revision(request: Request, response: Response) -> RecipeReviewRevisionResponse:
    _require_recipe_review_token(request)
    # A process-local catalog snapshot may lag behind another API process. A
    # revision read is the cheap cross-device probe, so refresh the shared
    # catalog before reporting it. The catalog lock also serializes this with
    # local draft mutations.
    with store._recipe_catalog._lock:
        store._recipe_catalog.refresh()
        revision = store._recipe_catalog.revision
    _set_recipe_catalog_revision_header(response)
    return RecipeReviewRevisionResponse(revision=revision)


@app.post("/api/recipe-review/drafts/{draft_id}/claim", response_model=RecipeDraftRecord)
def claim_recipe_review_draft(draft_id: str, request: Request, response: Response) -> RecipeDraftRecord:
    actor_id, actor_email = _require_recipe_review_token(request)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    now = datetime.now(timezone.utc)

    def mutate() -> RecipeDraftRecord:
        draft = _get_recipe_draft_or_404(draft_id)
        if draft.status != "pending":
            raise _recipe_claim_error(
                draft,
                code="recipe_review_claim_unavailable",
                detail="pending 상태의 draft만 review를 맡을 수 있습니다.",
            )
        if _recipe_claim_is_active(draft, now=now):
            if draft.claimed_by == actor_id:
                return draft
            raise _recipe_claim_error(
                draft,
                code="recipe_review_claim_conflict",
                detail="다른 운영자가 이 draft를 검토 중입니다. 해당 운영자가 해제하거나 claim이 만료된 뒤 다시 시도해 주세요.",
            )
        claimed = draft.model_copy(
            update={
                "claimed_by": actor_id,
                "claimed_by_email": actor_email,
                "claimed_at": now,
                "claim_expires_at": now + timedelta(seconds=_recipe_review_claim_ttl_seconds()),
                "updated_at": now,
            }
        )
        store.recipe_drafts[draft.id] = claimed
        changed_fields = ["claimed_by", "claimed_at", "claim_expires_at"]
        if draft.claimed_by is not None:
            changed_fields.append("expired_claim_reclaimed")
        _record_recipe_review_audit(
            draft=claimed,
            action="claimed",
            actor_id=actor_id,
            actor_email=actor_email,
            before_status=draft.status,
            changed_fields=changed_fields,
            persist=False,
        )
        return claimed

    try:
        claimed = recipe_catalog_mutation.run(mutate, expected_revision=expected_catalog_revision)
    except HTTPException:
        raise
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe review claim을 저장하지 못했습니다. 기존 draft 담당 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    _set_recipe_catalog_revision_header(response)
    return claimed


@app.post("/api/recipe-review/drafts/{draft_id}/release", response_model=RecipeDraftRecord)
def release_recipe_review_draft(draft_id: str, request: Request, response: Response) -> RecipeDraftRecord:
    actor_id, actor_email = _require_recipe_review_token(request)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    now = datetime.now(timezone.utc)

    def mutate() -> RecipeDraftRecord:
        draft = _get_recipe_draft_or_404(draft_id)
        if draft.status != "pending":
            raise _recipe_claim_error(
                draft,
                code="recipe_review_claim_unavailable",
                detail="pending 상태의 draft만 review claim을 해제할 수 있습니다.",
            )
        if draft.claimed_by is None:
            return draft
        if draft.claimed_by != actor_id:
            raise _recipe_claim_error(
                draft,
                code="recipe_review_claim_conflict",
                detail="다른 운영자의 review claim은 대신 해제할 수 없습니다.",
            )
        released = draft.model_copy(update={**_clear_recipe_claim(draft), "updated_at": now})
        store.recipe_drafts[draft.id] = released
        _record_recipe_review_audit(
            draft=released,
            action="released",
            actor_id=actor_id,
            actor_email=actor_email,
            before_status=draft.status,
            changed_fields=["claimed_by", "claimed_at", "claim_expires_at"],
            persist=False,
        )
        return released

    try:
        released = recipe_catalog_mutation.run(mutate, expected_revision=expected_catalog_revision)
    except HTTPException:
        raise
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe review claim을 해제하지 못했습니다. 기존 draft 담당 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    _set_recipe_catalog_revision_header(response)
    return released


@app.patch("/api/recipe-review/drafts/{draft_id}", response_model=RecipeDraftRecord)
def review_recipe_draft(draft_id: str, request: Request, response: Response, payload: RecipeDraftReviewRequest) -> RecipeDraftRecord:
    actor_id, actor_email = _require_recipe_review_token(request)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    draft = _get_recipe_draft_or_404(draft_id)
    _require_recipe_claim(draft, actor_id, now=datetime.now(timezone.utc))
    def mutate() -> RecipeDraftRecord:
        reviewed = _review_draft(draft, payload)
        _record_recipe_review_audit(
            draft=reviewed,
            action="updated",
            actor_id=actor_id,
            actor_email=actor_email,
            before_status=draft.status,
            changed_fields=_review_changed_fields(payload),
            persist=False,
        )
        return reviewed

    try:
        reviewed = recipe_catalog_mutation.run(mutate, expected_revision=expected_catalog_revision)
        _set_recipe_catalog_revision_header(response)
        return reviewed
    except HTTPException:
        raise
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe 검토 내용을 저장하지 못했습니다. 기존 draft를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/recipe-review/drafts/{draft_id}/approve", response_model=RecipeDraftRecord)
def approve_recipe_draft(draft_id: str, request: Request, response: Response, payload: RecipeDraftApproveRequest) -> RecipeDraftRecord:
    actor_id, actor_email = _require_recipe_review_token(request)
    _require_recipe_publish_permission(actor_email)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    draft = _get_recipe_draft_or_404(draft_id)
    if draft.status == "approved":
        _set_recipe_catalog_revision_header(response)
        return draft
    if draft.status == "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="rejected recipe draft는 먼저 새 source revision으로 가져와야 합니다.")
    _require_recipe_claim(draft, actor_id, now=datetime.now(timezone.utc))
    issues = approval_issues(draft, license_confirmed=payload.license_confirmed)
    if issues:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "recipe draft 검토가 완료되지 않았습니다.", "issues": issues})
    now = datetime.now(timezone.utc)
    approved = draft.model_copy(update={"status": "approved", "approved_at": now, "updated_at": now, **_clear_recipe_claim(draft)})
    def mutate() -> RecipeDraftRecord:
        store.recipe_drafts[draft.id] = approved
        _record_recipe_review_audit(
            draft=approved,
            action="approved",
            actor_id=actor_id,
            actor_email=actor_email,
            before_status=draft.status,
            changed_fields=["status", "approved_at"],
            persist=False,
        )
        return approved

    try:
        approved_result = recipe_catalog_mutation.run(mutate, expected_revision=expected_catalog_revision)
        _set_recipe_catalog_revision_header(response)
        return approved_result
    except HTTPException:
        raise
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe 승인을 저장하지 못했습니다. 기존 pending draft를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/recipe-review/drafts/{draft_id}/reject", response_model=RecipeDraftRecord)
def reject_recipe_draft(draft_id: str, request: Request, response: Response, payload: RecipeDraftRejectRequest) -> RecipeDraftRecord:
    actor_id, actor_email = _require_recipe_review_token(request)
    _require_recipe_publish_permission(actor_email)
    expected_catalog_revision = _expected_recipe_catalog_revision(request)
    draft = _get_recipe_draft_or_404(draft_id)
    if draft.status == "approved":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="approved recipe는 reject할 수 없습니다.")
    _require_recipe_claim(draft, actor_id, now=datetime.now(timezone.utc))
    now = datetime.now(timezone.utc)
    rejected = draft.model_copy(update={"status": "rejected", "reviewer_note": payload.reviewer_note, "updated_at": now, **_clear_recipe_claim(draft)})
    def mutate() -> RecipeDraftRecord:
        store.recipe_drafts[draft.id] = rejected
        _record_recipe_review_audit(
            draft=rejected,
            action="rejected",
            actor_id=actor_id,
            actor_email=actor_email,
            before_status=draft.status,
            changed_fields=["status", "reviewer_note"],
            persist=False,
        )
        return rejected

    try:
        rejected_result = recipe_catalog_mutation.run(mutate, expected_revision=expected_catalog_revision)
        _set_recipe_catalog_revision_header(response)
        return rejected_result
    except HTTPException:
        raise
    except RecipeCatalogConcurrentWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "recipe_review_persistence_unavailable",
                "detail": "recipe 반려를 저장하지 못했습니다. 기존 pending draft를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/recipe-review/drafts/{draft_id}/events", response_model=list[RecipeReviewAuditEvent])
def list_recipe_review_events(draft_id: str, request: Request, response: Response) -> list[RecipeReviewAuditEvent]:
    _require_recipe_review_token(request)
    _get_recipe_draft_or_404(draft_id)
    _set_recipe_catalog_revision_header(response)
    return [event for event in store.recipe_review_events if event.draft_id == draft_id]


@app.post("/api/auth/guest", response_model=GuestSessionResponse)
def create_guest_session(http_request: Request) -> GuestSessionResponse:
    _enforce_auth_rate_limit(http_request, "guest")
    workspace_id = create_guest_workspace_id()
    _ensure_auth_secret()
    try:
        with store.workspace_session(workspace_id):
            store.provision_workspace(workspace_id)
    except RuntimeError as exc:
        raise _typed_service_unavailable(
            "workspace_provisioning_unavailable",
            "workspace 저장소를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            retryable=True,
            action="retry_later",
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
        raise _typed_service_unavailable(
            "auth_configuration_missing",
            "인증 secret 설정이 필요합니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        ) from exc


def _production_environment() -> bool:
    return os.getenv("RESCUE_MEAL_ENVIRONMENT", "").strip().lower() == "production"


def _legacy_recipe_review_token_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "recipe_review_legacy_token_disabled",
            "detail": "production recipe review는 공유 legacy token을 사용할 수 없습니다. 개별 recipe_admin account로 다시 인증해 주세요.",
            "retryable": False,
            "action": "use_recipe_admin_account",
        },
    )


def _build_auth_rate_limiter():
    connection = getattr(auth_repository, "rate_limit_connection", None)
    dialect = getattr(auth_repository, "rate_limit_dialect", None)
    if connection is not None and dialect is not None:
        return PersistentSlidingWindowRateLimiter(
            connection,
            dialect=dialect,
            lock=getattr(auth_repository, "rate_limit_lock", None),
        )
    return SlidingWindowRateLimiter()


auth_rate_limiter = _build_auth_rate_limiter()


def _auth_rate_limit_enabled() -> bool:
    configured = os.getenv("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "").strip().lower()
    if configured:
        return configured in {"1", "true", "yes", "on"}
    return auth_required()


def _positive_env_number(name: str, default: float, *, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        return default
    return max(1.0, min(value, maximum))


def _enforce_auth_rate_limit(http_request: Request, scope: str, identity: str | None = None) -> None:
    if not _auth_rate_limit_enabled():
        return
    limit = int(_positive_env_number("RESCUE_MEAL_AUTH_RATE_LIMIT_MAX_REQUESTS", 20, maximum=120))
    window_seconds = _positive_env_number("RESCUE_MEAL_AUTH_RATE_LIMIT_WINDOW_SECONDS", 60, maximum=3600)
    client_host = http_request.client.host if http_request.client else "unknown"
    keys = [f"ip:{scope}:{opaque_rate_limit_key(client_host)}"]
    if identity:
        keys.append(f"identity:{scope}:{opaque_rate_limit_key(identity)}")
    decision = auth_rate_limiter.check(keys, limit=limit, window_seconds=window_seconds)
    if decision.allowed:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        headers={
            "Retry-After": str(decision.retry_after_seconds),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
        },
    )


def _export_rate_limit_enabled() -> bool:
    configured = os.getenv("RESCUE_MEAL_EXPORT_RATE_LIMIT_ENABLED", "").strip().lower()
    if configured:
        return configured in {"1", "true", "yes", "on"}
    return True


def _enforce_export_rate_limit(http_request: Request) -> None:
    if not _export_rate_limit_enabled():
        return
    limit = int(_positive_env_number("RESCUE_MEAL_EXPORT_RATE_LIMIT_MAX_REQUESTS", 6, maximum=60))
    window_seconds = _positive_env_number("RESCUE_MEAL_EXPORT_RATE_LIMIT_WINDOW_SECONDS", 3600, maximum=86400)
    client_host = http_request.client.host if http_request.client else "unknown"
    keys = [
        f"ip:export:{opaque_rate_limit_key(client_host)}",
        f"workspace:export:{opaque_rate_limit_key(current_workspace_id())}",
    ]
    decision = auth_rate_limiter.check(keys, limit=limit, window_seconds=window_seconds)
    if decision.allowed:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "account_export_rate_limited",
            "detail": "데이터 내보내기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            "retryable": True,
            "action": "retry_later",
        },
        headers={
            "Retry-After": str(decision.retry_after_seconds),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
        },
    )


def _enforce_client_error_rate_limit(http_request: Request) -> None:
    if not _auth_rate_limit_enabled():
        return
    limit = int(_positive_env_number("RESCUE_MEAL_CLIENT_ERROR_RATE_LIMIT_MAX_REQUESTS", 30, maximum=300))
    window_seconds = _positive_env_number("RESCUE_MEAL_CLIENT_ERROR_RATE_LIMIT_WINDOW_SECONDS", 60, maximum=3600)
    client_host = http_request.client.host if http_request.client else "unknown"
    key = f"ip:client-error:{opaque_rate_limit_key(client_host)}"
    decision = auth_rate_limiter.check([key], limit=limit, window_seconds=window_seconds)
    if decision.allowed:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="오류 보고 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        headers={
            "Retry-After": str(decision.retry_after_seconds),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
        },
    )


def _account_session(account: AccountRecord) -> AccountSessionResponse:
    try:
        access_token, expires_at = issue_account_token(account)
    except RuntimeError as exc:
        raise _typed_service_unavailable(
            "auth_configuration_missing",
            "인증 secret 설정이 필요합니다. 서버 설정을 확인해 주세요.",
            retryable=False,
            action="configure_server",
        ) from exc
    return AccountSessionResponse(
        user_id=account.id,
        email=account.email,
        workspace_id=account.workspace_id,
        role=account.role,
        access_token=access_token,
        expires_at=expires_at,
    )


def _password_reset_delivery_settings() -> PasswordResetDeliverySettings | None:
    return PasswordResetDeliverySettings.from_env()


def _submit_password_reset_email(account: AccountRecord, token: str, expires_at: datetime) -> bool:
    settings = _password_reset_delivery_settings()
    if settings is None:
        return False
    # Pass the module-local client explicitly so existing API tests can
    # replace ``main.httpx.post`` without touching the production adapter.
    return submit_password_reset_email(
        recipient=account.email,
        token=token,
        expires_at=expires_at,
        settings=settings,
        post=httpx.post,
    )


@app.post("/api/client-errors", response_model=ClientErrorReportResponse, status_code=status.HTTP_202_ACCEPTED)
def report_client_error(http_request: Request, request: ClientErrorReportRequest) -> ClientErrorReportResponse:
    _enforce_client_error_rate_limit(http_request)
    logged = log_client_error(
        request_id=get_request_id(),
        surface=request.surface,
        error_kind=request.error_kind,
        release=request.release,
    )
    return ClientErrorReportResponse(
        status="accepted" if logged else "disabled",
        request_id=get_request_id(),
    )


@app.post("/api/auth/register", response_model=AccountSessionResponse, status_code=status.HTTP_201_CREATED)
def register_account(http_request: Request, request: AccountCredentialsRequest) -> AccountSessionResponse:
    _enforce_auth_rate_limit(http_request, "register", request.email)
    _ensure_account_auth_supported()
    try:
        normalized_email = normalize_email(request.email)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이메일 형식을 확인해 주세요.") from exc
    if auth_repository.find_by_email(normalized_email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")
    workspace_id = create_account_workspace_id()
    try:
        with store.workspace_session(workspace_id, seed=False):
            store.provision_workspace(workspace_id, seed=False)
            account = auth_repository.register(normalized_email, request.password, workspace_id)
    except DuplicateAccount as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.") from exc
    return _account_session(account)


@app.post("/api/auth/login", response_model=AccountSessionResponse)
def login_account(http_request: Request, request: AccountCredentialsRequest) -> AccountSessionResponse:
    _enforce_auth_rate_limit(http_request, "login", request.email)
    _ensure_account_auth_supported()
    try:
        account = auth_repository.authenticate(request.email, request.password)
    except ValueError:
        account = None
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호를 확인해 주세요.")
    return _account_session(account)


@app.post("/api/auth/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(http_request: Request, request: PasswordResetRequest) -> PasswordResetRequestResponse:
    _enforce_auth_rate_limit(http_request, "password-reset-request", request.email)
    _ensure_auth_secret()
    try:
        normalized_email = normalize_email(request.email)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이메일 형식을 확인해 주세요.") from exc
    account = auth_repository.find_by_email(normalized_email)
    delivery_settings = _password_reset_delivery_settings()
    if account is not None and delivery_settings is not None:
        issued_at = datetime.now(timezone.utc)
        token = auth_repository.create_password_reset_token(account.id, now=issued_at)
        if token is not None:
            _submit_password_reset_email(account, token, issued_at + PASSWORD_RESET_TTL)
    return PasswordResetRequestResponse(
        message="입력한 이메일이 등록되어 있고 발송 채널이 설정되어 있다면 비밀번호 재설정 안내를 보내요. 메일이 오지 않으면 주소와 스팸함을 확인해 주세요."
    )


@app.post("/api/auth/password-reset/complete", response_model=AccountSessionResponse)
def complete_password_reset(http_request: Request, request: PasswordResetCompleteRequest) -> AccountSessionResponse:
    _enforce_auth_rate_limit(http_request, "password-reset-complete")
    _ensure_auth_secret()
    account = auth_repository.consume_password_reset_token(request.token, request.new_password)
    if account is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.")
    return _account_session(account)


@app.post("/api/auth/password/change", response_model=AccountSessionResponse)
def change_account_password(http_request: Request, request: PasswordChangeRequest) -> AccountSessionResponse:
    auth_context = current_auth_context()
    if auth_context.role == "guest" or not auth_context.subject_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="로그인한 account에서만 비밀번호를 변경할 수 있습니다.")
    _enforce_auth_rate_limit(http_request, "password-change", auth_context.subject_id)
    if request.current_password == request.new_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="새 비밀번호는 현재 비밀번호와 달라야 합니다.")
    try:
        account = auth_repository.change_password(auth_context.subject_id, request.current_password, request.new_password)
    except ValueError:
        account = None
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="현재 비밀번호를 확인해 주세요.")
    return _account_session(account)


@app.post("/api/account/delete", response_model=AccountDeletionResponse)
def delete_account(http_request: Request, request: AccountDeletionRequest) -> AccountDeletionResponse:
    auth_context = current_auth_context()
    if auth_context.role == "guest" or not auth_context.subject_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="로그인한 account에서만 계정을 삭제할 수 있습니다.")
    _enforce_auth_rate_limit(http_request, "account-delete", auth_context.subject_id)
    if not auth_repository.verify_account_password(auth_context.subject_id, request.current_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="현재 비밀번호를 확인해 주세요.")
    try:
        account_deletion_coordinator.run(auth_context)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "account_deletion_persistence_unavailable",
                "detail": "계정 삭제를 완료하지 못했습니다. 삭제 상태를 유지했어요. 같은 화면에서 다시 시도해 주세요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    return AccountDeletionResponse(message="계정과 해당 workspace의 기록을 삭제했습니다.")


@app.get("/api/auth/me", response_model=AuthMeResponse)
def get_auth_me(request: Request) -> AuthMeResponse:
    if not request.headers.get("authorization"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    workspace_id = current_workspace_id()
    account = auth_repository.find_by_workspace(workspace_id)
    if account is None:
        return AuthMeResponse(mode="guest", workspace_id=workspace_id, role=current_auth_context().role)
    return AuthMeResponse(mode="account", user_id=account.id, email=account.email, workspace_id=workspace_id, role=account.role, account_status=account.status)


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
    return infer_priority_for_api(request)


@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard() -> DashboardResponse:
    return store.dashboard()


@app.get("/api/dashboard/revision", response_model=WorkspaceRevisionResponse)
def dashboard_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.get("/api/storage-locations", response_model=list[StorageLocationResponse])
def list_storage_locations() -> list[StorageLocationResponse]:
    return store.list_storage_locations()


@app.get("/api/storage-locations/revision", response_model=WorkspaceRevisionResponse)
def storage_location_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.post("/api/storage-locations", response_model=StorageLocationResponse, status_code=status.HTTP_201_CREATED)
def create_storage_location(request: StorageLocationCreateRequest) -> StorageLocationResponse:
    try:
        return workspace_mutation.run(lambda: store.create_storage_location(request, persist=False))
    except StorageLocationDuplicateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "storage_location_duplicate", "detail": "같은 이름의 사용자 정의 보관 위치가 이미 있어요."},
        ) from exc
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "storage_location_persistence_unavailable",
                "detail": "사용자 정의 보관 위치를 저장하지 못했어요. 기존 위치를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.patch("/api/storage-locations/{location_id}", response_model=StorageLocationResponse)
def update_storage_location(location_id: str, request: StorageLocationUpdateRequest) -> StorageLocationResponse:
    try:
        return workspace_mutation.run(
            lambda: store.update_storage_location(location_id, request, persist=False)
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자 정의 보관 위치를 찾을 수 없습니다.") from exc
    except StorageLocationDuplicateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "storage_location_duplicate", "detail": "같은 이름의 사용자 정의 보관 위치가 이미 있어요."},
        ) from exc
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "storage_location_persistence_unavailable",
                "detail": "사용자 정의 보관 위치를 수정하지 못했어요. 기존 위치를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.delete("/api/storage-locations/{location_id}", response_model=dict[str, bool])
def delete_storage_location(location_id: str) -> dict[str, bool]:
    try:
        deleted = workspace_mutation.run(
            lambda: store.delete_storage_location(location_id, persist=False)
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자 정의 보관 위치를 찾을 수 없습니다.") from exc
    except StorageLocationInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "storage_location_in_use",
                "detail": "현재 식품 또는 과거 보관·입고 기록이 이 위치를 참조해 삭제할 수 없습니다. 이름을 바꾸거나 다른 위치를 사용해 주세요.",
            },
        ) from exc
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "storage_location_persistence_unavailable",
                "detail": "사용자 정의 보관 위치를 삭제하지 못했어요. 기존 위치를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    return {"deleted": bool(deleted)}


@app.get("/api/inventory/search", response_model=InventorySearchResponse)
def search_inventory(
    query: str = Query(default="", alias="q", max_length=160),
    storage_type: StorageCode | None = Query(default=None),
    storage_location_id: str | None = Query(default=None, min_length=1, max_length=96),
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=40, ge=1, le=100),
) -> InventorySearchResponse:
    return store.search_inventory(query, storage_type=storage_type, storage_location_id=storage_location_id, offset=offset, limit=limit)


@app.get("/api/foods/{food_id}/product-provenance/events", response_model=list[ProductProvenanceAuditEvent])
def get_product_provenance_events(
    food_id: str,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[ProductProvenanceAuditEvent]:
    events = store.list_product_provenance_audit_events(food_id, limit=limit)
    if not events and food_id not in store.foods:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품 provenance 기록을 찾을 수 없습니다.")
    return events


@app.delete("/api/foods/{food_id}/product-provenance", response_model=FoodResponse)
def clear_product_provenance(food_id: str) -> FoodResponse:
    food = store.foods.get(food_id)
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    before = food.response.product_provenance
    if before is None:
        return food.response
    def mutate() -> FoodResponse:
        food.response.product_provenance = None
        store.record_product_provenance_audit(
            food_id=food_id,
            before=before,
            after=None,
            reason="사용자가 상품 출처를 다시 확인하기 위해 제거했습니다.",
        )
        return food.response

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "product_provenance_persistence_unavailable",
                "detail": "상품 출처를 저장하지 못했습니다. 기존 정보를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/foods/{food_id}/product-info/events", response_model=list[FoodProductInfoAuditEvent])
def get_product_info_events(
    food_id: str,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[FoodProductInfoAuditEvent]:
    events = store.list_product_info_audit_events(food_id, limit=limit)
    if not events and food_id not in store.foods:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품 정보 변경 기록을 찾을 수 없습니다.")
    return events


@app.patch("/api/foods/{food_id}/product-info", response_model=FoodResponse)
def update_product_info(food_id: str, request: ProductInfoUpdateRequest) -> FoodResponse:
    with store.mutation_lock():
        food = store.foods.get(food_id)
        if food is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")

        before = _food_product_info_snapshot(food.response)
        next_name = request.canonical_name
        next_brand = request.brand
        next_category = request.category
        if (
            before.canonical_name == next_name
            and before.brand == next_brand
            and before.category == next_category
        ):
            return food.response

        def mutate() -> FoodResponse:
            food.response.canonical_name = next_name
            food.response.display_name = next_name
            food.response.brand = next_brand
            food.response.category = next_category
            if food.response.product_provenance is not None:
                previous_provenance = food.response.product_provenance
                food.response.product_provenance = None
                store.record_product_provenance_audit(
                    food_id=food_id,
                    before=previous_provenance,
                    after=None,
                    reason="상품 정보를 직접 수정해 기존 상품 출처를 제거했습니다.",
                )
            _refresh_estimated_window(food.response)
            after = _food_product_info_snapshot(food.response)
            store.record_product_info_audit(
                food_id=food_id,
                before=before,
                after=after,
                reason="사용자가 상품명·브랜드·카테고리를 수정했습니다.",
            )
            store.reprioritize(persist=False)
            return food.response

        try:
            return workspace_mutation.run(mutate)
        except ConcurrentWorkspaceWriteError:
            # The repository has already reloaded the newest workspace snapshot.
            raise
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "product_info_persistence_unavailable",
                    "detail": "상품 정보를 저장하지 못했습니다. 기존 정보를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.get("/api/account/export", response_model=WorkspaceExportResponse)
def export_workspace_data(http_request: Request) -> WorkspaceExportResponse:
    _enforce_export_rate_limit(http_request)
    export = store.export_workspace_data(current_workspace_id())
    auth_context = current_auth_context()
    try:
        store.record_export_audit_event(
            WorkspaceExportAuditEvent(
                id=f"export-audit-{secrets.token_hex(16)}",
                actor_id=auth_context.subject_id or "guest",
                actor_role=auth_context.role,
                request_id=get_request_id(),
                schema_version=export.schema_version,
                exported_at=export.exported_at,
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "account_export_audit_persistence_unavailable",
                "detail": "데이터 내보내기 감사 기록을 저장하지 못했습니다. 파일을 만들지 않고 기존 workspace를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
            headers={"Retry-After": "1"},
        ) from exc
    return export


_GUEST_TRANSFER_FIELDS = (
    "foods",
    "receipts",
    "committed_fingerprints",
    "storage_events",
    "commit_transactions",
    "meal_plans",
    "multi_day_meal_plans",
    "shopping_list",
    "shopping_receive_operations",
    "manual_food_operations",
    "meal_plan_events",
    "grocy_mappings",
    "grocy_mapping_audit_events",
    "product_provenance_audit_events",
    "product_info_audit_events",
    "product_aliases",
    "product_enrichment_jobs",
    "notification_read_at",
    "push_subscriptions",
    "notification_deliveries",
    "grocy_location_mappings",
    "grocy_outbox",
    "storage_locations",
)


def _guest_transfer_stores(guest_access_token: str) -> tuple[str, InMemoryStore, InMemoryStore]:
    if current_auth_context().role == "guest":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="account workspace에서만 게스트 기록을 가져올 수 있습니다.")
    try:
        source_workspace_id = verify_guest_token(guest_access_token)
    except (InvalidGuestToken, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효한 guest workspace token이 필요합니다.") from exc
    if not source_workspace_id.startswith("guest-"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="guest workspace token만 가져오기에 사용할 수 있습니다.")
    target_workspace_id = current_workspace_id()
    if source_workspace_id == target_workspace_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="현재 workspace를 자기 자신에게 가져올 수 없습니다.")
    return source_workspace_id, store._workspace_store(source_workspace_id, seed=False), store._workspace_store(target_workspace_id, seed=False)


def _guest_transfer_counts(workspace_store: InMemoryStore) -> tuple[int, int, int, int, int, int, int, int, int]:
    return (
        len(workspace_store.foods),
        len(workspace_store.receipts),
        len(workspace_store.storage_events),
        len(workspace_store.meal_plans),
        len(workspace_store.multi_day_meal_plans),
        len(workspace_store.shopping_list),
        len(workspace_store.push_subscriptions),
        len(workspace_store.shopping_receive_operations),
        len(workspace_store.storage_locations),
    )


def _guest_transfer_has_user_records(workspace_store: InMemoryStore) -> bool:
    return any(bool(getattr(workspace_store, field)) for field in _GUEST_TRANSFER_FIELDS) or workspace_store.notification_preferences != NotificationPreferences() or workspace_store.meal_preferences != MealPreferences()


def _guest_transfer_serializable(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _guest_transfer_serializable(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, (list, tuple)):
        return [_guest_transfer_serializable(item) for item in value]
    if isinstance(value, set):
        serialized = [_guest_transfer_serializable(item) for item in value]
        return sorted(serialized, key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    if hasattr(value, "__dict__"):
        return {
            key: _guest_transfer_serializable(item)
            for key, item in sorted(vars(value).items())
            if key != "_lock"
        }
    raise TypeError(f"unsupported transfer value: {type(value).__name__}")


def _guest_transfer_fingerprint(workspace_store: InMemoryStore) -> str:
    payload = {
        field: _guest_transfer_serializable(getattr(workspace_store, field))
        for field in _GUEST_TRANSFER_FIELDS
    }
    payload["meal_preferences"] = _guest_transfer_serializable(workspace_store.meal_preferences)
    payload["notification_preferences"] = _guest_transfer_serializable(workspace_store.notification_preferences)
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


def _guest_transfer_state(source: InMemoryStore, target: InMemoryStore) -> str:
    if not _guest_transfer_has_user_records(source):
        return "empty"
    if not _guest_transfer_has_user_records(target):
        return "ready"
    return "already_transferred" if _guest_transfer_fingerprint(source) == _guest_transfer_fingerprint(target) else "conflict"


def _copy_guest_workspace(
    source_workspace_id: str,
    source: InMemoryStore,
    target_workspace_id: str,
    target: InMemoryStore,
) -> tuple[str, tuple[int, int, int, int, int, int, int, int, int], bool, bool]:
    """Copy a guest snapshot only after rechecking both workspaces under lock.

    The state check must share the same ordered source/target locks as the copy.
    Otherwise an account write can land between a caller's ``ready`` check and
    the copy and be overwritten by a stale guest snapshot. A PostgreSQL
    revision conflict is also deliberately re-raised: the store flush has
    already loaded the winning target snapshot, so restoring ``target_backup``
    would lose another process's committed data.
    """

    ordered_stores = sorted(((source_workspace_id, source), (target_workspace_id, target)), key=lambda item: item[0])
    with ordered_stores[0][1]._lock:
        with ordered_stores[1][1]._lock:
            transfer_state = _guest_transfer_state(source, target)
            counts = _guest_transfer_counts(source)
            meal_preferences_changed = source.meal_preferences != MealPreferences()
            notification_preferences_changed = source.notification_preferences != target.notification_preferences
            if transfer_state != "ready":
                return transfer_state, counts, meal_preferences_changed, notification_preferences_changed

            target_backup = {field: deepcopy(getattr(target, field)) for field in _GUEST_TRANSFER_FIELDS}
            target_meal_preferences_backup = deepcopy(target.meal_preferences)
            target_preferences_backup = deepcopy(target.notification_preferences)
            try:
                for field in _GUEST_TRANSFER_FIELDS:
                    setattr(target, field, deepcopy(getattr(source, field)))
                target.meal_preferences = deepcopy(source.meal_preferences)
                target.notification_preferences = deepcopy(source.notification_preferences)
                target.flush()
            except ConcurrentWorkspaceWriteError:
                raise
            except Exception:
                for field, value in target_backup.items():
                    setattr(target, field, value)
                target.meal_preferences = target_meal_preferences_backup
                target.notification_preferences = target_preferences_backup
                raise
            return "completed", counts, meal_preferences_changed, notification_preferences_changed


@app.post("/api/account/guest-transfer/preview", response_model=GuestTransferPreviewResponse)
def preview_guest_transfer(request: GuestTransferRequest) -> GuestTransferPreviewResponse:
    source_workspace_id, source, target = _guest_transfer_stores(request.guest_access_token)
    del source_workspace_id
    food_count, receipt_count, event_count, meal_plan_count, multi_day_plan_count, shopping_list_count, push_count, shopping_receive_operation_count, storage_location_count = _guest_transfer_counts(source)
    transfer_state = _guest_transfer_state(source, target)
    messages = {
        "ready": "게스트 workspace의 기록을 account workspace로 가져올 수 있어요.",
        "empty": "가져올 게스트 기록이 없어요.",
        "already_transferred": "이 게스트 기록은 이미 account workspace에 가져온 상태예요.",
        "conflict": "account workspace에 다른 기록이 있어 자동으로 합치지 않아요.",
    }
    return GuestTransferPreviewResponse(
        status=transfer_state,
        food_count=food_count,
        receipt_count=receipt_count,
        storage_event_count=event_count,
        meal_plan_count=meal_plan_count,
        multi_day_plan_count=multi_day_plan_count,
        shopping_list_count=shopping_list_count,
        shopping_receive_operation_count=shopping_receive_operation_count,
        storage_location_count=storage_location_count,
        meal_preferences_changed=source.meal_preferences != MealPreferences(),
        push_subscription_count=push_count,
        notification_preferences_changed=source.notification_preferences != NotificationPreferences(),
        message=messages[transfer_state],
    )


@app.post("/api/account/guest-transfer", response_model=GuestTransferResponse)
def transfer_guest_workspace(request: GuestTransferRequest) -> GuestTransferResponse:
    if not request.confirm:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="게스트 기록 가져오기는 confirm=true가 필요합니다.")
    source_workspace_id, source, target = _guest_transfer_stores(request.guest_access_token)
    try:
        transfer_state, counts, meal_preferences_changed, notification_preferences_changed = _copy_guest_workspace(
            source_workspace_id,
            source,
            current_workspace_id(),
            target,
        )
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "guest_transfer_persistence_unavailable",
                "detail": "게스트 기록을 저장하지 못했습니다. 계정 workspace 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc
    if transfer_state == "conflict":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="account workspace에 다른 기록이 있어 자동으로 합치지 않았습니다.")
    if transfer_state == "already_transferred":
        return GuestTransferResponse(
            status="already_transferred",
            imported_food_count=counts[0],
            imported_receipt_count=counts[1],
            imported_storage_event_count=counts[2],
            imported_meal_plan_count=counts[3],
            imported_multi_day_plan_count=counts[4],
            imported_shopping_list_count=counts[5],
            imported_shopping_receive_operation_count=counts[7],
            imported_storage_location_count=counts[8],
            imported_meal_preferences=False,
            imported_push_subscription_count=counts[6],
            imported_notification_preferences=False,
            message="게스트 기록은 이미 account workspace에 가져와져 있어요.",
        )
    if transfer_state == "empty":
        return GuestTransferResponse(
            status="completed",
            imported_food_count=0,
            imported_receipt_count=0,
            imported_storage_event_count=0,
            imported_meal_plan_count=0,
            imported_multi_day_plan_count=0,
            imported_shopping_list_count=0,
            imported_shopping_receive_operation_count=0,
            imported_storage_location_count=0,
            imported_meal_preferences=False,
            imported_push_subscription_count=0,
            imported_notification_preferences=False,
            message="가져올 게스트 기록이 없어요.",
        )
    return GuestTransferResponse(
        status="completed",
        imported_food_count=counts[0],
        imported_receipt_count=counts[1],
        imported_storage_event_count=counts[2],
        imported_meal_plan_count=counts[3],
        imported_multi_day_plan_count=counts[4],
        imported_shopping_list_count=counts[5],
        imported_shopping_receive_operation_count=counts[7],
        imported_storage_location_count=counts[8],
        imported_meal_preferences=meal_preferences_changed,
        imported_push_subscription_count=counts[6],
        imported_notification_preferences=notification_preferences_changed,
        message="게스트 기록을 account workspace로 가져왔어요.",
    )


def _notification_clock(
    preferences: NotificationPreferences,
    *,
    now: datetime | None = None,
) -> tuple[date, datetime]:
    current_time = now or datetime.now(timezone.utc)
    return current_time.astimezone(notification_zone(preferences.timezone)).date(), current_time


def _storage_location_name_for_food(food: FoodResponse) -> str | None:
    if food.storage_location_id is None:
        return None
    location = store.get_storage_location(food.storage_location_id)
    return location.name if location is not None else None


def _current_notifications(*, for_push: bool = False) -> list[NotificationResponse]:
    preferences = store.get_notification_preferences()
    if not for_push and not preferences.in_app_enabled:
        return []
    current_date, current_time = _notification_clock(preferences)
    foods = [
        FoodNotificationInput(
            id=record.response.id,
            canonical_name=record.response.canonical_name,
            date_kind=record.response.date_assertion.kind,
            date_value=record.response.date_assertion.value,
            estimated_start_date=(
                record.response.estimated_use_first_window.start_date
                if record.response.estimated_use_first_window is not None
                else None
            ),
            estimated_end_date=(
                record.response.estimated_use_first_window.end_date
                if record.response.estimated_use_first_window is not None
                else None
            ),
            storage_type=record.response.storage_type,
            storage_location_name=_storage_location_name_for_food(record.response),
            applicable_storage_type=record.response.date_assertion.applicable_storage_type,
            storage_condition_text=record.response.date_assertion.storage_condition_text,
        )
        for record in store.foods.values()
    ]
    grocy_items = [
        GrocyNotificationInput(
            id=record.id,
            canonical_name=record.canonical_name,
            status=record.status,
            last_error=record.last_error or record.last_dead_letter_error,
        )
        for record in store.grocy_outbox.values()
        if record.status in {"blocked", "dead_letter", "reconciliation_required"}
    ]
    return build_notifications(
        foods=foods,
        grocy_items=grocy_items,
        read_at=store.list_notification_read_states(),
        today=current_date,
        now=current_time,
        lead_days=preferences.lead_days,
    )


@app.get("/api/notification-preferences", response_model=NotificationPreferences)
def get_notification_preferences() -> NotificationPreferences:
    return store.get_notification_preferences()


@app.get("/api/meal-preferences", response_model=MealPreferences)
def get_meal_preferences() -> MealPreferences:
    return store.get_meal_preferences()


@app.put("/api/meal-preferences", response_model=MealPreferences)
def update_meal_preferences(preferences: MealPreferences) -> MealPreferences:
    try:
        return workspace_mutation.run(
            lambda: store.update_meal_preferences(preferences, persist=False)
        )
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "meal_preferences_persistence_unavailable",
                "detail": "식단 조건을 저장하지 못했습니다. 기존 조건을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.put("/api/notification-preferences", response_model=NotificationPreferences)
def update_notification_preferences(preferences: NotificationPreferences) -> NotificationPreferences:
    try:
        return workspace_mutation.run(
            lambda: store.update_notification_preferences(preferences, persist=False)
        )
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "notification_preferences_persistence_unavailable",
                "detail": "알림 설정을 저장하지 못했습니다. 기존 설정을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/push/subscriptions", response_model=list[PushSubscriptionSummaryResponse])
def list_push_subscriptions() -> list[PushSubscriptionSummaryResponse]:
    return store.list_push_subscription_summaries()


@app.put("/api/push/subscriptions", response_model=PushSubscriptionSummaryResponse)
def register_push_subscription(subscription: PushSubscriptionRequest) -> PushSubscriptionSummaryResponse:
    try:
        return workspace_mutation.run(
            lambda: store.upsert_push_subscription(subscription, persist=False)
        )
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "push_subscription_persistence_unavailable",
                "detail": "이 기기의 푸시 연결을 저장하지 못했습니다. 기존 연결을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.delete("/api/push/subscriptions/{endpoint_fingerprint}", response_model=PushSubscriptionDeleteResponse)
def remove_push_subscription(endpoint_fingerprint: str) -> PushSubscriptionDeleteResponse:
    if not re.fullmatch(r"[0-9a-f]{16}", endpoint_fingerprint):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="push subscription handle 형식이 잘못되었습니다.")
    if endpoint_fingerprint not in store.push_subscriptions:
        return PushSubscriptionDeleteResponse(endpoint_fingerprint=endpoint_fingerprint, removed=False)
    try:
        return workspace_mutation.run(
            lambda: PushSubscriptionDeleteResponse(
                endpoint_fingerprint=endpoint_fingerprint,
                removed=store.delete_push_subscription_fingerprint(endpoint_fingerprint, persist=False),
            )
        )
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "push_subscription_persistence_unavailable",
                "detail": "이 기기의 푸시 연결을 해지하지 못했습니다. 기존 연결을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/notifications/revision", response_model=WorkspaceRevisionResponse)
def notification_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.get("/api/notifications", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NotificationResponse]:
    notifications = _current_notifications()
    if unread_only:
        notifications = [notification for notification in notifications if notification.read_at is None]
    return notifications[:limit]


@app.post("/api/notifications/read-all", response_model=NotificationReadAllResponse)
def mark_all_notifications_read() -> NotificationReadAllResponse:
    notifications = _current_notifications()
    unread_ids = [notification.id for notification in notifications if notification.read_at is None]
    if not unread_ids:
        return NotificationReadAllResponse(marked=0)
    try:
        def mutate() -> NotificationReadAllResponse:
            store.mark_notifications_read(unread_ids, persist=False)
            return NotificationReadAllResponse(marked=len(unread_ids))

        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "notification_read_persistence_unavailable",
                "detail": "알림 읽음 상태를 저장하지 못했습니다. 읽지 않은 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(notification_id: str) -> NotificationResponse:
    notification = next((item for item in _current_notifications() if item.id == notification_id), None)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="알림을 찾을 수 없습니다.")
    try:
        def mutate() -> NotificationResponse:
            store.mark_notification_read(notification_id, persist=False)
            marked = next((item for item in _current_notifications() if item.id == notification_id), None)
            if marked is None:  # pragma: no cover - the current notification was just marked read
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="알림을 찾을 수 없습니다.")
            return marked

        return workspace_mutation.run(mutate)
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "notification_read_persistence_unavailable",
                "detail": "알림 읽음 상태를 저장하지 못했습니다. 읽지 않은 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


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
    return _product_lookup_response(
        resolve_product(
            barcode,
            cache=product_lookup_cache,
            rate_limiter=product_provider_rate_limiter,
            metrics=product_provider_metrics,
        )
    )


@app.get("/api/product-aliases", response_model=list[ProductAliasResponse])
def list_product_aliases(
    query: str | None = Query(default=None, alias="q", max_length=160),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ProductAliasResponse]:
    return store.list_product_aliases(query, limit=limit)


@app.get("/api/products/resolve-name/{product_name}", response_model=ProductNameLookupResponse)
def resolve_product_name(product_name: str) -> ProductNameLookupResponse:
    query = product_name.strip()
    if len(query) > 160:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="상품명은 160자 이내여야 합니다.")
    if not external_lookups_enabled():
        return ProductNameLookupResponse(
            query=query,
            status="disabled",
            candidates=[],
            warnings=["외부 상품 DB 조회가 비활성화되어 있어 I1250 조회를 시작하지 않았습니다."],
        )
    return _product_name_lookup_response(
        query,
        ProductNameFallbackResolver(
            primary=MfdsI1250Resolver(
                cache=product_name_lookup_cache,
                rate_limiter=product_provider_rate_limiter,
                metrics=product_provider_metrics,
            ),
            fallback=OpenFoodFactsResolver(
                cache=product_name_lookup_cache,
                rate_limiter=product_provider_rate_limiter,
                metrics=product_provider_metrics,
            ),
        ).lookup_by_product_name(query),
    )


@app.post("/api/barcodes/parse", response_model=BarcodeParseResponse)
def parse_barcode_endpoint(request: BarcodeParseRequest) -> BarcodeParseResponse:
    return _barcode_response(parse_barcode(request.raw_scan))


@app.post("/api/receipts/parse-text", response_model=ReceiptTextParseResponse, status_code=status.HTTP_201_CREATED)
def parse_receipt_text_endpoint(
    request: ReceiptTextParseRequest,
    http_response: Response,
) -> ReceiptTextParseResponse:
    parsed = parse_receipt_text(request.ocr_text)
    draft = create_receipt_draft(
        _receipt_request_from_parsed(
            source_filename=request.source_filename,
            purchased_at=request.purchased_at,
            parsed=parsed,
        ),
        http_response,
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
async def intake_receipt(
    http_response: Response,
    file: UploadFile = File(...),
) -> OcrIntakeResponse:
    filename, data = await _read_upload(file)
    file_hash = sha256(data).hexdigest()
    ocr_input_profile: OcrInputProfile = "source"
    if looks_like_pdf(data):
        run = await run_in_threadpool(_extract_pdf_ocr, data)
        quality = _pdf_quality_response([run.message] if run.message else None)
    else:
        quality_report = assess_image_quality(data)
        quality = _quality_response(quality_report)
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
        ocr_preparation = prepare_ocr_image(normalize_image_orientation(data), quality_report)
        ocr_input_profile = ocr_preparation.profile
        ocr_data = ocr_preparation.image_bytes
        run = await run_in_threadpool(ocr_engine.extract, ocr_data, filename)
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
            ocr_input_profile=ocr_input_profile,
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
            ocr_input_profile=ocr_input_profile,
        )
    parsed = parse_receipt_observations(run.observations)
    review_observation_indices = {
        index
        for line in parsed.lines
        if line.line_type == "product"
        for index in line.observation_indices
    }
    review_observations = _review_observations_response(run, allowed_indices=review_observation_indices)
    draft = create_receipt_draft(
        _receipt_request_from_parsed(source_filename=filename, purchased_at=parsed.purchased_at, parsed=parsed),
        http_response,
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
        ocr_input_profile=ocr_input_profile,
        receipt_kind=parsed.kind,
        review_observations=review_observations,
        draft=draft,
    )


@app.post("/api/labels/intake", response_model=LabelParseResponse)
async def intake_label(file: UploadFile = File(...)) -> LabelParseResponse:
    filename, data = await _read_upload(file)
    file_hash = sha256(data).hexdigest()
    ocr_input_profile: OcrInputProfile = "source"
    if looks_like_pdf(data):
        run = await run_in_threadpool(_extract_pdf_ocr, data)
        quality = _pdf_quality_response([run.message] if run.message else None)
    else:
        quality_report = assess_image_quality(data)
        quality = _quality_response(quality_report)
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
        ocr_preparation = prepare_ocr_image(normalize_image_orientation(data), quality_report)
        ocr_input_profile = ocr_preparation.profile
        ocr_data = ocr_preparation.image_bytes
        run = await run_in_threadpool(ocr_engine.extract, ocr_data, filename)
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
            ocr_input_profile=ocr_input_profile,
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
            ocr_input_profile=ocr_input_profile,
        )
    parsed = parse_label_text("\n".join(observation.text for observation in run.observations))
    review_observations, candidate_source_observation_ids = _label_review_links(run, parsed)
    return _label_response(
        source_filename=filename,
        file_sha256=file_hash,
        engine=run.engine,
        model_version=run.model_version,
        observations_count=len(run.observations),
        parsed=parsed,
        quality=quality,
        review_observations=review_observations,
        candidate_source_observation_ids=candidate_source_observation_ids,
        ocr_input_profile=ocr_input_profile,
    )


@app.post("/api/foods", response_model=FoodResponse, status_code=status.HTTP_201_CREATED)
def create_manual_food(http_request: Request, http_response: Response, request: ManualFoodRequest) -> FoodResponse:
    trusted_date_kinds = {
        "production_date",
        "packaging_date",
        "sell_by",
        "use_by",
        "best_before",
        "user_reminder",
    }
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
    if request.lot_action == "correct" and request.target_food_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="기존 lot 보정에는 target_food_id가 필요합니다.")
    if request.lot_action == "create" and request.target_food_id is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="새 lot 생성에는 target_food_id를 함께 보낼 수 없습니다.")

    idempotency_key = _request_idempotency_key(http_request)
    key_digest = _idempotency_key_digest(idempotency_key) if idempotency_key else None
    payload_fingerprint = _manual_food_payload_fingerprint(request) if key_digest else None
    canonical_key = normalize_product_name(request.canonical_name)
    lock_key = f"idempotency:{key_digest}" if key_digest else request.target_food_id or f"canonical:{canonical_key}"
    with store.manual_food_lock(lock_key), store.mutation_lock():
        if key_digest and payload_fingerprint:
            operation = store.manual_food_operations.get(_manual_food_operation_id(key_digest))
            if operation is not None:
                return _manual_food_replay_response(
                    operation=operation,
                    payload_fingerprint=payload_fingerprint,
                    http_response=http_response,
                )

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
        source_detail = request.date_source_detail
        if request.date_source == "gs1":
            gs1_ai = {
                "production_date": "11",
                "packaging_date": "13",
                "best_before": "15",
                "sell_by": "16",
                "use_by": "17",
            }.get(request.date_kind, request.date_kind)
            encoded_lot = request.date_source_detail[4:].strip() if request.date_source_detail.startswith("gs1:") else ""
            lot = request.barcode_lot or encoded_lot
            source_detail = f"GS1 AI {gs1_ai}" + (f" · {lot}" if lot else "")
        name_matches = [
            record
            for record in store.foods.values()
            if normalize_product_name(record.response.canonical_name) == canonical_key
        ]
        existing: _FoodRecord | None = None
        if request.target_food_id is not None:
            existing = store.foods.get(request.target_food_id)
            if existing is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="대상 식품 lot을 찾을 수 없습니다.")
            if normalize_product_name(existing.response.canonical_name) != canonical_key:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "food_lot_product_mismatch",
                        "detail": "선택한 식품 lot과 입력 상품명이 다릅니다. 상품 정보 수정 화면에서 확인해 주세요.",
                        "food_id": request.target_food_id,
                    },
                )
        elif request.lot_action == "create":
            # The UI explicitly selected "새 구매 lot으로 추가". Even an
            # exact product/lot match must not be treated as a correction.
            existing = None
        elif request.lot_action == "correct":
            # The request validator above requires a target. Keep this branch
            # defensive in case the model contract changes later.
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="기존 lot 보정에는 target_food_id가 필요합니다.")
        elif request.barcode_lot:
            lot_matches = [
                record
                for record in store.foods.values()
                if record.response.barcode_lot == request.barcode_lot
                and (request.barcode is None or record.response.barcode == request.barcode)
            ]
            if len(lot_matches) == 1:
                existing = lot_matches[0]
            elif len(lot_matches) > 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "food_lot_selection_required",
                        "detail": "같은 바코드 lot을 가진 식품이 여러 개라 대상 lot을 선택해야 합니다.",
                        "food_ids": [record.response.id for record in lot_matches],
                    },
                )
        elif request.date_kind in trusted_date_kinds:
            if len(name_matches) == 1:
                # Backward-compatible label/product correction for the
                # unambiguous single-lot case. Multiple lots must be
                # explicitly selected so a new scan cannot overwrite an
                # arbitrary purchase lot.
                existing = name_matches[0]
            elif len(name_matches) > 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "food_lot_selection_required",
                        "detail": "같은 상품의 식품 lot이 여러 개라 날짜를 반영할 대상을 선택해야 합니다.",
                        "food_ids": [record.response.id for record in name_matches],
                    },
                )

        validated_storage_location = _validate_storage_location_for_store(
            store,
            request.storage_location_id,
            request.storage_type,
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
            source_detail,
            99,
            request.category,
            request.image_path,
            request.note,
            estimate=estimate if request.date_kind in {"unknown", "estimated_use_first"} else None,
            inference=inference if request.date_kind in {"unknown", "estimated_use_first"} else None,
            confidence=1.0 if request.user_confirmed else inference.storage_confidence,
            barcode=request.barcode,
            barcode_lot=request.barcode_lot,
            product_provenance=request.product_provenance,
            applicable_storage_type=request.applicable_storage_type,
            storage_condition_text=request.storage_condition_text,
            storage_location_id=validated_storage_location.id if validated_storage_location else None,
        )
        food.date_assertion.user_confirmed = request.user_confirmed

        if existing is None:
            def mutate_create() -> FoodResponse:
                store.foods[food.id] = _FoodRecord(food)
                if food.product_provenance is not None:
                    store.record_product_provenance_audit(
                        food_id=food.id,
                        before=None,
                        after=food.product_provenance,
                        reason="상품 후보를 확인해 식품을 추가했습니다.",
                    )
                if key_digest and payload_fingerprint:
                    operation_id = _manual_food_operation_id(key_digest)
                    store.manual_food_operations[operation_id] = ManualFoodOperationRecord(
                        id=operation_id,
                        food_id=food.id,
                        lot_action="create",
                        idempotency_key_digest=key_digest,
                        request_payload_fingerprint=payload_fingerprint,
                        occurred_at=datetime.now(timezone.utc),
                    )
                store.reprioritize(persist=False)
                return food

            try:
                return workspace_mutation.run(mutate_create)
            except ConcurrentWorkspaceWriteError:
                # PostgresStore.reprioritize() reloads the winning snapshot;
                # never restore this request's stale copy over it.
                if key_digest and payload_fingerprint:
                    operation = store.manual_food_operations.get(_manual_food_operation_id(key_digest))
                    if operation is not None:
                        return _manual_food_replay_response(
                            operation=operation,
                            payload_fingerprint=payload_fingerprint,
                            http_response=http_response,
                        )
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "manual_food_persistence_unavailable",
                        "detail": "식품을 저장하지 못했습니다. 기존 목록을 유지했어요.",
                        "retryable": True,
                        "action": "retry_later",
                    },
                ) from exc

        def mutate_correction() -> FoodResponse:
            previous_product_info = _food_product_info_snapshot(existing.response)
            previous_product_provenance = existing.response.product_provenance
            current_date = existing.response.date_assertion
            current_date_is_trusted = current_date.kind in trusted_date_kinds
            incoming_date_is_trusted = request.date_kind in trusted_date_kinds
            preserve_existing_date = current_date_is_trusted and not incoming_date_is_trusted

            if incoming_date_is_trusted and current_date_is_trusted:
                same_date_value = current_date.kind == food.date_assertion.kind and current_date.value == food.date_assertion.value
                if not same_date_value:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "code": "food_date_already_confirmed",
                            "detail": "이미 확인된 표시 날짜는 직접 입력 경로에서 덮어쓰지 않습니다. 현재 날짜를 확인한 뒤 별도 수정 절차를 사용해 주세요.",
                            "food_id": existing.response.id,
                        },
                    )
                else:
                    # A legacy/seed lot may have the same date but lack the
                    # user's explicit confirmation flag. Refreshing the
                    # metadata is safe without adding a duplicate history
                    # entry because the date value itself did not change.
                    existing.response.date_assertion = food.date_assertion
            elif incoming_date_is_trusted:
                existing.response.date_assertion_history.append(current_date.model_copy(deep=True))
                existing.response.date_assertion = food.date_assertion
                existing.response.estimated_use_first_window = None
            elif not preserve_existing_date:
                existing.response.date_assertion = food.date_assertion
                existing.response.estimated_use_first_window = food.estimated_use_first_window

            # A target is a correction/enrichment operation, not a new
            # purchase. Preserve the target lot's quantity and unit so a label
            # scan with the UI default of 1개 cannot silently change inventory.
            existing.response.brand = request.brand
            existing.response.storage_type = request.storage_type
            if request.storage_location_id is not None:
                existing.response.storage_location_id = request.storage_location_id
            elif existing.response.storage_location_id:
                existing_location = store.storage_locations.get(existing.response.storage_location_id)
                if existing_location is None or existing_location.storage_type != request.storage_type:
                    existing.response.storage_location_id = None
            existing.response.category = request.category
            existing.response.image_path = request.image_path
            existing.response.note = request.note
            if request.barcode is not None:
                existing.response.barcode = request.barcode
            if request.barcode_lot is not None:
                existing.response.barcode_lot = request.barcode_lot
            if food.product_provenance is not None:
                existing.response.product_provenance = food.product_provenance
            elif previous_product_provenance is not None:
                existing.response.product_provenance = previous_product_provenance
            if existing.response.date_assertion.kind == "unknown":
                # Recompute the review-only window from the target lot's
                # purchase/opened provenance instead of the correction request
                # time. Storage changes affect the estimate; they never turn it
                # into a package-specific date assertion.
                _refresh_estimated_window(existing.response)

            after_product_info = _food_product_info_snapshot(existing.response)
            store.record_product_info_audit(
                food_id=existing.response.id,
                before=previous_product_info,
                after=after_product_info,
                reason="사용자가 라벨·바코드 확인 결과로 식품 lot 정보를 갱신했습니다.",
            )
            if food.product_provenance is not None and previous_product_provenance != food.product_provenance:
                store.record_product_provenance_audit(
                    food_id=existing.response.id,
                    before=previous_product_provenance,
                    after=food.product_provenance,
                    reason="상품 후보를 확인해 식품 정보를 갱신했습니다.",
                )
            if key_digest and payload_fingerprint:
                operation_id = _manual_food_operation_id(key_digest)
                store.manual_food_operations[operation_id] = ManualFoodOperationRecord(
                    id=operation_id,
                    food_id=existing.response.id,
                    lot_action="correct",
                    idempotency_key_digest=key_digest,
                    request_payload_fingerprint=payload_fingerprint,
                    occurred_at=datetime.now(timezone.utc),
                )
            store.reprioritize(persist=False)
            return existing.response

        try:
            return workspace_mutation.run(mutate_correction)
        except ConcurrentWorkspaceWriteError:
            # PostgresStore.reprioritize() reloads the winning snapshot;
            # restoring a stale snapshot here would lose that write.
            if key_digest and payload_fingerprint:
                operation = store.manual_food_operations.get(_manual_food_operation_id(key_digest))
                if operation is not None:
                    return _manual_food_replay_response(
                        operation=operation,
                        payload_fingerprint=payload_fingerprint,
                        http_response=http_response,
                    )
            raise
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "manual_food_persistence_unavailable",
                    "detail": "식품 정보를 저장하지 못했습니다. 기존 정보를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.post("/api/receipts/drafts", response_model=ReceiptDraftResponse, status_code=status.HTTP_201_CREATED)
def create_receipt_draft(
    request: ReceiptDraftRequest,
    http_response: Response,
) -> ReceiptDraftResponse:
    fingerprint = _fingerprint(request)
    legacy_fingerprint = _legacy_fingerprint(request)
    with store.receipt_draft_lock(fingerprint), store.mutation_lock():
        committed_match = next(
            (
                record
                for record in store.receipts.values()
                if _receipt_record_matches_request(record, request, fingerprint, legacy_fingerprint)
                and (record.committed or record.response.status == "committed")
            ),
            None,
        )
        if committed_match is not None or fingerprint in store.committed_fingerprints:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 반영된 영수증입니다.")
        existing = next(
            (
                record
                for record in store.receipts.values()
                if _receipt_record_matches_request(record, request, fingerprint, legacy_fingerprint)
                and not record.committed
                and record.response.status != "committed"
            ),
            None,
        )
        if existing is not None:
            if http_response is not None:
                http_response.headers["X-Idempotency-Replayed"] = "true"
            return existing.response

        draft = ReceiptDraftResponse(
            id=create_id("receipt"),
            fingerprint=fingerprint,
            status="review_required",
            source_filename=request.source_filename,
            purchased_at=request.purchased_at,
            template_id=request.template_id,
            template_confidence=request.template_confidence,
            merchant_name=request.merchant_name,
            lines=[_draft_line(line, index) for index, line in enumerate(request.lines)],
        )
        def mutate_create() -> ReceiptDraftResponse:
            store.receipts[draft.id] = _ReceiptRecord(draft)
            return draft

        try:
            return workspace_mutation.run(mutate_create)
        except ConcurrentWorkspaceWriteError:
            # PostgresStore.flush() reloads the winning snapshot before
            # raising. If another process created the same fingerprint first,
            # return that durable draft instead of exposing a false conflict.
            winner = next(
                (
                    record
                    for record in store.receipts.values()
                    if _receipt_record_matches_request(record, request, fingerprint, legacy_fingerprint)
                    and not record.committed
                    and record.response.status != "committed"
                ),
                None,
            )
            if winner is None:
                raise
            if http_response is not None:
                http_response.headers["X-Idempotency-Replayed"] = "true"
            return winner.response
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "receipt_draft_persistence_unavailable",
                    "detail": "영수증 검수 초안을 저장하지 못했습니다. 다시 시도해 주세요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.get("/api/receipts/revision", response_model=WorkspaceRevisionResponse)
def receipt_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.get("/api/receipts/{receipt_id}", response_model=ReceiptDraftResponse)
def get_receipt_draft(receipt_id: str) -> ReceiptDraftResponse:
    record = store.receipts.get(receipt_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 draft를 찾을 수 없습니다.")
    return record.response


@app.post("/api/receipts/{receipt_id}/product-enrichment", response_model=ProductEnrichmentJobRecord, status_code=status.HTTP_202_ACCEPTED)
def enqueue_product_enrichment(receipt_id: str) -> ProductEnrichmentJobRecord:
    job_id = f"product-enrichment-{receipt_id}"

    def mutate() -> ProductEnrichmentJobRecord:
        record = store.receipts.get(receipt_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 draft를 찾을 수 없습니다.")
        if record.committed or record.response.status == "committed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 반영된 영수증은 제품 후보를 갱신할 수 없습니다.")
        line_ids = [line.id for line in record.response.lines if line.line_type == "product" and (line.canonical_name or line.raw_name).strip()]
        if not line_ids:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="제품정보를 조회할 영수증 상품 line이 없습니다.")
        existing = store.product_enrichment_jobs.get(job_id)
        if existing is not None:
            return existing
        now = datetime.now(timezone.utc)
        job = ProductEnrichmentJobRecord(
            id=job_id,
            receipt_id=receipt_id,
            line_ids=line_ids,
            next_attempt_at=now,
            created_at=now,
            updated_at=now,
        )
        store.product_enrichment_jobs[job.id] = job
        return job

    try:
        return workspace_mutation.run(mutate)
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        winner = store.product_enrichment_jobs.get(job_id)
        if winner is not None:
            return winner
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "product_enrichment_persistence_unavailable",
                "detail": "제품정보 조회 작업을 저장하지 못했습니다. 검수 상태는 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/receipts/{receipt_id}/product-enrichment", response_model=ProductEnrichmentJobRecord)
def get_product_enrichment_job(receipt_id: str) -> ProductEnrichmentJobRecord:
    job = store.product_enrichment_jobs.get(f"product-enrichment-{receipt_id}")
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="제품정보 enrichment 작업을 찾을 수 없습니다.")
    return job


@app.post("/api/receipts/{receipt_id}/product-enrichment/retry", response_model=ProductEnrichmentJobRecord)
def retry_product_enrichment_job(receipt_id: str) -> ProductEnrichmentJobRecord:
    job_id = f"product-enrichment-{receipt_id}"

    def mutate() -> ProductEnrichmentJobRecord:
        job = store.product_enrichment_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="제품정보 enrichment 작업을 찾을 수 없습니다.")
        if job.status != "dead_letter":
            return job
        now = datetime.now(timezone.utc)
        job.status = "queued"
        job.attempts = 0
        job.processed_lines = 0
        job.enriched_candidates = 0
        job.last_error = None
        job.next_attempt_at = now
        job.in_flight_started_at = None
        job.last_attempt_at = None
        job.updated_at = now
        return job

    try:
        return workspace_mutation.run(mutate)
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        winner = store.product_enrichment_jobs.get(job_id)
        if winner is not None:
            return winner
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "product_enrichment_persistence_unavailable",
                "detail": "제품정보 조회 재시작을 저장하지 못했습니다. 기존 작업 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/receipts", response_model=list[ReceiptSummaryResponse])
def list_receipt_summaries() -> list[ReceiptSummaryResponse]:
    return store.receipt_summaries()


@app.get("/api/privacy/receipt-policy", response_model=ReceiptPrivacyPolicyResponse)
def receipt_privacy_policy() -> ReceiptPrivacyPolicyResponse:
    return ReceiptPrivacyPolicyResponse(
        message=(
            "업로드한 원본 bytes는 처리 중에만 사용하고 저장하지 않습니다. "
            "미반영 영수증은 사용자가 metadata를 삭제할 수 있으며, 이미 재고에 반영된 영수증은 "
            "재고 출처·거래·중복 방지에 필요한 최소 정보만 남기고 파일명과 OCR 원문을 비식별화합니다."
        )
    )


@app.post("/api/receipts/{receipt_id}/privacy-erase", response_model=ReceiptPrivacyEraseResponse)
def privacy_erase_receipt(receipt_id: str, request: ReceiptPrivacyEraseRequest) -> ReceiptPrivacyEraseResponse:
    del request
    try:
        return workspace_mutation.run(lambda: store.privacy_erase_receipt(receipt_id, persist=False))
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 기록을 찾을 수 없습니다.") from exc
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "receipt_privacy_persistence_unavailable",
                "detail": "영수증 원본 정보를 저장하지 못했습니다. 기존 영수증 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/receipts/{receipt_id}/commit", response_model=ReceiptCommitResponse)
def commit_receipt(
    receipt_id: str,
    request: ReceiptCommitRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ReceiptCommitResponse:
    normalized_idempotency_key = _normalize_idempotency_key(idempotency_key)
    with store.receipt_commit_lock(receipt_id):
        with store.mutation_lock():
            return _commit_receipt_locked(receipt_id, request, idempotency_key=normalized_idempotency_key)


def _receipt_commit_replay_response(
    *,
    receipt_id: str,
    transaction: CommitTransactionRecord,
) -> ReceiptCommitResponse:
    return ReceiptCommitResponse(
        receipt_id=receipt_id,
        status="committed",
        commit_transaction_id=transaction.id,
        created_lot_ids=list(transaction.created_lot_ids),
        skipped_line_ids=list(transaction.skipped_line_ids),
        inventory=[item.response for item in store._sorted_foods()],
        grocy_sync_status=transaction.grocy_sync_status,
        idempotency_replayed=True,
    )


def _commit_receipt_locked(
    receipt_id: str,
    request: ReceiptCommitRequest,
    *,
    idempotency_key: str | None = None,
) -> ReceiptCommitResponse:
    record = store.receipts.get(receipt_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 draft를 찾을 수 없습니다.")

    key_digest = _receipt_commit_key_digest(idempotency_key) if idempotency_key else None
    payload_fingerprint = (
        _receipt_commit_payload_fingerprint(receipt_id, request)
        if idempotency_key
        else None
    )
    pending_transaction: CommitTransactionRecord | None = None
    if key_digest is not None:
        matching_transactions = [
            transaction
            for transaction in store.commit_transactions.values()
            if transaction.idempotency_key_digest == key_digest
        ]
        if any(transaction.receipt_id != receipt_id for transaction in matching_transactions):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="같은 Idempotency-Key로 다른 영수증을 반영할 수 없습니다.",
            )
        if any(
            transaction.request_payload_fingerprint != payload_fingerprint
            for transaction in matching_transactions
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="같은 Idempotency-Key로 다른 영수증 반영 내용을 요청할 수 없습니다.",
            )
        replay = next(
            (
                transaction
                for transaction in reversed(matching_transactions)
                if transaction.status == "committed"
            ),
            None,
        )
        if replay is not None:
            return _receipt_commit_replay_response(receipt_id=receipt_id, transaction=replay)
        pending_transaction = next(
            (
                transaction
                for transaction in reversed(matching_transactions)
                if transaction.status == "pending"
            ),
            None,
        )
    if record.committed or record.response.status == "committed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 반영된 영수증입니다.")
    if record.response.fingerprint in store.committed_fingerprints:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="동일 fingerprint의 영수증이 이미 반영되었습니다.")

    line_map = {line.id: line for line in record.response.lines}
    missing_ids = [line_id for line_id in request.confirmed_line_ids if line_id not in line_map]
    if missing_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"없는 line id: {missing_ids}")

    transaction = pending_transaction or CommitTransactionRecord(
        id=create_id("commit"),
        receipt_id=receipt_id,
        fingerprint=record.response.fingerprint,
        status="pending",
        idempotency_key_digest=key_digest,
        request_payload_fingerprint=payload_fingerprint,
    )
    transaction.status = "pending"
    transaction.error_code = None
    transaction.created_lot_ids = []
    transaction.skipped_line_ids = []
    if pending_transaction is None:
        store.commit_transactions[transaction.id] = transaction
        try:
            store.flush()
        except ConcurrentWorkspaceWriteError:
            store.commit_transactions.pop(transaction.id, None)
            raise
        except Exception as exc:
            store.commit_transactions.pop(transaction.id, None)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "receipt_commit_persistence_unavailable",
                    "detail": "영수증 반영을 시작하지 못했습니다. 기존 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc
    created_lots: list[str] = []
    grocy_items: list[tuple[str, str, float, str, datetime | None]] = []
    aliases_to_save: list[tuple[str, str]] = []
    skipped: list[str] = []
    def mutate() -> ReceiptCommitResponse:
        for line_id in request.confirmed_line_ids:
            line = line_map[line_id]
            if line.line_type != "product":
                skipped.append(line_id)
                continue
            if line.review_status == "pending" and line_id not in request.overrides:
                skipped.append(line_id)
                continue
            override = request.overrides.get(line_id)
            if override is not None:
                if override.match_source is not None:
                    line.match_source = override.match_source
                if override.match_candidates is not None:
                    line.match_candidates = [candidate.model_copy(deep=True) for candidate in override.match_candidates]
            lot_id = store.upsert_from_receipt(
                line=line,
                purchased_at=record.response.purchased_at,
                override=override,
                source_receipt_id=receipt_id,
                persist=False,
            )
            created_lots.append(lot_id)
            canonical_name = (override.canonical_name if override and override.canonical_name else line.canonical_name) or _normalize_product_name(line.raw_name)
            quantity = override.quantity if override and override.quantity is not None else line.quantity
            unit = override.unit if override and override.unit else line.unit
            grocy_items.append((lot_id, canonical_name, quantity, unit, record.response.purchased_at))
            aliases_to_save.append((line.raw_name, canonical_name))

        transaction.created_lot_ids = list(created_lots)
        transaction.skipped_line_ids = list(skipped)
        record.committed = True
        record.response.status = "committed"
        record.response.stock_created = bool(created_lots)
        store.committed_fingerprints.add(record.response.fingerprint)
        transaction.status = "committed"
        transaction.grocy_sync_status = _queue_grocy_receipt_syncs(
            receipt_id=receipt_id,
            transaction_id=transaction.id,
            items=grocy_items,
        )
        for raw_name, canonical_name in aliases_to_save:
            if normalize_product_name(raw_name) != normalize_product_name(canonical_name):
                store.upsert_product_alias(
                    raw_name=raw_name,
                    canonical_name=canonical_name,
                    confidence=1.0,
                    persist=False,
                )
        store.reprioritize(persist=False)
        return ReceiptCommitResponse(
            receipt_id=receipt_id,
            status="committed",
            commit_transaction_id=transaction.id,
            created_lot_ids=created_lots,
            skipped_line_ids=skipped,
            inventory=[item.response for item in store._sorted_foods()],
            grocy_sync_status=transaction.grocy_sync_status,
        )

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        # PostgresStore.flush() has already reloaded the current workspace;
        # preserving that fresh snapshot is safer than recording a stale
        # request-local reconciliation transaction.
        if key_digest is not None:
            replay = next(
                (
                    candidate
                    for candidate in reversed(store.commit_transactions.values())
                    if candidate.idempotency_key_digest == key_digest
                    and candidate.receipt_id == receipt_id
                    and candidate.request_payload_fingerprint == payload_fingerprint
                    and candidate.status == "committed"
                ),
                None,
            )
            if replay is not None:
                return _receipt_commit_replay_response(receipt_id=receipt_id, transaction=replay)
        raise
    except Exception as exc:
        # WorkspaceMutation has already restored the in-memory state to the
        # durable pending transaction snapshot. Keep that marker explicit so
        # a later retry can reconcile the failed attempt without leaving lots.
        transaction.status = "needs_reconciliation"
        transaction.error_code = exc.__class__.__name__
        transaction.created_lot_ids = []
        transaction.skipped_line_ids = list(skipped)
        store.commit_transactions[transaction.id] = transaction
        try:
            store.flush()
        except ConcurrentWorkspaceWriteError:
            raise
        except Exception as marker_exc:
            # The durable pending marker was written before finalization, so
            # keep that retry identity in memory when the best-effort status
            # update itself cannot be persisted. A later retry can still use
            # the pending transaction without creating another lot.
            transaction.status = "pending"
            transaction.error_code = None
            transaction.created_lot_ids = []
            transaction.skipped_line_ids = list(skipped)
            store.commit_transactions[transaction.id] = transaction
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "receipt_commit_reconciliation_unavailable",
                    "detail": "영수증 반영 상태를 저장하지 못했습니다. 기존 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from marker_exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "receipt_commit_persistence_unavailable",
                "detail": "영수증 반영을 저장하지 못했습니다. 기존 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/commit-transactions", response_model=list[CommitTransactionRecord])
def list_commit_transactions() -> list[CommitTransactionRecord]:
    return list(store.commit_transactions.values())


@app.post("/api/foods/{food_id}/storage-event-sequence", response_model=StorageEventSequenceResponse)
def create_storage_event_sequence(
    http_request: Request,
    http_response: Response,
    food_id: str,
    request: StorageEventSequenceRequest,
) -> StorageEventSequenceResponse:
    idempotency_key = _request_idempotency_key(http_request)
    if idempotency_key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="여러 보관 상태를 함께 저장하려면 Idempotency-Key가 필요합니다.",
        )

    with store.mutation_lock():
        existing_sequence = _existing_storage_event_sequence(
            food_id=food_id,
            requests=request.events,
            idempotency_key=idempotency_key,
        )
        if existing_sequence is not None:
            events, final_food_id = existing_sequence
            http_response.headers["X-Idempotency-Replayed"] = "true"
            return _storage_event_sequence_response_with_inventory(
                _storage_event_sequence_replay_response(events=events, final_food_id=final_food_id)
            )

        if food_id not in store.foods:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")

        def mutate() -> StorageEventSequenceResponse:
            events: list[StorageEventResponse] = []
            target_food_id = food_id
            for index, event_request in enumerate(request.events):
                record = store.foods.get(target_food_id)
                if record is None:
                    raise InventoryNotFoundError(target_food_id)
                if event_request.quantity is not None and event_request.quantity > record.response.quantity:
                    raise InventoryInvariantError("이벤트 수량이 현재 lot 수량보다 큽니다.")
                if event_request.event_type == "moved" and event_request.to_storage_type is None:
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="moved 이벤트에는 to_storage_type이 필요합니다.")
                if event_request.event_type != "moved" and event_request.to_storage_location_id is not None:
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="사용자 정의 보관 위치는 moved 이벤트에서만 선택할 수 있습니다.")
                _validate_storage_location_for_store(
                    store,
                    event_request.to_storage_location_id,
                    event_request.to_storage_type or record.response.storage_type,
                )

                occurred_at = datetime.now(timezone.utc)
                mutation = _inventory_authority(store).apply_storage_event(
                    food_id=target_food_id,
                    event_type=event_request.event_type,
                    to_storage_type=event_request.to_storage_type,
                    to_storage_location_id=event_request.to_storage_location_id,
                    quantity=event_request.quantity,
                    occurred_at=occurred_at,
                )
                event = StorageEventResponse(
                    id=_idempotent_storage_event_sequence_id(idempotency_key, index),
                    food_id=target_food_id,
                    event_type=event_request.event_type,
                    from_storage_type=mutation.from_storage_type,
                    to_storage_type=mutation.to_storage_type,
                    from_storage_location_id=mutation.from_storage_location_id,
                    to_storage_location_id=mutation.to_storage_location_id,
                    quantity=mutation.event_quantity,
                    occurred_at=occurred_at,
                    created_child_food_id=mutation.created_child_food_id,
                )
                store.storage_events.append(event)
                event.grocy_sync_status = _queue_grocy_storage_sync(
                    event=event,
                    canonical_name=mutation.canonical_name,
                    quantity=mutation.event_quantity,
                    unit=mutation.unit,
                )
                events.append(event)
                target_food_id = mutation.created_child_food_id or target_food_id

            store.reprioritize(persist=False)
            return StorageEventSequenceResponse(
                events=events,
                final_food_id=target_food_id,
            )

        try:
            return _storage_event_sequence_response_with_inventory(workspace_mutation.run(mutate))
        except InventoryInvariantError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        except InventoryNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.") from exc
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            winner = _existing_storage_event_sequence(
                food_id=food_id,
                requests=request.events,
                idempotency_key=idempotency_key,
            )
            if winner is None:
                raise
            events, final_food_id = winner
            http_response.headers["X-Idempotency-Replayed"] = "true"
            return _storage_event_sequence_response_with_inventory(
                _storage_event_sequence_replay_response(events=events, final_food_id=final_food_id)
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "storage_event_sequence_persistence_unavailable",
                    "detail": "보관 상태 sequence를 저장하지 못했습니다. 기존 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.post("/api/foods/{food_id}/storage-events", response_model=StorageEventResponse)
def create_storage_event(http_request: Request, http_response: Response, food_id: str, request: StorageEventRequest) -> StorageEventResponse:
    idempotency_key = _request_idempotency_key(http_request)
    with store.mutation_lock():
        if idempotency_key:
            event_id = _idempotent_storage_event_id(idempotency_key)
            existing = next((event for event in store.storage_events if event.id == event_id), None)
            if existing is not None:
                if not _storage_event_matches_request(existing, food_id, request):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 보관 이벤트를 요청할 수 없습니다.")
                http_response.headers["X-Idempotency-Replayed"] = "true"
                return _storage_event_response_with_inventory(existing)
        else:
            event_id = create_id("event")
        record = store.foods.get(food_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
        current_quantity = record.response.quantity
        if request.quantity is not None and request.quantity > current_quantity:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이벤트 수량이 현재 lot 수량보다 큽니다.")
        if request.event_type == "moved" and request.to_storage_type is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="moved 이벤트에는 to_storage_type이 필요합니다.")
        if request.event_type != "moved" and request.to_storage_location_id is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="사용자 정의 보관 위치는 moved 이벤트에서만 선택할 수 있습니다.")
        _validate_storage_location_for_store(
            store,
            request.to_storage_location_id,
            request.to_storage_type or record.response.storage_type,
        )

        def mutate() -> StorageEventResponse:
            occurred_at = datetime.now(timezone.utc)
            mutation = _inventory_authority(store).apply_storage_event(
                food_id=food_id,
                event_type=request.event_type,
                to_storage_type=request.to_storage_type,
                to_storage_location_id=request.to_storage_location_id,
                quantity=request.quantity,
                occurred_at=occurred_at,
            )
            event = StorageEventResponse(
                id=event_id,
                food_id=food_id,
                event_type=request.event_type,
                from_storage_type=mutation.from_storage_type,
                to_storage_type=mutation.to_storage_type,
                from_storage_location_id=mutation.from_storage_location_id,
                to_storage_location_id=mutation.to_storage_location_id,
                quantity=mutation.event_quantity,
                occurred_at=occurred_at,
                created_child_food_id=mutation.created_child_food_id,
            )
            store.storage_events.append(event)
            event.grocy_sync_status = _queue_grocy_storage_sync(
                event=event,
                canonical_name=mutation.canonical_name,
                quantity=mutation.event_quantity,
                unit=mutation.unit,
            )
            store.reprioritize(persist=False)
            return event

        try:
            return _storage_event_response_with_inventory(workspace_mutation.run(mutate))
        except InventoryInvariantError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        except InventoryNotFoundError as exc:  # pragma: no cover - existence is checked above
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.") from exc
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            # PostgresStore.flush() already reloads the newest workspace snapshot
            # before raising. Never restore the stale local snapshot here.
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "storage_event_persistence_unavailable",
                    "detail": "보관 상태 변경을 저장하지 못했습니다. 기존 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.patch("/api/foods/{food_id}/date-assertion", response_model=FoodResponse)
def confirm_food_date(food_id: str, request: DateAssertionUpdateRequest) -> FoodResponse:
    record = store.foods.get(food_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    current = record.response.date_assertion
    if current.kind not in {"unknown", "estimated_use_first"}:
        if current.kind == request.kind and current.value == request.date_value and current.source_detail == request.source_detail:
            return record.response
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 확인된 표시 날짜는 이 화면에서 덮어쓰지 않습니다.",
        )
    try:
        def mutate() -> FoodResponse:
            record.response.date_assertion_history.append(current.model_copy(deep=True))
            record.response.date_assertion = DateAssertion(
                kind=request.kind,
                value=request.date_value,
                display_label=request.date_value.isoformat(),
                source="user_input",
                source_detail=request.source_detail,
                confidence=1.0,
                user_confirmed=True,
                applicable_storage_type=request.applicable_storage_type or current.applicable_storage_type,
                storage_condition_text=request.storage_condition_text or current.storage_condition_text,
            )
            record.response.estimated_use_first_window = None
            store.reprioritize(persist=False)
            return record.response

        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        # The Postgres store has already reloaded the winning workspace
        # snapshot. Restoring this request's stale copy would lose it.
        raise
    except Exception as exc:
        # WorkspaceMutation has restored the process-local snapshot. The
        # failed flush has rolled back its durable transaction as well.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "food_date_persistence_unavailable",
                "detail": "확인한 날짜를 저장하지 못했습니다. 기존 날짜를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/foods/{food_id}/storage-events", response_model=list[StorageEventResponse])
def list_storage_events(food_id: str) -> list[StorageEventResponse]:
    if food_id not in store.foods and not any(
        event.food_id == food_id or event.created_child_food_id == food_id
        for event in store.storage_events
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="식품을 찾을 수 없습니다.")
    return [
        event
        for event in store.storage_events
        if event.food_id == food_id or event.created_child_food_id == food_id
    ]


def _build_meal_plan(
    request: MealPlanRequest,
    *,
    exclude_recipe_ids: set[str] | None = None,
    selected_foods: list[FoodResponse] | None = None,
    planned_override: PlannedRecipe | None = None,
) -> MealPlanResponse:
    selected = selected_foods if selected_foods is not None else [store.foods[food_id].response for food_id in request.inventory_ids if food_id in store.foods]
    if not selected:
        selected = [record.response for record in store._sorted_foods()[:3]]
    recipe_specs = load_recipe_specs() + store.approved_recipe_specs()
    avoided_allergens = set(store.get_meal_preferences().avoid_allergens)
    planned: PlannedRecipe | None = planned_override or plan_recipe(
        selected,
        request.max_minutes,
        specs=recipe_specs,
        exclude_recipe_ids=exclude_recipe_ids,
        preferred_recipe_id=request.recipe_id,
        avoid_allergens=avoided_allergens,
        servings=request.servings,
    )
    preference_filtered = False
    if planned is None and avoided_allergens:
        preference_filtered = plan_recipe(
            selected,
            request.max_minutes,
            specs=recipe_specs,
            exclude_recipe_ids=exclude_recipe_ids,
            preferred_recipe_id=request.recipe_id,
            servings=request.servings,
        ) is not None
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
            servings=request.servings,
            inventory_ids=[],
            ingredients=[],
            missing_ingredients=[],
            matched_ratio=0,
            score=0,
            reason=(
                "현재 재료에 맞는 메뉴가 있지만, 설정한 알레르기 회피 조건을 확인할 수 없어 추천하지 않았어요."
                if preference_filtered
                else "레시피 후보를 만들려면 식품을 먼저 추가해 주세요."
            ),
            steps=[],
            safety_note="식품 상태가 이상하면 사용하지 마세요.",
            preference_filtered=preference_filtered,
            preference_note="알레르기 정보가 불명확한 recipe는 회피 조건이 설정된 동안 추천하지 않습니다." if preference_filtered else None,
        )
    date_review_foods = _meal_plan_date_review_foods(selected, planned)
    storage_mismatch_foods = _meal_plan_storage_mismatch_foods(selected, planned)
    storage_mismatch_labels = _meal_plan_storage_mismatch_labels(selected, planned)
    date_review_food_label = "·".join(date_review_foods)
    storage_mismatch_label = "·".join(storage_mismatch_labels)
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
        servings=planned.servings,
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
                quantity_match=ingredient.quantity_match,
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
        allergens=list(planned.allergens) if planned.allergens is not None else None,
        allergen_metadata_status="known" if planned.allergens is not None else "unknown",
        date_review_required=bool(date_review_foods),
        date_review_foods=date_review_foods,
        date_review_note=(
            f"{date_review_food_label}의 포장지 보관조건·현재 보관 위치({storage_mismatch_label})·표시 날짜를 다시 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다."
            if date_review_foods and storage_mismatch_foods
            else f"{date_review_food_label}의 표시 날짜·보관 상태를 다시 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다."
            if date_review_foods
            else None
        ),
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
            "bundle_id",
            "bundle_day_index",
        },
    )
    # Quantities shown as informational availability can change without changing
    # the selected recipe or its concrete allocations. The completion endpoint
    # validates those allocations against the live lot quantities again.
    for ingredient in payload.get("ingredients", []):
        ingredient.pop("available_quantity", None)
        ingredient.pop("available_unit", None)
        ingredient.pop("quantity_match", None)
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


def _with_meal_plan_snapshot_hash(plan: MealPlanResponse) -> MealPlanResponse:
    if plan.recipe_id != "no-match":
        plan.snapshot_hash = _meal_plan_snapshot_hash(plan)
    return plan


def _application_timezone() -> ZoneInfo:
    configured = os.getenv("RESCUE_MEAL_TIMEZONE", "Asia/Seoul").strip() or "Asia/Seoul"
    try:
        return ZoneInfo(configured)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Seoul")


def _workspace_timezone() -> ZoneInfo:
    return notification_zone(store.get_notification_preferences().timezone)


def _meal_plan_date_review_foods(selected: list[FoodResponse], planned: PlannedRecipe) -> list[str]:
    allocated_food_ids = {
        allocation.food_id
        for ingredient in planned.ingredients
        for allocation in ingredient.allocations
    }
    today = datetime.now(timezone.utc).astimezone(_workspace_timezone()).date()
    review_names: list[str] = []
    for food in selected:
        if food.id not in allocated_food_ids:
            continue
        assertion = food.date_assertion
        due_or_past_printed_date = (
            assertion.kind in {"use_by", "sell_by", "best_before"}
            and assertion.value is not None
            and assertion.value <= today
        )
        unresolved_or_non_expiry_date = assertion.kind in {"unknown", "production_date", "packaging_date"}
        storage_condition_mismatch = bool(
            assertion.applicable_storage_type
            and assertion.applicable_storage_type != food.storage_type
        )
        if due_or_past_printed_date or unresolved_or_non_expiry_date or storage_condition_mismatch:
            review_names.append(food.display_name)
    return list(dict.fromkeys(review_names))


def _meal_plan_storage_mismatch_foods(selected: list[FoodResponse], planned: PlannedRecipe) -> list[str]:
    allocated_food_ids = {
        allocation.food_id
        for ingredient in planned.ingredients
        for allocation in ingredient.allocations
    }
    return list(dict.fromkeys(
        food.display_name
        for food in selected
        if food.id in allocated_food_ids
        and food.date_assertion.applicable_storage_type
        and food.date_assertion.applicable_storage_type != food.storage_type
    ))


def _meal_plan_storage_mismatch_labels(selected: list[FoodResponse], planned: PlannedRecipe) -> list[str]:
    allocated_food_ids = {
        allocation.food_id
        for ingredient in planned.ingredients
        for allocation in ingredient.allocations
    }
    storage_labels = {"ambient": "실온", "refrigerated": "냉장", "frozen": "냉동"}
    return list(dict.fromkeys(
        _storage_location_name_for_food(food) or storage_labels.get(food.storage_type, food.storage_type)
        for food in selected
        if food.id in allocated_food_ids
        and food.date_assertion.applicable_storage_type
        and food.date_assertion.applicable_storage_type != food.storage_type
    ))


@app.post("/api/meal-plans/preview", response_model=MealPlanResponse)
def preview_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    """Calculate a recipe without creating a saved plan."""
    return _with_meal_plan_snapshot_hash(_build_meal_plan(request))


@app.post("/api/meal-plans/options", response_model=MealPlanOptionsResponse)
def preview_meal_plan_options(request: MealPlanRequest) -> MealPlanOptionsResponse:
    """Calculate up to three distinct recipe choices without creating saved plans."""
    excluded: set[str] = set()
    options: list[MealPlanResponse] = []
    for _ in range(3):
        plan = _with_meal_plan_snapshot_hash(_build_meal_plan(request, exclude_recipe_ids=excluded))
        if plan.recipe_id == "no-match":
            break
        options.append(plan)
        excluded.add(plan.recipe_id)
    return MealPlanOptionsResponse(
        options=options,
        max_minutes=request.max_minutes,
        servings=request.servings,
        inventory_ids=list(request.inventory_ids),
    )


def _build_multi_day_meal_plan(request: MealPlanRequest) -> MultiDayMealPlanResponse:
    """Calculate up to three distinct day plans from a shared inventory budget."""
    source_inventory_ids = list(request.inventory_ids)
    selected = [store.foods[food_id].response.model_copy(deep=True) for food_id in source_inventory_ids if food_id in store.foods]
    if not selected:
        selected = [record.response.model_copy(deep=True) for record in store._sorted_foods()[:20]]
        source_inventory_ids = [food.id for food in selected]
    recipe_specs = tuple(load_recipe_specs() + store.approved_recipe_specs())
    avoided_allergens = set(store.get_meal_preferences().avoid_allergens)
    optimized = optimize_multi_day_plans(
        selected,
        request.max_minutes,
        specs=recipe_specs,
        avoid_allergens=avoided_allergens,
        day_count=3,
        servings=request.servings,
    )
    days: list[MultiDayMealPlanDayResponse] = []
    generated_at = datetime.now(timezone.utc)
    local_plan_date = generated_at.astimezone(_workspace_timezone()).date()
    for day_index, planned in enumerate(optimized.plans, start=1):
        plan = _with_meal_plan_snapshot_hash(
            _build_meal_plan(
                request,
                selected_foods=selected,
                planned_override=planned,
            )
        )
        days.append(
            MultiDayMealPlanDayResponse(
                day_index=day_index,
                plan_date=local_plan_date + timedelta(days=day_index - 1),
                plan=plan,
            )
        )
    snapshot_payload = {
        "max_minutes": request.max_minutes,
        "servings": request.servings,
        "inventory_ids": source_inventory_ids,
        "days": [{"day_index": day.day_index, "plan_date": day.plan_date.isoformat(), "snapshot_hash": day.plan.snapshot_hash} for day in days],
    }
    snapshot_hash = sha256(json.dumps(snapshot_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return MultiDayMealPlanResponse(
        id=create_id("multi-meal"),
        snapshot_hash=snapshot_hash,
        generated_at=generated_at,
        max_minutes=request.max_minutes,
        servings=request.servings,
        inventory_ids=source_inventory_ids,
        optimization_engine=optimized.engine,
        days=days,
    )


@app.post("/api/meal-plans/multi-day-preview", response_model=MultiDayMealPlanResponse)
def preview_multi_day_meal_plan(request: MealPlanRequest) -> MultiDayMealPlanResponse:
    """Calculate up to three distinct day plans without persisting any plan."""
    return _build_multi_day_meal_plan(request)


@app.get("/api/meal-plans/revision", response_model=WorkspaceRevisionResponse)
def meal_plan_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.post("/api/meal-plans/multi-day", response_model=MultiDayMealPlanResponse)
def create_multi_day_meal_plan(request: MultiDayMealPlanSaveRequest) -> MultiDayMealPlanResponse:
    def persist() -> MultiDayMealPlanResponse:
        return workspace_mutation.run(lambda: _create_multi_day_meal_plan(request))

    if not request.bundle_id:
        try:
            return persist()
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "multi_day_plan_persistence_unavailable",
                    "detail": "3일 식단을 저장하지 못했습니다. 기존 3일 계획과 workspace 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc
    with store.multi_day_plan_lock(request.bundle_id):
        try:
            return persist()
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            # PostgresStore.flush() reloads the winning workspace snapshot
            # before raising. A concurrent retry can therefore return the
            # already-persisted bundle instead of exposing a false conflict.
            existing = store.multi_day_meal_plans.get(request.bundle_id)
            if existing is None:
                raise
            if request.snapshot_hash and existing.snapshot_hash != request.snapshot_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 bundle_id에 다른 3일 식단 snapshot을 저장할 수 없습니다.")
            return existing
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "multi_day_plan_persistence_unavailable",
                    "detail": "3일 식단을 저장하지 못했습니다. 기존 3일 계획과 workspace 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


def _create_multi_day_meal_plan(request: MultiDayMealPlanSaveRequest) -> MultiDayMealPlanResponse:
    """Persist a user-approved multi-day preview as a workspace bundle."""
    if request.bundle_id:
        existing = store.multi_day_meal_plans.get(request.bundle_id)
        if existing is not None:
            if request.snapshot_hash and existing.snapshot_hash and request.snapshot_hash != existing.snapshot_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 bundle_id에 다른 3일 식단 snapshot을 저장할 수 없습니다.")
            return existing
    preview_request = MealPlanRequest(inventory_ids=request.inventory_ids, max_minutes=request.max_minutes, servings=request.servings)
    bundle = _build_multi_day_meal_plan(preview_request)
    if not bundle.days:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="저장할 3일 식단 후보가 없습니다.")
    if request.snapshot_hash and request.snapshot_hash != bundle.snapshot_hash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="3일 식단 snapshot이 미리보기와 달라졌습니다.")
    if request.bundle_id:
        bundle.id = request.bundle_id
    bundle.saved_at = datetime.now(timezone.utc)
    store.multi_day_meal_plans[bundle.id] = bundle
    return bundle


@app.get("/api/meal-plans/multi-day/latest", response_model=MultiDayMealPlanResponse | None)
def get_latest_multi_day_meal_plan() -> MultiDayMealPlanResponse | None:
    return max(
        store.multi_day_meal_plans.values(),
        key=lambda plan: plan.saved_at or datetime.min.replace(tzinfo=timezone.utc),
        default=None,
    )


@app.get("/api/meal-plans/multi-day/history", response_model=list[MultiDayMealPlanResponse])
def list_multi_day_meal_plan_history(limit: int = Query(default=20, ge=1, le=50)) -> list[MultiDayMealPlanResponse]:
    return sorted(
        store.multi_day_meal_plans.values(),
        key=lambda plan: plan.saved_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:limit]


def _resolve_multi_day_link(request: MealPlanRequest) -> MultiDayMealPlanDayResponse | None:
    if request.bundle_id is None and request.bundle_day_index is None:
        return None
    if request.bundle_id is None or request.bundle_day_index is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="bundle_id와 bundle_day_index를 함께 보내야 합니다.")
    bundle = store.multi_day_meal_plans.get(request.bundle_id)
    if bundle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연결할 3일 식단 bundle을 찾을 수 없습니다.")
    day = next((candidate for candidate in bundle.days if candidate.day_index == request.bundle_day_index), None)
    if day is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연결할 3일 식단 날짜를 찾을 수 없습니다.")
    if not request.recipe_id or day.plan.recipe_id != request.recipe_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="bundle 날짜와 선택한 레시피가 다릅니다.")
    if request.snapshot_hash and day.plan.snapshot_hash != request.snapshot_hash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="bundle 날짜 snapshot이 달라졌습니다.")
    if day.status == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 조리 완료된 bundle 날짜는 다시 저장할 수 없습니다.")
    if day.meal_plan_id is not None and request.plan_id != day.meal_plan_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="bundle 날짜에 이미 연결된 단일 식단이 있습니다.")
    return day


def _update_multi_day_day(
    *,
    bundle_id: str,
    day_index: int,
    status_value: Literal["planned", "saved", "completed"],
    meal_plan_id: str,
    completed_at: datetime | None = None,
) -> None:
    bundle = store.multi_day_meal_plans.get(bundle_id)
    if bundle is None:
        raise RuntimeError("linked multi-day bundle disappeared")
    day = next((candidate for candidate in bundle.days if candidate.day_index == day_index), None)
    if day is None:
        raise RuntimeError("linked multi-day day disappeared")
    if day.meal_plan_id is not None and day.meal_plan_id != meal_plan_id:
        raise RuntimeError("linked multi-day day belongs to another meal plan")
    day.status = status_value
    day.meal_plan_id = meal_plan_id
    if completed_at is not None:
        day.completed_at = completed_at


@app.post("/api/meal-plans", response_model=MealPlanResponse)
def create_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    def persist() -> MealPlanResponse:
        return workspace_mutation.run(lambda: _create_meal_plan(request))

    if not request.plan_id:
        try:
            return persist()
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "meal_plan_persistence_unavailable",
                    "detail": "식단을 저장하지 못했습니다. 기존 식단과 workspace 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc
    with store.meal_plan_lock(request.plan_id):
        try:
            return persist()
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            # The losing PostgreSQL process has reloaded the winner's
            # snapshot. Replay the same preview plan when all identity
            # guards still agree; unrelated writes remain a 409.
            existing = store.meal_plans.get(request.plan_id)
            if existing is None:
                raise
            if request.snapshot_hash and existing.snapshot_hash != request.snapshot_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 식단 snapshot을 저장할 수 없습니다.")
            if request.recipe_id and existing.recipe_id != request.recipe_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 레시피를 저장할 수 없습니다.")
            return existing
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "meal_plan_persistence_unavailable",
                    "detail": "식단을 저장하지 못했습니다. 기존 식단과 workspace 상태를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


def _create_meal_plan(request: MealPlanRequest) -> MealPlanResponse:
    """Calculate and persist the user's selected recipe plan."""
    linked_day = _resolve_multi_day_link(request)
    if request.plan_id:
        existing = store.meal_plans.get(request.plan_id)
        if existing is not None:
            if request.snapshot_hash and existing.snapshot_hash and request.snapshot_hash != existing.snapshot_hash:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 식단 snapshot을 저장할 수 없습니다.")
            if request.recipe_id and existing.recipe_id != request.recipe_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 레시피를 저장할 수 없습니다.")
            if linked_day is not None:
                if existing.bundle_id is not None and existing.bundle_id != request.bundle_id:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 3일 식단 bundle을 연결할 수 없습니다.")
                if existing.bundle_day_index is not None and existing.bundle_day_index != request.bundle_day_index:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 plan_id에 다른 3일 식단 날짜를 연결할 수 없습니다.")
                existing.bundle_id = request.bundle_id
                existing.bundle_day_index = request.bundle_day_index
                _update_multi_day_day(
                    bundle_id=request.bundle_id,
                    day_index=request.bundle_day_index,
                    status_value="saved",
                    meal_plan_id=existing.id,
                )
            return existing
    plan = _with_meal_plan_snapshot_hash(_build_meal_plan(request))
    if request.recipe_id and plan.recipe_id != request.recipe_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="선택한 레시피가 현재 재고 snapshot과 달라졌습니다.")
    if plan.recipe_id != "no-match":
        if request.snapshot_hash and request.snapshot_hash != plan.snapshot_hash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="식단 snapshot이 미리보기와 달라졌습니다.")
        if linked_day is not None:
            plan.bundle_id = request.bundle_id
            plan.bundle_day_index = request.bundle_day_index
        if request.plan_id:
            plan.id = request.plan_id
        plan.saved_at = datetime.now(timezone.utc)
        store.meal_plans[plan.id] = plan
        if linked_day is not None:
            _update_multi_day_day(
                bundle_id=request.bundle_id,
                day_index=request.bundle_day_index,
                status_value="saved",
                meal_plan_id=plan.id,
            )
        store.meal_plan_events.append(
            MealPlanAuditEventResponse(
                id=create_id("meal-event"),
                plan_id=plan.id,
                event_type="saved",
                occurred_at=plan.saved_at,
                snapshot_hash=plan.snapshot_hash,
            )
        )
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
    return normalize_unit(left) == normalize_unit(right)


def _plan_allocations(ingredient: MealIngredientResponse) -> list[tuple[str, float, str]]:
    if ingredient.allocations:
        return [(allocation.food_id, allocation.quantity, allocation.unit) for allocation in ingredient.allocations]
    if ingredient.available and ingredient.available_food_id:
        return [(ingredient.available_food_id, ingredient.amount, ingredient.unit)]
    return []


def _shopping_item_id(canonical_name: str, unit: str) -> str:
    key = f"{normalize_product_name(canonical_name)}::{unit.strip().casefold().replace(' ', '')}"
    return f"shopping-{sha256(key.encode('utf-8')).hexdigest()[:24]}"


def _shopping_shortage(ingredient: MealIngredientResponse) -> float:
    if ingredient.available:
        return 0
    if ingredient.available_quantity is not None and ingredient.available_unit and _same_quantity_unit(ingredient.available_unit, ingredient.unit):
        return round(max(0, ingredient.amount - ingredient.available_quantity), 3)
    return round(ingredient.amount, 3)


def _current_plan_for_shopping(plan: MealPlanResponse, selected_foods: list[FoodResponse] | None = None) -> MealPlanResponse | None:
    if plan.recipe_id == "no-match":
        return None
    foods = selected_foods if selected_foods is not None else [record.response.model_copy(deep=True) for record in store._sorted_foods()[:20]]
    if not foods:
        return None
    inventory_ids = [food.id for food in foods]
    current = _build_meal_plan(
        MealPlanRequest(
            inventory_ids=inventory_ids,
            max_minutes=plan.max_minutes,
            recipe_id=plan.recipe_id,
            servings=plan.servings,
        ),
        selected_foods=foods,
    )
    return current if current.recipe_id == plan.recipe_id else None


def _shopping_source_plans(source_type: Literal["meal_plan", "multi_day"], source_id: str) -> list[tuple[MealPlanResponse, int | None]]:
    if source_type == "meal_plan":
        plan = store.meal_plans.get(source_id)
        if plan is None or plan.saved_at is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 식단을 찾을 수 없습니다.")
        if plan.completed_at is not None:
            return []
        return [(plan, None)]
    bundle = store.multi_day_meal_plans.get(source_id)
    if bundle is None or bundle.saved_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 3일 식단을 찾을 수 없습니다.")
    return [(day.plan, day.day_index) for day in bundle.days if day.status != "completed"]


def _shopping_candidates(source_type: Literal["meal_plan", "multi_day"], source_id: str) -> dict[str, ShoppingListItemResponse]:
    candidates: dict[str, ShoppingListItemResponse] = {}
    now = datetime.now(timezone.utc)

    def add_plan_candidates(plan: MealPlanResponse, day_index: int | None, current: MealPlanResponse | None) -> None:
        current_by_name = {ingredient.canonical_name: ingredient for ingredient in current.ingredients} if current else {}
        for ingredient in plan.ingredients:
            if ingredient.available:
                continue
            effective = current_by_name.get(ingredient.canonical_name, ingredient)
            if effective.available:
                continue
            shortage = _shopping_shortage(effective)
            if shortage <= 0:
                continue
            item_id = _shopping_item_id(ingredient.canonical_name, ingredient.unit)
            source = ShoppingListSourceResponse(source_type=source_type, source_id=source_id, day_index=day_index, quantity=shortage)
            existing = candidates.get(item_id)
            if existing is None:
                candidates[item_id] = ShoppingListItemResponse(
                    id=item_id,
                    canonical_name=ingredient.canonical_name,
                    quantity=shortage,
                    unit=ingredient.unit,
                    sources=[source],
                    created_at=now,
                    updated_at=now,
                )
                continue
            matching_source = next((candidate for candidate in existing.sources if candidate.source_type == source_type and candidate.source_id == source_id and candidate.day_index == day_index), None)
            if matching_source is None:
                existing.sources.append(source)
            else:
                matching_source.quantity = shortage
            existing.quantity = round(sum(candidate.quantity for candidate in existing.sources), 3)
            existing.updated_at = now

    if source_type == "meal_plan":
        for plan, day_index in _shopping_source_plans(source_type, source_id):
            add_plan_candidates(plan, day_index, _current_plan_for_shopping(plan))
        return candidates

    bundle = store.multi_day_meal_plans.get(source_id)
    if bundle is None or bundle.saved_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 3일 식단을 찾을 수 없습니다.")
    working = [record.response.model_copy(deep=True) for record in store._sorted_foods()[:20]]
    for day in bundle.days:
        if day.status == "completed":
            continue
        current = _current_plan_for_shopping(day.plan, working)
        add_plan_candidates(day.plan, day.day_index, current)
        schedule = current if current is not None else day.plan
        for ingredient in schedule.ingredients:
            for food_id, quantity, unit in _plan_allocations(ingredient):
                for index, food in enumerate(working):
                    if food.id == food_id and _same_quantity_unit(food.unit, unit):
                        working[index] = food.model_copy(update={"quantity": round(max(0, food.quantity - quantity), 3)})
                        break
    return candidates


def _sorted_shopping_list() -> list[ShoppingListItemResponse]:
    return sorted(
        (item.model_copy(deep=True) for item in store.shopping_list.values()),
        key=lambda item: (item.checked, item.canonical_name, item.unit, item.id),
    )


def _sync_shopping_list(
    source_type: Literal["meal_plan", "multi_day"],
    source_id: str,
    *,
    persist: bool = True,
) -> ShoppingListMutationResponse:
    candidates = _shopping_candidates(source_type, source_id)
    now = datetime.now(timezone.utc)
    added_count = 0
    updated_count = 0
    removed_count = 0
    for item_id, current in list(store.shopping_list.items()):
        retained_sources = [source for source in current.sources if not (source.source_type == source_type and source.source_id == source_id)]
        candidate = candidates.get(item_id)
        new_sources = retained_sources + (candidate.sources if candidate is not None else [])
        if not new_sources:
            del store.shopping_list[item_id]
            removed_count += 1
            continue
        new_quantity = round(sum(source.quantity for source in new_sources), 3)
        if new_sources != current.sources or new_quantity != current.quantity:
            store.shopping_list[item_id] = current.model_copy(
                update={
                    "quantity": new_quantity,
                    "sources": new_sources,
                    "checked": current.checked if new_quantity == current.quantity else False,
                    "updated_at": now,
                }
            )
            updated_count += 1
        candidates.pop(item_id, None)
    for item_id, candidate in candidates.items():
        store.shopping_list[item_id] = candidate.model_copy(update={"updated_at": now})
        added_count += 1
    if persist:
        store.flush()
    return ShoppingListMutationResponse(
        items=_sorted_shopping_list(),
        added_count=added_count,
        updated_count=updated_count,
        removed_count=removed_count,
    )


def _reconcile_shopping_list_sources(*, persist: bool = True) -> None:
    sources = sorted({
        (source.source_type, source.source_id)
        for item in store.shopping_list.values()
        for source in item.sources
        if source.source_type != "manual"
    })
    for source_type, source_id in sources:
        _sync_shopping_list(source_type, source_id, persist=persist)


@app.get("/api/shopping-list", response_model=list[ShoppingListItemResponse])
def get_shopping_list() -> list[ShoppingListItemResponse]:
    try:
        def reconcile_and_read() -> list[ShoppingListItemResponse]:
            _reconcile_shopping_list_sources(persist=False)
            return _sorted_shopping_list()

        # Reconciliation is a derived read that still flushes source changes.
        # Two API processes can therefore race while warming the same list. A
        # bounded reload/retry adopts the winner's snapshot; it never merges
        # the stale request or loops indefinitely.
        for attempt in range(2):
            try:
                return workspace_mutation.run(reconcile_and_read)
            except ConcurrentWorkspaceWriteError:
                if attempt == 1:
                    raise
                store.refresh_workspace(current_workspace_id())
        raise RuntimeError("shopping list reconciliation retry exhausted")
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "shopping_list_persistence_unavailable",
                "detail": "장보기 목록을 동기화하지 못했습니다. 기존 목록을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.get("/api/shopping-list/revision", response_model=WorkspaceRevisionResponse)
def shopping_list_revision() -> WorkspaceRevisionResponse:
    return WorkspaceRevisionResponse(revision=store.workspace_revision)


@app.post("/api/shopping-list", response_model=ShoppingListMutationResponse)
def add_shopping_list(request: ShoppingListBuildRequest) -> ShoppingListMutationResponse:
    try:
        return workspace_mutation.run(
            lambda: _sync_shopping_list(request.source_type, request.source_id, persist=False)
        )
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "shopping_list_persistence_unavailable",
                "detail": "장보기 목록을 저장하지 못했습니다. 기존 목록을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


def _add_manual_shopping_list_item(
    request: ShoppingListManualItemRequest,
    *,
    persist: bool = True,
) -> ShoppingListMutationResponse:
    canonical_name = " ".join(request.canonical_name.strip().split())
    unit = " ".join(request.unit.strip().split())
    if not canonical_name or not unit:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="상품명과 단위를 입력해 주세요.")

    item_id = _shopping_item_id(canonical_name, unit)
    source_id = f"manual:{item_id}"
    quantity = round(request.quantity, 3)
    now = datetime.now(timezone.utc)
    source = ShoppingListSourceResponse(source_type="manual", source_id=source_id, quantity=quantity)
    current = store.shopping_list.get(item_id)
    if current is None:
        store.shopping_list[item_id] = ShoppingListItemResponse(
            id=item_id,
            canonical_name=canonical_name,
            quantity=quantity,
            unit=unit,
            checked=False,
            sources=[source],
            created_at=now,
            updated_at=now,
        )
        added_count = 1
        updated_count = 0
    else:
        retained_sources = [candidate.model_copy(deep=True) for candidate in current.sources if candidate.source_type != "manual"]
        new_sources = retained_sources + [source]
        new_quantity = round(sum(candidate.quantity for candidate in new_sources), 3)
        store.shopping_list[item_id] = current.model_copy(
            update={
                "quantity": new_quantity,
                "sources": new_sources,
                "checked": current.checked if new_quantity == current.quantity else False,
                "updated_at": now,
            }
        )
        added_count = 0
        updated_count = 1

    if persist:
        store.flush()
    return ShoppingListMutationResponse(
        items=_sorted_shopping_list(),
        added_count=added_count,
        updated_count=updated_count,
        removed_count=0,
    )


@app.post("/api/shopping-list/manual", response_model=ShoppingListMutationResponse)
def add_manual_shopping_list_item(request: ShoppingListManualItemRequest) -> ShoppingListMutationResponse:
    try:
        return workspace_mutation.run(
            lambda: _add_manual_shopping_list_item(request, persist=False)
        )
    except HTTPException:
        raise
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "shopping_list_persistence_unavailable",
                "detail": "장보기 목록을 저장하지 못했습니다. 기존 목록을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


def _shopping_receive_lot_id(item_id: str, idempotency_key: str) -> str:
    return operation_ledger.scoped_id("shopping-lot-idem", current_workspace_id(), item_id, idempotency_key)


def _shopping_receive_key_digest(idempotency_key: str) -> str:
    return operation_ledger.key_digest(idempotency_key)


def _shopping_receive_request_fingerprint(
    item_id: str,
    quantity: float,
    storage_type: StorageCode,
    storage_location_id: str | None = None,
) -> str:
    return operation_ledger.fingerprint(
        {
            "workspace_id": current_workspace_id(),
            "shopping_item_id": item_id,
            "quantity": f"{quantity:.3f}",
            "storage_type": storage_type,
            "storage_location_id": storage_location_id,
        }
    )


def _shopping_receive_payload_fingerprint(
    item_id: str,
    quantity: float,
    storage_type: StorageCode,
    storage_location_id: str | None = None,
) -> str:
    return operation_ledger.fingerprint(
        {
            "shopping_item_id": item_id,
            "quantity": f"{quantity:.3f}",
            "storage_type": storage_type,
            "storage_location_id": storage_location_id,
        }
    )


def _shopping_received_food(
    item: ShoppingListItemResponse,
    *,
    food_id: str,
    quantity: float,
    storage_type: StorageCode,
    storage_location_id: str | None,
    purchased_at: datetime,
) -> FoodResponse:
    image = "/assets/food/tomato.png"
    category = "기타"
    if "시금치" in item.canonical_name:
        image, category = "/assets/food/spinach.png", "채소"
    elif "두부" in item.canonical_name:
        image, category = "/assets/food/tofu.png", "두부·콩"
    elif "버섯" in item.canonical_name:
        image, category = "/assets/food/mushroom.png", "채소"
    elif "달걀" in item.canonical_name or "계란" in item.canonical_name:
        image, category = "/assets/food/eggs.png", "달걀"
    elif "우유" in item.canonical_name:
        image, category = "/assets/food/milk.png", "유제품"

    inference = infer_priority(
        PriorityInferenceRequest(
            product_name=item.canonical_name,
            storage_type=storage_type,
            reference_date=purchased_at.date(),
        )
    )
    estimate = None
    if inference.estimated_use_first_window is not None:
        estimate = (
            inference.estimated_use_first_window.start_date,
            inference.estimated_use_first_window.end_date,
            inference.storage_confidence,
        )
    storage_label = {"refrigerated": "냉장", "frozen": "냉동", "ambient": "실온"}[storage_type]
    food = _food(
        food_id,
        item.canonical_name,
        "장보기에서 추가한 식품",
        quantity,
        item.unit,
        storage_type,
        "unknown",
        None,
        "unknown",
        f"장보기 구매 · {storage_label} 보관 기준",
        1,
        category,
        image,
        "소비기한은 포장지에서 확인해 주세요. 구매일과 AI 소비 우선순위만 기록했어요.",
        estimate=estimate,
        inference=inference,
        confidence=inference.storage_confidence,
        storage_location_id=storage_location_id,
    )
    food.purchased_at = purchased_at
    return food


def _shopping_receive_operation_for_request(
    *,
    idempotent_lot_id: str | None,
    item_id: str,
    key_digest: str | None,
) -> ShoppingListReceiveOperation | None:
    if not idempotent_lot_id:
        return None
    operation = store.shopping_receive_operations.get(idempotent_lot_id)
    if operation is None and key_digest is not None:
        operation = next(
            (
                candidate
                for candidate in store.shopping_receive_operations.values()
                if candidate.shopping_item_id == item_id and candidate.idempotency_key_digest == key_digest
            ),
            None,
        )
    return operation


def _shopping_receive_replay_response(
    *,
    operation: ShoppingListReceiveOperation,
    item_id: str,
    received_quantity: float,
    storage_type: StorageCode,
    storage_location_id: str | None,
    request_fingerprint: str | None,
    payload_fingerprint: str | None,
    key_digest: str | None,
    http_response: Response,
) -> ShoppingListReceiveResponse:
    if (
        operation.shopping_item_id != item_id
        or (
            operation.request_fingerprint != request_fingerprint
            and operation.request_payload_fingerprint != payload_fingerprint
        )
        or (operation.idempotency_key_digest is not None and operation.idempotency_key_digest != key_digest)
        or abs(operation.quantity - received_quantity) > 1e-9
        or operation.storage_type != storage_type
        or operation.storage_location_id != storage_location_id
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 입고 내용을 요청할 수 없습니다.")
    existing_lot = store.foods.get(operation.food_id)
    if existing_lot is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 처리된 입고 기록의 lot이 없어 같은 Idempotency-Key를 다시 반영할 수 없습니다.",
        )
    http_response.headers["X-Idempotency-Replayed"] = "true"
    return ShoppingListReceiveResponse(
        shopping_item_id=item_id,
        received_quantity=operation.quantity,
        inventory_lot=existing_lot.response.model_copy(deep=True),
        items=_sorted_shopping_list(),
        idempotency_replayed=True,
    )


@app.post("/api/shopping-list/{item_id}/receive", response_model=ShoppingListReceiveResponse, status_code=status.HTTP_201_CREATED)
def receive_shopping_list_item(
    http_request: Request,
    http_response: Response,
    item_id: str,
    request: ShoppingListReceiveRequest,
) -> ShoppingListReceiveResponse:
    idempotency_key = _request_idempotency_key(http_request)
    received_quantity = round(request.quantity, 3)
    idempotent_lot_id = _shopping_receive_lot_id(item_id, idempotency_key) if idempotency_key else None
    request_fingerprint = (
        _shopping_receive_request_fingerprint(item_id, received_quantity, request.storage_type, request.storage_location_id)
        if idempotency_key
        else None
    )
    key_digest = _shopping_receive_key_digest(idempotency_key) if idempotency_key else None
    payload_fingerprint = (
        _shopping_receive_payload_fingerprint(item_id, received_quantity, request.storage_type, request.storage_location_id)
        if idempotency_key
        else None
    )

    with store.mutation_lock():
        _validate_storage_location_for_store(store, request.storage_location_id, request.storage_type)
        if idempotent_lot_id:
            operation = _shopping_receive_operation_for_request(
                idempotent_lot_id=idempotent_lot_id,
                item_id=item_id,
                key_digest=key_digest,
            )
            if operation is not None:
                return _shopping_receive_replay_response(
                    operation=operation,
                    item_id=item_id,
                    received_quantity=received_quantity,
                    storage_type=request.storage_type,
                    storage_location_id=request.storage_location_id,
                    request_fingerprint=request_fingerprint,
                    payload_fingerprint=payload_fingerprint,
                    key_digest=key_digest,
                    http_response=http_response,
                )

            existing_lot = store.foods.get(idempotent_lot_id)
            if existing_lot is not None:
                current_item = store.shopping_list.get(item_id)
                if current_item is not None and (
                    existing_lot.response.canonical_name != current_item.canonical_name
                    or existing_lot.response.unit != current_item.unit
                ):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 장보기 항목을 반영할 수 없습니다.")
                if (
                    abs(existing_lot.response.quantity - received_quantity) > 1e-9
                    or existing_lot.response.storage_type != request.storage_type
                    or existing_lot.response.storage_location_id != request.storage_location_id
                ):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="같은 Idempotency-Key로 다른 입고 내용을 요청할 수 없습니다.")

                def recover_operation() -> ShoppingListReceiveResponse:
                    store.shopping_receive_operations[idempotent_lot_id] = ShoppingListReceiveOperation(
                        id=idempotent_lot_id,
                        shopping_item_id=item_id,
                        food_id=existing_lot.response.id,
                        canonical_name=existing_lot.response.canonical_name,
                        unit=existing_lot.response.unit,
                        quantity=existing_lot.response.quantity,
                        storage_type=existing_lot.response.storage_type,
                        storage_location_id=existing_lot.response.storage_location_id,
                        request_fingerprint=request_fingerprint,
                        idempotency_key_digest=key_digest,
                        request_payload_fingerprint=payload_fingerprint,
                        occurred_at=existing_lot.purchased_at or datetime.now(timezone.utc),
                    )
                    return ShoppingListReceiveResponse(
                        shopping_item_id=item_id,
                        received_quantity=existing_lot.response.quantity,
                        inventory_lot=existing_lot.response.model_copy(deep=True),
                        items=_sorted_shopping_list(),
                        idempotency_replayed=True,
                    )

                try:
                    recovered = workspace_mutation.run(recover_operation)
                except ConcurrentWorkspaceWriteError:
                    winner = _shopping_receive_operation_for_request(
                        idempotent_lot_id=idempotent_lot_id,
                        item_id=item_id,
                        key_digest=key_digest,
                    )
                    if winner is None:
                        raise
                    return _shopping_receive_replay_response(
                        operation=winner,
                        item_id=item_id,
                        received_quantity=received_quantity,
                        storage_type=request.storage_type,
                        storage_location_id=request.storage_location_id,
                        request_fingerprint=request_fingerprint,
                        payload_fingerprint=payload_fingerprint,
                        key_digest=key_digest,
                        http_response=http_response,
                    )
                except HTTPException:
                    raise
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail={
                            "code": "shopping_receive_persistence_unavailable",
                            "detail": "장보기 입고 중복 방지 기록을 저장하지 못했습니다. 기존 목록을 유지했어요.",
                            "retryable": True,
                            "action": "retry_later",
                        },
                    ) from exc
                http_response.headers["X-Idempotency-Replayed"] = "true"
                return recovered

        item = store.shopping_list.get(item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="장보기 항목을 찾을 수 없습니다.")

        planned_sources_before = {
            (source.source_type, source.source_id, source.day_index)
            for source in item.sources
            if source.source_type != "manual"
        }
        original_quantity = item.quantity

        def mutate() -> ShoppingListReceiveResponse:
            purchased_at = datetime.now(timezone.utc)
            food_id = idempotent_lot_id or create_id("shopping-lot")
            food = _shopping_received_food(
                item,
                food_id=food_id,
                quantity=received_quantity,
                storage_type=request.storage_type,
                storage_location_id=request.storage_location_id,
                purchased_at=purchased_at,
            )
            _inventory_authority(store).create_manual_lot(food, purchased_at=purchased_at)

            # The new lot must participate in the same request's shortage
            # recalculation. ``persist=False`` keeps the food + shopping mutation
            # in one final durable flush below.
            _reconcile_shopping_list_sources(persist=False)
            remaining_item = store.shopping_list.get(item_id)
            if remaining_item is not None and received_quantity >= original_quantity - 1e-9:
                remaining_item.checked = True
                remaining_item.updated_at = purchased_at
            if idempotent_lot_id:
                store.shopping_receive_operations[idempotent_lot_id] = ShoppingListReceiveOperation(
                    id=idempotent_lot_id,
                    shopping_item_id=item_id,
                    food_id=food.id,
                    canonical_name=food.canonical_name,
                    unit=food.unit,
                    quantity=food.quantity,
                    storage_type=food.storage_type,
                    storage_location_id=food.storage_location_id,
                    request_fingerprint=request_fingerprint,
                    idempotency_key_digest=key_digest,
                    request_payload_fingerprint=payload_fingerprint,
                    occurred_at=purchased_at,
                )
            store.reprioritize(persist=False)

            planned_sources_after = {
                (source.source_type, source.source_id, source.day_index)
                for current in store.shopping_list.values()
                for source in current.sources
                if current.id == item_id and source.source_type != "manual"
            }
            return ShoppingListReceiveResponse(
                shopping_item_id=item_id,
                received_quantity=food.quantity,
                inventory_lot=food,
                items=_sorted_shopping_list(),
                removed_planned_source_count=len(planned_sources_before - planned_sources_after),
            )

        try:
            return workspace_mutation.run(mutate)
        except InventoryInvariantError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            # PostgresStore reloads the newest workspace snapshot before raising.
            # If another process won the same idempotency key, turn that expected
            # race into the normal replay response instead of exposing a false
            # generic workspace conflict to the client. Unrelated concurrent
            # writes still propagate to the global 409 handler.
            operation = _shopping_receive_operation_for_request(
                idempotent_lot_id=idempotent_lot_id,
                item_id=item_id,
                key_digest=key_digest,
            )
            if operation is not None:
                return _shopping_receive_replay_response(
                    operation=operation,
                    item_id=item_id,
                    received_quantity=received_quantity,
                    storage_type=request.storage_type,
                    storage_location_id=request.storage_location_id,
                    request_fingerprint=request_fingerprint,
                    payload_fingerprint=payload_fingerprint,
                    key_digest=key_digest,
                    http_response=http_response,
                )
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "shopping_receive_persistence_unavailable",
                    "detail": "장보기 항목을 재고에 반영하지 못했습니다. 기존 목록과 재고를 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


@app.patch("/api/shopping-list/{item_id}", response_model=ShoppingListItemResponse)
def update_shopping_list_item(item_id: str, request: ShoppingListItemUpdateRequest) -> ShoppingListItemResponse:
    item = store.shopping_list.get(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="장보기 항목을 찾을 수 없습니다.")

    def mutate() -> ShoppingListItemResponse:
        item.checked = request.checked
        item.updated_at = datetime.now(timezone.utc)
        return item.model_copy(deep=True)

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "shopping_list_item_persistence_unavailable",
                "detail": "장보기 항목 상태를 저장하지 못했습니다. 기존 상태를 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.delete("/api/shopping-list/{item_id}", response_model=dict[str, bool])
def delete_shopping_list_item(item_id: str) -> dict[str, bool]:
    if item_id not in store.shopping_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="장보기 항목을 찾을 수 없습니다.")

    def mutate() -> dict[str, bool]:
        del store.shopping_list[item_id]
        return {"removed": True}

    try:
        return workspace_mutation.run(mutate)
    except ConcurrentWorkspaceWriteError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "shopping_list_item_persistence_unavailable",
                "detail": "장보기 항목을 삭제하지 못했습니다. 기존 목록을 유지했어요.",
                "retryable": True,
                "action": "retry_later",
            },
        ) from exc


@app.post("/api/meal-plans/{plan_id}/complete", response_model=MealPlanCompletionResponse)
def complete_meal_plan(plan_id: str, request: MealPlanCompletionRequest) -> MealPlanCompletionResponse:
    with store.meal_plan_lock(plan_id):
        try:
            return workspace_mutation.run(lambda: _complete_meal_plan_locked(plan_id, request))
        except HTTPException:
            raise
        except ConcurrentWorkspaceWriteError:
            # A competing PostgreSQL process may have completed the plan
            # first. Its flush reloads the winner before raising, so the
            # retry is safe to expose as the normal already-completed result.
            latest = store.meal_plans.get(plan_id)
            if latest is None or latest.completed_at is None:
                raise
            return _meal_plan_completed_response(latest)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "meal_plan_completion_persistence_unavailable",
                    "detail": "식단 완료를 저장하지 못했습니다. 기존 재고와 식단을 유지했어요.",
                    "retryable": True,
                    "action": "retry_later",
                },
            ) from exc


def _meal_plan_completed_response(plan: MealPlanResponse) -> MealPlanCompletionResponse:
    existing_event_statuses = [
        event.grocy_sync_status
        for event in store.storage_events
        if event.meal_plan_id == plan.id
    ]
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
        grocy_sync_status=_aggregate_grocy_sync_status(existing_event_statuses),
    )


def _complete_meal_plan_locked(plan_id: str, request: MealPlanCompletionRequest) -> MealPlanCompletionResponse:
    plan = store.meal_plans.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 식단을 찾을 수 없습니다.")
    if plan.completed_at is not None:
        return _meal_plan_completed_response(plan)

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

    consumed_food_ids: list[str] = []
    consumed_allocations: list[MealIngredientAllocationResponse] = []
    skipped_ingredients: list[MealPlanSkippedIngredientResponse] = []
    grocy_sync_statuses: list[GrocySyncStatus] = []
    inventory = _inventory_authority(store)
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

        for food_id, allocation_quantity, _record in allocation_records:
            mutation = inventory.apply_storage_event(
                food_id=food_id,
                event_type="consumed",
                quantity=allocation_quantity,
            )
            storage_event = StorageEventResponse(
                id=create_id("event"),
                food_id=food_id,
                event_type="consumed",
                from_storage_type=mutation.from_storage_type,
                to_storage_type=None,
                quantity=mutation.event_quantity,
                occurred_at=datetime.now(timezone.utc),
                meal_plan_id=plan.id,
            )
            store.storage_events.append(storage_event)
            storage_event.grocy_sync_status = _queue_grocy_storage_sync(
                event=storage_event,
                canonical_name=mutation.canonical_name,
                quantity=mutation.event_quantity,
                unit=mutation.unit,
            )
            grocy_sync_statuses.append(storage_event.grocy_sync_status)
            consumed_food_ids.append(food_id)
            consumed_allocations.append(MealIngredientAllocationResponse(food_id=food_id, quantity=allocation_quantity, unit=allocation_unit))

    if not consumed_food_ids:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="현재 재고가 바뀌어 조리 완료를 기록할 수 없습니다.")

    completed_at = datetime.now(timezone.utc)
    plan.completed_at = completed_at
    plan.consumed_food_ids = consumed_food_ids
    plan.consumed_allocations = consumed_allocations
    plan.completed_skipped_ingredients = [item.canonical_name for item in skipped_ingredients]
    store.meal_plans[plan_id] = plan
    if plan.bundle_id is not None and plan.bundle_day_index is not None:
        _update_multi_day_day(
            bundle_id=plan.bundle_id,
            day_index=plan.bundle_day_index,
            status_value="completed",
            meal_plan_id=plan.id,
            completed_at=completed_at,
        )
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
    store.reprioritize(persist=False)

    return MealPlanCompletionResponse(
        plan_id=plan.id,
        status="completed",
        completed_at=plan.completed_at,
        consumed_food_ids=consumed_food_ids,
        consumed_allocations=consumed_allocations,
        skipped_ingredients=skipped_ingredients,
        grocy_sync_status=_aggregate_grocy_sync_status(grocy_sync_statuses),
    )
