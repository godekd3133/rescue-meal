"""Shared recovery seam for app-owned workspace mutations."""

from __future__ import annotations

from contextlib import nullcontext
from collections.abc import Callable
from typing import Generic, Protocol, TypeVar


T = TypeVar("T")
Snapshot = TypeVar("Snapshot")


class WorkspaceMutationStore(Protocol[Snapshot]):
    def mutation_lock(self):
        ...

    def snapshot(self) -> Snapshot:
        ...

    def restore(self, snapshot: Snapshot) -> None:
        ...

    def flush(self) -> None:
        ...


class WorkspaceMutation(Generic[T, Snapshot]):
    """Run one mutation with a consistent process-local recovery contract.

    The store's flush implementation owns the durable transaction. A regular
    failure restores only the request's process-local snapshot because the
    failed flush has already rolled back its database transaction. A concurrent
    workspace conflict is deliberately re-raised: PostgreSQLStore has already
    loaded the winning snapshot, and restoring the stale request snapshot would
    lose another process's committed change.
    """

    def __init__(self, store: WorkspaceMutationStore[Snapshot], concurrent_error: type[BaseException]) -> None:
        self._store = store
        self._concurrent_error = concurrent_error

    def run(self, mutation: Callable[[], T]) -> T:
        lock_factory = getattr(self._store, "mutation_lock", None)
        lock = lock_factory() if callable(lock_factory) else nullcontext()
        with lock:
            snapshot = self._store.snapshot()
            try:
                result = mutation()
                self._store.flush()
                return result
            except self._concurrent_error:
                raise
            except Exception:
                self._store.restore(snapshot)
                raise
