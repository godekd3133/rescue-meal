export const MANUAL_QUANTITY_UNITS = ["개", "팩", "모", "g", "ml"] as const;

export function parseManualQuantity(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*([\p{L}%/]+(?:\([^()\r\n]*\))?)?$/u);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, amountText: match[1], unit: match[2] ?? "" };
}

export function changeManualQuantityUnit(value: string, unit: string) {
  const quantity = parseManualQuantity(value);
  if (!quantity || !MANUAL_QUANTITY_UNITS.some((option) => option === unit)) return value;
  return `${quantity.amountText}${unit}`;
}

function normalizedFoodName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function getManualFoodNameSuggestions(foods: ReadonlyArray<{ name: string }>, query: string) {
  const search = normalizedFoodName(query).toLocaleLowerCase("ko-KR");
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const food of foods) {
    const name = normalizedFoodName(food.name);
    const comparableName = name.toLocaleLowerCase("ko-KR");
    if (!name || seen.has(comparableName) || !comparableName.includes(search)) continue;
    seen.add(comparableName);
    suggestions.push(name);
    if (suggestions.length === 4) break;
  }
  return suggestions;
}
