import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarIcon, CameraIcon, Cross2Icon, FileTextIcon, MinusIcon, Pencil1Icon, PlusIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { Carousel } from "./mobile/Carousel";
import { mealApi, type ApiPriorityInference } from "./mealApi";
import {
  buildQuickAddChips,
  changeQuickAddAmount,
  formatQuickAddQuantity,
  mergeQuickAddRecent,
  nextQuickAddStorage,
  parseQuickAddLine,
  quickAddStorageFromName,
  readQuickAddRecent,
  stageQuickAddFood,
  writeQuickAddRecent,
  type QuickAddRecentEntry,
  type QuickAddStagedFood,
  type QuickAddStorage,
} from "./quickAddParse";
import type { QuickAddApiItem } from "./quickAddApi";
import { quickAddSaveSummary, type QuickAddFailure, type QuickAddSaveResult } from "./quickAddSave";
import { comparableFoodName } from "./foodStorageGuess";
import "./quickAdd.css";

type QuickAddMethod = "receipt" | "barcode" | "label" | "manual";
type InferenceState = { status: "loading" } | { status: "ready"; inference: ApiPriorityInference } | { status: "error" };

let quickAddIdCounter = 0;
function createQuickAddId() {
  quickAddIdCounter += 1;
  return `quick-${Date.now().toString(36)}-${quickAddIdCounter}`;
}

function inferenceKey(food: Pick<QuickAddStagedFood, "name" | "storage">) {
  return `${comparableFoodName(food.name)}|${food.storage}`;
}

function storageCode(storage: QuickAddStorage) {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

/**
 * The add sheet's first view: tap chips or type one line, check the staged foods,
 * and save them all with one action. Methods that read a photo stay one tap away.
 */
export default function QuickAdd({
  scope,
  existingFoods,
  imageForFoodName,
  formatApiDate,
  onSave,
  onChooseMethod,
  seedNames,
}: {
  scope: string;
  seedNames?: readonly string[];
  existingFoods: ReadonlyArray<{ name: string; storage: QuickAddStorage }>;
  imageForFoodName: (name: string) => string;
  formatApiDate: (value: string | null) => string;
  onSave: (items: QuickAddApiItem[]) => Promise<QuickAddSaveResult>;
  onChooseMethod: (method: QuickAddMethod) => void;
}) {
  const keyboard = useKeyboard();
  const [line, setLine] = useState("");
  const [lineHint, setLineHint] = useState("");
  const [staged, setStaged] = useState<QuickAddStagedFood[]>([]);
  const [recent, setRecent] = useState<QuickAddRecentEntry[]>(() => readQuickAddRecent(scope));
  const [failures, setFailures] = useState<QuickAddFailure[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inferences, setInferences] = useState<Record<string, InferenceState>>({});
  const savingRef = useRef(false);
  const stagedListRef = useRef<HTMLUListElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setRecent(readQuickAddRecent(scope));
  }, [scope]);

  const inventoryNames = useMemo(() => existingFoods.map((food) => food.name), [existingFoods]);
  const chips = useMemo(() => buildQuickAddChips({ recent, inventoryNames }), [inventoryNames, recent]);
  const hasHistory = chips.some((chip) => chip.source !== "starter");

  // Storage follows where the same food already lives, then the name guess.
  const storageFor = (name: string): QuickAddStorage => {
    const key = comparableFoodName(name);
    const known = existingFoods.find((food) => comparableFoodName(food.name) === key)
      ?? recent.find((entry) => comparableFoodName(entry.name) === key);
    return known?.storage ?? quickAddStorageFromName(name);
  };
  const unitFor = (name: string) => recent.find((entry) => comparableFoodName(entry.name) === comparableFoodName(name))?.unit;

  // Preview the estimated "먼저 살펴볼 시점" the server will store for undated foods.
  useEffect(() => {
    if (!mealApi.isConfigured) return;
    const missing = staged.filter((food) => !inferences[inferenceKey(food)]);
    if (!missing.length) return;
    setInferences((current) => {
      const next = { ...current };
      missing.forEach((food) => { next[inferenceKey(food)] = { status: "loading" }; });
      return next;
    });
    missing.forEach((food) => {
      const key = inferenceKey(food);
      void mealApi.inferPriority({ product_name: food.name, storage_type: storageCode(food.storage) })
        .then((inference) => setInferences((current) => ({ ...current, [key]: inference ? { status: "ready", inference } : { status: "error" } })))
        .catch(() => setInferences((current) => ({ ...current, [key]: { status: "error" } })));
    });
  }, [inferences, staged]);

  const clearSaveFeedback = () => {
    setFailures([]);
    setSavedNames([]);
  };

  const stage = (input: { name: string; amount?: number; unit?: string }) => {
    clearSaveFeedback();
    setStaged((current) => stageQuickAddFood(current, { ...input, unit: input.unit ?? unitFor(input.name), storage: storageFor(input.name) }, createQuickAddId));
  };

  const stageLine = () => {
    const parsed = parseQuickAddLine(line);
    if (!parsed.length) {
      setLineHint(line.trim() ? "식품 이름을 찾지 못했어요. 이름을 띄어 써 주세요." : "");
      return;
    }
    clearSaveFeedback();
    setStaged((current) => parsed.reduce((next, food) => stageQuickAddFood(next, {
      name: food.name,
      amount: food.amount,
      unit: food.amountGiven ? food.unit : unitFor(food.name) ?? food.unit,
      storage: storageFor(food.name),
    }, createQuickAddId), current));
    setLine("");
    setLineHint(`${parsed.map((food) => food.name).join(", ")} 담았어요.`);
  };

  // Starter foods tapped on Home arrive already listed (a new array per tap, applied once).
  const appliedSeedRef = useRef<readonly string[] | undefined>(undefined);
  useEffect(() => {
    if (!seedNames?.length || appliedSeedRef.current === seedNames) return;
    appliedSeedRef.current = seedNames;
    seedNames.forEach((name) => stage({ name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNames]);

  const submitLine = (event: FormEvent) => {
    event.preventDefault();
    stageLine();
  };

  const stagedCount = (name: string) => staged.find((food) => comparableFoodName(food.name) === comparableFoodName(name));

  const updateFood = (id: string, change: Partial<QuickAddStagedFood>) => {
    clearSaveFeedback();
    setStaged((current) => current.map((food) => food.id === id ? { ...food, ...change } : food));
  };

  const removeFood = (id: string) => {
    keyboard.hide();
    clearSaveFeedback();
    setStaged((current) => current.filter((food) => food.id !== id));
  };

  const save = async () => {
    if (savingRef.current || !staged.length) return;
    const items = staged.filter((food) => food.name.trim());
    if (!items.length) return;
    keyboard.hide();
    savingRef.current = true;
    setSaving(true);
    setFailures([]);
    setSavedNames([]);
    try {
      const result = await onSave(items.map((food) => ({ ...food, name: food.name.trim(), image: imageForFoodName(food.name.trim()) })));
      const savedIds = new Set(result.savedIds);
      const savedFoods = items.filter((food) => savedIds.has(food.id));
      if (savedFoods.length) {
        const nextRecent = mergeQuickAddRecent(recent, savedFoods, Date.now());
        setRecent(nextRecent);
        writeQuickAddRecent(scope, nextRecent);
      }
      setStaged((current) => current.filter((food) => !savedIds.has(food.id)));
      setSavedNames(result.failed.length ? savedFoods.map((food) => food.name) : []);
      setFailures(result.failed);
      if (result.failed.length) {
        window.requestAnimationFrame(() => saveButtonRef.current?.focus({ preventScroll: true }));
      }
    } catch {
      setFailures(items.map((food) => ({ id: food.id, message: "저장 결과를 확인하지 못했어요.", uncertain: true })));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const failureFor = (id: string) => failures.find((failure) => failure.id === id);
  const failedCount = staged.filter((food) => failureFor(food.id)).length;
  const blankName = staged.some((food) => !food.name.trim());
  const saveLabel = saving
    ? "넣는 중"
    : failedCount && failedCount === staged.length ? `${failedCount}개 다시 넣기` : `${staged.length}개 넣기`;

  const dateLine = (food: QuickAddStagedFood) => {
    if (!mealApi.isConfigured) {
      return <><span className="quick-add-date-tag quick-add-date-tag-unknown">날짜 미확인</span><span>포장지 날짜는 나중에 넣어요</span></>;
    }
    const state = inferences[inferenceKey(food)];
    if (!state || state.status === "loading") {
      return <><span className="quick-add-date-tag">추정</span><span>먼저 살펴볼 시점을 계산하고 있어요</span></>;
    }
    const estimate = state.status === "ready" && !state.inference.abstained ? state.inference.estimated_use_first_window : null;
    if (!estimate) {
      return <><span className="quick-add-date-tag quick-add-date-tag-unknown">날짜 미확인</span><span>포장지 날짜는 나중에 넣어요</span></>;
    }
    const start = formatApiDate(estimate.start_date);
    const end = formatApiDate(estimate.end_date);
    return <><span className="quick-add-date-tag">추정</span><span>먼저 살펴볼 시점</span><strong>{start === end ? start : `${start}~${end}`}</strong></>;
  };

  return (
    <section className="quick-add" aria-label="빠른 추가">
      <form className="quick-add-line" onSubmit={submitLine}>
        <label className="quick-add-line-label" htmlFor="quick-add-line-input">한 줄로 여러 개 넣기</label>
        <div className="quick-add-line-row">
          <KeyboardInput
            id="quick-add-line-input"
            aria-label="한 줄로 여러 개 넣기"
            className="app-input quick-add-line-input"
            value={line}
            placeholder="우유 두부 대파 계란 10개"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby="quick-add-line-hint"
            onChange={(event) => { setLine(event.target.value); setLineHint(""); }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              stageLine();
            }}
            onBlur={() => keyboard.hide()}
          />
          <button className="quick-add-line-submit" type="submit" disabled={!line.trim()} onPointerDown={(event) => event.preventDefault()}>담기</button>
        </div>
        <small id="quick-add-line-hint" className="quick-add-line-hint" role="status" aria-live="polite">{lineHint || "띄어 쓰면 여러 식품이에요. 이름에 띄어쓰기가 있으면 쉼표로 나눠요."}</small>
      </form>

      <div className="quick-add-chips" role="group" aria-labelledby="quick-add-chips-heading">
        <span id="quick-add-chips-heading" className="quick-add-section-label">{hasHistory ? "자주 넣는 식품" : "많이 넣는 식품"}</span>
        <Carousel ariaLabel={hasHistory ? "자주 넣는 식품" : "많이 넣는 식품"} className="quick-add-chip-rail" contentClassName="quick-add-chip-track">
          {chips.map((chip) => {
            const current = stagedCount(chip.name);
            return (
              <button
                key={chip.name}
                className="quick-add-chip"
                type="button"
                data-source={chip.source}
                aria-pressed={Boolean(current)}
                aria-label={current ? `${chip.name} 하나 더, 지금 ${formatQuickAddQuantity(current)}` : `${chip.name} 담기`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => stage({ name: chip.name })}
              >
                <span>{chip.name}</span>
                {current ? <small aria-hidden="true">{formatQuickAddQuantity(current)}</small> : null}
              </button>
            );
          })}
        </Carousel>
      </div>

      {staged.length ? (
        <div className="quick-add-staged" aria-label={`넣을 식품 ${staged.length}개`} role="group">
          <div className="quick-add-staged-heading">
            <strong>넣을 식품 {staged.length}개</strong>
            <small>날짜는 나중에 포장지로 고칠 수 있어요.</small>
          </div>
          <ul ref={stagedListRef} className="quick-add-staged-list">
            {staged.map((food, index) => {
              const failure = failureFor(food.id);
              const editing = editingId === food.id;
              return (
                <li key={food.id} className={`quick-add-pill${failure ? " quick-add-pill-failed" : ""}`} data-testid="quick-add-staged-food">
                  <div className="quick-add-pill-name-row">
                    {editing ? (
                      <KeyboardInput
                        className="app-input quick-add-pill-name-input"
                        value={food.name}
                        aria-label={`넣을 식품 ${index + 1} 이름`}
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        onChange={(event) => updateFood(food.id, { name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          keyboard.hide();
                          setEditingId(null);
                        }}
                        onBlur={() => { keyboard.hide(); setEditingId(null); }}
                      />
                    ) : (
                      <button className="quick-add-pill-name" type="button" aria-label={`${food.name || "이름 없음"} 이름 고치기`} onPointerDown={(event) => event.preventDefault()} onClick={() => setEditingId(food.id)}>
                        <strong>{food.name || "이름을 넣어 주세요"}</strong>
                        <Pencil1Icon width={13} height={13} aria-hidden="true" />
                      </button>
                    )}
                    <button className="quick-add-icon-button quick-add-pill-remove" type="button" aria-label={`${food.name || "이름 없는 식품"} 빼기`} onPointerDown={(event) => event.preventDefault()} onClick={() => removeFood(food.id)}><Cross2Icon width={15} height={15} aria-hidden="true" /></button>
                  </div>
                  <div className="quick-add-pill-controls">
                    <div className="quick-add-stepper" role="group" aria-label={`${food.name} 수량`}>
                      <button className="quick-add-icon-button" type="button" aria-label={`${food.name} 수량 줄이기`} onPointerDown={(event) => event.preventDefault()} onClick={() => { clearSaveFeedback(); setStaged((current) => changeQuickAddAmount(current, food.id, -1)); }}><MinusIcon width={15} height={15} aria-hidden="true" /></button>
                      <span className="quick-add-quantity" aria-live="polite">{formatQuickAddQuantity(food)}</span>
                      <button className="quick-add-icon-button" type="button" aria-label={`${food.name} 수량 늘리기`} onPointerDown={(event) => event.preventDefault()} onClick={() => { clearSaveFeedback(); setStaged((current) => changeQuickAddAmount(current, food.id, 1)); }}><PlusIcon width={15} height={15} aria-hidden="true" /></button>
                    </div>
                    <button className="quick-add-storage" type="button" data-storage={food.storage} aria-label={`${food.name} 보관 위치 ${food.storage}, 눌러서 바꾸기`} onPointerDown={(event) => event.preventDefault()} onClick={() => updateFood(food.id, { storage: nextQuickAddStorage(food.storage) })}>{food.storage}</button>
                  </div>
                  <div className="quick-add-pill-date">{dateLine(food)}</div>
                  {failure ? <small className="quick-add-pill-error" role="alert">{failure.message}</small> : null}
                </li>
              );
            })}
          </ul>
          <div className="quick-add-submit-bar">
            {failures.length ? (
              <p id="quick-add-save-error" className="intake-save-error" role="alert">
                {quickAddSaveSummary(savedNames.length, failedCount)}
                {savedNames.length ? ` 넣은 식품: ${savedNames.join(", ")}.` : ""}
                {" "}남은 식품은 그대로 두었어요. 다시 넣을 수 있어요.
              </p>
            ) : null}
            <small id="quick-add-submit-summary" className="quick-add-submit-summary">
              {mealApi.isConfigured ? "날짜를 모르는 식품은 추정 날짜로 순서만 정해요." : "체험 기록이에요. 새로고침하면 사라져요."}
            </small>
            <button
              ref={saveButtonRef}
              className="primary-sheet-button quick-add-save"
              type="button"
              disabled={saving || blankName}
              aria-busy={saving}
              aria-describedby={["quick-add-submit-summary", failures.length ? "quick-add-save-error" : ""].filter(Boolean).join(" ")}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void save()}
            >
              {blankName ? "이름을 넣어 주세요" : saveLabel}
            </button>
          </div>
        </div>
      ) : (
        <p className="quick-add-empty">식품을 누르거나 한 줄로 적으면 여기에 모여요.</p>
      )}

      <div className="quick-add-methods" role="group" aria-labelledby="quick-add-methods-heading">
        <span id="quick-add-methods-heading" className="quick-add-section-label">다른 방법으로 추가</span>
        <div className="quick-add-method-list">
          <button className="quick-add-method" type="button" aria-label="영수증" onClick={() => onChooseMethod("receipt")}><FileTextIcon width={18} height={18} aria-hidden="true" /><span>영수증</span><small>여러 식품을 한 번에</small></button>
          <button className="quick-add-method" type="button" aria-label="라벨" onClick={() => onChooseMethod("label")}><CalendarIcon width={18} height={18} aria-hidden="true" /><span>라벨</span><small>포장지 날짜 읽기</small></button>
          <button className="quick-add-method" type="button" aria-label="바코드" onClick={() => onChooseMethod("barcode")}><CameraIcon width={18} height={18} aria-hidden="true" /><span>바코드</span><small>상품 찾기</small></button>
          <button className="quick-add-method" type="button" aria-label="직접 입력" onClick={() => onChooseMethod("manual")}><Pencil1Icon width={18} height={18} aria-hidden="true" /><span>직접 입력</span><small>날짜까지 한 개씩</small></button>
        </div>
      </div>
    </section>
  );
}
