import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CalendarIcon, CheckCircledIcon, ChevronDownIcon, InfoCircledIcon, LightningBoltIcon, PlusIcon, TimerIcon } from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import { isMealApiAuthError, MEAL_API_WORKSPACE_CONFLICT_MESSAGE, isMealApiMealPlanCompletionPersistenceError, isMealApiMealPlanPersistenceError, isMealApiMealPreferencesPersistenceError, isMealApiMultiDayPlanPersistenceError, isMealApiShoppingListPersistenceError, isMealApiWorkspaceConflictError, mealApi, type ApiAllergenCode, type ApiGrocySyncStatus, type ApiMealPlan, type ApiMealPlanAuditEvent, type ApiMealPlanOptions, type ApiMealPreferences, type ApiMultiDayMealPlan, type ApiShoppingListItem } from "./mealApi";
import { WorkspaceSyncCoordinator, type WorkspaceSyncInvalidation, type WorkspaceSyncTransport } from "./workspaceSync";
import { getMealPlanErrorPresentation, mealPlanDisplayCopy } from "./mealPlanPresentation";
type MealFood = {
  id: string;
  name: string;
  image: string;
  quantity: string;
};

type DemoDateReviewFood = {
  id: string;
  name: string;
};

type ConsumptionRow = {
  foodId: string;
  name: string;
  unit: string;
  maxQuantity: number;
  defaultQuantity: number;
  step: number;
};

type MealPlanConsumption = {
  food_id: string;
  quantity: number;
};

type MealPlanSavePayload = {
  inventoryIds: string[];
  planId: string;
  snapshotHash: string;
  maxMinutes: number;
  recipeId: string;
  bundleId?: string;
  bundleDayIndex?: number;
  servings: number;
};

type DemoShoppingListEntry = {
  canonical_name: string;
  quantity: number;
  unit: string;
  day_index?: number | null;
};

type MultiDayPlanSavePayload = {
  inventoryIds: string[];
  bundleId: string;
  snapshotHash: string;
  maxMinutes: number;
  servings: number;
};

type ShoppingRetryAction = {
  label: string;
  onRetry: () => void;
};

const MEAL_TIME_OPTIONS = [10, 20, 30, 45] as const;
const MEAL_SERVING_OPTIONS = [1, 2, 3, 4] as const;

const ALLERGEN_OPTIONS: Array<{ value: ApiAllergenCode; label: string }> = [
  { value: "soy", label: "대두·콩" },
  { value: "egg", label: "달걀" },
  { value: "milk", label: "우유" },
  { value: "fish", label: "생선" },
  { value: "shellfish", label: "갑각류·조개" },
  { value: "wheat", label: "밀" },
  { value: "peanut", label: "땅콩" },
  { value: "tree_nut", label: "견과류" },
];

function sameAllergenSelections(left: ApiAllergenCode[], right: ApiAllergenCode[]) {
  return left.length === right.length && left.every((allergen) => right.includes(allergen));
}

const FOOD_IMAGES = {
  spinach: "/assets/food/spinach-photo.jpg",
  tofu: "/assets/food/tofu-photo.jpg",
  chicken: "/assets/food/chicken-photo.jpg",
  mushroom: "/assets/food/mushroom-photo.jpg",
  eggs: "/assets/food/eggs-photo.jpg",
  milk: "/assets/food/milk-photo.jpg",
  tomato: "/assets/food/tomato-photo.jpg",
  groceries: "/assets/food/groceries-photo.jpg",
} as const;

function imageForFoodName(name: string) {
  if (name.includes("시금치")) return FOOD_IMAGES.spinach;
  if (name.includes("두부")) return FOOD_IMAGES.tofu;
  if (name.includes("닭")) return FOOD_IMAGES.chicken;
  if (name.includes("버섯")) return FOOD_IMAGES.mushroom;
  if (name.includes("달걀") || name.includes("계란")) return FOOD_IMAGES.eggs;
  if (name.includes("우유")) return FOOD_IMAGES.milk;
  if (name.includes("토마토")) return FOOD_IMAGES.tomato;
  return FOOD_IMAGES.groceries;
}

function mealPlanErrorPresentation(reason: unknown, fallback: string) {
  const kind = isMealApiAuthError(reason)
    ? "authentication"
    : isMealApiWorkspaceConflictError(reason)
      ? "workspace-conflict"
      : "other";
  return getMealPlanErrorPresentation(kind, fallback, MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
}

function ingredientAvailabilityCopy(ingredients: ApiMealPlan["ingredients"]) {
  if (!ingredients.length) return "재료 정보를 찾지 못했어요";
  const available = ingredients.filter((ingredient) => ingredient.available).length;
  return available === ingredients.length ? "필요한 재료를 모두 갖고 있어요" : `${ingredients.length}종 중 ${available}종을 사용할 수 있어요`;
}

type MealPlanLoadResult<T> = { value: T | null; error: unknown | null };

function settleMealPlanRequest<T>(request: Promise<T>): Promise<MealPlanLoadResult<T>> {
  return request
    .then((value) => ({ value, error: null }))
    .catch((error: unknown) => ({ value: null, error }));
}

function ingredientStatus(ingredient: ApiMealPlan["ingredients"][number]) {
  const required = `${formatIngredientQuantity(ingredient.amount)}${ingredient.unit}`;
  const notes = [
    ingredient.match_type === "alias" ? "이름을 맞춰 찾았어요" : null,
    ingredient.quantity_match === "converted" ? "단위를 맞춰 계산했어요" : null,
  ].filter(Boolean);
  const note = notes.length ? ` · ${notes.join(" · ")}` : "";

  if (ingredient.quantity_match === "incompatible") return `필요 ${required} · 단위가 달라 수량을 비교할 수 없어요`;

  const conversion = ingredient.available_unit ? unitConversion(ingredient.available_unit, ingredient.unit) : null;
  const comparableAvailable = typeof ingredient.available_quantity === "number"
    && Number.isFinite(ingredient.available_quantity)
    && conversion !== null
    ? Math.round(ingredient.available_quantity * conversion * 1000) / 1000
    : null;

  if (!ingredient.available) {
    if (comparableAvailable !== null && comparableAvailable < ingredient.amount) {
      const missing = Math.round((ingredient.amount - comparableAvailable) * 1000) / 1000;
      return `필요 ${required} · 목록에 ${formatIngredientQuantity(comparableAvailable)}${ingredient.unit} 있어요 · ${formatIngredientQuantity(missing)}${ingredient.unit} 더 필요해요${note}`;
    }
    if (ingredient.quantity_match === "missing" || !ingredient.available_food_id) return `필요 ${required} · 식품 목록에 없어요`;
    return `필요 ${required} · 수량을 알 수 없어요`;
  }

  return comparableAvailable !== null
    ? `필요 ${required} · 목록에 ${formatIngredientQuantity(comparableAvailable)}${ingredient.unit} 있어요${note}`
    : `필요 ${required} · 필요한 양이 있어요${note}`;
}

function formatIngredientQuantity(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

function shoppingShortageQuantity(ingredient: ApiMealPlan["ingredients"][number]) {
  if (ingredient.available) return 0;
  const conversion = ingredient.available_unit ? unitConversion(ingredient.available_unit, ingredient.unit) : null;
  if (ingredient.quantity_match !== "incompatible" && typeof ingredient.available_quantity === "number" && conversion !== null) {
    return Math.max(0, Math.round((ingredient.amount - ingredient.available_quantity * conversion) * 1000) / 1000);
  }
  return ingredient.amount;
}

function missingShoppingEntries(ingredients: ApiMealPlan["ingredients"], dayIndex?: number): DemoShoppingListEntry[] {
  return ingredients.flatMap((ingredient) => {
    const quantity = shoppingShortageQuantity(ingredient);
    return quantity > 0 ? [{ canonical_name: ingredient.canonical_name, quantity, unit: ingredient.unit, day_index: dayIndex ?? null }] : [];
  });
}

function parseFoodQuantity(quantity: string) {
  const match = quantity.replace(/,/g, "").trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { amount: 0, unit: "개" };
  const amount = Number(match[1]);
  return { amount: Number.isFinite(amount) ? amount : 0, unit: match[2] || "개" };
}

const UNIT_ALIASES: Record<string, string> = {
  그램: "g",
  gram: "g",
  grams: "g",
  킬로그램: "kg",
  킬로: "kg",
  키로그램: "kg",
  키로: "kg",
  kilogram: "kg",
  kilograms: "kg",
  밀리그램: "mg",
  milligram: "mg",
  milligrams: "mg",
  밀리리터: "ml",
  밀리: "ml",
  milliliter: "ml",
  milliliters: "ml",
  cc: "ml",
  리터: "l",
  리터스: "l",
  liter: "l",
  liters: "l",
  개수: "개",
  ea: "개",
  pc: "개",
  pcs: "개",
  piece: "개",
  pieces: "개",
};

const UNIT_DEFINITIONS: Record<string, { dimension: "mass" | "volume"; factor: number }> = {
  mg: { dimension: "mass", factor: 0.001 },
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
};

function normalizeUnit(unit: string) {
  const key = unit.normalize("NFKC").replace(/\s/g, "").toLowerCase();
  return UNIT_ALIASES[key] ?? key;
}

function unitConversion(fromUnit: string, toUnit: string) {
  const fromKey = normalizeUnit(fromUnit);
  const toKey = normalizeUnit(toUnit);
  if (fromKey === toKey) return 1;
  const from = UNIT_DEFINITIONS[fromKey];
  const to = UNIT_DEFINITIONS[toKey];
  if (!from || !to || from.dimension !== to.dimension) return null;
  return from.factor / to.factor;
}

function quantityStep(unit: string) {
  const normalized = normalizeUnit(unit);
  if (normalized === "mg" || normalized === "g" || normalized === "ml") return 10;
  if (normalized === "kg" || normalized === "l") return 0.1;
  if (/개|알|판/.test(normalized)) return 1;
  return 0.5;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function shoppingSourceLabel(item: ApiShoppingListItem) {
  const planCount = item.sources.filter((source) => source.source_type !== "manual").length;
  const hasManualSource = item.sources.some((source) => source.source_type === "manual");
  if (hasManualSource && planCount) return `직접 추가 · 식단 ${planCount}개`;
  if (hasManualSource) return "직접 추가";
  return `식단 ${planCount}개`;
}

function formatPlanDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(parsed);
}

function multiDayDayStatus(status: ApiMultiDayMealPlan["days"][number]["status"]) {
  if (status === "completed") return "조리 완료";
  if (status === "saved") return "저장됨";
  return "저장 전";
}

function grocyCompletionDetail(status?: ApiGrocySyncStatus) {
  if (!status || status === "succeeded" || status === "not_configured") return null;
  if (status === "queued" || status === "in_flight") return "재고 앱에 보내고 있어요. 알림에서 확인할 수 있어요.";
  if (status === "needs_mapping") return "재고 앱에 이 상품을 연결해 주세요. 계정 설정에서 상품을 고를 수 있어요.";
  if (status === "needs_reconciliation") return "재고 앱에 추가됐는지 계정 설정에서 살펴봐 주세요.";
  return "재고 앱에 추가하지 못했어요. 알림에서 다시 보내 주세요.";
}

function grocyCompletionSyncState(status?: ApiGrocySyncStatus) {
  if (!status || status === "succeeded" || status === "not_configured") return undefined;
  if (status === "queued") return "queued";
  if (status === "in_flight") return "processing";
  return "action_required";
}

function allergenLabel(value: string) {
  return ALLERGEN_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function consumptionRowsForPlan(plan: ApiMealPlan, foods: MealFood[]): ConsumptionRow[] {
  return plan.ingredients.flatMap((ingredient) => {
    const allocations = ingredient.allocations?.length
      ? ingredient.allocations
      : ingredient.available && ingredient.available_food_id
        ? [{ food_id: ingredient.available_food_id, quantity: ingredient.amount }]
        : [];
    return allocations.map((allocation) => {
      const food = foods.find((item) => item.id === allocation.food_id);
      const current = food ? parseFoodQuantity(food.quantity) : { amount: allocation.quantity, unit: ingredient.unit };
      const allocationUnit = allocation.unit ?? ingredient.unit;
      const conversion = unitConversion(current.unit, allocationUnit);
      const maxQuantity = conversion == null ? 0 : Math.min(allocation.quantity, current.amount * conversion);
      return {
        foodId: allocation.food_id,
        name: food?.name ?? ingredient.canonical_name,
        unit: allocationUnit,
        maxQuantity,
        defaultQuantity: maxQuantity,
        step: quantityStep(allocationUnit),
      };
    });
  });
}

function initialConsumptionDraft(plan: ApiMealPlan, foods: MealFood[]) {
  return Object.fromEntries(consumptionRowsForPlan(plan, foods).map((row) => [row.foodId, row.defaultQuantity]));
}

function createDemoPlan(foods: MealFood[], maxMinutes = 30, servings = 1, dateReviewFoods: DemoDateReviewFood[] = []): ApiMealPlan {
  const dateReviewFields = {
    date_review_required: dateReviewFoods.length > 0,
    date_review_foods: dateReviewFoods.map((food) => food.name),
    date_review_food_ids: dateReviewFoods.map((food) => food.id),
    date_review_note: dateReviewFoods.length
      ? dateReviewFoods.map((food) => food.name).join("·") + "의 포장지 날짜와 보관 방법을 살펴본 뒤 조리해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요."
      : null,
  };

  if (maxMinutes < 15) {
    return {
      id: `demo-meal-plan-no-match-${maxMinutes}-${servings}`,
      snapshot_hash: `demo-fixture-no-match-${maxMinutes}-${servings}`,
      saved_at: null,
      completed_at: null,
      consumed_food_ids: [],
      completed_skipped_ingredients: [],
      consumed_allocations: [],
      ...dateReviewFields,
      recipe_id: "no-match",
      planner_version: "demo-fixture-v1",
      source: "local_fixture",
      title: `${maxMinutes}분 안에 만들 메뉴를 찾지 못했어요`,
      minutes: 0,
      max_minutes: maxMinutes,
      servings,
      inventory_ids: [],
      ingredients: [],
      missing_ingredients: [],
      matched_ratio: 0,
      score: 0,
      reason: "조리 시간을 늘리거나 재료를 더 추가해 다시 찾아보세요.",
      steps: [],
      safety_note: "선택한 조건에 맞는 메뉴가 없어 식단을 저장하지 않았어요.",
    };
  }

  const demoIngredientFoods: MealFood[] = [];
  const seenIngredientNames = new Set<string>();
  for (const food of foods) {
    const normalizedName = food.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
    if (!normalizedName || seenIngredientNames.has(normalizedName)) continue;
    seenIngredientNames.add(normalizedName);
    demoIngredientFoods.push(food);
    if (demoIngredientFoods.length === 3) break;
  }

  const demoIngredients: ApiMealPlan["ingredients"] = demoIngredientFoods.map((food) => {
    const stockFoods = foods.filter((candidate) => candidate.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR") === food.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"));
    const requiredAmount = servings;
    const unit = parseFoodQuantity(food.quantity).unit || "개";
    const compatibleStocks = stockFoods.flatMap((stockFood) => {
      const stock = parseFoodQuantity(stockFood.quantity);
      const stockUnit = stock.unit || "개";
      const conversion = unitConversion(stockUnit, unit);
      return conversion === null ? [] : [{ food: stockFood, quantity: stock.amount * conversion, conversion, stockUnit }];
    });
    const availableQuantity = compatibleStocks.length
      ? Math.round(compatibleStocks.reduce((total, stock) => total + stock.quantity, 0) * 1000) / 1000
      : null;
    let remaining = requiredAmount;
    const allocations: NonNullable<ApiMealPlan["ingredients"][number]["allocations"]> = [];
    for (const stock of compatibleStocks) {
      if (remaining <= 0) break;
      const allocated = Math.min(stock.quantity, remaining);
      if (allocated > 0) {
        allocations.push({ food_id: stock.food.id, quantity: Math.round((allocated / stock.conversion) * 1000) / 1000, unit: stock.stockUnit });
        remaining = Math.round((remaining - allocated) * 1000) / 1000;
      }
    }
    const available = remaining <= 0;
    const quantityMatch = !stockFoods.length ? "missing" : !compatibleStocks.length ? "incompatible" : compatibleStocks.some((stock) => stock.conversion !== 1) ? "converted" : "exact";
    return {
      canonical_name: food.name,
      amount: requiredAmount,
      unit,
      available,
      available_food_id: allocations[0]?.food_id ?? stockFoods[0]?.id ?? null,
      available_quantity: availableQuantity,
      available_unit: availableQuantity === null ? null : unit,
      match_type: "exact",
      quantity_match: quantityMatch,
      allocations,
    };
  });
  const missingIngredients = demoIngredients.filter((ingredient) => !ingredient.available).map((ingredient) => ingredient.canonical_name);
  const availableIngredientCount = demoIngredients.length - missingIngredients.length;
  const matchedRatio = demoIngredients.length ? availableIngredientCount / demoIngredients.length : 0;
  const demoInventoryIds = [...new Set(demoIngredients.flatMap((ingredient) => ingredient.allocations?.map((allocation) => allocation.food_id) ?? []))];
  const isSeedRecipe = foods.some((food) => food.name.includes("시금치")) && foods.some((food) => food.name.includes("두부")) && foods.some((food) => food.name.includes("닭"));
  return {
    id: "demo-meal-plan",
    snapshot_hash: "demo-fixture-v1",
    recipe_source_name: "Rescue Meal에서 작성",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "demo-v1",
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    ...dateReviewFields,
    recipe_id: "demo-rescue-recipe",
    planner_version: "demo-fixture-v1",
    source: "local_fixture",
    title: isSeedRecipe ? "시금치 두부 닭가슴살 덮밥" : "냉장고 재료 볶음",
    minutes: 15,
    max_minutes: maxMinutes,
    servings,
    inventory_ids: demoInventoryIds,
    ingredients: demoIngredients,
    missing_ingredients: missingIngredients,
    matched_ratio: matchedRatio,
    score: Math.round(matchedRatio * 100),
    reason: "식품 목록에 있는 재료를 활용한 메뉴예요.",
    steps: ["재료를 꺼내 포장지 날짜와 상태를 살펴보세요.", "단단한 재료부터 팬에 볶아 주세요.", "마지막에 잎채소를 넣고 익으면 바로 드세요."],
    safety_note: "냄새나 색이 평소와 다르면 먹지 말고 버려 주세요.",
  };
}

export default function MealPlanSheet({ foods, active = false, returningFromDetail = false, plannerContextKey = "", onOpenChange, initialMaxMinutes = 30, initialServings = 1, dateReviewFoods = [], onSaved, onCompleted, onOpenFoodDetail, onOpenAdd, onOpenSyncReview, onOpenShoppingList, onAddDemoShoppingItems, onOptionsChange, onAuthenticationRequired, onOpenAccount, workspaceSync, workspaceTransport }: {
  foods: MealFood[];
  active?: boolean;
  returningFromDetail?: boolean;
  plannerContextKey?: string;
  onOpenChange: (open: boolean) => void;
  initialMaxMinutes?: number;
  initialServings?: number;
  dateReviewFoods?: DemoDateReviewFood[];
  onSaved: (kind?: "single" | "multi-day", hasMissingIngredients?: boolean, addMissingIngredients?: () => void | Promise<void>) => void;
  onCompleted?: (foodIds: string[], skippedCount: number, consumedAllocations: Array<{ food_id: string; quantity: number }>, grocySyncStatus?: ApiGrocySyncStatus) => void;
  onOpenFoodDetail?: (foodId: string) => void;
  onOpenAdd?: () => void;
  onOpenSyncReview?: (state: "action_required" | "queued" | "processing") => void;
  onOpenShoppingList?: () => void;
  onAddDemoShoppingItems?: (sourceType: "meal_plan" | "multi_day", sourceId: string, items: DemoShoppingListEntry[]) => Promise<ApiShoppingListItem[]>;
  onOptionsChange?: (options: { maxMinutes: number; servings: number }) => void;
  onAuthenticationRequired?: () => void;
  onOpenAccount?: () => void;
  workspaceSync: WorkspaceSyncCoordinator;
  workspaceTransport: WorkspaceSyncTransport | null;
}) {
  const keyboard = useKeyboard();
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionGrocySyncStatus, setCompletionGrocySyncStatus] = useState<ApiGrocySyncStatus | undefined>(undefined);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [consumptionDraft, setConsumptionDraft] = useState<Record<string, number>>({});
  const [auditEvents, setAuditEvents] = useState<ApiMealPlanAuditEvent[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [historyPlans, setHistoryPlans] = useState<ApiMealPlan[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [maxMinutes, setMaxMinutes] = useState(initialMaxMinutes);
  const [servings, setServings] = useState(initialServings);
  const updateMaxMinutes = (value: number) => {
    setMaxMinutes(value);
    onOptionsChange?.({ maxMinutes: value, servings });
  };
  const updateServings = (value: number) => {
    setServings(value);
    onOptionsChange?.({ maxMinutes, servings: value });
  };
  const [plan, setPlan] = useState<ApiMealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveRetryPayload, setSaveRetryPayload] = useState<MealPlanSavePayload | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completionRetry, setCompletionRetry] = useState(false);
  const [completionRetryPayload, setCompletionRetryPayload] = useState<MealPlanConsumption[] | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState("");
  const [authenticationExpired, setAuthenticationExpired] = useState(false);
  const [latestPlanReadbackNotice, setLatestPlanReadbackNotice] = useState("");
  const [alternatives, setAlternatives] = useState<ApiMealPlan[]>([]);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState("");
  const [multiDayPreview, setMultiDayPreview] = useState<ApiMultiDayMealPlan | null>(null);
  const [multiDayOpen, setMultiDayOpen] = useState(false);
  const [multiDayLoading, setMultiDayLoading] = useState(false);
  const [multiDaySaved, setMultiDaySaved] = useState(false);
  const [multiDaySaving, setMultiDaySaving] = useState(false);
  const [multiDaySaveRetryPayload, setMultiDaySaveRetryPayload] = useState<MultiDayPlanSavePayload | null>(null);
  const [multiDayError, setMultiDayError] = useState("");
  const [multiDayHistory, setMultiDayHistory] = useState<ApiMultiDayMealPlan[]>([]);
  const [multiDayHistoryOpen, setMultiDayHistoryOpen] = useState(false);
  const [multiDayHistoryLoading, setMultiDayHistoryLoading] = useState(false);
  const [multiDayHistoryError, setMultiDayHistoryError] = useState("");
  const [shoppingList, setShoppingList] = useState<ApiShoppingListItem[]>([]);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingMutating, setShoppingMutating] = useState(false);
  const shoppingRefreshQueuedRef = useRef(false);
  const [shoppingRefreshQueued, setShoppingRefreshQueued] = useState(false);
  const [shoppingError, setShoppingError] = useState("");
  const [shoppingRetryAction, setShoppingRetryAction] = useState<ShoppingRetryAction | null>(null);
  const [mealPreferences, setMealPreferences] = useState<ApiMealPreferences>({ avoid_allergens: [] });
  const [mealPreferencesDraft, setMealPreferencesDraft] = useState<ApiAllergenCode[]>([]);
  const [mealPreferencesLoaded, setMealPreferencesLoaded] = useState(false);
  const [mealPreferencesOpen, setMealPreferencesOpen] = useState(false);
  const [mealPreferencesLoading, setMealPreferencesLoading] = useState(false);
  const [mealPreferencesSaving, setMealPreferencesSaving] = useState(false);
  const [mealPreferencesError, setMealPreferencesError] = useState("");
  const [mealPreferencesRetry, setMealPreferencesRetry] = useState(false);
  const [mealPreferencesNotice, setMealPreferencesNotice] = useState("");
  const [mealPreferencesVersion, setMealPreferencesVersion] = useState(0);
  const [mealPlanRefreshNonce, setMealPlanRefreshNonce] = useState(0);
  const [remoteRefreshRequired, setRemoteRefreshRequired] = useState(false);
  const mealPlanRevisionRef = useRef<number | null>(null);
  const mealPreferencesDraftRef = useRef<ApiAllergenCode[]>([]);
  const mealPreferencesSavedRef = useRef<ApiAllergenCode[]>([]);
  const mealPreferencesDraftWorkspaceRef = useRef<string | null>(null);
  const mealPreferencesSavedWorkspaceRef = useRef<string | null>(null);
  const mealPreferencesSessionRef = useRef<{ active: boolean; workspaceKey: string | null; inputSignature: string | null }>({ active: false, workspaceKey: null, inputSignature: null });
  const mealPreferencesDraftDirty = mealPreferencesDraftWorkspaceRef.current === workspaceSync.currentWorkspaceKey
    && mealPreferencesSavedWorkspaceRef.current === workspaceSync.currentWorkspaceKey
    && !sameAllergenSelections(mealPreferencesDraftRef.current, mealPreferencesSavedRef.current);
  const pollingInFlightRef = useRef(false);
  const plannerBusyRef = useRef(false);
  const completionActionsRef = useRef<HTMLDivElement | null>(null);
  const recipeViewActionRef = useRef<HTMLButtonElement | null>(null);
  const recipeDetailsRef = useRef<HTMLDivElement | null>(null);
  const multiDayToggleRef = useRef<HTMLButtonElement | null>(null);
  const shoppingToggleRef = useRef<HTMLButtonElement | null>(null);
  const shoppingFirstItemRef = useRef<HTMLButtonElement | null>(null);
  const safetySummaryRef = useRef<HTMLElement | null>(null);
  const mealPreferencesSectionRef = useRef<HTMLElement | null>(null);
  const authenticationExpiryHandledRef = useRef(false);
  const authenticationRecoveryActionRef = useRef<HTMLButtonElement | null>(null);
  const revealMealPreferencesRef = useRef(false);
  const revealCompletionRef = useRef(false);
  const revealCompletionFocusRef = useRef(false);
  const revealInstructionsFocusRef = useRef(false);
  const multiDaySaveFocusRef = useRef(false);
  const initialFocusHandledRef = useRef(false);
  const ingredients = foods.slice(0, 20);
  const ingredientKey = ingredients.map((food) => food.id).join("|");
  const dateReviewKey = dateReviewFoods.map((food) => `${food.id}:${food.name}`).join("|");
  const shoppingRemainingCount = shoppingList.filter((item) => !item.checked).length;
  plannerBusyRef.current = loading || saving || completing || multiDayLoading || multiDaySaving || historyLoading || auditLoading || alternativesLoading || shoppingLoading || shoppingMutating || mealPreferencesLoading || mealPreferencesSaving;

  const rememberMealPlanRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    mealPlanRevisionRef.current = value;
    return value;
  };

  const rememberCurrentWorkspaceRevision = () => {
    rememberMealPlanRevision(mealApi.workspaceRevision);
  };

  const presentMealPlanError = (reason: unknown, fallback: string) => {
    const presentation = mealPlanErrorPresentation(reason, fallback);
    if (presentation.recovery === "account") {
      setAuthenticationExpired(true);
      if (!authenticationExpiryHandledRef.current) {
        authenticationExpiryHandledRef.current = true;
        onAuthenticationRequired?.();
      }
    }
    return presentation.message;
  };

  useEffect(() => {
    if (!authenticationExpired) return;
    const frame = window.requestAnimationFrame(() => authenticationRecoveryActionRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [authenticationExpired]);

  useEffect(() => {
    if (!active) {
      if (!returningFromDetail) mealPreferencesSessionRef.current.active = false;
      authenticationExpiryHandledRef.current = false;
      setAuthenticationExpired(false);
      return;
    }
    const currentWorkspaceKey = workspaceSync.currentWorkspaceKey;
    const currentInputSignature = JSON.stringify({
      workspaceKey: currentWorkspaceKey,
      plannerContextKey,
      ingredients: ingredients.map(({ id, name, quantity }) => [id, name, quantity]),
      dateReviewFoods: dateReviewFoods.map(({ id, name }) => [id, name]),
      maxMinutes,
      servings,
    });
    const priorSession = mealPreferencesSessionRef.current;
    const startingPlannerSession = !priorSession.active;
    const changingWorkspace = mealPreferencesSessionRef.current.workspaceKey !== null
      && mealPreferencesSessionRef.current.workspaceKey !== currentWorkspaceKey;
    const preservingPlannerView = returningFromDetail
      && !startingPlannerSession
      && !changingWorkspace
      && priorSession.inputSignature === currentInputSignature;
    mealPreferencesSessionRef.current = { active: true, workspaceKey: currentWorkspaceKey, inputSignature: currentInputSignature };
    if (startingPlannerSession || changingWorkspace) {
      authenticationExpiryHandledRef.current = false;
      setAuthenticationExpired(false);
      setMealPreferencesOpen(false);
      setMealPreferencesLoaded(false);
      setMealPreferencesError("");
      setMealPreferencesRetry(false);
      if (changingWorkspace) {
        setMealPreferences({ avoid_allergens: [] });
        mealPreferencesSavedRef.current = [];
        mealPreferencesSavedWorkspaceRef.current = null;
      }
      const draftBaseline = changingWorkspace ? [] : mealPreferencesSavedRef.current;
      mealPreferencesDraftRef.current = draftBaseline;
      mealPreferencesDraftWorkspaceRef.current = currentWorkspaceKey;
      setMealPreferencesDraft(draftBaseline);
    }
    let cancelled = false;
    let preferencesHandled = false;
    setError("");
    setLatestPlanReadbackNotice("");
    if (!preservingPlannerView) {
      setSaved(false);
      setCompleted(false);
      setCompletionGrocySyncStatus(undefined);
      setSafetyAcknowledged(false);
      setSkippedCount(0);
      setAuditEvents([]);
      setAuditOpen(false);
      setAuditError("");
      setHistoryPlans([]);
      setHistoryOpen(false);
      setHistoryError("");
      revealInstructionsFocusRef.current = false;
      setShowDetails(false);
      setSaveRetryPayload(null);
      setCompletionRetry(false);
      setCompletionRetryPayload(null);
      setAlternatives([]);
      setAlternativesOpen(false);
      setAlternativesLoading(false);
      setAlternativesError("");
      setMultiDayPreview(null);
      setMultiDayOpen(false);
      setMultiDayLoading(false);
      setMultiDaySaved(false);
      setMultiDaySaving(false);
      setMultiDaySaveRetryPayload(null);
      setMultiDayError("");
      setMultiDayHistory([]);
      setMultiDayHistoryOpen(false);
      setMultiDayHistoryLoading(false);
      setMultiDayHistoryError("");
      setShoppingList([]);
      setShoppingOpen(false);
      setShoppingLoading(false);
      setShoppingMutating(false);
      setShoppingError("");
      setShoppingRetryAction(null);
      setRemoteRefreshRequired(false);
      revealCompletionRef.current = false;
    }
    if (!ingredients.length) {
      setPlan(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (!mealApi.isConfigured) {
      const demoPlan = createDemoPlan(ingredients, maxMinutes, servings, dateReviewFoods);
      setPlan(demoPlan);
      if (!preservingPlannerView) setConsumptionDraft(initialConsumptionDraft(demoPlan, ingredients));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setMealPreferencesLoading(true);
    setPlan(null);
    setLoading(true);
    const inventoryIds = ingredients.map((food) => food.id);
    void workspaceSync.run("meal-plan", async (signal) => {
      const [preferences, response, latest, revision] = await Promise.all([
        settleMealPlanRequest(mealApi.getMealPreferences(signal)),
        settleMealPlanRequest(mealApi.previewMealPlan(inventoryIds, maxMinutes, "/api/meal-plans/preview", servings, signal)),
        settleMealPlanRequest(mealApi.getLatestMealPlan(signal)),
        settleMealPlanRequest(mealApi.getMealPlanRevision(signal)),
      ]);
      return { preferences, response, latest, revision };
    })
      .then((result) => {
        if (cancelled || !result.current) return;
        if (result.error) throw result.error;
        const payload = result.value;
        if (!payload) throw new Error("meal-plan-preview-missing");
        if (payload.revision.value) rememberMealPlanRevision(payload.revision.value.revision);
        if (payload.preferences.error) {
          preferencesHandled = true;
          setMealPreferencesLoaded(false);
          setMealPreferencesError(presentMealPlanError(payload.preferences.error, "저장된 식단 조건을 불러오지 못했어요. 기존 조건은 그대로예요. 다시 불러와 주세요."));
          setMealPreferencesRetry(true);
        } else if (payload.preferences.value) {
          preferencesHandled = true;
          const preferenceWorkspaceKey = result.workspaceKey;
          const hasUnsavedDraft = mealPreferencesDraftWorkspaceRef.current === preferenceWorkspaceKey
            && mealPreferencesSavedWorkspaceRef.current === preferenceWorkspaceKey
            && !sameAllergenSelections(mealPreferencesDraftRef.current, mealPreferencesSavedRef.current);
          const savedPreferencesChanged = mealPreferencesSavedWorkspaceRef.current === preferenceWorkspaceKey
            && !sameAllergenSelections(mealPreferencesSavedRef.current, payload.preferences.value.avoid_allergens);
          setMealPreferences(payload.preferences.value);
          mealPreferencesSavedRef.current = payload.preferences.value.avoid_allergens;
          mealPreferencesSavedWorkspaceRef.current = preferenceWorkspaceKey;
          setMealPreferencesLoaded(true);
          if (!hasUnsavedDraft) {
            mealPreferencesDraftRef.current = payload.preferences.value.avoid_allergens;
            mealPreferencesDraftWorkspaceRef.current = preferenceWorkspaceKey;
            setMealPreferencesDraft(payload.preferences.value.avoid_allergens);
          } else if (savedPreferencesChanged) {
            setMealPreferencesNotice("다른 기기에서 식단 조건이 바뀌었어요. 현재 선택은 유지했어요. 저장 전 확인해 주세요.");
          }
          setMealPreferencesError("");
          setMealPreferencesRetry(false);
        } else {
          preferencesHandled = true;
          setMealPreferencesLoaded(false);
          setMealPreferencesError("저장한 식단 조건을 불러오지 못했어요. 다시 불러와 주세요.");
          setMealPreferencesRetry(true);
        }
        if (payload.response.error) throw payload.response.error;
        const response = payload.response.value;
        if (!response) throw new Error("meal-plan-preview-missing");
        const latest = payload.latest.error ? null : payload.latest.value;
        setLatestPlanReadbackNotice(payload.latest.error ? "저장한 식단을 불러오지 못했어요. 방금 찾은 메뉴를 보여드려요." : "");
        const latestMatchesCurrentPreview = Boolean(
          latest &&
          latest.recipe_id === response.recipe_id &&
          latest.planner_version === response.planner_version &&
          latest.snapshot_hash === response.snapshot_hash &&
          latest.max_minutes === response.max_minutes &&
          (latest.servings ?? 1) === (response.servings ?? 1) &&
          latest.inventory_ids.length === response.inventory_ids.length &&
          latest.inventory_ids.every((id, index) => id === response.inventory_ids[index]),
        );
        const resolvedPlan = latestMatchesCurrentPreview && latest ? latest : response;
        setPlan(resolvedPlan);
        setConsumptionDraft(initialConsumptionDraft(resolvedPlan, foods));
        setSaved(latestMatchesCurrentPreview);
        setCompleted(Boolean(latestMatchesCurrentPreview && latest?.completed_at));
        setSkippedCount(latestMatchesCurrentPreview ? (latest?.completed_skipped_ingredients ?? []).length : 0);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(presentMealPlanError(reason, "메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
          if (!preferencesHandled) {
            setMealPreferencesLoaded(false);
            setMealPreferencesError("저장한 식단 조건을 불러오지 못했어요. 다시 불러와 주세요.");
            setMealPreferencesRetry(true);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMealPreferencesLoading(false);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      workspaceSync.invalidate("meal-plan");
    };
  }, [active, returningFromDetail, plannerContextKey, dateReviewKey, ingredientKey, maxMinutes, servings, mealPreferencesVersion, mealPlanRefreshNonce, workspaceSync]);

  useEffect(() => {
    if (!active || !workspaceTransport) return;
    return workspaceTransport.subscribe((message: WorkspaceSyncInvalidation) => {
      if (message.workspaceKey !== workspaceSync.currentWorkspaceKey) return;
      if (message.channels !== "all" && !message.channels.includes("meal-plan")) return;
      workspaceSync.invalidate("meal-plan");
      setMealPlanRefreshNonce((current) => current + 1);
    });
  }, [active, workspaceSync, workspaceTransport]);

  useEffect(() => {
    if (!active || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || plannerBusyRef.current || remoteRefreshRequired || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const previousRevision = mealPlanRevisionRef.current;
        const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMealPlanRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = rememberMealPlanRevision(result.value.revision);
        if (revision === null || previousRevision === null || revision === previousRevision) return;
        setRemoteRefreshRequired(true);
        setError("");
      } finally {
        pollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, remoteRefreshRequired, workspaceSync]);

  useEffect(() => {
    if (!active || !saved || completed || !revealCompletionRef.current) return;
    revealCompletionRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const missingIngredientAction = plan?.missing_ingredients.length
        ? document.querySelector<HTMLElement>(".recipe-safety-summary .recipe-missing-callout .recipe-shopping-inline-button:not([disabled])")
        : null;
      const completionAction = document.querySelector<HTMLElement>(".recipe-complete-actions .recipe-shopping-inline-button, .recipe-complete-button");
      const focusTarget = missingIngredientAction ?? completionAction;
      scrollTargetWithinNearestContainer(missingIngredientAction ?? completionActionsRef.current, "nearest", getMobileScrollBehavior());
      if (revealCompletionFocusRef.current) {
        revealCompletionFocusRef.current = false;
        window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, completed, plan?.missing_ingredients.length, saved]);

  useEffect(() => {
    if (!active) {
      multiDaySaveFocusRef.current = false;
      return;
    }
    if (!multiDaySaved || !multiDaySaveFocusRef.current) return;
    multiDaySaveFocusRef.current = false;
    const hasMissingIngredients = Boolean(multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0));
    if (!hasMissingIngredients) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(".recipe-multi-day-save .recipe-shopping-inline-button:not([disabled])");
      scrollTargetWithinNearestContainer(target, "nearest", getMobileScrollBehavior());
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, multiDayPreview, multiDaySaved]);

  const toggleAllergen = (allergen: ApiAllergenCode) => {
    const current = mealPreferencesDraftRef.current;
    const next = current.includes(allergen) ? current.filter((value) => value !== allergen) : [...current, allergen];
    mealPreferencesDraftRef.current = next;
    mealPreferencesDraftWorkspaceRef.current = workspaceSync.currentWorkspaceKey;
    setMealPreferencesDraft(next);
  };

  const retryMealPreferencesLoad = () => {
    if (mealPreferencesLoading || mealPreferencesSaving) return;
    setMealPreferencesError("");
    setMealPreferencesRetry(false);
    setMealPreferencesLoading(true);
    setMealPlanRefreshNonce((current) => current + 1);
  };

  const openMealPreferencesFromSafety = () => {
    if (!mealApi.isConfigured || mealPreferencesLoading || mealPreferencesSaving || (!mealPreferencesLoaded && !mealPreferencesError)) return;
    revealMealPreferencesRef.current = true;
    setMealPreferencesOpen(true);
  };

  const saveMealPreferences = async () => {
    if (mealPreferencesSaving || mealPreferencesLoading || !mealPreferencesLoaded) return;
    setMealPreferencesError("");
    setMealPreferencesRetry(false);
    setMealPreferencesNotice("");
    setMealPreferencesSaving(true);
    try {
      const response = await mealApi.updateMealPreferences({ avoid_allergens: mealPreferencesDraft });
      if (!response) throw new Error("meal-preferences-save-missing");
      setMealPreferences(response);
      mealPreferencesSavedRef.current = response.avoid_allergens;
      mealPreferencesSavedWorkspaceRef.current = workspaceSync.currentWorkspaceKey;
      mealPreferencesDraftRef.current = response.avoid_allergens;
      mealPreferencesDraftWorkspaceRef.current = workspaceSync.currentWorkspaceKey;
      setMealPreferencesLoaded(true);
      setMealPreferencesDraft(response.avoid_allergens);
      setMealPreferencesNotice("식단 조건을 저장했어요. 이 조건으로 메뉴를 다시 찾아볼게요.");
      setMealPreferencesRetry(false);
      setMealPreferencesOpen(false);
      rememberCurrentWorkspaceRevision();
      setMealPreferencesVersion((current) => current + 1);
    } catch (reason) {
      setMealPreferencesError(isMealApiMealPreferencesPersistenceError(reason)
        ? "식단 조건을 저장하지 못했어요. 기존 조건을 유지했어요."
        : presentMealPlanError(reason, "식단 조건을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setMealPreferencesRetry(!isMealApiWorkspaceConflictError(reason));
    } finally {
      setMealPreferencesSaving(false);
    }
  };

  useEffect(() => {
    if (!active || !mealPreferencesOpen) {
      revealMealPreferencesRef.current = false;
      return;
    }
    if (!revealMealPreferencesRef.current) return;
    revealMealPreferencesRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      revealAndFocus(mealPreferencesSectionRef.current, { block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, mealPreferencesOpen]);

  const persistPlan = async (retryPayload?: MealPlanSavePayload) => {
    if (!ingredients.length || loading || saving || saved || !plan || plan.recipe_id === "no-match") return;
    const isRetry = Boolean(retryPayload);
    setError("");
    setSaveRetryPayload(null);
    setSaving(true);
    if (!mealApi.isConfigured) {
      revealCompletionRef.current = true;
      revealCompletionFocusRef.current = true;
      setSaved(true);
      setSaving(false);
      onSaved("single", plan.missing_ingredients.length > 0, () => addShoppingSource("meal_plan", plan.id));
      return;
    }
    const payload = retryPayload ?? {
      inventoryIds: [...plan.inventory_ids],
      planId: plan.id,
      snapshotHash: plan.snapshot_hash,
      maxMinutes: plan.max_minutes,
      recipeId: plan.recipe_id,
      bundleId: plan.bundle_id ?? undefined,
      bundleDayIndex: plan.bundle_day_index ?? undefined,
      servings: plan.servings ?? servings,
    };
    try {
      const response = await mealApi.saveMealPlan(payload.inventoryIds, payload.planId, payload.snapshotHash, payload.maxMinutes, payload.recipeId, payload.bundleId, payload.bundleDayIndex, payload.servings);
      if (!response) throw new Error("meal-plan-response-missing");
      rememberCurrentWorkspaceRevision();
      setPlan(response);
      updateLinkedBundleDay(response.bundle_id, response.bundle_day_index, "saved", null, response.id);
      setConsumptionDraft(initialConsumptionDraft(response, foods));
      revealCompletionRef.current = true;
      revealCompletionFocusRef.current = !isRetry;
      setSaved(true);
      setCompleted(false);
      setSkippedCount(0);
      setAuditEvents([]);
      setAuditOpen(false);
      setHistoryPlans([]);
      setHistoryOpen(false);
      setSaveRetryPayload(null);
      onSaved("single", response.missing_ingredients.length > 0, () => addShoppingSource("meal_plan", response.id));
      if (isRetry) window.requestAnimationFrame(() => window.requestAnimationFrame(() => recipeViewActionRef.current?.focus({ preventScroll: true })));
    } catch (reason) {
      const persistenceFailure = isMealApiMealPlanPersistenceError(reason);
      setError(persistenceFailure
        ? "식단을 저장하지 못했어요. 기존 식단은 그대로예요."
        : presentMealPlanError(reason, "식단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setSaveRetryPayload(persistenceFailure ? payload : null);
    } finally {
      setSaving(false);
    }
  };

  const hasRecipe = Boolean(plan && plan.recipe_id !== "no-match");
  const nextDemoMealTime = MEAL_TIME_OPTIONS.find((option) => option > maxMinutes);
  const demoTimeLimitNoMatch = Boolean(!mealApi.isConfigured && plan?.source === "local_fixture" && plan.recipe_id === "no-match" && nextDemoMealTime);
  const planIngredients = plan?.ingredients ?? [];
  const availableRecipeIngredientCount = planIngredients.filter((ingredient) => ingredient.available).length;
  const missingRecipeIngredientCount = planIngredients.length - availableRecipeIngredientCount;
  const consumptionRows = plan ? consumptionRowsForPlan(plan, foods) : [];
  const consumptionSelection = consumptionRows.map((row) => ({ row, quantity: consumptionDraft[row.foodId] ?? row.defaultQuantity }));
  const consumptionUsedRows = consumptionSelection.filter(({ quantity }) => quantity > 0).length;
  const consumptionSkippedRows = consumptionSelection.filter(({ quantity }) => quantity <= 0).length;
  const consumptionPartialRows = consumptionSelection.filter(({ row, quantity }) => quantity > 0 && quantity < row.maxQuantity).length;
  const consumptionSelectionNote = !consumptionRows.length
    ? "사용할 재료를 살펴봐 주세요."
    : !consumptionUsedRows
      ? "사용할 재료를 하나 이상 골라 주세요. 선택하지 않은 재료는 그대로 남아요."
    : consumptionSkippedRows || consumptionPartialRows
      ? `${consumptionUsedRows}가지 재료를 사용해요${consumptionPartialRows ? ` · 일부만 쓸 재료 ${consumptionPartialRows}가지` : ""}${consumptionSkippedRows ? ` · ${consumptionSkippedRows}가지는 남겨요` : ""}.`
      : `재료 ${consumptionRows.length}가지를 모두 사용해요. 필요하면 양을 바꿔 주세요.`;
  const allergenMetadataUnknown = Boolean(hasRecipe && plan?.allergen_metadata_status !== "known");
  const requiresSafetyAcknowledgement = Boolean(hasRecipe && (plan?.date_review_required || allergenMetadataUnknown));
  const safetyNoticeCount = [
    plan?.date_review_required,
    plan?.preference_filtered,
    Boolean(plan?.missing_ingredients.length),
    allergenMetadataUnknown,
  ].filter(Boolean).length;
  const canAddMissingIngredientsToShopping = Boolean(mealApi.isConfigured || onAddDemoShoppingItems);

  const revealSafetySummary = () => {
    const summary = safetySummaryRef.current;
    if (!summary) return;
    scrollTargetWithinNearestContainer(summary, "start", getMobileScrollBehavior());
    window.requestAnimationFrame(() => {
      if (!summary.isConnected) return;
      const firstAction = summary.querySelector<HTMLElement>("button:not([disabled])");
      (firstAction ?? summary).focus({ preventScroll: true });
    });
  };

  const revealRecipeInstructions = () => {
    revealInstructionsFocusRef.current = true;
    setShowDetails(true);
  };

  const revealCompletionControls = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollTargetWithinNearestContainer(completionActionsRef.current, "end", "auto");
      });
    });
  };

  useEffect(() => {
    if (!showDetails) {
      revealInstructionsFocusRef.current = false;
      return;
    }
    let focusFrame: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const shouldFocusRecipeAction = revealInstructionsFocusRef.current;
      scrollTargetWithinNearestContainer(recipeDetailsRef.current, shouldFocusRecipeAction ? "center" : "start", getMobileScrollBehavior());
      if (!shouldFocusRecipeAction) return;
      revealInstructionsFocusRef.current = false;
      focusFrame = window.requestAnimationFrame(() => recipeViewActionRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
    };
  }, [showDetails]);

  useEffect(() => {
    if (!active) {
      initialFocusHandledRef.current = false;
      return;
    }
    if (loading || initialFocusHandledRef.current) return;
    let disposed = false;
    let timer: number | undefined;
    let focusTimer: number | undefined;
    let observer: MutationObserver;
    const canTakeFocus = () => {
      const activeElement = document.activeElement;
      return activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && (activeElement.classList.contains("sheet-close-button") || activeElement.classList.contains("bottom-sheet")))
        || (activeElement instanceof HTMLElement && !activeElement.closest(".bottom-sheet"))
        || !activeElement?.isConnected;
    };
    const findTarget = () => safetyNoticeCount
      ? document.querySelector<HTMLElement>("button.recipe-safety-summary")
      : recipeViewActionRef.current ?? document.querySelector<HTMLElement>(".meal-sheet-content .recipe-actions .primary-sheet-button, .meal-sheet-content > .primary-sheet-button");
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || !active || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || target.hasAttribute("disabled") || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || !active || !canTakeFocus()) return;
        const currentTarget = findTarget();
        if (!currentTarget || currentTarget.hasAttribute("disabled")) {
          tryFocus();
          return;
        }
        scrollTargetWithinNearestContainer(currentTarget, "nearest", "auto");
        currentTarget.focus({ preventScroll: true });
        initialFocusHandledRef.current = true;
        cleanup();
      }, 120);
    };
    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-describedby"] });
    timer = window.setTimeout(cleanup, 3_000);
    tryFocus();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [active, loading, safetyNoticeCount]);

  const updateLinkedBundleDay = (bundleId: string | null | undefined, dayIndex: number | null | undefined, status: ApiMultiDayMealPlan["days"][number]["status"], completedAt?: string | null, mealPlanId?: string) => {
    if (!bundleId || dayIndex == null) return;
    setMultiDayPreview((current) => {
      if (!current || current.id !== bundleId) return current;
      return {
        ...current,
        days: current.days.map((day) => day.day_index === dayIndex
          ? { ...day, status, meal_plan_id: mealPlanId ?? day.meal_plan_id, completed_at: completedAt ?? day.completed_at }
          : day),
      };
    });
  };

  const loadAlternatives = async (retry = false) => {
    if (!hasRecipe || saved || completed || alternativesLoading) return;
    if (alternativesOpen && !retry) {
      setAlternativesOpen(false);
      return;
    }
    setAlternativesError("");
    setAlternativesLoading(true);
    setMultiDayOpen(false);
    try {
      if (!mealApi.isConfigured) throw new Error("meal-plan-options-unavailable");
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.previewMealPlan<ApiMealPlanOptions>(ingredients.map((food) => food.id), maxMinutes, "/api/meal-plans/options", servings, signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const response = result.value;
      if (!response) throw new Error("meal-plan-options-missing");
      setAlternatives(response.options.filter((option) => option.recipe_id !== plan?.recipe_id));
      setAlternativesOpen(true);
    } catch (reason) {
      setAlternativesError(presentMealPlanError(reason, "다른 메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      setAlternativesOpen(true);
    } finally {
      setAlternativesLoading(false);
    }
  };

  const loadMultiDayPreview = async (retry = false) => {
    if (!hasRecipe || saved || completed || multiDayLoading) return;
    if (multiDayOpen && !retry) {
      setMultiDayOpen(false);
      return;
    }
    setMultiDayError("");
    setAlternativesOpen(false);
    setMultiDayLoading(true);
    try {
      if (!mealApi.isConfigured) throw new Error("multi-day-preview-unavailable");
      const result = await workspaceSync.run("meal-plan", async (signal) => {
        const [response, latest] = await Promise.all([
          mealApi.previewMealPlan<ApiMultiDayMealPlan>(ingredients.map((food) => food.id), maxMinutes, "/api/meal-plans/multi-day-preview", servings, signal),
          settleMealPlanRequest(mealApi.getLatestMultiDayMealPlan(signal)),
        ]);
        return { response, latest };
      });
      if (!result.current) return;
      if (result.error) throw result.error;
      const response = result.value?.response;
      const latest = result.value?.latest.error ? null : result.value?.latest.value;
      if (!response) throw new Error("multi-day-preview-missing");
      const latestMatchesCurrentPreview = Boolean(
        latest &&
        latest.snapshot_hash === response.snapshot_hash &&
        latest.max_minutes === response.max_minutes &&
        (latest.servings ?? 1) === (response.servings ?? 1) &&
        latest.inventory_ids.length === response.inventory_ids.length &&
        latest.inventory_ids.every((id, index) => id === response.inventory_ids[index]),
      );
      const resolvedPreview = latestMatchesCurrentPreview && latest ? latest : response;
      setMultiDayPreview(resolvedPreview);
      setMultiDaySaved(Boolean(latestMatchesCurrentPreview && latest?.saved_at));
      setMultiDayOpen(true);
    } catch (reason) {
      setMultiDayError(presentMealPlanError(reason, "3일 식단을 만들지 못했어요. 잠시 후 다시 찾아봐 주세요."));
      setMultiDayOpen(true);
    } finally {
      setMultiDayLoading(false);
    }
  };

  const persistMultiDayPlan = async (retryPayload?: MultiDayPlanSavePayload) => {
    if (!multiDayPreview?.days.length || multiDaySaving || multiDaySaved) return;
    const isRetry = Boolean(retryPayload);
    multiDaySaveFocusRef.current = !isRetry;
    setMultiDayError("");
    setMultiDaySaveRetryPayload(null);
    setMultiDaySaving(true);
    if (!mealApi.isConfigured) {
      setMultiDaySaved(true);
      setMultiDaySaving(false);
      onSaved("multi-day", multiDayPreview.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0), () => addShoppingSource("multi_day", multiDayPreview.id));
      return;
    }
    const payload = retryPayload ?? {
      inventoryIds: [...multiDayPreview.inventory_ids],
      bundleId: multiDayPreview.id,
      snapshotHash: multiDayPreview.snapshot_hash,
      maxMinutes: multiDayPreview.max_minutes,
      servings: multiDayPreview.servings ?? servings,
    };
    try {
      const response = await mealApi.saveMultiDayMealPlan(
        payload.inventoryIds,
        payload.bundleId,
        payload.snapshotHash,
        payload.maxMinutes,
        payload.servings,
      );
      if (!response) throw new Error("multi-day-save-missing");
      rememberCurrentWorkspaceRevision();
      setMultiDayPreview(response);
      setMultiDaySaved(true);
      setMultiDaySaveRetryPayload(null);
      onSaved("multi-day", response.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0), () => addShoppingSource("multi_day", response.id));
      if (isRetry) window.requestAnimationFrame(() => multiDayToggleRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      const persistenceFailure = isMealApiMultiDayPlanPersistenceError(reason);
      setMultiDayError(persistenceFailure
        ? "3일 식단을 저장하지 못했어요. 기존 식단은 그대로예요."
        : presentMealPlanError(reason, "3일 식단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setMultiDaySaveRetryPayload(persistenceFailure ? payload : null);
    } finally {
      setMultiDaySaving(false);
    }
  };

  const toggleMultiDayHistory = async (retry = false) => {
    if (!plan || multiDayHistoryLoading) return;
    if (multiDayHistoryOpen && !retry) {
      setMultiDayHistoryOpen(false);
      return;
    }
    setMultiDayHistoryError("");
    setMultiDayHistoryOpen(true);
    setMultiDayHistoryLoading(true);
    try {
      if (!mealApi.isConfigured) throw new Error("multi-day-history-unavailable");
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMultiDayMealPlanHistory(10, signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const history = result.value;
      if (!history) throw new Error("multi-day-history-missing");
      setMultiDayHistory(history);
    } catch (reason) {
      setMultiDayHistoryError(presentMealPlanError(reason, "저장한 3일 식단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setMultiDayHistoryLoading(false);
    }
  };

  const openSavedMultiDayPlan = (bundle: ApiMultiDayMealPlan) => {
    setMultiDayPreview(bundle);
    setMultiDaySaved(Boolean(bundle.saved_at));
    setMultiDayError("");
    setMultiDayHistoryOpen(false);
    setMultiDayOpen(true);
    setAlternativesOpen(false);
    setHistoryOpen(false);
  };

  const focusShoppingResult = () => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      (shoppingFirstItemRef.current ?? shoppingToggleRef.current)?.focus({ preventScroll: true });
    }));
  };

  const refreshShoppingList = async (retry = false) => {
    if (!plan || shoppingLoading || shoppingMutating) return;
    setShoppingError("");
    setShoppingRetryAction(null);
    setShoppingLoading(true);
    try {
      if (!mealApi.isConfigured) throw new Error("shopping-list-unavailable");
      const result = await workspaceSync.run("shopping-list", (signal) => mealApi.getShoppingList(signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const items = result.value;
      if (!items) throw new Error("shopping-list-missing");
      setShoppingList(items);
      focusShoppingResult();
    } catch (reason) {
      setShoppingError(presentMealPlanError(reason, "장보기 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      setShoppingRetryAction({ label: isMealApiWorkspaceConflictError(reason) ? "다시 불러오기" : "다시 시도", onRetry: () => void refreshShoppingList(true) });
    } finally {
      setShoppingLoading(false);
    }
  };

  const toggleShoppingList = async () => {
    if (!plan || shoppingLoading || shoppingMutating) return;
    if (shoppingOpen) {
      setShoppingOpen(false);
      setShoppingError("");
      setShoppingRetryAction(null);
      shoppingRefreshQueuedRef.current = false;
      setShoppingRefreshQueued(false);
      return;
    }
    shoppingRefreshQueuedRef.current = false;
    setShoppingRefreshQueued(false);
    setShoppingOpen(true);
    await refreshShoppingList();
  };

  const addShoppingSource = async (sourceType: "meal_plan" | "multi_day", sourceId: string, retry = false) => {
    if (shoppingMutating) return;
    setShoppingError("");
    setShoppingRetryAction(null);
    setShoppingMutating(true);
    try {
      if (!mealApi.isConfigured) {
        const entries = sourceType === "meal_plan"
          ? plan ? missingShoppingEntries(plan.ingredients) : []
          : multiDayPreview?.days
            .filter((day) => day.status !== "completed")
            .flatMap((day) => missingShoppingEntries(day.plan.ingredients, day.day_index)) ?? [];
        if (!entries.length) throw new Error("shopping-list-no-shortages");
        if (!onAddDemoShoppingItems) throw new Error("shopping-list-unavailable");
        const nextItems = await onAddDemoShoppingItems(sourceType, sourceId, entries);
        setShoppingList(nextItems);
        setShoppingOpen(false);
        setShoppingError("");
        setShoppingRetryAction(null);
        onOpenShoppingList?.();
        return;
      }
      const response = await mealApi.addShoppingList(sourceType, sourceId);
      if (!response) throw new Error("shopping-list-add-missing");
      rememberCurrentWorkspaceRevision();
      setShoppingList(response.items);
      setShoppingOpen(true);
      setShoppingRetryAction(null);
      focusShoppingResult();
    } catch (reason) {
      setShoppingError(isMealApiShoppingListPersistenceError(reason)
        ? "장보기 목록을 저장하지 못했어요. 기존 목록을 유지했어요."
        : presentMealPlanError(reason, "장보기 목록을 만들지 못했어요. 현재 재료를 다시 확인해 주세요."));
      setShoppingOpen(true);
      setShoppingRetryAction({
        label: isMealApiWorkspaceConflictError(reason) ? "다시 불러오기" : "다시 시도",
        onRetry: () => void (isMealApiWorkspaceConflictError(reason) ? refreshShoppingList(true) : addShoppingSource(sourceType, sourceId, true)),
      });
    } finally {
      setShoppingMutating(false);
    }
  };

  const toggleShoppingItem = async (item: ApiShoppingListItem) => {
    if (shoppingMutating) return;
    setShoppingMutating(true);
    setShoppingError("");
    try {
      const response = await mealApi.updateShoppingListItem(item.id, !item.checked);
      if (!response) throw new Error("shopping-list-update-missing");
      rememberCurrentWorkspaceRevision();
      setShoppingList((current) => current.map((candidate) => candidate.id === response.id ? response : candidate));
    } catch (reason) {
      setShoppingError(presentMealPlanError(reason, "장보기 항목을 저장하지 못했어요."));
    } finally {
      setShoppingMutating(false);
    }
  };

  const removeShoppingItem = async (item: ApiShoppingListItem) => {
    if (shoppingMutating) return;
    setShoppingMutating(true);
    setShoppingError("");
    try {
      const response = await mealApi.deleteShoppingListItem(item.id);
      if (!response?.removed) throw new Error("shopping-list-delete-missing");
      rememberCurrentWorkspaceRevision();
      setShoppingList((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (reason) {
      setShoppingError(presentMealPlanError(reason, "장보기 항목을 삭제하지 못했어요."));
    } finally {
      setShoppingMutating(false);
    }
  };

  useEffect(() => {
    if (!active || !shoppingOpen || !workspaceTransport) return;
    return workspaceTransport.subscribe((message: WorkspaceSyncInvalidation) => {
      if (message.workspaceKey !== workspaceSync.currentWorkspaceKey) return;
      if (message.channels !== "all" && !message.channels.includes("shopping-list")) return;
      if (shoppingLoading || shoppingMutating) {
        shoppingRefreshQueuedRef.current = true;
        setShoppingRefreshQueued(true);
        return;
      }
      void refreshShoppingList();
    });
  }, [active, shoppingLoading, shoppingMutating, shoppingOpen, workspaceSync, workspaceTransport]);

  useEffect(() => {
    if (!active || !shoppingOpen || shoppingLoading || shoppingMutating || !shoppingRefreshQueuedRef.current) return;
    shoppingRefreshQueuedRef.current = false;
    setShoppingRefreshQueued(false);
    void refreshShoppingList();
  }, [active, shoppingLoading, shoppingMutating, shoppingOpen]);

  const selectAlternative = (nextPlan: ApiMealPlan, bundleId?: string, bundleDayIndex?: number, bundleDayStatus: ApiMultiDayMealPlan["days"][number]["status"] = "planned") => {
    const linkedPlan = bundleId && bundleDayIndex != null ? { ...nextPlan, bundle_id: bundleId, bundle_day_index: bundleDayIndex } : nextPlan;
    setPlan(linkedPlan);
    setConsumptionDraft(initialConsumptionDraft(linkedPlan, foods));
    setSaved(bundleDayStatus === "saved");
    setCompleted(bundleDayStatus === "completed");
    setSkippedCount(0);
    setAuditEvents([]);
    setAuditOpen(false);
    setAuditError("");
    setHistoryPlans([]);
    setHistoryOpen(false);
    setHistoryError("");
    revealInstructionsFocusRef.current = false;
    setShowDetails(false);
    setAlternativesOpen(false);
    setAlternativesError("");
    setMultiDayOpen(false);
    setMultiDaySaved(false);
  };

  const adjustConsumption = (row: ConsumptionRow, delta: number) => {
    setConsumptionDraft((current) => {
      const next = Math.max(0, Math.min(row.maxQuantity, (current[row.foodId] ?? 0) + delta));
      return { ...current, [row.foodId]: Number(next.toFixed(3)) };
    });
  };

  const toggleAudit = async () => {
    if (!plan || !saved || auditLoading) return;
    if (auditOpen) {
      setAuditOpen(false);
      return;
    }
    setAuditOpen(true);
    setAuditError("");
    if (!mealApi.isConfigured) {
      const now = new Date().toISOString();
      setAuditEvents([
        {
          id: "demo-saved-event",
          plan_id: plan.id,
          event_type: "saved",
          occurred_at: now,
          snapshot_hash: plan.snapshot_hash,
          consumed_allocations: [],
          skipped_ingredients: [],
        },
      ]);
      return;
    }
    setAuditLoading(true);
    try {
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMealPlanEvents(plan.id, signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const events = result.value;
      if (!events) throw new Error("meal-plan-events-missing");
      setAuditEvents(events);
    } catch (reason) {
      setAuditError(presentMealPlanError(reason, "식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleHistory = async (retry = false) => {
    if (!plan || historyLoading) return;
    if (historyOpen && !retry) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    setHistoryError("");
    setAuditOpen(false);
    if (!mealApi.isConfigured) {
      setHistoryPlans(saved || completed ? [plan] : []);
      return;
    }
    setHistoryLoading(true);
    try {
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMealPlanHistory(10, signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const plans = result.value;
      if (!plans) throw new Error("meal-plan-history-missing");
      setHistoryPlans(plans);
    } catch (reason) {
      setHistoryError(presentMealPlanError(reason, "최근 식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setHistoryLoading(false);
    }
  };

  const setConsumptionValue = (row: ConsumptionRow, rawValue: string) => {
    const parsed = Number(rawValue);
    const next = !rawValue.trim() || !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(row.maxQuantity, parsed));
    setConsumptionDraft((current) => ({ ...current, [row.foodId]: Number(next.toFixed(3)) }));
  };

  const completePlan = async (retryPayload?: MealPlanConsumption[]) => {
    if (!plan || !hasRecipe || !saved || completing || completed) return;
    if (requiresSafetyAcknowledgement && !safetyAcknowledged) {
      setError("조리 전에 살펴본 뒤 기록해 주세요.");
      return;
    }
    setError("");
    setCompletionRetry(false);
    setCompletionRetryPayload(null);
    setCompleting(true);
    const consumptions = retryPayload ?? consumptionRows.map((row) => ({
      food_id: row.foodId,
      quantity: consumptionDraft[row.foodId] ?? 0,
    }));
    if (!mealApi.isConfigured) {
      const consumedAllocations = consumptions.filter((allocation) => allocation.quantity > 0);
      const nextSkippedCount = consumptions.filter((allocation) => allocation.quantity <= 0).length;
      if (!consumedAllocations.length) {
      setError("사용할 재료를 하나 이상 골라 주세요.");
        setCompleting(false);
        return;
      }
      const completedAt = new Date().toISOString();
      setPlan((current) => current ? { ...current, completed_at: completedAt, consumed_food_ids: consumedAllocations.map((allocation) => allocation.food_id), consumed_allocations: consumedAllocations } : current);
      setCompleted(true);
      setSkippedCount(nextSkippedCount);
      setCompletionGrocySyncStatus(undefined);
      setCompleting(false);
      onCompleted?.(consumedAllocations.map((allocation) => allocation.food_id), nextSkippedCount, consumedAllocations);
      return;
    }
    try {
      const response = await mealApi.completeMealPlan(plan.id, consumptions);
      if (!response) throw new Error("meal-plan-completion-missing");
      rememberCurrentWorkspaceRevision();
      setPlan((current) => current ? { ...current, completed_at: response.completed_at, consumed_food_ids: response.consumed_food_ids, completed_skipped_ingredients: response.skipped_ingredients.map((ingredient) => ingredient.canonical_name), consumed_allocations: response.consumed_allocations } : current);
      updateLinkedBundleDay(plan.bundle_id, plan.bundle_day_index, "completed", response.completed_at, plan.id);
      setConsumptionDraft(Object.fromEntries(response.consumed_allocations.map((allocation) => [allocation.food_id, allocation.quantity])));
      setCompleted(true);
      setCompletionGrocySyncStatus(response.grocy_sync_status);
      setCompletionRetry(false);
      setCompletionRetryPayload(null);
      setSkippedCount(response.skipped_ingredients.length);
      onCompleted?.(response.consumed_food_ids, response.skipped_ingredients.length, response.consumed_allocations, response.grocy_sync_status);
    } catch (reason) {
      const persistenceFailure = isMealApiMealPlanCompletionPersistenceError(reason);
      setError(persistenceFailure
        ? "조리 완료를 저장하지 못했어요. 식품 목록과 식단은 그대로예요."
        : presentMealPlanError(reason, "조리 내용을 저장하지 못했어요. 식품 목록과 사용할 양을 살펴봐 주세요."));
      setCompletionRetry(persistenceFailure);
      setCompletionRetryPayload(persistenceFailure ? consumptions : null);
    } finally {
      setCompleting(false);
    }
  };

  return <BottomSheet open={active} onOpenChange={onOpenChange} title="오늘의 식단" description="재료에 맞는 메뉴를 골라요." snap={0.86}>
    {authenticationExpired ? (
      <div className="recipe-error recipe-auth-expired" role="alert">
        <InfoCircledIcon width={16} height={16} />
        <span><strong>로그인 정보가 만료됐어요</strong><small>계정에 다시 연결한 뒤 식단을 다시 불러와 주세요.</small></span>
        <button ref={authenticationRecoveryActionRef} className="recipe-error-action" type="button" onClick={() => onOpenAccount ? onOpenAccount() : onOpenChange(false)}>{onOpenAccount ? "계정 다시 연결" : "닫기"}</button>
      </div>
    ) : (
    <div className="meal-sheet-content">
    {shoppingOpen ? <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-shopping-live-state={shoppingError ? "error" : shoppingLoading ? "loading" : shoppingMutating ? "mutating" : shoppingRefreshQueued ? "queued" : "current"} aria-busy={shoppingLoading || shoppingMutating}>{shoppingError ? "장보기 목록을 불러오지 못했어요. 다시 시도해 주세요" : shoppingLoading ? "장보기 목록을 불러오는 중이에요" : shoppingMutating ? "장보기 항목을 저장하는 중이에요" : shoppingRefreshQueued ? "장보기 목록을 다시 불러오고 있어요" : "장보기 목록을 불러왔어요"}</span> : null}
    {ingredients.length ? <>
    {mealApi.isConfigured ? <button className="recipe-preferences-toggle" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving || (!mealPreferencesLoaded && !mealPreferencesError)} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => setMealPreferencesOpen((current) => !current)}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesOpen ? "식단 조건 접기" : !mealPreferencesLoaded && mealPreferencesError ? "조건을 불러올 수 없어요" : mealPreferencesDraftDirty ? "저장하지 않은 변경이 있어요" : mealPreferences.avoid_allergens.length ? `피할 알레르기 ${mealPreferences.avoid_allergens.length}개` : "식단 조건 설정"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {mealPreferencesNotice ? <div className="recipe-preference-notice" role="status"><CheckCircledIcon width={15} height={15} />{mealPreferencesNotice}</div> : null}
    {mealPreferencesOpen ? <section ref={mealPreferencesSectionRef} className="recipe-preferences" tabIndex={-1} aria-label="식단 조건">
      <div className="recipe-alternatives-heading"><span>피할 알레르기</span><small>직접 선택한 조건만 적용해요</small></div>
      {mealPreferencesLoading ? <small className="recipe-preferences-note" role="status" aria-live="polite">{mealPreferencesDraftDirty ? "저장된 조건을 불러오는 동안 현재 선택은 그대로예요." : "저장한 식단 조건을 불러오고 있어요."}</small> : mealPreferencesDraftDirty ? <small className="recipe-preferences-note" role="status">저장 전 변경한 조건이에요. 저장하면 앞으로 찾는 메뉴에 적용돼요.</small> : null}
      <div className="recipe-preferences-options" role="group" aria-label="피할 알레르기 선택">{ALLERGEN_OPTIONS.map((option) => <button className={mealPreferencesDraft.includes(option.value) ? "recipe-preference-chip recipe-preference-chip-active" : "recipe-preference-chip"} type="button" aria-pressed={mealPreferencesDraft.includes(option.value)} disabled={!mealPreferencesLoaded || mealPreferencesLoading || mealPreferencesSaving} key={option.value} onClick={() => toggleAllergen(option.value)}>{option.label}</button>)}</div>
      {mealPreferencesError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{mealPreferencesError}</span>{mealPreferencesRetry ? <button className="account-error-action" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => mealPreferencesLoaded ? void saveMealPreferences() : retryMealPreferencesLoad()}>{mealPreferencesLoaded ? mealPreferencesSaving ? "다시 저장 중" : "다시 시도" : mealPreferencesLoading ? "식단 조건 불러오는 중" : "다시 불러오기"}</button> : null}</div> : null}
      <button className="secondary-sheet-button" type="button" disabled={!mealPreferencesLoaded || mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => void saveMealPreferences()}>{mealPreferencesSaving ? "식단 조건 저장 중" : mealPreferencesLoading ? "식단 조건을 불러오는 중" : !mealPreferencesLoaded ? "조건을 불러온 뒤 저장해 주세요" : "식단 조건 저장"}</button>
      <small className="recipe-preferences-note">알레르기 정보를 확인할 수 없는 메뉴는 추천하지 않아요. 먹기 전 포장지의 알레르기 표시를 살펴봐 주세요.</small>
    </section> : null}
    <div className="recipe-time-picker" role="group" aria-label="조리 가능 시간"><span>조리 가능 시간</span><div>{MEAL_TIME_OPTIONS.map((option) => <button className={maxMinutes === option ? "recipe-time-active" : ""} type="button" key={option} disabled={mealPreferencesSaving} aria-pressed={maxMinutes === option} onClick={() => updateMaxMinutes(option)}>{option}분</button>)}</div></div>
    <div className="recipe-serving-picker" role="group" aria-label="식사 인원"><span>몇 명이 먹나요?</span><div>{MEAL_SERVING_OPTIONS.map((option) => <button className={servings === option ? "recipe-time-active" : ""} type="button" key={option} aria-pressed={servings === option} disabled={loading || saving || saved || completed || mealPreferencesSaving} onClick={() => updateServings(option)}>{option}인분</button>)}</div></div>
    <p id="recipe-serving-note" className="recipe-serving-note">재료 양은 {plan?.servings ?? servings}인분 기준이에요.</p>
    {safetyNoticeCount ? <button className="recipe-safety-summary-jump" type="button" aria-controls="recipe-safety-summary" aria-label={`조리 전에 확인할 내용 ${safetyNoticeCount}개 보기`} onClick={revealSafetySummary}>
      <div className="recipe-safety-summary-heading"><span className="recipe-safety-summary-icon"><InfoCircledIcon width={16} height={16} /></span><span><strong>조리 전에 확인할 내용 {safetyNoticeCount}개</strong></span><ArrowRightIcon width={15} height={15} /></div>
    </button> : null}
    </> : null}
    {loading ? <div className="recipe-loading" role="status"><LightningBoltIcon width={18} height={18} /><span><strong>지금 있는 재료를 살펴보고 있어요</strong><small>먼저 먹을 재료와 조리 시간을 살펴보고 있어요.</small></span></div> : null}
    {!loading ? <div className="recipe-title-row"><div><h3>{plan?.title ?? (ingredients.length ? "식단을 만들 수 없어요" : "재료를 먼저 추가해 주세요")}</h3></div>{hasRecipe ? <span className="recipe-time"><TimerIcon width={15} height={15} /> {plan?.minutes ?? 0}분</span> : null}</div> : null}
    {!loading ? <p className="recipe-description">{mealPlanDisplayCopy(plan?.reason ?? (ingredients.length ? "재료를 더 추가하거나 조리 조건을 바꿔 다시 찾아보세요." : "영수증·바코드·직접 입력으로 식품을 추가하면 식단을 만들 수 있어요."))}</p> : null}
    {!loading && hasRecipe && planIngredients.length ? <div className={`recipe-availability-summary${missingRecipeIngredientCount ? " recipe-availability-summary-incomplete" : ""}`} role="status" aria-label="식단 재료" aria-live="polite" aria-atomic="true">
      <span className="recipe-availability-summary-icon" aria-hidden="true">{missingRecipeIngredientCount ? <InfoCircledIcon width={14} height={14} /> : <CheckCircledIcon width={14} height={14} />}</span>
      <span className="recipe-availability-summary-copy"><strong>{missingRecipeIngredientCount ? `재료 ${availableRecipeIngredientCount}가지는 있고 ${missingRecipeIngredientCount}가지는 더 필요해요` : "필요한 재료를 모두 갖고 있어요"}</strong><small>{missingRecipeIngredientCount ? "더 필요한 재료와 수량은 아래에서 볼 수 있어요." : "식품 목록에 있는 재료로 만들 수 있어요."}</small></span>
    </div> : null}
    {!loading && !ingredients.length ? <div className="recipe-empty-art"><LightningBoltIcon width={24} height={24} /></div> : null}
    {safetyNoticeCount ? <section ref={safetySummaryRef} id="recipe-safety-summary" className="recipe-safety-summary" tabIndex={-1} aria-label={`조리 전에 살펴볼 내용 ${safetyNoticeCount}개`}>
      <div className="recipe-safety-summary-heading"><span className="recipe-safety-summary-icon"><InfoCircledIcon width={16} height={16} /></span><span><strong>조리 전에 살펴보세요</strong><small>포장지 날짜와 보관 방법, 알레르기 정보를 살펴봐 주세요.</small></span><em>{safetyNoticeCount}개</em></div>
      <div className="recipe-safety-summary-list">
        {plan?.date_review_required ? <div className="recipe-date-review-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>조리 전에 포장지 날짜를 살펴봐 주세요</strong><small>{mealPlanDisplayCopy(plan.date_review_note ?? `${plan.date_review_foods?.join("·") || "사용할 재료"}의 포장지 날짜와 보관 방법을 살펴본 뒤 사용하세요. 소비기한이나 먹어도 되는지를 판단하지 않아요. 식품 상태도 직접 살펴봐 주세요.`)}</small>{plan.date_review_foods?.map((foodName, index) => { const foodId = plan.date_review_food_ids?.[index]; if (foodId && onOpenFoodDetail) return <button className="recipe-shopping-inline-button" type="button" data-meal-food-id={foodId} key={`${foodId}-${foodName}`} onClick={() => onOpenFoodDetail(foodId)}>식품 보기 · {foodName}</button>; return <small className="recipe-safety-targets" key={`${index}-${foodName}`}>살펴볼 식품 · {foodName}</small>; })}</span></div> : null}
        {plan?.preference_filtered ? <div className="recipe-preference-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>알레르기 조건을 확인해 주세요</strong><small>{mealPlanDisplayCopy(plan.preference_note ?? "피하도록 설정한 알레르기가 있거나 관련 정보를 확인할 수 없는 메뉴는 제외했어요.")}</small>{mealApi.isConfigured && !mealPreferencesOpen ? <button className="recipe-shopping-inline-button" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={openMealPreferencesFromSafety}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesSaving ? "식단 조건 저장 중" : "피할 알레르기 설정 열기"}</button> : null}</span></div> : null}
        {plan?.missing_ingredients.length ? <div className="recipe-missing-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>부족한 재료 {plan.missing_ingredients.length}개</strong><small>필요한 재료: {plan.missing_ingredients.join(" · ")}. {canAddMissingIngredientsToShopping ? saved ? "장보기 목록에 추가할 수 있어요." : "식단을 저장한 뒤 장보기 목록에 추가할 수 있어요." : "장보기 목록은 현재 사용할 수 없어요."}</small>{saved && canAddMissingIngredientsToShopping ? <button className="recipe-shopping-inline-button" type="button" disabled={shoppingMutating} aria-busy={shoppingMutating} onClick={() => void addShoppingSource("meal_plan", plan.id)}>{shoppingMutating ? "장보기 목록에 담는 중" : "장보기 목록에 담기"}</button> : null}</span></div> : null}
        {allergenMetadataUnknown ? <div className="recipe-allergen-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>재료 일부의 알레르기 정보를 확인할 수 없어요</strong><small>먹기 전 포장지 표시와 개인 알레르기를 살펴봐 주세요.</small>{mealApi.isConfigured && !mealPreferencesOpen ? <button className="recipe-shopping-inline-button" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={openMealPreferencesFromSafety}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesSaving ? "식단 조건 저장 중" : "피할 알레르기 설정 열기"}</button> : null}</span></div> : null}
      </div>
    </section> : null}
    {hasRecipe && !showDetails ? <button className="recipe-instructions-shortcut" type="button" onClick={revealRecipeInstructions}><span>조리 순서 바로 보기</span><ChevronDownIcon width={16} height={16} aria-hidden="true" /></button> : null}
    {latestPlanReadbackNotice ? <div className="recipe-readback-notice" data-readback-state="stale" role="status" aria-live="polite"><InfoCircledIcon width={16} height={16} /><span>{latestPlanReadbackNotice}</span><button type="button" onClick={() => setMealPlanRefreshNonce((current) => current + 1)}>식단 다시 불러오기</button></div> : null}
    {error ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span>{saveRetryPayload ? <button className="recipe-error-action" type="button" disabled={saving} aria-busy={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistPlan(saveRetryPayload)}>{saving ? "저장 중" : "다시 시도"}</button> : null}{completionRetry ? <button className="recipe-error-action" type="button" disabled={completing} aria-busy={completing} onPointerDown={(event) => event.preventDefault()} onClick={() => void completePlan(completionRetryPayload ?? undefined)}>{completing ? "완료 처리 중" : "다시 시도"}</button> : null}{!saveRetryPayload && !completionRetry ? <button className="recipe-error-action" type="button" disabled={loading} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { setError(""); setMealPlanRefreshNonce((current) => current + 1); }}>{loading ? "메뉴 찾는 중" : "메뉴 다시 찾기"}</button> : null}</div> : null}
    {remoteRefreshRequired ? <div className="recipe-error recipe-remote-refresh" role="alert" aria-busy={loading}><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 식단이나 재고가 변경됐어요</strong><small>{loading ? "식단을 다시 불러오고 있어요." : "지금 선택한 재료와 양은 그대로예요. 식단을 다시 불러온 뒤 메뉴를 찾아 주세요."}</small></span><button className="recipe-error-action" type="button" disabled={loading} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { setRemoteRefreshRequired(false); setMealPlanRefreshNonce((current) => current + 1); }}>{loading ? "식단 불러오는 중" : "식단 다시 불러오기"}</button></div> : null}
    {!loading && hasRecipe ? <div className="recipe-ingredients"><span>필요한 재료</span><div role="list">{planIngredients.map((ingredient) => <div className={`recipe-ingredient-row${ingredient.available ? "" : " recipe-ingredient-missing"}`} role="listitem" key={ingredient.canonical_name}><img src={imageForFoodName(ingredient.canonical_name)} alt="" draggable={false} /><span className="recipe-ingredient-copy"><strong>{ingredient.canonical_name}</strong><small>{ingredientStatus(ingredient)}</small></span></div>)}</div></div> : null}
    {!loading && hasRecipe && plan?.allergen_metadata_status === "known" ? <p className="recipe-allergen-note">알레르기 정보 · {plan.allergens?.length ? plan.allergens.map(allergenLabel).join("·") : "확인된 주요 항목 없음"}</p> : null}
    {!loading && hasRecipe && plan?.recipe_source_name ? <p className="recipe-provenance">레시피 출처 · {plan.recipe_source_name}</p> : null}
    {!mealApi.isConfigured && hasRecipe && !completed ? <p id="recipe-preview-save-note" className="recipe-preview-save-note" role="note"><InfoCircledIcon width={14} height={14} /><span>임시 저장한 식단은 이 화면을 벗어나면 사라져요. 조리를 완료하기 전에는 식품 수량이 바뀌지 않아요.</span></p> : null}
    {hasRecipe ? <div className="recipe-actions detail-actions"><button className="secondary-sheet-button recipe-plan-save-button" type="button" aria-describedby={!mealApi.isConfigured && !completed ? "recipe-serving-note recipe-preview-save-note" : "recipe-serving-note"} disabled={loading || saving || saved} onClick={() => void persistPlan()}><CalendarIcon className="recipe-plan-save-icon" width={17} height={17} /><span className="recipe-plan-save-copy">{saved ? mealApi.isConfigured ? "저장됨" : "임시 저장됨" : saving ? mealApi.isConfigured ? "저장 중" : "임시 저장 중" : mealApi.isConfigured ? "식단 저장" : "임시 저장"}</span><small className="recipe-plan-save-serving" aria-hidden="true">{plan?.servings ?? servings}인분</small></button><button ref={recipeViewActionRef} className="primary-sheet-button recipe-instructions-toggle" type="button" aria-expanded={showDetails} disabled={loading || saving} onClick={() => setShowDetails((current) => !current)}>{showDetails ? "조리 방법 접기" : "조리 방법 보기"} <ChevronDownIcon width={17} height={17} aria-hidden="true" /></button></div> : demoTimeLimitNoMatch && nextDemoMealTime ? <button className="primary-sheet-button" type="button" disabled={loading || saving} onClick={() => updateMaxMinutes(nextDemoMealTime)}><TimerIcon width={17} height={17} /> {nextDemoMealTime}분으로 다시 찾아보기</button> : <button className="primary-sheet-button" type="button" disabled={!onOpenAdd} onClick={onOpenAdd}><PlusIcon width={17} height={17} /> {ingredients.length ? "식품 더 추가하기" : "식품 추가하기"}</button>}
    {saved ? <div className="saved-recipe" data-readback-state="confirmed" role="status" aria-live="polite" aria-atomic="true"><CheckCircledIcon width={16} height={16} /><span style={{ display: "grid", minWidth: 0, gap: 2 }}><strong>{mealApi.isConfigured ? "오늘의 식단에 저장했어요" : "임시 식단을 저장했어요"} · {plan?.servings ?? servings}인분</strong><small style={{ color: "var(--atelier-muted)", fontSize: 12, lineHeight: 1.4 }}>{plan?.missing_ingredients.length ? "부족한 재료를 장보기 목록에 담아 주세요." : "재료와 양을 살펴본 뒤 조리를 마치면 기록해 주세요."}</small></span></div> : null}
    {showDetails && hasRecipe ? <div ref={recipeDetailsRef} className="recipe-details"><div className="recipe-details-heading"><span>조리 순서</span><small>{plan?.minutes}분 기준</small></div><ol>{plan?.steps.map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><span>{step}</span></li>)}</ol><div className="recipe-safety"><InfoCircledIcon width={15} height={15} /><span><strong>조리 전 확인</strong><small>{mealPlanDisplayCopy(plan?.safety_note ?? "식품 상태가 이상하면 조리하지 마세요.")}</small></span></div></div> : null}
    {saved && !completed ? <div ref={completionActionsRef} className="recipe-complete-actions"><div className="recipe-consumption-heading"><span>이번에 사용할 양</span><small role="status" aria-live="polite">{consumptionSelectionNote}</small></div><div className="recipe-consumption-list">{consumptionRows.map((row) => { const currentQuantity = consumptionDraft[row.foodId] ?? 0; return <div className="recipe-consumption-row" key={row.foodId}><span><strong>{row.name}</strong><small>최대 {formatQuantity(row.maxQuantity)}{row.unit}</small></span><div className="recipe-consumption-stepper"><button type="button" aria-label={`${row.name} 사용할 양 줄이기`} disabled={completing || currentQuantity <= 0} onClick={() => adjustConsumption(row, -row.step)}>-</button><label className="recipe-consumption-input-wrap"><span className="sr-only">{row.name} 사용할 양</span><KeyboardInput className="recipe-consumption-input" type="number" inputMode="decimal" min={0} max={row.maxQuantity} step={row.step} value={formatQuantity(currentQuantity)} aria-label={`${row.name} 사용할 양`} onFocus={revealCompletionControls} onChange={(event) => setConsumptionValue(row, event.target.value)} onBlur={() => keyboard.hide()} disabled={completing || row.maxQuantity <= 0} /><em>{row.unit}</em></label><button type="button" aria-label={`${row.name} 사용할 양 늘리기`} disabled={completing || currentQuantity >= row.maxQuantity} onClick={() => adjustConsumption(row, row.step)}>+</button></div></div>; })}</div>{requiresSafetyAcknowledgement ? <div className="recipe-date-review-callout recipe-safety-summary-item" role="group" aria-label="조리 전 기록 확인"><InfoCircledIcon width={16} height={16} /><span><strong>조리 전에 살펴봐 주세요.</strong><small>포장지 표시·식품 상태·알레르기 정보를 확인한 뒤 소비 기록을 남겨요.</small><button className="recipe-shopping-inline-button" type="button" aria-pressed={safetyAcknowledged} onPointerDown={(event) => { event.preventDefault(); setSafetyAcknowledged((current) => !current); }} onClick={(event) => { if (event.detail === 0) setSafetyAcknowledged((current) => !current); }}>{safetyAcknowledged ? "살펴봤어요" : "포장지와 재료를 살펴봤어요"}</button></span></div> : null}<button className="recipe-complete-button" type="button" disabled={completing || !consumptionUsedRows || (requiresSafetyAcknowledgement && !safetyAcknowledged)} aria-busy={completing} onPointerDown={(event) => { event.preventDefault(); void completePlan(); keyboard.hide(); }} onClick={(event) => { if (event.detail === 0) { void completePlan(); keyboard.hide(); } }}><CheckCircledIcon width={16} height={16} /> {completing ? "기록 중" : !consumptionUsedRows ? "사용할 재료를 골라 주세요" : requiresSafetyAcknowledgement && !safetyAcknowledged ? "조리 전에 살펴보고 기록" : "조리 완료로 기록했어요"}</button><small>조리하면 입력한 양만큼 식품 목록에서 빠져요.</small></div> : null}
    {completed ? <div className="recipe-completed" data-readback-state="confirmed" role="status"><CheckCircledIcon width={16} height={16} /><span><strong>조리 완료로 기록했어요</strong><small>{skippedCount ? `사용한 재료는 식품 목록에서 뺐어요. ${skippedCount}가지는 다시 살펴봐 주세요.` : "사용한 재료를 식품 목록에서 뺐어요."}</small>{grocyCompletionDetail(completionGrocySyncStatus) ? <><small className="recipe-completed-sync-note" data-sync-state={grocyCompletionSyncState(completionGrocySyncStatus)}>{grocyCompletionDetail(completionGrocySyncStatus)}</small>{onOpenSyncReview ? <button className="recipe-shopping-inline-button recipe-sync-review-action" type="button" onClick={() => onOpenSyncReview(grocyCompletionSyncState(completionGrocySyncStatus) === "action_required" ? "action_required" : grocyCompletionSyncState(completionGrocySyncStatus) === "processing" ? "processing" : "queued")}>{grocyCompletionSyncState(completionGrocySyncStatus) === "action_required" ? "알림 열기" : "알림에서 보기"}</button> : null}</> : null}</span></div> : null}
    {hasRecipe && mealApi.isConfigured && !saved && !completed ? <button className="recipe-alternatives-toggle" type="button" disabled={loading || saving || alternativesLoading} onClick={() => void loadAlternatives()}>{alternativesLoading ? "다른 메뉴 찾는 중" : alternativesOpen ? "다른 메뉴 접기" : "다른 메뉴 찾아보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {alternativesOpen ? <section className="recipe-alternatives" aria-label="다른 메뉴"><div className="recipe-alternatives-heading"><span>다른 메뉴</span><small>현재 재료와 {maxMinutes}분 · {servings}인분 기준</small></div>{alternativesError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{alternativesError}</span><button className="recipe-error-action" type="button" disabled={alternativesLoading} aria-busy={alternativesLoading} onClick={() => void loadAlternatives(true)}>{alternativesLoading ? "다시 찾는 중" : "다시 시도"}</button></div> : alternatives.length ? <div className="recipe-alternatives-list" role="list">{alternatives.map((option) => <button className="recipe-alternative-row" type="button" role="listitem" key={option.recipe_id} onClick={() => selectAlternative(option)}><span><strong>{option.title}</strong><small>{option.minutes}분 · {ingredientAvailabilityCopy(option.ingredients)}{option.missing_ingredients.length ? ` · 부족 ${option.missing_ingredients.length}개` : ""}</small></span><ArrowRightIcon width={14} height={14} /></button>)}</div> : <p className="history-empty">다른 재료 조합을 찾지 못했어요. 조리 시간이나 식사 인원을 바꿔 다시 찾아보세요.</p>}</section> : null}
    {hasRecipe && mealApi.isConfigured && !saved && !completed ? <button ref={multiDayToggleRef} className="recipe-multi-day-toggle" type="button" disabled={loading || saving || multiDayLoading} onClick={() => void loadMultiDayPreview()}>{multiDayLoading ? "3일 식단 준비 중" : multiDayOpen ? "3일 식단 접기" : "3일 식단 미리보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {multiDayOpen ? (
      <section className="recipe-multi-day" aria-label="3일 식단">
        <div className="recipe-alternatives-heading"><span>3일 식단</span><small>각 날짜는 먼저 배정한 재료를 고려해요 · {multiDayPreview?.servings ?? servings}인분 기준</small></div>
        {multiDayError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{multiDayError}</span>{multiDaySaveRetryPayload ? <button className="recipe-error-action" type="button" disabled={multiDaySaving} aria-busy={multiDaySaving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistMultiDayPlan(multiDaySaveRetryPayload)}>{multiDaySaving ? "저장 중" : "다시 시도"}</button> : <button className="recipe-error-action" type="button" disabled={multiDayLoading} aria-busy={multiDayLoading} onClick={() => void loadMultiDayPreview(true)}>{multiDayLoading ? "다시 찾는 중" : "다시 찾아보기"}</button>}</div> : multiDayPreview?.days.length ? (
          <>
            <p className="recipe-optimizer-note" role="status">남은 재료를 나눠 쓸 수 있게 3일 식단을 만들었어요.</p>
            <div className="recipe-multi-day-save">
              <button className="secondary-sheet-button" type="button" disabled={multiDaySaving || multiDaySaved} onClick={() => void persistMultiDayPlan()}><CalendarIcon width={15} height={15} /> {multiDaySaved ? "3일 식단 저장됨" : multiDaySaving ? "3일 식단 저장 중" : "3일 식단 저장"}</button>
              {multiDaySaved ? <span className="recipe-multi-day-status" role="status">{multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0) ? "부족한 재료는 장보기 목록에 담을 수 있어요." : "나중에 다시 볼 수 있어요."}</span> : <span className="recipe-multi-day-status">미리보기는 저장되지 않아요.</span>}
              {multiDaySaved && multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0) ? <button className="recipe-shopping-inline-button" type="button" disabled={shoppingMutating} aria-busy={shoppingMutating} onClick={() => void addShoppingSource("multi_day", multiDayPreview.id)}>{shoppingMutating ? "장보기 목록 저장 중" : "3일 부족 재료 장보기"}</button> : null}
            </div>
            <div className="recipe-multi-day-list" role="list">
              {multiDayPreview.days.map((day) => {
                const linkedBundleId = multiDayPreview.saved_at ? multiDayPreview.id : undefined;
                return <button className={`recipe-multi-day-row${day.status === "completed" ? " recipe-multi-day-row-completed" : ""}`} type="button" role="listitem" key={`${day.day_index}-${day.plan.recipe_id}`} disabled={day.status === "completed"} onClick={() => selectAlternative(day.plan, linkedBundleId, linkedBundleId ? day.day_index : undefined, day.status)}><span className="recipe-multi-day-index">{day.day_index}일차</span><span className="recipe-multi-day-copy"><strong>{day.plan.title}</strong><small>{formatPlanDate(day.plan_date)} · {day.plan.minutes}분 · {ingredientAvailabilityCopy(day.plan.ingredients)}{day.plan.missing_ingredients.length ? ` · 부족 ${day.plan.missing_ingredients.length}개` : ""} · {multiDayDayStatus(day.status)}</small></span><ArrowRightIcon width={14} height={14} /></button>;
              })}
            </div>
          </>
        ) : <p className="history-empty">현재 조건으로는 3일 식단을 만들지 못했어요. 조리 시간이나 식사 인원을 바꿔 다시 찾아보세요.</p>}
      </section>
    ) : null}
    {mealApi.isConfigured && plan ? <button className="recipe-multi-day-history-toggle" type="button" disabled={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory()}>{multiDayHistoryLoading ? "저장한 3일 식단 불러오는 중" : multiDayHistoryOpen ? "저장한 3일 식단 접기" : "저장한 3일 식단 보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {multiDayHistoryOpen ? <section className="recipe-multi-day-history" aria-label="저장한 3일 식단"><div className="recipe-alternatives-heading"><span>저장한 3일 식단</span><small>최근 10개</small></div>{multiDayHistoryError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{multiDayHistoryError}</span><button className="recipe-error-action" type="button" disabled={multiDayHistoryLoading} aria-busy={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory(true)}>{multiDayHistoryLoading ? "다시 불러오는 중" : "다시 시도"}</button></div> : multiDayHistory.length ? <div className="recipe-multi-day-history-list" role="list">{multiDayHistory.map((bundle) => { const firstDay = bundle.days[0]; const lastDay = bundle.days[bundle.days.length - 1]; return <button className="recipe-multi-day-history-row" type="button" role="listitem" key={bundle.id} onClick={() => openSavedMultiDayPlan(bundle)}><span className="recipe-multi-day-index">{bundle.days.length}일</span><span className="recipe-multi-day-copy"><strong>{firstDay?.plan.title ?? "저장한 3일 식단"}{bundle.days.length > 1 ? ` 외 ${bundle.days.length - 1}개` : ""}</strong><small>{firstDay ? formatPlanDate(firstDay.plan_date) : "날짜 미정"}{lastDay && lastDay !== firstDay ? ` ~ ${formatPlanDate(lastDay.plan_date)}` : ""} · {bundle.max_minutes}분</small></span><ArrowRightIcon width={14} height={14} /></button>; })}</div> : <p className="history-empty">저장한 3일 식단이 아직 없어요.</p>}</section> : null}
    {mealApi.isConfigured && plan ? <button ref={shoppingToggleRef} className="recipe-shopping-toggle" type="button" disabled={shoppingLoading || shoppingMutating} onClick={() => void toggleShoppingList()}>{shoppingLoading ? "장보기 목록 불러오는 중" : shoppingOpen ? "장보기 목록 접기" : shoppingRemainingCount ? `장보기 ${shoppingRemainingCount}개 보기` : "장보기 목록 보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {shoppingOpen ? <section className="recipe-shopping" aria-label="장보기 목록"><div className="recipe-alternatives-heading"><span>장보기 목록</span><small>{shoppingList.length ? `${shoppingList.filter((item) => !item.checked).length}개 남음` : "선택한 항목만 저장해요"}</small></div>{shoppingError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{shoppingError}</span>{shoppingRetryAction ? <button className="recipe-error-action" type="button" disabled={shoppingMutating} aria-busy={shoppingMutating} onClick={shoppingRetryAction.onRetry}>{shoppingMutating ? "불러오는 중" : shoppingRetryAction.label}</button> : null}</div> : shoppingList.length ? <><div className="recipe-shopping-list" role="list">{shoppingList.map((item, index) => <div className={`recipe-shopping-row${item.checked ? " recipe-shopping-row-checked" : ""}`} role="listitem" key={item.id}><button ref={index === 0 ? shoppingFirstItemRef : undefined} className="recipe-shopping-item" type="button" aria-pressed={item.checked} disabled={shoppingMutating} onClick={() => void toggleShoppingItem(item)}><span className="recipe-shopping-check" aria-hidden="true">{item.checked ? "✓" : ""}</span><span className="recipe-multi-day-copy"><strong>{item.canonical_name}</strong><small>{formatQuantity(item.quantity)}{item.unit} · {shoppingSourceLabel(item)}</small></span></button><button className="recipe-shopping-delete" type="button" aria-label={`${item.canonical_name} 장보기 항목 삭제`} disabled={shoppingMutating} onClick={() => void removeShoppingItem(item)}>삭제</button></div>)}</div><p className="recipe-shopping-note">식품 목록에 추가하면 장보기 목록에서 이미 가진 재료가 빠져요.</p></> : <p data-testid="meal-shopping-empty" className="history-empty">아직 장보기 항목이 없어요. 부족한 재료에서 추가할 수 있어요.</p>}</section> : null}
    {saved ? <button className="recipe-audit-toggle" type="button" disabled={auditLoading} onClick={() => void toggleAudit()}>{auditLoading ? "기록 불러오는 중" : auditOpen ? "식단 기록 접기" : "식단 기록 보기"} <ArrowRightIcon width={14} height={14} /></button> : null}
    {auditOpen ? <div className="recipe-audit" aria-label="식단 기록"><div className="recipe-audit-heading"><span>식단 기록</span><small>저장·조리 기록</small></div>{auditError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} />{auditError}</div> : auditEvents.length ? <div className="recipe-audit-list">{auditEvents.map((event) => <div className="recipe-audit-row" key={event.id}><span className={`recipe-audit-icon recipe-audit-${event.event_type}`}><CheckCircledIcon width={13} height={13} /></span><span><strong>{event.event_type === "saved" ? "식단 저장" : "조리 완료"}</strong><small>{new Date(event.occurred_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{event.consumed_allocations.length ? ` · ${event.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + ")} 사용` : ""}</small></span></div>)}</div> : <p className="history-empty">아직 기록이 없어요.</p>}</div> : null}
    {plan ? <button className="recipe-history-toggle" type="button" aria-expanded={historyOpen} aria-controls="recipe-history-panel" aria-busy={historyLoading} disabled={historyLoading} onClick={() => void toggleHistory()}>{historyLoading ? "최근 식단 불러오는 중" : historyOpen ? "최근 식단 접기" : "최근 식단 보기"}<ChevronDownIcon width={14} height={14} aria-hidden="true" /></button> : null}
    {plan ? <section id="recipe-history-panel" className="recipe-history" aria-label="최근 식단" hidden={!historyOpen}>
      <div className="recipe-audit-heading"><span>최근 식단</span><small>최대 10개</small></div>
      {historyError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{historyError}</span><button className="recipe-error-action" type="button" disabled={historyLoading} aria-busy={historyLoading} onClick={() => void toggleHistory(true)}>{historyLoading ? "다시 불러오는 중" : "다시 시도"}</button></div>
        : historyLoading ? <p className="recipe-history-loading" role="status" aria-live="polite">최근 식단을 불러오고 있어요.</p>
          : historyPlans.length ? <div className="recipe-history-list">{historyPlans.map((historyPlan) => { const timestamp = historyPlan.completed_at ?? historyPlan.saved_at; const used = historyPlan.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + "); return <button className="recipe-history-row" type="button" key={historyPlan.id} aria-label={`${historyPlan.title} ${historyPlan.completed_at ? "조리 완료" : "저장됨"} 식단 열기`} onClick={() => selectAlternative(historyPlan, undefined, undefined, historyPlan.completed_at ? "completed" : "saved")} style={{ border: 0, width: "100%", color: "inherit", textAlign: "left" }}><span><strong>{historyPlan.title}</strong><small>{historyPlan.completed_at ? "조리 완료" : "저장됨"}{timestamp ? ` · ${new Date(timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}{used ? ` · ${used} 사용` : ""}</small></span><span className={historyPlan.completed_at ? "recipe-history-status recipe-history-status-done" : "recipe-history-status"}>{historyPlan.max_minutes}분</span><ArrowRightIcon width={14} height={14} /></button>; })}</div>
            : <div className="recipe-history-empty" role="status" aria-live="polite"><CalendarIcon width={16} height={16} aria-hidden="true" /><span><strong>{mealApi.isConfigured ? "저장된 식단이 아직 없어요" : "임시 저장한 식단이 아직 없어요"}</strong><small>{mealApi.isConfigured ? "식단을 저장하면 여기에서 다시 확인할 수 있어요." : "임시 저장하면 여기서 볼 수 있어요. 화면을 벗어나면 사라져요."}</small></span></div>}
    </section> : null}
    </div>
    )}
  </BottomSheet>;
}
