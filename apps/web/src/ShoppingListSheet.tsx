import { ShoppingStockList } from "./ShoppingStockList";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { CheckCircledIcon, Cross2Icon, InfoCircledIcon, MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile/Keyboard";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import type { ApiShoppingListItem, ApiStorageLocation, ApiStorageType } from "./mealApi";
import { shoppingAdjustmentNote, shoppingFoodAction, getShoppingListProgressCopy, matchingShoppingInventoryFoods, defaultReceiveStorage, shoppingQuantityInputValue, validateShoppingReceive, shoppingSourceBadges, shoppingStorageLabel, shoppingBulkReceivePlan, type ShoppingBulkReceiveEntry, type ShoppingInventoryFood } from "./shoppingListPresentation";
import { FoodPhoto } from "./FoodPhoto";
import { imageForKnownFoodName } from "./foodPhotos";
import { withKoreanObjectParticle } from "./koreanParticles";
import "./shoppingScreen.css";
import { formatQuantityAmount } from "./quantityArithmetic";
import { parseShoppingEntry, shoppingQuantityStep, shoppingSuggestions, type FinishedFoodEntry, type ShoppingShortage, type ShoppingSuggestion } from "./shoppingSuggestions";

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
  /** Puts every bought item away with its default storage; resolves with how many were put away. */
  onReceiveAll?: (entries: ShoppingBulkReceiveEntry[]) => Promise<number>;
  /** Set after a bulk put-away of two or more items; the readback then offers 냉장고 보기. */
  bulkReceivedCount?: number;
  onOpenFridge?: () => void;
  recentlyReceivedFoodName?: string;
  recentlyReceivedFoodQuantity?: string;
  onOpenReceivedFood?: () => void;
  onOpenInventoryFood?: (foodId: string) => void;
  onOpenMeal: () => void;
  initialFocus?: boolean;
  /** False while the 장보기 tab is hidden or covered by a sheet; focus hand-offs wait for it. */
  active?: boolean;
  /** Changes whenever the received-food readback is (re)announced, so focus returns to its action. */
  receivedFoodToken?: unknown;
  demoMode?: boolean;
  storageLocations: ApiStorageLocation[];
  inventoryFoods?: ShoppingInventoryFood[];
  retryAction?: { label: string; onRetry: () => void } | null;
  /** Foods this workspace used up recently (shoppingSuggestions.ts). */
  finishedFoods?: readonly FinishedFoodEntry[];
  /** `사야 함` of the recipe chosen on the 식단 tab. */
  mealShortages?: readonly ShoppingShortage[];
  referenceDate?: Date;
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

/** Confirmations the list itself already shows (a check, a new row) are spoken, not printed. */
const QUIET_NOTICE = /^(구매 완료로 표시했어요\.|구매 예정으로 바꿨어요\.|.+ 장보기 목록에 추가했어요|.+ 수량을 변경했어요)$/;

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
  onReceiveAll,
  bulkReceivedCount,
  onOpenFridge,
  recentlyReceivedFoodName,
  recentlyReceivedFoodQuantity,
  onOpenReceivedFood,
  onOpenInventoryFood,
  onOpenMeal,
  initialFocus = false,
  active = true,
  receivedFoodToken,
  demoMode = false,
  storageLocations,
  inventoryFoods = [],
  retryAction,
  finishedFoods = [],
  mealShortages = [],
  referenceDate,
}: ShoppingListSheetProps) {
  const keyboard = useKeyboard();
  const receivePanelRef = useRef<HTMLFormElement | null>(null);
  const receiveQuantityRef = useRef<HTMLInputElement | null>(null);
  const manualNameRef = useRef<HTMLInputElement | null>(null);
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
  const [manualError, setManualError] = useState("");
  const manualErrorField = manualError.startsWith("상품명") ? "name" : null;
  const pendingSuggestionFocusRef = useRef<{ source: ShoppingSuggestion["source"]; index: number; items: ApiShoppingListItem[] } | null>(null);
  const pendingStepFocusRef = useRef<{ itemId: string; direction: "down" | "up" } | null>(null);
  const [receivingItemId, setReceivingItemId] = useState<string | null>(null);
  const [receiveQuantity, setReceiveQuantity] = useState("");
  const [receiveStorageType, setReceiveStorageType] = useState<ApiStorageType | null>(null);
  const [receiveStorageLocationId, setReceiveStorageLocationId] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState("");
  const [justToggledId, setJustToggledId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkOpenRef = useRef<HTMLButtonElement | null>(null);
  const bulkConfirmRef = useRef<HTMLButtonElement | null>(null);
  const bulkReadbackActionRef = useRef<HTMLButtonElement | null>(null);
  const remainingCount = items.filter((item) => !item.checked).length;
  const completedCount = items.length - remainingCount;
  const customStorageLocations = storageLocations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  const receiveStorageLabel = receiveStorageLocationId
    ? storageLocations.find((location) => location.id === receiveStorageLocationId)?.name
    : RECEIVE_STORAGE_OPTIONS.find((option) => option.value === receiveStorageType)?.label;
  // One field: name, optionally an amount and unit (`우유 2팩`); amount 1 and a guessed unit otherwise.
  const manualDraft = parseShoppingEntry(manualName);
  const manualInventoryMatches = manualDraft ? matchingShoppingInventoryFoods(manualDraft.name, inventoryFoods) : [];
  const findManualShoppingMatch = (name: string, unit: string | null) => items.find((item) => item.canonical_name.trim().toLocaleLowerCase("ko-KR") === name.trim().toLocaleLowerCase("ko-KR") && (unit === null || item.unit.trim() === unit.trim()));
  // Without a typed unit, `우유` joins whatever 우유 is already on the list (팩, 개, …).
  const manualShoppingMatch = manualDraft ? findManualShoppingMatch(manualDraft.name, manualDraft.unitGiven ? manualDraft.unit : null) : undefined;
  const manualQuantityOf = (item: ApiShoppingListItem) => item.sources.filter((source) => source.source_type === "manual").reduce((sum, source) => sum + source.quantity, 0);
  const suggestions = shoppingSuggestions({
    finished: finishedFoods,
    shortages: mealShortages,
    inventoryNames: inventoryFoods.map((food) => food.name),
    listNames: items.map((item) => item.canonical_name),
    now: referenceDate ?? new Date(),
  });
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

  const revealShoppingField = (event: FocusEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    // Prefilled quantity/unit: select it so typing replaces "1"/"개" instead of appending.
    if (field.dataset.selectOnFocus === "true") field.select();
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
        || (activeElement instanceof HTMLElement && (activeElement.classList.contains("sheet-close-button") || activeElement.classList.contains("app-bottom-nav-item")))
        || (activeElement instanceof HTMLElement && (Boolean(activeElement.closest("[hidden]")) || activeElement.getClientRects().length === 0))
        || !activeElement?.isConnected;
    };
    const findTarget = () => {
      if (error) return document.querySelector<HTMLButtonElement>(".shop-error button");
      const remainingItem = items.find((item) => !item.checked);
      if (remainingItem) return shoppingItemRefs.current.get(remainingItem.id) ?? null;
      if (items.length) return receiveButtonRefs.current.get(items[0].id) ?? null;
      return (document.querySelector<HTMLElement>(".shop-empty button") ?? document.querySelector<HTMLElement>(".shop-add-name"));
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
        (document.querySelector<HTMLButtonElement>(".shop-empty button") ?? document.querySelector<HTMLButtonElement>(".shop-add-submit"))?.focus({ preventScroll: true });
      }
      if (pendingManual) {
        setManualName("");
        keyboard.hide();
      }
      pendingItemFocusRef.current = null;
      pendingManualFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, keyboard, mutating, recentlyReceivedFoodName]);

  useEffect(() => {
    const pending = pendingSuggestionFocusRef.current;
    if (!pending || mutating || pending.items === items) return;
    const frame = window.requestAnimationFrame(() => {
      pendingSuggestionFocusRef.current = null;
      const buttons = (source: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(`.shop-suggest-list[data-source="${source}"] .shop-suggest-add`));
      const same = buttons(pending.source);
      const other = buttons(pending.source === "meal" ? "finished" : "meal");
      (same[Math.min(pending.index, same.length - 1)] ?? other[0] ?? manualNameRef.current)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, mutating]);

  useEffect(() => {
    const pending = pendingStepFocusRef.current;
    if (!pending || mutating) return;
    const frame = window.requestAnimationFrame(() => {
      pendingStepFocusRef.current = null;
      const stepper = document.querySelector<HTMLElement>(`[data-shop-stepper="${CSS.escape(pending.itemId)}"]`);
      const preferred = stepper?.querySelector<HTMLButtonElement>(`[data-step="${pending.direction}"]`);
      const target = preferred && !preferred.disabled ? preferred : stepper?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? shoppingItemRefs.current.get(pending.itemId);
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, mutating]);

  useEffect(() => {
    if (!recentlyReceivedFoodName || !active) return;
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
  }, [recentlyReceivedFoodName, active, receivedFoodToken]);

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
          : (document.querySelector<HTMLButtonElement>(".shop-empty button") ?? document.querySelector<HTMLButtonElement>(".shop-add-submit"));
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
          : (document.querySelector<HTMLButtonElement>(".shop-empty button") ?? document.querySelector<HTMLButtonElement>(".shop-add-submit"));
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
    if (activeElement instanceof HTMLElement && activeElement.closest(".shop-add, .shop-receive-form, .shop-bulk")) return;
    const frame = window.requestAnimationFrame(() => {
      const firstItem = items[0] ? shoppingItemRefs.current.get(items[0].id) : null;
      (firstItem ?? document.querySelector<HTMLButtonElement>(".shop-add-submit"))?.focus({ preventScroll: true });
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

  useEffect(() => {
    if (!justToggledId) return;
    const timer = window.setTimeout(() => setJustToggledId(null), 700);
    return () => window.clearTimeout(timer);
  }, [justToggledId]);

  useEffect(() => {
    if (!bulkConfirming) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(bulkConfirmRef.current, "nearest", getMobileScrollBehavior());
      bulkConfirmRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bulkConfirming]);

  useEffect(() => {
    if (!bulkReceivedCount || bulkReceivedCount < 2 || !active) return;
    const frame = window.requestAnimationFrame(() => revealAndFocus(bulkReadbackActionRef.current, { block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [bulkReceivedCount, active]);

  const runBulkReceive = async () => {
    if (!onReceiveAll || bulkBusy || mutating) return;
    const plan = shoppingBulkReceivePlan(items, inventoryFoods);
    if (!plan.length) return;
    setBulkBusy(true);
    try {
      await onReceiveAll(plan);
    } finally {
      setBulkBusy(false);
      setBulkConfirming(false);
    }
  };

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
    if (manualSubmitBusyRef.current || mutating) return;
    const draftRevision = manualDraftRevisionRef.current;
    if (!manualDraft) {
      showManualValidationError("상품명을 입력해 주세요.", manualNameRef.current);
      return;
    }
    const canonicalName = manualShoppingMatch?.canonical_name ?? manualDraft.name;
    const unit = manualShoppingMatch?.unit ?? manualDraft.unit;
    // The list keeps one manual amount per item: an item already on it grows by the new amount.
    const quantity = (manualShoppingMatch ? manualQuantityOf(manualShoppingMatch) : 0) + manualDraft.quantity;
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
      keyboard.hide();
    } catch {
      if (pendingManualFocusRef.current === focusIntent) pendingManualFocusRef.current = null;
      if (draftRevision === manualDraftRevisionRef.current) setManualError("장보기 항목이 추가됐는지 확인하지 못했어요. 다시 추가하기 전에 목록을 확인해 주세요.");
    } finally {
      manualSubmitBusyRef.current = false;
    }
  };

  /** One-tap suggestion: added with its own amount; focus moves to the next suggestion once the list has it. */
  const addSuggestion = async (suggestion: ShoppingSuggestion, index: number) => {
    if (manualSubmitBusyRef.current || mutating) return;
    const existing = findManualShoppingMatch(suggestion.name, suggestion.unit);
    manualSubmitBusyRef.current = true;
    pendingSuggestionFocusRef.current = { source: suggestion.source, index, items };
    try {
      const added = await onAddManual({ canonicalName: suggestion.name, quantity: (existing ? manualQuantityOf(existing) : 0) + suggestion.quantity, unit: suggestion.unit });
      if (!added) pendingSuggestionFocusRef.current = null;
    } catch {
      pendingSuggestionFocusRef.current = null;
      setManualError("장보기 항목이 추가됐는지 확인하지 못했어요. 다시 추가하기 전에 목록을 확인해 주세요.");
    } finally {
      manualSubmitBusyRef.current = false;
    }
  };

  /** Row stepper: changes the item's own (manual) amount; a recipe's amount is never reduced here. */
  const stepQuantity = async (item: ApiShoppingListItem, direction: "down" | "up") => {
    if (manualSubmitBusyRef.current || mutating) return;
    const step = shoppingQuantityStep(item.unit);
    const nextManual = Math.round((manualQuantityOf(item) + (direction === "up" ? step : -step)) * 1000) / 1000;
    if (nextManual <= 0 || nextManual > 100000) return;
    manualSubmitBusyRef.current = true;
    pendingStepFocusRef.current = { itemId: item.id, direction };
    try {
      const changed = await onAddManual({ canonicalName: item.canonical_name, quantity: nextManual, unit: item.unit });
      if (!changed) pendingStepFocusRef.current = null;
    } catch {
      pendingStepFocusRef.current = null;
      setManualError("수량이 바뀌었는지 확인하지 못했어요. 목록을 확인해 주세요.");
    } finally {
      manualSubmitBusyRef.current = false;
    }
  };

  const beginReceive = (item: ApiShoppingListItem) => {
    setBulkConfirming(false);
    setReceivingItemId(item.id);
    setReceiveQuantity(shoppingQuantityInputValue(item.quantity));
    setReceiveStorageType(defaultReceiveStorage(item.canonical_name, inventoryFoods));
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

  const renderStock = (item: ApiShoppingListItem) => {
    const stock = matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods);
    if (!stock.length) return null;
    return (
      <details className="shop-stock">
        <summary onPointerDown={(event) => event.preventDefault()}>{stock.length === 1 ? `집에 ${stock[0].quantity} 있어요` : `집에 ${stock.length}곳 있어요`}</summary>
        <ShoppingStockList foods={stock} />
      </details>
    );
  };

  const renderStepper = (item: ApiShoppingListItem) => {
    const step = shoppingQuantityStep(item.unit);
    const manual = manualQuantityOf(item);
    const busy = mutating || bulkBusy;
    return (
      <div className="shop-stepper" role="group" aria-label={`${item.canonical_name} 수량`} data-shop-stepper={item.id}>
        <button type="button" data-step="down" aria-label={`${item.canonical_name} ${formatQuantity(step)}${item.unit} 줄이기`} disabled={busy || manual - step <= 0} onPointerDown={(event) => event.preventDefault()} onClick={() => void stepQuantity(item, "down")}><MinusIcon width={15} height={15} aria-hidden="true" /></button>
        <span className="shop-stepper-value" aria-live="polite">{formatQuantity(item.quantity)}{item.unit}</span>
        <button type="button" data-step="up" aria-label={`${item.canonical_name} ${formatQuantity(step)}${item.unit} 늘리기`} disabled={busy || manual + step > 100000} onPointerDown={(event) => event.preventDefault()} onClick={() => void stepQuantity(item, "up")}><PlusIcon width={15} height={15} aria-hidden="true" /></button>
      </div>
    );
  };

  const renderSuggestionSection = (source: ShoppingSuggestion["source"], title: string, list: ShoppingSuggestion[]) => list.length ? (
    <section className="shop-section shop-suggest" aria-labelledby={`shop-suggest-${source}-title`}>
      <h3 id={`shop-suggest-${source}-title`}>{title}</h3>
      <ul className="shop-list shop-suggest-list" data-source={source}>
        {list.map((suggestion, index) => {
          return (
            <li className="shop-suggest-row" key={suggestion.key}>
              {/* No known photo: the shared placeholder (tint for the food's kind plus icon), not a letter. */}
              <FoodPhoto className="shop-thumb" src={imageForKnownFoodName(suggestion.name) ?? ""} foodName={suggestion.name} alt="" />
              <span className="shop-copy"><strong>{suggestion.name}</strong><span className="shop-qty">{formatQuantity(suggestion.quantity)}{suggestion.unit}</span></span>
              <button className="shop-suggest-add" type="button" aria-label={`${suggestion.name} ${formatQuantity(suggestion.quantity)}${suggestion.unit} 장보기에 추가`} disabled={mutating || bulkBusy} onPointerDown={(event) => event.preventDefault()} onClick={() => void addSuggestion(suggestion, index)}><PlusIcon width={15} height={15} aria-hidden="true" />추가</button>
            </li>
          );
        })}
      </ul>
    </section>
  ) : null;

  const renderRow = (item: ApiShoppingListItem) => {
    const action = shoppingFoodAction(item, inventoryFoods, Boolean(onOpenInventoryFood));
    const photo = imageForKnownFoodName(item.canonical_name);
    return (
      <li className="shop-row" key={item.id} data-checked={item.checked || undefined} data-just-toggled={justToggledId === item.id || undefined}>
        <div className="shop-row-main">
          <button
            ref={(element) => {
              if (element) shoppingItemRefs.current.set(item.id, element);
              else shoppingItemRefs.current.delete(item.id);
            }}
            className="shop-toggle"
            type="button"
            aria-label={itemLabel(item)}
            aria-pressed={item.checked}
            disabled={mutating || bulkBusy}
            aria-busy={mutating}
            onClick={() => {
              pendingItemFocusRef.current = { itemId: item.id, index: items.findIndex((candidate) => candidate.id === item.id), mode: "stay", items };
              setJustToggledId(item.id);
              onToggle(item);
            }}
          >
            <span className="shop-check" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" /></svg></span>
            {photo ? <FoodPhoto className="shop-thumb" src={photo} foodName={item.canonical_name} alt="" /> : <span className="shop-thumb shop-thumb-letter" aria-hidden="true">{Array.from(item.canonical_name.trim())[0] ?? ""}</span>}
            <span className="shop-copy">
              <strong>{item.canonical_name}</strong>
              {item.checked ? <span className="shop-qty">{formatQuantity(item.quantity)}{item.unit}</span> : null}
              {shoppingSourceBadges(item).map((badge) => <span className="shop-badge" key={badge}>{badge}</span>)}
            </span>
          </button>
          {item.checked ? action === "recorded" ? <span className="shop-recorded">넣었어요</span> : <button
            ref={(element) => {
              if (element) receiveButtonRefs.current.set(item.id, element);
              else receiveButtonRefs.current.delete(item.id);
            }}
            className="shop-receive"
            type="button"
            aria-label={`${item.canonical_name} ${item.received_food_id ? "식품 보기" : "냉장고에 넣기"}`}
            aria-expanded={item.received_food_id ? undefined : receivingItemId === item.id}
            disabled={mutating || bulkBusy || Boolean(item.received_food_id && action !== "view")}
            aria-busy={mutating}
            onClick={() => item.received_food_id ? onOpenInventoryFood?.(item.received_food_id) : receivingItemId === item.id ? cancelReceive() : beginReceive(item)}
          >{item.received_food_id ? "식품 보기" : "넣기"}</button> : null}
          <button
            className="shop-delete"
            type="button"
            aria-label={`${item.canonical_name} 장보기 항목 삭제`}
            disabled={mutating || bulkBusy}
            aria-busy={mutating}
            onClick={() => {
              pendingItemFocusRef.current = { itemId: item.id, index: items.findIndex((candidate) => candidate.id === item.id), mode: "remove", items };
              onDelete(item);
            }}
          >
            <Cross2Icon width={15} height={15} aria-hidden="true" />
          </button>
        </div>
        {item.checked ? null : renderStepper(item)}
        {renderStock(item)}
        {receivingItemId === item.id ? (
          <form
            className="shop-receive-form"
            ref={receivePanelRef}
            aria-label={`${item.canonical_name} 냉장고에 넣기`}
            aria-busy={mutating}
            onSubmit={(event) => { event.preventDefault(); void submitReceive(item); }}
          >
            {matchingShoppingInventoryFoods(item.canonical_name, inventoryFoods).length ? <p className="shop-receive-hint">이름이 같은 식품이 이미 있어요. 같은 구매를 두 번 넣지 않았는지 확인해 주세요.</p> : null}
            <label className="shop-field">
              <span>산 양</span>
              <span className="shop-qty-unit"><KeyboardInput
                ref={receiveQuantityRef}
                className="app-input"
                type="number"
                min="0"
                max="100000"
                step="any"
                inputMode="decimal"
                value={receiveQuantity}
                data-select-on-focus="true"
                disabled={mutating}
                aria-label={`${item.canonical_name} 구매 수량`}
                aria-describedby={`shop-receive-unit-${item.id}`}
                onFocus={revealShoppingField}
                onChange={(event) => { setReceiveQuantity(event.target.value); setReceiveError(""); }}
                onBlur={() => keyboard.hide()}
              /><span id={`shop-receive-unit-${item.id}`}>{item.unit}</span></span>
            </label>
            <div className="shop-field" role="group" aria-label={`${item.canonical_name} 보관 위치`}>
              <span aria-hidden="true">보관</span>
              <div className="shop-segmented">
                {RECEIVE_STORAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={mutating}
                    aria-pressed={!receiveStorageLocationId && receiveStorageType === option.value}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => { setReceiveStorageType(option.value); setReceiveStorageLocationId(null); setReceiveError(""); }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {customStorageLocations.length ? <div className="shop-places" role="group" aria-label="사용자 정의 보관 위치">{customStorageLocations.map((location) => <button key={location.id} type="button" disabled={mutating} aria-pressed={receiveStorageLocationId === location.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { setReceiveStorageType(location.storage_type); setReceiveStorageLocationId(location.id); setReceiveError(""); }}>{location.name}</button>)}</div> : null}
            </div>
            <p id={`shop-receive-summary-${item.id}`} className="shop-receive-summary" aria-live="polite">
              {Number.isFinite(Number(receiveQuantity)) && Number(receiveQuantity) > 0
                ? <>{item.canonical_name} {formatQuantity(Number(receiveQuantity))}{item.unit}{receiveStorageLabel ? `, ${receiveStorageLabel}` : ""}. 날짜는 넣은 뒤 포장지를 보고 기록해 주세요.</>
                : "산 양을 입력해 주세요."}
            </p>
            {receiveError ? <p className="shop-error-text" role="alert">{receiveError}</p> : null}
            <div className="shop-receive-actions">
              <button className="shop-button-quiet" type="button" disabled={mutating} aria-busy={mutating} onPointerDown={(event) => event.preventDefault()} onClick={cancelReceive}>취소</button>
              <button
                className="shop-button shop-receive-submit"
                type="submit"
                disabled={mutating || !item.checked || !receiveStorageType}
                aria-describedby={`shop-receive-summary-${item.id}`}
                aria-busy={mutating}
                onPointerDown={(event) => event.preventDefault()}
              >{mutating ? "넣는 중" : "냉장고에 넣기"}</button>
            </div>
          </form>
        ) : null}
      </li>
    );
  };

  const toBuy = items.filter((item) => !item.checked);
  const bought = items.filter((item) => item.checked);
  const bulkPlan = shoppingBulkReceivePlan(items, inventoryFoods);
  const showBulkReadback = Boolean(bulkReceivedCount && bulkReceivedCount > 1 && onOpenFridge);

  return (
    <div className="shop" aria-label="장보기 목록" aria-busy={loading || mutating || bulkBusy} data-received-food-name={recentlyReceivedFoodName || undefined}>
      <form className="shop-add" aria-label="살 것 추가" onSubmit={(event) => { event.preventDefault(); void submitManualItem(); }}>
        <KeyboardInput ref={manualNameRef} className="app-input shop-add-name" value={manualName} maxLength={160} autoComplete="off" enterKeyHint="done" placeholder="살 것 추가" aria-label="살 것 이름" aria-invalid={manualErrorField === "name"} aria-describedby={manualErrorField === "name" ? "shop-add-error" : manualShoppingMatch ? "shop-add-note" : undefined} onFocus={revealShoppingField} onChange={(event) => { markManualDraftChanged(); setManualName(event.target.value); setManualError(""); }} onBlur={() => keyboard.hide()} />
        <button
          className="shop-button shop-add-submit"
          type="submit"
          disabled={mutating || bulkBusy}
          aria-busy={mutating}
          onPointerDown={(event) => event.preventDefault()}
        >추가</button>
        {manualError ? <p id="shop-add-error" className="shop-error-text" role="alert">{manualError}</p> : null}
        {manualShoppingMatch && manualDraft ? <p id="shop-add-note" className="shop-add-note">목록에 있는 {manualShoppingMatch.canonical_name} 수량에 {formatQuantity(manualDraft.quantity)}{manualShoppingMatch.unit} 더해요.</p> : null}
        {manualInventoryMatches.length ? <div className="shop-add-stock" role="status"><span>집에 있는 양</span><ShoppingStockList foods={manualInventoryMatches} /></div> : null}
        {inventoryReminderVisible ? <button className="shop-link" type="button" disabled={loading || mutating} aria-busy={loading} onPointerDown={(event) => event.preventDefault()} onClick={() => { onRefresh(); keyboard.hide(); }}>집에 있는 양 새로고침</button> : null}
      </form>

      {notice ? <p className={`shop-status${QUIET_NOTICE.test(notice) ? " sr-only" : ""}`} data-readback-state="notice" role="status">{notice}</p> : null}
      {error ? (
        <div className="shop-error" role="alert">
          <InfoCircledIcon width={16} height={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { retryFocusRef.current = true; (retryAction?.onRetry ?? onRefresh)(); }} disabled={loading || mutating}>{retryAction?.label ?? "다시 시도"}</button>
        </div>
      ) : null}

      {showBulkReadback ? (
        <div className="shop-readback" data-readback-state="confirmed" role="status" aria-live="polite">
          <CheckCircledIcon width={16} height={16} aria-hidden="true" />
          <span><strong>{bulkReceivedCount}개를 냉장고에 넣었어요</strong><small>날짜는 포장지를 보고 기록해 주세요.</small></span>
          <button ref={bulkReadbackActionRef} className="shop-button-quiet" type="button" onPointerDown={(event) => event.preventDefault()} onClick={onOpenFridge}>냉장고 보기</button>
        </div>
      ) : recentlyReceivedFoodName && onOpenReceivedFood ? (
        <div className="shop-readback" data-readback-state="confirmed" role="status" aria-live="polite">
          <CheckCircledIcon width={16} height={16} aria-hidden="true" />
          <span><strong>{withKoreanObjectParticle([recentlyReceivedFoodName, recentlyReceivedFoodQuantity].filter(Boolean).join(" "))} 냉장고에 넣었어요</strong><small>날짜는 포장지를 보고 기록해 주세요.</small></span>
          <button ref={receivedFoodActionRef} className="shop-button-quiet" type="button" onPointerDown={(event) => event.preventDefault()} onClick={onOpenReceivedFood}>식품 보기</button>
        </div>
      ) : null}

      {loading && !items.length ? (
        <div className="shop-loading" role="status">
          <span className="sr-only">장보기 목록을 불러오고 있어요</span>
          {[0, 1, 2].map((index) => <span className="shop-skeleton" aria-hidden="true" key={index}><i /><b /></span>)}
        </div>
      ) : items.length ? (
        <>
          <section className="shop-progress" aria-label="구매 현황">
            <p><strong>{progressCopy.title}</strong>{loading ? <span className="shop-syncing" role="status">업데이트 중</span> : <span>{progressCopy.countLabel}</span>}</p>
            <div className="shop-progress-track" role="progressbar" aria-label="장보기 완료율" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completedCount}><span style={{ width: `${progressPercent}%` }} /></div>
          </section>
          <section className="shop-items" aria-label="장보기 항목">
          {toBuy.length ? (
            <section className="shop-section" aria-labelledby="shop-to-buy-title">
              <h3 id="shop-to-buy-title">살 것 <span>{toBuy.length}</span></h3>
              <ul className="shop-list">{toBuy.map(renderRow)}</ul>
            </section>
          ) : null}
          {bought.length ? (
            <section className="shop-section shop-section-bought" aria-labelledby="shop-bought-title">
              <div className="shop-section-heading">
                <h3 id="shop-bought-title">산 것 <span>{bought.length}</span></h3>
                {bulkPlan.length && onReceiveAll && !bulkConfirming ? <button ref={bulkOpenRef} className="shop-button shop-bulk-open" type="button" disabled={mutating || bulkBusy} onClick={() => { keyboard.hide(); cancelReceive(); setBulkConfirming(true); }}>모두 냉장고에 넣기</button> : null}
              </div>
              {bulkConfirming && bulkPlan.length ? (
                <div className="shop-bulk" role="group" aria-labelledby="shop-bulk-title" aria-busy={bulkBusy}>
                  <p id="shop-bulk-title"><strong>{bulkPlan.length}개를 냉장고에 넣을까요?</strong></p>
                  <ul>{bulkPlan.map((entry) => <li key={entry.item.id}><span>{entry.item.canonical_name}</span><span>{formatQuantity(entry.input.quantity)}{entry.item.unit}</span><span>{shoppingStorageLabel(entry.input.storageType)}</span></li>)}</ul>
                  <p className="shop-bulk-note">보관 위치를 바꾸려면 항목의 넣기를 눌러 주세요. 날짜는 자동으로 정하지 않아요.</p>
                  <div className="shop-receive-actions">
                    <button className="shop-button-quiet" type="button" disabled={bulkBusy} onClick={() => { setBulkConfirming(false); window.requestAnimationFrame(() => bulkOpenRef.current?.focus({ preventScroll: true })); }}>취소</button>
                    <button ref={bulkConfirmRef} className="shop-button shop-bulk-confirm" type="button" disabled={bulkBusy || mutating} aria-busy={bulkBusy} onClick={() => void runBulkReceive()}>{bulkBusy ? "넣는 중" : `${bulkPlan.length}개 넣기`}</button>
                  </div>
                </div>
              ) : null}
              <ul className="shop-list">{bought.map(renderRow)}</ul>
            </section>
          ) : null}
          </section>
          {(demoMode || shoppingAdjustmentNote(items)) ? <p className="shop-footnote">{demoMode ? "미리보기에서는 냉장고에 넣은 양만큼 목록에서 빠져요." : shoppingAdjustmentNote(items)}</p> : null}
        </>
      ) : error || recentlyReceivedFoodName || showBulkReadback ? null : (
        <div className="shop-empty" role="status">
          <p>살 것이 없어요.</p>
          <button className="shop-button-quiet" type="button" onClick={onOpenMeal}>식단에서 재료 고르기</button>
        </div>
      )}

      {!(loading && !items.length) && !error ? <>
        {renderSuggestionSection("meal", "식단에 필요한 것", suggestions.meal)}
        {renderSuggestionSection("finished", "최근 다 쓴 것", suggestions.finished)}
      </> : null}

      {demoMode ? <p className="shop-footnote shop-preview-note" role="note">미리보기 내용은 저장되지 않아요.</p> : null}
    </div>
  );
}
