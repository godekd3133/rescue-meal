export type MealPlanErrorKind = "authentication" | "workspace-conflict" | "other";

export function getMealPlanErrorPresentation(
  kind: MealPlanErrorKind,
  fallback: string,
  workspaceConflictMessage: string,
) {
  if (kind === "authentication") {
    return { message: "로그인 정보가 만료됐어요. 계정에 다시 연결해 주세요.", recovery: "account" as const };
  }
  if (kind === "workspace-conflict") {
    return { message: workspaceConflictMessage, recovery: "refresh" as const };
  }
  return { message: fallback, recovery: "retry" as const };
}

export function mealPlanDisplayCopy(copy: string) {
  return copy
    .replace(/레시피 후보를 만들려면/g, "메뉴를 찾으려면")
    .replace(/레시피 후보/g, "메뉴")
    .replace(/\brecipe\b/gi, "메뉴")
    .replace(/추천하지 않았어요/g, "메뉴에서 제외했어요")
    .replace(/이 안내는 소비기한을 새로 판정하지 않습니다\.?/g, "소비기한이나 먹어도 되는지를 뜻하지 않아요. 포장지 날짜와 식품 상태를 살펴봐 주세요.")
    .replace(/소비기한을 새로 판정하는 안내는 아닙니다\.?/g, "소비기한이나 먹어도 되는지를 뜻하지 않아요. 포장지 날짜와 식품 상태를 살펴봐 주세요.");
}
