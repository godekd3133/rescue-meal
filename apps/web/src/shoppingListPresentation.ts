import type { ApiStorageType } from "./mealApi";

export type ShoppingInventoryFood = {
  id: string;
  name: string;
  quantity: string;
  storage: string;
  storageLocationName?: string;
};

function comparableFoodName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function matchingShoppingInventoryFoods(name: string, foods: ShoppingInventoryFood[]) {
  const normalizedName = comparableFoodName(name);
  if (!normalizedName) return [];
  return foods.filter((food) => comparableFoodName(food.name) === normalizedName);
}

export function shoppingQuantityInputValue(quantity: number) {
  return String(quantity);
}

export function validateShoppingReceive({
  rawQuantity,
  storageType,
  purchased,
}: {
  rawQuantity: string;
  storageType: ApiStorageType | null;
  purchased: boolean;
}): { quantity: number; storageType: ApiStorageType; error: null } | { error: string } {
  const quantity = Number(rawQuantity);
  if (!rawQuantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
    return { error: "구매 수량은 0보다 큰 숫자로 입력해 주세요." };
  }
  if (!purchased) return { error: "구매를 마치면 수량과 보관 위치를 입력해 주세요." };
  if (!storageType) return { error: "포장지의 보관 방법을 보고 냉장·냉동·실온 중 하나를 선택해 주세요." };
  return { quantity, storageType, error: null };
}

export type ShoppingListProgressTone = "neutral" | "active" | "complete";

export type ShoppingListProgressCopy = {
  tone: ShoppingListProgressTone;
  title: string;
  description: string;
  countLabel: string | null;
};

export function getShoppingListProgressCopy({
  loading,
  error,
  itemCount,
  completedCount,
  remainingCount,
}: {
  loading: boolean;
  error: boolean;
  itemCount: number;
  completedCount: number;
  remainingCount: number;
}): ShoppingListProgressCopy {
  if (itemCount === 0 && loading) {
    return {
      tone: "neutral",
      title: "장보기 목록을 불러오고 있어요",
      description: "저장한 식단과 직접 추가한 재료를 불러오고 있어요.",
      countLabel: "불러오는 중",
    };
  }
  if (itemCount === 0 && error) {
    return {
      tone: "neutral",
      title: "목록을 불러오지 못했어요",
      description: "아래 안내를 확인하고 다시 시도해 주세요.",
      countLabel: null,
    };
  }
  if (itemCount === 0) {
    return {
      tone: "neutral",
      title: "장보기 목록이 아직 없어요",
      description: "부족한 재료에서 추가할 수 있어요.",
      countLabel: null,
    };
  }

  return remainingCount > 0
    ? {
      tone: "active",
      title: "구매 현황",
      description: completedCount
        ? `살 재료 ${remainingCount}가지 · 구매한 재료는 새로 산 수량만 기록해 주세요.`
        : "산 재료를 체크하고, 구매한 수량과 보관 위치를 확인해 식품 목록에 추가해 주세요.",
      countLabel: `${completedCount}/${itemCount}`,
    }
    : {
      tone: "complete",
      title: "장보기를 마쳤어요",
      description: "아직 기록하지 않은 구매가 있다면 수량과 보관 위치를 확인해 식품 목록에 추가해 주세요.",
      countLabel: `${completedCount}/${itemCount}`,
    };
}
