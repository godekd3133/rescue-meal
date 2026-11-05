import { isMealApiAuthError, isMealApiManualFoodPersistenceError, isMealApiWorkspaceConflictError, MEAL_API_WORKSPACE_CONFLICT_MESSAGE, MealApiError, mealApi, type ApiStorageType } from "./mealApi";
import { quickAddIdempotencyKey, saveQuickAddSequentially, type QuickAddFailureClass, type QuickAddSaveItem } from "./quickAddSave";

function storageToApi(storage: QuickAddSaveItem["storage"]): ApiStorageType {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

export function classifyQuickAddFailure(reason: unknown): QuickAddFailureClass {
  if (isMealApiAuthError(reason)) return { message: "로그인이 만료됐어요. 다시 로그인해 주세요.", uncertain: false, stop: true };
  if (isMealApiWorkspaceConflictError(reason)) return { message: MEAL_API_WORKSPACE_CONFLICT_MESSAGE, uncertain: false, stop: true };
  if (isMealApiManualFoodPersistenceError(reason)) return { message: "저장하지 못했어요. 다시 시도해 주세요.", uncertain: false, stop: false };
  if (reason instanceof MealApiError && reason.status === 429) return { message: "요청이 많아 잠시 저장할 수 없어요.", uncertain: false, stop: true };
  if (reason instanceof MealApiError && reason.status >= 400 && reason.status < 500) return { message: "이름과 수량을 확인해 주세요.", uncertain: false, stop: false };
  return { message: "저장 결과를 확인하지 못했어요.", uncertain: true, stop: false };
}

export type QuickAddApiItem = QuickAddSaveItem & { storageLocationId?: string | null; image: string };

/**
 * Creates each staged food with no date: the server keeps the same estimated
 * "먼저 살펴볼 시점" it gives any manual food without a printed date.
 */
export function saveQuickAddFoodsToApi(
  items: ReadonlyArray<QuickAddApiItem>,
  isCurrent: () => boolean,
) {
  return saveQuickAddSequentially(items, (item) => mealApi.createManualFood({
    canonical_name: item.name,
    lot_action: "create",
    idempotencyKey: quickAddIdempotencyKey(item),
    quantity: item.amount,
    unit: item.unit,
    storage_type: storageToApi(item.storage),
    storage_location_id: item.storageLocationId ?? undefined,
    category: "기타",
    note: "",
    brand: "",
    image_path: item.image,
    date_kind: "unknown",
    date_source: "unknown",
    date_source_detail: "사용자 입력",
    user_confirmed: false,
  }), classifyQuickAddFailure, isCurrent);
}
