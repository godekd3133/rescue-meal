export type OptimisticMutationOptions<T> = {
  applyOptimistic: () => void;
  restore: () => void;
  mutate: (assertCurrent: () => void) => Promise<T>;
  sync: () => Promise<boolean>;
  isCurrent?: () => boolean;
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
  isCurrent = () => true,
}: OptimisticMutationOptions<T>): Promise<OptimisticMutationResult<T>> {
  const assertCurrent = () => {
    if (!isCurrent()) throw new MutationScopeChangedError("optimistic-mutation");
  };
  assertCurrent();
  applyOptimistic();

  let value: T;
  try {
    value = await mutate(assertCurrent);
  } catch (error) {
    assertCurrent();
    restore();
    throw error;
  }
  assertCurrent();

  let synced = false;
  let readbackError: unknown;
  try {
    synced = await sync();
  } catch (error) {
    readbackError = error;
  }
  assertCurrent();
  if (!synced) applyOptimistic();
  return { value, synced, readbackError };
}
import { MutationScopeChangedError } from "./mutationReadback.ts";
