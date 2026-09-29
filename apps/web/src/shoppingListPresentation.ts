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
      description: `${remainingCount}개를 구매하면 식품 목록에 추가할 수 있어요.`,
      countLabel: `${completedCount}/${itemCount}`,
    }
    : {
      tone: "complete",
      title: "구매 완료 · 식품 목록에 추가 전",
      description: "구매한 식품을 목록에 추가한 뒤 포장지 날짜와 보관 방법을 살펴봐 주세요.",
      countLabel: `${completedCount}/${itemCount}`,
    };
}
