export function isStaleLabelLotTarget(
  action: "create" | "correct",
  targetFoodId: string | null | undefined,
  currentFoods: ReadonlyArray<{ id: string }>,
): boolean {
  return action === "correct"
    && Boolean(targetFoodId)
    && !currentFoods.some((food) => food.id === targetFoodId);
}
