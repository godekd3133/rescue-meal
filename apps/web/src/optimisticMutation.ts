export type OptimisticMutationOptions<T> = {
  applyOptimistic: () => void;
  restore: () => void;
  mutate: () => Promise<T>;
  sync: () => Promise<boolean>;
};

export type OptimisticMutationResult<T> = {
  value: T;
  synced: boolean;
  readbackError?: unknown;
};

/**
 * Owns the common optimistic workspace mutation lifecycle. A mutation failure
 * restores the caller's snapshot; a successful mutation whose readback fails
 * reapplies the optimistic state instead of letting stale cache hide the write.
 */
export async function runOptimisticMutation<T>({
  applyOptimistic,
  restore,
  mutate,
  sync,
}: OptimisticMutationOptions<T>): Promise<OptimisticMutationResult<T>> {
  applyOptimistic();

  let value: T;
  try {
    value = await mutate();
  } catch (error) {
    restore();
    throw error;
  }

  let synced = false;
  let readbackError: unknown;
  try {
    synced = await sync();
  } catch (error) {
    readbackError = error;
  }
  if (!synced) applyOptimistic();
  return { value, synced, readbackError };
}
