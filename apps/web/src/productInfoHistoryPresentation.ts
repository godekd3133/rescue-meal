import type { ApiFoodProductInfoAuditEvent } from "./mealApi";

export function productInfoHistoryChanges(event: ApiFoodProductInfoAuditEvent) {
  const fields = [["canonical_name", "상품명"], ["brand", "브랜드"], ["category", "분류"]] as const;
  const changes = fields.flatMap(([key, label]) => event.before[key] === event.after[key] ? [] : [`${label} ${event.before[key] || "미입력"} → ${event.after[key] || "미입력"}`]);
  const format = (value: typeof event.after.quantity_reference) => value ? `${value.amount}${value.unit}` : "미입력";
  if (JSON.stringify(event.before.quantity_reference ?? null) !== JSON.stringify(event.after.quantity_reference ?? null)) {
    changes.push(`한 단위의 내용량 ${format(event.before.quantity_reference)} → ${format(event.after.quantity_reference)}`);
  }
  return changes.length ? changes : ["상품 정보를 확인한 기록"];
}
