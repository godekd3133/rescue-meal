import { historyDayLabel, formatHistoryTime } from "./historyDates.ts";

export function mealHistoryMetadata(plan: { saved_at?: string | null; completed_at?: string | null; servings?: number }, now = new Date()) {
  const timestamp = plan.completed_at ?? plan.saved_at;
  const parts = [plan.completed_at ? "조리 완료" : "저장됨"];
  parts.push(typeof plan.servings === "number" && Number.isInteger(plan.servings) && plan.servings > 0 ? `${plan.servings}인분` : "인원 미확인");
  if (timestamp && Number.isFinite(Date.parse(timestamp))) {
    parts.push(`${historyDayLabel(timestamp, now)} ${formatHistoryTime(timestamp)}`);
  } else {
    parts.push("기록 시각 미확인");
  }
  return parts;
}
