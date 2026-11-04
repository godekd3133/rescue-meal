import { ShoppingStockList } from "./ShoppingStockList";
import { Metadata, MetadataText } from "./Metadata";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { ArchiveIcon, ArrowRightIcon, CheckCircledIcon, Cross2Icon, InfoCircledIcon, ReaderIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile/Keyboard";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import type { ApiShoppingListItem, ApiStorageLocation, ApiStorageType } from "./mealApi";
import { shoppingAdjustmentNote, shoppingFoodAction, getShoppingListProgressCopy, matchingShoppingInventoryFoods, shoppingQuantityInputValue, validateShoppingReceive, type ShoppingInventoryFood } from "./shoppingListPresentation";
import "./mealShoppingSheets.css";
import { formatQuantityAmount } from "./quantityArithmetic";

const shouldAutoFocusReceiveQuantity = ((import.meta.env.VITE_APP_SHELL as string | undefined)?.trim().toLowerCase() ?? "web") === "native";

type ShoppingListSheetProps = {
  items: ApiShoppingListItem[];
  loading: boolean;
  mutating: boolean;
  error: string;
  notice?: string;
  onRefresh: () => void;
  onToggle: (item: ApiShoppingListItem) => void;
  onDelete: (item: ApiShoppingListItem) => void;
  onAddManual: (input: { canonicalName: string; quantity: number; unit: string }) => Promise<boolean>;
  onReceive: (item: ApiShoppingListItem, input: { quantity: number; storageType: ApiStorageType; storageLocationId?: string | null }) => Promise<boolean>;
  recentlyReceivedFoodName?: string;
  recentlyReceivedFoodQuantity?: string;
  onOpenReceivedFood?: () => void;
  onOpenInventoryFood?: (foodId: string) => void;
  onOpenMeal: () => void;
  initialFocus?: boolean;
  demoMode?: boolean;
  storageLocations: ApiStorageLocation[];
  inventoryFoods?: ShoppingInventoryFood[];
  retryAction?: { label: string; onRetry: () => void } | null;
};

type PendingItemFocus = {
  itemId: string;
  index: number;
  mode: "stay" | "remove";
  items: ApiShoppingListItem[];
};

type PendingManualFocus = {
  canonicalName: string;
  items: ApiShoppingListItem[];
};

const RECEIVE_STORAGE_OPTIONS: Array<{ value: ApiStorageType; label: string }> = [
  { value: "refrigerated", label: "냉장" },
  { value: "frozen", label: "냉동" },
  { value: "ambient", label: "실온" },
];

function formatQuantity(quantity: number) {
  return formatQuantityAmount(quantity);
}

function sourceLabel(item: ApiShoppingListItem) {
  const planCount = item.sources.filter((source) => source.source_type !== "manual").length;
  const hasManualSource = item.sources.some((source) => source.source_type === "manual");
  if (hasManualSource && planCount) return `직접 추가 · 식단 ${planCount}개`;
  if (hasManualSource) return "직접 추가";
  return `식단 ${planCount}개`;
}

function itemLabel(item: ApiShoppingListItem) {
  return `${item.canonical_name} ${item.checked ? "계획 " : ""}${formatQuantity(item.quantity)}${item.unit}, ${sourceLabel(item).replace(/\s+·\s+/g, ", ")}${item.checked ? ", 구매 완료" : ""}`;
}

export default function ShoppingListSheet({
  items,
  loading,
  mutating,
  error,
  notice,
  onRefresh,
  onToggle,
  onDelete,
  onAddManual,
  onReceive,
  recentlyReceivedFoodName,
  recentlyReceivedFoodQuantity,
  onOpenReceivedFood,
  onOpenInventoryFood,
  onOpenMeal,
  initialFocus = false,
  demoMode = false,
  storageLocations,
  inventoryFoods = [],
  retryAction,
}: ShoppingListSheetProps) {
  const keyboard = useKeyboard();
  const receivePanelRef = useRef<HTMLFormElement | null>(null);
  const receiveQuantityRef = useRef<HTMLInputElement | null>(null);
  const manualNameRef = useRef<HTMLInputElement | null>(null);
  const manualQuantityRef = useRef<HTMLInputElement | null>(null);
  const manualUnitRef = useRef<HTMLInputElement | null>(null);
  const receivedFoodActionRef = useRef<HTMLButtonElement | null>(null);
  const shoppingItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const receiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const initialFocusHandledRef = useRef(false);
  const previousErrorRef = useRef(error);
  const retryFocusRef = useRef(false);
  const pendingItemFocusRef = useRef<PendingItemFocus | null>(null);
  const pendingManualFocusRef = useRef<PendingManualFocus | null>(null);
  const previousNoticeRef = useRef(notice);
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnit, setManualUnit] = useState("개");
  const [manualError, setManualError] = useState("");
  const manualErrorField = manualError.startsWith("상품명") ? "name" : manualError.startsWith("수량") ? "quantity" : manualError.startsWith("단위") ? "unit" : null;
  const [receivingItemId, setReceivingItemId] = useState<string | null>(null);
  const [receiveQuantity, setReceiveQuantity] = useState("");
  const [receiveStorageType, setReceiveStorageType] = useState<ApiStorageType | null>(null);
  const [receiveStorageLocationId, setReceiveStorageLocationId] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState("");
  const remainingCount = items.filter((item) => !item.checked).length;
  const completedCount = items.length - remainingCount;
  const customStorageLocations = storageLocations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  const receiveStorageLabel = receiveStorageLocationId
    ? storageLocations.find((location) => location.id === receiveStorageLocationId)?.name
    : RECEIVE_STORAGE_OPTIONS.find((option) => option.value === receiveStorageType)?.label;
  const manualInventoryMatches = matchingShoppingInventoryFoods(manualName, inventoryFoods);
  const findManualShoppingMatch = (name: string, unit: string) => items.find((item) => item.canonical_name.trim().toLocaleLowerCase("ko-KR") === name.trim().toLocaleLowerCase("ko-KR") && item.unit.trim() === unit.trim());
  const manualShoppingMatch = findManualShoppingMatch(manualName, manualUnit);
  const hasExistingManualQuantity = Boolean(manualShoppingMatch?.sources.some((source) => source.source_type === "manual"));
  const manualQuantityHasChange = !hasExistingManualQuantity || Number(manualQuantity) !== manualShoppingMatch!.sources.filter((source) => source.source_type === "manual").reduce((sum, source) => sum + source.quantity, 0);
  const manualQuantityAutofillRef = useRef<{ value: string; previousValue: string } | null>(null);
  const fillExistingManualQuantity = (name: string, unit: string) => {
    const match = findManualShoppingMatch(name, unit);
    if (match && match.id === findManualShoppingMatch(manualName, manualUnit)?.id) return;
    const autofill = manualQuantityAutofillRef.current;
    if (match?.sources.some((source) => source.source_type === "manual")) {
      const value = shoppingQuantityInputValue(match.sources.filter((source) => source.source_type === "manual").reduce((sum, source) => sum + source.quantity, 0));
      manualQuantityAutofillRef.current = { value, previousValue: autofill?.previousValue ?? manualQuantity };
      setManualQuantity(value);
    } else {
      if (autofill && manualQuantity === autofill.value) setManualQuantity(autofill.previousValue);
      manualQuantityAutofillRef.current = null;
    }
  };
  const inventoryReminderVisible = manualInventoryMatches.length > 0
    || items.some((item) => matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods).length > 0);
  const progressPercent = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const progressCopy = getShoppingListProgressCopy({
    loading: loading && items.length === 0,
    error: Boolean(error),
    itemCount: items.length,
    completedCount,
    remainingCount,
  });

  const focusManualEntry = () => revealAndFocus(manualNameRef.current, { block: "center" });
  const revealShoppingField = (event: FocusEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    window.requestAnimationFrame(() => {
      if (field.isConnected) scrollTargetWithinNearestContainer(field, "center", getMobileScrollBehavior());
    });
  };

  useEffect(() => {
    if (!initialFocus) {
      initialFocusHandledRef.current = false;
      return;
    }
    if (loading || mutating || recentlyReceivedFoodName || initialFocusHandledRef.current) {
      // A retry starts a new read cycle. The previous error CTA may have
      // consumed the initial-focus handoff, so re-arm it while loading for
      // the refreshed row or empty-state action to receive focus.
      if (loading) initialFocusHandledRef.current = false;
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
        || (activeElement instanceof HTMLElement && activeElement.classList.contains("sheet-close-button"))
        || !activeElement?.isConnected;
    };
    const findTarget = () => {
      if (error) return document.querySelector<HTMLButtonElement>(".shopping-sheet-error button");
      const remainingItem = items.find((item) => !item.checked);
      if (remainingItem) return shoppingItemRefs.current.get(remainingItem.id) ?? null;
      if (items.length) return receiveButtonRefs.current.get(items[0].id) ?? null;
      return document.querySelector<HTMLElement>(".shopping-sheet-empty .primary-sheet-button, .shopping-sheet-manual-name input");
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || !initialFocus || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || target.hasAttribute("disabled") || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || !initialFocus || !canTakeFocus()) return;
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
  }, [error, initialFocus, items, loading, mutating, recentlyReceivedFoodName]);

  useEffect(() => {
    const pending = pendingItemFocusRef.current;
    const pendingManual = pendingManualFocusRef.current;
    if ((!pending && !pendingManual) || mutating || recentlyReceivedFoodName || pending?.items === items || pendingManual?.items === items) return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingManual && pendingManualFocusRef.current !== pendingManual) return;
      const manualItem = pendingManual ? items.find((item) => item.canonical_name === pendingManual.canonicalName) : null;
      if (pendingManual && !manualItem) return;
      const nextIndex = pending
        ? pending.mode === "remove"
          ? Math.min(pending.index, items.length - 1)
          : items.findIndex((item) => item.id === pending.itemId)
        : -1;
      const nextItem = manualItem ?? (nextIndex >= 0 ? items[nextIndex] : null);
      const target = nextItem ? shoppingItemRefs.current.get(nextItem.id) : null;
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLButtonElement>(".shopping-sheet-manual-submit")?.focus({ preventScroll: true });
      }
      if (pendingManual) {
        setManualName("");
        setManualQuantity("1");
        setManualUnit("개");
        keyboard.hide();
      }
      pendingItemFocusRef.current = null;
      pendingManualFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, keyboard, mutating, recentlyReceivedFoodName]);

  useEffect(() => {
    if (!recentlyReceivedFoodName) return;
    let settleFrame: number | undefined;
    let settleTimer: number | undefined;
    const focusReceivedAction = () => revealAndFocus(receivedFoodActionRef.current, { block: "nearest" });
    const frame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(focusReceivedAction);
      settleTimer = window.setTimeout(focusReceivedAction, 120);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settleFrame !== undefined) window.cancelAnimationFrame(settleFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };
  }, [recentlyReceivedFoodName]);

  useEffect(() => {
    const previousError = previousErrorRef.current;
    previousErrorRef.current = error;
    if (!previousError || error || loading || mutating || !initialFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const remainingItem = items.find((item) => !item.checked);
      const target = remainingItem
        ? shoppingItemRefs.current.get(remainingItem.id)
        : items.length
          ? receiveButtonRefs.current.get(items[0].id)
          : document.querySelector<HTMLButtonElement>(".shopping-sheet-empty .primary-sheet-button, .shopping-sheet-manual-submit");
      target?.focus({ preventScroll: true });
      initialFocusHandledRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, initialFocus, items, loading, mutating]);

  useEffect(() => {
    if (!retryFocusRef.current || loading || error || mutating) return;
    const frame = window.requestAnimationFrame(() => {
      const remainingItem = items.find((item) => !item.checked);
      const target = remainingItem
        ? shoppingItemRefs.current.get(remainingItem.id)
        : items.length
          ? receiveButtonRefs.current.get(items[0].id)
          : document.querySelector<HTMLButtonElement>(".shopping-sheet-empty .primary-sheet-button, .shopping-sheet-manual-submit");
      target?.focus({ preventScroll: true });
      retryFocusRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, items, loading, mutating]);

  useEffect(() => {
    const previousNotice = previousNoticeRef.current;
    previousNoticeRef.current = notice;
    if (!notice || notice === previousNotice || !notice.includes("다른 기기에서")) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest(".shopping-sheet-manual, .shopping-sheet-receive-panel")) return;
    const frame = window.requestAnimationFrame(() => {
      const firstItem = items[0] ? shoppingItemRefs.current.get(items[0].id) : null;
      (firstItem ?? document.querySelector<HTMLButtonElement>(".shopping-sheet-manual-submit"))?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, notice]);

  useEffect(() => {
    if (!receivingItemId) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(receivePanelRef.current, "nearest", getMobileScrollBehavior());
      if (shouldAutoFocusReceiveQuantity) receiveQuantityRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [receivingItemId]);

  const showManualValidationError = (message: string, target: HTMLInputElement | null) => {
    setManualError(message);
    window.requestAnimationFrame(() => {
      if (target?.isConnected) revealAndFocus(target, { block: "center" });
    });
  };

  const manualSubmitBusyRef = useRef(false);
  const manualDraftRevisionRef = useRef(0);
  const markManualDraftChanged = () => {
    manualDraftRevisionRef.current += 1;
    pendingManualFocusRef.current = null;
  };

  const submitManualItem = async () => {
    if (manualSubmitBusyRef.current || mutating || !manualQuantityHasChange) return;
    const draftRevision = manualDraftRevisionRef.current;
    const canonicalName = manualName.trim();
    const quantity = Number(manualQuantity);
    const unit = manualUnit.trim();
    if (!canonicalName) {
      showManualValidationError("상품명을 입력해 주세요.", manualNameRef.current);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showManualValidationError("수량은 0보다 큰 숫자로 입력해 주세요.", manualQuantityRef.current);
      return;
    }
    if (!unit) {
      showManualValidationError("단위를 입력해 주세요.", manualUnitRef.current);
      return;
    }
    setManualError("");
    manualSubmitBusyRef.current = true;
    const focusIntent = { canonicalName, items };
    pendingManualFocusRef.current = focusIntent;
    try {
      const added = await onAddManual({ canonicalName, quantity, unit });
      if (!added) {
        if (pendingManualFocusRef.current === focusIntent) pendingManualFocusRef.current = null;
        return;
      }
      if (draftRevision !== manualDraftRevisionRef.current) return;
      setManualName("");
      manualQuantityAutofillRef.current = null;
      setManualQuantity("1");
      setManualUnit("개");
      keyboard.hide();
    } catch {
      if (pendingManualFocusRef.current === focusIntent) pendingManualFocusRef.current = null;
      if (draftRevision === manualDraftRevisionRef.current) setManualError("장보기 항목이 추가됐는지 확인하지 못했어요. 다시 추가하기 전에 목록을 확인해 주세요.");
    } finally {
      manualSubmitBusyRef.current = false;
    }
  };

  const beginReceive = (item: ApiShoppingListItem) => {
    setReceivingItemId(item.id);
    setReceiveQuantity(shoppingQuantityInputValue(item.quantity));
    setReceiveStorageType(null);
    setReceiveStorageLocationId(null);
    setReceiveError("");
  };

  const cancelReceive = () => {
    const itemId = receivingItemId;
    setReceivingItemId(null);
    setReceiveQuantity("");
    setReceiveStorageType(null);
    setReceiveStorageLocationId(null);
    setReceiveError("");
    keyboard.hide();
    if (itemId) window.requestAnimationFrame(() => {
      const trigger = receiveButtonRefs.current.get(itemId);
      if (trigger && !trigger.disabled) trigger.focus({ preventScroll: true });
    });
  };

  const submitReceive = async (item: ApiShoppingListItem) => {
    if (mutating) return;
    const validated = validateShoppingReceive({ rawQuantity: receiveQuantity, storageType: receiveStorageType, purchased: item.checked });
    if (validated.error !== null) {
      setReceiveError(validated.error);
      return;
    }
    setReceiveError("");
    pendingItemFocusRef.current = { itemId: item.id, index: items.findIndex((candidate) => candidate.id === item.id), mode: "remove", items };
    const received = await onReceive(item, { quantity: validated.quantity, storageType: validated.storageType, storageLocationId: receiveStorageLocationId });
    if (received) cancelReceive();
  };

  return (
    <div className="shopping-sheet-content" aria-label="장보기 목록" aria-busy={loading || mutating} data-received-food-name={recentlyReceivedFoodName || undefined}>
      {items.length ? (
        <section className={`shopping-sheet-progress${progressCopy.tone === "neutral" ? "" : ` shopping-sheet-progress-${progressCopy.tone}`}`} aria-label={progressCopy.tone === "neutral" ? "장보기 목록 상태" : "구매 현황"}>
          <div className="shopping-sheet-progress-heading">
            <span><strong>{progressCopy.title}</strong>{progressCopy.description ? <small>{progressCopy.description}</small> : null}</span>
            {progressCopy.countLabel ? <em>{progressCopy.countLabel}</em> : null}
          </div>
          {items.length ? <div className="shopping-sheet-progress-track" role="progressbar" aria-label="장보기 완료율" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completedCount}><span style={{ width: `${progressPercent}%` }} /></div> : null}
        </section>
      ) : null}

      {demoMode ? <div className="shopping-sheet-preview-note" role="note"><InfoCircledIcon width={15} height={15} /><span>미리보기 내용은 저장되지 않아요.</span></div> : null}

      {notice ? <div className="shopping-sheet-refresh-notice" data-readback-state="notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? (
        <div className="shopping-sheet-error" role="alert">
          <InfoCircledIcon width={16} height={16} />
          <span>{error}</span>
          <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { retryFocusRef.current = true; (retryAction?.onRetry ?? onRefresh)(); }} disabled={loading || mutating}>{retryAction?.label ?? "다시 시도"}</button>
        </div>
      ) : null}

      {recentlyReceivedFoodName && onOpenReceivedFood ? (
        <div className="receipt-review-contract shopping-sheet-received" data-readback-state="confirmed" role="status" aria-live="polite">
          <CheckCircledIcon width={15} height={15} />
          <span><strong><Metadata parts={[recentlyReceivedFoodName, recentlyReceivedFoodQuantity, "식품 목록에 추가했어요"]} /></strong><small>포장지 날짜와 보관 방법을 살펴봐 주세요.</small></span>
          <button ref={receivedFoodActionRef} className="primary-sheet-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={onOpenReceivedFood}>식품 보기</button>
        </div>
      ) : null}

      {loading && !items.length ? (
        <div className="shopping-sheet-state shopping-sheet-loading" role="status">
          <span className="shopping-sheet-state-icon"><ReaderIcon width={17} height={17} /></span>
          <span><strong>장보기 목록을 불러오고 있어요</strong></span>
        </div>
      ) : items.length ? (
        <section className="shopping-sheet-list-section" aria-label="장보기 항목">
          <div className="shopping-sheet-list-heading">
            <span><strong>재료 목록</strong></span>
            {loading ? <span className="shopping-sheet-syncing" role="status">목록 업데이트 중</span> : null}
          </div>
          <div className="shopping-sheet-list" role="list">
            {items.map((item) => (
              <div className="shopping-sheet-row-group" role="listitem" key={item.id}>
                <div className={`shopping-sheet-row${item.checked ? " shopping-sheet-row-checked" : ""}`}>
                  <button
                    ref={(element) => {
                      if (element) shoppingItemRefs.current.set(item.id, element);
                      else shoppingItemRefs.current.delete(item.id);
                    }}
                    className="shopping-sheet-item"
                    type="button"
                    aria-label={itemLabel(item)}
                    aria-pressed={item.checked}
                    disabled={mutating}
                    aria-busy={mutating}
                    onClick={() => {
                      pendingItemFocusRef.current = { itemId: item.id, index: items.findIndex((candidate) => candidate.id === item.id), mode: "stay", items };
                      onToggle(item);
                    }}
                  >
                    <span className="shopping-sheet-check" aria-hidden="true">{item.checked ? <CheckCircledIcon width={16} height={16} /> : null}</span>
                    <span className="shopping-sheet-copy">
                      <strong>{item.canonical_name}</strong>
                      <small><MetadataText text={<>{item.checked ? "계획 " : ""}{formatQuantity(item.quantity)}{item.unit} · {sourceLabel(item)}</>} /></small>
                      {item.checked ? <small>구매 완료</small> : null}
                    </span>
                  </button>
                  <div className="shopping-sheet-actions" role="group" aria-label={`${item.canonical_name} 장보기 항목 행동`}>
                    {shoppingFoodAction(item, inventoryFoods, Boolean(onOpenInventoryFood)) === "recorded" ? <span className="shopping-sheet-recorded-state">식품 추가 완료</span> : <button
                      ref={(element) => {
                        if (element) receiveButtonRefs.current.set(item.id, element);
                        else receiveButtonRefs.current.delete(item.id);
                      }}
                      className={`shopping-sheet-receive${receivingItemId === item.id ? " shopping-sheet-receive-active" : ""}`}
                      type="button"
                      aria-label={`${item.canonical_name} ${item.received_food_id ? "추가한 식품 보기" : "식품 목록에 추가"}`}
                      aria-expanded={item.received_food_id ? undefined : receivingItemId === item.id}
                      disabled={mutating || Boolean(item.received_food_id && (!onOpenInventoryFood || !inventoryFoods.some((food) => food.id === item.received_food_id)))}
                      aria-busy={mutating}
                      onClick={() => item.received_food_id ? onOpenInventoryFood?.(item.received_food_id) : receivingItemId === item.id ? cancelReceive() : beginReceive(item)}
                    >
                      <ArchiveIcon width={13} height={13} /> {item.received_food_id ? "추가한 식품 보기" : "식품 목록에 추가"}
                    </button>}
                    <button
                      className="shopping-sheet-delete"
                      type="button"
                      aria-label={`${item.canonical_name} 장보기 항목 삭제`}
                      disabled={mutating}
                      aria-busy={mutating}
                      onClick={() => {
                        pendingItemFocusRef.current = { itemId: item.id, index: items.findIndex((candidate) => candidate.id === item.id), mode: "remove", items };
                        onDelete(item);
                      }}
                    >
                      <Cross2Icon width={14} height={14} />
                    </button>
                  </div>
                </div>
                {matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods).length ? (
                  <details className="shopping-sheet-existing-stock">
                    <summary onPointerDown={(event) => event.preventDefault()}>같은 식품의 보관 수량 보기</summary>
                    <ShoppingStockList foods={matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods)} />
                  </details>
                ) : null}
                {receivingItemId === item.id ? (
                  <form
                    className="shopping-sheet-receive-panel"
                    ref={receivePanelRef}
                    aria-label={`${item.canonical_name} 식품 목록에 추가`}
                    aria-busy={mutating}
                    onSubmit={(event) => { event.preventDefault(); void submitReceive(item); }}
                  >
                    <div className="shopping-sheet-receive-heading">
                      <strong>{item.canonical_name} 구매 정보</strong>
                      {matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods).length ? <small className="shopping-sheet-record-reminder">같은 이름의 식품이 있어요. 이미 기록한 구매인지 보관 수량을 먼저 확인해 주세요.</small> : null}
                    </div>
                    <div className="shopping-sheet-receive-fields">
                      <label className="shopping-sheet-receive-field shopping-sheet-receive-quantity">
                        <span>구매 수량</span>
                        <div className="shopping-sheet-quantity-with-unit"><KeyboardInput
                          ref={receiveQuantityRef}
                          className="app-input"
                          type="number"
                          min="0"
                          max="100000"
                          step="any"
                          inputMode="decimal"
                          value={receiveQuantity}
                          disabled={mutating}
                          aria-label={`${item.canonical_name} 구매 수량`}
                          aria-describedby={`shopping-sheet-receive-unit-${item.id}`}
                          onFocus={revealShoppingField}
                          onChange={(event) => { setReceiveQuantity(event.target.value); setReceiveError(""); }}
                          onBlur={() => keyboard.hide()}
                        /><span id={`shopping-sheet-receive-unit-${item.id}`}>{item.unit}</span></div>
                      </label>
                      <div className="shopping-sheet-receive-field">
                        <span>보관 위치</span>
                        <div className="shopping-sheet-storage-picker" role="group" aria-label={`${item.canonical_name} 보관 위치`}>
                          {RECEIVE_STORAGE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              className={!receiveStorageLocationId && receiveStorageType === option.value ? "shopping-sheet-storage-option shopping-sheet-storage-option-active" : "shopping-sheet-storage-option"}
                              type="button"
                              disabled={mutating}
                              aria-pressed={!receiveStorageLocationId && receiveStorageType === option.value}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => { setReceiveStorageType(option.value); setReceiveStorageLocationId(null); setReceiveError(""); }}
                            >
                              {option.label}
                            </button>
                          ))}
                          {customStorageLocations.length ? <div className="shopping-sheet-custom-storage-options" role="group" aria-label="사용자 정의 보관 위치"><span className="shopping-sheet-custom-storage-heading">내 보관 위치</span>{customStorageLocations.map((location) => <button key={location.id} className={receiveStorageLocationId === location.id ? "shopping-sheet-storage-option shopping-sheet-storage-option-active shopping-sheet-custom-storage-option" : "shopping-sheet-storage-option shopping-sheet-custom-storage-option"} type="button" disabled={mutating} aria-pressed={receiveStorageLocationId === location.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { setReceiveStorageType(location.storage_type); setReceiveStorageLocationId(location.id); setReceiveError(""); }}>{location.name}</button>)}</div> : null}
                        </div>
                      </div>
                    </div>
                    {!item.checked ? (
                      <div className="shopping-sheet-purchase-check" role="group" aria-label={`${item.canonical_name} 구매 완료 확인`}>
                        <span><strong>구매가 끝났나요?</strong><small id={`shopping-sheet-purchase-hint-${item.id}`}>구매 완료로 표시한 뒤 식품 목록에 추가할 수 있어요.</small></span>
                        <button type="button" disabled={mutating} aria-busy={mutating} onPointerDown={(event) => event.preventDefault()} onClick={() => onToggle(item)}>구매 완료로 표시</button>
                      </div>
                    ) : null}
                    <p className="shopping-sheet-receive-note"><InfoCircledIcon width={13} height={13} /> 소비기한은 자동으로 정하지 않아요. 식품 목록에 추가한 뒤 포장지 날짜와 보관 방법을 살펴봐 주세요.</p>
                    <p id={`shopping-sheet-save-summary-${item.id}`} className="shopping-sheet-save-summary" aria-live="polite">
                      {Number.isFinite(Number(receiveQuantity)) && Number(receiveQuantity) > 0
                        ? <><strong>추가할 내용</strong><span><Metadata parts={[item.canonical_name, `${formatQuantity(Number(receiveQuantity))}${item.unit}`, receiveStorageLabel ?? "보관 위치를 선택해 주세요"]} /></span></>
                        : "실제로 구매한 수량을 입력해 주세요."}
                    </p>
                    {receiveError ? <p className="shopping-sheet-receive-error" role="alert">{receiveError}</p> : null}
                    <div className="shopping-sheet-receive-actions">
                      <button className="shopping-sheet-receive-cancel" type="button" disabled={mutating} aria-busy={mutating} onPointerDown={(event) => event.preventDefault()} onClick={cancelReceive}>취소</button>
                      <button
                        className="shopping-sheet-receive-submit"
                        type="submit"
                        disabled={mutating || !item.checked || !receiveStorageType}
                        aria-describedby={`shopping-sheet-save-summary-${item.id}${!item.checked ? ` shopping-sheet-purchase-hint-${item.id}` : ""}`}
                        aria-busy={mutating}
                        onPointerDown={(event) => {
                          event.preventDefault();
                        }}
                      >{mutating ? "추가 중" : !receiveStorageType ? "보관 위치를 골라 주세요" : "식품 목록에 추가"}</button>
                    </div>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
          {(demoMode || shoppingAdjustmentNote(items)) ? <p className="shopping-sheet-note"><ArrowRightIcon width={13} height={13} />{demoMode ? "미리보기에서는 식품 목록에 넣은 수량만큼 장보기 목록에서 빠져요." : shoppingAdjustmentNote(items)}</p> : null}
        </section>
      ) : error || recentlyReceivedFoodName ? null : (
        <div className="shopping-sheet-state shopping-sheet-empty" role="status" style={{ flexWrap: "wrap" }}>
          <span><strong>목록에 무엇을 담을까요?</strong></span>
          <div className="shopping-sheet-receive-actions" style={{ width: "100%", flexBasis: "100%" }}>
            <button className="primary-sheet-button" style={{ width: "auto", minHeight: 44, flex: "1 1 auto", padding: "0 10px", fontSize: 12 }} type="button" onClick={inventoryFoods.length ? onOpenMeal : focusManualEntry}><ReaderIcon width={15} height={15} /> {inventoryFoods.length ? "식단에서 재료 고르기" : "살 식품 직접 추가"} <ArrowRightIcon width={14} height={14} /></button>
            {demoMode
              ? inventoryFoods.length ? <button className="secondary-sheet-button" style={{ width: "auto", minHeight: 44, flex: "0 0 auto", padding: "0 10px" }} type="button" onClick={focusManualEntry}>직접 추가</button> : null
              : <button className="secondary-sheet-button" style={{ width: "auto", minHeight: 44, flex: "0 0 auto", padding: "0 10px" }} type="button" onClick={onRefresh} disabled={loading}>새로 고침</button>}
          </div>
        </div>
      )}

      <section className="shopping-sheet-manual" aria-label="직접 장보기 추가">
        <div className="shopping-sheet-manual-heading">
          <span><strong>직접 추가</strong></span>
        </div>
        <form className="shopping-sheet-manual-form" onSubmit={(event) => { event.preventDefault(); void submitManualItem(); }}>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-name">
            <span>상품명</span>
            <KeyboardInput ref={manualNameRef} className="app-input" value={manualName} maxLength={160} autoComplete="off" placeholder="예: 우유" aria-label="직접 추가 상품명" aria-invalid={manualErrorField === "name"} aria-describedby={manualErrorField === "name" ? "shopping-manual-error" : undefined} onFocus={revealShoppingField} onChange={(event) => { markManualDraftChanged(); setManualName(event.target.value); fillExistingManualQuantity(event.target.value, manualUnit); if (manualErrorField === "name" || manualErrorField === null) setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-quantity">
            <span>수량</span>
            <KeyboardInput ref={manualQuantityRef} className="app-input" type="number" min="0" max="100000" step="any" inputMode="decimal" value={manualQuantity} aria-label="직접 추가 수량" aria-invalid={manualErrorField === "quantity"} aria-describedby={manualErrorField === "quantity" ? "shopping-manual-error" : undefined} onFocus={revealShoppingField} onChange={(event) => { markManualDraftChanged(); manualQuantityAutofillRef.current = null; setManualQuantity(event.target.value); if (manualErrorField === "quantity" || manualErrorField === null) setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-unit">
            <span>단위</span>
            <KeyboardInput ref={manualUnitRef} className="app-input" value={manualUnit} maxLength={30} autoComplete="off" placeholder="개" aria-label="직접 추가 단위" aria-invalid={manualErrorField === "unit"} aria-describedby={manualErrorField === "unit" ? "shopping-manual-error" : undefined} onFocus={revealShoppingField} onChange={(event) => { markManualDraftChanged(); setManualUnit(event.target.value); fillExistingManualQuantity(manualName, event.target.value); if (manualErrorField === "unit" || manualErrorField === null) setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <button
            className="shopping-sheet-manual-submit"
            type="submit"
            disabled={mutating || !manualQuantityHasChange}
            aria-busy={mutating}
            onPointerDown={(event) => {
              event.preventDefault();
            }}
          >{hasExistingManualQuantity ? "수량 변경" : "추가"}</button>
        </form>
        {manualError ? <p id="shopping-manual-error" className="shopping-sheet-manual-error" role="alert">{manualError}</p> : null}
        {manualInventoryMatches.length ? <div className="shopping-sheet-manual-stock" role="status"><span>보관 중인 수량</span><ShoppingStockList foods={manualInventoryMatches} /></div> : null}
        {inventoryReminderVisible ? <button className="shopping-sheet-stock-refresh" type="button" disabled={loading || mutating} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { onRefresh(); keyboard.hide(); }}>보관 수량 새로고침</button> : null}
        {manualShoppingMatch?.sources.some((source) => source.source_type !== "manual") ? <p className="shopping-sheet-manual-note">{hasExistingManualQuantity ? "직접 추가한 수량을 입력한 값으로 바꿔요. 식단에서 담은 수량은 유지돼요." : "식단에서 담은 수량에 더해요."}</p> : null}
      </section>
    </div>
  );
}
