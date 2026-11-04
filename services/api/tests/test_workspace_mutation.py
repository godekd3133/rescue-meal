from contextlib import contextmanager

import pytest

from app.workspace_mutation import WorkspaceMutation


class ConcurrentWrite(RuntimeError):
    pass


class FakeStore:
    def __init__(self) -> None:
        self.value = {"count": 0}
        self.flush_error: Exception | None = None
        self.restores = 0
        self.lock_depth = 0

    @contextmanager
    def mutation_lock(self):
        self.lock_depth += 1
        try:
            yield
        finally:
            self.lock_depth -= 1

    def snapshot(self):
        return dict(self.value)

    def restore(self, snapshot) -> None:
        self.value = dict(snapshot)
        self.restores += 1

    def flush(self) -> None:
        if self.flush_error is not None:
            raise self.flush_error


def test_workspace_mutation_restores_process_state_after_regular_failure() -> None:
    store = FakeStore()
    mutation = WorkspaceMutation(store, ConcurrentWrite)
    store.flush_error = RuntimeError("persistence unavailable")

    with pytest.raises(RuntimeError, match="persistence unavailable"):
        mutation.run(lambda: store.value.update(count=1))

    assert store.value == {"count": 0}
    assert store.restores == 1


def test_workspace_mutation_does_not_restore_after_a_concurrent_write_conflict() -> None:
    store = FakeStore()
    mutation = WorkspaceMutation(store, ConcurrentWrite)

    def conflict():
        store.value["count"] = 1
        raise ConcurrentWrite("winner committed elsewhere")

    with pytest.raises(ConcurrentWrite, match="winner committed elsewhere"):
        mutation.run(conflict)

    assert store.value == {"count": 1}
    assert store.restores == 0


def test_workspace_mutation_returns_the_mutation_result_after_flush() -> None:
    store = FakeStore()
    mutation = WorkspaceMutation(store, ConcurrentWrite)

    result = mutation.run(lambda: "committed")

    assert result == "committed"
    assert store.restores == 0


def test_workspace_mutation_holds_the_store_lock_across_snapshot_mutation_and_flush() -> None:
    store = FakeStore()
    mutation = WorkspaceMutation(store, ConcurrentWrite)
    observed_lock_depth: list[int] = []

    mutation.run(lambda: observed_lock_depth.append(store.lock_depth))

    assert observed_lock_depth == [1]
    assert store.lock_depth == 0


def test_derived_no_change_read_skips_flush_but_keeps_lock() -> None:
    store = FakeStore()
    store.flush_error = RuntimeError("must not flush an unchanged read")
    mutation = WorkspaceMutation(store, ConcurrentWrite)
    def unchanged() -> bool:
        assert store.lock_depth == 1
        return False
    assert mutation.run(lambda: dict(store.value), persist_when=unchanged) == {"count": 0}
    assert store.restores == 0


def test_changed_derived_read_still_restores_after_persistence_failure() -> None:
    store = FakeStore()
    store.flush_error = RuntimeError("write failed")
    mutation = WorkspaceMutation(store, ConcurrentWrite)
    with pytest.raises(RuntimeError, match="write failed"):
        mutation.run(lambda: store.value.update(count=1), persist_when=lambda: True)
    assert store.value == {"count": 0}
    assert store.restores == 1
