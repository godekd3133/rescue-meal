export type DatePresentationKind = "actual_printed" | "estimated_use_first" | "user_confirmed" | "unknown";

export type DatePresentationFood = {
  dateKind: DatePresentationKind;
  dateAssertionKind?: string;
  dateSource: string;
};

export function getDateBadge(food: Pick<DatePresentationFood, "dateKind" | "dateAssertionKind">) {
  if (food.dateKind === "actual_printed") {
    if (food.dateAssertionKind === "production_date") return "포장 제조일";
    if (food.dateAssertionKind === "packaging_date") return "포장일";
    if (food.dateAssertionKind === "sell_by") return "포장 유통기한";
    if (food.dateAssertionKind === "best_before") return "포장 품질유지기한";
    if (food.dateAssertionKind === "use_by" || !food.dateAssertionKind) return "포장 소비기한";
    return "포장 날짜";
  }
  if (food.dateKind === "user_confirmed") return "내가 확인한 날짜";
  if (food.dateKind === "unknown") return "포장지 날짜 미확인";
  return "먼저 살펴볼 시점";
}

export function dateSourceLabel(source: string, dateKind?: DatePresentationKind) {
  const normalized = source.trim();
  if (!normalized || /fixture|revision|parser|metadata|endpoint|debug|candidate|confidence|provenance|snapshot|workspace|provider|inference|validation|evidence|\bgate\b/i.test(normalized)) return "날짜 정보를 확인할 수 없어요";
  if (normalized === "gs1" || normalized.startsWith("gs1:") || /^GS1(?:\s|$)/i.test(normalized)) return "바코드에서 읽은 날짜예요. 포장지와 비교해 주세요.";
  if (normalized === "label_ocr" || normalized === "printed_date" || normalized === "label") return "포장지 표시";
  if (normalized === "user_input" || normalized === "사용자 입력") return dateKind === "actual_printed" ? "포장지에서 직접 확인" : "직접 입력";
  if (normalized === "user_confirmed") return "내가 확인한 날짜";
  if (normalized === "estimated_use_first") return "먼저 살펴볼 시점";
  if (normalized === "storage_condition") return "식품 종류와 보관 방법 참고";
  if (normalized === "상품 유형 + 보관 방식") return "식품 종류와 보관 방법";
  if (normalized === "영수증 + 상품 유형") return "구매 기록과 식품 종류";
  const receiptStorage = normalized.match(/^영수증 \+ 상품 유형 · (refrigerated|frozen|ambient) 보관 기준$/i);
  if (receiptStorage) {
    const storageLabel = receiptStorage[1].toLowerCase() === "refrigerated" ? "냉장" : receiptStorage[1].toLowerCase() === "frozen" ? "냉동" : "실온";
    return `구매 기록과 식품 종류 · ${storageLabel} 보관 기준`;
  }
  return normalized === "unknown" ? "날짜 정보를 확인할 수 없어요" : normalized;
}

export function getInventoryDateOriginLabel(food: DatePresentationFood) {
  if (food.dateKind === "unknown") return null;
  if (food.dateKind === "user_confirmed") return "내가 확인";
  if (food.dateKind === "estimated_use_first") return "먼저 살펴볼 시점";

  const source = food.dateSource.trim();
  const sourceLabel = dateSourceLabel(source, food.dateKind);
  if (sourceLabel.startsWith("바코드에서 읽은 날짜") || sourceLabel.startsWith("바코드에서 읽었어요")) return "바코드로 읽음";
  if (sourceLabel === "포장지에서 직접 확인") return "포장지 표시";
  if (sourceLabel === "직접 입력") return "직접 입력";
  if (sourceLabel === "내가 확인한 날짜") return "내가 확인";
  if (sourceLabel === "포장지 표시" || source.includes("포장지")) return "포장지 표시";
  return "날짜 정보 없음";
}
