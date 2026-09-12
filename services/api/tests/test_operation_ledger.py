from hashlib import sha256

import pytest
from pydantic import BaseModel

from app.operation_ledger import InvalidOperationKey, OperationLedger


def test_operation_ledger_normalizes_optional_keys_and_rejects_unsafe_values() -> None:
    ledger = OperationLedger()

    assert ledger.normalize_key(None) is None
    assert ledger.normalize_key("  receipt-retry-1  ") == "receipt-retry-1"

    with pytest.raises(InvalidOperationKey):
        ledger.normalize_key("contains whitespace")


def test_operation_ledger_fingerprint_is_order_stable_and_supports_models() -> None:
    ledger = OperationLedger()

    left = {"overrides": {"line-2": {"canonical_name": "두부"}, "line-1": {}}, "lines": ["line-1", "line-2"]}
    right = {"lines": ["line-1", "line-2"], "overrides": {"line-1": {}, "line-2": {"canonical_name": "두부"}}}

    assert ledger.fingerprint(left) == ledger.fingerprint(right)
    assert ledger.fingerprint(_Payload(overrides=left["overrides"], lines=left["lines"])) == ledger.fingerprint(left)
    assert len(ledger.fingerprint(left)) == 64


def test_operation_ledger_identity_preserves_the_existing_digest_contract() -> None:
    ledger = OperationLedger()
    identity = ledger.identity("manual-food-retry-1", {"quantity": "1.000", "unit": "개"})

    assert identity is not None
    assert identity.key == "manual-food-retry-1"
    assert identity.key_digest == sha256(b"manual-food-retry-1").hexdigest()
    assert identity.payload_fingerprint == ledger.fingerprint({"quantity": "1.000", "unit": "개"})
    assert ledger.identity(None, {"quantity": "1.000"}) is None


def test_operation_ledger_scoped_id_keeps_legacy_separator_and_length_semantics() -> None:
    ledger = OperationLedger()
    expected = sha256(b"guest-one:item-one:key-one").hexdigest()[:32]

    assert ledger.scoped_id("shopping-lot-idem", "guest-one", "item-one", "key-one") == f"shopping-lot-idem-{expected}"


class _Payload(BaseModel):
    lines: list[str]
    overrides: dict[str, dict[str, str]]
