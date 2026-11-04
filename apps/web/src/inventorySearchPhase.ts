export function inventorySearchPhase(input: {
  active: boolean;
  composing?: boolean;
  requestKey: string;
  responseKey: string;
  status: "idle" | "loading" | "ready" | "error";
  resultCount: number;
}): "local" | "composing" | "waiting" | "ready" | "refreshing" | "error" | "stale" {
  if (!input.active) return "local";
  if (input.composing) return "composing";
  if (input.requestKey !== input.responseKey || input.status === "idle") return "waiting";
  if (input.status === "loading") return input.resultCount > 0 ? "refreshing" : "waiting";
  if (input.status === "error") return input.resultCount > 0 ? "stale" : "error";
  return "ready";
}
