from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from hashlib import sha256
import json
import sqlite3
from threading import RLock
from typing import Literal
from typing import TypeVar

from pydantic import BaseModel, ConfigDict, Field

from .planner import RecipeIngredient, RecipeSpec
from .recipe_importer import CookRcpRecipeDraft


T = TypeVar("T")


class RecipeDraftIngredient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_text: str = Field(min_length=1, max_length=320)
    parsed_name: str | None = Field(default=None, max_length=160)
    parsed_amount: float | None = Field(default=None, ge=0)
    parsed_unit: str | None = Field(default=None, max_length=30)
    canonical_name: str | None = Field(default=None, max_length=160)
    canonical_amount: float | None = Field(default=None, gt=0)
    canonical_unit: str | None = Field(default=None, max_length=30)
    review_status: Literal["pending", "approved", "rejected"] = "pending"


class RecipeDraftRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    source_id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    cooking_method: str | None = Field(default=None, max_length=80)
    ingredients: list[RecipeDraftIngredient] = Field(default_factory=list, max_length=100)
    steps: list[str] = Field(default_factory=list, max_length=20)
    image_url: str | None = Field(default=None, max_length=2_000)
    source_name: str = Field(min_length=1, max_length=160)
    source_url: str = Field(min_length=1, max_length=2_000)
    license: str = Field(min_length=1, max_length=160)
    source_revision: str = Field(min_length=1, max_length=160)
    retrieved_at: datetime
    status: Literal["pending", "approved", "rejected"] = "pending"
    reviewer_note: str = Field(default="", max_length=1_000)
    safety_note: str | None = Field(default=None, max_length=500)
    estimated_minutes: int | None = Field(default=None, ge=5, le=180)
    created_at: datetime
    updated_at: datetime
    approved_at: datetime | None = None
    # Review ownership is stored inside the shared catalog payload so older
    # drafts remain readable without a destructive migration. An expired
    # claim is recoverable by the next explicit claim action.
    claimed_by: str | None = Field(default=None, max_length=160)
    claimed_by_email: str | None = Field(default=None, max_length=254)
    claimed_at: datetime | None = None
    claim_expires_at: datetime | None = None


class RecipeReviewAuditEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=96)
    draft_id: str = Field(min_length=1, max_length=96)
    action: Literal["imported", "updated", "approved", "rejected", "claimed", "released"]
    actor_id: str = Field(min_length=1, max_length=160)
    actor_email: str | None = Field(default=None, max_length=254)
    occurred_at: datetime
    before_status: Literal["pending", "approved", "rejected"] | None = None
    after_status: Literal["pending", "approved", "rejected"] | None = None
    changed_fields: list[str] = Field(default_factory=list, max_length=50)
    draft_snapshot_hash: str = Field(min_length=64, max_length=64)


class RecipeCatalogConcurrentWriteError(RuntimeError):
    """Raised when another process wins the shared catalog revision."""

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


RecipeCatalogSnapshot = tuple[dict[str, RecipeDraftRecord], list[RecipeReviewAuditEvent], int, str]


def draft_id_for(source_revision: str, source_id: str) -> str:
    key = f"{source_revision}\x00{source_id}".encode("utf-8")
    return f"recipe-draft-{sha256(key).hexdigest()[:16]}"


def draft_snapshot_hash(draft: RecipeDraftRecord) -> str:
    canonical = json.dumps(draft.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


def draft_from_cookrcp(source: CookRcpRecipeDraft, *, now: datetime | None = None) -> RecipeDraftRecord:
    timestamp = now or datetime.now(timezone.utc)
    return RecipeDraftRecord(
        id=draft_id_for(source.source_revision, source.source_id),
        source_id=source.source_id,
        title=source.title,
        category=source.category,
        cooking_method=source.cooking_method,
        ingredients=[
            RecipeDraftIngredient(
                raw_text=ingredient.raw_text,
                parsed_name=ingredient.parsed_name,
                parsed_amount=ingredient.amount,
                parsed_unit=ingredient.unit,
            )
            for ingredient in source.ingredients
        ],
        steps=list(source.steps),
        image_url=source.image_url,
        source_name=source.source_name,
        source_url=source.source_url,
        license=source.license,
        source_revision=source.source_revision,
        retrieved_at=_parse_datetime(source.retrieved_at),
        created_at=timestamp,
        updated_at=timestamp,
    )


def approved_recipe_spec(draft: RecipeDraftRecord) -> RecipeSpec | None:
    if draft.status != "approved" or not draft.safety_note or draft.estimated_minutes is None:
        return None
    if not draft.ingredients or any(
        ingredient.review_status != "approved"
        or not ingredient.canonical_name
        or ingredient.canonical_amount is None
        or not ingredient.canonical_unit
        for ingredient in draft.ingredients
    ):
        return None
    ingredients = tuple(
        RecipeIngredient(
            canonical_name=ingredient.canonical_name or "",
            amount=ingredient.canonical_amount or 0,
            unit=ingredient.canonical_unit or "",
            aliases=tuple(
                alias
                for alias in (ingredient.parsed_name,)
                if alias and alias != ingredient.canonical_name
            ),
        )
        for ingredient in draft.ingredients
    )
    return RecipeSpec(
        id=f"catalog-{draft.id}",
        title=draft.title,
        minutes=draft.estimated_minutes,
        ingredients=ingredients,
        steps=tuple(draft.steps),
        safety_note=draft.safety_note,
        source="recipe_catalog",
        source_name=draft.source_name,
        source_url=draft.source_url,
        license=draft.license,
        source_revision=draft.source_revision,
    )


def approved_recipe_specs(drafts: list[RecipeDraftRecord]) -> tuple[RecipeSpec, ...]:
    specs = [spec for draft in drafts if (spec := approved_recipe_spec(draft)) is not None]
    return tuple(sorted(specs, key=lambda item: item.id))


def approval_issues(draft: RecipeDraftRecord, *, license_confirmed: bool) -> list[str]:
    issues: list[str] = []
    if not license_confirmed:
        issues.append("public source 이용조건과 이미지 재사용 권한을 확인해야 합니다.")
    if not draft.title.strip():
        issues.append("제목이 없습니다.")
    if not draft.steps:
        issues.append("조리 단계가 없습니다.")
    if draft.estimated_minutes is None:
        issues.append("운영자가 예상 조리시간(5~180분)을 입력해야 합니다.")
    if not draft.ingredients:
        issues.append("재료가 없습니다.")
    if not draft.safety_note or not draft.safety_note.strip():
        issues.append("안전 메모를 입력해야 합니다.")
    for index, ingredient in enumerate(draft.ingredients):
        if ingredient.review_status != "approved":
            issues.append(f"재료 {index + 1}의 review 상태가 approved가 아닙니다.")
        if not ingredient.canonical_name:
            issues.append(f"재료 {index + 1}의 canonical name이 없습니다.")
        if ingredient.canonical_amount is None or ingredient.canonical_amount <= 0:
            issues.append(f"재료 {index + 1}의 canonical 수량이 없습니다.")
        if not ingredient.canonical_unit:
            issues.append(f"재료 {index + 1}의 canonical 단위가 없습니다.")
    return issues


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


class SharedRecipeCatalogStore:
    """Shared recipe catalog repository, separate from user inventory workspaces."""

    def __init__(self, *, sqlite_connection: sqlite3.Connection | None = None, postgres_connection=None, lock: RLock | None = None, initialize_schema: bool = True) -> None:
        if sqlite_connection is not None and postgres_connection is not None:
            raise ValueError("recipe catalog는 SQLite 또는 PostgreSQL 중 하나만 사용해야 합니다.")
        self._sqlite_connection = sqlite_connection
        self._postgres_connection = postgres_connection
        self._lock = lock or RLock()
        self.drafts: dict[str, RecipeDraftRecord] = {}
        self.review_events: list[RecipeReviewAuditEvent] = []
        self._revision = 0
        self._persisted_fingerprint = ""
        if initialize_schema:
            self._initialize_schema()
        self._load()

    def _initialize_schema(self) -> None:
        if self._sqlite_connection is not None:
            self._sqlite_connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS recipe_catalog_drafts (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS recipe_catalog_review_events (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS recipe_catalog_revisions (
                    id TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO recipe_catalog_revisions (id, revision) VALUES ('catalog', 0);
                """
            )
            self._sqlite_connection.commit()
            return
        if self._postgres_connection is not None:
            with self._postgres_connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_drafts (
                        id text PRIMARY KEY,
                        payload jsonb NOT NULL,
                        updated_at timestamptz NOT NULL DEFAULT now()
                    );
                        CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_review_events (
                            id text PRIMARY KEY,
                            payload jsonb NOT NULL,
                            created_at timestamptz NOT NULL DEFAULT now()
                        );
                        CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_revisions (
                            id text PRIMARY KEY,
                            revision bigint NOT NULL DEFAULT 0,
                            updated_at timestamptz NOT NULL DEFAULT now()
                        );
                        INSERT INTO rescue_recipe_catalog_revisions (id, revision)
                        VALUES ('catalog', 0)
                        ON CONFLICT (id) DO NOTHING;
                        """
                )
            self._postgres_connection.commit()

    def _load(self) -> None:
        with self._lock:
            if self._sqlite_connection is not None:
                self.drafts = {
                    row["id"]: RecipeDraftRecord.model_validate(json.loads(row["payload"]))
                    for row in self._sqlite_connection.execute("SELECT id, payload FROM recipe_catalog_drafts")
                }
                self.review_events = [
                    RecipeReviewAuditEvent.model_validate(json.loads(row["payload"]))
                    for row in self._sqlite_connection.execute("SELECT id, payload FROM recipe_catalog_review_events ORDER BY rowid")
                ]
                revision_row = self._sqlite_connection.execute(
                    "SELECT revision FROM recipe_catalog_revisions WHERE id = 'catalog'"
                ).fetchone()
                self._revision = int(revision_row["revision"]) if revision_row else 0
                self._persisted_fingerprint = self._state_fingerprint()
                return
            if self._postgres_connection is not None:
                try:
                    with self._postgres_connection.cursor() as cursor:
                        cursor.execute("SELECT id, payload FROM rescue_recipe_catalog_drafts")
                        self.drafts = {
                            draft_id: RecipeDraftRecord.model_validate(payload if isinstance(payload, dict) else json.loads(str(payload)))
                            for draft_id, payload in cursor.fetchall()
                        }
                        cursor.execute("SELECT id, payload FROM rescue_recipe_catalog_review_events ORDER BY created_at, id")
                        self.review_events = [
                            RecipeReviewAuditEvent.model_validate(payload if isinstance(payload, dict) else json.loads(str(payload)))
                            for _, payload in cursor.fetchall()
                        ]
                        cursor.execute("SELECT revision FROM rescue_recipe_catalog_revisions WHERE id = 'catalog'")
                        revision_row = cursor.fetchone()
                        self._revision = int(revision_row[0]) if revision_row else 0
                finally:
                    # A catalog load is an independent read. End psycopg's
                    # implicit transaction so the shared connection does not
                    # retain an idle snapshot after application startup.
                    self._postgres_connection.rollback()
                self._persisted_fingerprint = self._state_fingerprint()
                return
            self._persisted_fingerprint = self._state_fingerprint()

    def _state_fingerprint(self) -> str:
        canonical = json.dumps(
            {
                "drafts": {
                    draft_id: draft.model_dump(mode="json")
                    for draft_id, draft in sorted(self.drafts.items())
                },
                "review_events": [event.model_dump(mode="json") for event in self.review_events],
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return sha256(canonical.encode("utf-8")).hexdigest()

    def snapshot(self) -> RecipeCatalogSnapshot:
        with self._lock:
            return (
                {draft_id: draft.model_copy(deep=True) for draft_id, draft in self.drafts.items()},
                [event.model_copy(deep=True) for event in self.review_events],
                self._revision,
                self._persisted_fingerprint,
            )

    def restore(self, snapshot: RecipeCatalogSnapshot) -> None:
        drafts, review_events, revision, persisted_fingerprint = snapshot
        with self._lock:
            self.drafts = drafts
            self.review_events = review_events
            self._revision = revision
            self._persisted_fingerprint = persisted_fingerprint

    def _persist(self) -> None:
        with self._lock:
            current_fingerprint = self._state_fingerprint()
            if current_fingerprint == self._persisted_fingerprint:
                return
            if self._sqlite_connection is not None:
                with self._sqlite_connection:
                    revision_row = self._sqlite_connection.execute(
                        "SELECT revision FROM recipe_catalog_revisions WHERE id = 'catalog'"
                    ).fetchone()
                    if revision_row is None:
                        raise RuntimeError("recipe catalog revision row is missing")
                    current_revision = int(revision_row["revision"])
                    if current_revision != self._revision:
                        raise RecipeCatalogConcurrentWriteError(
                            "shared recipe catalog revision changed",
                            expected_revision=self._revision,
                            current_revision=current_revision,
                        )
                    self._sqlite_connection.executemany(
                        "INSERT INTO recipe_catalog_drafts (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                        [(draft_id, json.dumps(draft.model_dump(mode="json"), ensure_ascii=False)) for draft_id, draft in self.drafts.items()],
                    )
                    self._sqlite_connection.executemany(
                        "INSERT OR IGNORE INTO recipe_catalog_review_events (id, payload) VALUES (?, ?)",
                        [(event.id, json.dumps(event.model_dump(mode="json"), ensure_ascii=False)) for event in self.review_events],
                    )
                    cursor = self._sqlite_connection.execute(
                        "UPDATE recipe_catalog_revisions SET revision = revision + 1 WHERE id = 'catalog' AND revision = ?",
                        (current_revision,),
                    )
                    if cursor.rowcount != 1:
                        raise RecipeCatalogConcurrentWriteError(
                            "shared recipe catalog revision changed during write",
                            expected_revision=self._revision,
                            current_revision=current_revision + 1,
                        )
                    next_revision = current_revision + 1
                self._revision = next_revision
                self._persisted_fingerprint = current_fingerprint
                return
            if self._postgres_connection is not None:
                from psycopg.types.json import Jsonb

                try:
                    with self._postgres_connection.cursor() as cursor:
                        cursor.execute(
                            "SELECT revision FROM rescue_recipe_catalog_revisions WHERE id = 'catalog' FOR UPDATE"
                        )
                        revision_row = cursor.fetchone()
                        if revision_row is None:
                            raise RuntimeError("recipe catalog revision row is missing")
                        current_revision = int(revision_row[0])
                        if current_revision != self._revision:
                            raise RecipeCatalogConcurrentWriteError(
                                "shared recipe catalog revision changed",
                                expected_revision=self._revision,
                                current_revision=current_revision,
                            )
                        cursor.executemany(
                            "INSERT INTO rescue_recipe_catalog_drafts (id, payload) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
                            [(draft_id, Jsonb(draft.model_dump(mode="json"))) for draft_id, draft in self.drafts.items()],
                        )
                        cursor.executemany(
                            "INSERT INTO rescue_recipe_catalog_review_events (id, payload) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                            [(event.id, Jsonb(event.model_dump(mode="json"))) for event in self.review_events],
                        )
                        cursor.execute(
                            "UPDATE rescue_recipe_catalog_revisions SET revision = revision + 1, updated_at = now() WHERE id = 'catalog' AND revision = %s RETURNING revision",
                            (current_revision,),
                        )
                        next_revision_row = cursor.fetchone()
                        if next_revision_row is None:
                            raise RecipeCatalogConcurrentWriteError(
                                "shared recipe catalog revision changed during write",
                                expected_revision=self._revision,
                                current_revision=current_revision + 1,
                            )
                        next_revision = int(next_revision_row[0])
                    self._postgres_connection.commit()
                    self._revision = next_revision
                    self._persisted_fingerprint = current_fingerprint
                except RecipeCatalogConcurrentWriteError:
                    self._postgres_connection.rollback()
                    raise
                except Exception:
                    self._postgres_connection.rollback()
                    raise
                return
            self._revision += 1
            self._persisted_fingerprint = current_fingerprint

    def flush(self) -> None:
        self._persist()

    @property
    def revision(self) -> int:
        return self._revision

    def refresh(self) -> None:
        self._load()

    def reset(self) -> None:
        with self._lock:
            self.drafts.clear()
            self.review_events.clear()
            if self._sqlite_connection is not None:
                with self._sqlite_connection:
                    self._sqlite_connection.execute("DELETE FROM recipe_catalog_drafts")
                    self._sqlite_connection.execute("DELETE FROM recipe_catalog_review_events")
                    self._sqlite_connection.execute("UPDATE recipe_catalog_revisions SET revision = 0 WHERE id = 'catalog'")
                self._revision = 0
            elif self._postgres_connection is not None:
                try:
                    with self._postgres_connection.cursor() as cursor:
                        cursor.execute("DELETE FROM rescue_recipe_catalog_drafts")
                        cursor.execute("DELETE FROM rescue_recipe_catalog_review_events")
                        cursor.execute("UPDATE rescue_recipe_catalog_revisions SET revision = 0, updated_at = now() WHERE id = 'catalog'")
                    self._postgres_connection.commit()
                    self._revision = 0
                except Exception:
                    self._postgres_connection.rollback()
                    raise
            else:
                self._revision = 0
            self._persisted_fingerprint = self._state_fingerprint()

    def upsert_recipe_draft(self, draft: RecipeDraftRecord) -> RecipeDraftRecord:
        with self._lock:
            existing = self.drafts.get(draft.id)
            if existing is not None:
                return existing
            self.drafts[draft.id] = draft
            return draft

    def record_recipe_review_event(self, event: RecipeReviewAuditEvent, *, persist: bool = True) -> None:
        with self._lock:
            self.review_events.append(event)
            if persist:
                self.flush()

    def approved_recipe_specs(self) -> tuple[RecipeSpec, ...]:
        return approved_recipe_specs(list(self.drafts.values()))


class RecipeCatalogMutation:
    """Run one shared-catalog draft/audit mutation with rollback semantics."""

    def __init__(self, store: SharedRecipeCatalogStore) -> None:
        self._store = store

    def run(self, mutation: Callable[[], T], *, expected_revision: int | None = None) -> T:
        with self._store._lock:
            snapshot = self._store.snapshot()
            if expected_revision is not None and expected_revision != self._store.revision:
                self._store.refresh()
                raise RecipeCatalogConcurrentWriteError(
                    "client recipe catalog revision is stale",
                    expected_revision=expected_revision,
                    current_revision=self._store.revision,
                )
            try:
                result = mutation()
                self._store.flush()
                return result
            except RecipeCatalogConcurrentWriteError:
                self._store.refresh()
                raise
            except Exception:
                self._store.restore(snapshot)
                raise
