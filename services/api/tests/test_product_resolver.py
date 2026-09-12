import sqlite3
from pathlib import Path

import httpx

from app.product_resolver import (
    MfdsC005Resolver,
    MfdsI1250Resolver,
    OpenFoodFactsResolver,
    ProductCandidate,
    ProductLookupCache,
    ProductLookupResult,
    ProductNameLookupCache,
    ProductNameFallbackResolver,
    ProductNameLookupResult,
    ProductProviderRuntimeMetrics,
    ProviderLookupResult,
    SharedProductLookupCache,
    SharedProductNameLookupCache,
    SharedProductProviderRateLimiter,
    resolve_receipt_name,
    resolve_product,
)


def test_local_fixture_wins_without_external_network() -> None:
    result = resolve_product("0 8801114167523")

    assert result.status == "matched"
    assert result.candidates[0].source == "local_fixture"
    assert result.candidates[0].canonical_name == "국산콩 두부"


def test_unknown_product_reports_external_disabled_without_network() -> None:
    result = resolve_product("4900000000000", enable_external=False)

    assert result.status == "provider_unavailable"
    assert result.candidates == []
    assert result.requires_review is True


def test_open_food_facts_candidate_preserves_source_and_partial_fields() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/v3.6/product/4900000000000")
        assert request.url.params["lc"] == "ko"
        assert request.headers["user-agent"] == "RescueMeal/0.1 (open-source-course-project)"
        return httpx.Response(200, json={
            "status": "success",
            "product": {
                "product_name": "예시 시리얼",
                "brands": "Example Brand, Other",
                "categories": "en:breakfasts",
                "quantity": "300 g",
            },
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        candidate = OpenFoodFactsResolver(client=client).lookup("4900000000000")

    assert candidate is not None
    assert candidate.source == "open_food_facts"
    assert candidate.canonical_name == "예시 시리얼"
    assert candidate.brand == "Example Brand"
    assert candidate.quantity_text == "300 g"
    assert candidate.confidence < 1


def test_open_food_facts_success_with_errors_keeps_product_and_surfaces_warning() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json={
            "status": "success_with_errors",
            "product": {"product_name": "경고가 있는 상품"},
            "warnings": [{"id": "partial_product"}],
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = OpenFoodFactsResolver(client=client).lookup_result("4900000000000")

    assert outcome.status == "matched"
    assert outcome.candidate is not None
    assert outcome.candidate.canonical_name == "경고가 있는 상품"
    assert outcome.detail is not None
    assert "경고" in outcome.detail


def test_open_food_facts_v3_rate_limit_status_is_retryable() -> None:
    for response_status in (429, 503):
        def handler(request: httpx.Request, response_status=response_status) -> httpx.Response:
            del request
            return httpx.Response(response_status, json={"status": "failure"})

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            outcome = OpenFoodFactsResolver(client=client).lookup_result("4900000000000")

        assert outcome.status == "rate_limited"
        assert outcome.candidate is None
        assert outcome.detail is not None
        assert "한도" in outcome.detail


def test_open_food_facts_api_version_rejects_path_injection_and_falls_back() -> None:
    resolver = OpenFoodFactsResolver(api_version="../../cgi/product")

    assert resolver.api_version == "v3.6"


def test_open_food_facts_name_search_returns_low_confidence_metadata_only() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/cgi/search.pl"
        assert request.url.params["search_terms"] == "두부"
        assert request.url.params["search_simple"] == "1"
        assert request.url.params["page_size"] == "5"
        assert request.url.params["json"] == "1"
        assert request.headers["user-agent"] == "RescueMeal/1.0 (contact@example.org)"
        return httpx.Response(200, json={
            "count": 2,
            "products": [
                {
                    "code": "8800000000001",
                    "product_name_ko": "국산콩 두부",
                    "brands": "예시 브랜드",
                    "categories": "en/tofus",
                    "quantity": "300 g",
                },
                {"code": "8800000000001", "product_name_ko": "국산콩 두부"},
            ],
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = OpenFoodFactsResolver(
            base_url="https://off.test",
            user_agent="RescueMeal/1.0 (contact@example.org)",
            client=client,
            cache=ProductNameLookupCache(),
        ).lookup_by_product_name("두부")

    assert outcome.provider == "open_food_facts"
    assert outcome.status == "matched"
    assert len(outcome.candidates) == 1
    candidate = outcome.candidates[0]
    assert candidate.source == "open_food_facts"
    assert candidate.canonical_name == "국산콩 두부"
    assert candidate.source_url == "https://off.test/product/8800000000001"
    assert candidate.shelf_life_text is None
    assert candidate.storage_hint is None
    assert candidate.confidence <= 0.66
    assert "실제 상품명" in candidate.provenance_note


def test_open_food_facts_name_search_cache_avoids_duplicate_calls() -> None:
    calls = [0]

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        calls[0] += 1
        return httpx.Response(200, json={
            "products": [{"code": "8800000000002", "product_name": "캐시 두부"}],
        })

    cache = ProductNameLookupCache()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolver = OpenFoodFactsResolver(base_url="https://off.test", client=client, cache=cache)
        first = resolver.lookup_by_product_name("캐시 두부")
        second = resolver.lookup_by_product_name("캐시 두부")

    assert first.status == "matched"
    assert second.status == "matched"
    assert calls[0] == 1


def test_open_food_facts_name_search_rejects_punctuation_only_without_network_call() -> None:
    calls = [0]

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        calls[0] += 1
        return httpx.Response(200, json={"products": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = OpenFoodFactsResolver(
            base_url="https://off.test",
            client=client,
            cache=ProductNameLookupCache(),
        ).lookup_by_product_name("--- ___ ...")

    assert outcome.status == "not_found"
    assert outcome.candidates == []
    assert outcome.detail is not None
    assert "검색 가능한 문자" in outcome.detail
    assert calls[0] == 0


def test_open_food_facts_name_search_uses_dedicated_rate_limit_bucket() -> None:
    class DenyingLimiter:
        def __init__(self) -> None:
            self.providers: list[str] = []

        def allow(self, provider: str, *, now: float | None = None) -> bool:
            del now
            self.providers.append(provider)
            return False

    calls = [0]

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        calls[0] += 1
        return httpx.Response(200, json={"products": []})

    limiter = DenyingLimiter()
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = OpenFoodFactsResolver(
            base_url="https://off.test",
            client=client,
            cache=ProductNameLookupCache(),
            rate_limiter=limiter,
        ).lookup_by_product_name("두부")

    assert outcome.status == "rate_limited"
    assert limiter.providers == ["open_food_facts_search"]
    assert calls[0] == 0


def test_product_name_fallback_resolver_uses_open_food_facts_only_after_primary_miss() -> None:
    class Primary:
        def lookup_by_product_name(self, product_name: str, *, limit: int) -> ProductNameLookupResult:
            assert product_name == "해외 두부"
            assert limit == 5
            return ProductNameLookupResult("mfds_i1250", "not_found", detail="I1250 후보 없음")

    class Fallback:
        def lookup_by_product_name(self, product_name: str, *, limit: int) -> ProductNameLookupResult:
            assert product_name == "해외 두부"
            assert limit == 5
            return ProductNameLookupResult(
                "open_food_facts",
                "matched",
                [ProductCandidate(
                    source="open_food_facts",
                    source_url="https://off.test/product/1",
                    canonical_name="해외 두부",
                    brand=None,
                    category=None,
                    quantity_text="300 g",
                    confidence=0.66,
                    provenance_note="검색 후보",
                )],
            )

    outcome = ProductNameFallbackResolver(primary=Primary(), fallback=Fallback()).lookup_by_product_name("해외 두부")

    assert outcome.provider == "open_food_facts"
    assert outcome.status == "matched"
    assert outcome.candidates[0].source == "open_food_facts"
    assert outcome.detail == "I1250 후보 없음 공개 상품 DB 후보를 추가로 확인했습니다."


def test_mfds_c005_candidate_keeps_product_shelf_life_as_legacy_hint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/demo-key/C005/json/1/1"
        assert request.url.params["BAR_CD"] == "8801791000055"
        return httpx.Response(200, json={
            "C005": {
                "RESULT": {"CODE": "INFO-000", "MSG": "정상 처리되었습니다."},
                "row": [{
                    "PRDLST_REPORT_NO": "195505090011",
                    "PRDLST_NM": "매일맛있는진간장골드",
                    "POG_DAYCNT": "실온보관 2년",
                    "PRDLST_DCNM": "혼합간장",
                    "BSSH_NM": "매일식품주식회사",
                    "BAR_CD": "8801791000055",
                }],
            },
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = MfdsC005Resolver(base_url="https://mfds.test", api_key="demo-key", client=client).lookup_result("8801791000055")

    assert outcome.status == "matched"
    assert outcome.candidate is not None
    assert outcome.candidate.source == "mfds_c005"
    assert outcome.candidate.shelf_life_text == "실온보관 2년"
    assert outcome.candidate.storage_hint == "ambient"
    assert outcome.candidate.source_freshness == "legacy"
    assert "개별 라벨" in outcome.candidate.provenance_note


def test_mfds_c005_requires_a_server_side_api_key() -> None:
    outcome = MfdsC005Resolver(api_key="").lookup_result("8801791000055")

    assert outcome.status == "unavailable"
    assert outcome.candidate is None
    assert outcome.detail is not None
    assert "API key" in outcome.detail


def test_mfds_c005_does_not_accept_a_row_for_a_different_barcode() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json={
            "C005": {
                "RESULT": {"CODE": "INFO-000", "MSG": "정상 처리되었습니다."},
                "row": [{"BAR_CD": "8800000000000", "PRDLST_NM": "다른 상품"}],
            },
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = MfdsC005Resolver(base_url="https://mfds.test", api_key="demo-key", client=client).lookup_result("8801791000055")

    assert outcome.status == "not_found"
    assert outcome.candidate is None


def test_mfds_c005_turns_quota_response_into_rate_limited_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json={
            "C005": {
                "RESULT": {"CODE": "INFO-300", "MSG": "유효 호출건수를 이미 초과하셨습니다."},
                "row": [],
            },
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = MfdsC005Resolver(base_url="https://mfds.test", api_key="demo-key", client=client).lookup_result("8801791000055")

    assert outcome.status == "rate_limited"
    assert outcome.candidate is None
    assert outcome.detail is not None
    assert "INFO-300" in outcome.detail


def test_mfds_i1250_name_lookup_returns_product_period_as_review_candidate() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/demo-key/I1250/json/1/5"
        assert request.url.params["PRDLST_NM"] == "진간장"
        return httpx.Response(200, json={
            "I1250": {
                "RESULT": {"CODE": "INFO-000", "MSG": "정상 처리되었습니다."},
                "row": [{
                    "PRDLST_REPORT_NO": "195505090014",
                    "PRDLST_NM": "매일맛있는진간장",
                    "BSSH_NM": "매일식품주식회사",
                    "PRDLST_DCNM": "혼합간장",
                    "POG_DAYCNT": "실온보관 2년",
                }],
            },
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = MfdsI1250Resolver(base_url="https://mfds.test", api_key="demo-key", client=client).lookup_by_product_name("진간장")

    assert outcome.status == "matched"
    assert len(outcome.candidates) == 1
    candidate = outcome.candidates[0]
    assert candidate.source == "mfds_i1250"
    assert candidate.canonical_name == "매일맛있는진간장"
    assert candidate.shelf_life_text == "실온보관 2년"
    assert candidate.storage_hint == "ambient"
    assert candidate.source_freshness == "unknown"
    assert candidate.confidence >= 0.55


def test_mfds_i1250_name_lookup_cache_avoids_duplicate_provider_calls() -> None:
    now = [0.0]
    calls = [0]

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        calls[0] += 1
        return httpx.Response(200, json={
            "I1250": {
                "RESULT": {"CODE": "INFO-000", "MSG": "정상 처리되었습니다."},
                "row": [{"PRDLST_NM": "진간장", "POG_DAYCNT": "실온보관 2년"}],
            },
        })

    cache = ProductNameLookupCache(ttl_seconds=10, clock=lambda: now[0])
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        resolver = MfdsI1250Resolver(base_url="https://mfds.test", api_key="demo-key", client=client, cache=cache)
        first = resolver.lookup_by_product_name("진간장")
        second = resolver.lookup_by_product_name("진간장")
        now[0] = 11
        third = resolver.lookup_by_product_name("진간장")

    assert first.status == "matched"
    assert second.status == "matched"
    assert third.status == "matched"
    assert calls[0] == 2


def test_product_lookup_cache_deduplicates_until_ttl_then_retries() -> None:
    now = [0.0]
    calls = [0]

    class CandidateProvider:
        def lookup_result(self, barcode: str) -> ProviderLookupResult:
            calls[0] += 1
            return ProviderLookupResult(
                "fake",
                "matched",
                ProductCandidate(
                    source="open_food_facts",
                    source_url="https://example.test/product/" + barcode,
                    canonical_name="캐시 상품",
                    brand=None,
                    category=None,
                    quantity_text=None,
                    confidence=0.5,
                    provenance_note="fixture",
                ),
            )

    cache = ProductLookupCache(ttl_seconds=10, clock=lambda: now[0])
    providers = [("fake", CandidateProvider())]

    first = resolve_product("4900000000000", enable_external=True, cache=cache, providers=providers)
    second = resolve_product("4900000000000", enable_external=True, cache=cache, providers=providers)
    now[0] = 11
    third = resolve_product("4900000000000", enable_external=True, cache=cache, providers=providers)

    assert first.status == "matched"
    assert second.candidates[0].canonical_name == "캐시 상품"
    assert third.status == "matched"
    assert calls[0] == 2


def test_shared_product_cache_is_visible_from_a_second_sqlite_connection_and_expires(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    current_time = [1_000.0]
    try:
        first_cache = SharedProductLookupCache(first_connection, dialect="sqlite", success_ttl_seconds=60, clock=lambda: current_time[0])
        second_cache = SharedProductLookupCache(second_connection, dialect="sqlite", success_ttl_seconds=60, clock=lambda: current_time[0])
        result = ProductLookupResult(
            barcode="4900000000000",
            status="matched",
            candidates=[ProductCandidate(
                source="open_food_facts",
                source_url="https://example.test/product/4900000000000",
                canonical_name="공용 캐시 상품",
                brand="테스트 브랜드",
                category="식품",
                quantity_text="300 g",
                confidence=0.62,
                provenance_note="shared cache fixture",
            )],
            warnings=[],
            requires_review=True,
            provider_statuses={"open_food_facts": "matched"},
        )

        first_cache.put(result.barcode, result)
        restored = second_cache.get(result.barcode)
        assert restored is not None
        assert restored.candidates[0].canonical_name == "공용 캐시 상품"

        current_time[0] = 1_061.0
        assert second_cache.get(result.barcode) is None
        assert second_connection.execute("SELECT COUNT(*) FROM product_lookup_cache").fetchone()[0] == 0
    finally:
        first_connection.close()
        second_connection.close()


def test_shared_provider_rate_limit_and_cache_prevent_cross_worker_duplicate_calls(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    current_time = [2_000.0]
    calls = [0]
    try:
        first_cache = SharedProductLookupCache(first_connection, dialect="sqlite", clock=lambda: current_time[0])
        second_cache = SharedProductLookupCache(second_connection, dialect="sqlite", clock=lambda: current_time[0])
        first_limiter = SharedProductProviderRateLimiter(first_connection, dialect="sqlite", max_requests=1, window_seconds=60, clock=lambda: current_time[0])
        second_limiter = SharedProductProviderRateLimiter(second_connection, dialect="sqlite", max_requests=1, window_seconds=60, clock=lambda: current_time[0])

        class CountingProvider:
            def lookup_result(self, barcode: str) -> ProviderLookupResult:
                calls[0] += 1
                return ProviderLookupResult(
                    "open_food_facts",
                    "matched",
                    ProductCandidate(
                        source="open_food_facts",
                        source_url=f"https://example.test/product/{barcode}",
                        canonical_name="중복 방지 상품",
                        brand=None,
                        category=None,
                        quantity_text=None,
                        confidence=0.62,
                        provenance_note="shared provider fixture",
                    ),
                )

        providers = [("open_food_facts", CountingProvider())]
        first = resolve_product("4900000000000", enable_external=True, cache=first_cache, rate_limiter=first_limiter, providers=providers)
        second = resolve_product("4900000000000", enable_external=True, cache=second_cache, rate_limiter=second_limiter, providers=providers)

        assert first.status == "matched"
        assert second.status == "matched"
        assert second.candidates[0].canonical_name == "중복 방지 상품"
        assert calls[0] == 1
        assert first_limiter.allow("open_food_facts") is False
        current_time[0] += 60
        assert second_limiter.allow("open_food_facts") is True
    finally:
        first_connection.close()
        second_connection.close()


def test_shared_product_lookup_single_flight_allows_one_owner_and_recovers_after_expiry(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    current_time = [3_000.0]
    try:
        first_cache = SharedProductLookupCache(first_connection, dialect="sqlite", single_flight_lease_seconds=30, clock=lambda: current_time[0])
        second_cache = SharedProductLookupCache(second_connection, dialect="sqlite", single_flight_lease_seconds=30, clock=lambda: current_time[0])

        assert first_cache.try_acquire("4900000000000", owner_id="worker-a") is True
        assert second_cache.try_acquire("4900000000000", owner_id="worker-b") is False

        current_time[0] += 31
        assert second_cache.try_acquire("4900000000000", owner_id="worker-b") is True
        first_cache.release("4900000000000", owner_id="worker-a")
        assert second_connection.execute("SELECT COUNT(*) FROM product_lookup_leases").fetchone()[0] == 1
        second_cache.release("4900000000000", owner_id="worker-b")
        assert second_connection.execute("SELECT COUNT(*) FROM product_lookup_leases").fetchone()[0] == 0
    finally:
        first_connection.close()
        second_connection.close()


def test_shared_product_name_cache_is_visible_from_a_second_sqlite_connection_and_expires(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-name-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    current_time = [4_000.0]
    try:
        first_cache = SharedProductNameLookupCache(first_connection, dialect="sqlite", success_ttl_seconds=60, clock=lambda: current_time[0])
        second_cache = SharedProductNameLookupCache(second_connection, dialect="sqlite", success_ttl_seconds=60, clock=lambda: current_time[0])
        result = ProductNameLookupResult(
            provider="mfds_i1250",
            status="matched",
            candidates=[ProductCandidate(
                source="mfds_i1250",
                source_url="https://example.test/i1250",
                canonical_name="공용 이름 캐시 상품",
                brand="테스트 제조사",
                category="식품",
                quantity_text=None,
                confidence=0.7,
                provenance_note="shared name cache fixture",
                shelf_life_text="실온보관 1년",
                storage_hint="ambient",
                source_freshness="unknown",
            )],
            detail=None,
        )

        first_cache.put("공용상품:5", result)
        restored = second_cache.get("공용상품:5")
        assert restored is not None
        assert restored.candidates[0].canonical_name == "공용 이름 캐시 상품"
        assert restored.candidates[0].shelf_life_text == "실온보관 1년"

        current_time[0] = 4_061.0
        assert second_cache.get("공용상품:5") is None
        assert second_connection.execute("SELECT COUNT(*) FROM product_name_lookup_cache").fetchone()[0] == 0
    finally:
        first_connection.close()
        second_connection.close()


def test_shared_product_name_single_flight_recovers_after_owner_expiry(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-name-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    current_time = [5_000.0]
    try:
        first_cache = SharedProductNameLookupCache(first_connection, dialect="sqlite", single_flight_lease_seconds=30, clock=lambda: current_time[0])
        second_cache = SharedProductNameLookupCache(second_connection, dialect="sqlite", single_flight_lease_seconds=30, clock=lambda: current_time[0])

        assert first_cache.try_acquire("이름:5", owner_id="worker-a") is True
        assert second_cache.try_acquire("이름:5", owner_id="worker-b") is False
        current_time[0] += 31
        assert second_cache.try_acquire("이름:5", owner_id="worker-b") is True
        first_cache.release("이름:5", owner_id="worker-a")
        assert second_connection.execute("SELECT COUNT(*) FROM product_name_lookup_leases WHERE owner_id = ?", ("worker-b",)).fetchone()[0] == 1
        second_cache.release("이름:5", owner_id="worker-b")
    finally:
        first_connection.close()
        second_connection.close()


def test_i1250_resolver_uses_shared_name_cache_and_provider_limiter(tmp_path: Path) -> None:
    database_path = tmp_path / "provider-name-runtime.db"
    first_connection = sqlite3.connect(database_path)
    second_connection = sqlite3.connect(database_path)
    calls = [0]
    try:
        first_cache = SharedProductNameLookupCache(first_connection, dialect="sqlite")
        second_cache = SharedProductNameLookupCache(second_connection, dialect="sqlite")
        first_limiter = SharedProductProviderRateLimiter(first_connection, dialect="sqlite", max_requests=1, window_seconds=60)
        second_limiter = SharedProductProviderRateLimiter(second_connection, dialect="sqlite", max_requests=1, window_seconds=60)

        def handler(request: httpx.Request) -> httpx.Response:
            calls[0] += 1
            assert request.url.path == "/api/demo-key/I1250/json/1/5"
            return httpx.Response(200, json={
                "I1250": {
                    "RESULT": {"CODE": "INFO-000", "MSG": "정상 처리되었습니다."},
                    "row": [{"PRDLST_NM": "공용상품", "BSSH_NM": "테스트 제조사", "POG_DAYCNT": "실온보관 1년"}],
                },
            })

        with httpx.Client(transport=httpx.MockTransport(handler)) as first_http, httpx.Client(transport=httpx.MockTransport(handler)) as second_http:
            first = MfdsI1250Resolver(base_url="https://mfds.test", api_key="demo-key", client=first_http, cache=first_cache, rate_limiter=first_limiter).lookup_by_product_name("공용상품")
            second = MfdsI1250Resolver(base_url="https://mfds.test", api_key="demo-key", client=second_http, cache=second_cache, rate_limiter=second_limiter).lookup_by_product_name("공용상품")

        assert first.status == "matched"
        assert second.status == "matched"
        assert second.candidates[0].canonical_name == "공용상품"
        assert calls[0] == 1

        different_query = MfdsI1250Resolver(
            base_url="https://mfds.test",
            api_key="demo-key",
            client=httpx.Client(transport=httpx.MockTransport(handler)),
            cache=second_cache,
            rate_limiter=second_limiter,
        )
        try:
            limited = different_query.lookup_by_product_name("다른상품")
        finally:
            different_query.client.close()
        assert limited.status == "rate_limited"
        assert calls[0] == 1
    finally:
        first_connection.close()
        second_connection.close()


def test_product_provider_metrics_snapshot_contains_only_safe_aggregates() -> None:
    metrics = ProductProviderRuntimeMetrics(clock=lambda: 1234.5)
    metrics.record_cache("barcode", hit=False)
    metrics.record_cache("barcode", hit=True)
    metrics.record_single_flight("barcode", "wait")
    metrics.record_single_flight("barcode", "hit")
    metrics.record_provider_call("barcode", "open_food_facts", status="matched", latency_ms=12.345)
    metrics.record_rate_limited("product_name", "mfds_i1250")

    snapshot = metrics.snapshot()
    serialized = str(snapshot)
    assert all(not any(key in item for key in ("barcode", "product_name", "query", "raw_text")) for item in snapshot)
    assert any(item["scope"] == "barcode" and item["provider"] == "cache" and item["cache_hits"] == 1 and item["cache_misses"] == 1 for item in snapshot)
    assert any(item["scope"] == "barcode" and item["provider"] == "open_food_facts" and item["provider_calls"] == 1 and item["last_latency_ms"] == 12.35 for item in snapshot)
    assert any(item["scope"] == "product_name" and item["provider"] == "mfds_i1250" and item["rate_limited"] == 1 for item in snapshot)
    assert "4900000000000" not in serialized
    assert "공용상품" not in serialized


def test_receipt_name_resolution_prefers_user_alias_then_local_rule_then_parser() -> None:
    aliased = resolve_receipt_name(
        "서울우유1L",
        parser_name="서울우유1L",
        parser_confidence=0.58,
        user_aliases={"서울우유1L": "서울우유 나100% 1L"},
    )
    local = resolve_receipt_name("국내산 시금치", parser_name="시금치", parser_confidence=0.9)
    parser = resolve_receipt_name("이름 모를 소스", parser_name="이름 모를 소스", parser_confidence=0.58)

    assert aliased.source == "user_confirmed_alias"
    assert aliased.canonical_name == "서울우유 나100% 1L"
    assert aliased.candidates[0].confidence > local.candidates[0].confidence
    assert local.source == "local_rule"
    assert local.canonical_name == "시금치"
    assert parser.source == "parser"
    assert parser.confidence == 0.58
