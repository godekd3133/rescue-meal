export type ExternalSyncLifecycle = "action_required" | "queued" | "processing" | "applied";

export function externalSyncLifecycleLabel(state: ExternalSyncLifecycle) {
  if (state === "queued") return "재고 앱에 추가할 예정";
  if (state === "processing") return "재고 앱에 추가하는 중";
  if (state === "applied") return "재고 앱에 추가했어요";
  return "재고 앱에서 살펴봐 주세요";
}

export function externalSyncLifecycleColor(state: ExternalSyncLifecycle) {
  if (state === "queued") return "var(--atelier-amber)";
  if (state === "processing") return "var(--atelier-blue)";
  if (state === "applied") return "var(--atelier-pistachio)";
  return "var(--atelier-coral)";
}
