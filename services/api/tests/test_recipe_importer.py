from datetime import datetime, timezone

import httpx
import pytest

from app.recipe_importer import (
    COOKRCP_SERVICE_ID,
    CookRcpClient,
    CookRcpConfig,
    CookRcpImportError,
    parse_cookrcp_payload,
)


def _payload() -> dict:
    return {
        COOKRCP_SERVICE_ID: {
            "total_count": "1",
            "row": [
                {
                    "RCP_SEQ": "123",
                    "RCP_NM": "두부 시금치 볶음",
                    "RCP_PAT2": "반찬",
                    "RCP_WAY2": "볶음",
                    "RCP_PARTS_DTLS": "두부 1모\n시금치 100g\n소금 약간",
                    "ATT_FILE_NO_MAIN": "https://example.com/recipe.png",
                    "MANUAL01": "1. 재료의 상태를 확인합니다.",
                    "MANUAL02": "2. 팬에 볶습니다.",
                }
            ],
        }
    }


def test_config_requires_key_and_clamps_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FOODSAFETY_COOKRCP_API_KEY", raising=False)
    assert CookRcpConfig.from_env() is None

    monkeypatch.setenv("FOODSAFETY_COOKRCP_API_KEY", "test-key")
    monkeypatch.setenv("FOODSAFETY_COOKRCP_TIMEOUT_SECONDS", "99")
    config = CookRcpConfig.from_env()
    assert config is not None
    assert config.timeout_seconds == 30.0


def test_parser_keeps_cookrcp_rows_as_reviewable_provenance_drafts() -> None:
    result = parse_cookrcp_payload(_payload(), retrieved_at=datetime(2026, 9, 2, tzinfo=timezone.utc))

    assert result.total_count == 1
    assert result.source_revision == COOKRCP_SERVICE_ID
    draft = result.drafts[0]
    assert draft.source_id == "cookrcp-123"
    assert draft.title == "두부 시금치 볶음"
    assert draft.requires_review is True
    assert draft.license == "public-api-terms-review-required"
    assert draft.ingredients[0].parsed_name == "두부"
    assert draft.ingredients[0].amount == 1
    assert draft.ingredients[0].unit == "모"
    assert draft.ingredients[2].parsed_name is None
    assert draft.steps == ("재료의 상태를 확인합니다.", "팬에 볶습니다.")


def test_parser_rejects_missing_service_payload() -> None:
    with pytest.raises(CookRcpImportError, match="서비스 payload"):
        parse_cookrcp_payload({})


def test_parser_quarantines_bad_rows_and_keeps_valid_rows() -> None:
    payload = _payload()
    payload[COOKRCP_SERVICE_ID]["row"].extend([
        {"RCP_NM": "식별자 없는 레시피"},
        "not-an-object",
    ])

    result = parse_cookrcp_payload(payload)

    assert [draft.source_id for draft in result.drafts] == ["cookrcp-123"]
    assert [(item.row_index, item.reason) for item in result.rejected_rows] == [
        (1, "COOKRCP01 row에 RCP_SEQ가 없습니다."),
        (2, "row가 객체가 아닙니다."),
    ]


def test_client_uses_keyed_path_and_query_filters_without_promoting_rows() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_payload(), request=request)

    config = CookRcpConfig(api_key="private/key")
    with httpx.Client(transport=httpx.MockTransport(handler), base_url=config.base_url) as http_client:
        adapter = CookRcpClient(config, client=http_client)
        result = adapter.fetch(start_idx=2, end_idx=3, menu_name="두부", category="반찬")

    assert result.drafts[0].requires_review is True
    assert len(requests) == 1
    request_url = str(requests[0].url)
    assert "private%2Fkey" in request_url
    assert f"/{COOKRCP_SERVICE_ID}/json/2/3" in request_url
    assert requests[0].url.params["RCP_NM"] == "두부"
    assert requests[0].url.params["RCP_PAT2"] == "반찬"


def test_client_does_not_leak_api_key_on_upstream_failure() -> None:
    secret = "private-api-key"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text=f"upstream detail {secret}", request=request)

    config = CookRcpConfig(api_key=secret)
    with httpx.Client(transport=httpx.MockTransport(handler), base_url=config.base_url) as http_client:
        adapter = CookRcpClient(config, client=http_client)
        with pytest.raises(CookRcpImportError) as error:
            adapter.fetch()

    assert "503" in str(error.value)
    assert secret not in str(error.value)
