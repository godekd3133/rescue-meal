export type ExternalSyncLifecycle = "action_required" | "queued" | "processing" | "applied";

export function externalSyncLifecycleLabel(state: ExternalSyncLifecycle) {
  if (state === "queued") return "처리 대기";
  if (state === "processing") return "반영 중";
  if (state === "applied") return "반영 완료";
  return "확인 필요";
}

export function externalSyncLifecycleColor(state: ExternalSyncLifecycle) {
  if (state === "queued") return "var(--atelier-amber)";
  if (state === "processing") return "var(--atelier-blue)";
  if (state === "applied") return "var(--atelier-pistachio)";
  return "var(--atelier-coral)";
}
