export type ExternalSyncLifecycle = "action_required" | "queued" | "processing" | "applied";

export function externalSyncLifecycleLabel(state: ExternalSyncLifecycle) {
  if (state === "queued") return "추가 대기";
  if (state === "processing") return "추가 중";
  if (state === "applied") return "추가됨";
  return "살펴봐 주세요";
}

export function externalSyncLifecycleColor(state: ExternalSyncLifecycle) {
  if (state === "queued") return "var(--atelier-amber)";
  if (state === "processing") return "var(--atelier-blue)";
  if (state === "applied") return "var(--atelier-pistachio)";
  return "var(--atelier-coral)";
}
