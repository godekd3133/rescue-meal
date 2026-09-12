export type WorkspaceSyncChannel =
  | "dashboard"
  | "inventory-search"
  | "account-notification-preferences"
  | "account-receipt-privacy"
  | "account-grocy"
  | "account-export"
  | "meal-plan"
  | "notifications"
  | "shopping-list"
  | "storage-locations"
  | "receipt-summaries"
  | "recipe-review";

export type WorkspaceSyncResult<T> = {
  current: boolean;
  value?: T;
  error?: unknown;
  workspaceKey: string;
};

export type WorkspaceSyncInvalidation = {
  id: string;
  sourceId: string;
  workspaceKey: string;
  channels: WorkspaceSyncChannel[] | "all";
};

export type WorkspaceSyncTransport = {
  publish: (workspaceKey: string, channels: WorkspaceSyncChannel[] | "all") => void;
  subscribe: (listener: (message: WorkspaceSyncInvalidation) => void) => () => void;
  close: () => void;
};

type WorkspaceKeyProvider = (signal: AbortSignal) => Promise<string>;
type WorkspaceSyncOperation<T> = (signal: AbortSignal) => Promise<T>;

type RequestTicket = {
  channel: WorkspaceSyncChannel;
  requestVersion: number;
  workspaceKey: string;
  workspaceVersion: number;
  controller: AbortController;
};

function normalizeWorkspaceKey(value: string) {
  const normalized = value.trim();
  return normalized || "anonymous";
}

const WORKSPACE_SYNC_BROADCAST_NAME = "rescue-meal.workspace-sync.v1";
const WORKSPACE_SYNC_STORAGE_KEY = "rescue-meal.workspace-sync-event.v1";
const WORKSPACE_SYNC_CHANNELS = new Set<WorkspaceSyncChannel>([
  "dashboard",
  "inventory-search",
  "account-notification-preferences",
  "account-receipt-privacy",
  "account-grocy",
  "account-export",
  "meal-plan",
  "notifications",
  "shopping-list",
  "storage-locations",
  "receipt-summaries",
  "recipe-review",
]);
const DEFAULT_SOURCE_ID = createIdentifier("tab");

function createIdentifier(prefix: string) {
  const uuid = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${uuid}`;
}

function normalizeInvalidationChannels(channels: WorkspaceSyncChannel[] | "all") {
  if (channels === "all") return "all" as const;
  const normalized = [...new Set(channels.filter((channel) => WORKSPACE_SYNC_CHANNELS.has(channel)))];
  return normalized.length ? normalized : "all" as const;
}

function parseInvalidation(value: unknown): WorkspaceSyncInvalidation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WorkspaceSyncInvalidation> & { type?: unknown };
  if (candidate.type !== "mutation" || typeof candidate.id !== "string" || !candidate.id
    || typeof candidate.sourceId !== "string" || !candidate.sourceId
    || typeof candidate.workspaceKey !== "string" || !candidate.workspaceKey) return null;
  if (candidate.channels !== "all" && !Array.isArray(candidate.channels)) return null;
  const channels = candidate.channels === "all"
    ? "all"
    : normalizeInvalidationChannels(candidate.channels as WorkspaceSyncChannel[]);
  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    workspaceKey: normalizeWorkspaceKey(candidate.workspaceKey),
    channels,
  };
}

/**
 * Cross-tab Adapter for workspace mutations.
 *
 * BroadcastChannel is preferred and a short-lived localStorage event is the
 * fallback for browsers that do not expose BroadcastChannel. Both transports
 * carry only an opaque workspace namespace; access tokens never leave mealApi.
 */
export function createWorkspaceSyncTransport(sourceId = DEFAULT_SOURCE_ID): WorkspaceSyncTransport {
  const effectiveSourceId = sourceId.trim() || DEFAULT_SOURCE_ID;
  const listeners = new Set<(message: WorkspaceSyncInvalidation) => void>();
  const seenIds = new Set<string>();
  let closed = false;
  let broadcast: BroadcastChannel | null = null;

  const remember = (id: string) => {
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    if (seenIds.size > 256) {
      const oldest = seenIds.values().next().value;
      if (typeof oldest === "string") seenIds.delete(oldest);
    }
    return true;
  };

  const dispatch = (value: unknown) => {
    if (closed) return;
    const message = parseInvalidation(value);
    if (!message || message.sourceId === effectiveSourceId || !remember(message.id)) return;
    listeners.forEach((listener) => listener(message));
  };

  const onBroadcastMessage = (event: MessageEvent<unknown>) => dispatch(event.data);
  try {
    if (typeof globalThis.BroadcastChannel === "function") {
      broadcast = new globalThis.BroadcastChannel(WORKSPACE_SYNC_BROADCAST_NAME);
      broadcast.addEventListener("message", onBroadcastMessage);
    }
  } catch {
    broadcast = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== WORKSPACE_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      dispatch(JSON.parse(event.newValue) as unknown);
    } catch {
      // Another tab can write an incomplete value; ignore it safely.
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    publish(workspaceKey, channels) {
      if (closed) return;
      const message: WorkspaceSyncInvalidation & { type: "mutation" } = {
        type: "mutation",
        id: createIdentifier("mutation"),
        sourceId: effectiveSourceId,
        workspaceKey: normalizeWorkspaceKey(workspaceKey),
        channels: normalizeInvalidationChannels(channels),
      };
      remember(message.id);
      try {
        broadcast?.postMessage(message);
      } catch {
        // A closed or unavailable BroadcastChannel should not fail a mutation.
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(WORKSPACE_SYNC_STORAGE_KEY, JSON.stringify(message));
          window.localStorage.removeItem(WORKSPACE_SYNC_STORAGE_KEY);
        } catch {
          // Storage policy/quota must not fail the already-completed mutation.
        }
      }
    },
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      broadcast?.removeEventListener("message", onBroadcastMessage);
      broadcast?.close();
      broadcast = null;
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      listeners.clear();
      seenIds.clear();
    },
  };
}

let defaultTransport: WorkspaceSyncTransport | null = null;

function getDefaultTransport() {
  if (defaultTransport === null) defaultTransport = createWorkspaceSyncTransport();
  return defaultTransport;
}

export function broadcastWorkspaceMutation(workspaceKey: string, channels: WorkspaceSyncChannel[] | "all") {
  getDefaultTransport().publish(workspaceKey, channels);
}

/**
 * Owns the lifetime of workspace-scoped read requests.
 *
 * A request is accepted only while both its workspace and channel version
 * are current. This keeps a late response from a previous account, guest
 * session, query, or refresh from overwriting the active read model.
 */
export class WorkspaceSyncCoordinator {
  private readonly workspaceKeyProvider: WorkspaceKeyProvider;
  private workspaceKey: string;
  private workspaceVersion = 0;
  private readonly channelVersions = new Map<WorkspaceSyncChannel, number>();
  private readonly activeControllers = new Map<WorkspaceSyncChannel, AbortController>();

  constructor(workspaceKeyProvider: WorkspaceKeyProvider, initialWorkspaceKey = "anonymous") {
    this.workspaceKeyProvider = workspaceKeyProvider;
    this.workspaceKey = normalizeWorkspaceKey(initialWorkspaceKey);
  }

  get currentWorkspaceKey() {
    return this.workspaceKey;
  }

  setWorkspace(workspaceKey: string) {
    return this.transitionWorkspace(workspaceKey);
  }

  invalidate(channel: WorkspaceSyncChannel) {
    this.channelVersions.set(channel, (this.channelVersions.get(channel) ?? 0) + 1);
    this.activeControllers.get(channel)?.abort();
  }

  invalidateAll() {
    this.workspaceVersion += 1;
    this.abortAll();
  }

  async run<T>(channel: WorkspaceSyncChannel, operation: WorkspaceSyncOperation<T>): Promise<WorkspaceSyncResult<T>> {
    this.activeControllers.get(channel)?.abort();
    const controller = new AbortController();
    this.activeControllers.set(channel, controller);
    const preparationTicket: RequestTicket = {
      channel,
      requestVersion: (this.channelVersions.get(channel) ?? 0) + 1,
      workspaceKey: this.workspaceKey,
      workspaceVersion: this.workspaceVersion,
      controller,
    };
    this.channelVersions.set(channel, preparationTicket.requestVersion);

    let workspaceKey: string;
    try {
      workspaceKey = normalizeWorkspaceKey(await this.workspaceKeyProvider(controller.signal));
    } catch (error) {
      const current = this.isCurrent(preparationTicket);
      this.release(channel, controller);
      return { current, error, workspaceKey: this.workspaceKey };
    }

    if (!this.isCurrent(preparationTicket)) {
      this.release(channel, controller);
      return { current: false, workspaceKey: this.workspaceKey };
    }

    this.transitionWorkspace(workspaceKey, controller);
    const ticket: RequestTicket = {
      channel,
      requestVersion: preparationTicket.requestVersion,
      workspaceKey: this.workspaceKey,
      workspaceVersion: this.workspaceVersion,
      controller,
    };

    try {
      const value = await operation(controller.signal);
      return { current: this.isCurrent(ticket), value, workspaceKey: ticket.workspaceKey };
    } catch (error) {
      return { current: this.isCurrent(ticket), error, workspaceKey: ticket.workspaceKey };
    } finally {
      this.release(channel, controller);
    }
  }

  private transitionWorkspace(workspaceKey: string, preserveController?: AbortController) {
    const nextWorkspaceKey = normalizeWorkspaceKey(workspaceKey);
    if (nextWorkspaceKey === this.workspaceKey) return false;
    this.workspaceKey = nextWorkspaceKey;
    this.workspaceVersion += 1;
    this.abortAll(preserveController);
    return true;
  }

  private abortAll(preserveController?: AbortController) {
    this.activeControllers.forEach((controller) => {
      if (controller !== preserveController) controller.abort();
    });
  }

  private release(channel: WorkspaceSyncChannel, controller: AbortController) {
    if (this.activeControllers.get(channel) === controller) this.activeControllers.delete(channel);
  }

  private isCurrent(ticket: RequestTicket) {
    return ticket.workspaceVersion === this.workspaceVersion
      && ticket.workspaceKey === this.workspaceKey
      && ticket.requestVersion === this.channelVersions.get(ticket.channel)
      && !ticket.controller.signal.aborted;
  }
}
