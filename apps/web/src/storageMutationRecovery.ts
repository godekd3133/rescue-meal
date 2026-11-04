import { runOptimisticMutation, type OptimisticMutationResult } from "./optimisticMutation.ts";

export type StorageMutationRecoveryOptions<T> = {
  applyOptimistic: () => void;
  restore: () => void;
  mutate: (assertCurrent: () => void) => Promise<T>;
  sync: () => Promise<boolean>;
  onSuccess: (result: OptimisticMutationResult<T>) => void | Promise<void>;
  onFailure: (error: unknown, retry: () => Promise<void>) => void | Promise<void>;
  isCurrent?: () => boolean;
};

/**
 * Owns storage-event-specific recovery choreography above the optimistic
 * mutation primitive. A rejected mutation is reconciled once before the
 * caller receives a retry closure; a successful mutation never re-enters the
 * failure path when its dashboard readback is unavailable.
 */
export async function runStorageMutationRecovery<T>({
  applyOptimistic,
  restore,
  mutate,
  sync,
  onSuccess,
  onFailure,
  isCurrent = () => true,
}: StorageMutationRecoveryOptions<T>): Promise<void> {
  const runAttempt = async (restoreOnFailure: boolean): Promise<void> => {
    let result: OptimisticMutationResult<T>;
    try {
      result = await runOptimisticMutation({
        applyOptimistic,
        restore: restoreOnFailure ? restore : () => undefined,
        mutate,
        sync,
        isCurrent,
      });
    } catch (error) {
      if (!isCurrent()) return;
      try {
        await sync();
      } catch {
        // Reconciliation is best-effort after a rejected mutation. The caller
        // still needs to receive its explicit retry action.
      }
      if (!isCurrent()) return;
      await onFailure(error, () => runAttempt(false));
      return;
    }

    if (isCurrent()) await onSuccess(result);
  };

  await runAttempt(true);
}
