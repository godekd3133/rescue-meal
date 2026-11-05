/**
 * "되돌리기" registry for records the person just made (ate, discard, freeze,
 * storage move, quick add).
 *
 * Each record gets one key (its storage event id, or the created food ids). The
 * compensating request lives here rather than in the toast: closing or replacing
 * the toast mid-request never cancels it, a second tap joins the request already
 * in flight, and a finished undo cannot run again. A failed undo is forgotten so
 * the person can try again; the server endpoints are idempotent, so a retry after
 * a lost response replays the first result instead of reversing twice.
 */
export type UndoRegistry = {
  run<T>(key: string, operation: () => Promise<T>): Promise<T>;
  state(key: string): "idle" | "running" | "done";
};

export function createUndoRegistry(): UndoRegistry {
  const runs = new Map<string, { promise: Promise<unknown>; done: boolean }>();
  return {
    run<T>(key: string, operation: () => Promise<T>) {
      const existing = runs.get(key);
      if (existing) return existing.promise as Promise<T>;
      const entry: { promise: Promise<unknown>; done: boolean } = { promise: Promise.resolve(), done: false };
      const promise = Promise.resolve()
        .then(operation)
        .then((value) => {
          entry.done = true;
          return value;
        }, (reason: unknown) => {
          runs.delete(key);
          throw reason;
        });
      entry.promise = promise;
      runs.set(key, entry);
      return promise;
    },
    state(key: string) {
      const entry = runs.get(key);
      return entry ? entry.done ? "done" : "running" : "idle";
    },
  };
}

/** Grocy (or any external inventory) already received the change: the server refuses to reverse it. */
export function storageEventIsUndoable(statuses: ReadonlyArray<string | undefined>) {
  return statuses.every((status) => status === undefined || status === "not_configured");
}
