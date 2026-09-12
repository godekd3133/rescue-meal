from app.preflight import production_preflight


def secure_env(**overrides):
    values = {
        "RESCUE_MEAL_DATABASE_URL": "postgresql://rescue:test@db:5432/rescue_meal",
        "RESCUE_MEAL_INVENTORY_MODE": "normalized",
        "RESCUE_MEAL_AUTH_REQUIRED": "true",
        "RESCUE_MEAL_AUTH_SECRET": "production-secret-0123456789-abcdef-012345",
        "RESCUE_MEAL_OBSERVABILITY_TOKEN": "observability-secret-0123456789-abcdef",
        "RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED": "true",
        "RESCUE_MEAL_CORS_ORIGINS": "https://meal.example.com",
        "RESCUE_MEAL_OCR_URL": "http://ocr-worker:8002",
        "RESCUE_MEAL_POSTGRES_PROCESS_COUNT": "1",
        "RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS": "10",
        "RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS": "100",
        "RESCUE_MEAL_PASSWORD_RESET_BASE_URL": "https://meal.example.com/reset",
        "RESCUE_MEAL_EMAIL_PROVIDER_URL": "https://email.example.com/send",
        "RESCUE_MEAL_EMAIL_PROVIDER_TOKEN": "provider-token",
        "POSTGRES_PASSWORD": "long-production-password",
        "RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS": "true",
        "MFDS_API_KEY": "mfds-production-key",
        "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN": "product-worker-token",
        "RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT": "RescueMeal/1.0 (ops@example.org)",
        "RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION": "v3.6",
        "RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS": "10",
        "RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS": "60",
        "RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE": "product-master-v3",
        "RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE": "product-name-v1",
        "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS": "45",
        "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS": "5",
    }
    values.update(overrides)
    return values


def test_secure_production_configuration_passes_without_warnings():
    assert production_preflight(secure_env()) == []


def test_production_rejects_sqlite_auth_off_and_insecure_cors():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_DATABASE_URL="data/rescue.db",
            RESCUE_MEAL_AUTH_REQUIRED="false",
            RESCUE_MEAL_AUTH_SECRET="development-only-rescue-meal-secret",
            RESCUE_MEAL_CORS_ORIGINS="*",
        )
    )
    codes = {issue.code for issue in issues}
    assert {"database-not-postgres", "auth-disabled", "auth-secret", "cors-wildcard"} <= codes


def test_production_requires_normalized_inventory_and_https_reset_delivery():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_INVENTORY_MODE="projection",
            RESCUE_MEAL_PASSWORD_RESET_BASE_URL="http://meal.example.com/reset",
            RESCUE_MEAL_EMAIL_PROVIDER_URL="http://email.example.com/send",
            POSTGRES_PASSWORD="",
        )
    )
    codes = {issue.code for issue in issues}
    assert {"inventory-mode", "reset-url", "email-provider-url", "postgres-password"} <= codes


def test_production_bounds_password_reset_delivery_runtime_settings():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS="31",
            RESCUE_MEAL_EMAIL_MAX_ATTEMPTS="4",
            RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS="-1",
        )
    )
    assert {"email-timeout", "email-max-attempts", "email-retry-backoff"} <= {issue.code for issue in issues}


def test_production_rejects_password_reset_urls_with_credentials_or_fragment():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_PASSWORD_RESET_BASE_URL="https://user:password@meal.example.com/reset#token",
        )
    )
    assert "reset-url" in {issue.code for issue in issues}


def test_partial_grocy_and_vapid_configuration_is_rejected():
    issues = production_preflight(
        secure_env(
            GROCY_BASE_URL="https://grocy.example.com",
            GROCY_API_KEY="",
            RESCUE_MEAL_VAPID_PRIVATE_KEY="private-key",
            RESCUE_MEAL_VAPID_SUBJECT="",
        )
    )
    codes = {issue.code for issue in issues}
    assert {"grocy-partial", "vapid-partial"} <= codes


def test_external_lookup_requires_mfds_key():
    issues = production_preflight(secure_env(MFDS_API_KEY=""))
    assert "mfds-key" in {issue.code for issue in issues}


def test_external_lookup_runtime_defaults_match_compose_and_provider_defaults():
    values = secure_env()
    for name in (
        "RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS",
        "RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS",
        "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS",
        "RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS",
    ):
        values.pop(name)

    assert production_preflight(values) == []


def test_external_lookup_explicitly_empty_runtime_setting_is_not_silently_defaulted():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS="",
            RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS="",
        )
    )
    codes = {issue.code for issue in issues}
    assert {"provider-rate-limit", "product-single-flight-wait"} <= codes


def test_workspace_store_cache_size_defaults_and_is_bounded():
    assert production_preflight(secure_env()) == []
    issues = production_preflight(secure_env(RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE="0"))
    assert "workspace-store-cache-size" in {issue.code for issue in issues}


def test_production_validates_postgres_operation_pool_bounds_and_order():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE="9",
            RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE="4",
            RESCUE_MEAL_POSTGRES_POOL_TIMEOUT_SECONDS="0",
            RESCUE_MEAL_POSTGRES_POOL_MAX_WAITING="1.5",
        )
    )
    codes = {issue.code for issue in issues}
    assert {
        "postgres-pool-timeout",
        "postgres-pool-max-waiting",
        "postgres-pool-size-order",
    } <= codes


def test_production_validates_direct_postgres_reconnect_timeout():
    issues = production_preflight(
        secure_env(RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS="0")
    )
    assert "postgres-direct-reconnect-timeout" in {issue.code for issue in issues}


def test_production_validates_aggregate_postgres_connection_budget():
    assert production_preflight(secure_env()) == []

    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_POSTGRES_PROCESS_COUNT="4",
            RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE="20",
            RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS="10",
            RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS="50",
        )
    )
    assert "postgres-connection-budget" in {issue.code for issue in issues}


def test_production_requires_explicit_postgres_max_connections():
    issues = production_preflight(secure_env(RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS=""))
    assert "postgres-max-connections" in {issue.code for issue in issues}


def test_production_requires_observability_token():
    issues = production_preflight(secure_env(RESCUE_MEAL_OBSERVABILITY_TOKEN=""))
    assert "observability-token" in {issue.code for issue in issues}


def test_production_rejects_shared_recipe_review_legacy_token():
    legacy_token = "legacy-review-token-that-must-not-ship"
    issues = production_preflight(secure_env(RESCUE_MEAL_RECIPE_REVIEW_TOKEN=legacy_token))
    matching = [issue for issue in issues if issue.code == "recipe-review-legacy-token"]
    assert len(matching) == 1
    assert legacy_token not in matching[0].message


def test_production_validates_recipe_admin_and_publisher_allowlists():
    assert production_preflight(
        secure_env(
            RESCUE_MEAL_RECIPE_ADMIN_EMAILS="reviewer@example.com,publisher@example.com,publisher@example.com",
            RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS="publisher@example.com",
        )
    ) == []

    outside_admin = production_preflight(
        secure_env(
            RESCUE_MEAL_RECIPE_ADMIN_EMAILS="reviewer@example.com",
            RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS="publisher@example.com",
        )
    )
    assert "recipe-publisher-not-admin" in {issue.code for issue in outside_admin}

    publisher_without_admin = production_preflight(
        secure_env(RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS="publisher@example.com")
    )
    assert "recipe-publisher-without-admin" in {issue.code for issue in publisher_without_admin}

    invalid = production_preflight(
        secure_env(
            RESCUE_MEAL_RECIPE_ADMIN_EMAILS="reviewer@example.com,not-an-email",
            RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS="publisher@example.com",
        )
    )
    assert "recipe-admin-email-allowlist" in {issue.code for issue in invalid}


def test_production_rejects_invalid_postgres_capacity_settings():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_POSTGRES_PROCESS_COUNT="0",
            RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS="1001",
            RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS="not-a-number",
        )
    )
    assert {
        "postgres-process-count",
        "postgres-reserved-connections",
        "postgres-max-connections",
    } <= {issue.code for issue in issues}


def test_external_lookup_rejects_unsafe_provider_runtime_settings():
    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT="RescueMeal/1.0 (course-project)",
            RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION="../../cgi",
            RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS="16",
            RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS="0",
            RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE="unsafe namespace",
            RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE="unsafe/name",
            RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS="5",
            RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS="5",
        )
    )
    codes = {issue.code for issue in issues}
    assert {
        "open-food-facts-user-agent",
        "open-food-facts-api-version",
        "provider-rate-limit",
        "provider-rate-window",
        "product-cache-namespace",
        "product-name-cache-namespace",
        "product-single-flight-window",
    } <= codes


def test_ollama_inference_provider_requires_bounded_runtime_configuration():
    assert production_preflight(
        secure_env(
            RESCUE_MEAL_INFERENCE_PROVIDER="ollama",
            RESCUE_MEAL_OLLAMA_BASE_URL="http://ollama:11434",
            RESCUE_MEAL_OLLAMA_MODEL="gemma4",
            RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS="8",
        )
    ) == []

    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_INFERENCE_PROVIDER="unsupported",
        )
    )
    assert "inference-provider" in {issue.code for issue in issues}

    issues = production_preflight(
        secure_env(
            RESCUE_MEAL_INFERENCE_PROVIDER="ollama",
            RESCUE_MEAL_OLLAMA_BASE_URL="file:///tmp/ollama",
            RESCUE_MEAL_OLLAMA_MODEL="../../prompt-injection",
            RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS="31",
        )
    )
    assert {"ollama-url", "ollama-model", "ollama-timeout"} <= {issue.code for issue in issues}


def test_disabled_external_provider_is_warning_by_default_and_error_in_strict_mode():
    default_issues = production_preflight(secure_env(RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS="false"))
    strict_issues = production_preflight(secure_env(RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS="false"), strict=True)
    assert [(issue.code, issue.severity) for issue in default_issues] == [("external-lookups-disabled", "warning")]
    assert [(issue.code, issue.severity) for issue in strict_issues] == [("external-lookups-disabled", "error")]


def test_preflight_never_includes_secret_values_in_messages():
    secret = "production-secret-0123456789-abcdef-012345"
    issues = production_preflight(secure_env(RESCUE_MEAL_AUTH_SECRET=secret, MFDS_API_KEY=""))
    output = " ".join(f"{issue.code} {issue.setting} {issue.message}" for issue in issues)
    assert secret not in output
