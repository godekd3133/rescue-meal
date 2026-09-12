from __future__ import annotations

from dataclasses import dataclass
import math
import os
import re
from collections.abc import Mapping
from typing import Literal
from urllib.parse import unquote, urlparse


Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class PreflightIssue:
    code: str
    setting: str
    message: str
    severity: Severity = "error"


@dataclass(frozen=True)
class PostgresConnectionBudget:
    """Conservative PostgreSQL connection ceiling for the API deployment."""

    process_count: int
    pool_max_size: int
    reserved_connections: int
    max_connections: int
    base_connections_per_process: int = 2

    def __post_init__(self) -> None:
        if self.process_count < 1:
            raise ValueError("process_count must be positive")
        if self.pool_max_size < 1:
            raise ValueError("pool_max_size must be positive")
        if self.reserved_connections < 0:
            raise ValueError("reserved_connections cannot be negative")
        if self.max_connections < 1:
            raise ValueError("max_connections must be positive")
        if self.base_connections_per_process < 1:
            raise ValueError("base_connections_per_process must be positive")

    @property
    def api_connections_per_process(self) -> int:
        return self.base_connections_per_process + self.pool_max_size

    @property
    def api_connection_ceiling(self) -> int:
        return self.process_count * self.api_connections_per_process

    @property
    def required_connections(self) -> int:
        return self.api_connection_ceiling + self.reserved_connections

    @property
    def fits(self) -> bool:
        return self.required_connections <= self.max_connections


_INSECURE_SECRET_MARKERS = (
    "change-me",
    "development-only",
    "local-preview",
    "example",
)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _has_secure_secret(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return len(normalized) >= 32 and not any(marker in normalized for marker in _INSECURE_SECRET_MARKERS)


def _valid_url(value: str | None, *, https_only: bool = False) -> bool:
    parsed = urlparse((value or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if parsed.username or parsed.password or parsed.fragment:
        return False
    try:
        parsed.port
    except ValueError:
        return False
    return not https_only or parsed.scheme == "https"


def _valid_cors_origin(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and not parsed.path
        and not parsed.params
        and not parsed.query
        and not parsed.fragment
    )


def _valid_runtime_namespace(value: str | None) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", (value or "").strip()))


def _parse_email_allowlist(value: str | None) -> tuple[set[str], bool, bool]:
    entries = [item.strip().lower() for item in (value or "").split(",") if item.strip()]
    invalid = any(
        not re.fullmatch(r"[^@\s]{1,120}@[^@\s]{1,120}\.[^@\s]{2,63}", item)
        for item in entries
    )
    return set(entries), bool(entries), invalid


def _runtime_number(
    values: Mapping[str, str],
    name: str,
    *,
    minimum: float,
    maximum: float,
    integer: bool = False,
) -> float | None:
    raw = values.get(name)
    if raw is None or not raw.strip():
        return None
    try:
        parsed = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed) or parsed < minimum or parsed > maximum or (integer and not parsed.is_integer()):
        return None
    return parsed


def production_preflight(
    env: Mapping[str, str] | None = None,
    *,
    strict: bool = False,
) -> list[PreflightIssue]:
    """Validate production configuration without printing any secret value.

    This is a configuration gate, not a connectivity test. Database, provider,
    and push delivery reachability still need separate deployment smoke tests.
    """

    values = env if env is not None else os.environ
    issues: list[PreflightIssue] = []

    def error(code: str, setting: str, message: str) -> None:
        issues.append(PreflightIssue(code=code, setting=setting, message=message))

    def warning(code: str, setting: str, message: str) -> None:
        issues.append(
            PreflightIssue(
                code=code,
                setting=setting,
                message=message,
                severity="error" if strict else "warning",
            )
        )

    database_url = values.get("RESCUE_MEAL_DATABASE_URL", "").strip()
    if not database_url:
        error("database-missing", "RESCUE_MEAL_DATABASE_URL", "production은 PostgreSQL DSN이 필요합니다.")
    elif not database_url.lower().startswith(("postgresql://", "postgres://")):
        error("database-not-postgres", "RESCUE_MEAL_DATABASE_URL", "SQLite 또는 파일 경로를 production 저장소로 사용할 수 없습니다.")

    if values.get("RESCUE_MEAL_INVENTORY_MODE", "").strip().lower() != "normalized":
        error("inventory-mode", "RESCUE_MEAL_INVENTORY_MODE", "production inventory mode는 normalized여야 합니다.")

    workspace_store_cache_size = _runtime_number(
        {"RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE": values.get("RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE", "16")},
        "RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE",
        minimum=1,
        maximum=256,
        integer=True,
    )
    if workspace_store_cache_size is None:
        error(
            "workspace-store-cache-size",
            "RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE",
            "workspace store cache size는 1~256 사이의 정수여야 합니다.",
        )

    pool_values: dict[str, float] = {}
    pool_specs = (
        ("RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE", "1", 0, 32, True, "postgres-pool-min-size", "PostgreSQL pool min size는 0~32 사이의 정수여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE", "8", 1, 64, True, "postgres-pool-max-size", "PostgreSQL pool max size는 1~64 사이의 정수여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_TIMEOUT_SECONDS", "5", 0.1, 60, False, "postgres-pool-timeout", "PostgreSQL pool timeout은 0.1~60초 사이여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_MAX_WAITING", "64", 0, 1024, True, "postgres-pool-max-waiting", "PostgreSQL pool max waiting은 0~1024 사이의 정수여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_MAX_IDLE_SECONDS", "300", 1, 3600, False, "postgres-pool-max-idle", "PostgreSQL pool max idle은 1~3600초 사이여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_MAX_LIFETIME_SECONDS", "1800", 60, 86400, False, "postgres-pool-max-lifetime", "PostgreSQL pool max lifetime은 60~86400초 사이여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_RECONNECT_TIMEOUT_SECONDS", "30", 1, 3600, False, "postgres-pool-reconnect-timeout", "PostgreSQL pool reconnect timeout은 1~3600초 사이여야 합니다."),
        ("RESCUE_MEAL_POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS", "5", 0.1, 60, False, "postgres-pool-close-timeout", "PostgreSQL pool close timeout은 0.1~60초 사이여야 합니다."),
    )
    for name, default, minimum, maximum, integer, code, message in pool_specs:
        value = _runtime_number(
            {name: values.get(name, default)},
            name,
            minimum=minimum,
            maximum=maximum,
            integer=integer,
        )
        if value is None:
            error(code, name, message)
        else:
            pool_values[name] = value
    direct_reconnect_timeout = _runtime_number(
        {
            "RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS": values.get(
                "RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS", "5"
            )
        },
        "RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS",
        minimum=0.1,
        maximum=60,
    )
    if direct_reconnect_timeout is None:
        error(
            "postgres-direct-reconnect-timeout",
            "RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS",
            "PostgreSQL direct connection reconnect timeout은 0.1~60초 사이여야 합니다.",
        )
    pool_min_size = pool_values.get("RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE")
    pool_max_size = pool_values.get("RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE")
    if pool_min_size is not None and pool_max_size is not None and pool_max_size < pool_min_size:
        error(
            "postgres-pool-size-order",
            "RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE/RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE",
            "PostgreSQL pool max size는 min size 이상이어야 합니다.",
        )

    connection_budget_values: dict[str, float] = {}
    connection_budget_specs = (
        (
            "RESCUE_MEAL_POSTGRES_PROCESS_COUNT",
            "1",
            1,
            128,
            "postgres-process-count",
            "동시에 실행될 API process 수는 1~128 사이의 정수여야 합니다.",
        ),
        (
            "RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS",
            "10",
            0,
            1000,
            "postgres-reserved-connections",
            "PostgreSQL reserved connection 수는 0~1000 사이의 정수여야 합니다.",
        ),
        (
            "RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS",
            None,
            1,
            100000,
            "postgres-max-connections",
            "실제 PostgreSQL max_connections를 명시해야 하며 1~100000 사이의 정수여야 합니다.",
        ),
    )
    for name, default, minimum, maximum, code, message in connection_budget_specs:
        raw_value = values.get(name)
        if raw_value is None and default is not None:
            raw_value = default
        value = _runtime_number(
            {name: raw_value} if raw_value is not None else {},
            name,
            minimum=minimum,
            maximum=maximum,
            integer=True,
        )
        if value is None:
            error(code, name, message)
        else:
            connection_budget_values[name] = value
    if pool_max_size is not None and len(connection_budget_values) == len(connection_budget_specs):
        budget = PostgresConnectionBudget(
            process_count=int(connection_budget_values["RESCUE_MEAL_POSTGRES_PROCESS_COUNT"]),
            pool_max_size=int(pool_max_size),
            reserved_connections=int(connection_budget_values["RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS"]),
            max_connections=int(connection_budget_values["RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS"]),
        )
        if not budget.fits:
            error(
                "postgres-connection-budget",
                "RESCUE_MEAL_POSTGRES_PROCESS_COUNT/RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE/RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS/RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS",
                f"PostgreSQL connection budget가 초과됩니다 ({budget.process_count} process × (2 base/auth + {budget.pool_max_size} pool) + {budget.reserved_connections} reserved = {budget.required_connections}, max_connections = {budget.max_connections}).",
            )

    if not _truthy(values.get("RESCUE_MEAL_AUTH_REQUIRED")):
        error("auth-disabled", "RESCUE_MEAL_AUTH_REQUIRED", "production API는 인증을 반드시 켜야 합니다.")
    if not _has_secure_secret(values.get("RESCUE_MEAL_AUTH_SECRET")):
        error("auth-secret", "RESCUE_MEAL_AUTH_SECRET", "32자 이상이며 기본·개발용 값이 아닌 secret이 필요합니다.")
    if not _truthy(values.get("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED")):
        error("auth-rate-limit-disabled", "RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "인증 endpoint rate limit을 반드시 켜야 합니다.")
    if not _has_secure_secret(values.get("RESCUE_MEAL_OBSERVABILITY_TOKEN")):
        error("observability-token", "RESCUE_MEAL_OBSERVABILITY_TOKEN", "운영 metrics scrape를 보호할 32자 이상 secret이 필요합니다.")

    if values.get("RESCUE_MEAL_RECIPE_REVIEW_TOKEN", "").strip():
        error(
            "recipe-review-legacy-token",
            "RESCUE_MEAL_RECIPE_REVIEW_TOKEN",
            "production recipe review는 공유 legacy token을 사용할 수 없습니다. 개별 recipe_admin account를 사용해야 합니다.",
        )

    admin_emails, admin_allowlist_configured, admin_allowlist_invalid = _parse_email_allowlist(
        values.get("RESCUE_MEAL_RECIPE_ADMIN_EMAILS")
    )
    publisher_emails, publisher_allowlist_configured, publisher_allowlist_invalid = _parse_email_allowlist(
        values.get("RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS")
    )
    if admin_allowlist_invalid:
        error(
            "recipe-admin-email-allowlist",
            "RESCUE_MEAL_RECIPE_ADMIN_EMAILS",
            "recipe admin email allowlist에 유효하지 않은 email이 있습니다.",
        )
    if publisher_allowlist_invalid:
        error(
            "recipe-publisher-email-allowlist",
            "RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS",
            "recipe publisher email allowlist에 유효하지 않은 email이 있습니다.",
        )
    if publisher_allowlist_configured and not admin_allowlist_configured:
        error(
            "recipe-publisher-without-admin",
            "RESCUE_MEAL_RECIPE_ADMIN_EMAILS/RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS",
            "publisher allowlist를 사용하려면 recipe admin email allowlist도 함께 설정해야 합니다.",
        )
    elif publisher_allowlist_configured and not publisher_emails <= admin_emails:
        error(
            "recipe-publisher-not-admin",
            "RESCUE_MEAL_RECIPE_ADMIN_EMAILS/RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS",
            "모든 publisher email은 recipe admin email allowlist의 일부여야 합니다.",
        )

    cors_origins = [item.strip().rstrip("/") for item in values.get("RESCUE_MEAL_CORS_ORIGINS", "").split(",") if item.strip()]
    if not cors_origins:
        error("cors-empty", "RESCUE_MEAL_CORS_ORIGINS", "production frontend origin을 하나 이상 명시해야 합니다.")
    elif any(origin == "*" for origin in cors_origins):
        error("cors-wildcard", "RESCUE_MEAL_CORS_ORIGINS", "인증 API에서 wildcard CORS를 사용할 수 없습니다.")
    else:
        for origin in cors_origins:
            if not _valid_cors_origin(origin):
                error("cors-origin", "RESCUE_MEAL_CORS_ORIGINS", "모든 CORS origin은 path/query 없는 HTTPS origin이어야 합니다.")
                break

    if not _valid_url(values.get("RESCUE_MEAL_OCR_URL")):
        error("ocr-url", "RESCUE_MEAL_OCR_URL", "OCR worker의 유효한 HTTP(S) URL이 필요합니다.")

    inference_provider = (values.get("RESCUE_MEAL_INFERENCE_PROVIDER") or "rules").strip().lower() or "rules"
    if inference_provider not in {"rules", "ollama"}:
        error("inference-provider", "RESCUE_MEAL_INFERENCE_PROVIDER", "inference provider는 rules 또는 ollama여야 합니다.")
    elif inference_provider == "ollama":
        if not _valid_url(values.get("RESCUE_MEAL_OLLAMA_BASE_URL")):
            error("ollama-url", "RESCUE_MEAL_OLLAMA_BASE_URL", "Ollama provider의 유효한 HTTP(S) URL이 필요합니다.")
        model = (values.get("RESCUE_MEAL_OLLAMA_MODEL") or "gemma4").strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}", model):
            error("ollama-model", "RESCUE_MEAL_OLLAMA_MODEL", "Ollama model 이름은 안전한 128자 이내 형식이어야 합니다.")
        timeout = _runtime_number(
            {"RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS": values.get("RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS", "8")},
            "RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS",
            minimum=1,
            maximum=30,
        )
        if timeout is None:
            error("ollama-timeout", "RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS", "Ollama timeout은 1~30초 사이여야 합니다.")

    if not _valid_url(values.get("RESCUE_MEAL_PASSWORD_RESET_BASE_URL"), https_only=True):
        error("reset-url", "RESCUE_MEAL_PASSWORD_RESET_BASE_URL", "password reset base URL은 HTTPS여야 합니다.")
    if not _valid_url(values.get("RESCUE_MEAL_EMAIL_PROVIDER_URL"), https_only=True):
        error("email-provider-url", "RESCUE_MEAL_EMAIL_PROVIDER_URL", "password reset email provider URL은 HTTPS여야 합니다.")
    if not values.get("RESCUE_MEAL_EMAIL_PROVIDER_TOKEN", "").strip():
        warning("email-provider-token", "RESCUE_MEAL_EMAIL_PROVIDER_TOKEN", "email provider bearer token이 비어 있어 provider 계약을 확인해야 합니다.")
    email_runtime_specs = (
        (
            "RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS",
            "8",
            1,
            30,
            False,
            "email-timeout",
            "password reset email timeout은 1~30초 사이여야 합니다.",
        ),
        (
            "RESCUE_MEAL_EMAIL_MAX_ATTEMPTS",
            "2",
            1,
            3,
            True,
            "email-max-attempts",
            "password reset email 최대 시도 횟수는 1~3 사이의 정수여야 합니다.",
        ),
        (
            "RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS",
            "0.15",
            0,
            2,
            False,
            "email-retry-backoff",
            "password reset email retry backoff은 0~2초 사이여야 합니다.",
        ),
    )
    for name, default, minimum, maximum, integer, code, message in email_runtime_specs:
        value = _runtime_number(
            {name: values.get(name, default)},
            name,
            minimum=minimum,
            maximum=maximum,
            integer=integer,
        )
        if value is None:
            error(code, name, message)

    postgres_password = values.get("POSTGRES_PASSWORD")
    dsn_password = unquote(urlparse(database_url).password or "") if database_url else ""
    if postgres_password is not None and postgres_password.strip().lower() in {"", "change-me-in-local-env"}:
        error("postgres-password", "POSTGRES_PASSWORD", "기본 PostgreSQL password를 production에서 사용할 수 없습니다.")
    elif dsn_password.strip().lower() in {"change-me-in-local-env", ""} and "change-me-in-local-env" in database_url.lower():
        error("postgres-password", "RESCUE_MEAL_DATABASE_URL", "기본 PostgreSQL password를 production DSN에서 사용할 수 없습니다.")

    grocy_url = values.get("GROCY_BASE_URL", "").strip()
    grocy_key = values.get("GROCY_API_KEY", "").strip()
    if bool(grocy_url) != bool(grocy_key):
        error("grocy-partial", "GROCY_BASE_URL/GROCY_API_KEY", "Grocy URL과 API key는 함께 설정하거나 함께 비워야 합니다.")

    vapid_private_key = values.get("RESCUE_MEAL_VAPID_PRIVATE_KEY", "").strip()
    vapid_subject = values.get("RESCUE_MEAL_VAPID_SUBJECT", "").strip()
    if bool(vapid_private_key) != bool(vapid_subject):
        error("vapid-partial", "RESCUE_MEAL_VAPID_PRIVATE_KEY/RESCUE_MEAL_VAPID_SUBJECT", "VAPID private key와 subject는 함께 설정해야 합니다.")
    elif vapid_private_key or vapid_subject:
        if not values.get("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "").strip():
            warning("notification-worker-token", "RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "VAPID가 켜졌지만 notification worker token이 비어 있습니다.")

    if _truthy(values.get("RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS")):
        if not values.get("MFDS_API_KEY", "").strip():
            error("mfds-key", "MFDS_API_KEY", "외부 상품 조회를 켜면 MFDS_API_KEY가 필요합니다.")
        if not values.get("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "").strip():
            warning("product-worker-token", "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "외부 상품 보강 worker를 켜면 service token을 설정해야 합니다.")

        open_food_facts_user_agent = values.get("RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT", "").strip()
        if not open_food_facts_user_agent or "example.com" in open_food_facts_user_agent.lower() or "course-project" in open_food_facts_user_agent.lower():
            error("open-food-facts-user-agent", "RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT", "Open Food Facts production 요청에는 실제 contact가 포함된 User-Agent가 필요합니다.")
        api_version = values.get("RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION", "v3.6").strip()
        if not re.fullmatch(r"v\d+(?:\.\d+){0,2}", api_version):
            error("open-food-facts-api-version", "RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION", "Open Food Facts API version 형식이 잘못되었습니다.")
        if not _valid_url(values.get("RESCUE_MEAL_OPEN_FOOD_FACTS_BASE_URL", "https://world.openfoodfacts.org"), https_only=True):
            error("open-food-facts-url", "RESCUE_MEAL_OPEN_FOOD_FACTS_BASE_URL", "Open Food Facts production base URL은 HTTPS여야 합니다.")
        if not _valid_url(values.get("RESCUE_MEAL_MFDS_BASE_URL", "https://openapi.foodsafetykorea.go.kr"), https_only=True):
            error("mfds-url", "RESCUE_MEAL_MFDS_BASE_URL", "MFDS production base URL은 HTTPS여야 합니다.")

        provider_limit = _runtime_number(
            {"RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS": values.get("RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS", "10")},
            "RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS",
            minimum=1,
            maximum=15,
            integer=True,
        )
        provider_window = _runtime_number(
            {"RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS": values.get("RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS", "60")},
            "RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS",
            minimum=1,
            maximum=3600,
        )
        if provider_limit is None:
            error("provider-rate-limit", "RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS", "provider rate limit은 1~15 사이의 정수여야 합니다.")
        if provider_window is None:
            error("provider-rate-window", "RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS", "provider rate-limit window는 1~3600초여야 합니다.")
        if not _valid_runtime_namespace(values.get("RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE", "product-master-v3")):
            error("product-cache-namespace", "RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE", "product cache namespace는 안전한 영문·숫자·._- 형식이어야 합니다.")
        if not _valid_runtime_namespace(values.get("RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE", "product-name-v1")):
            error("product-name-cache-namespace", "RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE", "product-name cache namespace는 안전한 영문·숫자·._- 형식이어야 합니다.")
        single_flight_lease = _runtime_number(
            {"RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS": values.get("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS", "45")},
            "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS",
            minimum=5,
            maximum=300,
        )
        single_flight_wait = _runtime_number(
            {"RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS": values.get("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS", "5")},
            "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS",
            minimum=1,
            maximum=30,
        )
        if single_flight_lease is None:
            error("product-single-flight-lease", "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS", "single-flight lease는 5~300초여야 합니다.")
        if single_flight_wait is None:
            error("product-single-flight-wait", "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS", "single-flight wait는 1~30초여야 합니다.")
        if single_flight_lease is not None and single_flight_wait is not None and single_flight_lease <= single_flight_wait:
            error("product-single-flight-window", "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS", "single-flight lease는 wait window보다 길어야 합니다.")
    else:
        warning("external-lookups-disabled", "RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS", "외부 상품정보 provider가 비활성화되어 barcode/I1250 보강이 동작하지 않습니다.")

    return issues
