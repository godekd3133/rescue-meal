export const MIN_EVENT_QUANTITY = 0.001;

export function parseDisplayQuantity(display: string): { amount: number; unit: string } | null {
  const match = display.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([^\d,.+-].*)?$/u);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  const unit = match[2]?.trim() || "개";
  if (!Number.isFinite(amount) || amount <= 0 || /^[\d,.+-]/.test(unit)) return null;
  return { amount, unit };
}

export function isValidEventQuantity(quantity: number, availableQuantity: number): boolean {
  return Number.isFinite(quantity)
    && Number.isFinite(availableQuantity)
    && quantity >= MIN_EVENT_QUANTITY
    && quantity <= availableQuantity
    && Number(quantity.toFixed(3)) === quantity;
}

export function validateQuantitySelection(draft: string, availableQuantity: number):
  | { quantity: number; remaining: number; error: null }
  | { quantity: null; remaining: null; error: string } {
  const input = draft.trim();
  if (!input) return { quantity: null, remaining: null, error: "기록할 수량을 입력해 주세요." };
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(input)) {
    return { quantity: null, remaining: null, error: "수량은 소수점 아래 3자리까지 숫자로 입력해 주세요." };
  }
  const quantity = Number(input);
  if (!isValidEventQuantity(quantity, availableQuantity)) {
    return { quantity: null, remaining: null, error: "0보다 크고 남은 수량 이하로 입력해 주세요." };
  }
  return { quantity, remaining: Number((availableQuantity - quantity).toFixed(3)), error: null };
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
  let step = preferred;
  while (step > availableQuantity && step > MIN_EVENT_QUANTITY) step = Number((step / 10).toFixed(3));
  return Math.max(MIN_EVENT_QUANTITY, step);
}

export function stepEventQuantity(quantity: number, direction: -1 | 1, availableQuantity: number, unit: string): number {
  return Number(Math.min(availableQuantity, Math.max(MIN_EVENT_QUANTITY, quantity + direction * quantityStep(availableQuantity, unit))).toFixed(3));
}

/** Follow a previously selected whole lot; preserve custom input so a refresh cannot silently enlarge it. */
export function reconcileQuantityDraft(draft: string, previousAvailable: number, nextAvailable: number): string {
  return validateQuantitySelection(draft, previousAvailable).quantity === previousAvailable
    ? String(nextAvailable)
    : draft;
}
