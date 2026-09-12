"""Authoritative inventory mutations behind a small, testable seam.

The current API still exposes compatibility ``FoodResponse`` objects, but
receipt, storage-event, and consume callers should not each reimplement lot
cardinality or quantity conservation. This module owns those invariants while
the API supplies concrete record and date-window adapters.
"""

from __future__ import annotations

from collections.abc import Callable, MutableMapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal


StorageCode = Literal["ambient", "refrigerated", "frozen"]
StorageEventType = Literal["moved", "opened", "frozen", "thawed", "consumed", "discarded"]


class InventoryRepositoryError(Exception):
    """Base error for a rejected inventory mutation."""


class InventoryNotFoundError(InventoryRepositoryError):
    """The requested lot does not belong to the active inventory."""


class InventoryInvariantError(InventoryRepositoryError):
    """The mutation would violate lot or quantity invariants."""


@dataclass(frozen=True)
class StorageMutation:
    food_id: str
    canonical_name: str
    unit: str
    from_storage_type: StorageCode
    from_storage_location_id: str | None
    event_quantity: float
    to_storage_type: StorageCode | None
    to_storage_location_id: str | None
    created_child_food_id: str | None


class InventoryRepository:
    """Own receipt-lot creation and state mutation invariants.

    ``foods_provider`` is intentionally lazy because SQLite/PostgreSQL stores
    reconstruct their dictionaries during restart. The implementation does
    not know about FastAPI, Grocy, or response serialization; callers receive
    a compact mutation result and append external events separately.
    """

    def __init__(
        self,
        *,
        foods_provider: Callable[[], MutableMapping[str, Any]],
        record_factory: Callable[[Any, datetime | None], Any],
        id_factory: Callable[[str], str],
        recalculate_window: Callable[[Any], None],
    ) -> None:
        self._foods_provider = foods_provider
        self._record_factory = record_factory
        self._id_factory = id_factory
        self._recalculate_window = recalculate_window

    def create_receipt_lot(self, food: Any, *, purchased_at: datetime | None) -> str:
        """Insert one new lot for one confirmed receipt line.

        A canonical product name is not an identity key. Every confirmed
        receipt line gets a new generated food/lot ID, even when another lot
        has the same canonical name.
        """

        return self._create_lot(food, purchased_at=purchased_at)

    def create_manual_lot(self, food: Any, *, purchased_at: datetime | None) -> str:
        """Insert one new lot for a user-confirmed non-receipt purchase.

        Shopping-list receiving is intentionally lot-based as well. It must
        not reuse the compatibility ``/api/foods`` upsert behavior, because a
        purchase may replenish an existing partial lot without replacing it.
        """

        return self._create_lot(food, purchased_at=purchased_at)

    def _create_lot(self, food: Any, *, purchased_at: datetime | None) -> str:
        """Insert one immutable purchase lot using the supplied food ID."""

        foods = self._foods_provider()
        food_id = str(food.id)
        if food_id in foods:
            raise InventoryInvariantError(f"generated lot ID already exists: {food_id}")
        foods[food_id] = self._record_factory(food, purchased_at)
        return food_id

    def apply_storage_event(
        self,
        *,
        food_id: str,
        event_type: StorageEventType,
        to_storage_type: StorageCode | None = None,
        to_storage_location_id: str | None = None,
        quantity: float | None = None,
        occurred_at: datetime | None = None,
    ) -> StorageMutation:
        """Apply one move/open/consume/discard mutation atomically in memory.

        The caller owns persistence and append-only event creation. This
        method owns validation, parent/child split behavior, full removal, and
        quantity conservation so every API entrypoint uses the same rules.
        ``occurred_at`` is used only when an opening event needs to establish
        the lot's first-opened timestamp.
        """

        foods = self._foods_provider()
        record = foods.get(food_id)
        if record is None:
            raise InventoryNotFoundError(food_id)

        response = record.response
        current_quantity = float(response.quantity)
        if quantity is not None and (quantity <= 0 or quantity > current_quantity):
            raise InventoryInvariantError("event quantity must be within the current lot")
        event_quantity = quantity if quantity is not None else current_quantity
        current_storage: StorageCode = response.storage_type
        current_location_id = getattr(response, "storage_location_id", None)
        target_storage: StorageCode | None = None
        target_location_id: str | None = None
        event_time = occurred_at or datetime.now(timezone.utc)

        if event_type == "moved":
            if to_storage_type is None:
                raise InventoryInvariantError("moved event requires a target storage type")
            target_storage = to_storage_type
            target_location_id = to_storage_location_id
        elif event_type == "frozen":
            target_storage = "frozen"
        elif event_type == "thawed":
            target_storage = "refrigerated"

        created_child_food_id: str | None = None
        if target_storage is not None:
            if quantity is not None and quantity < current_quantity:
                created_child_food_id = self._split_lot(
                    record,
                    quantity=quantity,
                    storage_type=target_storage,
                    storage_location_id=target_location_id,
                )
            else:
                response.storage_type = target_storage
                response.storage_location_id = target_location_id
                self._recalculate_window(response)
        elif event_type == "opened":
            if quantity is not None and quantity < current_quantity:
                created_child_food_id = self._split_lot(
                    record,
                    quantity=quantity,
                    opened=True,
                    opened_at=None if response.opened else event_time,
                )
            else:
                if not response.opened:
                    response.opened = True
                    response.opened_at = response.opened_at or event_time
                self._recalculate_window(response)
        elif event_type in {"consumed", "discarded"}:
            if quantity is not None and quantity < current_quantity:
                response.quantity = round(current_quantity - quantity, 3)
                self._recalculate_window(response)
            else:
                del foods[food_id]
        else:  # pragma: no cover - StorageEventType and FastAPI validation cover this
            raise InventoryInvariantError(f"unsupported storage event: {event_type}")

        return StorageMutation(
            food_id=food_id,
            canonical_name=response.canonical_name,
            unit=response.unit,
            from_storage_type=current_storage,
            from_storage_location_id=current_location_id,
            event_quantity=event_quantity,
            to_storage_type=target_storage,
            to_storage_location_id=target_location_id,
            created_child_food_id=created_child_food_id,
        )

    def _split_lot(
        self,
        record: Any,
        *,
        quantity: float,
        storage_type: StorageCode | None = None,
        storage_location_id: str | None = None,
        opened: bool | None = None,
        opened_at: datetime | None = None,
    ) -> str:
        foods = self._foods_provider()
        source = record.response
        if quantity >= source.quantity:
            raise InventoryInvariantError("partial split requires a quantity smaller than the source lot")
        child = source.model_copy(deep=True)
        child.id = self._id_factory("lot")
        if child.id in foods:
            raise InventoryInvariantError(f"generated child lot ID already exists: {child.id}")
        child.parent_lot_id = source.id
        child.quantity = quantity
        if storage_type is not None:
            child.storage_type = storage_type
            child.storage_location_id = storage_location_id
        if opened is not None:
            child.opened = opened
        if opened_at is not None:
            child.opened_at = opened_at
        self._recalculate_window(child)
        source.quantity = round(source.quantity - quantity, 3)
        self._recalculate_window(source)
        foods[child.id] = self._record_factory(child, record.purchased_at)
        return child.id
