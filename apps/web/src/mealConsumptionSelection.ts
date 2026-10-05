export type MealConsumptionMemory = {
  contextKey: string;
  quantities: Record<string, number>;
};

type ConsumptionSelection = {
  contextKey: string;
  foodId: string;
  currentQuantity: number;
  maxQuantity: number;
  memory: MealConsumptionMemory | null;
};

function boundedQuantity(quantity: number, maxQuantity: number) {
  const maximum = Number.isFinite(maxQuantity) ? Math.max(0, maxQuantity) : 0;
  const value = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  return Math.min(maximum, Number(Math.min(value, maximum).toFixed(3)));
}

export function updateMealConsumptionSelection(selection: ConsumptionSelection, requestedQuantity: number) {
  const quantities = selection.memory?.contextKey === selection.contextKey ? selection.memory.quantities : {};
  const currentQuantity = boundedQuantity(selection.currentQuantity, selection.maxQuantity);
  const quantity = boundedQuantity(requestedQuantity, selection.maxQuantity);
  const rememberedQuantity = quantity > 0 ? quantity : currentQuantity;
  return {
    quantity,
    memory: {
      contextKey: selection.contextKey,
      quantities: rememberedQuantity > 0
        ? { ...quantities, [selection.foodId]: rememberedQuantity }
        : quantities,
    },
  };
}

export function toggleMealConsumptionSelection(selection: ConsumptionSelection, defaultQuantity: number) {
  const rememberedQuantity = selection.memory?.contextKey === selection.contextKey
    ? selection.memory.quantities[selection.foodId]
    : undefined;
  return updateMealConsumptionSelection(
    selection,
    selection.currentQuantity > 0 ? 0 : rememberedQuantity ?? defaultQuantity,
  );
}
