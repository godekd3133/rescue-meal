from datetime import datetime, timezone

import pytest

from app.inventory_repository import InventoryInvariantError, InventoryRepository
from app.main import _FoodRecord, _food


def _repository(foods):
    from app.main import _refresh_estimated_window, create_id

    return InventoryRepository(
        foods_provider=lambda: foods,
        record_factory=lambda response, purchased_at: _FoodRecord(response, purchased_at=purchased_at),
        id_factory=create_id,
        recalculate_window=_refresh_estimated_window,
    )


def _food_record(food_id: str, quantity: float = 2):
    return _FoodRecord(
        _food(
            food_id,
            "닭가슴살",
            "테스트",
            quantity,
            "팩",
            "frozen",
            "unknown",
            None,
            "unknown",
            "테스트",
            1,
            "육류",
            "/assets/food/chicken.png",
            "테스트",
        )
    )


def test_create_receipt_lot_never_merges_same_canonical_name() -> None:
    foods = {"existing": _food_record("existing", 1)}
    repository = _repository(foods)
    first = _food_record("receipt-lot-a", 1).response
    second = _food_record("receipt-lot-b", 2).response

    first_lot_id = repository.create_receipt_lot(first, purchased_at=None)
    second_lot_id = repository.create_receipt_lot(second, purchased_at=None)

    assert first_lot_id == "receipt-lot-a"
    assert second_lot_id == "receipt-lot-b"
    assert set(foods) == {"existing", "receipt-lot-a", "receipt-lot-b"}
    assert [foods[key].response.quantity for key in ("receipt-lot-a", "receipt-lot-b")] == [1, 2]


def test_partial_storage_mutation_conserves_parent_and_child_quantity() -> None:
    foods = {"source": _food_record("source")}
    repository = _repository(foods)

    mutation = repository.apply_storage_event(
        food_id="source",
        event_type="moved",
        to_storage_type="refrigerated",
        quantity=0.5,
    )

    assert mutation.created_child_food_id is not None
    child = foods[mutation.created_child_food_id].response
    assert foods["source"].response.quantity + child.quantity == 2
    assert foods["source"].response.storage_type == "frozen"
    assert child.storage_type == "refrigerated"
    assert child.parent_lot_id == "source"


def test_storage_mutation_rejects_overconsumption_without_state_change() -> None:
    foods = {"source": _food_record("source")}
    repository = _repository(foods)

    with pytest.raises(InventoryInvariantError):
        repository.apply_storage_event(food_id="source", event_type="consumed", quantity=3)

    assert list(foods) == ["source"]
    assert foods["source"].response.quantity == 2


def test_full_open_records_the_first_opened_at_and_does_not_overwrite_it() -> None:
    foods = {"source": _food_record("source")}
    repository = _repository(foods)
    first_opened_at = datetime(2026, 9, 3, 12, 30, tzinfo=timezone.utc)

    repository.apply_storage_event(food_id="source", event_type="opened", occurred_at=first_opened_at)
    repository.apply_storage_event(
        food_id="source",
        event_type="opened",
        occurred_at=datetime(2026, 9, 4, 12, 30, tzinfo=timezone.utc),
    )

    assert foods["source"].response.opened is True
    assert foods["source"].response.opened_at == first_opened_at


def test_partial_open_creates_an_opened_child_without_marking_the_source() -> None:
    foods = {"source": _food_record("source")}
    repository = _repository(foods)
    opened_at = datetime(2026, 9, 3, 12, 30, tzinfo=timezone.utc)

    mutation = repository.apply_storage_event(
        food_id="source",
        event_type="opened",
        quantity=0.5,
        occurred_at=opened_at,
    )

    assert mutation.created_child_food_id is not None
    child = foods[mutation.created_child_food_id].response
    assert foods["source"].response.opened is False
    assert foods["source"].response.opened_at is None
    assert child.opened is True
    assert child.opened_at == opened_at
