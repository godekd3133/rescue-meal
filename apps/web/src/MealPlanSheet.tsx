import { useEffect, useState } from "react";
import { ArrowRightIcon, CalendarIcon, CheckCircledIcon, InfoCircledIcon, LightningBoltIcon, TimerIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { mealApi, type ApiMealPlan, type ApiMealPlanAuditEvent } from "./mealApi";

type MealFood = {
  id: string;
  name: string;
  image: string;
  quantity: string;
};

type ConsumptionRow = {
  foodId: string;
  name: string;
  unit: string;
  maxQuantity: number;
  defaultQuantity: number;
  step: number;
};

const MEAL_TIME_OPTIONS = [10, 20, 30, 45] as const;

const FOOD_IMAGES = {
  spinach: "/assets/food/spinach.png",
  tofu: "/assets/food/tofu.png",
  chicken: "/assets/food/chicken.png",
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

function ingredientStatus(ingredient: ApiMealPlan["ingredients"][number]) {
  if (ingredient.available) return ingredient.match_type === "alias" ? " · 상품명 연결" : "";
  if (ingredient.available_quantity != null) return ` · ${ingredient.available_quantity}${ingredient.available_unit ?? ""} 보유`;
  return " · 필요";
}

function parseFoodQuantity(quantity: string) {
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { amount: 0, unit: "개" };
  const amount = Number(match[1]);
  return { amount: Number.isFinite(amount) ? amount : 0, unit: match[2] || "개" };
}

function normalizeUnit(unit: string) {
  return unit.replace(/\s/g, "").toLowerCase();
}

function quantityStep(unit: string) {
  if (/g|ml|cc/i.test(unit)) return 10;
  if (/개|알|판/.test(unit)) return 1;
  return 0.5;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
      const sameUnit = normalizeUnit(current.unit) === normalizeUnit(allocationUnit);
      const maxQuantity = sameUnit ? Math.min(allocation.quantity, current.amount) : 0;
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

function createDemoPlan(foods: MealFood[], maxMinutes = 30): ApiMealPlan {
  const demoIngredients = foods.slice(0, 3).map((food) => ({
    canonical_name: food.name,
    amount: 1,
    unit: food.quantity.replace(/[\d.\s]/g, "") || "개",
    available: true,
    available_food_id: food.id,
  }));
  const isSeedRecipe = foods.some((food) => food.name.includes("시금치")) && foods.some((food) => food.name.includes("두부")) && foods.some((food) => food.name.includes("닭"));
  return {
    id: "demo-meal-plan",
    snapshot_hash: "demo-fixture-v1",
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "demo-rescue-recipe",
    planner_version: "demo-fixture-v1",
    source: "local_fixture",
    title: isSeedRecipe ? "시금치 두부 닭가슴살 덮밥" : "냉장고 재료 Rescue 볶음",
    minutes: 15,
    max_minutes: maxMinutes,
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

export default function MealPlanSheet({ foods, active = false, onSaved, onCompleted }: { foods: MealFood[]; active?: boolean; onSaved: () => void; onCompleted?: (foodIds: string[], skippedCount: number, consumedAllocations: Array<{ food_id: string; quantity: number }>) => void }) {
  const keyboard = useKeyboard();
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [consumptionDraft, setConsumptionDraft] = useState<Record<string, number>>({});
  const [auditEvents, setAuditEvents] = useState<ApiMealPlanAuditEvent[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [plan, setPlan] = useState<ApiMealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState("");
  const ingredients = foods.slice(0, 20);
  const ingredientKey = ingredients.map((food) => food.id).join("|");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError("");
    setSaved(false);
    setCompleted(false);
    setSkippedCount(0);
    setAuditEvents([]);
    setAuditOpen(false);
    setAuditError("");
    setShowDetails(false);
    if (!ingredients.length) {
      setPlan(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (!mealApi.isConfigured) {
      const demoPlan = createDemoPlan(ingredients, maxMinutes);
      setPlan(demoPlan);
      setConsumptionDraft(initialConsumptionDraft(demoPlan, ingredients));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setPlan(null);
    setLoading(true);
    const inventoryIds = ingredients.map((food) => food.id);
    void Promise.all([
      mealApi.previewMealPlan(inventoryIds, maxMinutes),
      mealApi.getLatestMealPlan().catch(() => null),
    ])
      .then(([response, latest]) => {
        if (cancelled) return;
        if (!response) throw new Error("meal-plan-preview-missing");
        const latestMatchesCurrentPreview = Boolean(
          latest &&
          latest.recipe_id === response.recipe_id &&
          latest.planner_version === response.planner_version &&
          latest.max_minutes === response.max_minutes &&
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
      .catch(() => {
        if (!cancelled) setError("현재 재료로 식단을 계산하지 못했어요. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, ingredientKey, maxMinutes]);

  const persistPlan = async () => {
    if (!ingredients.length || loading || saving || saved || !plan || plan.recipe_id === "no-match") return;
    setError("");
    setSaving(true);
    if (!mealApi.isConfigured) {
      setSaved(true);
      setSaving(false);
      onSaved();
      return;
    }
    try {
      const response = await mealApi.saveMealPlan(plan.inventory_ids, plan.id, plan.snapshot_hash, plan.max_minutes);
      if (!response) throw new Error("meal-plan-response-missing");
      setPlan(response);
      setConsumptionDraft(initialConsumptionDraft(response, foods));
      setSaved(true);
      setCompleted(false);
      setSkippedCount(0);
      setAuditEvents([]);
      setAuditOpen(false);
      onSaved();
    } catch {
      setError("식단을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const hasRecipe = Boolean(plan && plan.recipe_id !== "no-match");
  const planIngredients = plan?.ingredients ?? [];
  const consumptionRows = plan ? consumptionRowsForPlan(plan, foods) : [];

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
      const events = await mealApi.getMealPlanEvents(plan.id);
      if (!events) throw new Error("meal-plan-events-missing");
      setAuditEvents(events);
    } catch {
      setAuditError("식단 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAuditLoading(false);
    }
  };

  const setConsumptionValue = (row: ConsumptionRow, rawValue: string) => {
    const parsed = Number(rawValue);
    const next = !rawValue.trim() || !Number.isFinite(parsed) ? 0 : Math.max(0, Math.min(row.maxQuantity, parsed));
    setConsumptionDraft((current) => ({ ...current, [row.foodId]: Number(next.toFixed(3)) }));
  };

  const completePlan = async () => {
    if (!plan || !hasRecipe || !saved || completing || completed) return;
    setError("");
    setCompleting(true);
    const consumptions = consumptionRows.map((row) => ({
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
      setPlan((current) => current ? { ...current, completed_at: response.completed_at, consumed_food_ids: response.consumed_food_ids, completed_skipped_ingredients: response.skipped_ingredients.map((ingredient) => ingredient.canonical_name), consumed_allocations: response.consumed_allocations } : current);
      setConsumptionDraft(Object.fromEntries(response.consumed_allocations.map((allocation) => [allocation.food_id, allocation.quantity])));
      setCompleted(true);
      setSkippedCount(response.skipped_ingredients.length);
      onCompleted?.(response.consumed_food_ids, response.skipped_ingredients.length, response.consumed_allocations);
    } catch {
      setError("조리 완료를 기록하지 못했어요. 현재 재고와 사용량을 다시 확인해 주세요.");
    } finally {
      setCompleting(false);
    }
  };

  return <div className="meal-sheet-content">
    <div className="recipe-time-picker" role="group" aria-label="조리 가능 시간"><span>조리 가능 시간</span><div>{MEAL_TIME_OPTIONS.map((option) => <button className={maxMinutes === option ? "recipe-time-active" : ""} type="button" key={option} aria-pressed={maxMinutes === option} onClick={() => setMaxMinutes(option)}>{option}분</button>)}</div></div>
    {loading ? <div className="recipe-loading" role="status"><LightningBoltIcon width={18} height={18} /><span><strong>지금 있는 재료를 살펴보고 있어요</strong><small>먼저 먹을 순서와 조리 시간을 함께 계산합니다.</small></span></div> : null}
    {!loading && ingredients.length && plan ? <div className="recipe-art" aria-hidden="true">{planIngredients.slice(0, 3).map((ingredient) => <img src={imageForFoodName(ingredient.canonical_name)} alt="" key={ingredient.canonical_name} draggable={false} />)}</div> : null}
    {!loading && !ingredients.length ? <div className="recipe-empty-art"><LightningBoltIcon width={24} height={24} /></div> : null}
    {!loading ? <div className="recipe-title-row"><div><span className="recipe-kicker">{plan?.source === "local_fixture" ? "DEMO FIXTURE" : plan?.planner_version ? "RESCUE PLANNER · V2" : "RESCUE MEAL"}</span><h3>{plan?.title ?? (ingredients.length ? "식단을 만들 수 없어요" : "재료를 먼저 추가해 주세요")}</h3></div>{hasRecipe ? <span className="recipe-time"><TimerIcon width={15} height={15} /> {plan?.minutes ?? 0}분</span> : null}</div> : null}
    {!loading ? <p className="recipe-description">{plan?.reason ?? (ingredients.length ? "현재 재료를 다시 확인해 주세요." : "영수증·바코드·직접 입력으로 식품을 추가하면 맞춤 식단을 만들 수 있어요.")}</p> : null}
    {!loading && hasRecipe ? <div className="recipe-ingredients"><span>필요한 재료</span><div>{planIngredients.map((ingredient) => <span className={!ingredient.available ? "recipe-ingredient-missing" : ""} key={ingredient.canonical_name}><img src={imageForFoodName(ingredient.canonical_name)} alt="" draggable={false} />{ingredient.canonical_name}{ingredientStatus(ingredient)}</span>)}</div></div> : null}
    {plan?.missing_ingredients.length ? <div className="recipe-missing-callout" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>부족한 재료 {plan.missing_ingredients.length}개</strong><small>{plan.missing_ingredients.join("·")}을 추가하면 더 정확히 만들 수 있어요.</small></span></div> : null}
    {error ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} />{error}</div> : null}
    {hasRecipe ? <div className="recipe-actions"><button className="secondary-sheet-button" type="button" disabled={loading || saving || saved} onClick={persistPlan}><CalendarIcon width={17} height={17} /> {saved ? "저장됨" : saving ? "저장 중" : "식단 저장"}</button><button className="primary-sheet-button" type="button" disabled={loading || saving} onClick={() => setShowDetails((current) => !current)}>{showDetails ? "레시피 접기" : "레시피 보기"} <ArrowRightIcon width={17} height={17} /></button></div> : <button className="primary-sheet-button" type="button" disabled>식품을 추가한 뒤 만들기</button>}
    {showDetails && hasRecipe ? <div className="recipe-details"><div className="recipe-details-heading"><span>조리 순서</span><small>{plan?.minutes}분 기준</small></div><ol>{plan?.steps.map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><span>{step}</span></li>)}</ol><div className="recipe-safety"><InfoCircledIcon width={15} height={15} /><span><strong>안전 메모</strong><small>{plan?.safety_note}</small></span></div></div> : null}
    {saved ? <div className="saved-recipe"><CheckCircledIcon width={16} height={16} /> 오늘의 식단에 저장했어요.</div> : null}
    {saved ? <button className="recipe-audit-toggle" type="button" disabled={auditLoading} onClick={() => void toggleAudit()}>{auditLoading ? "기록 불러오는 중" : auditOpen ? "식단 기록 접기" : "식단 기록 보기"} <ArrowRightIcon width={14} height={14} /></button> : null}
    {auditOpen ? <div className="recipe-audit" aria-label="식단 기록"><div className="recipe-audit-heading"><span>식단 기록</span><small>{plan?.snapshot_hash ? `snapshot ${plan.snapshot_hash.slice(0, 10)}…` : "snapshot 없음"}</small></div>{auditError ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} />{auditError}</div> : auditEvents.length ? <div className="recipe-audit-list">{auditEvents.map((event) => <div className="recipe-audit-row" key={event.id}><span className={`recipe-audit-icon recipe-audit-${event.event_type}`}><CheckCircledIcon width={13} height={13} /></span><span><strong>{event.event_type === "saved" ? "식단 저장" : "조리 완료"}</strong><small>{new Date(event.occurred_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{event.consumed_allocations.length ? ` · ${event.consumed_allocations.map((allocation) => `${formatQuantity(allocation.quantity)}${allocation.unit ?? ""}`).join(" + ")} 사용` : ""}</small></span></div>)}</div> : <p className="history-empty">아직 기록이 없어요.</p>}</div> : null}
    {saved && !completed ? <div className="recipe-complete-actions"><div className="recipe-consumption-heading"><span>사용량 확인</span><small>실제로 사용한 만큼만 재고에서 차감해요.</small></div><div className="recipe-consumption-list">{consumptionRows.map((row) => { const currentQuantity = consumptionDraft[row.foodId] ?? 0; return <div className="recipe-consumption-row" key={row.foodId}><span><strong>{row.name}</strong><small>최대 {formatQuantity(row.maxQuantity)}{row.unit}</small></span><div className="recipe-consumption-stepper"><button type="button" aria-label={`${row.name} 사용량 줄이기`} disabled={completing || currentQuantity <= 0} onClick={() => adjustConsumption(row, -row.step)}>-</button><label className="recipe-consumption-input-wrap"><span className="sr-only">{row.name} 사용량</span><KeyboardInput className="recipe-consumption-input" type="number" inputMode="decimal" min={0} max={row.maxQuantity} step={row.step} value={formatQuantity(currentQuantity)} aria-label={`${row.name} 사용량`} onChange={(event) => setConsumptionValue(row, event.target.value)} onBlur={() => keyboard.hide()} disabled={completing || row.maxQuantity <= 0} /><em>{row.unit}</em></label><button type="button" aria-label={`${row.name} 사용량 늘리기`} disabled={completing || currentQuantity >= row.maxQuantity} onClick={() => adjustConsumption(row, row.step)}>+</button></div></div>; })}</div><button className="recipe-complete-button" type="button" disabled={completing} onPointerDown={(event) => { event.preventDefault(); void completePlan(); keyboard.hide(); }} onClick={(event) => { if (event.detail === 0) { void completePlan(); keyboard.hide(); } }}><CheckCircledIcon width={16} height={16} /> {completing ? "기록 중" : "조리 완료로 기록"}</button><small>확인하면 위 수량만큼 소비 기록을 남겨요.</small></div> : null}
    {completed ? <div className="recipe-completed" role="status"><CheckCircledIcon width={16} height={16} /><span><strong>조리 완료 기록을 남겼어요</strong><small>{skippedCount ? `처리 가능한 재료만 차감했고, ${skippedCount}개는 재고를 다시 확인해 주세요.` : "사용한 재료를 식품 목록에서 차감했습니다."}</small></span></div> : null}
  </div>;
}
