import { subtractQuantity } from "./quantityArithmetic.ts";

export const MIN_QUANTITY_STEP = 0.001;

export function quantityDraftValue(value: number): string {
  return value.toLocaleString("ko-KR", { useGrouping: false, maximumSignificantDigits: 21 });
}

export function parseDisplayQuantity(display: string): { amount: number; unit: string } | null {
  const match = display.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([^\d,.+-].*)?$/u);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  const unit = match[2]?.trim() || "개";
  if (!Number.isFinite(amount) || amount <= 0 || /^[\d,.+-]/.test(unit)) return null;
  return { amount, unit };
}

export function isValidEventQuantity(quantity: number, availableQuantity: number): boolean {
  if (!Number.isFinite(quantity) || !Number.isFinite(availableQuantity) || quantity <= 0 || quantity > availableQuantity) return false;
  if (quantity === availableQuantity) return true;
  const remaining = subtractQuantity(availableQuantity, quantity);
  return remaining > 0 && remaining < availableQuantity;
}

export function validateQuantitySelection(draft: string, availableQuantity: number):
  | { quantity: number; remaining: number; error: null }
  | { quantity: null; remaining: null; error: string } {
  const input = draft.trim();
  if (!input) return { quantity: null, remaining: null, error: "기록할 수량을 입력해 주세요." };
  if ((input === String(availableQuantity) || /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) && Number(input) === availableQuantity && isValidEventQuantity(availableQuantity, availableQuantity)) {
    return { quantity: availableQuantity, remaining: 0, error: null };
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) {
    return { quantity: null, remaining: null, error: "수량은 숫자로 입력해 주세요." };
  }
  const quantity = Number(input);
  if (!isValidEventQuantity(quantity, availableQuantity)) {
    if (Number.isFinite(quantity) && Number.isFinite(availableQuantity) && quantity > 0 && quantity < availableQuantity) {
      return { quantity: null, remaining: null, error: "수량이 너무 작아 계산할 수 없어요." };
    }
    return { quantity: null, remaining: null, error: "0보다 크고 남은 수량 이하로 입력해 주세요." };
  }
  return { quantity, remaining: subtractQuantity(availableQuantity, quantity), error: null };
}

/** Never round a half into a different amount or change the recorded unit. */
export function halfEventQuantity(availableQuantity: number): number | null {
  const half = availableQuantity / 2;
  return isValidEventQuantity(half, availableQuantity) ? half : null;
}

export function quantityStep(availableQuantity: number, unit: string): number {
  const normalizedUnit = unit.trim().toLowerCase();
  const preferred = normalizedUnit === "g" || normalizedUnit === "ml"
    ? availableQuantity >= 100 ? 10 : 1
    : normalizedUnit === "kg" || normalizedUnit === "l" || availableQuantity <= 1
      ? 0.1
      : 1;
  let exponent = preferred === 10 ? 1 : preferred === 1 ? 0 : -1;
  while (Number(`1e${exponent}`) > availableQuantity && exponent > -323) exponent -= 1;
  return Math.min(Number(`1e${exponent}`), availableQuantity);
}

export function stepEventQuantity(quantity: number, direction: -1 | 1, availableQuantity: number, unit: string): number {
  const step = quantityStep(availableQuantity, unit);
  const next = subtractQuantity(quantity, -direction * step);
  if (next >= availableQuantity) return availableQuantity;
  return Math.min(availableQuantity, Math.max(Math.min(MIN_QUANTITY_STEP, step), next));
}

/** Follow a previously selected whole lot; preserve custom input so a refresh cannot silently enlarge it. */
export function reconcileQuantityDraft(draft: string, previousAvailable: number, nextAvailable: number): string {
  return validateQuantitySelection(draft, previousAvailable).quantity === previousAvailable
    ? quantityDraftValue(nextAvailable)
    : draft;
}
