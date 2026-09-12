"""Shared operation identity rules for retryable user mutations."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Any


_IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{1,128}")


class InvalidOperationKey(ValueError):
    """Raised when a client operation key cannot be safely normalized."""


@dataclass(frozen=True)
class OperationIdentity:
    """Stable identity shared by a retry attempt and its canonical payload."""

    key: str
    key_digest: str
    payload_fingerprint: str


class OperationLedger:
    """Create stable, privacy-safe identities for retryable operations.

    Domain adapters retain ownership of scope checks, durable records, replay
    responses, and conflict messages. This Module owns only the shared rules
    that must remain byte-for-byte compatible across those adapters.
    """

    @staticmethod
    def normalize_key(value: str | None) -> str | None:
        normalized = value.strip() if isinstance(value, str) else ""
        if not normalized:
            return None
        if _IDEMPOTENCY_KEY_PATTERN.fullmatch(normalized) is None:
            raise InvalidOperationKey("Idempotency-Key 형식을 확인해 주세요.")
        return normalized

    @staticmethod
    def key_digest(key: str) -> str:
        return sha256(key.encode("utf-8")).hexdigest()

    @classmethod
    def fingerprint(cls, payload: Any) -> str:
        canonical = json.dumps(
            cls._json_ready(payload),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return sha256(canonical.encode("utf-8")).hexdigest()

    @classmethod
    def identity(cls, key: str | None, payload: Any) -> OperationIdentity | None:
        normalized = cls.normalize_key(key)
        if normalized is None:
            return None
        return OperationIdentity(
            key=normalized,
            key_digest=cls.key_digest(normalized),
            payload_fingerprint=cls.fingerprint(payload),
        )

    @classmethod
    def scoped_id(cls, prefix: str, *scope_parts: object, digest_length: int = 32) -> str:
        material = ":".join(str(part) for part in scope_parts)
        return f"{prefix}-{sha256(material.encode('utf-8')).hexdigest()[:digest_length]}"

    @classmethod
    def _json_ready(cls, value: Any) -> Any:
        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            return cls._json_ready(model_dump(mode="json"))
        if isinstance(value, dict):
            return {str(key): cls._json_ready(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [cls._json_ready(item) for item in value]
        if isinstance(value, (set, frozenset)):
            return sorted(cls._json_ready(item) for item in value)
        return value
