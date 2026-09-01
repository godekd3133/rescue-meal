import httpx

from app.product_resolver import OpenFoodFactsResolver, resolve_product


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
        assert request.url.path.endswith("/api/v2/product/4900000000000")
        assert request.url.params["lc"] == "ko"
        return httpx.Response(200, json={
            "status": 1,
            "product": {
                "product_name": "Example Cereal",
                "product_name_ko": "예시 시리얼",
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
