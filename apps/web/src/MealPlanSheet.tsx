import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CalendarIcon, CheckCircledIcon, InfoCircledIcon, LightningBoltIcon, PlusIcon, TimerIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior, revealAndFocus } from "./mobile/scroll";
import { MEAL_API_WORKSPACE_CONFLICT_MESSAGE, isMealApiMealPlanCompletionPersistenceError, isMealApiMealPlanPersistenceError, isMealApiMealPreferencesPersistenceError, isMealApiMultiDayPlanPersistenceError, isMealApiShoppingListPersistenceError, isMealApiWorkspaceConflictError, mealApi, type ApiAllergenCode, type ApiGrocySyncStatus, type ApiMealPlan, type ApiMealPlanAuditEvent, type ApiMealPlanOptions, type ApiMealPreferences, type ApiMultiDayMealPlan, type ApiShoppingListItem } from "./mealApi";
import { WorkspaceSyncCoordinator, type WorkspaceSyncInvalidation, type WorkspaceSyncTransport } from "./workspaceSync";

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

const FOOD_IMAGES = {
  spinach: "/assets/food/spinach-cutout-v1.png",
  tofu: "/assets/food/tofu-cutout-v1.png",
  chicken: "/assets/food/chicken-cutout-v1.png",
  mushroom: "/assets/food/mushroom.png",
  eggs: "/assets/food/eggs.png",
  milk: "/assets/food/milk.png",
  tomato: "/assets/food/tomato.png",
} as const;

function imageForFoodName(name: string) {
  if (name.includes("시금치")) return FOOD_IMAGES.spinach;
  if (name.includes("두부")) return FOOD_IMAGES.tofu;
  if (name.includes("닭")) return FOOD_IMAGES.chicken;
  if (name.includes("버섯")) return FOOD_IMAGES.mushroom;
  if (name.includes("달걀") || name.includes("계란")) return FOOD_IMAGES.eggs;
  if (name.includes("우유")) return FOOD_IMAGES.milk;
  return FOOD_IMAGES.tomato;
}

function mealPlanErrorMessage(reason: unknown, fallback: string) {
  return isMealApiWorkspaceConflictError(reason) ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE : fallback;
}

type MealPlanLoadResult<T> = { value: T | null; error: unknown | null };

function settleMealPlanRequest<T>(request: Promise<T>): Promise<MealPlanLoadResult<T>> {
  return request
    .then((value) => ({ value, error: null }))
    .catch((error: unknown) => ({ value: null, error }));
}

function ingredientStatus(ingredient: ApiMealPlan["ingredients"][number]) {
  if (ingredient.available) {
    const notes = [
      ingredient.match_type === "alias" ? "상품명 연결" : null,
      ingredient.quantity_match === "converted" ? "단위 환산" : null,
    ].filter(Boolean);
    return notes.length ? ` · ${notes.join(" · ")}` : "";
  }
  if (ingredient.quantity_match === "incompatible") return " · 단위 확인 필요";
  if (ingredient.available_quantity != null) {
    const converted = ingredient.quantity_match === "converted" ? "환산 후 " : "";
    return ` · ${converted}${formatQuantity(ingredient.available_quantity)}${ingredient.available_unit ?? ingredient.unit} 보유`;
  }
  return " · 필요";
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
  if (Number.isNaN(parsed.getTime())) return "날짜 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(parsed);
}

function multiDayDayStatus(status: ApiMultiDayMealPlan["days"][number]["status"]) {
  if (status === "completed") return "조리 완료";
  if (status === "saved") return "저장됨";
  return "저장 전";
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
  const demoIngredients = foods.slice(0, 3).map((food) => ({
    canonical_name: food.name,
    amount: servings,
    unit: food.quantity.replace(/[\d.\s]/g, "") || "개",
    available: true,
    available_food_id: food.id,
  }));
  const isSeedRecipe = foods.some((food) => food.name.includes("시금치")) && foods.some((food) => food.name.includes("두부")) && foods.some((food) => food.name.includes("닭"));
  return {
    id: "demo-meal-plan",
    snapshot_hash: "demo-fixture-v1",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "demo-v1",
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    date_review_required: dateReviewFoods.length > 0,
    date_review_foods: dateReviewFoods.map((food) => food.name),
    date_review_food_ids: dateReviewFoods.map((food) => food.id),
    date_review_note: dateReviewFoods.length
      ? dateReviewFoods.map((food) => food.name).join("·") + "의 표시 날짜와 보관 상태를 확인한 뒤 사용하세요. 소비기한을 새로 판정하는 안내는 아닙니다."
      : null,
    recipe_id: "demo-rescue-recipe",
    planner_version: "demo-fixture-v1",
    source: "local_fixture",
    title: isSeedRecipe ? "시금치 두부 닭가슴살 덮밥" : "냉장고 재료 Rescue 볶음",
    minutes: 15,
    max_minutes: maxMinutes,
    servings,
    inventory_ids: foods.slice(0, 3).map((food) => food.id),
    ingredients: demoIngredients,
    missing_ingredients: [],
    matched_ratio: 1,
    score: 100,
    reason: "오늘 먼저 먹어야 할 식품을 기준으로 만든 가벼운 메뉴예요.",
    steps: ["재료를 꺼내 상태와 날짜를 확인합니다.", "단단한 재료부터 팬에 익힙니다.", "마지막에 잎채소를 넣고 바로 먹습니다."],
    safety_note: "데모 제안이며 식품 상태가 이상하면 조리하지 마세요.",
  };
}

export default function MealPlanSheet({ foods, active = false, initialMaxMinutes = 30, initialServings = 1, dateReviewFoods = [], onSaved, onCompleted, onOpenFoodDetail, onOpenAdd, onOptionsChange, workspaceSync, workspaceTransport }: { foods: MealFood[]; active?: boolean; initialMaxMinutes?: number; initialServings?: number; dateReviewFoods?: DemoDateReviewFood[]; onSaved: (kind?: "single" | "multi-day", hasMissingIngredients?: boolean) => void; onCompleted?: (foodIds: string[], skippedCount: number, consumedAllocations: Array<{ food_id: string; quantity: number }>, grocySyncStatus?: ApiGrocySyncStatus) => void; onOpenFoodDetail?: (foodId: string) => void; onOpenAdd?: () => void; onOptionsChange?: (options: { maxMinutes: number; servings: number }) => void; workspaceSync: WorkspaceSyncCoordinator; workspaceTransport: WorkspaceSyncTransport | null }) {
  const keyboard = useKeyboard();
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
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
  const [shoppingError, setShoppingError] = useState("");
  const [shoppingRetryAction, setShoppingRetryAction] = useState<ShoppingRetryAction | null>(null);
  const [mealPreferences, setMealPreferences] = useState<ApiMealPreferences>({ avoid_allergens: [] });
  const [mealPreferencesDraft, setMealPreferencesDraft] = useState<ApiAllergenCode[]>([]);
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
  const pollingInFlightRef = useRef(false);
  const plannerBusyRef = useRef(false);
  const completionActionsRef = useRef<HTMLDivElement | null>(null);
  const recipeViewActionRef = useRef<HTMLButtonElement | null>(null);
  const multiDayToggleRef = useRef<HTMLButtonElement | null>(null);
  const shoppingToggleRef = useRef<HTMLButtonElement | null>(null);
  const shoppingFirstItemRef = useRef<HTMLButtonElement | null>(null);
  const safetySummaryRef = useRef<HTMLElement | null>(null);
  const revealCompletionRef = useRef(false);
  const revealCompletionFocusRef = useRef(false);
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

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError("");
    setSaved(false);
    setCompleted(false);
    setSafetyAcknowledged(false);
    setSkippedCount(0);
    setAuditEvents([]);
    setAuditOpen(false);
    setAuditError("");
    setHistoryPlans([]);
    setHistoryOpen(false);
    setHistoryError("");
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
    setMealPreferencesOpen(false);
    setMealPreferencesError("");
    setMealPreferencesRetry(false);
    setMealPreferencesSaving(false);
    setRemoteRefreshRequired(false);
    revealCompletionRef.current = false;
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
      setConsumptionDraft(initialConsumptionDraft(demoPlan, ingredients));
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
        mealApi.previewMealPlan(inventoryIds, maxMinutes, "/api/meal-plans/preview", servings, signal),
        settleMealPlanRequest(mealApi.getLatestMealPlan(signal)),
        settleMealPlanRequest(mealApi.getMealPlanRevision(signal)),
      ]);
      return { preferences, response, latest, revision };
    })
      .then((result) => {
        if (cancelled || !result.current) return;
        if (result.error) throw result.error;
        const payload = result.value;
        if (!payload?.response) throw new Error("meal-plan-preview-missing");
        if (payload.revision.value) rememberMealPlanRevision(payload.revision.value.revision);
        if (payload.preferences.error) {
          setMealPreferencesError(mealPlanErrorMessage(payload.preferences.error, "식단 조건을 불러오지 못했어요. 기본 조건으로 계산합니다."));
        } else if (payload.preferences.value) {
          setMealPreferences(payload.preferences.value);
          setMealPreferencesDraft(payload.preferences.value.avoid_allergens);
          setMealPreferencesError("");
        }
        const latest = payload.latest.error ? null : payload.latest.value;
        const response = payload.response;
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
        if (!cancelled) setError(mealPlanErrorMessage(reason, "현재 재료로 식단을 계산하지 못했어요. 잠시 후 다시 시도해 주세요."));
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
  }, [active, dateReviewKey, ingredientKey, maxMinutes, servings, mealPreferencesVersion, mealPlanRefreshNonce, workspaceSync]);

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
      (missingIngredientAction ?? completionActionsRef.current)?.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
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
      target?.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, multiDayPreview, multiDaySaved]);

  const toggleAllergen = (allergen: ApiAllergenCode) => {
    setMealPreferencesDraft((current) => current.includes(allergen) ? current.filter((value) => value !== allergen) : [...current, allergen]);
  };

  const saveMealPreferences = async () => {
    if (mealPreferencesSaving) return;
    setMealPreferencesError("");
    setMealPreferencesRetry(false);
    setMealPreferencesNotice("");
    setMealPreferencesSaving(true);
    try {
      const response = await mealApi.updateMealPreferences({ avoid_allergens: mealPreferencesDraft });
      if (!response) throw new Error("meal-preferences-save-missing");
      setMealPreferences(response);
      setMealPreferencesDraft(response.avoid_allergens);
      setMealPreferencesNotice("식단 조건을 저장했어요. 추천을 다시 계산합니다.");
      setMealPreferencesRetry(false);
      setMealPreferencesOpen(false);
      rememberCurrentWorkspaceRevision();
      setMealPreferencesVersion((current) => current + 1);
    } catch (reason) {
      setMealPreferencesError(isMealApiMealPreferencesPersistenceError(reason)
        ? "식단 조건을 저장하지 못했어요. 기존 조건을 유지했어요."
        : mealPlanErrorMessage(reason, "식단 조건을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setMealPreferencesRetry(!isMealApiWorkspaceConflictError(reason));
    } finally {
      setMealPreferencesSaving(false);
    }
  };

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
      onSaved("single", plan.missing_ingredients.length > 0);
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
      onSaved("single", response.missing_ingredients.length > 0);
      if (isRetry) window.requestAnimationFrame(() => window.requestAnimationFrame(() => recipeViewActionRef.current?.focus({ preventScroll: true })));
    } catch (reason) {
      const persistenceFailure = isMealApiMealPlanPersistenceError(reason);
      setError(persistenceFailure
        ? "식단을 저장하지 못했어요. 기존 식단과 상태를 유지했어요."
        : mealPlanErrorMessage(reason, "식단을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요."));
      setSaveRetryPayload(persistenceFailure ? payload : null);
    } finally {
      setSaving(false);
    }
  };

  const hasRecipe = Boolean(plan && plan.recipe_id !== "no-match");
  const planIngredients = plan?.ingredients ?? [];
  const consumptionRows = plan ? consumptionRowsForPlan(plan, foods) : [];
  const consumptionSelection = consumptionRows.map((row) => ({ row, quantity: consumptionDraft[row.foodId] ?? row.defaultQuantity }));
  const consumptionUsedRows = consumptionSelection.filter(({ quantity }) => quantity > 0).length;
  const consumptionSkippedRows = consumptionSelection.filter(({ quantity }) => quantity <= 0).length;
  const consumptionPartialRows = consumptionSelection.filter(({ row, quantity }) => quantity > 0 && quantity < row.maxQuantity).length;
  const consumptionSelectionNote = !consumptionRows.length
    ? "사용할 재료를 확인해 주세요."
    : consumptionSkippedRows || consumptionPartialRows
      ? `현재 ${consumptionUsedRows}개 사용${consumptionPartialRows ? ` · 일부 사용 ${consumptionPartialRows}개` : ""}${consumptionSkippedRows ? ` · ${consumptionSkippedRows}개는 재고에 남겨요` : ""}.`
      : `기본값은 재료 ${consumptionRows.length}개 전부 사용 · 실제 사용량으로 조정해 주세요.`;
  const allergenMetadataUnknown = Boolean(hasRecipe && plan?.allergen_metadata_status !== "known");
  const requiresSafetyAcknowledgement = Boolean(hasRecipe && (plan?.date_review_required || allergenMetadataUnknown));
  const safetyNoticeCount = [
    plan?.date_review_required,
    plan?.preference_filtered,
    Boolean(plan?.missing_ingredients.length),
    allergenMetadataUnknown,
  ].filter(Boolean).length;
  const safetyNoticeTopics = [
    plan?.date_review_required ? "날짜·보관" : null,
    plan?.preference_filtered ? "식단 조건" : null,
    plan?.missing_ingredients.length ? "부족 재료" : null,
    allergenMetadataUnknown ? "알레르기" : null,
  ].filter((value): value is string => Boolean(value));
  const safetyNoticeDescription = safetyNoticeTopics.length
    ? `사용 전 ${safetyNoticeTopics.join(" · ")} 확인이 필요해요`
    : "사용 전 확인할 내용이 있어요";

  const revealSafetySummary = () => {
    const summary = safetySummaryRef.current;
    if (!summary) return;
    const firstAction = summary.querySelector<HTMLElement>("button:not([disabled])");
    revealAndFocus(firstAction ?? summary, { block: "center" });
  };

  const revealCompletionControls = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        completionActionsRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    });
  };

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
        currentTarget.scrollIntoView({ behavior: "auto", block: "nearest" });
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
      setAlternativesError(mealPlanErrorMessage(reason, "다른 메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
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
      setMultiDayError(mealPlanErrorMessage(reason, "3일 식단을 계산하지 못했어요. 잠시 후 다시 시도해 주세요."));
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
      onSaved("multi-day", multiDayPreview.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0));
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
      onSaved("multi-day", response.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0));
      if (isRetry) window.requestAnimationFrame(() => multiDayToggleRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      const persistenceFailure = isMealApiMultiDayPlanPersistenceError(reason);
      setMultiDayError(persistenceFailure
        ? "3일 식단을 저장하지 못했어요. 기존 3일 식단과 상태를 유지했어요."
        : mealPlanErrorMessage(reason, "3일 식단을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요."));
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
      setMultiDayHistoryError(mealPlanErrorMessage(reason, "저장한 3일 식단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
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
      setShoppingError(mealPlanErrorMessage(reason, "장보기 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      setShoppingRetryAction({ label: isMealApiWorkspaceConflictError(reason) ? "최신 상태 확인" : "다시 시도", onRetry: () => void refreshShoppingList(true) });
    } finally {
      setShoppingLoading(false);
    }
  };

  const toggleShoppingList = async () => {
    if (!plan || shoppingLoading || shoppingMutating) return;
    if (shoppingOpen) {
      setShoppingOpen(false);
      return;
    }
    setShoppingOpen(true);
    await refreshShoppingList();
  };

  const addShoppingSource = async (sourceType: "meal_plan" | "multi_day", sourceId: string, retry = false) => {
    if (shoppingMutating) return;
    setShoppingError("");
    setShoppingRetryAction(null);
    setShoppingMutating(true);
    try {
      if (!mealApi.isConfigured) throw new Error("shopping-list-unavailable");
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
        : mealPlanErrorMessage(reason, "장보기 목록을 만들지 못했어요. 현재 재료를 다시 확인해 주세요."));
      setShoppingOpen(true);
      setShoppingRetryAction({
        label: isMealApiWorkspaceConflictError(reason) ? "최신 상태 확인" : "다시 시도",
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
      setShoppingError(mealPlanErrorMessage(reason, "장보기 항목 상태를 저장하지 못했어요."));
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
      setShoppingError(mealPlanErrorMessage(reason, "장보기 항목을 삭제하지 못했어요."));
    } finally {
      setShoppingMutating(false);
    }
  };

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
      setAuditError(mealPlanErrorMessage(reason, "식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleHistory = async () => {
    if (!plan || historyLoading) return;
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    setHistoryError("");
    setAuditOpen(false);
    if (!mealApi.isConfigured) {
      setHistoryPlans([plan]);
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
      setHistoryError(mealPlanErrorMessage(reason, "최근 식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
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
      setError("조리 전 확인을 완료한 뒤 기록해 주세요.");
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
        setError("사용량을 하나 이상 선택해 주세요.");
        setCompleting(false);
        return;
      }
      const completedAt = new Date().toISOString();
      setPlan((current) => current ? { ...current, completed_at: completedAt, consumed_food_ids: consumedAllocations.map((allocation) => allocation.food_id), consumed_allocations: consumedAllocations } : current);
      setCompleted(true);
      setSkippedCount(nextSkippedCount);
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
      setCompletionRetry(false);
      setCompletionRetryPayload(null);
      setSkippedCount(response.skipped_ingredients.length);
      onCompleted?.(response.consumed_food_ids, response.skipped_ingredients.length, response.consumed_allocations, response.grocy_sync_status);
    } catch (reason) {
      const persistenceFailure = isMealApiMealPlanCompletionPersistenceError(reason);
      setError(persistenceFailure
        ? "조리 완료를 저장하지 못했어요. 기존 재고와 식단을 유지했어요."
        : mealPlanErrorMessage(reason, "조리 완료를 기록하지 못했어요. 현재 재고와 사용량을 다시 확인해 주세요."));
      setCompletionRetry(persistenceFailure);
      setCompletionRetryPayload(persistenceFailure ? consumptions : null);
    } finally {
      setCompleting(false);
    }
  };

  return <div className="meal-sheet-content">
    {ingredients.length ? <>
    {mealApi.isConfigured ? <button className="recipe-preferences-toggle" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} onClick={() => { setMealPreferencesError(""); setMealPreferencesNotice(""); setMealPreferencesOpen((current) => !current); }}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesOpen ? "식단 조건 접기" : mealPreferences.avoid_allergens.length ? `피할 알레르기 ${mealPreferences.avoid_allergens.length}개` : "식단 조건 설정"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {mealPreferencesNotice ? <div className="recipe-preference-notice" role="status"><CheckCircledIcon width={15} height={15} />{mealPreferencesNotice}</div> : null}
    {mealPreferencesOpen ? <section className="recipe-preferences" aria-label="식단 조건"><div className="recipe-alternatives-heading"><span>피할 알레르기</span><small>직접 선택한 조건만 적용해요</small></div><div className="recipe-preferences-options" role="group" aria-label="피할 알레르기 선택">{ALLERGEN_OPTIONS.map((option) => <button className={mealPreferencesDraft.includes(option.value) ? "recipe-preference-chip recipe-preference-chip-active" : "recipe-preference-chip"} type="button" aria-pressed={mealPreferencesDraft.includes(option.value)} key={option.value} onClick={() => toggleAllergen(option.value)}>{option.label}</button>)}</div>{mealPreferencesError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{mealPreferencesError}</span>{mealPreferencesRetry ? <button className="account-error-action" type="button" onClick={() => void saveMealPreferences()}>다시 시도</button> : null}</div> : null}<button className="secondary-sheet-button" type="button" disabled={mealPreferencesSaving} onClick={() => void saveMealPreferences()}>{mealPreferencesSaving ? "식단 조건 저장 중" : "식단 조건 저장"}</button><small className="recipe-preferences-note">알레르기 정보가 불명확한 외부 레시피는 회피 조건을 저장한 동안 추천하지 않아요. 의료적 안전 판정은 아닙니다.</small></section> : null}
    <div className="recipe-time-picker" role="group" aria-label="조리 가능 시간"><span>조리 가능 시간</span><div>{MEAL_TIME_OPTIONS.map((option) => <button className={maxMinutes === option ? "recipe-time-active" : ""} type="button" key={option} aria-pressed={maxMinutes === option} onClick={() => updateMaxMinutes(option)}>{option}분</button>)}</div></div>
    <div className="recipe-serving-picker" role="group" aria-label="식사 인원"><span>몇 명이 먹나요?</span><div>{MEAL_SERVING_OPTIONS.map((option) => <button className={servings === option ? "recipe-time-active" : ""} type="button" key={option} aria-pressed={servings === option} disabled={loading || saving || saved || completed} onClick={() => updateServings(option)}>{option}인분</button>)}</div></div>
    <p className="recipe-serving-note">{plan?.servings ?? servings}인분 기준으로 필요한 재료량을 계산해요.</p>
    {safetyNoticeCount ? <button className="recipe-safety-summary" type="button" aria-controls="recipe-safety-summary" aria-label={`사용 전 확인 ${safetyNoticeCount}건 보기`} style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left" }} onClick={revealSafetySummary}>
      <div className="recipe-safety-summary-heading"><span className="recipe-safety-summary-icon"><InfoCircledIcon width={16} height={16} /></span><span><strong>사용 전 확인</strong><small>{safetyNoticeCount}건 · {safetyNoticeDescription}</small></span><ArrowRightIcon width={15} height={15} /></div>
    </button> : null}
    </> : null}
    {loading ? <div className="recipe-loading" role="status"><LightningBoltIcon width={18} height={18} /><span><strong>지금 있는 재료를 살펴보고 있어요</strong><small>먼저 먹을 순서와 조리 시간을 함께 계산합니다.</small></span></div> : null}
    {!loading ? <div className="recipe-title-row"><div><span className="recipe-kicker">RESCUE MEAL</span><h3>{plan?.title ?? (ingredients.length ? "식단을 만들 수 없어요" : "재료를 먼저 추가해 주세요")}</h3></div>{hasRecipe ? <span className="recipe-time"><TimerIcon width={15} height={15} /> {plan?.minutes ?? 0}분</span> : null}</div> : null}
    {!loading ? <p className="recipe-description">{plan?.reason ?? (ingredients.length ? "재료를 더 추가하거나 조리 조건을 바꿔 다시 계산해 보세요." : "영수증·바코드·직접 입력으로 식품을 추가하면 맞춤 식단을 만들 수 있어요.")}</p> : null}
    {!loading && ingredients.length && plan ? <div className="recipe-art" aria-hidden="true">{planIngredients.slice(0, 3).map((ingredient) => <img src={imageForFoodName(ingredient.canonical_name)} alt="" key={ingredient.canonical_name} draggable={false} />)}</div> : null}
    {!loading && !ingredients.length ? <div className="recipe-empty-art"><LightningBoltIcon width={24} height={24} /></div> : null}
    {safetyNoticeCount ? <section ref={safetySummaryRef} id="recipe-safety-summary" className="recipe-safety-summary" tabIndex={-1} aria-label={`사용 전 확인 안내 ${safetyNoticeCount}건`}>
      <div className="recipe-safety-summary-heading"><span className="recipe-safety-summary-icon"><InfoCircledIcon width={16} height={16} /></span><span><strong>확인할 내용</strong><small>포장지·보관 상태·알레르기 정보를 먼저 읽어 주세요.</small></span><em>{safetyNoticeCount}건</em></div>
      <div className="recipe-safety-summary-list">
        {plan?.date_review_required ? <div className="recipe-date-review-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>조리 전 날짜 확인이 필요해요</strong><small>{plan.date_review_note ?? `${plan.date_review_foods?.join("·") || "사용할 재료"}의 표시 날짜와 보관 상태를 확인한 뒤 사용하세요. 소비기한을 새로 판정하는 안내는 아닙니다.`}</small>{plan.date_review_foods?.map((foodName, index) => { const foodId = plan.date_review_food_ids?.[index]; if (foodId && onOpenFoodDetail) return <button className="recipe-shopping-inline-button" type="button" data-meal-food-id={foodId} key={`${foodId}-${foodName}`} onClick={() => onOpenFoodDetail(foodId)}>식품 확인 · {foodName}</button>; return <small className="recipe-safety-targets" key={`${index}-${foodName}`}>확인할 식품 · {foodName}</small>; })}</span></div> : null}
        {plan?.preference_filtered ? <div className="recipe-preference-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>알레르기 조건으로 추천을 보류했어요</strong><small>{plan.preference_note ?? "레시피의 알레르기 정보를 확인한 뒤 다시 시도해 주세요."}</small></span></div> : null}
        {plan?.missing_ingredients.length ? <div className="recipe-missing-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>부족한 재료 {plan.missing_ingredients.length}개</strong><small>{plan.missing_ingredients.join("·")}을 추가하면 더 정확히 만들 수 있어요.</small>{saved && mealApi.isConfigured ? <button className="recipe-shopping-inline-button" type="button" disabled={shoppingMutating} onClick={() => void addShoppingSource("meal_plan", plan.id)}>{shoppingMutating ? "장보기 목록 저장 중" : "장보기 목록에 추가"}</button> : null}</span></div> : null}
        {allergenMetadataUnknown ? <div className="recipe-allergen-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>알레르기 정보 확인이 필요해요</strong><small>추천 식품의 알레르기 정보가 모두 확인된 것은 아니에요. 먹기 전에 포장지와 개인 알레르기를 확인해 주세요.</small></span></div> : null}
      </div>
    </section> : null}
    {!loading && hasRecipe ? <div className="recipe-ingredients"><span>필요한 재료</span><div>{planIngredients.map((ingredient) => <span className={!ingredient.available ? "recipe-ingredient-missing" : ""} key={ingredient.canonical_name}><img src={imageForFoodName(ingredient.canonical_name)} alt="" draggable={false} />{ingredient.canonical_name}{ingredientStatus(ingredient)}</span>)}</div></div> : null}
    {!loading && hasRecipe && plan?.allergen_metadata_status === "known" ? <p className="recipe-allergen-note">알레르기 정보 · {plan.allergens?.length ? plan.allergens.map(allergenLabel).join("·") : "확인된 주요 항목 없음"}</p> : null}
    {!loading && plan ? <p className="recipe-provenance">출처 · {plan.recipe_source_name ?? "출처 확인 필요"}</p> : null}
    {error ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span>{saveRetryPayload ? <button className="recipe-error-action" type="button" disabled={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistPlan(saveRetryPayload)}>다시 시도</button> : null}{completionRetry ? <button className="recipe-error-action" type="button" disabled={completing} onPointerDown={(event) => event.preventDefault()} onClick={() => void completePlan(completionRetryPayload ?? undefined)}>다시 시도</button> : null}{!saveRetryPayload && !completionRetry ? <button className="recipe-error-action" type="button" disabled={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { setError(""); setMealPlanRefreshNonce((current) => current + 1); }}>다시 계산</button> : null}</div> : null}
    {remoteRefreshRequired ? <div className="recipe-error recipe-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 식단이나 재고가 변경됐어요</strong><small>현재 화면의 선택과 사용량은 유지하고 있어요. 최신 상태를 확인한 뒤 다시 계산해 주세요.</small></span><button className="recipe-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { setRemoteRefreshRequired(false); setMealPlanRefreshNonce((current) => current + 1); }}>최신 식단 확인</button></div> : null}
    {hasRecipe ? <div className="recipe-actions detail-actions"><button className="secondary-sheet-button" type="button" disabled={loading || saving || saved} onClick={() => void persistPlan()}><CalendarIcon width={17} height={17} /> {saved ? "저장됨" : saving ? "저장 중" : "식단 저장"}</button><button ref={recipeViewActionRef} className="primary-sheet-button" type="button" disabled={loading || saving} onClick={() => setShowDetails((current) => !current)}>{showDetails ? "레시피 접기" : "레시피 보기"} <ArrowRightIcon width={17} height={17} /></button></div> : <button className="primary-sheet-button" type="button" disabled={!onOpenAdd} onClick={onOpenAdd}><PlusIcon width={17} height={17} /> {ingredients.length ? "식품 더 추가하기" : "식품 추가하기"}</button>}
    {saved ? <div className="saved-recipe"><CheckCircledIcon width={16} height={16} /><span style={{ display: "grid", minWidth: 0, gap: 2 }}><strong>오늘의 식단에 저장했어요</strong><small style={{ color: "var(--atelier-muted)", fontSize: 9, lineHeight: 1.35 }}>{plan?.missing_ingredients.length ? "다음: 부족 재료를 장보기에 추가해 주세요." : "다음: 사용량을 확인하고 조리 완료를 기록해 주세요."}</small></span></div> : null}
    {saved && !completed ? <div ref={completionActionsRef} className="recipe-complete-actions"><div className="recipe-consumption-heading"><span>사용량 확인</span><small role="status" aria-live="polite">{consumptionSelectionNote}</small></div><div className="recipe-consumption-list">{consumptionRows.map((row) => { const currentQuantity = consumptionDraft[row.foodId] ?? 0; return <div className="recipe-consumption-row" key={row.foodId}><span><strong>{row.name}</strong><small>최대 {formatQuantity(row.maxQuantity)}{row.unit}</small></span><div className="recipe-consumption-stepper"><button type="button" aria-label={`${row.name} 사용량 줄이기`} disabled={completing || currentQuantity <= 0} onClick={() => adjustConsumption(row, -row.step)}>-</button><label className="recipe-consumption-input-wrap"><span className="sr-only">{row.name} 사용량</span><KeyboardInput className="recipe-consumption-input" type="number" inputMode="decimal" min={0} max={row.maxQuantity} step={row.step} value={formatQuantity(currentQuantity)} aria-label={`${row.name} 사용량`} onFocus={revealCompletionControls} onChange={(event) => setConsumptionValue(row, event.target.value)} onBlur={() => keyboard.hide()} disabled={completing || row.maxQuantity <= 0} /><em>{row.unit}</em></label><button type="button" aria-label={`${row.name} 사용량 늘리기`} disabled={completing || currentQuantity >= row.maxQuantity} onClick={() => adjustConsumption(row, row.step)}>+</button></div></div>; })}</div>{requiresSafetyAcknowledgement ? <div className="recipe-date-review-callout recipe-safety-summary-item" role="group" aria-label="조리 전 기록 확인"><InfoCircledIcon width={16} height={16} /><span><strong>조리 전 확인을 완료했어요?</strong><small>포장지 표시·식품 상태·알레르기 정보를 확인한 뒤 소비 기록을 남겨요.</small><button className="recipe-shopping-inline-button" type="button" aria-pressed={safetyAcknowledged} onPointerDown={(event) => { event.preventDefault(); setSafetyAcknowledged((current) => !current); }} onClick={(event) => { if (event.detail === 0) setSafetyAcknowledged((current) => !current); }}>{safetyAcknowledged ? "확인 완료" : "조리 전 확인했어요"}</button></span></div> : null}<button className="recipe-complete-button" type="button" disabled={completing || (requiresSafetyAcknowledgement && !safetyAcknowledged)} onPointerDown={(event) => { event.preventDefault(); void completePlan(); keyboard.hide(); }} onClick={(event) => { if (event.detail === 0) { void completePlan(); keyboard.hide(); } }}><CheckCircledIcon width={16} height={16} /> {completing ? "기록 중" : requiresSafetyAcknowledgement && !safetyAcknowledged ? "조리 전 확인 후 기록" : "조리 완료로 기록"}</button><small>확인하면 위 수량만큼 소비 기록을 남겨요.</small></div> : null}
    {completed ? <div className="recipe-completed" role="status"><CheckCircledIcon width={16} height={16} /><span><strong>조리 완료 기록을 남겼어요</strong><small>{skippedCount ? `처리 가능한 재료만 차감했고, ${skippedCount}개는 재고를 다시 확인해 주세요.` : "사용한 재료를 식품 목록에서 차감했습니다."}</small></span></div> : null}
    {hasRecipe && mealApi.isConfigured && !saved && !completed ? <button className="recipe-alternatives-toggle" type="button" disabled={loading || saving || alternativesLoading} onClick={() => void loadAlternatives()}>{alternativesLoading ? "다른 메뉴 찾는 중" : alternativesOpen ? "다른 메뉴 접기" : "다른 메뉴 찾아보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {alternativesOpen ? <section className="recipe-alternatives" aria-label="다른 메뉴"><div className="recipe-alternatives-heading"><span>다른 메뉴</span><small>현재 재료와 {maxMinutes}분 · {servings}인분 기준</small></div>{alternativesError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{alternativesError}</span><button className="recipe-error-action" type="button" disabled={alternativesLoading} onClick={() => void loadAlternatives(true)}>다시 시도</button></div> : alternatives.length ? <div className="recipe-alternatives-list" role="list">{alternatives.map((option) => <button className="recipe-alternative-row" type="button" role="listitem" key={option.recipe_id} onClick={() => selectAlternative(option)}><span><strong>{option.title}</strong><small>{option.minutes}분 · 재료 {Math.round(option.matched_ratio * 100)}% 연결{option.missing_ingredients.length ? ` · 부족 ${option.missing_ingredients.length}개` : ""}</small></span><ArrowRightIcon width={14} height={14} /></button>)}</div> : <p className="history-empty">다른 재료 조합을 찾지 못했어요. 조리 시간이나 식사 인원을 바꿔 다시 찾아보세요.</p>}</section> : null}
    {hasRecipe && mealApi.isConfigured && !saved && !completed ? <button ref={multiDayToggleRef} className="recipe-multi-day-toggle" type="button" disabled={loading || saving || multiDayLoading} onClick={() => void loadMultiDayPreview()}>{multiDayLoading ? "3일 식단 계산 중" : multiDayOpen ? "3일 식단 접기" : "3일 식단 미리보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {multiDayOpen ? (
      <section className="recipe-multi-day" aria-label="3일 식단">
        <div className="recipe-alternatives-heading"><span>3일 식단</span><small>각 날짜는 먼저 배정한 재료를 고려해요 · {multiDayPreview?.servings ?? servings}인분 기준</small></div>
        {multiDayError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{multiDayError}</span>{multiDaySaveRetryPayload ? <button className="recipe-error-action" type="button" disabled={multiDaySaving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistMultiDayPlan(multiDaySaveRetryPayload)}>다시 시도</button> : <button className="recipe-error-action" type="button" disabled={multiDayLoading} onClick={() => void loadMultiDayPreview(true)}>다시 계산</button>}</div> : multiDayPreview?.days.length ? (
          <>
            <p className="recipe-optimizer-note" role="status"><LightningBoltIcon width={14} height={14} />{multiDayPreview.optimization_engine === "or-tools-cp-sat" ? "재고·중복 사용을 함께 최적화했어요." : "재고 순서에 맞춰 계산한 3일 식단이에요."}</p>
            <div className="recipe-multi-day-save">
              <button className="secondary-sheet-button" type="button" disabled={multiDaySaving || multiDaySaved} onClick={() => void persistMultiDayPlan()}><CalendarIcon width={15} height={15} /> {multiDaySaved ? "3일 식단 저장됨" : multiDaySaving ? "3일 식단 저장 중" : "3일 식단 저장"}</button>
              {multiDaySaved ? <span className="recipe-multi-day-status" role="status">{multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0) ? "부족 재료를 장보기로 이어갈 수 있어요." : "다시 열어도 이 식단을 확인할 수 있어요."}</span> : <span className="recipe-multi-day-status">미리보기는 저장되지 않아요.</span>}
              {multiDaySaved && multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0) ? <button className="recipe-shopping-inline-button" type="button" disabled={shoppingMutating} onClick={() => void addShoppingSource("multi_day", multiDayPreview.id)}>{shoppingMutating ? "장보기 목록 저장 중" : "3일 부족 재료 장보기"}</button> : null}
            </div>
            <div className="recipe-multi-day-list" role="list">
              {multiDayPreview.days.map((day) => {
                const linkedBundleId = multiDayPreview.saved_at ? multiDayPreview.id : undefined;
                return <button className={`recipe-multi-day-row${day.status === "completed" ? " recipe-multi-day-row-completed" : ""}`} type="button" role="listitem" key={`${day.day_index}-${day.plan.recipe_id}`} disabled={day.status === "completed"} onClick={() => selectAlternative(day.plan, linkedBundleId, linkedBundleId ? day.day_index : undefined, day.status)}><span className="recipe-multi-day-index">{day.day_index}일차</span><span className="recipe-multi-day-copy"><strong>{day.plan.title}</strong><small>{formatPlanDate(day.plan_date)} · {day.plan.minutes}분 · 재료 {Math.round(day.plan.matched_ratio * 100)}% 연결{day.plan.missing_ingredients.length ? ` · 부족 ${day.plan.missing_ingredients.length}개` : ""} · {multiDayDayStatus(day.status)}</small></span><ArrowRightIcon width={14} height={14} /></button>;
              })}
            </div>
          </>
        ) : <p className="history-empty">현재 조건에서 이어서 만들 수 있는 날짜를 찾지 못했어요. 조리 시간이나 식사 인원을 바꿔 다시 계산해 보세요.</p>}
      </section>
    ) : null}
    {mealApi.isConfigured && plan ? <button className="recipe-multi-day-history-toggle" type="button" disabled={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory()}>{multiDayHistoryLoading ? "저장한 3일 식단 불러오는 중" : multiDayHistoryOpen ? "저장한 3일 식단 접기" : "저장한 3일 식단 보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {multiDayHistoryOpen ? <section className="recipe-multi-day-history" aria-label="저장한 3일 식단"><div className="recipe-alternatives-heading"><span>저장한 3일 식단</span><small>최근 10개</small></div>{multiDayHistoryError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{multiDayHistoryError}</span><button className="recipe-error-action" type="button" disabled={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory(true)}>다시 시도</button></div> : multiDayHistory.length ? <div className="recipe-multi-day-history-list" role="list">{multiDayHistory.map((bundle) => { const firstDay = bundle.days[0]; const lastDay = bundle.days[bundle.days.length - 1]; return <button className="recipe-multi-day-history-row" type="button" role="listitem" key={bundle.id} onClick={() => openSavedMultiDayPlan(bundle)}><span className="recipe-multi-day-index">{bundle.days.length}일</span><span className="recipe-multi-day-copy"><strong>{firstDay?.plan.title ?? "저장한 3일 식단"}{bundle.days.length > 1 ? ` 외 ${bundle.days.length - 1}개` : ""}</strong><small>{firstDay ? formatPlanDate(firstDay.plan_date) : "날짜 확인 필요"}{lastDay && lastDay !== firstDay ? ` ~ ${formatPlanDate(lastDay.plan_date)}` : ""} · {bundle.max_minutes}분</small></span><ArrowRightIcon width={14} height={14} /></button>; })}</div> : <p className="history-empty">저장한 3일 식단이 아직 없어요.</p>}</section> : null}
    {mealApi.isConfigured && plan ? <button ref={shoppingToggleRef} className="recipe-shopping-toggle" type="button" disabled={shoppingLoading || shoppingMutating} onClick={() => void toggleShoppingList()}>{shoppingLoading ? "장보기 목록 불러오는 중" : shoppingOpen ? "장보기 목록 접기" : shoppingRemainingCount ? `장보기 ${shoppingRemainingCount}개 확인` : "장보기 목록 보기"}<ArrowRightIcon width={14} height={14} /></button> : null}
    {shoppingOpen ? <section className="recipe-shopping" aria-label="장보기 목록"><div className="recipe-alternatives-heading"><span>장보기 목록</span><small>{shoppingList.length ? `${shoppingList.filter((item) => !item.checked).length}개 남음` : "확인한 항목만 저장해요"}</small></div>{shoppingError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{shoppingError}</span>{shoppingRetryAction ? <button className="recipe-error-action" type="button" disabled={shoppingMutating} onClick={shoppingRetryAction.onRetry}>{shoppingRetryAction.label}</button> : null}</div> : shoppingList.length ? <><div className="recipe-shopping-list" role="list">{shoppingList.map((item, index) => <div className={`recipe-shopping-row${item.checked ? " recipe-shopping-row-checked" : ""}`} role="listitem" key={item.id}><button ref={index === 0 ? shoppingFirstItemRef : undefined} className="recipe-shopping-item" type="button" aria-pressed={item.checked} disabled={shoppingMutating} onClick={() => void toggleShoppingItem(item)}><span className="recipe-shopping-check" aria-hidden="true">{item.checked ? "✓" : ""}</span><span className="recipe-multi-day-copy"><strong>{item.canonical_name}</strong><small>{formatQuantity(item.quantity)}{item.unit} · {shoppingSourceLabel(item)}</small></span></button><button className="recipe-shopping-delete" type="button" aria-label={`${item.canonical_name} 장보기 항목 삭제`} disabled={shoppingMutating} onClick={() => void removeShoppingItem(item)}>삭제</button></div>)}</div><p className="recipe-shopping-note">재고에 추가한 뒤 같은 식단을 다시 동기화하면 보유한 재료는 목록에서 자동으로 빠져요.</p></> : <p className="history-empty">아직 장보기 항목이 없어요. 부족한 재료에서 추가할 수 있어요.</p>}</section> : null}
    {showDetails && hasRecipe ? <div className="recipe-details"><div className="recipe-details-heading"><span>조리 순서</span><small>{plan?.minutes}분 기준</small></div><ol>{plan?.steps.map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><span>{step}</span></li>)}</ol><div className="recipe-safety"><InfoCircledIcon width={15} height={15} /><span><strong>안전 메모</strong><small>{plan?.safety_note}</small></span></div></div> : null}
    {saved ? <button className="recipe-audit-toggle" type="button" disabled={auditLoading} onClick={() => void toggleAudit()}>{auditLoading ? "기록 불러오는 중" : auditOpen ? "식단 기록 접기" : "식단 기록 보기"} <ArrowRightIcon width={14} height={14} /></button> : null}
    {auditOpen ? <div className="recipe-audit" aria-label="식단 기록"><div className="recipe-audit-heading"><span>식단 기록</span><small>저장·조리 기록</small></div>{auditError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} />{auditError}</div> : auditEvents.length ? <div className="recipe-audit-list">{auditEvents.map((event) => <div className="recipe-audit-row" key={event.id}><span className={`recipe-audit-icon recipe-audit-${event.event_type}`}><CheckCircledIcon width={13} height={13} /></span><span><strong>{event.event_type === "saved" ? "식단 저장" : "조리 완료"}</strong><small>{new Date(event.occurred_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{event.consumed_allocations.length ? ` · ${event.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + ")} 사용` : ""}</small></span></div>)}</div> : <p className="history-empty">아직 기록이 없어요.</p>}</div> : null}
    {plan ? <button className="recipe-history-toggle" type="button" disabled={historyLoading} onClick={() => void toggleHistory()}>{historyLoading ? "최근 식단 불러오는 중" : historyOpen ? "최근 식단 접기" : "최근 식단 보기"} <ArrowRightIcon width={14} height={14} /></button> : null}
    {historyOpen ? <div className="recipe-history" aria-label="최근 식단"><div className="recipe-audit-heading"><span>최근 식단</span><small>최대 10개</small></div>{historyError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} />{historyError}</div> : historyPlans.length ? <div className="recipe-history-list">{historyPlans.map((historyPlan) => { const timestamp = historyPlan.completed_at ?? historyPlan.saved_at; const used = historyPlan.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + "); return <button className="recipe-history-row" type="button" key={historyPlan.id} aria-label={`${historyPlan.title} ${historyPlan.completed_at ? "조리 완료" : "저장됨"} 식단 열기`} onClick={() => selectAlternative(historyPlan, undefined, undefined, historyPlan.completed_at ? "completed" : "saved")} style={{ border: 0, width: "100%", color: "inherit", textAlign: "left" }}><span><strong>{historyPlan.title}</strong><small>{historyPlan.completed_at ? "조리 완료" : "저장됨"}{timestamp ? ` · ${new Date(timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}{used ? ` · ${used} 사용` : ""}</small></span><span className={historyPlan.completed_at ? "recipe-history-status recipe-history-status-done" : "recipe-history-status"}>{historyPlan.max_minutes}분</span><ArrowRightIcon width={14} height={14} /></button>; })}</div> : <p className="history-empty">저장된 식단이 아직 없어요.</p>}</div> : null}
  </div>;
}
