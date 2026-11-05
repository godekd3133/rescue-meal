import { quantityReferenceRecoveryLabel, quantityReferenceUnit } from "./quantityReferenceRecovery";
import { validateMealConsumptionDraft } from "./mealConsumptionDraft";
import { quantityDraftValue } from "./quantitySelection";
import { formatQuantityAmount, multiplyQuantity, subtractQuantity, sumQuantities } from "./quantityArithmetic";
import { FoodPhoto } from "./FoodPhoto";
import { mealHistoryMetadata } from "./mealHistoryPresentation";
import { mealRecoveryMinutes } from "./mealPlanRecovery";
import { imageForFoodName } from "./foodPhotos";
import { completedMealAllocations } from "./completedMealAllocations";
import { Metadata, MetadataText } from "./Metadata";
import { useEffect, useRef, useState } from "react";
import { BookmarkIcon, CheckCircledIcon, CheckIcon, InfoCircledIcon, MinusIcon, PlusIcon, TimerIcon } from "@radix-ui/react-icons";
import { BottomSheet, Carousel, KeyboardInput, useKeyboard } from "./mobile";
import { MealDishArt } from "./MealDishArt";
import { MealCookingSheet, type CookingPage, type CookingStep } from "./MealCookingSheet";
import { FreshnessChip } from "./screens/FreshnessChip";
import { foodFreshness } from "./freshness";
import { demoCalendarDate } from "./demoCalendarDate";
import { TabSheetScreen } from "./screens/TabSheetScreen";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import { isMealApiAuthError, MEAL_API_WORKSPACE_CONFLICT_MESSAGE, isMealApiMealPlanCompletionPersistenceError, isMealApiMealPlanPersistenceError, isMealApiMealPreferencesPersistenceError, isMealApiMultiDayPlanPersistenceError, isMealApiShoppingListPersistenceError, isMealApiWorkspaceConflictError, mealApi, type ApiAllergenCode, type ApiGrocySyncStatus, type ApiMealPlan, type ApiMealPlanAuditEvent, type ApiMealPlanOptions, type ApiMealPreferences, type ApiMultiDayMealPlan, type ApiShoppingListItem } from "./mealApi";
import { WorkspaceSyncCoordinator, type WorkspaceSyncInvalidation, type WorkspaceSyncTransport } from "./workspaceSync";
import { getMealPlanErrorPresentation, mealPlanDisplayCopy, hasMeaningfulMealReason } from "./mealPlanPresentation";
import { toggleMealConsumptionSelection, updateMealConsumptionSelection, type MealConsumptionMemory } from "./mealConsumptionSelection";
import { PORTFOLIO_MISSING_INGREDIENT } from "./demo/portfolioFixtures";
import "./mealShoppingSheets.css";
import "./mealScreen.css";
type MealFood = {
  dateKind?: string;
  dateDetail?: string;
  dateAssertionKind?: string;
  priorityDate?: string;
  quantityUnit?: string;
  quantityReference?: { amount: number; unit: "g" | "ml" | "개" };
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

function mealPlanErrorPresentation(reason: unknown, fallback: string) {
  const kind = isMealApiAuthError(reason)
    ? "authentication"
    : isMealApiWorkspaceConflictError(reason)
      ? "workspace-conflict"
      : "other";
  return getMealPlanErrorPresentation(kind, fallback, MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
}

type MealPlanLoadResult<T> = { value: T | null; error: unknown | null };

/** "두부로" / "버섯으로" (ㄹ받침 takes 로), and "두부가" / "버섯이" for the anchored-menu copy. */
function withAnchorParticle(value: string, kind: "instrumental" | "subject") {
  const code = value.charCodeAt(value.length - 1) - 0xac00;
  const final = code >= 0 && code < 11172 ? code % 28 : 0;
  if (kind === "subject") return `${value}${final ? "이" : "가"}`;
  return `${value}${final && final !== 8 ? "으로" : "로"}`;
}

function settleMealPlanRequest<T>(request: Promise<T>): Promise<MealPlanLoadResult<T>> {
  return request
    .then((value) => ({ value, error: null }))
    .catch((error: unknown) => ({ value: null, error }));
}

function ingredientStatus(ingredient: ApiMealPlan["ingredients"][number]): string[] {
  const required = `필요 ${formatIngredientQuantity(ingredient.amount)}${ingredient.unit}`;
  if (ingredient.quantity_match === "incompatible") return [required, "단위가 달라 수량 비교 불가"];

  const conversion = ingredient.available_unit ? unitConversion(ingredient.available_unit, ingredient.unit) : null;
  const comparableAvailable = typeof ingredient.available_quantity === "number"
    && Number.isFinite(ingredient.available_quantity)
    && ingredient.available_quantity >= 0
    && conversion !== null
    ? multiplyQuantity(ingredient.available_quantity, conversion)
    : null;

  if (comparableAvailable !== null) {
    const parts = [required, `보유 ${formatIngredientQuantity(comparableAvailable)}${ingredient.unit}`];
    const missing = subtractQuantity(ingredient.amount, comparableAvailable);
    if (!ingredient.available && missing > 0) parts.push(`부족 ${formatIngredientQuantity(missing)}${ingredient.unit}`);
    return parts;
  }
  if (ingredient.quantity_match === "missing" || !ingredient.available_food_id) return [required, "목록에 없음"];
  return [required, "보유 수량 미확인"];
}

function formatIngredientQuantity(value: number) {
  return formatQuantityAmount(value);
}

function shoppingShortageQuantity(ingredient: ApiMealPlan["ingredients"][number]) {
  if (ingredient.available) return 0;
  const conversion = ingredient.available_unit ? unitConversion(ingredient.available_unit, ingredient.unit) : null;
  if (ingredient.quantity_match !== "incompatible" && typeof ingredient.available_quantity === "number" && conversion !== null) {
    return Math.max(0, subtractQuantity(ingredient.amount, multiplyQuantity(ingredient.available_quantity, conversion)));
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
  return formatQuantityAmount(value);
}

function formatPlanDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "날짜 미정";
  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일 (${"일월화수목금토"[parsed.getDay()]})`;
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
      const maxQuantity = conversion == null ? 0 : Math.min(allocation.quantity, multiplyQuantity(current.amount, conversion));
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

function normalizedFoodName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function demoDateReviewFields(dateReviewFoods: DemoDateReviewFood[]) {
  return {
    date_review_required: dateReviewFoods.length > 0,
    date_review_foods: dateReviewFoods.map((food) => food.name),
    date_review_food_ids: dateReviewFoods.map((food) => food.id),
    date_review_note: dateReviewFoods.length
      ? dateReviewFoods.map((food) => food.name).join("·") + "의 포장지 날짜와 보관 방법을 살펴본 뒤 조리해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요."
      : null,
  };
}

/** One recipe ingredient matched against every lot with the same name, in the recipe's unit. */
function demoIngredientFor(foods: MealFood[], food: MealFood, requiredAmount: number): ApiMealPlan["ingredients"][number] {
  const stockFoods = foods.filter((candidate) => normalizedFoodName(candidate.name) === normalizedFoodName(food.name));
  const unit = parseFoodQuantity(food.quantity).unit || "개";
  const compatibleStocks = stockFoods.flatMap((stockFood) => {
    const stock = parseFoodQuantity(stockFood.quantity);
    const stockUnit = stock.unit || "개";
    const conversion = unitConversion(stockUnit, unit);
    return conversion === null ? [] : [{ food: stockFood, quantity: multiplyQuantity(stock.amount, conversion), conversion, stockUnit }];
  });
  const availableQuantity = compatibleStocks.length
    ? sumQuantities(compatibleStocks.map((stock) => stock.quantity))
    : null;
  let remaining = requiredAmount;
  const allocations: NonNullable<ApiMealPlan["ingredients"][number]["allocations"]> = [];
  for (const stock of compatibleStocks) {
    if (remaining <= 0) break;
    const allocated = Math.min(stock.quantity, remaining);
    if (allocated > 0) {
      allocations.push({ food_id: stock.food.id, quantity: allocated / stock.conversion, unit: stock.stockUnit });
      remaining = subtractQuantity(remaining, allocated);
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
}

function demoMissingIngredient(name: string, amount: number, unit: string): ApiMealPlan["ingredients"][number] {
  return { canonical_name: name, amount, unit, available: false, available_food_id: null, available_quantity: null, available_unit: null, match_type: "exact", quantity_match: "missing", allocations: [] };
}

function demoPlanFields(ingredients: ApiMealPlan["ingredients"]) {
  const missingIngredients = ingredients.filter((ingredient) => !ingredient.available).map((ingredient) => ingredient.canonical_name);
  const matchedRatio = ingredients.length ? (ingredients.length - missingIngredients.length) / ingredients.length : 0;
  return {
    inventory_ids: [...new Set(ingredients.flatMap((ingredient) => ingredient.allocations?.map((allocation) => allocation.food_id) ?? []))],
    missing_ingredients: missingIngredients,
    matched_ratio: matchedRatio,
    score: Math.round(matchedRatio * 100),
  };
}

const DEMO_RECIPE_BASE = {
  recipe_source_name: "Rescue Meal에서 작성",
  recipe_source_url: null,
  recipe_license: "project-authored",
  recipe_source_revision: "demo-v1",
  saved_at: null,
  completed_at: null,
  consumed_food_ids: [],
  completed_skipped_ingredients: [],
  consumed_allocations: [],
  planner_version: "demo-fixture-v1",
  source: "local_fixture",
  reason: "식품 목록에 있는 재료를 활용한 메뉴예요.",
  safety_note: "냄새나 색이 평소와 다르면 먹지 말고 버려 주세요.",
} satisfies Partial<ApiMealPlan>;

const SEED_STEP_DETAILS: NonNullable<ApiMealPlan["step_details"]> = [
  { stage: "손질", heat: null, minutes: null, text: "닭가슴살은 한입 크기로 썰고, 두부는 물기를 닦아 깍둑 썰어 주세요. 시금치는 밑동을 자르고 씻어 둡니다." },
  { stage: "굽기", heat: "중불", minutes: 6, text: "기름을 두른 팬에 닭가슴살을 볶다가 겉이 하얗게 익으면 두부를 넣고 노릇하게 구워 주세요." },
  { stage: "볶기", heat: "중불", minutes: 2, text: "간장 1큰술과 물 2큰술을 넣고, 시금치를 넣어 숨이 죽을 때까지만 볶아 주세요." },
  { stage: "담기", heat: null, minutes: null, text: "따뜻한 밥 위에 올려 바로 드세요." },
];

type DemoRecipeSpec = {
  id: string;
  title: string;
  minutes: number;
  uses: string[];
  buy?: Array<{ name: string; amount: number; unit: string }>;
  pantry: NonNullable<ApiMealPlan["pantry_items"]>;
  steps: NonNullable<ApiMealPlan["step_details"]>;
};

/** Extra example menus for the demo carousel; each appears only when its foods are in the list. */
const DEMO_RECIPES: DemoRecipeSpec[] = [
  {
    id: "demo-mushroom-chicken-bowl",
    title: "닭가슴살 버섯 간장덮밥",
    minutes: 15,
    uses: ["닭가슴살", "버섯"],
    pantry: [{ name: "간장", amount: 1, unit: "큰술" }, { name: "설탕", amount: 0.5, unit: "큰술" }, { name: "밥", amount: 1, unit: "공기" }],
    steps: [
      { stage: "손질", heat: null, minutes: null, text: "닭가슴살은 한입 크기로 썰고 버섯은 밑동을 떼어 가닥가닥 찢어 주세요." },
      { stage: "볶기", heat: "중불", minutes: 6, text: "기름을 두른 팬에 닭가슴살을 볶다가 겉이 하얗게 익으면 버섯을 넣어 주세요." },
      { stage: "졸이기", heat: "약불", minutes: 2, text: "간장 1큰술, 설탕 반 큰술, 물 3큰술을 넣고 국물이 자작해질 때까지 졸여 주세요." },
      { stage: "담기", heat: null, minutes: null, text: "밥 위에 올려 주세요." },
    ],
  },
  {
    id: "demo-mushroom-tofu-stew",
    title: "버섯 두부 된장찌개",
    minutes: 20,
    uses: ["버섯", "두부"],
    buy: [{ name: "애호박", amount: 0.5, unit: "개" }],
    pantry: [{ name: "된장", amount: 1, unit: "큰술" }, { name: "다진 마늘", amount: 0.5, unit: "큰술", optional: true }],
    steps: [
      { stage: "손질", heat: null, minutes: null, text: "두부와 애호박은 한입 크기로 썰고, 버섯은 가닥가닥 찢어 주세요." },
      { stage: "끓이기", heat: "중불", minutes: 5, text: "냄비에 물 400ml를 붓고 된장 1큰술을 풀어 끓여 주세요." },
      { stage: "끓이기", heat: "중불", minutes: 7, text: "버섯과 애호박을 넣고 5분 끓인 뒤 두부를 넣어 2분 더 끓여 주세요." },
      { stage: "간 보기", heat: null, minutes: null, text: "싱거우면 된장을 조금 더 풀어 주세요." },
    ],
  },
  {
    id: "demo-tomato-mushroom-pasta",
    title: "방울토마토 버섯 파스타",
    minutes: 20,
    uses: ["토마토", "버섯"],
    buy: [{ name: "파스타면", amount: 100, unit: "g" }],
    pantry: [{ name: "올리브유", amount: 2, unit: "큰술" }, { name: "소금", amount: null, unit: "약간" }],
    steps: [
      { stage: "삶기", heat: "센불", minutes: 9, text: "끓는 물에 소금을 조금 넣고 파스타면을 9분 삶아 주세요. 면수 3큰술은 남겨 둡니다." },
      { stage: "볶기", heat: "중불", minutes: 3, text: "팬에 올리브유를 두르고 버섯을 볶다가, 반으로 자른 방울토마토를 넣어 주세요." },
      { stage: "버무리기", heat: "약불", minutes: 1, text: "삶은 면과 면수를 넣고 1분 섞은 뒤 소금으로 간해 주세요." },
    ],
  },
];

function createDemoVariant(spec: DemoRecipeSpec, foods: MealFood[], maxMinutes: number, servings: number, dateReviewFoods: DemoDateReviewFood[]): ApiMealPlan | null {
  if (spec.minutes > maxMinutes) return null;
  const picked = spec.uses.map((key) => foods.find((food) => food.name.includes(key)));
  if (picked.some((food) => !food)) return null;
  const ingredients = [
    ...picked.map((food) => demoIngredientFor(foods, food as MealFood, servings)),
    ...(spec.buy ?? []).map((item) => demoMissingIngredient(item.name, multiplyQuantity(item.amount, servings), item.unit)),
  ];
  const fields = demoPlanFields(ingredients);
  return {
    ...DEMO_RECIPE_BASE,
    ...demoDateReviewFields(dateReviewFoods.filter((food) => fields.inventory_ids.includes(food.id))),
    ...fields,
    id: `demo-meal-plan-${spec.id}-${servings}`,
    snapshot_hash: `demo-fixture-${spec.id}-${servings}`,
    recipe_id: spec.id,
    title: spec.title,
    minutes: spec.minutes,
    max_minutes: maxMinutes,
    servings,
    ingredients,
    steps: spec.steps.map((step) => step.text),
    step_details: spec.steps,
    pantry_items: spec.pantry.map((item) => ({ ...item, amount: item.amount === null || item.unit === "공기" ? item.amount === null ? null : multiplyQuantity(item.amount, servings) : item.amount })),
  };
}

/** The demo carousel: the seed menu first, then the example menus, anchored ones ahead. */
function createDemoMenu(primary: ApiMealPlan, foods: MealFood[], maxMinutes: number, servings: number, dateReviewFoods: DemoDateReviewFood[], anchorFoodId: string | null): ApiMealPlan[] {
  if (primary.recipe_id === "no-match") return [];
  const variants = DEMO_RECIPES.flatMap((spec) => {
    const variant = createDemoVariant(spec, foods, maxMinutes, servings, dateReviewFoods);
    return variant ? [variant] : [];
  });
  const usesAnchor = (plan: ApiMealPlan) => Boolean(anchorFoodId && plan.inventory_ids.includes(anchorFoodId));
  return [primary, ...variants.filter(usesAnchor), ...variants.filter((plan) => !usesAnchor(plan))];
}

function createDemoMultiDay(menu: ApiMealPlan[], maxMinutes: number, servings: number): ApiMultiDayMealPlan | null {
  if (!menu.length) return null;
  const today = new Date();
  const days = menu.slice(0, 3).map((plan, index) => ({
    day_index: index + 1,
    plan_date: demoCalendarDate(today, index),
    plan,
    status: "planned" as const,
    meal_plan_id: null,
    completed_at: null,
  }));
  return {
    id: `demo-multi-day-${maxMinutes}-${servings}`,
    snapshot_hash: `demo-multi-day-${maxMinutes}-${servings}`,
    generated_at: new Date().toISOString(),
    saved_at: null,
    servings,
    max_minutes: maxMinutes,
    inventory_ids: [...new Set(days.flatMap((day) => day.plan.inventory_ids))],
    days,
  };
}

function createDemoPlan(foods: MealFood[], maxMinutes = 30, servings = 1, dateReviewFoods: DemoDateReviewFood[] = []): ApiMealPlan {
  const dateReviewFields = demoDateReviewFields(dateReviewFoods);

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
      recovery: { kind: "time", minimum_minutes: 15 },
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
  // In the portfolio demo a just-saved receipt goes first in the list but has no date yet;
  // the recipe should still lead with the foods the home screen asks to use first.
  const ingredientCandidates = import.meta.env.VITE_PORTFOLIO_DEMO === "1"
    ? [...foods].sort((left, right) => Number(left.dateKind === "unknown") - Number(right.dateKind === "unknown"))
    : foods;
  for (const food of ingredientCandidates) {
    const normalizedName = normalizedFoodName(food.name);
    if (!normalizedName || seenIngredientNames.has(normalizedName)) continue;
    seenIngredientNames.add(normalizedName);
    demoIngredientFoods.push(food);
    if (demoIngredientFoods.length === 3) break;
  }

  const demoIngredients = demoIngredientFoods.map((food) => demoIngredientFor(foods, food, servings));
  if (import.meta.env.VITE_PORTFOLIO_DEMO === "1" && !foods.some((food) => food.name === PORTFOLIO_MISSING_INGREDIENT.canonicalName)) {
    demoIngredients.push(demoMissingIngredient(PORTFOLIO_MISSING_INGREDIENT.canonicalName, PORTFOLIO_MISSING_INGREDIENT.amountPerServing * servings, PORTFOLIO_MISSING_INGREDIENT.unit));
  }
  const isSeedRecipe = demoIngredientFoods.some((food) => food.name.includes("시금치")) && demoIngredientFoods.some((food) => food.name.includes("두부")) && demoIngredientFoods.some((food) => food.name.includes("닭"));
  return {
    ...DEMO_RECIPE_BASE,
    ...dateReviewFields,
    ...demoPlanFields(demoIngredients),
    id: "demo-meal-plan",
    snapshot_hash: "demo-fixture-v1",
    recipe_id: "demo-rescue-recipe",
    title: isSeedRecipe ? "시금치 두부 닭가슴살 덮밥" : "냉장고 재료 볶음",
    minutes: 15,
    max_minutes: maxMinutes,
    servings,
    ingredients: demoIngredients,
    steps: isSeedRecipe ? SEED_STEP_DETAILS.map((step) => step.text) : ["재료를 꺼내 포장지 날짜와 상태를 살펴보세요.", "단단한 재료부터 팬에 볶아 주세요.", "마지막에 잎채소를 넣고 익으면 바로 드세요."],
    ...(isSeedRecipe ? { step_details: SEED_STEP_DETAILS, pantry_items: [{ name: "간장", amount: 1, unit: "큰술" }, { name: "식용유", amount: 1, unit: "큰술" }, { name: "밥", amount: servings, unit: "공기" }] } : {}),
  };
}

export default function MealPlanSheet({ foods, presentation = "sheet", active = false, returningFromRelatedFlow = false, parentRestoresFocus = false, plannerContextKey = "", onOpenChange, initialMaxMinutes = 30, initialServings = 1, dateReviewFoods = [], onSaved, onCompleted, onOpenFoodDetail, onOpenAdd, onOpenSyncReview, onOpenShoppingList, onAddDemoShoppingItems, onOptionsChange, onAuthenticationRequired, onOpenAccount, workspaceSync, workspaceTransport, anchorFood = null, onClearAnchor, referenceDate }: {
  foods: MealFood[];
  /** Today for the urgency badges on menu cards (the same date Home uses). */
  referenceDate?: Date;
  /** 요리 from a rescue card: rank menus that use this food first until the person clears it. */
  anchorFood?: { id: string; name: string } | null;
  onClearAnchor?: () => void;
  /** "screen" renders the same planner inside the 식단 tab's MobileScroll instead of a BottomSheet. */
  presentation?: "sheet" | "screen";
  active?: boolean;
  returningFromRelatedFlow?: boolean;
  parentRestoresFocus?: boolean;
  plannerContextKey?: string;
  onOpenChange: (open: boolean) => void;
  initialMaxMinutes?: number;
  initialServings?: number;
  dateReviewFoods?: DemoDateReviewFood[];
  onSaved: (kind?: "single" | "multi-day", hasMissingIngredients?: boolean, addMissingIngredients?: () => void | Promise<void>) => void;
  onCompleted?: (foodIds: string[], skippedCount: number, consumedAllocations: Array<{ food_id: string; quantity: number }>, grocySyncStatus?: ApiGrocySyncStatus) => void;
  onOpenFoodDetail?: (foodId: string, intent?: "quantity-review") => void;
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
  const [consumptionInputDraft, setConsumptionInputDraft] = useState<Record<string, string>>({});
  const consumptionMemoryRef = useRef<MealConsumptionMemory | null>(null);
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
  const [stockChecking, setStockChecking] = useState(false);
  const [stockCheckRecoveryPlanId, setStockCheckRecoveryPlanId] = useState<string | null>(null);
  const stockCheckTicketRef = useRef(0);
  const stockRefreshInputSignatureRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveRetryPayload, setSaveRetryPayload] = useState<MealPlanSavePayload | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completionRetry, setCompletionRetry] = useState(false);
  const [completionRetryPayload, setCompletionRetryPayload] = useState<MealPlanConsumption[] | null>(null);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [cookingPage, setCookingPage] = useState<CookingPage>(0);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const cookingReturnRef = useRef<HTMLElement | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [shoppingAddedCount, setShoppingAddedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [authenticationExpired, setAuthenticationExpired] = useState(false);
  const [latestPlanReadbackNotice, setLatestPlanReadbackNotice] = useState("");
  const [alternatives, setAlternatives] = useState<ApiMealPlan[]>([]);
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
  const [shoppingMutating, setShoppingMutating] = useState(false);
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
  const mealTimePickerRef = useRef<HTMLDivElement | null>(null);
  const multiDayToggleRef = useRef<HTMLButtonElement | null>(null);
  const safetySummaryRef = useRef<HTMLElement | null>(null);
  const mealPreferencesSectionRef = useRef<HTMLElement | null>(null);
  const authenticationExpiryHandledRef = useRef(false);
  const authenticationRecoveryActionRef = useRef<HTMLButtonElement | null>(null);
  const revealMealPreferencesRef = useRef(false);
  const revealCompletionRef = useRef(false);
  const revealCompletionFocusRef = useRef(false);
  const multiDaySaveFocusRef = useRef(false);
  const initialFocusHandledRef = useRef(false);
  const anchorStock = anchorFood ? foods.find((food) => food.id === anchorFood.id) ?? null : null;
  const anchorFoodId = anchorStock?.id ?? null;
  // The anchor leads the ingredient list so both the API planner and the demo recipe start from it.
  const ingredients = (anchorStock ? [anchorStock, ...foods.filter((food) => food.id !== anchorStock.id)] : foods).slice(0, 20);
  const [anchorMatch, setAnchorMatch] = useState<boolean | null>(null);
  const ingredientKey = ingredients.map((food) => food.id).join("|");
  const dateReviewKey = dateReviewFoods.map((food) => `${food.id}:${food.name}`).join("|");
  // The menu carousel is fetched once per planner input; picking a card never refetches it.
  const menuOptionsKey = JSON.stringify([workspaceSync.currentWorkspaceKey, plannerContextKey, anchorFoodId, ingredientKey, maxMinutes, servings, mealPreferencesVersion, mealPlanRefreshNonce]);
  const menuOptionsKeyRef = useRef<string | null>(null);
  const planLoadedKeyRef = useRef<string | null>(null);
  const [menuOptionsPending, setMenuOptionsPending] = useState(false);
  const plannerReadScopeRef = useRef({ key: "", generation: 0 });
  const plannerReadKey = JSON.stringify([active, returningFromRelatedFlow, plannerContextKey, anchorFoodId, ingredientKey, dateReviewKey, maxMinutes, servings, mealPreferencesVersion, plan?.id]);
  if (plannerReadScopeRef.current.key !== plannerReadKey) {
    plannerReadScopeRef.current = { key: plannerReadKey, generation: plannerReadScopeRef.current.generation + 1 };
  }
  const capturePlannerMutationScope = () => {
    const workspace = workspaceSync.captureScope();
    const session = mealApi.captureSession();
    return () => workspace() && session();
  };
  const capturePlannerReadScope = () => {
    const mutation = capturePlannerMutationScope();
    const generation = plannerReadScopeRef.current.generation;
    return () => active && mutation() && generation === plannerReadScopeRef.current.generation;
  };
  plannerBusyRef.current = loading || saving || completing || stockChecking || multiDayLoading || multiDaySaving || historyLoading || auditLoading || alternativesLoading || shoppingMutating || mealPreferencesLoading || mealPreferencesSaving;

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
      stockCheckTicketRef.current += 1;
      stockRefreshInputSignatureRef.current = null;
      setStockChecking(false);
      setStockCheckRecoveryPlanId(null);
      setHistoryLoading(false);
      setAuditLoading(false);
      setMultiDayHistoryLoading(false);
      setAlternativesLoading(false);
      setMultiDayLoading(false);
      setCookingOpen(false);
      if (!returningFromRelatedFlow) mealPreferencesSessionRef.current.active = false;
      authenticationExpiryHandledRef.current = false;
      setAuthenticationExpired(false);
      return;
    }
    const currentWorkspaceKey = workspaceSync.currentWorkspaceKey;
    const currentInputSignature = JSON.stringify({
      workspaceKey: currentWorkspaceKey,
      plannerContextKey,
      anchorFoodId,
      ingredients: ingredients.map(({ id, name, quantity, quantityReference }) => [id, name, quantity, quantityReference]),
      dateReviewFoods: dateReviewFoods.map(({ id, name }) => [id, name]),
      maxMinutes,
      servings,
    });
    if (stockRefreshInputSignatureRef.current === currentInputSignature) {
      stockRefreshInputSignatureRef.current = null;
      mealPreferencesSessionRef.current = { active: true, workspaceKey: currentWorkspaceKey, inputSignature: currentInputSignature };
      return;
    }
    stockRefreshInputSignatureRef.current = null;
    const priorSession = mealPreferencesSessionRef.current;
    const startingPlannerSession = !priorSession.active;
    const changingWorkspace = mealPreferencesSessionRef.current.workspaceKey !== null
      && mealPreferencesSessionRef.current.workspaceKey !== currentWorkspaceKey;
    const preservingPlannerView = returningFromRelatedFlow
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
        setSaving(false);
        setCompleting(false);
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
      consumptionMemoryRef.current = null;
      setSaved(false);
      setCompleted(false);
      setCompletionGrocySyncStatus(undefined);
      setSafetyAcknowledged(false);
      setSkippedCount(0);
      setAuditEvents([]);
      setAuditOpen(false);
      setAuditError("");
      setAuditLoading(false);
      setHistoryLoading(false);
      setHistoryPlans([]);
      setHistoryOpen(false);
      setHistoryError("");
      setCookingOpen(false);
      setCookingPage(0);
      setSaveRetryPayload(null);
      setCompletionRetry(false);
      setCompletionRetryPayload(null);
      setAlternatives([]);
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
      setShoppingAddedCount(null);
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
      setAnchorMatch(anchorFoodId ? demoPlan.ingredients.some((ingredient) => ingredient.allocations?.some((allocation) => allocation.food_id === anchorFoodId)) : null);
      setPlan(demoPlan);
      setAlternatives(createDemoMenu(demoPlan, ingredients, maxMinutes, servings, dateReviewFoods, anchorFoodId));
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
    let anchoredMatch: boolean | null = null;
    let anchoredOptions: ApiMealPlan[] | null = null;
    // Anchored planning asks the options endpoint for menus that use the anchor first and
    // falls back to the ordinary preview when nothing could be planned at all.
    const loadAnchoredPlan = async (ids: string[], signal: AbortSignal) => {
      const options = await mealApi.previewMealPlan<ApiMealPlanOptions>(ids, maxMinutes, "/api/meal-plans/options", servings, signal, undefined, anchorFoodId);
      const anchored = options?.options.find((option) => options.anchor_option_recipe_ids?.includes(option.recipe_id)) ?? null;
      anchoredMatch = Boolean(anchored);
      if (options?.options.length) {
        const anchorIds = new Set(options.anchor_option_recipe_ids ?? []);
        anchoredOptions = [...options.options.filter((option) => anchorIds.has(option.recipe_id)), ...options.options.filter((option) => !anchorIds.has(option.recipe_id))];
      }
      return anchored ?? options?.options[0] ?? await mealApi.previewMealPlan(ids, maxMinutes, "/api/meal-plans/preview", servings, signal);
    };
    void workspaceSync.run("meal-plan", async (signal) => {
      const [preferences, response, latest, revision] = await Promise.all([
        settleMealPlanRequest(mealApi.getMealPreferences(signal)),
        settleMealPlanRequest(anchorFoodId ? loadAnchoredPlan(inventoryIds, signal) : mealApi.previewMealPlan(inventoryIds, maxMinutes, "/api/meal-plans/preview", servings, signal)),
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
        setAnchorMatch(anchorFoodId ? anchoredMatch : null);
        planLoadedKeyRef.current = menuOptionsKey;
        setPlan(resolvedPlan);
        if (anchoredOptions) {
          menuOptionsKeyRef.current = menuOptionsKey;
          setAlternatives(anchoredOptions);
        }
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
  }, [active, returningFromRelatedFlow, plannerContextKey, anchorFoodId, dateReviewKey, ingredientKey, maxMinutes, servings, mealPreferencesVersion, mealPlanRefreshNonce, workspaceSync]);

  // The sheet has no Radix trigger, so focus goes back to 요리 시작 / 이미 만들었어요 once it has left.
  useEffect(() => {
    if (cookingOpen) return;
    const target = cookingReturnRef.current;
    cookingReturnRef.current = null;
    if (!target) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (document.querySelector(".cook-mode") && attempts < 40) return;
      window.clearInterval(timer);
      const current = document.activeElement;
      const focusIsLost = !current || current === document.body || !current.isConnected;
      if (focusIsLost && target.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
    }, 50);
    return () => window.clearInterval(timer);
  }, [cookingOpen]);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      // Back online after a failed read: look for the menu again instead of waiting for a tap.
      if (active && mealApi.isConfigured && error && !loading) {
        setError("");
        setMealPlanRefreshNonce((current) => current + 1);
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [active, error, loading]);

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
    if (!revealCompletionFocusRef.current) return;
    revealCompletionFocusRef.current = false;
    // On the screen 요리 시작 takes focus, since 저장됨 is no longer actionable; 요리 모드 handles its own focus.
    if (cookingOpen) return;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => recipeViewActionRef.current?.focus({ preventScroll: true })));
    return () => window.cancelAnimationFrame(frame);
  }, [active, completed, cookingOpen, saved]);

  // The amount check announces itself: its heading takes focus once the rows are ready.
  useEffect(() => {
    if (!cookingOpen || cookingPage !== "confirm" || !saved) return;
    let inner = 0;
    const frame = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".cook-confirm-title")?.focus());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(inner);
    };
  }, [cookingOpen, cookingPage, saved]);

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
      const target = document.querySelector<HTMLElement>(".recipe-multi-day-save .meal-multi-day-shopping:not([disabled])");
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
    const isCurrent = capturePlannerMutationScope();
    if (!isCurrent()) return;
    if (mealPreferencesSaving || mealPreferencesLoading || !mealPreferencesLoaded) return;
    setMealPreferencesError("");
    setMealPreferencesRetry(false);
    setMealPreferencesNotice("");
    setMealPreferencesSaving(true);
    try {
      const response = await mealApi.updateMealPreferences({ avoid_allergens: mealPreferencesDraft });
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      setMealPreferencesError(isMealApiMealPreferencesPersistenceError(reason)
        ? "식단 조건을 저장하지 못했어요. 기존 조건을 유지했어요."
        : presentMealPlanError(reason, "식단 조건을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setMealPreferencesRetry(!isMealApiWorkspaceConflictError(reason));
    } finally {
      if (isCurrent()) setMealPreferencesSaving(false);
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
    const isCurrent = capturePlannerMutationScope();
    if (!isCurrent()) return;
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
      onSaved("single", plan.missing_ingredients.length > 0, () => { if (isCurrent()) void addShoppingSource("meal_plan", plan.id); });
      return plan;
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
      if (!isCurrent()) return;
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
      onSaved("single", response.missing_ingredients.length > 0, () => { if (isCurrent()) void addShoppingSource("meal_plan", response.id); });
      if (isRetry) window.requestAnimationFrame(() => window.requestAnimationFrame(() => recipeViewActionRef.current?.focus({ preventScroll: true })));
      return response;
    } catch (reason) {
      if (!isCurrent()) return;
      const persistenceFailure = isMealApiMealPlanPersistenceError(reason);
      setError(persistenceFailure
        ? "식단을 저장하지 못했어요. 기존 식단은 그대로예요."
        : presentMealPlanError(reason, "식단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setSaveRetryPayload(persistenceFailure ? payload : null);
    } finally {
      if (isCurrent()) setSaving(false);
    }
  };

  const hasRecipe = Boolean(plan && plan.recipe_id !== "no-match");

  // The menu rail fills itself once the plan for the current conditions has arrived. It uses its own
  // request instead of the shared "meal-plan" channel so it never cancels a plan read or a save.
  useEffect(() => {
    if (!active || loading || !hasRecipe || !mealApi.isConfigured) return;
    if (planLoadedKeyRef.current !== menuOptionsKey || menuOptionsKeyRef.current === menuOptionsKey) return;
    menuOptionsKeyRef.current = menuOptionsKey;
    const isCurrent = capturePlannerReadScope();
    const workspaceKey = workspaceSync.currentWorkspaceKey;
    const controller = new AbortController();
    let settled = false;
    setAlternatives([]);
    setAlternativesError("");
    setMenuOptionsPending(true);
    mealApi.previewMealPlan<ApiMealPlanOptions>(ingredients.map((food) => food.id), maxMinutes, "/api/meal-plans/options", servings, controller.signal)
      .then((response) => {
        if (controller.signal.aborted || !isCurrent() || workspaceSync.currentWorkspaceKey !== workspaceKey) return;
        if (!response) throw new Error("meal-plan-options-missing");
        setAlternatives(response.options);
      })
      .catch((reason) => {
        if (controller.signal.aborted || !isCurrent()) return;
        setAlternativesError(presentMealPlanError(reason, "다른 메뉴를 불러오지 못했어요. 지금 메뉴로는 그대로 요리할 수 있어요."));
      })
      .finally(() => {
        settled = true;
        if (!controller.signal.aborted) setMenuOptionsPending(false);
      });
    return () => {
      if (settled) return;
      controller.abort();
      setMenuOptionsPending(false);
      if (menuOptionsKeyRef.current === menuOptionsKey) menuOptionsKeyRef.current = null;
    };
  }, [active, hasRecipe, loading, menuOptionsKey]);
  const nextMealTime = mealRecoveryMinutes(plan, maxMinutes, MEAL_TIME_OPTIONS);
  const displayedMealTimes = [...new Set<number>([...MEAL_TIME_OPTIONS, maxMinutes])].sort((left, right) => left - right);
  const canAdjustNoMatch = Boolean(ingredients.length && plan?.recipe_id === "no-match");
  const noMatchAllergens = plan?.recovery?.kind === "allergens" || plan?.preference_filtered === true;
  const quantityRecoveryFoods = plan?.recovery?.kind === "quantity" && onOpenFoodDetail
    ? (plan.recovery.food_ids ?? []).flatMap((id) => { const food = foods.find((item) => item.id === id); return food ? [food] : []; })
    : [];
  const quantityRecoveryUnits = [...new Set(quantityRecoveryFoods.map(quantityReferenceUnit))];
  const packageQuantityRecovery = quantityRecoveryUnits.length > 0 && quantityRecoveryUnits.every((unit) => unit !== null);
  const quantityRecoveryTitle = packageQuantityRecovery
    ? `${quantityRecoveryUnits.map((unit) => `1${unit}`).join(" 또는 ")}의 양이 필요해요`
    : null;
  const genericNoMatchReason = !hasRecipe && (plan?.reason === "조리 시간을 늘리거나 재료를 더 추가해 다시 찾아보세요." || plan?.recovery?.kind === "ingredients" || plan?.recovery?.kind === "empty");
  const planIngredients = plan?.ingredients ?? [];
  const displayedServings = saved || completed ? plan?.servings ?? servings : servings;
  const availableRecipeIngredientCount = planIngredients.filter((ingredient) => ingredient.available).length;
  const missingRecipeIngredientCount = planIngredients.length - availableRecipeIngredientCount;
  const consumptionRows = plan ? consumptionRowsForPlan(plan, foods) : [];
  const consumptionContextKey = JSON.stringify([workspaceSync.currentWorkspaceKey, plannerContextKey, plan?.id, plan?.recipe_id, plan?.snapshot_hash, plan?.bundle_id, plan?.bundle_day_index]);

  useEffect(() => {
    consumptionMemoryRef.current = null;
    setConsumptionInputDraft({});
  }, [consumptionContextKey]);
  const consumptionSelection = consumptionRows.map((row) => ({ row, quantity: consumptionDraft[row.foodId] ?? row.defaultQuantity }));
  const consumptionInputErrors = consumptionRows.filter((row) => validateMealConsumptionDraft(consumptionInputDraft[row.foodId] ?? quantityDraftValue(consumptionDraft[row.foodId] ?? row.defaultQuantity), row.maxQuantity).error !== null);
  const consumptionUsedRows = consumptionSelection.filter(({ quantity }) => quantity > 0).length;
  const consumptionSkippedRows = consumptionSelection.filter(({ quantity }) => quantity <= 0).length;
  const consumptionPartialRows = consumptionSelection.filter(({ row, quantity }) => quantity > 0 && quantity < row.maxQuantity).length;
  const consumptionSelectionNote = !consumptionRows.length
    ? "사용할 재료를 살펴봐 주세요."
    : !consumptionUsedRows
      ? "사용할 재료를 하나 이상 골라 주세요. 선택하지 않은 재료는 그대로 남아요."
    : consumptionSkippedRows || consumptionPartialRows
      ? `기록할 재료 ${consumptionUsedRows}가지${consumptionPartialRows ? ` · 일부 사용 ${consumptionPartialRows}가지` : ""}${consumptionSkippedRows ? ` · 기록 제외 ${consumptionSkippedRows}가지` : ""}`
      : "";
  const allergenMetadataUnknown = Boolean(hasRecipe && plan?.allergen_metadata_status !== "known");
  const requiresSafetyAcknowledgement = Boolean(hasRecipe && (plan?.date_review_required || allergenMetadataUnknown));
  const safetyNoticeCount = completed ? 0 : [
    plan?.date_review_required,
    plan?.preference_filtered,
    allergenMetadataUnknown,
  ].filter(Boolean).length;
  const canAddMissingIngredientsToShopping = Boolean(mealApi.isConfigured || onAddDemoShoppingItems);

  const cookingSteps: CookingStep[] = plan?.step_details?.length ? plan.step_details : (plan?.steps ?? []).map((text) => ({ text }));

  /** 요리 시작 opens step 1; 이미 만들었어요 opens the amount check. A plan is saved on the way, never as a separate chore. */
  const openCooking = (page: CookingPage, trigger?: HTMLElement) => {
    if (!plan || !hasRecipe || completed) return;
    keyboard.hide();
    cookingReturnRef.current = trigger ?? null;
    const nextPage = page === "confirm" || !cookingSteps.length ? "confirm" : page;
    setCookingPage(nextPage);
    setCookingOpen(true);
    if (nextPage === "confirm" && !saved) void persistPlan();
  };

  const finishCooking = () => {
    setCookingPage("confirm");
    if (!saved) void persistPlan();
  };

  const revealCompletionControls = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollTargetWithinNearestContainer(completionActionsRef.current, "end", "auto");
      });
    });
  };

  useEffect(() => {
    if (!active) {
      initialFocusHandledRef.current = false;
      return;
    }
    if (loading || initialFocusHandledRef.current) return;
    // Returning from a food detail: the parent restores the exact link the user left from.
    if (parentRestoresFocus) {
      initialFocusHandledRef.current = true;
      return;
    }
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
    const findTarget = () => recipeViewActionRef.current ?? document.querySelector<HTMLElement>(".meal-plan .recipe-no-match-actions .meal-primary-button, .meal-plan .recipe-no-match-actions .meal-quiet-button, .meal-plan .meal-empty .meal-primary-button");
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
        // A tab screen opens at its top (menu first); only the sheet presentation scrolls to the action.
        if (presentation !== "screen") scrollTargetWithinNearestContainer(currentTarget, "nearest", "auto");
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
  }, [active, loading]);

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
    const isCurrent = capturePlannerReadScope();
    if (!isCurrent()) return;
    if (!hasRecipe || alternativesLoading || (!retry && alternatives.length)) return;
    setAlternativesError("");
    setAlternativesLoading(true);
    let requestCurrent = true;
    try {
      if (!mealApi.isConfigured) throw new Error("meal-plan-options-unavailable");
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.previewMealPlan<ApiMealPlanOptions>(ingredients.map((food) => food.id), maxMinutes, "/api/meal-plans/options", servings, signal));
      requestCurrent = result.current;
      if (!result.current || !isCurrent()) return;
      if (result.error) throw result.error;
      const response = result.value;
      if (!response) throw new Error("meal-plan-options-missing");
      setAlternatives(response.options);
    } catch (reason) {
      if (!isCurrent()) return;
      setAlternativesError(presentMealPlanError(reason, "다른 메뉴를 불러오지 못했어요. 지금 메뉴로는 그대로 요리할 수 있어요."));
    } finally {
      if (requestCurrent && isCurrent()) setAlternativesLoading(false);
    }
  };

  const loadMultiDayPreview = async (retry = false) => {
    const isCurrent = capturePlannerReadScope();
    if (!isCurrent()) return;
    if (!hasRecipe || multiDayLoading) return;
    setMultiDayOpen(true);
    if (multiDayPreview && !retry) return;
    setMultiDayError("");
    setMultiDayLoading(true);
    let requestCurrent = true;
    try {
      if (!mealApi.isConfigured) {
        const demo = createDemoMultiDay(alternatives.length ? alternatives : plan ? [plan] : [], maxMinutes, servings);
        if (!demo) throw new Error("multi-day-preview-unavailable");
        setMultiDayPreview(demo);
        setMultiDaySaved(false);
        return;
      }
      const result = await workspaceSync.run("meal-plan", async (signal) => {
        const [response, latest] = await Promise.all([
          mealApi.previewMealPlan<ApiMultiDayMealPlan>(ingredients.map((food) => food.id), maxMinutes, "/api/meal-plans/multi-day-preview", servings, signal),
          settleMealPlanRequest(mealApi.getLatestMultiDayMealPlan(signal)),
        ]);
        return { response, latest };
      });
      requestCurrent = result.current;
      if (!result.current || !isCurrent()) return;
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
      if (!isCurrent()) return;
      setMultiDayError(presentMealPlanError(reason, "3일 식단을 만들지 못했어요. 잠시 후 다시 찾아봐 주세요."));
      setMultiDayOpen(true);
    } finally {
      if (requestCurrent && isCurrent()) setMultiDayLoading(false);
    }
  };

  const persistMultiDayPlan = async (retryPayload?: MultiDayPlanSavePayload) => {
    const isCurrent = capturePlannerMutationScope();
    if (!isCurrent()) return;
    if (!multiDayPreview?.days.length || multiDaySaving || multiDaySaved) return;
    const isRetry = Boolean(retryPayload);
    multiDaySaveFocusRef.current = !isRetry;
    setMultiDayError("");
    setMultiDaySaveRetryPayload(null);
    setMultiDaySaving(true);
    if (!mealApi.isConfigured) {
      setMultiDaySaved(true);
      setMultiDaySaving(false);
      onSaved("multi-day", multiDayPreview.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0), () => { if (isCurrent()) void addShoppingSource("multi_day", multiDayPreview.id); });
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
      if (!isCurrent()) return;
      if (!response) throw new Error("multi-day-save-missing");
      rememberCurrentWorkspaceRevision();
      setMultiDayPreview(response);
      setMultiDaySaved(true);
      setMultiDaySaveRetryPayload(null);
      onSaved("multi-day", response.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0), () => { if (isCurrent()) void addShoppingSource("multi_day", response.id); });
      if (isRetry) window.requestAnimationFrame(() => multiDayToggleRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      if (!isCurrent()) return;
      const persistenceFailure = isMealApiMultiDayPlanPersistenceError(reason);
      setMultiDayError(persistenceFailure
        ? "3일 식단을 저장하지 못했어요. 기존 식단은 그대로예요."
        : presentMealPlanError(reason, "3일 식단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setMultiDaySaveRetryPayload(persistenceFailure ? payload : null);
    } finally {
      if (isCurrent()) setMultiDaySaving(false);
    }
  };

  const toggleMultiDayHistory = async (retry = false) => {
    const isCurrent = capturePlannerReadScope();
    if (!isCurrent()) return;
    if (!plan || multiDayHistoryLoading) return;
    if (multiDayHistoryOpen && !retry) {
      setMultiDayHistoryOpen(false);
      return;
    }
    setMultiDayHistoryError("");
    setMultiDayHistoryOpen(true);
    setMultiDayHistoryLoading(true);
    let requestCurrent = true;
    try {
      if (!mealApi.isConfigured) throw new Error("multi-day-history-unavailable");
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMultiDayMealPlanHistory(10, signal));
      requestCurrent = result.current;
      if (!result.current || !isCurrent()) return;
      if (result.error) throw result.error;
      const history = result.value;
      if (!history) throw new Error("multi-day-history-missing");
      setMultiDayHistory(history);
    } catch (reason) {
      if (!isCurrent()) return;
      setMultiDayHistoryError(presentMealPlanError(reason, "저장한 3일 식단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (requestCurrent && isCurrent()) setMultiDayHistoryLoading(false);
    }
  };

  const openSavedMultiDayPlan = (bundle: ApiMultiDayMealPlan) => {
    setMultiDayPreview(bundle);
    setMultiDaySaved(Boolean(bundle.saved_at));
    setMultiDayError("");
    setMultiDayHistoryOpen(false);
    setMultiDayOpen(true);
    setHistoryOpen(false);
  };

  const addShoppingSource = async (sourceType: "meal_plan" | "multi_day", sourceId: string, retry = false) => {
    const isCurrent = capturePlannerMutationScope();
    if (!isCurrent()) return;
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
        await onAddDemoShoppingItems(sourceType, sourceId, entries);
        if (!isCurrent()) return;
        setShoppingError("");
        setShoppingRetryAction(null);
        setShoppingAddedCount(entries.length);
        onOpenShoppingList?.();
        return;
      }
      const response = await mealApi.addShoppingList(sourceType, sourceId);
      if (!isCurrent()) return;
      if (!response) throw new Error("shopping-list-add-missing");
      rememberCurrentWorkspaceRevision();
      setShoppingRetryAction(null);
      setShoppingAddedCount(response.added_count + response.updated_count);
      onOpenShoppingList?.();
    } catch (reason) {
      if (!isCurrent()) return;
      setShoppingError(isMealApiShoppingListPersistenceError(reason)
        ? "장보기 목록을 저장하지 못했어요. 기존 목록을 유지했어요."
        : presentMealPlanError(reason, "장보기 목록에 담지 못했어요. 현재 재료를 다시 확인해 주세요."));
      setShoppingRetryAction({
        label: isMealApiWorkspaceConflictError(reason) ? "식단 다시 불러오기" : "다시 담기",
        onRetry: () => { if (isCurrent()) { if (isMealApiWorkspaceConflictError(reason)) { setShoppingError(""); setMealPlanRefreshNonce((current) => current + 1); } else void addShoppingSource(sourceType, sourceId, true); } },
      });
    } finally {
      if (isCurrent()) setShoppingMutating(false);
    }
  };

  /** 장보기에 담기: a connected plan is saved first so the list can point back to it. */
  const addMissingToShopping = async () => {
    if (!plan || shoppingMutating || saving) return;
    const target = mealApi.isConfigured && !saved ? await persistPlan() : plan;
    if (!target) return;
    await addShoppingSource("meal_plan", target.id);
  };

  const selectAlternative = (nextPlan: ApiMealPlan, bundleId?: string, bundleDayIndex?: number, bundleDayStatus: ApiMultiDayMealPlan["days"][number]["status"] = "planned") => {
    const linkedPlan = bundleId && bundleDayIndex != null ? { ...nextPlan, bundle_id: bundleId, bundle_day_index: bundleDayIndex } : nextPlan;
    setStockCheckRecoveryPlanId(null);
    setPlan(linkedPlan);
    setConsumptionDraft(initialConsumptionDraft(linkedPlan, foods));
    consumptionMemoryRef.current = null;
    setSaved(bundleDayStatus === "saved" || bundleDayStatus === "completed");
    setCompleted(bundleDayStatus === "completed");
    setSafetyAcknowledged(false);
    setCompletionGrocySyncStatus(undefined);
    setCompletionRetry(false);
    setCompletionRetryPayload(null);
    setSaveRetryPayload(null);
    setError("");
    setSkippedCount(bundleDayStatus === "completed" ? (nextPlan.completed_skipped_ingredients ?? []).length : 0);
    setAuditEvents([]);
    setAuditOpen(false);
    setAuditLoading(false);
    setHistoryLoading(false);
    setAlternativesLoading(false);
    setMultiDayLoading(false);
    setMultiDayHistoryLoading(false);
    setAuditError("");
    setHistoryPlans([]);
    setHistoryOpen(false);
    setHistoryError("");
    setCookingOpen(false);
    setCookingPage(0);
    setShoppingAddedCount(null);
    setShoppingError("");
    setMultiDayOpen(false);
    setMultiDaySaved(false);
  };

  const recheckSavedStock = async () => {
    if (!plan || !saved || completed || stockChecking || completionRetry || authenticationExpired || !mealApi.isConfigured) return;
    keyboard.hide();
    const ticket = ++stockCheckTicketRef.current;
    const isCurrent = capturePlannerReadScope();
    const isCurrentWorkspace = capturePlannerMutationScope();
    const recipeId = plan.recipe_id;
    const nextServings = plan.servings ?? 1;
    const nextMinutes = Math.min(180, Math.max(plan.max_minutes, plan.minutes));
    setStockChecking(true);
    setStockCheckRecoveryPlanId(null);
    setError("");
    try {
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.previewMealPlan(ingredients.map((food) => food.id), nextMinutes, "/api/meal-plans/preview", nextServings, signal, recipeId));
      if (!result.current || !isCurrent() || ticket !== stockCheckTicketRef.current) return;
      if (result.error) throw result.error;
      const current = result.value;
      if (!current || current.recipe_id !== recipeId) throw new Error("saved-recipe-unavailable");
      if (servings !== nextServings || maxMinutes !== nextMinutes) {
        stockRefreshInputSignatureRef.current = JSON.stringify({
          workspaceKey: workspaceSync.currentWorkspaceKey, plannerContextKey,
          ingredients: ingredients.map(({ id, name, quantity, quantityReference }) => [id, name, quantity, quantityReference]),
          dateReviewFoods: dateReviewFoods.map(({ id, name }) => [id, name]),
          maxMinutes: nextMinutes, servings: nextServings,
        });
      }
      updateMaxMinutes(nextMinutes);
      updateServings(nextServings);
      selectAlternative(current);
      rememberCurrentWorkspaceRevision();
    } catch (reason) {
      if (isCurrent() && ticket === stockCheckTicketRef.current) {
        setStockCheckRecoveryPlanId(isMealApiAuthError(reason) ? null : plan.id);
        setError(presentMealPlanError(reason, "현재 조건에서 이 식단을 다시 확인하지 못했어요. 저장한 기록은 유지돼요."));
      }
    } finally {
      if (isCurrentWorkspace() && ticket === stockCheckTicketRef.current) setStockChecking(false);
    }
  };

  const updateConsumption = (row: ConsumptionRow, requestedQuantity?: number, keepInputDraft = false) => {
    if (!saved || completing || completed) return;
    if (!keepInputDraft) setConsumptionInputDraft((current) => { const next = { ...current }; delete next[row.foodId]; return next; });
    const selection = {
      contextKey: consumptionContextKey,
      foodId: row.foodId,
      currentQuantity: consumptionDraft[row.foodId] ?? row.defaultQuantity,
      maxQuantity: row.maxQuantity,
      memory: consumptionMemoryRef.current,
    };
    const next = requestedQuantity === undefined
      ? toggleMealConsumptionSelection(selection, row.defaultQuantity)
      : updateMealConsumptionSelection(selection, requestedQuantity);
    consumptionMemoryRef.current = next.memory;
    setConsumptionDraft((current) => ({ ...current, [row.foodId]: next.quantity }));
    if (completionRetry) {
      setCompletionRetry(false);
      setCompletionRetryPayload(null);
      setError("");
    }
  };

  const adjustConsumption = (row: ConsumptionRow, delta: number) => {
    updateConsumption(row, subtractQuantity(consumptionDraft[row.foodId] ?? row.defaultQuantity, -delta));
  };

  // ---- Presentation helpers for the 식단 screen (menu cards, ingredient groups, cooking) ----
  const today = referenceDate ?? new Date();
  const menuCards = plan && hasRecipe
    ? alternatives.some((option) => option.recipe_id === plan.recipe_id) ? alternatives.map((option) => option.recipe_id === plan.recipe_id ? plan : option) : [plan, ...alternatives]
    : [];
  const foodsForPlan = (option: ApiMealPlan) => {
    const ids = option.ingredients.flatMap((ingredient) => ingredient.allocations?.length ? ingredient.allocations.map((allocation) => allocation.food_id) : ingredient.available_food_id ? [ingredient.available_food_id] : []);
    return [...new Set(ids)].flatMap((id) => { const food = foods.find((item) => item.id === id); return food ? [food] : []; });
  };
  /** Foods in this menu whose date is past, today/tomorrow or within three days, most urgent first. */
  const urgentFoodsFor = (option: ApiMealPlan) => foodsForPlan(option)
    .flatMap((food) => {
      if (!food.dateKind || !food.dateDetail) return [];
      const freshnessFood = { dateKind: food.dateKind, dateDetail: food.dateDetail, dateAssertionKind: food.dateAssertionKind, priorityDate: food.priorityDate };
      const freshness = foodFreshness(freshnessFood, today);
      return freshness.bucket === "past" || freshness.bucket === "today" || freshness.bucket === "soon" ? [{ food, freshnessFood, daysLeft: freshness.daysLeft ?? 0 }] : [];
    })
    .sort((left, right) => left.daysLeft - right.daysLeft)
    .slice(0, 2);
  /** Photo order for a card: the anchor, then urgent foods, then what is in the fridge, then what to buy. */
  const photoNamesFor = (option: ApiMealPlan) => {
    const names = option.ingredients.filter((ingredient) => ingredient.available).map((ingredient) => ingredient.canonical_name);
    const urgent = urgentFoodsFor(option).map(({ food }) => food.name);
    const anchor = anchorStock && option.inventory_ids.includes(anchorStock.id) ? [anchorStock.name] : [];
    return [...anchor, ...urgent, ...names, ...option.ingredients.filter((ingredient) => !ingredient.available).map((ingredient) => ingredient.canonical_name)];
  };
  const haveIngredients = planIngredients.filter((ingredient) => ingredient.available);
  const buyIngredients = planIngredients.filter((ingredient) => !ingredient.available);
  const openConditions = (focusTime = false) => {
    keyboard.hide();
    setConditionsOpen(true);
    if (focusTime) window.requestAnimationFrame(() => revealAndFocus(mealTimePickerRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed='true']") ?? null, { block: "center" }));
  };

  const errorNotice = error ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{offline && mealApi.isConfigured && !saveRetryPayload && !completionRetry ? "인터넷에 연결되어 있지 않아 메뉴를 불러오지 못했어요. 연결되면 다시 찾아볼게요." : error}</span>{saveRetryPayload ? <button className="recipe-error-action" type="button" disabled={saving} aria-busy={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistPlan(saveRetryPayload)}>{saving ? "저장 중" : "다시 시도"}</button> : null}{completionRetry ? <button className="recipe-error-action" type="button" disabled={stockChecking || completing} aria-busy={completing} onPointerDown={(event) => event.preventDefault()} onClick={() => void completePlan(completionRetryPayload ?? undefined)}>{completing ? "기록 중" : "다시 시도"}</button> : null}{stockCheckRecoveryPlanId === plan?.id && saved && !completed ? <button className="recipe-error-action" type="button" disabled={stockChecking} aria-busy={stockChecking} onPointerDown={(event) => event.preventDefault()} onClick={() => void recheckSavedStock()}>{stockChecking ? "현재 재료 확인 중" : "다시 확인"}</button> : !saveRetryPayload && !completionRetry && !authenticationExpired ? <button className="recipe-error-action" type="button" disabled={loading} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { setError(""); setMealPlanRefreshNonce((current) => current + 1); }}>{loading ? "메뉴 찾는 중" : "메뉴 다시 찾기"}</button> : null}</div> : null;

  const ingredientRow = (ingredient: ApiMealPlan["ingredients"][number]) => <div className={`recipe-ingredient-row${completed || ingredient.available ? "" : " recipe-ingredient-missing"}`} role="listitem" key={ingredient.canonical_name}>
    <FoodPhoto src={imageForFoodName(ingredient.canonical_name)} foodName={ingredient.canonical_name} alt="" draggable={false} />
    <span className="recipe-ingredient-copy"><strong>{ingredient.canonical_name}</strong><small><Metadata parts={completed ? [`레시피 기준 ${formatIngredientQuantity(ingredient.amount)}${ingredient.unit}`] : ingredientStatus(ingredient)} /></small></span>
  </div>;

  const menuCard = (option: ApiMealPlan, solo: boolean) => {
    const selected = option.recipe_id === plan?.recipe_id;
    const urgent = urgentFoodsFor(option);
    const missing = option.missing_ingredients.length;
    const body = <>
      <MealDishArt title={option.title} ingredientNames={photoNamesFor(option)} />
      <span className="meal-card-body">
        <span className="meal-card-title">{option.title}</span>
        <span className="meal-card-facts"><span><TimerIcon width={13} height={13} aria-hidden="true" />{option.total_minutes ?? option.minutes}분</span><span>{missing ? `${missing}가지 사야 함` : "재료 다 있음"}</span></span>
        {urgent.length ? <span className="meal-card-urgent">{urgent.map(({ food, freshnessFood }) => <span className="meal-card-urgent-item" key={food.id}><FreshnessChip food={freshnessFood} referenceDate={today} /><span>{food.name}</span></span>)}</span> : null}
      </span>
    </>;
    if (solo) return <div className="meal-card" data-selected="true" key={option.recipe_id}>{body}</div>;
    return <button className="meal-card" type="button" key={option.recipe_id} aria-pressed={selected} disabled={saving || completing} onClick={() => { if (!selected) selectAlternative(option); }}>{body}</button>;
  };

  const consumptionControls = <div ref={completionActionsRef} className="recipe-complete-actions">
    <div className="recipe-consumption-heading"><span className="cook-confirm-title" tabIndex={-1}>사용한 양</span>{saved && consumptionSelectionNote ? <small role="status" aria-live="polite"><MetadataText text={consumptionSelectionNote} /></small> : null}</div>
    <p className="cook-confirm-note">기록한 만큼 보관 수량이 줄어요. 이번에 쓰지 않은 재료는 그대로 남아요.</p>
    {cookingOpen ? errorNotice : null}
    {!saved ? saving ? <p className="cook-confirm-preparing" role="status">식단을 저장하고 있어요</p> : null : <>
      <div className="recipe-consumption-list">{consumptionRows.map((row) => {
        const currentQuantity = consumptionDraft[row.foodId] ?? row.defaultQuantity;
        const inputValue = consumptionInputDraft[row.foodId] ?? quantityDraftValue(currentQuantity);
        const inputError = validateMealConsumptionDraft(inputValue, row.maxQuantity).error;
        const skipped = currentQuantity <= 0;
        return <div className={`recipe-consumption-row recipe-consumption-choice${skipped ? " recipe-consumption-choice-skipped" : ""}`} key={row.foodId}>
          <span className="recipe-consumption-choice-copy"><strong>{row.name}</strong><small id={`recipe-consumption-note-${row.foodId}`} role={inputError ? "alert" : undefined}>{inputError ?? (skipped ? "이번에는 기록하지 않아요" : `최대 ${formatQuantity(row.maxQuantity)}${row.unit}`)}</small></span>
          <div className="recipe-consumption-stepper">
            <button type="button" aria-label={`${row.name} 사용할 양 줄이기`} disabled={completing || currentQuantity <= 0} onPointerDown={(event) => event.preventDefault()} onClick={() => { adjustConsumption(row, -row.step); keyboard.hide(); }}><MinusIcon width={16} height={16} aria-hidden="true" /></button>
            <label className="recipe-consumption-input-wrap"><span className="sr-only">{row.name} 사용할 양</span><KeyboardInput className="recipe-consumption-input" type="text" inputMode="decimal" autoComplete="off" value={inputValue} aria-invalid={Boolean(inputError)} aria-describedby={`recipe-consumption-note-${row.foodId}`} aria-label={`${row.name} 사용할 양`} onFocus={revealCompletionControls} onChange={(event) => setConsumptionValue(row, event.target.value)} onBlur={() => keyboard.hide()} disabled={completing || row.maxQuantity <= 0} /><em>{row.unit}</em></label>
            <button type="button" aria-label={`${row.name} 사용할 양 늘리기`} disabled={completing || currentQuantity >= row.maxQuantity} onPointerDown={(event) => event.preventDefault()} onClick={() => { adjustConsumption(row, row.step); keyboard.hide(); }}><PlusIcon width={16} height={16} aria-hidden="true" /></button>
          </div>
          <button className="recipe-consumption-toggle meal-text-button" type="button" aria-label={`${row.name} ${skipped ? "다시 사용" : "이번엔 안 씀"}`} aria-pressed={skipped} disabled={completing || (row.maxQuantity <= 0 && currentQuantity <= 0)} onPointerDown={(event) => event.preventDefault()} onClick={() => { updateConsumption(row); keyboard.hide(); }}>{skipped ? "다시 사용" : "이번엔 안 씀"}</button>
        </div>;
      })}</div>
      {requiresSafetyAcknowledgement ? <div className="recipe-date-review-callout recipe-safety-summary-item meal-ack" role="group" aria-label="조리 전 기록 확인"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>먹기 전에 살펴봐 주세요</strong><small>포장지 날짜, 식품 상태, 알레르기 표시는 앱이 대신 판단할 수 없어요.</small><button className="recipe-shopping-inline-button" type="button" aria-pressed={safetyAcknowledged} onPointerDown={(event) => event.preventDefault()} onClick={() => { setSafetyAcknowledged((current) => !current); }}>{safetyAcknowledged ? <><CheckIcon width={15} height={15} aria-hidden="true" />살펴봤어요</> : "포장지와 재료를 살펴봤어요"}</button></span></div> : null}
      <button className="recipe-complete-button meal-primary-button" type="button" disabled={stockChecking || completing || consumptionInputErrors.length > 0 || !consumptionUsedRows || (requiresSafetyAcknowledgement && !safetyAcknowledged)} aria-busy={completing} onPointerDown={(event) => event.preventDefault()} onClick={() => { void completePlan(); keyboard.hide(); }}>{completing ? "기록 중" : consumptionInputErrors.length ? "사용한 양을 확인해 주세요" : !consumptionUsedRows ? "사용할 재료를 골라 주세요" : "조리 완료 기록"}</button>
    </>}
    {cookingSteps.length ? <button className="meal-text-button cook-review-steps" type="button" onClick={() => setCookingPage(cookingSteps.length - 1)}>조리 순서 다시 보기</button> : null}
  </div>;

  const safetySummary = safetyNoticeCount ? <section ref={safetySummaryRef} id="recipe-safety-summary" className="recipe-safety-summary" tabIndex={-1} aria-label={`조리 전에 살펴볼 내용 ${safetyNoticeCount}개`}>
    <div className="recipe-safety-summary-list">
      {plan?.date_review_required ? <div className="recipe-date-review-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>조리 전에 포장지 날짜를 살펴봐 주세요</strong>{plan.date_review_foods?.map((foodName, index) => { const foodId = plan.date_review_food_ids?.[index]; if (foodId && onOpenFoodDetail) return <button className="recipe-shopping-inline-button" type="button" data-meal-food-id={foodId} key={`${foodId}-${foodName}`} onClick={() => onOpenFoodDetail(foodId)}>{foodName} 보기</button>; return <small className="recipe-safety-targets" key={`${index}-${foodName}`}>{foodName}</small>; })}</span></div> : null}
      {plan?.preference_filtered ? <div className="recipe-preference-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>알레르기 조건을 확인해 주세요</strong><small>{mealPlanDisplayCopy(plan.preference_note ?? "피하도록 설정한 알레르기가 있거나 관련 정보를 확인할 수 없는 메뉴는 제외했어요.")}</small>{mealApi.isConfigured && !mealPreferencesOpen ? <button className="recipe-shopping-inline-button" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={openMealPreferencesFromSafety}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesSaving ? "식단 조건 저장 중" : "피할 알레르기 설정 열기"}</button> : null}</span></div> : null}
      {allergenMetadataUnknown ? <div className="recipe-allergen-callout recipe-safety-summary-item" role="status"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>재료 일부의 알레르기 정보를 확인할 수 없어요</strong><small>먹기 전 포장지 표시와 개인 알레르기를 살펴봐 주세요.</small>{mealApi.isConfigured && !mealPreferencesOpen ? <button className="recipe-shopping-inline-button" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={openMealPreferencesFromSafety}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesSaving ? "식단 조건 저장 중" : "피할 알레르기 설정 열기"}</button> : null}</span></div> : null}
    </div>
  </section> : null;

  const multiDayHasShortages = Boolean(multiDayPreview?.days.some((day) => day.status !== "completed" && day.plan.missing_ingredients.length > 0));

  const toggleAudit = async () => {
    const isCurrent = capturePlannerReadScope();
    if (!isCurrent()) return;
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
    let requestCurrent = true;
    try {
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMealPlanEvents(plan.id, signal));
      requestCurrent = result.current;
      if (!result.current || !isCurrent()) return;
      if (result.error) throw result.error;
      const events = result.value;
      if (!events) throw new Error("meal-plan-events-missing");
      setAuditEvents(events);
    } catch (reason) {
      if (!isCurrent()) return;
      setAuditError(presentMealPlanError(reason, "식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (requestCurrent && isCurrent()) setAuditLoading(false);
    }
  };

  const toggleHistory = async (retry = false) => {
    const isCurrent = capturePlannerReadScope();
    if (!isCurrent()) return;
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
    let requestCurrent = true;
    try {
      const result = await workspaceSync.run("meal-plan", (signal) => mealApi.getMealPlanHistory(10, signal));
      requestCurrent = result.current;
      if (!result.current || !isCurrent()) return;
      if (result.error) throw result.error;
      const plans = result.value;
      if (!plans) throw new Error("meal-plan-history-missing");
      setHistoryPlans(plans);
    } catch (reason) {
      if (!isCurrent()) return;
      setHistoryError(presentMealPlanError(reason, "최근 식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (requestCurrent && isCurrent()) setHistoryLoading(false);
    }
  };

  const setConsumptionValue = (row: ConsumptionRow, rawValue: string) => {
    if (!saved || completing || completed || row.maxQuantity <= 0) return;
    setConsumptionInputDraft((current) => ({ ...current, [row.foodId]: rawValue }));
    const result = validateMealConsumptionDraft(rawValue, row.maxQuantity);
    if (result.quantity !== null) updateConsumption(row, result.quantity, true);
  };

  const completePlan = async (retryPayload?: MealPlanConsumption[]) => {
    const isCurrent = capturePlannerMutationScope();
    if (!isCurrent()) return;
    if (!plan || !hasRecipe || !saved || completing || completed || stockChecking) return;
    if (consumptionInputErrors.length && !retryPayload) { setError("사용한 양을 확인해 주세요."); return; }
    if (requiresSafetyAcknowledgement && !safetyAcknowledged) {
      setError("조리 전에 살펴본 뒤 기록해 주세요.");
      return;
    }
    setStockCheckRecoveryPlanId(null);
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
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      const persistenceFailure = isMealApiMealPlanCompletionPersistenceError(reason);
      setError(persistenceFailure
        ? "조리 완료를 저장하지 못했어요. 식품 목록과 식단은 그대로예요."
        : presentMealPlanError(reason, "조리 내용을 저장하지 못했어요. 식품 목록과 사용할 양을 살펴봐 주세요."));
      setCompletionRetry(persistenceFailure);
      setCompletionRetryPayload(persistenceFailure ? consumptions : null);
    } finally {
      if (isCurrent()) setCompleting(false);
    }
  };

  const plannerBody = <>
    {authenticationExpired ? (
      <div className="recipe-error recipe-auth-expired meal-notice" data-tone="danger" role="alert">
        <InfoCircledIcon width={16} height={16} aria-hidden="true" />
        <span><strong>로그인 정보가 만료됐어요</strong><small>계정에 다시 연결한 뒤 식단을 다시 불러와 주세요.</small></span>
        <button ref={authenticationRecoveryActionRef} className="recipe-error-action" type="button" onClick={() => onOpenAccount ? onOpenAccount() : onOpenChange(false)}>{onOpenAccount ? "계정 다시 연결" : "닫기"}</button>
      </div>
    ) : (
    <div className="meal-sheet-content meal-plan" data-period={multiDayOpen ? "multi-day" : "today"}>
    {ingredients.length ? <div className="meal-controls">
      <div className="meal-period" role="group" aria-label="식단 기간">
        <button type="button" aria-pressed={!multiDayOpen} onClick={() => setMultiDayOpen(false)}>오늘</button>
        <button ref={multiDayToggleRef} type="button" aria-pressed={multiDayOpen} aria-busy={multiDayLoading} disabled={!hasRecipe || loading} onClick={() => void loadMultiDayPreview()}>3일</button>
      </div>
      <div className="meal-filters">
        <button className="meal-filter" type="button" aria-expanded={conditionsOpen} aria-controls="meal-conditions" aria-label={`조리 시간 ${maxMinutes}분 안, 조건 바꾸기`} onClick={() => conditionsOpen ? setConditionsOpen(false) : openConditions()}><TimerIcon width={14} height={14} aria-hidden="true" />{maxMinutes}분 안</button>
        <button className="meal-filter" type="button" aria-expanded={conditionsOpen} aria-controls="meal-conditions" aria-label={`식사 인원 ${displayedServings}인분, 조건 바꾸기`} onClick={() => conditionsOpen ? setConditionsOpen(false) : openConditions()}>{displayedServings}인분</button>
        {mealApi.isConfigured ? <button className="meal-filter recipe-preferences-toggle" type="button" aria-expanded={mealPreferencesOpen} disabled={mealPreferencesLoading || mealPreferencesSaving || (!mealPreferencesLoaded && !mealPreferencesError)} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => setMealPreferencesOpen((current) => !current)}>{mealPreferencesLoading ? "식단 조건 불러오는 중" : mealPreferencesOpen ? "식단 조건 접기" : !mealPreferencesLoaded && mealPreferencesError ? "조건을 불러올 수 없어요" : mealPreferencesDraftDirty ? "저장하지 않은 변경이 있어요" : mealPreferences.avoid_allergens.length ? `피할 알레르기 ${mealPreferences.avoid_allergens.length}개` : "식단 조건 설정"}</button> : null}
      </div>
      <div id="meal-conditions" className="meal-conditions" hidden={!conditionsOpen}>
        <div ref={mealTimePickerRef} className="recipe-time-picker" role="group" aria-label="조리 가능 시간"><span>조리 시간</span><div>{displayedMealTimes.map((option) => <button className={maxMinutes === option ? "recipe-time-active" : ""} type="button" key={option} disabled={mealPreferencesSaving} aria-pressed={maxMinutes === option} onClick={() => updateMaxMinutes(option)}>{option}분</button>)}</div></div>
        <div className="recipe-serving-picker" role="group" aria-label="식사 인원"><span>식사 인원</span><div>{MEAL_SERVING_OPTIONS.map((option) => <button className={displayedServings === option ? "recipe-time-active" : ""} type="button" key={option} aria-pressed={displayedServings === option} disabled={loading || saving || saved || completed || mealPreferencesSaving} onClick={() => updateServings(option)}>{option}인분</button>)}</div></div>
        {saved || completed ? <p className="meal-conditions-note">저장한 식단은 {displayedServings}인분 기준이에요. 다른 메뉴를 고르면 인원을 바꿀 수 있어요.</p> : null}
      </div>
    </div> : null}
    <span id="recipe-serving-note" className="sr-only">재료 양은 {plan?.servings ?? servings}인분 기준이에요.</span>
    {mealApi.isConfigured && offline && !error ? <div className="meal-notice" data-tone="caution" role="status"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>인터넷에 연결되어 있지 않아요</strong><small>지금 보이는 메뉴는 그대로 볼 수 있어요. 저장과 기록은 연결된 뒤에 할 수 있어요.</small></span></div> : null}
    {mealPreferencesNotice ? <div className="recipe-preference-notice meal-notice" data-tone="info" role="status"><CheckCircledIcon width={16} height={16} aria-hidden="true" /><span>{mealPreferencesNotice}</span></div> : null}
    {mealPreferencesOpen ? <section ref={mealPreferencesSectionRef} className="recipe-preferences" tabIndex={-1} aria-label="식단 조건">
      <div className="meal-section-heading"><h3>피할 알레르기</h3><small>고른 항목만 적용돼요</small></div>
      {mealPreferencesLoading ? <small className="recipe-preferences-note" role="status" aria-live="polite">{mealPreferencesDraftDirty ? "저장된 조건을 불러오는 동안 현재 선택은 그대로예요." : "저장한 식단 조건을 불러오고 있어요."}</small> : mealPreferencesDraftDirty ? <small className="recipe-preferences-note" role="status">저장 전 변경한 조건이에요. 저장하면 앞으로 찾는 메뉴에 적용돼요.</small> : null}
      <div className="recipe-preferences-options" role="group" aria-label="피할 알레르기 선택">{ALLERGEN_OPTIONS.map((option) => <button className={mealPreferencesDraft.includes(option.value) ? "recipe-preference-chip recipe-preference-chip-active" : "recipe-preference-chip"} type="button" aria-pressed={mealPreferencesDraft.includes(option.value)} disabled={!mealPreferencesLoaded || mealPreferencesLoading || mealPreferencesSaving} key={option.value} onClick={() => toggleAllergen(option.value)}>{mealPreferencesDraft.includes(option.value) ? <CheckIcon width={14} height={14} aria-hidden="true" /> : null}{option.label}</button>)}</div>
      {mealPreferencesError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{mealPreferencesError}</span>{mealPreferencesRetry ? <button className="recipe-error-action" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => mealPreferencesLoaded ? void saveMealPreferences() : retryMealPreferencesLoad()}>{mealPreferencesLoaded ? mealPreferencesSaving ? "다시 저장 중" : "다시 시도" : mealPreferencesLoading ? "식단 조건 불러오는 중" : "다시 불러오기"}</button> : null}</div> : null}
      <button className="meal-quiet-button" type="button" disabled={!mealPreferencesLoaded || mealPreferencesLoading || mealPreferencesSaving} aria-busy={mealPreferencesLoading || mealPreferencesSaving} onClick={() => void saveMealPreferences()}>{mealPreferencesSaving ? "식단 조건 저장 중" : mealPreferencesLoading ? "식단 조건을 불러오는 중" : !mealPreferencesLoaded ? "조건을 불러온 뒤 저장해 주세요" : "식단 조건 저장"}</button>
      <small className="recipe-preferences-note">알레르기 정보를 확인할 수 없는 메뉴는 추천하지 않아요. 먹기 전 포장지의 알레르기 표시를 살펴봐 주세요.</small>
    </section> : null}
    {latestPlanReadbackNotice ? <div className="recipe-readback-notice meal-notice" data-tone="info" data-readback-state="stale" role="status" aria-live="polite"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{latestPlanReadbackNotice}</span><button className="recipe-error-action" type="button" onClick={() => setMealPlanRefreshNonce((current) => current + 1)}>식단 다시 불러오기</button></div> : null}
    {remoteRefreshRequired ? <div className="recipe-error recipe-remote-refresh meal-notice" data-tone="caution" role="alert" aria-busy={loading}><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span><strong>다른 기기에서 식단이나 재고가 변경됐어요</strong><small>{loading ? "식단을 다시 불러오고 있어요." : "지금 선택한 재료와 양은 그대로예요. 식단을 다시 불러온 뒤 메뉴를 찾아 주세요."}</small></span><button className="recipe-error-action" type="button" disabled={loading} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { setRemoteRefreshRequired(false); setMealPlanRefreshNonce((current) => current + 1); }}>{loading ? "식단 불러오는 중" : "식단 다시 불러오기"}</button></div> : null}
    {!cookingOpen ? errorNotice : null}

    {loading ? <div className="meal-skeleton recipe-loading" role="status" aria-live="polite">
      <span className="meal-skeleton-rail" aria-hidden="true"><span /><span /></span>
      <span className="meal-skeleton-line" aria-hidden="true" />
      <span className="meal-skeleton-line meal-skeleton-line-short" aria-hidden="true" />
      <span className="meal-skeleton-caption">재료에 맞는 메뉴를 찾고 있어요</span>
    </div> : null}

    {!loading && !ingredients.length ? <div className="meal-empty">
      <MealDishArt className="meal-empty-art" title="" ingredientNames={[]} />
      <h3>냉장고가 비어 있어요</h3>
      <p className="recipe-description">식품을 추가하면 그 재료로 만들 수 있는 메뉴를 찾아 드려요.</p>
      <button className="meal-primary-button" type="button" disabled={!onOpenAdd} onClick={onOpenAdd}><PlusIcon width={17} height={17} aria-hidden="true" />식품 추가하기</button>
    </div> : null}

    {!loading && ingredients.length && !hasRecipe && plan && !error ? <div className="meal-empty meal-no-match">
      <MealDishArt className="meal-empty-art" title="" ingredientNames={[]} />
      <div className="recipe-title-row"><h3>{quantityRecoveryTitle ?? plan.title}</h3></div>
      {!packageQuantityRecovery && !genericNoMatchReason ? <p className="recipe-description">{mealPlanDisplayCopy(plan.reason ?? "재료를 더 추가하거나 조리 조건을 바꿔 다시 찾아보세요.")}</p> : <p className="recipe-description">{packageQuantityRecovery ? "포장 하나에 든 양을 알려 주면 레시피 양과 비교할 수 있어요." : "조리 시간을 늘리거나 재료를 더 추가하면 찾을 수 있어요."}</p>}
      {canAdjustNoMatch ? <div className="recipe-no-match-actions">
        {nextMealTime ? <button className="meal-primary-button" type="button" disabled={saving || mealPreferencesSaving} onClick={() => updateMaxMinutes(nextMealTime)}>{nextMealTime}분으로 다시 찾아보기</button> : null}
        {quantityRecoveryFoods.map((food, index) => <button className={index === 0 && !nextMealTime ? "meal-primary-button" : "meal-quiet-button"} type="button" key={food.id} data-meal-food-id={food.id} onClick={() => { keyboard.hide(); onOpenFoodDetail?.(food.id, "quantity-review"); }}>{quantityReferenceRecoveryLabel(food)}</button>)}
        {noMatchAllergens && mealApi.isConfigured ? <button className="meal-primary-button" type="button" disabled={mealPreferencesLoading || mealPreferencesSaving || (!mealPreferencesLoaded && !mealPreferencesError)} onClick={openMealPreferencesFromSafety}>식단 조건 확인</button> : !nextMealTime && !quantityRecoveryFoods.length ? <button className="meal-primary-button" type="button" disabled={!onOpenAdd} onClick={onOpenAdd}><PlusIcon width={15} height={15} aria-hidden="true" />식품 추가</button> : null}
        <div className="recipe-no-match-secondary"><button className="meal-quiet-button" type="button" onClick={() => openConditions(true)}>조건 바꾸기</button>{nextMealTime || noMatchAllergens || quantityRecoveryFoods.length ? <button className="meal-quiet-button" type="button" disabled={!onOpenAdd} onClick={onOpenAdd}><PlusIcon width={15} height={15} aria-hidden="true" />식품 추가</button> : null}</div>
        {mealApi.isConfigured && mealPreferences.avoid_allergens.length ? <p className="recipe-recovery-note">저장한 알레르기 조건은 그대로 적용돼요.</p> : null}
      </div> : null}
    </div> : null}

    {!loading && hasRecipe && plan && !multiDayOpen ? <>
      {anchorStock ? <section className="meal-anchor" aria-labelledby="meal-anchor-title" data-anchor-match={anchorMatch === null ? "pending" : anchorMatch ? "true" : "false"}>
        <span className="meal-anchor-copy">
          <h2 id="meal-anchor-title">{withAnchorParticle(anchorStock.name, "instrumental")} 만들 수 있는 메뉴</h2>
          {anchorMatch === false ? <small role="status">{withAnchorParticle(anchorStock.name, "subject")} 들어가는 메뉴가 없어 다른 메뉴를 보여드려요.</small> : null}
        </span>
        {onClearAnchor ? <button className="meal-anchor-clear meal-text-button" type="button" aria-label={`${anchorStock.name} 기준 해제하고 전체 메뉴 보기`} onClick={onClearAnchor}>전체 메뉴</button> : null}
      </section> : null}
      <div className="meal-menu">
        {menuCards.length > 1 ? <Carousel ariaLabel="메뉴 고르기" className="meal-rail" contentClassName="meal-rail-track">{menuCards.map((option) => menuCard(option, false))}</Carousel> : <div className="meal-rail meal-rail-solo">{menuCard(plan, true)}</div>}
        {alternativesLoading || menuOptionsPending ? <p className="meal-menu-status" role="status">다른 메뉴도 찾고 있어요</p> : alternativesError ? <div className="recipe-error meal-notice" data-tone="info" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{alternativesError}</span><button className="recipe-error-action" type="button" onClick={() => void loadAlternatives(true)}>다른 메뉴 다시 찾기</button></div> : null}
      </div>

      <section className="meal-recipe" aria-labelledby="meal-recipe-title">
        <div className="recipe-title-row">
          <h3 id="meal-recipe-title">{plan.title}</h3>
          <p className="meal-recipe-facts"><span className="recipe-time"><TimerIcon width={14} height={14} aria-hidden="true" />{plan.total_minutes ?? plan.minutes}분</span><span>{displayedServings}인분</span>{plan.thaw_required ? <span>해동 {plan.thaw_minutes ?? 0}분 포함</span> : null}</p>
        </div>
        {hasMeaningfulMealReason(plan.reason) ? <p className="recipe-description">{mealPlanDisplayCopy(plan.reason)}</p> : null}
        {!completed && planIngredients.length ? <p className={`recipe-availability-summary${missingRecipeIngredientCount ? " recipe-availability-summary-incomplete" : ""}`} role="status" aria-label="식단 재료" aria-live="polite" aria-atomic="true"><strong>{missingRecipeIngredientCount ? availableRecipeIngredientCount ? `재료 ${availableRecipeIngredientCount}가지는 있고 ${missingRecipeIngredientCount}가지는 더 필요해요` : `재료 ${missingRecipeIngredientCount}가지를 준비해 주세요` : "필요한 재료를 모두 갖고 있어요"}</strong></p> : null}

        {completed ? <div className="recipe-completed" data-readback-state="confirmed" role="status"><CheckCircledIcon width={20} height={20} aria-hidden="true" /><span><strong>조리 완료로 기록했어요</strong>{completedMealAllocations(plan, foods).map((allocation) => <small key={allocation.key}>{allocation.name} {formatQuantity(allocation.quantity)}{allocation.unit} 사용</small>)}<small>{skippedCount ? `사용한 양만큼 보관 수량을 줄였어요. ${skippedCount}가지는 기록에서 제외했어요.` : "사용한 양만큼 보관 수량을 줄였어요."}</small>{grocyCompletionDetail(completionGrocySyncStatus) ? <><small className="recipe-completed-sync-note" data-sync-state={grocyCompletionSyncState(completionGrocySyncStatus)}>{grocyCompletionDetail(completionGrocySyncStatus)}</small>{onOpenSyncReview ? <button className="recipe-shopping-inline-button recipe-sync-review-action" type="button" onClick={() => onOpenSyncReview(grocyCompletionSyncState(completionGrocySyncStatus) === "action_required" ? "action_required" : grocyCompletionSyncState(completionGrocySyncStatus) === "processing" ? "processing" : "queued")}>{grocyCompletionSyncState(completionGrocySyncStatus) === "action_required" ? "알림 열기" : "알림에서 보기"}</button> : null}</> : null}</span></div> : <div className="recipe-actions meal-actions">
          <button ref={recipeViewActionRef} className="meal-primary-button meal-start-button" type="button" disabled={saving && !cookingOpen} onClick={(event) => openCooking(0, event.currentTarget)}>요리 시작</button>
          <div className="meal-actions-secondary">
            <button className="meal-quiet-button recipe-plan-save-button" type="button" aria-describedby={!mealApi.isConfigured ? "recipe-serving-note recipe-preview-save-note" : !saved ? "recipe-serving-note recipe-save-effect" : "recipe-serving-note"} disabled={saving || saved} onClick={() => void persistPlan()}>{saved ? <CheckIcon width={16} height={16} aria-hidden="true" /> : <BookmarkIcon width={16} height={16} aria-hidden="true" />}<span className="recipe-plan-save-copy">{saved ? mealApi.isConfigured ? "저장됨" : "임시 저장됨" : saving ? mealApi.isConfigured ? "저장 중" : "임시 저장 중" : mealApi.isConfigured ? "식단 저장" : "임시 저장"}</span></button>
            <button className="meal-text-button" type="button" disabled={saving && !saved} onClick={(event) => openCooking("confirm", event.currentTarget)}>이미 만들었어요</button>
          </div>
          {saved ? <div className="meal-saved-links">
            <button className="meal-text-button recipe-audit-toggle" type="button" aria-expanded={auditOpen} disabled={auditLoading} onClick={() => void toggleAudit()}>{auditLoading ? "기록 불러오는 중" : auditOpen ? "식단 기록 접기" : "식단 기록 보기"}</button>
            {mealApi.isConfigured ? <button type="button" className="meal-text-button" disabled={stockChecking || saving || completing || completionRetry || authenticationExpired} aria-busy={stockChecking} onPointerDown={(event) => event.preventDefault()} onClick={() => { void recheckSavedStock(); }}>{stockChecking ? "현재 재료 확인 중" : "현재 재료로 다시 확인"}</button> : null}
          </div> : null}
        </div>}
        {!mealApi.isConfigured && !completed ? <p id="recipe-preview-save-note" className="recipe-preview-save-note" role="note">화면을 나가면 임시 식단이 사라져요. 조리 완료 전에는 재료 수량이 바뀌지 않아요.</p> : null}
        {mealApi.isConfigured && !saved && !completed ? <p id="recipe-save-effect" className="sr-only">재료 수량은 조리 완료를 기록할 때만 줄어요.</p> : null}
        {saved ? <div className="saved-recipe sr-only" data-readback-state="confirmed" role="status" aria-live="polite" aria-atomic="true">{mealApi.isConfigured ? "오늘의 식단에 저장했어요" : "임시 식단을 저장했어요"}. {plan.servings ?? servings}인분.</div> : null}
        {auditOpen ? <div className="recipe-audit" aria-label="식단 기록"><div className="meal-section-heading"><h4>식단 기록</h4><small>저장과 조리 기록</small></div>{auditError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{auditError}</span></div> : auditEvents.length ? <div className="recipe-audit-list">{auditEvents.map((event) => <div className="recipe-audit-row" key={event.id}><strong>{event.event_type === "saved" ? "식단 저장" : "조리 완료"}</strong><small>{new Date(event.occurred_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>{event.consumed_allocations.length ? <small>{event.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + ")} 사용</small> : null}</div>)}</div> : <p className="history-empty">아직 기록이 없어요.</p>}</div> : null}

        {safetySummary}

        {planIngredients.length ? <div className="recipe-ingredients meal-ingredients">
          {completed ? <div className="meal-ingredient-group"><h4>레시피 재료</h4><div role="list">{planIngredients.map(ingredientRow)}</div></div> : <>
            {haveIngredients.length ? <div className="meal-ingredient-group"><h4>냉장고에 있음</h4><div role="list">{haveIngredients.map(ingredientRow)}</div></div> : null}
            {buyIngredients.length ? <div className="meal-ingredient-group meal-ingredient-group-buy"><h4>사야 함</h4><div role="list">{buyIngredients.map(ingredientRow)}</div>
              {canAddMissingIngredientsToShopping ? <button className="meal-quiet-button meal-shop-button" type="button" disabled={shoppingMutating || saving} aria-busy={shoppingMutating} onClick={() => void addMissingToShopping()}><PlusIcon width={16} height={16} aria-hidden="true" />{shoppingMutating ? "장보기에 담는 중" : "장보기에 담기"}</button> : <p className="meal-group-note">장보기 목록은 지금 쓸 수 없어요.</p>}
              {shoppingError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{shoppingError}</span>{shoppingRetryAction ? <button className="recipe-error-action" type="button" disabled={shoppingMutating} aria-busy={shoppingMutating} onClick={shoppingRetryAction.onRetry}>{shoppingMutating ? "담는 중" : shoppingRetryAction.label}</button> : null}</div> : shoppingAddedCount !== null ? <p className="meal-group-note" role="status">장보기 목록에 담았어요.{onOpenShoppingList ? <button className="meal-text-button" type="button" onClick={onOpenShoppingList}>장보기 열기</button> : null}</p> : null}
            </div> : null}
          </>}
        </div> : null}
        {plan.pantry_items?.length ? <div className="recipe-pantry"><h4>기본 양념과 밥</h4><ul>{plan.pantry_items.map((item) => <li key={item.name}><span>{item.name}{item.optional ? <small>선택</small> : null}</span><span>{item.amount !== null ? `${formatIngredientQuantity(item.amount)}${item.unit}` : item.unit}</span></li>)}</ul></div> : null}
        {plan.allergen_metadata_status === "known" ? <p className="recipe-allergen-note"><Metadata parts={["알레르기 정보", ...(plan.allergens?.length ? plan.allergens.map(allergenLabel) : ["확인된 주요 항목 없음"])]} /></p> : null}
        {plan.recipe_source_name && plan.recipe_source_name !== "Rescue Meal 팀 작성 레시피" ? <p className="recipe-provenance"><MetadataText text={<>레시피 출처 · {plan.recipe_source_name}</>} /></p> : null}
      </section>
    </> : null}

    {multiDayOpen ? (
      <section className="recipe-multi-day" aria-label="3일 식단" aria-busy={multiDayLoading}>
        {multiDayLoading ? <div className="meal-skeleton" role="status" aria-live="polite"><span className="meal-skeleton-day" aria-hidden="true" /><span className="meal-skeleton-day" aria-hidden="true" /><span className="meal-skeleton-day" aria-hidden="true" /><span className="meal-skeleton-caption">3일치 메뉴를 고르고 있어요</span></div>
          : multiDayError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{multiDayError}</span>{multiDaySaveRetryPayload ? <button className="recipe-error-action" type="button" disabled={multiDaySaving} aria-busy={multiDaySaving} onPointerDown={(event) => event.preventDefault()} onClick={() => void persistMultiDayPlan(multiDaySaveRetryPayload)}>{multiDaySaving ? "저장 중" : "다시 시도"}</button> : <button className="recipe-error-action" type="button" disabled={multiDayLoading} aria-busy={multiDayLoading} onClick={() => void loadMultiDayPreview(true)}>{multiDayLoading ? "다시 찾는 중" : "다시 찾아보기"}</button>}</div>
          : multiDayPreview?.days.length ? <>
            <div className="meal-section-heading"><h3>{multiDayPreview.days.length}일치 메뉴</h3><small>{multiDayPreview.servings ?? servings}인분 기준</small></div>
            {multiDayPreview.days.length < 3 ? <p className="recipe-optimizer-note" role="status">지금 재료로는 {multiDayPreview.days.length}일치 메뉴까지 짤 수 있어요.</p> : null}
            <ol className="meal-days">{multiDayPreview.days.map((day) => {
              const linkedBundleId = multiDayPreview.saved_at ? multiDayPreview.id : undefined;
              const missing = day.plan.missing_ingredients.length;
              return <li key={`${day.day_index}-${day.plan.recipe_id}`}><button className={`meal-day recipe-multi-day-row${day.status === "completed" ? " recipe-multi-day-row-completed" : ""}`} type="button" onClick={() => selectAlternative(day.plan, linkedBundleId, linkedBundleId ? day.day_index : undefined, day.status)}>
                <span className="meal-day-when"><strong>{day.day_index}일차</strong><span>{formatPlanDate(day.plan_date)}</span></span>
                <MealDishArt title={day.plan.title} ingredientNames={photoNamesFor(day.plan)} />
                <span className="meal-day-body"><span className="meal-day-title">{day.plan.title}</span><span className="meal-card-facts"><span><TimerIcon width={13} height={13} aria-hidden="true" />{day.plan.minutes}분</span><span>{missing ? `${missing}가지 사야 함` : "재료 다 있음"}</span>{multiDaySaved || day.status !== "planned" ? <span>{multiDaySaved && day.status === "planned" ? "예정" : multiDayDayStatus(day.status)}</span> : null}</span></span>
              </button></li>;
            })}</ol>
            <div className="recipe-multi-day-save">
              <button className="meal-primary-button" type="button" disabled={multiDaySaving || multiDaySaved} onClick={() => void persistMultiDayPlan()}>{multiDaySaved ? <CheckIcon width={16} height={16} aria-hidden="true" /> : null}{multiDaySaved ? `${multiDayPreview.days.length}일치 식단 저장됨` : multiDaySaving ? `${multiDayPreview.days.length}일치 식단 저장 중` : `${multiDayPreview.days.length}일치 식단 저장`}</button>
              <span className="recipe-multi-day-status" role={multiDaySaved ? "status" : undefined}>{multiDaySaved ? multiDayHasShortages ? "부족한 재료는 장보기 목록에 담을 수 있어요." : "나중에 다시 볼 수 있어요." : "저장하기 전에는 미리보기예요. 날짜를 누르면 그날 메뉴를 볼 수 있어요."}</span>
              {multiDaySaved && multiDayHasShortages ? <button className="meal-quiet-button meal-multi-day-shopping" type="button" disabled={shoppingMutating} aria-busy={shoppingMutating} onClick={() => void addShoppingSource("multi_day", multiDayPreview.id)}><PlusIcon width={16} height={16} aria-hidden="true" />{shoppingMutating ? "장보기 목록 저장 중" : "3일 부족 재료 장보기"}</button> : null}
              {shoppingError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{shoppingError}</span>{shoppingRetryAction ? <button className="recipe-error-action" type="button" disabled={shoppingMutating} onClick={shoppingRetryAction.onRetry}>{shoppingRetryAction.label}</button> : null}</div> : null}
            </div>
          </> : <p className="history-empty">지금 조건으로는 3일 식단을 짜지 못했어요. 조리 시간이나 식사 인원을 바꿔 보세요.</p>}
        {mealApi.isConfigured ? <button className="meal-text-button recipe-multi-day-history-toggle" type="button" aria-expanded={multiDayHistoryOpen} disabled={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory()}>{multiDayHistoryLoading ? "저장한 3일 식단 불러오는 중" : multiDayHistoryOpen ? "저장한 3일 식단 접기" : "저장한 3일 식단 보기"}</button> : null}
        {multiDayHistoryOpen ? <section className="recipe-multi-day-history" aria-label="저장한 3일 식단">{multiDayHistoryError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{multiDayHistoryError}</span><button className="recipe-error-action" type="button" disabled={multiDayHistoryLoading} aria-busy={multiDayHistoryLoading} onClick={() => void toggleMultiDayHistory(true)}>{multiDayHistoryLoading ? "다시 불러오는 중" : "다시 시도"}</button></div> : multiDayHistory.length ? <div className="meal-history-list" role="list">{multiDayHistory.map((bundle) => { const firstDay = bundle.days[0]; const lastDay = bundle.days[bundle.days.length - 1]; return <button className="meal-history-row recipe-multi-day-history-row" type="button" role="listitem" key={bundle.id} onClick={() => openSavedMultiDayPlan(bundle)}><strong>{firstDay?.plan.title ?? "저장한 3일 식단"}{bundle.days.length > 1 ? ` 외 ${bundle.days.length - 1}개` : ""}</strong><small>{firstDay ? formatPlanDate(firstDay.plan_date) : "날짜 미정"}{lastDay && lastDay !== firstDay ? ` ~ ${formatPlanDate(lastDay.plan_date)}` : ""}</small><small>{bundle.max_minutes}분 안</small></button>; })}</div> : <p className="history-empty">저장한 3일 식단이 아직 없어요.</p>}</section> : null}
      </section>
    ) : null}

    {plan ? <div className="meal-history">
      <button className="meal-text-button recipe-history-toggle" type="button" aria-expanded={historyOpen} aria-controls="recipe-history-panel" aria-busy={historyLoading} disabled={historyLoading} onClick={() => void toggleHistory()}>{historyLoading ? "최근 식단 불러오는 중" : historyOpen ? "최근 식단 접기" : "최근 식단 보기"}</button>
      <section id="recipe-history-panel" className="recipe-history" aria-label="최근 식단" hidden={!historyOpen}>
        {historyError ? <div className="recipe-error meal-notice" data-tone="danger" role="alert"><InfoCircledIcon width={16} height={16} aria-hidden="true" /><span>{historyError}</span><button className="recipe-error-action" type="button" disabled={historyLoading} aria-busy={historyLoading} onClick={() => void toggleHistory(true)}>{historyLoading ? "다시 불러오는 중" : "다시 시도"}</button></div>
          : historyLoading ? <p className="recipe-history-loading" role="status" aria-live="polite">최근 식단을 불러오고 있어요.</p>
            : historyPlans.length ? <div className="meal-history-list">{historyPlans.map((historyPlan) => <button className="meal-history-row recipe-history-row" type="button" key={historyPlan.id} aria-label={`${historyPlan.title} ${mealHistoryMetadata(historyPlan).join(", ")} 식단 열기`} onClick={() => selectAlternative(historyPlan, undefined, undefined, historyPlan.completed_at ? "completed" : "saved")}><strong>{historyPlan.title}</strong><small><Metadata parts={mealHistoryMetadata(historyPlan)} /></small></button>)}</div>
              : <div className="recipe-history-empty" role="status" aria-live="polite"><strong>{mealApi.isConfigured ? "저장된 식단이 아직 없어요" : "임시 저장한 식단이 아직 없어요"}</strong><small>{mealApi.isConfigured ? "식단을 저장하면 여기에서 다시 확인할 수 있어요." : "임시 저장하면 여기서 볼 수 있어요. 화면을 벗어나면 사라져요."}</small></div>}
      </section>
    </div> : null}
    </div>
    )}
    {plan && hasRecipe ? <MealCookingSheet open={cookingOpen} onOpenChange={(open) => { if (!open) { keyboard.hide(); setCookingOpen(false); } }} title={plan.title} steps={cookingSteps} page={cookingPage} onPageChange={setCookingPage} onFinish={finishCooking}>{consumptionControls}</MealCookingSheet> : null}
  </>;

  if (presentation === "screen") return <TabSheetScreen title="오늘의 식단" className="meal-screen">{plannerBody}</TabSheetScreen>;
  return <BottomSheet open={active} onOpenChange={onOpenChange} title="오늘의 식단" snap={0.86}>{plannerBody}</BottomSheet>;
}
