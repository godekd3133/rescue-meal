import json
import logging

from app.observability import JsonAccessLogFormatter, RequestRuntimeMetrics, log_request, request_id_from_header, route_template_from_scope


def test_request_id_accepts_safe_header_and_replaces_invalid_value() -> None:
    assert request_id_from_header("mobile-session:1") == "mobile-session:1"
    generated = request_id_from_header("contains whitespace")
    assert generated.startswith("rm-")
    assert len(generated) == 27


def test_json_access_log_formatter_keeps_request_fields_without_sensitive_data() -> None:
    record = logging.LogRecord("rescue_meal.access", logging.INFO, __file__, 1, "http_request", (), None)
    record.request_id = "rm-test"
    record.method = "GET"
    record.path = "/ready"
    record.status_code = 200
    record.duration_ms = 1.25

    payload = json.loads(JsonAccessLogFormatter().format(record))

    assert payload["event"] == "http_request"
    assert payload["request_id"] == "rm-test"
    assert payload["method"] == "GET"
    assert payload["path"] == "/ready"
    assert payload["status_code"] == 200
    assert payload["duration_ms"] == 1.25
    assert "password" not in payload
    assert "Authorization" not in payload


def test_json_access_log_formatter_can_group_redacted_client_errors() -> None:
    record = logging.LogRecord("rescue_meal.client_error", logging.WARNING, __file__, 1, "client_error", (), None)
    record.request_id = "client-error-1"
    record.surface = "prototype"
    record.error_kind = "type_error"
    record.release = "web-2026.09.03"

    payload = json.loads(JsonAccessLogFormatter().format(record))

    assert payload["event"] == "client_error"
    assert payload["request_id"] == "client-error-1"
    assert payload["surface"] == "prototype"
    assert payload["error_kind"] == "type_error"
    assert payload["release"] == "web-2026.09.03"
    assert "message" not in payload
    assert "stack" not in payload


def test_log_request_preserves_a_safe_route_template_and_rejects_invalid_route_values(monkeypatch) -> None:
    captured = {}

    def capture_info(message, *, extra):
        captured.update(extra)

    monkeypatch.setattr("app.observability._access_logger.info", capture_info)
    class Route:
        path = "/api/foods/{food_id}"

    log_request(request_id="rm-test", method="GET", scope={"route": Route()}, status_code=200, started_at=0)

    assert captured["path"] == "/api/foods/{food_id}"

    captured.clear()
    log_request(request_id="rm-test", method="GET", scope={"route": object()}, status_code=404, started_at=0)
    assert captured["path"] == "__unmatched__"


def test_request_runtime_metrics_bound_route_cardinality_and_histogram() -> None:
    class Route:
        path = "/api/foods/{food_id}"

    assert route_template_from_scope({"route": Route()}) == "/api/foods/{food_id}"
    assert route_template_from_scope({"route": object()}) == "__unmatched__"

    metrics = RequestRuntimeMetrics(max_routes=1)
    metrics.start()
    metrics.observe(method="GET", route="/api/foods/{food_id}", status_code=200, duration_seconds=0.08)
    metrics.start()
    metrics.observe(method="GET", route="/api/foods/secret-user-id", status_code=500, duration_seconds=2.1)

    rendered = metrics.prometheus_text()

    assert 'route="/api/foods/{food_id}"' in rendered
    assert 'route="__other__"' in rendered
    assert "secret-user-id" not in rendered
    assert 'status="500"' in rendered
    assert 'le="0.1"' in rendered
    assert 'le="+Inf"' in rendered
    assert "rescue_meal_http_requests_in_flight 0" in rendered
