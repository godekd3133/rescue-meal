const COMPLETED_OUTBOX_HANDOFF_KEY = "rescue-meal.completed-grocy-outbox-focus";

export type CompletedOutboxHandoff = {
  outboxId: string;
  workspaceKey: string;
  createdAt: number;
};

export function readCompletedOutboxHandoff(workspaceKey: string): CompletedOutboxHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(COMPLETED_OUTBOX_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompletedOutboxHandoff>;
    const now = Date.now();
    const isFresh = typeof parsed.createdAt === "number" && parsed.createdAt > 0 && parsed.createdAt <= now && now - parsed.createdAt <= 10 * 60 * 1000;
    if (typeof parsed.outboxId !== "string" || typeof parsed.workspaceKey !== "string" || !isFresh || parsed.workspaceKey !== workspaceKey) {
      clearCompletedOutboxHandoff();
      return null;
    }
    const normalizedCreatedAt = parsed.createdAt as number;
    return { outboxId: parsed.outboxId, workspaceKey: parsed.workspaceKey, createdAt: normalizedCreatedAt };
  } catch {
    clearCompletedOutboxHandoff();
    return null;
  }
}

export function writeCompletedOutboxHandoff(outboxId: string, workspaceKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(COMPLETED_OUTBOX_HANDOFF_KEY, JSON.stringify({ outboxId, workspaceKey, createdAt: Date.now() } satisfies CompletedOutboxHandoff));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function clearCompletedOutboxHandoff() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(COMPLETED_OUTBOX_HANDOFF_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
