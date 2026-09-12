from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.main as main_module
from app.auth import issue_guest_token
from app.grocy_worker import GrocyWorker, GrocyWorkerSettings, GROCY_OUTBOX_LEASE_KEY
from app.main import InMemoryStore, WorkspaceStoreRouter


client = TestClient(main_module.app)


def setup_function() -> None:
    main_module.store.reset()


def _settings(*workspace_ids: str) -> GrocyWorkerSettings:
    return GrocyWorkerSettings(
        workspace_ids=workspace_ids,
        worker_id="worker-test",
        interval_seconds=5,
        lease_seconds=30,
        stale_after_seconds=60,
        process_limit=20,
    )


def test_worker_settings_deduplicate_and_bound_environment_values(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_GROCY_WORKSPACE_IDS", "demo, workspace-a, demo")
    monkeypatch.setenv("RESCUE_MEAL_GROCY_WORKER_ID", "worker-env")
    monkeypatch.setenv("RESCUE_MEAL_GROCY_WORKER_INTERVAL_SECONDS", "1")
    monkeypatch.setenv("RESCUE_MEAL_GROCY_WORKER_LEASE_SECONDS", "99999")
    monkeypatch.setenv("RESCUE_MEAL_GROCY_STALE_AFTER_SECONDS", "10")
    monkeypatch.setenv("RESCUE_MEAL_GROCY_PROCESS_LIMIT", "999")

    settings = GrocyWorkerSettings.from_env()

    assert settings.workspace_ids == ("demo", "workspace-a")
    assert settings.worker_id == "worker-env"
    assert settings.interval_seconds == 5
    assert settings.lease_seconds == 3600
    assert settings.stale_after_seconds == 60
    assert settings.process_limit == 100


def test_worker_tick_processes_each_configured_workspace_and_releases_lease() -> None:
    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    calls: list[tuple[str, str, int]] = []

    def scan(**kwargs):
        calls.append(("scan", kwargs["worker_id"], kwargs["limit"]))
        return SimpleNamespace(scanned=2, marked=1)

    def process(limit: int, **kwargs):
        calls.append(("process", kwargs["worker_id"], limit))
        return SimpleNamespace(processed=3, succeeded=2, retried=1, dead_lettered=0, blocked=0)

    worker = GrocyWorker(
        store=store,
        settings=_settings("workspace-a", "workspace-b"),
        grocy_configured=lambda: True,
        scan=scan,
        process=process,
    )

    results = worker.tick()

    assert [result.workspace_id for result in results] == ["workspace-a", "workspace-b"]
    assert all(result.lease_acquired and result.grocy_configured for result in results)
    assert all(result.scanned == 2 and result.reconciliation_marked == 1 for result in results)
    assert all(result.processed == 3 and result.succeeded == 2 and result.retried == 1 for result in results)
    assert calls == [
        ("scan", "worker-test", 20),
        ("process", "worker-test", 20),
        ("scan", "worker-test", 20),
        ("process", "worker-test", 20),
    ]
    assert store._stores["workspace-a"].grocy_worker_leases == {}
    assert store._stores["workspace-b"].grocy_worker_leases == {}
    assert store._stores["workspace-a"].grocy_worker_heartbeats["worker-test"].processed == 3
    assert store._stores["workspace-b"].grocy_worker_heartbeats["worker-test"].last_success_at is not None


def test_worker_skips_workspace_when_another_worker_holds_lease() -> None:
    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    store.provision_workspace("workspace-a", seed=False)
    held_store = store._stores["workspace-a"]
    assert held_store.acquire_grocy_worker_lease(
        lease_key=GROCY_OUTBOX_LEASE_KEY,
        worker_id="worker-other",
        lease_seconds=120,
    ) is True
    calls: list[str] = []

    worker = GrocyWorker(
        store=store,
        settings=_settings("workspace-a"),
        grocy_configured=lambda: True,
        scan=lambda **kwargs: calls.append("scan"),
        process=lambda *args, **kwargs: calls.append("process"),
    )

    result = worker.tick()[0]

    assert result.lease_acquired is False
    assert result.processed == 0
    assert calls == []
    assert held_store.grocy_worker_heartbeats["worker-test"].lease_acquired is False
    assert held_store.release_grocy_worker_lease(lease_key=GROCY_OUTBOX_LEASE_KEY, worker_id="worker-other") is True


def test_worker_run_once_yields_one_tick_without_sleep() -> None:
    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    worker = GrocyWorker(
        store=store,
        settings=_settings("workspace-a"),
        grocy_configured=lambda: False,
        scan=lambda **kwargs: SimpleNamespace(scanned=0, marked=0),
        process=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("disabled worker must not process")),
    )

    runs = list(worker.run(once=True, sleep=lambda _: (_ for _ in ()).throw(AssertionError("once must not sleep"))))

    assert len(runs) == 1
    assert runs[0][0].grocy_configured is False
    assert runs[0][0].lease_acquired is True


def test_internal_worker_tick_requires_service_token_and_records_heartbeat(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_GROCY_WORKER_TOKEN", "worker-secret")
    monkeypatch.setattr(main_module, "grocy_client", None)

    unauthorized = client.post(
        "/api/internal/grocy/workspaces/worker-api-test/tick",
        json={"worker_id": "worker-api-test"},
    )
    forbidden = client.post(
        "/api/internal/grocy/workspaces/worker-api-test/tick",
        headers={"X-Rescue-Meal-Grocy-Worker-Token": "wrong"},
        json={"worker_id": "worker-api-test"},
    )
    tick = client.post(
        "/api/internal/grocy/workspaces/worker-api-test/tick",
        headers={"X-Rescue-Meal-Grocy-Worker-Token": "worker-secret"},
        json={"worker_id": "worker-api-test", "process_limit": 5},
    )

    assert unauthorized.status_code == 401
    assert forbidden.status_code == 403
    assert tick.status_code == 200
    assert tick.json()["workspace_id"] == "worker-api-test"
    assert tick.json()["lease_acquired"] is True
    assert tick.json()["grocy_configured"] is False
    workspace_store = main_module.store._stores["worker-api-test"]
    assert workspace_store.grocy_worker_heartbeats["worker-api-test"].last_success_at is not None
    guest_token, _ = issue_guest_token("worker-api-test")
    heartbeat_status = client.get(
        "/api/integrations/grocy/worker/status",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert heartbeat_status.status_code == 200
    assert heartbeat_status.json()[0]["worker_id"] == "worker-api-test"
