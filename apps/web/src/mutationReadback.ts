export type AuthoritativeMutationOptions<T> = {
  operation: string;
  mutate: (assertCurrent: () => void) => Promise<T | null | undefined>;
  apply: (value: T) => void;
  sync: () => Promise<boolean>;
  isCurrent?: () => boolean;
};

export type AuthoritativeMutationResult<T> = {
  value: T;
  synced: boolean;
  readbackError?: unknown;
};

export class AuthoritativeMutationResponseError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation}-empty-response`);
    this.name = "AuthoritativeMutationResponseError";
    this.operation = operation;
  }
}

export class MutationScopeChangedError extends Error {
  readonly operation: string;
  constructor(operation: string) {
    super(`${operation}-workspace-changed`);
    this.name = "MutationScopeChangedError";
    this.operation = operation;
  }
}

/**
 * Keeps a successful write visible when the follow-up workspace read is stale
 * or unavailable. The mutation response is applied before the read, and once
 * again after a failed read so a cached dashboard cannot hide durable state.
 */
export async function runAuthoritativeMutation<T>({
  operation,
  mutate,
  apply,
  sync,
  isCurrent = () => true,
}: AuthoritativeMutationOptions<T>): Promise<AuthoritativeMutationResult<T>> {
  const ensureCurrent = () => {
    if (!isCurrent()) throw new MutationScopeChangedError(operation);
  };
  ensureCurrent();
  let value: T | null | undefined;
  try {
    value = await mutate(ensureCurrent);
  } catch (error) {
    ensureCurrent();
    throw error;
  }
  ensureCurrent();
  if (value === null || value === undefined) throw new AuthoritativeMutationResponseError(operation);

  apply(value);
  let synced = false;
  let readbackError: unknown;
  try {
    synced = await sync();
  } catch (error) {
    readbackError = error;
  }
  ensureCurrent();
  if (!synced) apply(value);
  return { value, synced, readbackError };
}
