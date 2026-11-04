import { quantityDraftValue } from "./quantitySelection.ts";

export function validateMealConsumptionDraft(raw: string, maximum: number): { quantity: number | null; error: string | null } {
  const input = raw.trim();
  if (!input || input === "." || /^\d+\.$/.test(input)) return { quantity: null, error: "사용한 양을 입력해 주세요." };
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) return { quantity: null, error: "사용한 양은 숫자로 입력해 주세요." };
  const quantity = Number(input);
  if (!Number.isFinite(quantity) || !Number.isFinite(maximum) || quantity < 0 || quantity > maximum) {
    return { quantity: null, error: Number.isFinite(maximum) ? `0부터 ${quantityDraftValue(maximum)}까지 입력해 주세요.` : "사용한 양을 다시 확인해 주세요." };
  }
  return { quantity, error: null };
}
