import { lazy, Suspense, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ArchiveIcon,
  ArrowRightIcon,
  BellIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  FileTextIcon,
  InfoCircledIcon,
  LightningBoltIcon,
  PlusIcon,
  ReaderIcon,
  SewingPinIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard } from "./mobile";
import { mealApi, type ApiFood, type ApiStorageType } from "./mealApi";

type StorageType = "냉장" | "냉동" | "실온";
type DateKind = "actual_printed" | "estimated_use_first" | "user_confirmed";
type AddMode = "receipt" | "barcode" | "label" | "manual";
type SheetName = "add" | "detail" | "meal" | "guidance" | "account" | null;
type ConnectionState = "fixture" | "checking" | "connected" | "offline";

type FoodItem = {
  id: string;
  parentId?: string;
  name: string;
  brand: string;
  quantity: string;
  storage: StorageType;
  dateLabel: string;
  dateDetail: string;
  dateKind: DateKind;
  dateSource: string;
  image: string;
  category: string;
  priority: number;
  confidence: number;
  note: string;
  opened: boolean;
};

type ReceiptLine = {
  id: string;
  backendId?: string;
  name: string;
  detail: string;
  confidence: number;
  requiresReview: boolean;
  image: string;
};

type ReceiptCommitPayload = {
  lines: ReceiptLine[];
  draftId?: string;
  sourceFilename: string;
};

const FOOD_IMAGES = {
  spinach: "/assets/food/spinach.png",
  tofu: "/assets/food/tofu.png",
  chicken: "/assets/food/chicken.png",
  mushroom: "/assets/food/mushroom.png",
  eggs: "/assets/food/eggs.png",
  milk: "/assets/food/milk.png",
  tomato: "/assets/food/tomato.png",
} as const;

const INITIAL_FOODS: FoodItem[] = [
  {
    id: "spinach-1",
    name: "시금치",
    brand: "국내산 시금치",
    quantity: "1팩",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-02"),
    dateDetail: "2026.09.02",
    dateKind: "actual_printed",
    dateSource: "포장지 표시",
    image: FOOD_IMAGES.spinach,
    category: "채소",
    priority: 1,
    confidence: 1,
    note: "포장지에서 유효년월일을 확인했어요.",
    opened: true,
  },
  {
    id: "tofu-1",
    name: "국산콩 두부",
    brand: "풀무원",
    quantity: "1모",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-04"),
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "상품 유형 + 보관 방식",
    image: FOOD_IMAGES.tofu,
    category: "두부·콩",
    priority: 2,
    confidence: 0.72,
    note: "실제 소비기한이 아니라 먼저 먹기 위한 추정 순서예요.",
    opened: false,
  },
  {
    id: "chicken-1",
    name: "닭가슴살",
    brand: "무항생제 닭가슴살",
    quantity: "2팩",
    storage: "냉동",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "사용자 확인",
    dateKind: "user_confirmed",
    dateSource: "사용자 입력",
    image: FOOD_IMAGES.chicken,
    category: "육류",
    priority: 3,
    confidence: 0.9,
    note: "사용자가 확인한 날짜를 우선 사용하고 있어요.",
    opened: false,
  },
  {
    id: "mushroom-1",
    name: "맛타리버섯",
    brand: "국내산 맛타리",
    quantity: "2팩",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-05"),
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "영수증 + 상품 유형",
    image: FOOD_IMAGES.mushroom,
    category: "채소",
    priority: 4,
    confidence: 0.64,
    note: "신선식품은 날짜가 인쇄되지 않을 수 있어 우선순위로만 안내해요.",
    opened: false,
  },
  {
    id: "egg-1",
    name: "동물복지 달걀",
    brand: "10구",
    quantity: "1판",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-09"),
    dateDetail: "2026.09.09",
    dateKind: "actual_printed",
    dateSource: "포장지 표시",
    image: FOOD_IMAGES.eggs,
    category: "달걀",
    priority: 5,
    confidence: 1,
    note: "달걀 포장지에 있는 표시 날짜를 기록했어요.",
    opened: false,
  },
  {
    id: "milk-1",
    name: "저지방 우유",
    brand: "900ml",
    quantity: "1개",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "영수증 + 상품 유형",
    image: FOOD_IMAGES.milk,
    category: "유제품",
    priority: 6,
    confidence: 0.68,
    note: "개봉 후에는 별도의 사용자 확인이 필요해요.",
    opened: true,
  },
  {
    id: "tomato-1",
    name: "대추방울토마토",
    brand: "국내산",
    quantity: "1팩",
    storage: "실온",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "상품 유형 + 보관 방식",
    image: FOOD_IMAGES.tomato,
    category: "채소",
    priority: 7,
    confidence: 0.58,
    note: "실온 보관 중인 신선식품은 상태 확인과 함께 드세요.",
    opened: false,
  },
];

const RECEIPT_LINES: ReceiptLine[] = [
  {
    id: "receipt-spinach",
    name: "국내산 시금치",
    detail: "1팩 · 2,980원",
    confidence: 0.96,
    requiresReview: false,
    image: FOOD_IMAGES.spinach,
  },
  {
    id: "receipt-tofu",
    name: "국산콩 두부",
    detail: "1모 · 2,490원",
    confidence: 0.91,
    requiresReview: false,
    image: FOOD_IMAGES.tofu,
  },
  {
    id: "receipt-mushroom",
    name: "맛타리버섯",
    detail: "2팩 · 3,980원",
    confidence: 0.63,
    requiresReview: true,
    image: FOOD_IMAGES.mushroom,
  },
];

const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));
const ConnectionStatus = lazy(() => import("./ConnectionStatus"));
const FoodHistory = lazy(() => import("./FoodHistory"));
const DateAssertionEditor = lazy(() => import("./DateAssertionEditor"));
const AccountSheet = lazy(() => import("./AccountSheet"));
const MealPlanSheet = lazy(() => import("./MealPlanSheet"));

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function createFood(input: Partial<FoodItem> & Pick<FoodItem, "name">): FoodItem {
  return {
    id: createId("food"),
    name: input.name,
    brand: input.brand ?? "직접 추가한 식품",
    quantity: input.quantity ?? "1개",
    storage: input.storage ?? "냉장",
    dateLabel: input.dateLabel ?? "확인 필요",
    dateDetail: input.dateDetail ?? "날짜 미입력",
    dateKind: input.dateKind ?? "user_confirmed",
    dateSource: input.dateSource ?? "사용자 입력",
    image: input.image ?? FOOD_IMAGES.tomato,
    category: input.category ?? "기타",
    priority: input.priority ?? 99,
    confidence: input.confidence ?? 1,
    note: input.note ?? "날짜와 보관 방법을 확인해 주세요.",
    opened: input.opened ?? false,
  };
}

function getDateBadge(food: FoodItem) {
  if (food.dateKind === "actual_printed") return "표시 소비기한";
  if (food.dateKind === "user_confirmed") return "사용자 확인";
  return "AI 소비 우선순위";
}

function getStorageClass(storage: StorageType) {
  return storage === "냉동" ? "storage-freezer" : storage === "실온" ? "storage-room" : "storage-fridge";
}

function storageFromApi(storage: ApiStorageType): StorageType {
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

function formatApiDate(value: string | null) {
  if (!value) return "확인 필요";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "확인 필요";
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  return `${month}월 ${day}일`;
}

function mapApiFood(food: ApiFood): FoodItem {
  const actualDate = food.date_assertion.kind === "use_by" || food.date_assertion.kind === "best_before";
  const dateKind: DateKind = actualDate
    ? "actual_printed"
    : food.date_assertion.kind === "user_reminder"
      ? "user_confirmed"
      : "estimated_use_first";
  const estimatedDate = food.estimated_use_first_window?.end_date ?? null;
  const displayDate = actualDate || dateKind === "user_confirmed" ? food.date_assertion.value : estimatedDate;
  return {
    id: food.id,
    name: food.display_name,
    brand: food.brand,
    quantity: `${food.quantity}${food.unit}`,
    storage: storageFromApi(food.storage_type),
    dateLabel: formatApiDate(displayDate),
    dateDetail: actualDate ? food.date_assertion.display_label.replaceAll("-", ".") : dateKind === "user_confirmed" ? "사용자 확인" : "AI 소비 우선순위",
    dateKind,
    dateSource: food.date_assertion.source_detail,
    image: food.image_path,
    category: food.category,
    priority: food.priority,
    confidence: food.estimated_use_first_window?.confidence ?? food.date_assertion.confidence,
    note: food.note,
    opened: food.opened,
  };
}

function storageToApi(storage: StorageType): ApiStorageType {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

function dateValueForFood(food: FoodItem) {
  const match = food.dateDetail.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function quantityParts(quantity: string) {
  const match = quantity.match(/^(\d+(?:\.\d+)?)(.*)$/);
  return { amount: match ? Number.parseFloat(match[1]) : 1, unit: match?.[2] || "개" };
}

function imageForFoodName(name: string) {
  if (name.includes("시금치")) return FOOD_IMAGES.spinach;
  if (name.includes("두부")) return FOOD_IMAGES.tofu;
  if (name.includes("닭")) return FOOD_IMAGES.chicken;
  if (name.includes("버섯")) return FOOD_IMAGES.mushroom;
  if (name.includes("달걀") || name.includes("계란")) return FOOD_IMAGES.eggs;
  if (name.includes("우유")) return FOOD_IMAGES.milk;
  return FOOD_IMAGES.tomato;
}

export default function Prototype() {
  const [foods, setFoods] = useState<FoodItem[]>(INITIAL_FOODS);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [addMode, setAddMode] = useState<AddMode>("receipt");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [storageFilter, setStorageFilter] = useState<StorageType | "전체">("전체");
  const [toast, setToast] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(mealApi.isConfigured ? "checking" : "fixture");

  const selectedFood = foods.find((food) => food.id === selectedFoodId) ?? null;
  const priorityFoods = useMemo(
    () => foods.filter((food) => food.priority <= 3).sort((a, b) => a.priority - b.priority),
    [foods],
  );
  const filteredFoods = useMemo(
    () => storageFilter === "전체" ? foods : foods.filter((food) => food.storage === storageFilter),
    [foods, storageFilter],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mealApi.isConfigured) return;
    let active = true;
    void mealApi.getDashboard().then((payload) => {
      if (active && payload) {
        setFoods(payload.inventory.map(mapApiFood));
        setConnectionState("connected");
      }
    }).catch(() => {
      if (active) setConnectionState("offline");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // The app remains usable without an installable service worker.
    });
  }, []);

  const openAdd = (mode: AddMode = "receipt") => {
    setAddMode(mode);
    setSheet("add");
  };

  const openDetail = (food: FoodItem) => {
    setSelectedFoodId(food.id);
    setSheet("detail");
  };

  const syncDashboard = async () => {
    try {
      const payload = await mealApi.getDashboard();
      if (payload) {
        setFoods(payload.inventory.map(mapApiFood));
        setConnectionState("connected");
        return true;
      }
    } catch {
      setConnectionState("offline");
    }
    return false;
  };

  const handleAuthenticated = async (session: { mode: "account" | "guest" }) => {
    setSheet(null);
    setConnectionState("checking");
    const synced = await syncDashboard();
    setToast(synced ? session.mode === "account" ? "계정 workspace에 연결했어요" : "게스트 workspace에 연결했어요" : "계정은 연결했지만 식품 목록을 읽지 못했어요");
  };

  const handleSignedOut = async () => {
    const serverRevoked = await mealApi.logoutSession();
    setSheet(null);
    setConnectionState("checking");
    const synced = await syncDashboard();
    setToast(synced ? serverRevoked ? "로그아웃하고 게스트 workspace로 전환했어요" : "이 기기에서 로그아웃하고 게스트 workspace로 전환했어요" : "로그아웃했지만 식품 목록을 읽지 못했어요");
  };

  const handleMealCompleted = (foodIds: string[], skippedCount = 0, consumedAllocations: Array<{ food_id: string; quantity: number }> = []) => {
    setSheet(null);
    if (!mealApi.isConfigured) {
      const consumedIds = new Set(foodIds);
      const quantitiesByFoodId = new Map(consumedAllocations.map((allocation) => [allocation.food_id, allocation.quantity]));
      setFoods((current) => current
        .flatMap((food) => {
          if (!consumedIds.has(food.id)) return [food];
          const consumedQuantity = quantitiesByFoodId.get(food.id);
          if (consumedQuantity == null) return [];
          const currentQuantity = quantityParts(food.quantity);
          const remaining = Number((currentQuantity.amount - consumedQuantity).toFixed(3));
          return remaining > 0 ? [{ ...food, quantity: `${remaining}${currentQuantity.unit}` }] : [];
        })
        .map((food, index) => ({ ...food, priority: index + 1 })));
      setToast(skippedCount ? `일부 재료만 차감하고 ${skippedCount}개는 확인이 필요해요` : foodIds.length ? "식단을 완료하고 재고를 갱신했어요" : "조리 완료 기록을 남겼어요");
      return;
    }
    setToast("식단 완료를 서버에 저장하는 중이에요");
    void syncDashboard().then((synced) => {
      setToast(synced ? skippedCount ? `일부 재료만 차감하고 ${skippedCount}개는 확인이 필요해요` : "식단을 완료하고 재고를 갱신했어요" : "식단은 기록했지만 재고를 다시 읽지 못했어요");
    });
  };

  const mergeFoods = (incoming: FoodItem[]) => {
    setFoods((current) => {
      const next = [...current];
      incoming.forEach((incomingFood) => {
        const existingIndex = next.findIndex((food) => food.name === incomingFood.name);
        if (existingIndex >= 0) {
          const existingFood = next[existingIndex];
          const keepTrustedDate = existingFood.dateKind !== "estimated_use_first" && incomingFood.dateKind === "estimated_use_first";
          next[existingIndex] = {
            ...existingFood,
            ...incomingFood,
            id: existingFood.id,
            storage: existingFood.storage,
            opened: existingFood.opened,
            ...(keepTrustedDate
              ? {
                  dateLabel: existingFood.dateLabel,
                  dateDetail: existingFood.dateDetail,
                  dateKind: existingFood.dateKind,
                  dateSource: existingFood.dateSource,
                  note: existingFood.note,
                }
              : {}),
          };
        } else {
          next.unshift(incomingFood);
        }
      });
      return next.map((food, index) => ({ ...food, priority: index + 1 }));
    });
  };

  const saveFood = (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number) => {
    const previousFood = foods.find((food) => food.id === foodId);
    const previousQuantity = previousFood ? quantityParts(previousFood.quantity) : { amount: eventQuantity, unit: "개" };
    const isPartial = Boolean(previousFood && eventQuantity < previousQuantity.amount);
    const shouldSplit = Boolean(isPartial && previousFood && (previousFood.storage !== storage || (!previousFood.opened && opened)));
    if (!(mealApi.isConfigured && shouldSplit) && previousFood) {
      if (shouldSplit) {
        const child: FoodItem = {
          ...previousFood,
          id: createId("lot"),
          parentId: previousFood.id,
          quantity: `${eventQuantity}${previousQuantity.unit}`,
          storage,
          opened,
          dateSource: previousFood.dateKind === "estimated_use_first" ? `${storage} 보관 기준` : previousFood.dateSource,
        };
        const remaining: FoodItem = { ...previousFood, quantity: `${previousQuantity.amount - eventQuantity}${previousQuantity.unit}` };
        setFoods((current) => current.flatMap((food) => food.id === foodId ? [remaining, child] : [food]).map((food, index) => ({ ...food, priority: index + 1 })));
      } else {
        setFoods((current) => current.map((food) => (
          food.id === foodId
            ? {
                ...food,
                storage,
                opened,
                dateSource: food.dateKind === "estimated_use_first" ? `${storage} 보관 기준` : food.dateSource,
              }
            : food
        )));
      }
    }
    setSheet(null);
    setToast(mealApi.isConfigured ? "보관 상태를 서버에 저장하는 중이에요" : "보관 상태를 저장했어요");
    if (mealApi.isConfigured && previousFood) {
      const persistEvents = async () => {
        let targetFoodId = foodId;
        if (previousFood.storage !== storage) {
          const moved = await mealApi.createStorageEvent(targetFoodId, {
            event_type: "moved",
            to_storage_type: storageToApi(storage),
            quantity: isPartial ? eventQuantity : undefined,
          });
          if (moved?.created_child_food_id) targetFoodId = moved.created_child_food_id;
        }
        if (!previousFood.opened && opened) {
          await mealApi.createStorageEvent(targetFoodId, {
            event_type: "opened",
            quantity: targetFoodId === foodId && isPartial ? eventQuantity : undefined,
          });
        }
      };
      void persistEvents()
        .then(syncDashboard)
        .then((synced) => {
          if (!synced) throw new Error("dashboard-sync-failed");
          setToast("보관 상태를 저장했어요");
        })
        .catch(async () => {
          await syncDashboard();
          setToast("서버 저장에 실패해 원래 상태로 되돌렸어요");
      });
    }
  };

  const consumeFood = (foodId: string, eventQuantity?: number) => {
    const food = foods.find((item) => item.id === foodId);
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
    if (isPartial) {
      setFoods((current) => current.map((item) => item.id === foodId ? { ...item, quantity: `${quantity.amount - (eventQuantity ?? 0)}${quantity.unit}` } : item));
    } else {
      setFoods((current) => current.filter((item) => item.id !== foodId));
    }
    setSheet(null);
    setToast(mealApi.isConfigured ? "먹은 기록을 서버에 저장하는 중이에요" : food ? `${food.name}을(를) 먹은 기록으로 남겼어요` : "먹은 기록을 저장했어요");
    if (mealApi.isConfigured) {
      void mealApi.createStorageEvent(foodId, { event_type: "consumed", quantity: isPartial ? eventQuantity : undefined })
        .then(() => syncDashboard())
        .then((synced) => {
          if (!synced) throw new Error("dashboard-sync-failed");
          setToast(food ? `${food.name}을(를) 먹은 기록으로 남겼어요` : "먹은 기록을 저장했어요");
        })
        .catch(async () => {
          await syncDashboard();
          setToast("서버 저장에 실패해 목록을 되돌렸어요");
      });
    }
  };

  const discardFood = (foodId: string, eventQuantity?: number) => {
    const food = foods.find((item) => item.id === foodId);
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
    if (isPartial) {
      setFoods((current) => current.map((item) => item.id === foodId ? { ...item, quantity: `${quantity.amount - (eventQuantity ?? 0)}${quantity.unit}` } : item));
    } else {
      setFoods((current) => current.filter((item) => item.id !== foodId));
    }
    setSheet(null);
    setToast(mealApi.isConfigured ? "폐기 기록을 서버에 저장하는 중이에요" : food ? `${food.name} 폐기 기록을 남겼어요` : "폐기 기록을 저장했어요");
    if (mealApi.isConfigured) {
      void mealApi.createStorageEvent(foodId, { event_type: "discarded", quantity: isPartial ? eventQuantity : undefined })
        .then(() => syncDashboard())
        .then((synced) => {
          if (!synced) throw new Error("dashboard-sync-failed");
          setToast(food ? `${food.name} 폐기 기록을 남겼어요` : "폐기 기록을 저장했어요");
        })
        .catch(async () => {
          await syncDashboard();
          setToast("서버 저장에 실패해 목록을 되돌렸어요");
        });
    }
  };

  const confirmFoodDate = (foodId: string, dateValue: string, kind: "use_by" | "best_before" | "user_reminder") => {
    const food = foods.find((item) => item.id === foodId);
    if (!food) return;
    const actualPrinted = kind === "use_by" || kind === "best_before";
    const updatedFood: FoodItem = {
      ...food,
      dateLabel: formatApiDate(dateValue),
      dateDetail: dateValue.replaceAll("-", "."),
      dateKind: actualPrinted ? "actual_printed" : "user_confirmed",
      dateSource: "사용자 입력",
      confidence: 1,
      note: actualPrinted ? "포장지에서 확인한 날짜를 사용자 확인으로 기록했어요." : "사용자가 설정한 알림 날짜를 기록했어요.",
    };
    setSheet(null);
    setToast(mealApi.isConfigured ? "확인한 날짜를 서버에 저장하는 중이에요" : `${food.name} 날짜를 사용자 확인으로 저장했어요`);
    if (!mealApi.isConfigured) {
      setFoods((current) => current.map((item) => item.id === foodId ? updatedFood : item));
      return;
    }
    void mealApi.updateDateAssertion(foodId, {
      kind,
      date_value: dateValue,
      source_detail: actualPrinted ? "포장지에서 사용자 확인" : "사용자 알림 설정",
    })
      .then(() => syncDashboard())
      .then((synced) => {
        if (!synced) throw new Error("dashboard-sync-failed");
        setToast(`${food.name} 날짜를 사용자 확인으로 저장했어요`);
      })
      .catch(async () => {
        await syncDashboard();
        setToast("날짜 저장에 실패해 기존 정보를 유지했어요");
      });
  };

  const addManualFood = (food: FoodItem) => {
    setSheet(null);
    if (!mealApi.isConfigured) {
      mergeFoods([food]);
      setToast(`${food.name}을(를) 식품 목록에 추가했어요`);
      return;
    }
    setToast(`${food.name}을(를) 서버에 추가하는 중이에요`);
    void mealApi.createManualFood({
        canonical_name: food.name,
        quantity: Number.parseFloat(food.quantity) || 1,
        unit: food.quantity.replace(/[\d.\s]/g, "") || "개",
        storage_type: storageToApi(food.storage),
        category: food.category,
        note: food.note,
        brand: food.brand,
        image_path: food.image,
        date_kind: food.dateKind === "actual_printed" ? "use_by" : food.dateKind === "user_confirmed" ? "user_reminder" : "unknown",
        date_value: dateValueForFood(food),
        date_source: food.dateKind === "actual_printed" ? "label_ocr" : food.dateKind === "user_confirmed" ? "user_input" : "unknown",
        date_source_detail: food.dateSource,
        user_confirmed: food.dateKind === "actual_printed" || food.dateKind === "user_confirmed",
      })
      .then(() => syncDashboard())
      .then((synced) => {
        if (!synced) throw new Error("dashboard-sync-failed");
        setToast(`${food.name}을(를) 식품 목록에 추가했어요`);
      })
      .catch(async () => {
        await syncDashboard();
        setToast("서버 추가에 실패했어요. 기존 목록을 유지합니다");
      });
  };

  const addReceiptFoods = ({ lines, draftId, sourceFilename }: ReceiptCommitPayload) => {
    const lineFoods = lines.map((line) => createFood({
      name: line.name.replace("국내산 ", ""),
      brand: line.name,
      quantity: line.detail.split(" · ")[0],
      storage: "냉장",
      dateLabel: "확인 필요",
      dateDetail: "영수증에는 소비기한이 없어요",
      dateKind: "estimated_use_first",
      dateSource: "영수증 + 상품 유형",
      image: line.image,
      category: line.name.includes("두부") ? "두부·콩" : "채소",
      confidence: line.confidence,
      note: "영수증 구매일은 기록했지만, 실제 소비기한은 포장지에서 확인해야 해요.",
    }));
    setSheet(null);
    if (!mealApi.isConfigured) {
      mergeFoods(lineFoods);
      setToast(`${lines.length}개 항목을 검토 후 반영했어요`);
      return;
    }
    setToast(`${lines.length}개 항목을 서버에 반영하는 중이에요`);
    {
      const apiLines = lines.map((line) => ({
        raw_name: line.name,
        quantity: Number.parseFloat(line.detail) || 1,
        unit: line.detail.split(" · ")[0].replace(/[\d.\s]/g, "") || "개",
        total_price: Number.parseInt(line.detail.match(/[\d,]+원/)?.[0]?.replace(/[^0-9]/g, "") ?? "0", 10),
        line_type: "product" as const,
        canonical_name: line.name.replace("국내산 ", ""),
        match_confidence: line.confidence,
      }));
      const selectedBackendLineIds = lines.map((line) => line.backendId).filter((id): id is string => Boolean(id));
      const overrides = Object.fromEntries(lines.map((line, index) => [
        line.backendId ?? `line-${index + 1}`,
        { canonical_name: line.name.replace("국내산 ", "") },
      ]));
      const commitPromise = draftId
        ? mealApi.commitReceipt(draftId, selectedBackendLineIds, overrides)
        : mealApi.createReceiptDraft({ source_filename: sourceFilename || "sample-receipt.jpg", purchased_at: new Date().toISOString(), lines: apiLines })
          .then((draft) => {
            if (!draft) throw new Error("receipt-draft-failed");
            return mealApi.commitReceipt(draft.id, draft.lines.map((line) => line.id), Object.fromEntries(draft.lines.map((line) => [line.id, { canonical_name: line.canonical_name ?? line.raw_name }])));
          });
      void commitPromise
        .then(() => syncDashboard())
        .then((synced) => {
          if (!synced) throw new Error("dashboard-sync-failed");
          setToast(`${lines.length}개 항목을 검토 후 반영했어요`);
        })
        .catch(async () => {
          await syncDashboard();
          setToast("영수증 서버 반영에 실패해 기존 목록을 유지합니다");
        });
    }
  };

  return (
    <>
      <MobileScroll className="app-screen">
        <main className="screen-content meal-home" aria-label="Rescue Meal 홈">
          <header className="app-header">
            <div className="brand-lockup" aria-label="Rescue Meal">
              <span className="brand-mark">r</span>
              <span className="brand-name">rescue meal</span>
            </div>
            <div className="header-actions">
              <Suspense fallback={null}><ConnectionStatus state={connectionState} onOpenAccount={() => setSheet("account")} /></Suspense>
              <button className="icon-button scan-button" type="button" onClick={() => openAdd("receipt")} aria-label="식품 스캔 열기">
                <CameraIcon width={18} height={18} />
              </button>
            </div>
          </header>

          <section className="greeting-block" aria-labelledby="greeting-title">
            <div>
              <p className="eyebrow">TUESDAY · SEPTEMBER 1</p>
              <h1 id="greeting-title">오늘도 맛있게,<br /><em>민규님</em></h1>
            </div>
            <button className="notification-button" type="button" onClick={() => setToast("오늘 먼저 먹을 식품 3개를 확인했어요")} aria-label="알림 확인">
              <BellIcon width={18} height={18} />
              <span className="notification-dot" />
            </button>
          </section>

          <section className="mini-summary" aria-label="냉장고 요약">
            <div className="summary-item">
              <ArchiveIcon width={17} height={17} />
              <span><strong>{foods.length}개</strong> 보관 중</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <LightningBoltIcon width={17} height={17} />
              <span><strong>{priorityFoods.length}개</strong> 먼저 먹기</span>
            </div>
          </section>

          <section className="priority-section" aria-labelledby="priority-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">RESCUE QUEUE</p>
                <h2 id="priority-title">오늘 먼저 먹기 <span>{priorityFoods.length}</span></h2>
              </div>
              <button className="text-button" type="button" onClick={() => setStorageFilter("전체")}>전체 보기 <ChevronRightIcon width={14} height={14} /></button>
            </div>

            <div className="priority-list">
              <AnimatePresence initial={false}>
                {priorityFoods.map((food) => (
                  <motion.button
                    layout
                    key={food.id}
                    className={`priority-card ${food.priority === 1 ? "priority-card-accent" : ""}`}
                    type="button"
                    onClick={() => openDetail(food)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="food-image-wrap">
                      <img src={food.image} alt="" className="food-image" draggable={false} />
                    </div>
                    <span className="priority-copy">
                      <span className="food-name-line">
                        <strong>{food.name}</strong>
                        {food.opened ? <span className="opened-dot" title="개봉됨" /> : null}
                      </span>
                      <span className="food-subline">{food.brand} · {food.quantity}</span>
                      <span className="food-meta-line">
                        <span className={`storage-pill ${getStorageClass(food.storage)}`}>{food.storage}</span>
                        <span className="date-source">{getDateBadge(food)}</span>
                      </span>
                    </span>
                    <span className="priority-date">
                      <small>{food.dateKind === "actual_printed" ? "기한" : "우선"}</small>
                      <strong>{food.dateLabel}</strong>
                      <ChevronRightIcon width={14} height={14} />
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            <button className="meal-plan-button" type="button" onClick={() => setSheet("meal")}>
              <span className="meal-plan-icon"><LightningBoltIcon width={17} height={17} /></span>
              <span><strong>지금 있는 재료로 식단 만들기</strong><small>시금치·두부·닭가슴살을 먼저 써볼까요?</small></span>
              <ArrowRightIcon width={18} height={18} />
            </button>
          </section>

          <button className="trust-card" type="button" onClick={() => setSheet("guidance")}>
            <span className="trust-icon"><InfoCircledIcon width={18} height={18} /></span>
            <span><strong>AI는 소비기한을 확정하지 않아요</strong><small>표시 날짜와 사용자 확인을 가장 먼저 보여드려요.</small></span>
            <ChevronRightIcon width={16} height={16} />
          </button>

          <section className="inventory-section" aria-labelledby="inventory-title">
            <div className="section-heading inventory-heading">
              <div>
                <p className="section-kicker">YOUR PANTRY</p>
                <h2 id="inventory-title">내 식품 목록 <span>{filteredFoods.length}</span></h2>
              </div>
              <label className="filter-select-wrap">
                <span className="sr-only">보관 위치 필터</span>
                <select value={storageFilter} onChange={(event) => setStorageFilter(event.target.value as StorageType | "전체")}>
                  <option value="전체">보관위치 전체</option>
                  <option value="냉장">냉장만</option>
                  <option value="냉동">냉동만</option>
                  <option value="실온">실온만</option>
                </select>
                <ChevronDownIcon width={13} height={13} />
              </label>
            </div>

            <div className="inventory-list">
              {filteredFoods.map((food) => (
                <button className="inventory-row" type="button" key={food.id} onClick={() => openDetail(food)}>
                  <div className="inventory-image-wrap"><img src={food.image} alt="" className="inventory-image" draggable={false} /></div>
                  <span className="inventory-copy"><strong>{food.name}</strong><small>{food.brand} · {food.quantity}</small></span>
                  <span className="inventory-status"><span className={`storage-dot ${getStorageClass(food.storage)}`} />{food.dateLabel}</span>
                  <ChevronRightIcon className="row-chevron" width={15} height={15} />
                </button>
              ))}
            </div>
          </section>

          <button className="add-food-button" type="button" onClick={() => openAdd("receipt")}>
            <span className="add-food-plus"><PlusIcon width={20} height={20} /></span>
            <span><strong>식품 추가하기</strong><small>영수증·바코드·라벨로 빠르게</small></span>
            <ArrowRightIcon width={18} height={18} />
          </button>

          <p className="footer-caption"><ReaderIcon width={14} height={14} /> Rescue Meal은 기록을 도와주는 생활 도구예요.</p>
        </main>
      </MobileScroll>

      <BottomSheet
        open={sheet === "add"}
        onOpenChange={(open) => setSheet(open ? "add" : null)}
        title={addMode === "receipt" ? "영수증으로 추가" : addMode === "barcode" ? "바코드로 추가" : addMode === "label" ? "라벨로 추가" : "직접 추가"}
        description="구매 기록과 보관 상태를 확인한 뒤 내 식품 목록에 반영해요."
        snap={0.84}
      >
        <AddFoodSheet mode={addMode} onModeChange={setAddMode} onAddManual={addManualFood} onAddReceipt={addReceiptFoods} />
      </BottomSheet>

      <BottomSheet
        open={sheet === "detail" && Boolean(selectedFood)}
        onOpenChange={(open) => setSheet(open ? "detail" : null)}
        title={selectedFood?.name ?? "식품 상세"}
        description={selectedFood?.brand ?? "보관 상태와 날짜 출처를 확인해요."}
        snap={0.78}
      >
        {selectedFood ? (
          <FoodDetailSheet food={selectedFood} onSave={saveFood} onConsume={consumeFood} onDiscard={discardFood} onConfirmDate={confirmFoodDate} onShowGuidance={() => setSheet("guidance")} />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={sheet === "meal"}
        onOpenChange={(open) => setSheet(open ? "meal" : null)}
        title="오늘의 Rescue Meal"
        description="먼저 먹을 식품을 기준으로 만든 가벼운 제안이에요."
        snap={0.76}
      >
        <Suspense fallback={<ProcessingState label="식단 화면을 준비하고 있어요" detail="현재 재료와 우선순위를 확인합니다." />}><MealPlanSheet active={sheet === "meal"} foods={foods} onSaved={() => setToast("오늘의 식단을 저장했어요")} onCompleted={handleMealCompleted} /></Suspense>
      </BottomSheet>

      <BottomSheet
        open={sheet === "guidance"}
        onOpenChange={(open) => setSheet(open ? "guidance" : null)}
        title="날짜를 읽는 방법"
        description="안전과 편의를 분리해서 기록해요."
        snap={0.68}
      >
        <GuidanceSheet />
      </BottomSheet>

      <BottomSheet
        open={sheet === "account"}
        onOpenChange={(open) => setSheet(open ? "account" : null)}
        title="내 계정"
        description="다른 기기에서도 같은 식품 기록을 이어가요."
        snap={0.7}
      >
        <Suspense fallback={<ProcessingState label="계정 화면을 준비하고 있어요" detail="잠시만 기다려 주세요." />}><AccountSheet onAuthenticated={handleAuthenticated} onSignedOut={handleSignedOut} /></Suspense>
      </BottomSheet>

      <AnimatePresence>
        {toast ? (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <CheckCircledIcon width={17} height={17} /> {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function AddFoodSheet({
  mode,
  onModeChange,
  onAddManual,
  onAddReceipt,
}: {
  mode: AddMode;
  onModeChange: (mode: AddMode) => void;
  onAddManual: (food: FoodItem) => void;
  onAddReceipt: (payload: ReceiptCommitPayload) => void;
}) {
  const keyboard = useKeyboard();
  const [receiptStage, setReceiptStage] = useState<"idle" | "processing" | "review" | "unavailable">("idle");
  const [receiptSource, setReceiptSource] = useState("샘플 영수증");
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>(RECEIPT_LINES);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>(RECEIPT_LINES.map((line) => line.id));
  const [receiptDraftId, setReceiptDraftId] = useState<string | undefined>();
  const [receiptQualityWarnings, setReceiptQualityWarnings] = useState<string[]>([]);
  const [receiptError, setReceiptError] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [labelResult, setLabelResult] = useState(false);
  const [labelDetectedDate, setLabelDetectedDate] = useState("2026.09.02");
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("1개");
  const [storage, setStorage] = useState<StorageType>("냉장");

  const switchMode = (nextMode: AddMode) => {
    keyboard.hide();
    onModeChange(nextMode);
    setBarcodeResult(null);
    setScannerOpen(false);
    setLabelResult(false);
    setLabelDetectedDate("2026.09.02");
    setLabelError("");
    setLabelProcessing(false);
    setReceiptStage("idle");
    setReceiptError("");
    setReceiptLines(RECEIPT_LINES);
    setSelectedReceiptIds(RECEIPT_LINES.map((line) => line.id));
    setReceiptDraftId(undefined);
    setReceiptQualityWarnings([]);
  };

  const handleReceiptFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    keyboard.hide();
    setReceiptSource(file.name);
    setReceiptError("");
    if (!mealApi.isConfigured) {
      setReceiptLines(RECEIPT_LINES);
      setSelectedReceiptIds(RECEIPT_LINES.map((line) => line.id));
      setReceiptStage("review");
      return;
    }
    setReceiptStage("processing");
    try {
      const intake = await mealApi.intakeReceipt(file);
      if (!intake || intake.status !== "review_required" || !intake.draft) {
        setReceiptError(intake?.message ?? "OCR 엔진 응답이 없습니다.");
        setReceiptStage("unavailable");
        return;
      }
      const mappedLines = intake.draft.lines
        .filter((line) => line.line_type === "product")
        .map((line) => ({
          id: `api-${line.id}`,
          backendId: line.id,
          name: line.canonical_name ?? line.raw_name,
          detail: `${line.quantity}${line.unit} · ${(line.total_price ?? 0).toLocaleString("ko-KR")}원`,
          confidence: line.match_confidence,
          requiresReview: line.review_status === "pending",
          image: imageForFoodName(line.canonical_name ?? line.raw_name),
        }));
      if (!mappedLines.length) {
        setReceiptError("상품 line을 찾지 못했습니다. 사진을 다시 촬영해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      setReceiptLines(mappedLines);
      setSelectedReceiptIds(mappedLines.map((line) => line.id));
      setReceiptDraftId(intake.draft.id);
      setReceiptQualityWarnings(intake.quality.warnings);
      setReceiptStage("review");
    } catch {
      setReceiptError("파일을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setReceiptStage("unavailable");
    }
  };

  const lookupBarcode = async (input: string) => {
    const rawBarcode = input.trim();
    setBarcodeResult(rawBarcode ? "바코드 형식을 확인하고 있어요" : "예시 바코드를 입력하면 상품 후보를 보여드려요");
    keyboard.hide();
    if (!rawBarcode || !mealApi.isConfigured) {
      if (rawBarcode) setBarcodeResult("풀무원 국산콩 두부 · 상품 후보 1개");
      return;
    }
    try {
      const parsed = await mealApi.parseBarcode(rawBarcode);
      if (!parsed) return;
      const dateCandidate = parsed.date_assertions[0];
      if (dateCandidate) {
        setBarcodeResult(`GS1 날짜 후보 ${dateCandidate.value.replaceAll("-", ".")} · 라벨 확인 필요`);
      } else if (parsed.barcode_type === "restricted_circulation") {
        setBarcodeResult("가변중량·매장용 코드 후보 · 상품/중량 확인 필요");
      } else {
        const lookup = await mealApi.resolveProduct(parsed.gtin ?? rawBarcode);
        const candidate = lookup?.candidates[0];
        if (candidate) {
          setBarcodeResult(`${candidate.brand ? `${candidate.brand} ` : ""}${candidate.canonical_name} · 상품 후보 ${lookup?.candidates.length ?? 1}개`);
        } else {
          setBarcodeResult(lookup?.warnings[0] ?? parsed.warnings[0] ?? "상품 후보를 찾지 못했어요");
        }
      }
    } catch {
      setBarcodeResult("바코드 서버 조회를 완료하지 못했어요");
    }
  };

  const runBarcodeLookup = () => {
    void lookupBarcode(barcode);
  };

  const handleBarcodeDetected = (value: string) => {
    setBarcode(value);
    setScannerOpen(false);
    void lookupBarcode(value);
  };

  const applyLabelSample = () => {
    keyboard.hide();
    setLabelError("");
    setLabelDetectedDate("2026.09.02");
    setLabelResult(true);
  };

  const handleLabelFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    keyboard.hide();
    setLabelError("");
    if (!mealApi.isConfigured) {
      setLabelResult(true);
      return;
    }
    setLabelProcessing(true);
    try {
      const intake = await mealApi.intakeLabel(file);
      if (!intake || intake.status === "needs_ocr_engine" || intake.status === "failed" || !intake.consumption_date_candidate) {
        setLabelError(intake?.warnings?.[0] ?? "소비기한을 확인하지 못했습니다. 다른 면을 촬영해 주세요.");
        setLabelResult(false);
        return;
      }
      setLabelDetectedDate(intake.consumption_date_candidate.value.replaceAll("-", "."));
      setLabelResult(true);
    } catch {
      setLabelError("파일을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLabelResult(false);
    } finally {
      setLabelProcessing(false);
    }
  };

  const submitManual = () => {
    const normalizedName = foodName.trim();
    if (!normalizedName) return;
    keyboard.hide();
    onAddManual(createFood({
      name: normalizedName,
      quantity: quantity.trim() || "1개",
      storage,
      dateLabel: "확인 필요",
      dateDetail: "AI 소비 우선순위",
      dateKind: "estimated_use_first",
      dateSource: "상품 유형 + 보관 방식",
      note: "실제 소비기한이 아니라 먼저 확인할 순서예요. 표시 날짜를 확인하면 직접 갱신할 수 있어요.",
    }));
  };

  const submitReceipt = () => {
    keyboard.hide();
    onAddReceipt({
      lines: receiptLines.filter((line) => selectedReceiptIds.includes(line.id)),
      draftId: receiptDraftId,
      sourceFilename: receiptSource,
    });
  };

  return (
    <div className="add-sheet-content">
      <div className="mode-tabs" role="tablist" aria-label="식품 추가 방법">
        {([
          ["receipt", "영수증", FileTextIcon],
          ["barcode", "바코드", CameraIcon],
          ["label", "라벨", CalendarIcon],
          ["manual", "직접 입력", PlusIcon],
        ] as const).map(([tabMode, label, Icon]) => (
          <button key={tabMode} className={`mode-tab ${mode === tabMode ? "mode-tab-active" : ""}`} type="button" role="tab" aria-selected={mode === tabMode} onClick={() => switchMode(tabMode)}>
            <Icon width={16} height={16} />{label}
          </button>
        ))}
      </div>

      {mode === "receipt" ? (
        <>
          {receiptStage === "idle" ? (
            <div className="capture-intro">
              <div className="capture-visual"><UploadIcon width={25} height={25} /></div>
              <h3>영수증 한 장이면 충분해요</h3>
              <p>상품명과 수량을 읽고, 애매한 항목만<br />사장님께 먼저 확인받을게요.</p>
              <label className="primary-sheet-button file-button">
                <UploadIcon width={17} height={17} /> 사진 선택하기
                <input type="file" accept="image/*" onChange={handleReceiptFile} />
              </label>
              <button className="secondary-sheet-button" type="button" onClick={() => { setReceiptSource("샘플 영수증 · 10개 품목"); setReceiptLines(RECEIPT_LINES); setSelectedReceiptIds(RECEIPT_LINES.map((line) => line.id)); setReceiptDraftId(undefined); setReceiptQualityWarnings([]); setReceiptStage("review"); }}>
                샘플 영수증으로 시작
              </button>
              <div className="capture-hint"><CheckIcon width={14} height={14} /> OCR 결과는 반영 전에 직접 확인할 수 있어요.</div>
            </div>
          ) : receiptStage === "processing" ? (
            <ProcessingState label="영수증을 읽고 있어요" detail="파일을 서버로 보내 OCR 가능 여부와 상품 후보를 확인합니다." />
          ) : receiptStage === "unavailable" ? (
            <UnavailableState message={receiptError} onBack={() => setReceiptStage("idle")} />
          ) : (
            <ReceiptReview lines={receiptLines} qualityWarnings={receiptQualityWarnings} source={receiptSource} selectedIds={selectedReceiptIds} onToggle={(id) => setSelectedReceiptIds((ids) => ids.includes(id) ? ids.filter((currentId) => currentId !== id) : [...ids, id])} onSubmit={submitReceipt} onBack={() => setReceiptStage("idle")} />
          )}
        </>
      ) : null}

      {mode === "barcode" ? (
        <div className="input-flow">
          <div className="capture-visual compact"><CameraIcon width={25} height={25} /></div>
          <h3>바코드로 상품을 찾기</h3>
          <p>상품 바코드만으로는 소비기한을 알 수 없어요.<br />상품 정보를 찾아 보관 기준을 먼저 채워드려요.</p>
          <label className="app-input-label" htmlFor="barcode-input">바코드 숫자</label>
          <KeyboardInput id="barcode-input" className="app-input" value={barcode} inputMode="numeric" placeholder="예: 8801114167523" onChange={(event) => setBarcode(event.target.value)} onBlur={() => keyboard.hide()} />
          <button className="primary-sheet-button" type="button" onClick={() => setScannerOpen(true)}><CameraIcon width={17} height={17} /> 카메라로 스캔</button>
          {scannerOpen ? <Suspense fallback={<div className="scanner-loading" role="status">바코드 스캐너를 준비하고 있어요</div>}><BarcodeScanner onDetected={handleBarcodeDetected} onCancel={() => setScannerOpen(false)} /></Suspense> : null}
          <button className="secondary-sheet-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={runBarcodeLookup}><ReaderIcon width={17} height={17} /> 상품 후보 조회</button>
          <button className="secondary-sheet-button" type="button" onClick={() => { setBarcode("8801114167523"); setBarcodeResult("풀무원 국산콩 두부 · 상품 후보 1개"); }}>예시 바코드 입력</button>
          {barcodeResult ? <div className="result-callout"><CheckCircledIcon width={17} height={17} /><span><strong>{barcodeResult}</strong><small>소비기한은 포장지의 날짜를 촬영해 확인해 주세요.</small></span></div> : null}
        </div>
      ) : null}

      {mode === "label" ? (
        <div className="input-flow">
          <div className="capture-visual compact"><CalendarIcon width={25} height={25} /></div>
          <h3>포장지 날짜를 읽어볼게요</h3>
          <p>유통기한·소비기한·유효년월일 중<br />사진에서 확인되는 실제 표시만 기록해요.</p>
          <button className="primary-sheet-button" type="button" onClick={applyLabelSample}><CameraIcon width={17} height={17} /> 샘플 라벨 인식</button>
          <label className="secondary-sheet-button file-button">
            <UploadIcon width={17} height={17} /> {labelProcessing ? "라벨 분석 중" : "라벨 사진 선택"}
            <input type="file" accept="image/*" onChange={handleLabelFile} />
          </label>
          {labelError ? <div className="result-callout result-callout-warning"><InfoCircledIcon width={17} height={17} /><span><strong>{labelError}</strong><small>OCR이 소비기한을 확인하지 못하면 실제 날짜를 만들지 않아요.</small></span></div> : null}
          {labelResult ? <div className="label-result-card"><div><span className="result-label">시금치</span><strong>유효년월일 {labelDetectedDate}</strong></div><span className="confirmed-badge"><CheckIcon width={13} height={13} /> 표시 후보</span><button type="button" onClick={() => onAddManual(createFood({ name: "시금치", brand: "국내산 시금치", quantity: "1팩", storage: "냉장", dateLabel: formatApiDate(labelDetectedDate.replaceAll(".", "-")), dateDetail: labelDetectedDate, dateKind: "actual_printed", dateSource: "포장지 표시", image: FOOD_IMAGES.spinach, category: "채소", note: "포장지에서 유효년월일을 확인했어요." }))}>확인 후 반영</button></div> : null}
        </div>
      ) : null}

      {mode === "manual" ? (
        <div className="input-flow manual-flow">
          <div className="manual-note"><InfoCircledIcon width={17} height={17} /><span>날짜가 없거나 신선식품이면 먼저 이름과 보관 위치만 기록해도 괜찮아요.</span></div>
          <label className="app-input-label" htmlFor="food-name-input">식품 이름</label>
          <KeyboardInput id="food-name-input" className="app-input" value={foodName} placeholder="예: 대파, 김치, 남은 카레" onChange={(event) => setFoodName(event.target.value)} onBlur={() => keyboard.hide()} />
          <label className="app-input-label" htmlFor="food-quantity-input">수량</label>
          <KeyboardInput id="food-quantity-input" className="app-input" value={quantity} placeholder="예: 1팩" onChange={(event) => setQuantity(event.target.value)} onBlur={() => keyboard.hide()} />
          <span className="app-input-label">보관 위치</span>
          <StoragePicker value={storage} onChange={setStorage} />
          <button className="primary-sheet-button manual-submit" type="button" onClick={submitManual} disabled={!foodName.trim()}><PlusIcon width={17} height={17} /> 식품 추가하기</button>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptReview({
  lines,
  qualityWarnings,
  source,
  selectedIds,
  onToggle,
  onSubmit,
  onBack,
}: {
  lines: ReceiptLine[];
  qualityWarnings: string[];
  source: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const reviewCount = lines.filter((line) => selectedIds.includes(line.id)).length;
  return (
    <div className="receipt-review">
      <div className="review-summary"><span className="review-file-icon"><FileTextIcon width={20} height={20} /></span><span><strong>{source}</strong><small>상품 후보 {lines.length}개 · 선택 {reviewCount}개</small></span><button type="button" onClick={onBack} aria-label="영수증 다시 선택"><Cross2Icon width={17} height={17} /></button></div>
      {qualityWarnings.length ? <div className="quality-callout"><InfoCircledIcon width={17} height={17} /><span><strong>사진 품질 참고</strong><small>{qualityWarnings.join(" ")}</small></span></div> : null}
      <div className="review-callout"><InfoCircledIcon width={17} height={17} /><span><strong>애매한 항목은 한 번 더 확인해요</strong><small>체크된 항목만 내 식품 목록으로 이동합니다.</small></span></div>
      <div className="receipt-lines">
        {lines.map((line) => {
          const checked = selectedIds.includes(line.id);
          return <button className={`receipt-line ${checked ? "receipt-line-checked" : ""}`} type="button" key={line.id} onClick={() => onToggle(line.id)}><span className={`check-box ${checked ? "check-box-checked" : ""}`}>{checked ? <CheckIcon width={13} height={13} /> : null}</span><img src={line.image} alt="" draggable={false} /><span className="receipt-line-copy"><strong>{line.name}</strong><small>{line.detail}</small></span><span className={`ocr-confidence ${line.requiresReview ? "ocr-review" : ""}`}>{line.requiresReview ? "확인 필요" : `${Math.round(line.confidence * 100)}%`}</span></button>;
        })}
      </div>
      <button className="primary-sheet-button" type="button" disabled={reviewCount === 0} onClick={onSubmit}><CheckIcon width={17} height={17} /> {reviewCount}개 항목 반영하기</button>
      <p className="sheet-footnote">영수증에는 보통 소비기한이 없어서, 날짜는 포장지 확인 전까지 ‘확인 필요’로 남겨요.</p>
    </div>
  );
}

function ProcessingState({ label, detail }: { label: string; detail: string }) {
  return <div className="capture-intro processing-state"><div className="capture-visual"><UploadIcon width={25} height={25} /></div><h3>{label}</h3><p>{detail}</p><span className="processing-pulse" aria-hidden="true" /></div>;
}

function UnavailableState({ message, onBack }: { message: string; onBack: () => void }) {
  return <div className="capture-intro unavailable-state"><div className="capture-visual warning"><InfoCircledIcon width={25} height={25} /></div><h3>자동 인식이 아직 준비되지 않았어요</h3><p>{message || "OCR 엔진을 연결한 뒤 실제 사진을 분석할 수 있어요."}</p><button className="secondary-sheet-button" type="button" onClick={onBack}>샘플로 먼저 확인하기</button><div className="capture-hint"><InfoCircledIcon width={14} height={14} /> 자동 인식이 실패해도 수동 review로 등록할 수 있게 설계합니다.</div></div>;
}

function StoragePicker({ value, onChange }: { value: StorageType; onChange: (value: StorageType) => void }) {
  return <div className="storage-picker" role="group" aria-label="보관 위치 선택">{STORAGE_OPTIONS.map((option) => <button key={option} className={`storage-option ${value === option ? "storage-option-active" : ""}`} type="button" onClick={() => onChange(option)}><span className={`storage-dot ${getStorageClass(option)}`} />{option}{value === option ? <CheckIcon width={14} height={14} /> : null}</button>)}</div>;
}

function FoodDetailSheet({
  food,
  onSave,
  onConsume,
  onDiscard,
  onConfirmDate,
  onShowGuidance,
}: {
  food: FoodItem;
  onSave: (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number) => void;
  onConsume: (foodId: string, eventQuantity?: number) => void;
  onDiscard: (foodId: string, eventQuantity?: number) => void;
  onConfirmDate: (foodId: string, dateValue: string, kind: "use_by" | "best_before" | "user_reminder") => void;
  onShowGuidance: () => void;
}) {
  const [storage, setStorage] = useState<StorageType>(food.storage);
  const [opened, setOpened] = useState(food.opened);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const availableQuantity = quantityParts(food.quantity);
  const [eventQuantity, setEventQuantity] = useState(availableQuantity.amount);

  useEffect(() => {
    setStorage(food.storage);
    setOpened(food.opened);
    setDiscardConfirm(false);
    setDateEditorOpen(false);
    setEventQuantity(quantityParts(food.quantity).amount);
  }, [food.id, food.opened, food.quantity, food.storage]);

  return (
    <div className="detail-sheet-content">
      <div className="detail-hero">
        <div className="detail-image-wrap"><img src={food.image} alt="" className="detail-image" draggable={false} /></div>
        <div className="detail-hero-copy"><span className={`storage-pill ${getStorageClass(food.storage)}`}>{food.storage} 보관 중</span><h3>{food.name}</h3><p>{food.brand} · {food.quantity}</p></div>
      </div>
      <div className={`date-proof-card ${food.dateKind === "estimated_use_first" ? "date-proof-estimated" : ""}`}><div className="proof-icon"><CalendarIcon width={18} height={18} /></div><div><span>{getDateBadge(food)}</span><strong>{food.dateKind === "estimated_use_first" ? food.dateLabel + "까지 먼저 먹기" : food.dateDetail}</strong><small>{food.dateSource}</small></div><button type="button" onClick={onShowGuidance} aria-label="날짜 기준 자세히 보기"><InfoCircledIcon width={16} height={16} /></button></div>
      <p className="detail-note"><InfoCircledIcon width={15} height={15} /> {food.note}</p>
      {food.dateKind === "estimated_use_first" ? (dateEditorOpen ? <Suspense fallback={<div className="date-editor-loading" role="status">날짜 입력 화면을 준비하고 있어요</div>}><DateAssertionEditor onCancel={() => setDateEditorOpen(false)} onConfirm={(dateValue, kind) => onConfirmDate(food.id, dateValue, kind)} /></Suspense> : <button className="date-edit-button" type="button" onClick={() => setDateEditorOpen(true)}><CalendarIcon width={15} height={15} /><span><strong>포장지에서 확인한 날짜 입력</strong><small>확인 후 소비기한·품질유지기한·알림일로 저장해요.</small></span><ArrowRightIcon width={15} height={15} /></button>) : null}
      <div className="detail-section"><div className="detail-section-heading"><span><SewingPinIcon width={16} height={16} /> 보관 위치</span><small>바꾼 뒤 저장하세요</small></div><StoragePicker value={storage} onChange={setStorage} /></div>
      {availableQuantity.amount > 1 ? <div className="quantity-row"><span><strong>변경할 수량</strong><small>일부만 옮기거나 먹을 수 있어요.</small></span><span className="quantity-stepper"><button type="button" aria-label="수량 줄이기" disabled={eventQuantity <= 1} onClick={() => setEventQuantity((current) => Math.max(1, current - 1))}>−</button><strong>{eventQuantity}{availableQuantity.unit}</strong><button type="button" aria-label="수량 늘리기" disabled={eventQuantity >= availableQuantity.amount} onClick={() => setEventQuantity((current) => Math.min(availableQuantity.amount, current + 1))}>+</button></span></div> : null}
      <div className="opened-row"><span><ArchiveIcon width={17} height={17} /><span><strong>개봉했어요</strong><small>{opened ? "개봉 기록은 되돌릴 수 없어요." : "개봉 후 소비 우선순위를 높여요."}</small></span></span><button className={`toggle ${opened ? "toggle-on" : ""}`} type="button" role="switch" aria-checked={opened} disabled={opened} onClick={() => setOpened(true)}><span /></button></div>
      <div className="detail-actions"><button className="secondary-sheet-button" type="button" onClick={() => onConsume(food.id, eventQuantity)}><CheckCircledIcon width={17} height={17} /> {eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit} 먹었어요` : "먹었어요"}</button><button className="primary-sheet-button" type="button" onClick={() => onSave(food.id, storage, opened, eventQuantity)}>보관 상태 저장 <ArrowRightIcon width={17} height={17} /></button></div>
      {discardConfirm ? <div className="discard-confirm" role="alert"><div><strong>{eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit}` : "이 식품"}을 폐기할까요?</strong><small>폐기 후 목록에서 사라지고 기록으로 남아요.</small></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setDiscardConfirm(false)}>취소</button><button className="danger-sheet-button" type="button" onClick={() => onDiscard(food.id, eventQuantity)}>폐기 기록</button></div></div> : <button className="danger-text-button" type="button" onClick={() => setDiscardConfirm(true)}><InfoCircledIcon width={14} height={14} /> 상태가 이상해 폐기하기</button>}
      {mealApi.isConfigured ? <Suspense fallback={null}><FoodHistory foodId={food.id} unit={availableQuantity.unit} /></Suspense> : null}
    </div>
  );
}

function GuidanceSheet() {
  return (
    <div className="guidance-sheet">
      <div className="guidance-lead"><div className="guidance-icon"><InfoCircledIcon width={22} height={22} /></div><div><h3>안전한 기록의 순서</h3><p>Rescue Meal은 ‘먹어도 된다’를 판정하지 않아요. 확인된 날짜와 먼저 먹을 순서를 나눠서 보여드려요.</p></div></div>
      <div className="guidance-list">
        <div className="guidance-row"><span className="guidance-number">01</span><span><strong>포장지 표시</strong><small>소비기한·유통기한·유효년월일이 보이면 실제 날짜를 가장 먼저 기록해요.</small></span><span className="guidance-badge badge-green">확인됨</span></div>
        <div className="guidance-row"><span className="guidance-number">02</span><span><strong>사용자 확인</strong><small>직접 입력하거나 사진에서 확인한 날짜는 출처와 함께 남겨요.</small></span><span className="guidance-badge badge-blue">사용자</span></div>
        <div className="guidance-row"><span className="guidance-number">03</span><span><strong>AI 소비 우선순위</strong><small>날짜가 없을 때 상품 유형·보관 방식으로 ‘먼저 볼 순서’만 추정해요.</small></span><span className="guidance-badge badge-coral">추정</span></div>
      </div>
      <div className="guidance-warning"><LightningBoltIcon width={16} height={16} /><span>냄새·색·포장 팽창 등 상태가 이상하면 날짜와 관계없이 먹지 말고 폐기 여부를 확인하세요.</span></div>
    </div>
  );
}
