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
    .replace(/이 안내는 소비기한을 새로 판정하지 않습니다\.?/g, "먹어도 되는지는 앱에서 판단할 수 없어요.")
    .replace(/소비기한을 새로 판정하는 안내는 아닙니다\.?/g, "먹어도 되는지는 앱에서 판단할 수 없어요.");
}

/** Ingredient availability already has a dedicated summary and item list. */
export function hasMeaningfulMealReason(reason?: string | null) {
  if (!reason?.trim()) return false;
  const text = reason.trim();
  return text !== "식품 목록에 있는 재료를 활용한 메뉴예요."
    && text !== "현재 식품만으로 만들 수 있고, 먼저 먹기 순서가 높은 재료를 우선했어요."
    && !/^재료 \d+\/\d+개가 있고, 먼저 먹기 순서가 높은 식품을 우선했어요\.$/.test(text);
}

/** Targets have their own controls; shorten only the known stock warning. */
export function mealDateReviewCopy(note: string | null | undefined, foodNames: string[] = []) {
  const names = foodNames.join("·");
  const standard = `${names}의 표시 날짜·보관 상태를 다시 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다.`;
  const demo = `${names}의 포장지 날짜와 보관 방법을 살펴본 뒤 조리해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.`;
  if (names && (note === standard || note === demo)) {
    return "보관 상태도 확인해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.";
  }
  return mealPlanDisplayCopy(note ?? "포장지 날짜와 보관 상태를 확인해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.");
}
