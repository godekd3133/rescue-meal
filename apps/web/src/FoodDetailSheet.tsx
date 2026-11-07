import { FoodPhoto } from "./FoodPhoto";
import { withKoreanDates } from "./koreanDate";
import { foodFreshness } from "./freshness";
import { FreshnessChip } from "./screens/FreshnessChip";
import { storageLocationSummary } from "./storageLocationPresentation";
import { displayFoodBrand, productInfoDraftChanged } from "./foodBrandPresentation";
import { detailFoodNote } from "./detailFoodNotes";
import { MetadataText } from "./Metadata";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CheckCircledIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import { QuantityReferenceEditor } from "./QuantityReferenceEditor";
import { mealApi } from "./mealApi";
import type { ApiStorageLocation } from "./mealApi";
import type { DateAssertionDraft, DateConfirmationKind } from "./DateAssertionEditor";
import type { FoodItem, StorageType } from "./Prototype";
import { dateSourceLabel, getDateBadge } from "./datePresentation";
import { halfEventQuantity, isValidEventQuantity, MIN_QUANTITY_STEP, quantityDraftValue, parseDisplayQuantity, quantityStep, reconcileQuantityDraft, stepEventQuantity, validateQuantitySelection } from "./quantitySelection";
import "./foodQuantityControls.css";
import "./foodDetail.css";
import { formatQuantityAmount } from "./quantityArithmetic";

const FoodHistory = lazy(() => import("./FoodHistory"));
const ProductProvenanceHistory = lazy(() => import("./ProductProvenanceHistory"));
const ProductInfoHistory = lazy(() => import("./ProductInfoHistory"));
const DateAssertionEditor = lazy(() => import("./DateAssertionEditor"));
const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];

function productSourceLabel(source: string) {
  if (source === "open_food_facts") return "공개 상품 정보";
  if (source === "mfds_c005" || source === "mfds_i1250") return "식품안전나라 상품 정보";
  if (source === "user_confirmed_alias") return "내가 확인한 영수증 상품명";
  if (source === "local_rule") return "영수증에서 찾은 상품명";
  if (source === "parser") return "영수증에서 읽은 상품명이에요. 맞는지 살펴봐 주세요.";
  return "서비스 상품 정보";
}

function productProvenanceNote(note: string) {
  const normalized = note
    .replaceAll("식품안전나라 C005 제품 기준 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 C005 상품 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 I1250 제품 기준 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 I1250", "식품안전나라 상품 정보")
    .replaceAll("Open Food Facts 검색 후보", "공개 상품 정보")
    .replaceAll("Open Food Facts", "공개 상품 정보");
  return /\b(?:workspace|canonical|candidate|confidence|provider|fixture|parser|provenance|source|snapshot|gate|validation|evidence|review)\b/i.test(normalized)
    ? "참고 상품 정보예요. 실제 상품명과 포장지 날짜를 확인해 주세요."
    : normalized;
}

function productFreshnessLabel(freshness: "current" | "legacy" | "unknown") {
  if (freshness === "current") return "최근 정보";
  if (freshness === "legacy") return "오래된 정보";
  return "정보 날짜를 알 수 없어요";
}

function printedDatePassedSentence(dateLabel: string) {
  if (dateLabel === "오늘") return "표시 날짜가 오늘이에요.";
  if (dateLabel === "어제") return "표시 날짜가 어제 지났어요.";
  const daysAgo = dateLabel.match(/^(\d+)일 전$/);
  if (daysAgo) return `표시 날짜가 ${daysAgo[1]}일 지났어요.`;
  return "표시 날짜가 오늘이거나 지났어요.";
}

function dateEditorValue(food: FoodItem) {
  const match = food.dateDetail.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function dateEditorKind(food: FoodItem): DateConfirmationKind | null {
  if (food.dateAssertionKind === "sell_by" || food.dateAssertionKind === "use_by" || food.dateAssertionKind === "best_before" || food.dateAssertionKind === "user_reminder") return food.dateAssertionKind;
  return food.dateKind === "user_confirmed" ? "user_reminder" : null;
}

function storageHintLabel(storage?: "ambient" | "refrigerated" | "frozen") {
  if (!storage) return null;
  return storage === "refrigerated" ? "냉장" : storage === "frozen" ? "냉동" : "실온";
}

function storageCode(storage: StorageType) {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

function formatPurchasedAt(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

function formatOpenedAt(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

function storageFromApi(storage: ApiStorageLocation["storage_type"]): StorageType {
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

export type FoodDetailGuidanceDraft = {
  source: string;
  storage: StorageType;
  storageLocationId: string | null;
  opened: boolean;
  quantity: string;
  partialOpen?: boolean;
  dateEditorOpen?: boolean;
  dateDraft?: DateAssertionDraft | null;
  productEditor?: { open: boolean; name: string; brand: string; category: string };
};

function guidanceDraftSource(food: FoodItem) {
  return JSON.stringify([food.id, food.quantity, food.storage, food.storageLocationId ?? null, food.opened, food.openedAt, food.name, food.brand, food.category, food.dateKind, food.dateDetail, food.dateAssertionKind]);
}

export default function FoodDetailSheet({
  food,
  readOnly = false,
  storageSaving = false,
  storageRecovery = null,
  onEditStorageRecovery,
  autoFocusDateReview = false,
  autoFocusPrimaryAction = false,
  autoFocusQuantityReference = false,
  autoFocusProvenanceReview = false,
  dateReviewReason,
  storageLocations,
  remoteRefreshRequired = false,
  onRefreshRemote,
  onSave,
  onConsume,
  onDiscard,
  onFreeze,
  canFreeze = false,
  onCook,
  onConfirmDate,
  onRemoveProductProvenance,
  onUpdateProductInfo,
  onUpdateQuantityReference,
  productInfoError,
  productInfoSaving = false,
  productInfoNotice,
  onRefreshProductInfo,
  productProvenanceError,
  onRetryProductProvenance,
  productProvenanceMutating = false,
  productProvenanceNotice,
  onRefreshProductProvenance,
  onShowGuidance,
  guidanceDraft,
  onOpenLabelReview,
  onOpenSyncRecord,
  onOpenSyncNotification,
  focusSyncOutboxId,
  historyRefreshKey = 0,
  initialHistoryDisclosureOpen = false,
  onHistoryDisclosureChange,
}: {
  food: FoodItem;
  readOnly?: boolean;
  storageSaving?: boolean;
  storageRecovery?: { message: string; retry: () => void; canEdit: boolean } | null;
  onEditStorageRecovery?: () => void;
  autoFocusDateReview?: boolean;
  autoFocusPrimaryAction?: boolean;
  autoFocusQuantityReference?: boolean;
  autoFocusProvenanceReview?: boolean;
  dateReviewReason?: string | null;
  storageLocations?: ApiStorageLocation[];
  remoteRefreshRequired?: boolean;
  onRefreshRemote?: () => void | Promise<unknown>;
  /** Saves a whole-lot storage move or the opened event right away; the page stays open. */
  onSave: (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number, storageLocationId: string | null) => void;
  onConsume: (foodId: string, eventQuantity?: number) => void;
  onDiscard: (foodId: string, eventQuantity?: number) => void;
  onFreeze?: (foodId: string) => void;
  canFreeze?: boolean;
  onCook?: (food: FoodItem) => void;
  onConfirmDate: (foodId: string, dateValue: string, kind: "sell_by" | "use_by" | "best_before" | "user_reminder") => void;
  onRemoveProductProvenance: (foodId: string) => void;
  onUpdateQuantityReference: (foodId: string, reference: { amount: number; unit: "g" | "ml" | "개" } | null) => Promise<void>;
  onUpdateProductInfo: (foodId: string, input: { name: string; brand: string; category: string }) => void;
  productInfoError?: string;
  productInfoSaving?: boolean;
  productInfoNotice?: string;
  onRefreshProductInfo?: () => void | Promise<void>;
  productProvenanceError?: string;
  onRetryProductProvenance?: () => void;
  productProvenanceMutating?: boolean;
  productProvenanceNotice?: string;
  onRefreshProductProvenance?: () => void | Promise<void>;
  onShowGuidance: (draft: FoodDetailGuidanceDraft) => void;
  guidanceDraft?: FoodDetailGuidanceDraft | null;
  onOpenLabelReview?: () => void;
  onOpenSyncRecord?: (outboxId: string, foodId: string) => void;
  onOpenSyncNotification?: (outboxId: string) => void;
  focusSyncOutboxId?: string | null;
  historyRefreshKey?: number;
  initialHistoryDisclosureOpen?: boolean;
  onHistoryDisclosureChange?: (open: boolean) => void;
}) {
  const keyboard = useKeyboard();
  const now = new Date();
  const freshness = foodFreshness(food, now);
  const storageRetryActionRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!storageRecovery) return;
    const frame = window.requestAnimationFrame(() => revealAndFocus(storageRetryActionRef.current, { block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [storageRecovery]);
  const retainedDraft = guidanceDraft?.source === guidanceDraftSource(food) ? guidanceDraft : null;
  const guidanceActionRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!retainedDraft) return;
    const frame = window.requestAnimationFrame(() => guidanceActionRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [food.id]);

  // The storage segment answers the tap at once; the server value replaces it once saved.
  const [pendingPlace, setPendingPlace] = useState<{ storage: StorageType; locationId: string | null } | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [partialOpen, setPartialOpen] = useState(Boolean(retainedDraft?.partialOpen || autoFocusPrimaryAction));
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [consumeConfirm, setConsumeConfirm] = useState(false);
  const [historyDisclosureOpen, setHistoryDisclosureOpen] = useState(initialHistoryDisclosureOpen);
  const [condensed, setCondensed] = useState(false);
  const heroEndRef = useRef<HTMLSpanElement | null>(null);
  const discardConfirmRef = useRef<HTMLDivElement | null>(null);
  const discardActionRef = useRef<HTMLButtonElement | null>(null);
  const consumeConfirmRef = useRef<HTMLDivElement | null>(null);
  const consumeConfirmReturnRef = useRef<HTMLButtonElement | null>(null);
  const consumeConfirmWasOpenRef = useRef(false);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const partialActionRef = useRef<HTMLButtonElement | null>(null);
  const partialPanelRef = useRef<HTMLDivElement | null>(null);
  const openSwitchRef = useRef<HTMLButtonElement | null>(null);
  const openConfirmRef = useRef<HTMLDivElement | null>(null);
  const dateConfirmationActionRef = useRef<HTMLButtonElement | null>(null);
  const dateReviewActionRef = useRef<HTMLButtonElement | null>(null);
  const dateProofRef = useRef<HTMLDivElement | null>(null);
  const storageGroupRef = useRef<HTMLDivElement | null>(null);
  const storageCardRef = useRef<HTMLElement | null>(null);
  const currentPlaceControl = () => storageCardRef.current?.querySelector<HTMLElement>("[role=\"radio\"][aria-checked=\"true\"], .food-place-chips [aria-pressed=\"true\"]") ?? null;
  const productProvenanceReviewActionRef = useRef<HTMLButtonElement | null>(null);
  const productInfoEditActionRef = useRef<HTMLButtonElement | null>(null);
  const [dateEditorOpen, setDateEditorOpen] = useState(retainedDraft?.dateEditorOpen ?? false);
  const [dateEditorDraft, setDateEditorDraft] = useState<DateAssertionDraft | null>(retainedDraft?.dateDraft ?? null);
  const [removeProductProvenanceConfirm, setRemoveProductProvenanceConfirm] = useState(false);
  const [editProductInfoOpen, setEditProductInfoOpen] = useState(retainedDraft?.productEditor?.open ?? false);
  const [productNameDraft, setProductNameDraft] = useState(retainedDraft?.productEditor?.name ?? food.name);
  const [productBrandDraft, setProductBrandDraft] = useState(retainedDraft?.productEditor?.brand ?? displayFoodBrand(food.brand));
  const [productCategoryDraft, setProductCategoryDraft] = useState(retainedDraft?.productEditor?.category ?? food.category);

  useEffect(() => {
    if (focusSyncOutboxId) {
      setHistoryDisclosureOpen(true);
      onHistoryDisclosureChange?.(true);
    }
  }, [focusSyncOutboxId, onHistoryDisclosureChange]);

  // A compact title bar takes over once the photo scrolls under it.
  useEffect(() => {
    const marker = heroEndRef.current;
    const root = marker?.closest<HTMLElement>(".sheet-content") ?? null;
    if (!marker || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 80), { root, rootMargin: "-64px 0px 0px 0px", threshold: 0 });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  const availableQuantity = parseDisplayQuantity(food.quantity) ?? { amount: 0, unit: "개" };
  const halfQuantity = halfEventQuantity(availableQuantity.amount);
  const initialPartialDraft = quantityDraftValue(halfQuantity ?? availableQuantity.amount);
  const [quantityDraft, setQuantityDraft] = useState(retainedDraft?.quantity ?? (partialOpen ? initialPartialDraft : quantityDraftValue(availableQuantity.amount)));
  const quantitySourceRef = useRef({ foodId: food.id, ...availableQuantity });
  const currentQuantityDraft = quantitySourceRef.current.foodId === food.id && quantitySourceRef.current.unit === availableQuantity.unit
    ? quantityDraft
    : quantityDraftValue(availableQuantity.amount);
  // Outside the 일부 먹음 panel every record covers the whole remaining amount.
  const quantitySelection = validateQuantitySelection(partialOpen ? currentQuantityDraft : quantityDraftValue(availableQuantity.amount), availableQuantity.amount);
  const eventQuantity = quantitySelection.quantity ?? 0;
  const canRecordQuantity = quantitySelection.error === null;
  const step = quantityStep(availableQuantity.amount, availableQuantity.unit);
  const updateQuantityDraft = (next: string) => {
    setQuantityDraft(next);
    setConsumeConfirm(false);
    setDiscardConfirm(false);
  };
  useEffect(() => {
    const previous = quantitySourceRef.current;
    const next = parseDisplayQuantity(food.quantity) ?? { amount: 0, unit: "개" };
    setQuantityDraft((current) => previous.foodId === food.id && previous.unit === next.unit
      ? reconcileQuantityDraft(current, previous.amount, next.amount)
      : String(next.amount));
    quantitySourceRef.current = { foodId: food.id, ...next };
  }, [food.id, food.quantity]);

  const purchasedAtLabel = formatPurchasedAt(food.purchasedAt);
  const openedAtLabel = formatOpenedAt(food.openedAt);
  const hasReceiptProvenance = Boolean(food.sourceReceiptId || food.sourceReceiptLineId);
  const hasReceiptPurchase = food.purchaseSource === "receipt";
  const hasShoppingPurchase = food.purchaseSource === "shopping_list";
  const shownStorage = pendingPlace && (storageSaving || storageRecovery) ? pendingPlace.storage : food.storage;
  const shownLocationId = pendingPlace && (storageSaving || storageRecovery) ? pendingPlace.locationId : food.storageLocationId ?? null;
  const shownLocationName = shownLocationId ? storageLocations?.find((location) => location.id === shownLocationId)?.name ?? food.storageLocationName : undefined;
  const shownStorageLabel = storageLocationSummary(shownLocationName, shownStorage);
  const customLocations = (storageLocations ?? []).filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  const dateStorageMismatch = Boolean(food.dateStorageHint && food.dateStorageHint !== storageCode(shownStorage));
  const productStorageMismatch = Boolean(!dateStorageMismatch && food.productProvenance?.storageHint && food.productProvenance.storageHint !== storageCode(shownStorage));
  const needsSafetyReviewBeforeConsume = Boolean(food.dateKind === "unknown" || dateReviewReason || dateStorageMismatch);
  // Same rule as the rescue deck and the 냉장고 rows: a date question leads with 날짜 확인.
  const leadsWithDateCheck = needsSafetyReviewBeforeConsume || freshness.bucket === "past";
  const dateProofDetail = food.dateKind === "user_confirmed" ? dateEditorValue(food).replaceAll("-", ".") || food.dateLabel : food.dateDetail;
  const canConfirmDate = food.dateKind === "estimated_use_first" || food.dateKind === "unknown" || food.dateKind === "user_confirmed";
  const editingUserReminder = food.dateKind === "user_confirmed";
  const canRecheckPrintedLabel = Boolean(onOpenLabelReview && !readOnly && food.dateKind === "actual_printed");
  const manualPackageDateConfirmationNote = food.dateKind === "actual_printed"
    && ["user_input", "사용자 입력", "포장지에서 사용자 확인"].includes(food.dateSource.trim())
    // The date card already reads "포장지에서 직접 확인"; the confirm flow's saved note only repeats it.
    && ["포장지에서 확인한 날짜를 사용자 확인으로 기록했어요.", "포장지에서 날짜를 확인했어요."].includes(food.note.trim());
  const detailNote = detailFoodNote(food.note, food.dateKind, Boolean(dateReviewReason), Boolean(purchasedAtLabel && (hasShoppingPurchase || hasReceiptPurchase)));
  const showDetailNote = Boolean(detailNote) && !manualPackageDateConfirmationNote;
  const hasPurchaseFacts = Boolean(hasReceiptProvenance || hasReceiptPurchase || hasShoppingPurchase || purchasedAtLabel || food.barcode);
  const brand = displayFoodBrand(food.brand);

  const closeDateEditor = () => {
    setDateEditorOpen(false);
    setDateEditorDraft(null);
    window.requestAnimationFrame(() => revealAndFocus(dateConfirmationActionRef.current, { block: "nearest" }));
  };
  const closeProductProvenanceConfirm = () => {
    setRemoveProductProvenanceConfirm(false);
    window.requestAnimationFrame(() => revealAndFocus(productProvenanceReviewActionRef.current, { block: "nearest" }));
  };
  const closeProductInfoEditor = () => {
    keyboard.hide();
    setEditProductInfoOpen(false);
    window.requestAnimationFrame(() => revealAndFocus(productInfoEditActionRef.current, { block: "nearest" }));
  };

  useEffect(() => {
    setPendingPlace(null);
    setOpenConfirm(false);
    setDiscardConfirm(false);
    setConsumeConfirm(false);
    setDateEditorOpen(retainedDraft?.dateEditorOpen ?? false);
    setDateEditorDraft(retainedDraft?.dateDraft ?? null);
    setRemoveProductProvenanceConfirm(false);
    if (!productInfoSaving && !productInfoError) setEditProductInfoOpen(retainedDraft?.productEditor?.open ?? false);
    setProductNameDraft(retainedDraft?.productEditor?.name ?? food.name);
    setProductBrandDraft(retainedDraft?.productEditor?.brand ?? displayFoodBrand(food.brand));
    setProductCategoryDraft(retainedDraft?.productEditor?.category ?? food.category);
  }, [food.brand, food.category, food.id, food.name, food.opened, food.openedAt, food.quantity, food.storage, food.storageLocationId, food.dateKind, food.dateDetail, food.dateAssertionKind]);

  useEffect(() => {
    if (!storageSaving && !storageRecovery) setPendingPlace(null);
  }, [storageSaving, storageRecovery]);

  useEffect(() => {
    if (retainedDraft || (!autoFocusDateReview && !autoFocusPrimaryAction && !autoFocusProvenanceReview) || readOnly || dateEditorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const storageReviewTarget = dateStorageMismatch
        ? currentPlaceControl()
        : null;
      const target = autoFocusDateReview
        ? dateConfirmationActionRef.current ?? (!dateReviewReason ? storageReviewTarget : null) ?? dateReviewActionRef.current ?? storageReviewTarget ?? dateProofRef.current
        : autoFocusProvenanceReview
          ? productProvenanceReviewActionRef.current
          : partialPanelRef.current?.querySelector<HTMLElement>("input") ?? primaryActionRef.current;
      revealAndFocus(target, { block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusDateReview, autoFocusPrimaryAction, autoFocusProvenanceReview, canConfirmDate, dateEditorOpen, dateReviewReason, dateStorageMismatch, food.dateAssertionKind, food.dateKind, food.dateLabel, food.id, readOnly]);

  const requestConsume = (returnTo: HTMLButtonElement | null) => {
    if (readOnly || !isValidEventQuantity(eventQuantity, availableQuantity.amount)) return;
    keyboard.hide();
    if (needsSafetyReviewBeforeConsume) {
      consumeConfirmReturnRef.current = returnTo;
      setConsumeConfirm(true);
      return;
    }
    onConsume(food.id, partialOpen ? eventQuantity : undefined);
  };

  const togglePartial = () => {
    keyboard.hide();
    setConsumeConfirm(false);
    setDiscardConfirm(false);
    if (partialOpen) {
      setPartialOpen(false);
      return;
    }
    setQuantityDraft(initialPartialDraft);
    setPartialOpen(true);
    window.requestAnimationFrame(() => {
      const panel = partialPanelRef.current;
      if (!panel) return;
      scrollTargetWithinNearestContainer(panel, "nearest", getMobileScrollBehavior());
      panel.querySelector<HTMLButtonElement>("[aria-pressed=\"true\"]")?.focus({ preventScroll: true });
    });
  };

  const closePartial = () => {
    keyboard.hide();
    setPartialOpen(false);
    window.requestAnimationFrame(() => partialActionRef.current?.focus({ preventScroll: true }));
  };

  const startDateCheck = () => {
    keyboard.hide();
    if (canConfirmDate) {
      setDateEditorOpen(true);
      window.requestAnimationFrame(() => scrollTargetWithinNearestContainer(dateProofRef.current, "nearest", getMobileScrollBehavior()));
      return;
    }
    if (canRecheckPrintedLabel) {
      onOpenLabelReview?.();
      return;
    }
    const target = dateStorageMismatch ? currentPlaceControl() : dateProofRef.current;
    revealAndFocus(target ?? null, { block: "nearest" });
  };

  const choosePlace = (nextStorage: StorageType, nextLocationId: string | null) => {
    if (readOnly || storageSaving) return;
    keyboard.hide();
    if (nextStorage === shownStorage && nextLocationId === shownLocationId) return;
    setPendingPlace({ storage: nextStorage, locationId: nextLocationId });
    onSave(food.id, nextStorage, food.opened, availableQuantity.amount, nextLocationId);
  };

  const closeOpenConfirm = () => {
    setOpenConfirm(false);
    window.requestAnimationFrame(() => openSwitchRef.current?.focus({ preventScroll: true }));
  };

  const closeDiscardConfirmation = () => {
    setDiscardConfirm(false);
    window.requestAnimationFrame(() => revealAndFocus(discardActionRef.current, { block: "nearest" }));
  };

  useEffect(() => {
    if (productProvenanceError) setRemoveProductProvenanceConfirm(false);
  }, [productProvenanceError]);

  useEffect(() => {
    if (!consumeConfirm) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(consumeConfirmRef.current, "nearest", getMobileScrollBehavior());
      consumeConfirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [consumeConfirm]);

  useEffect(() => {
    if (consumeConfirm) {
      consumeConfirmWasOpenRef.current = true;
      return;
    }
    if (!consumeConfirmWasOpenRef.current) return;
    consumeConfirmWasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => revealAndFocus(consumeConfirmReturnRef.current ?? primaryActionRef.current, { block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [consumeConfirm]);

  useEffect(() => {
    if (!discardConfirm) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(discardConfirmRef.current, "nearest", getMobileScrollBehavior());
      discardConfirmRef.current?.querySelector<HTMLButtonElement>(".secondary-sheet-button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [discardConfirm]);

  useEffect(() => {
    if (!openConfirm) return;
    const frame = window.requestAnimationFrame(() => openConfirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [openConfirm]);

  useEffect(() => {
    if (!readOnly) return;
    setDiscardConfirm(false);
    setConsumeConfirm(false);
    setOpenConfirm(false);
    setPartialOpen(false);
    setDateEditorOpen(retainedDraft?.dateEditorOpen ?? false);
    setDateEditorDraft(retainedDraft?.dateDraft ?? null);
    setRemoveProductProvenanceConfirm(false);
    setEditProductInfoOpen(false);
    keyboard.hide();
  }, [keyboard, readOnly]);

  const amountLabel = (amount: number) => `${formatQuantityAmount(amount)}${availableQuantity.unit}`;
  const discardRemainingQuantity = quantitySelection.remaining ?? availableQuantity.amount;
  const discardConsequenceCopy = discardRemainingQuantity > 0
    ? `버린 뒤 남는 수량: ${amountLabel(discardRemainingQuantity)}.`
    : "버림으로 기록하면 이 식품은 목록에서 빠져요.";
  const showFreeze = Boolean(!leadsWithDateCheck && onFreeze && canFreeze && food.storage !== "냉동");
  const showCook = Boolean(!leadsWithDateCheck && onCook);
  const guidanceDraftNow = (): FoodDetailGuidanceDraft => ({ source: guidanceDraftSource(food), storage: food.storage, storageLocationId: food.storageLocationId ?? null, opened: food.opened, quantity: currentQuantityDraft, partialOpen, dateEditorOpen, dateDraft: dateEditorDraft, productEditor: { open: editProductInfoOpen, name: productNameDraft, brand: productBrandDraft, category: productCategoryDraft } });

  /* ---------- action row ---------- */

  const actionRow = readOnly ? null : (
    <div className="food-actions" role="group" aria-label="식품 기록 행동" data-count={leadsWithDateCheck ? 3 : 2 + Number(showFreeze) + Number(showCook)}>
      {leadsWithDateCheck ? (
        <>
          <button ref={primaryActionRef} className="food-action food-action-primary" type="button" onClick={startDateCheck}>날짜 확인</button>
          {needsSafetyReviewBeforeConsume ? <span id="consume-safety-hint" className="sr-only">이미 먹은 경우에만 기록해 주세요.</span> : null}
          <button className={`food-action detail-consume-action${needsSafetyReviewBeforeConsume ? " detail-consume-action-review" : ""}`} type="button" aria-label={needsSafetyReviewBeforeConsume ? "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기" : undefined} aria-describedby={needsSafetyReviewBeforeConsume ? "consume-safety-hint" : undefined} disabled={!canRecordQuantity} onClick={(event) => { if (partialOpen) setPartialOpen(false); requestConsume(event.currentTarget); }}>{needsSafetyReviewBeforeConsume ? "먹은 기록" : "먹었어요"}</button>
        </>
      ) : (
        <button ref={primaryActionRef} className="food-action food-action-primary detail-consume-action" type="button" disabled={!isValidEventQuantity(availableQuantity.amount, availableQuantity.amount)} onClick={() => { keyboard.hide(); onConsume(food.id); }}>먹었어요</button>
      )}
      <button ref={partialActionRef} className="food-action food-action-partial" type="button" aria-expanded={partialOpen} aria-controls="food-partial-panel" onClick={togglePartial}>일부 먹음</button>
      {showFreeze ? <button className="food-action" type="button" aria-label={`${food.name} 냉동 보관하기`} onClick={() => { keyboard.hide(); onFreeze?.(food.id); }}>냉동</button> : null}
      {showCook ? <button className="food-action" type="button" aria-label={`${food.name} 넣어 요리하기`} onClick={() => { keyboard.hide(); onCook?.(food); }}>요리</button> : null}
    </div>
  );

  const consumeConfirmCard = consumeConfirm ? (
    <div ref={consumeConfirmRef} className="food-inline-card consume-confirm" role="group" aria-labelledby="consume-confirm-title" aria-describedby="consume-confirm-description" aria-live="polite">
      <strong id="consume-confirm-title" className="food-inline-title">이 수량을 먹은 기록으로 남길까요?</strong>
      <dl className="food-inline-facts">
        <div role="group" aria-label="이번 소비 기록"><dt>{food.name}</dt><dd>{amountLabel(eventQuantity)}</dd></div>
        <div role="status"><dt>남는 수량</dt><dd>{quantitySelection.remaining === null ? "수량 확인" : amountLabel(quantitySelection.remaining)}</dd></div>
      </dl>
      <p id="consume-confirm-description" className="consume-confirm-safety-copy">이미 먹은 수량만 기록해요. 먹어도 되는지는 앱에서 판단할 수 없어요.</p>
      <div className="food-inline-buttons">
        <button className="secondary-sheet-button" type="button" onClick={() => setConsumeConfirm(false)}>돌아가기</button>
        <button className="primary-sheet-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!readOnly && isValidEventQuantity(eventQuantity, availableQuantity.amount)) onConsume(food.id, eventQuantity); }}>먹었어요</button>
      </div>
    </div>
  ) : null;

  const partialPanel = partialOpen && !readOnly && !consumeConfirm ? (
    <div ref={partialPanelRef} id="food-partial-panel" className="food-inline-card food-partial" role="group" aria-label="먹은 양 기록">
      <div className="food-partial-heading"><label htmlFor="food-event-quantity" className="food-inline-title">먹은 양</label><span id="food-event-quantity-available">남은 {food.quantity}</span></div>
      <div className="detail-quantity-presets" role="group" aria-label="수량 빠르게 선택">
        {halfQuantity !== null ? <button type="button" onPointerDown={(event) => event.preventDefault()} aria-pressed={eventQuantity === halfQuantity} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(halfQuantity)); }}>절반 {amountLabel(halfQuantity)}</button> : null}
        <button type="button" onPointerDown={(event) => event.preventDefault()} disabled={!isValidEventQuantity(availableQuantity.amount, availableQuantity.amount)} aria-pressed={canRecordQuantity && eventQuantity === availableQuantity.amount} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(availableQuantity.amount)); }}>전부 {food.quantity}</button>
      </div>
      <div className="detail-quantity-editor">
        <button type="button" onPointerDown={(event) => event.preventDefault()} aria-label={`수량 줄이기 (${amountLabel(step)}씩)`} disabled={!canRecordQuantity || eventQuantity <= Math.min(MIN_QUANTITY_STEP, step)} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(stepEventQuantity(eventQuantity, -1, availableQuantity.amount, availableQuantity.unit))); }}>−</button>
        <div className="detail-quantity-input-wrap">
          <KeyboardInput id="food-event-quantity" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" value={currentQuantityDraft} aria-invalid={!canRecordQuantity} aria-describedby="food-event-quantity-available food-event-quantity-note" onChange={(event) => updateQuantityDraft(event.target.value)} onBlur={() => keyboard.hide()} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); keyboard.hide(); } }} />
          <span>{availableQuantity.unit}</span>
        </div>
        <button type="button" onPointerDown={(event) => event.preventDefault()} aria-label={`수량 늘리기 (${amountLabel(step)}씩)`} disabled={!canRecordQuantity || eventQuantity >= availableQuantity.amount} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(stepEventQuantity(eventQuantity, 1, availableQuantity.amount, availableQuantity.unit))); }}>+</button>
      </div>
      <p id="food-event-quantity-note" className={`detail-quantity-note${canRecordQuantity ? "" : " detail-quantity-error"}`} role="status">{quantitySelection.error ?? (quantitySelection.remaining > 0 ? `기록하면 ${amountLabel(quantitySelection.remaining)} 남아요.` : "기록하면 목록에서 빠져요.")}</p>
      <div className="food-inline-buttons">
        <button className="secondary-sheet-button" type="button" onClick={closePartial}>취소</button>
        <button className="primary-sheet-button food-partial-submit" type="button" disabled={!canRecordQuantity} onClick={(event) => requestConsume(event.currentTarget)}>{canRecordQuantity ? `${amountLabel(eventQuantity)} 먹었어요` : "먹었어요"}</button>
      </div>
    </div>
  ) : null;

  /* ---------- date card ---------- */

  const dateTitle = food.dateKind === "unknown" ? "날짜 없음" : food.dateKind === "estimated_use_first" ? food.dateLabel : withKoreanDates(dateProofDetail);
  const dateActionLabel = editingUserReminder ? "내 알림일 수정" : canConfirmDate ? "포장지 날짜 입력" : dateReviewReason === "날짜 의미 확인" ? "소비기한 다시 확인" : "날짜 다시 확인";
  const dateActionTone = leadsWithDateCheck ? " food-card-action-strong" : "";
  const dateAction = readOnly ? null : canConfirmDate ? (
    dateEditorOpen
      ? <Suspense fallback={<div className="date-editor-loading" role="status">날짜 입력을 여는 중이에요</div>}><DateAssertionEditor initialValue={dateEditorDraft?.value ?? dateEditorValue(food)} initialKind={dateEditorDraft ? dateEditorDraft.kind : dateEditorKind(food)} originalKind={dateEditorKind(food)} onDraftChange={setDateEditorDraft} title={editingUserReminder ? "내 알림일 수정" : undefined} description={editingUserReminder ? "" : undefined} onCancel={closeDateEditor} onConfirm={(dateValue, kind) => onConfirmDate(food.id, dateValue, kind)} /></Suspense>
      : <button ref={dateConfirmationActionRef} data-testid="date-confirmation-action" className={`food-card-action${dateActionTone}`} type="button" onClick={() => setDateEditorOpen(true)}>{dateActionLabel}</button>
  ) : canRecheckPrintedLabel ? (
    <button ref={dateReviewReason ? dateReviewActionRef : undefined} className={`food-card-action${dateActionTone}`} type="button" aria-label={dateReviewReason === "날짜 의미 확인" ? "포장지에서 소비기한 다시 확인" : "포장지에서 날짜 다시 확인"} onClick={() => onOpenLabelReview?.()}>{dateActionLabel}</button>
  ) : null;

  // The card holds the date facts as one focusable group (what the date is,
  // what it means, where it came from); notes, the review callout and the one
  // action follow it, so the group itself never carries reminder copy.
  const dateCard = (
    <div className="food-card food-date-shell">
      <div className="food-card-heading">
        <h3 className="food-card-title">날짜</h3>
        <button ref={guidanceActionRef} className="food-icon-button" type="button" onClick={() => onShowGuidance(guidanceDraftNow())} aria-label="날짜 안내 보기"><InfoCircledIcon width={18} height={18} /></button>
      </div>
      <section ref={dateProofRef} tabIndex={-1} role="group" className="food-date-card" data-date-state={food.dateKind} data-estimated={food.dateKind === "estimated_use_first" || undefined} aria-label={`날짜 정보: ${getDateBadge(food)}`}>
        <p className="food-date-value"><MetadataText text={dateTitle} /></p>
        <dl className="food-facts">
          <div><dt>의미</dt><dd>{getDateBadge(food)}</dd></div>
          <div><dt>출처</dt><dd className="food-date-source"><MetadataText text={food.dateKind === "unknown" ? "포장지 날짜를 아직 기록하지 않았어요." : dateSourceLabel(food.dateSource, food.dateKind)} /></dd></div>
        </dl>
      </section>
      {food.dateKind === "estimated_use_first" ? <p className="food-date-hint" role="note">소비기한이 아닌 참고 날짜예요.</p> : null}
      {showDetailNote ? <p className="food-date-hint">{detailNote}</p> : null}
      {dateReviewReason && food.dateKind !== "unknown" ? (
        <div className="date-review-callout" role="status" aria-live="polite" aria-atomic="true">
          <InfoCircledIcon width={16} height={16} />
          <span>
            <strong>{dateReviewReason === "날짜 의미 확인" ? "포장지 날짜 종류를 골라 주세요" : dateReviewReason === "포장지 날짜 확인" ? "포장지 날짜를 확인해 주세요" : "조리 전 확인이 필요해요"}</strong>
            <small>{dateReviewReason === "날짜 의미 확인" ? "포장일과 제조일은 소비기한이 아니에요. 이 날짜를 소비기한으로 바꾸지 않고, 소비기한이 적힌 면과 보관 방법을 따로 살펴봐 주세요." : dateReviewReason === "포장지 날짜 확인" ? "포장지 날짜를 기록하지 않았어요. 포장지와 보관 방법을 살펴본 뒤 조리해 주세요." : `${printedDatePassedSentence(food.dateLabel)} 보관 방법과 개봉 상태도 확인해 주세요.`}</small>
          </span>
        </div>
      ) : null}
      {dateAction}
    </div>
  );

  /* ---------- storage card ---------- */

  const storageMismatchCallout = dateStorageMismatch ? <div className="storage-mismatch-callout" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>포장지 보관조건과 현재 위치가 달라요</strong><small>{food.dateStorageConditionText ?? `${storageHintLabel(food.dateStorageHint)} 보관 기준으로 표시된 날짜예요.`} 현재는 {shownStorageLabel}에 보관 중이라 포장지와 실제 보관 상태를 다시 확인해 주세요. 날짜 자체는 자동으로 바꾸지 않아요.</small></span></div> : null;
  const storageLocked = readOnly || storageSaving || Boolean(storageRecovery);

  const storageCard = (
    <section ref={storageCardRef} className="food-card food-storage-card" aria-label="보관" aria-busy={storageSaving}>
      <div className="food-card-heading">
        <h3 className="food-card-title">보관</h3>
        {storageSaving ? <span className="food-card-status" role="status">저장하는 중</span> : null}
      </div>
      {readOnly ? (
        <dl className="food-facts">
          <div><dt>위치</dt><dd>{shownStorageLabel}</dd></div>
          <div><dt>개봉</dt><dd>{food.opened ? (openedAtLabel ? `${openedAtLabel}에 열었어요` : "열었어요") : "열지 않았어요"}</dd></div>
        </dl>
      ) : <>
      <div ref={storageGroupRef} className="food-segmented" role="radiogroup" aria-label="보관 위치">
          {STORAGE_OPTIONS.map((option) => {
            const active = !shownLocationId && shownStorage === option;
            return <button key={option} type="button" role="radio" aria-checked={active} tabIndex={active || (shownLocationId && option === STORAGE_OPTIONS[0]) ? 0 : -1} disabled={storageLocked && !active} aria-disabled={storageLocked || undefined} onPointerDown={(event) => event.preventDefault()} onKeyDown={(event) => {
              const index = STORAGE_OPTIONS.indexOf(option);
              const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!delta) return;
              event.preventDefault();
              const next = STORAGE_OPTIONS[(index + delta + STORAGE_OPTIONS.length) % STORAGE_OPTIONS.length];
              storageGroupRef.current?.querySelectorAll<HTMLButtonElement>("button")[STORAGE_OPTIONS.indexOf(next)]?.focus();
            }} onClick={() => { if (!storageLocked) choosePlace(option, null); }}>{option}</button>;
          })}
        </div>
        {customLocations.length ? <div className="food-place-chips" role="group" aria-label="내 보관 위치">
          {customLocations.map((location) => {
            const active = shownLocationId === location.id;
            return <button key={location.id} type="button" aria-pressed={active} disabled={storageLocked && !active} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (!storageLocked) choosePlace(storageFromApi(location.storage_type), location.id); }}>{storageLocationSummary(location.name, storageFromApi(location.storage_type))}</button>;
          })}
        </div> : null}
        {storageRecovery ? <div className="account-error detail-storage-recovery" role="alert"><InfoCircledIcon width={16} height={16} /><span>{storageRecovery.message}</span><button ref={storageRetryActionRef} className="account-error-action" type="button" onClick={storageRecovery.retry}>다시 시도</button>{storageRecovery.canEdit && onEditStorageRecovery ? <button className="account-error-action" type="button" onClick={() => { setPendingPlace(null); onEditStorageRecovery(); }}>선택 취소</button> : null}</div> : null}
        {storageMismatchCallout}
        <div className="food-switch-row">
          <span className="food-switch-copy" id="food-opened-label">
            <strong>개봉</strong>
            <small>{food.opened ? (openedAtLabel ? `${openedAtLabel}에 열었어요` : "개봉으로 기록했어요") : "열지 않았어요"}</small>
          </span>
          <button ref={openSwitchRef} className="food-switch" type="button" role="switch" aria-label={`${food.name} 개봉 상태`} aria-checked={food.opened} aria-expanded={food.opened ? undefined : openConfirm} disabled={storageLocked || food.opened} onClick={() => { keyboard.hide(); setOpenConfirm((current) => !current); }}><span /></button>
        </div>
        {openConfirm && !food.opened ? (
          <div ref={openConfirmRef} className="food-open-confirm" role="group" aria-label="개봉 기록">
            <p>개봉으로 기록하면 되돌릴 수 없어요.</p>
            <div className="food-inline-buttons">
              <button className="secondary-sheet-button" type="button" onClick={closeOpenConfirm}>취소</button>
              <button className="primary-sheet-button" type="button" onClick={() => { setOpenConfirm(false); onSave(food.id, food.storage, true, availableQuantity.amount, food.storageLocationId ?? null); }}>개봉으로 기록</button>
            </div>
          </div>
        ) : null}
      </>}
      {readOnly ? storageMismatchCallout : null}
    </section>
  );

  /* ---------- product card ---------- */

  const productDraftChanged = productInfoDraftChanged(food, { name: productNameDraft, brand: productBrandDraft, category: productCategoryDraft });
  const productEditor = editProductInfoOpen && !readOnly ? (
    <div className="product-info-editor" role="group" aria-label="상품 정보 수정" aria-busy={productInfoSaving}>
      <label className="product-info-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={productNameDraft} autoComplete="off" spellCheck={false} aria-label="상품명 수정" disabled={productInfoSaving} onChange={(event) => setProductNameDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>브랜드 (선택)</span><KeyboardInput className="app-input" value={productBrandDraft} autoComplete="off" spellCheck={false} aria-label="브랜드 수정" disabled={productInfoSaving} onChange={(event) => setProductBrandDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>분류</span><KeyboardInput className="app-input" value={productCategoryDraft} autoComplete="off" spellCheck={false} aria-label="분류 수정" disabled={productInfoSaving} onChange={(event) => setProductCategoryDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      {productDraftChanged && food.productProvenance ? <p className="product-info-editor-note">참고한 상품 정보 연결은 해제되고 변경 기록에 남아요. 날짜, 수량, 보관 위치는 그대로예요.</p> : null}
      <div className="food-inline-buttons">
        <button type="button" className="secondary-sheet-button" disabled={productInfoSaving} onClick={closeProductInfoEditor}>취소</button>
        <button type="button" className="primary-sheet-button" aria-busy={productInfoSaving} onPointerDown={(event) => event.preventDefault()} disabled={productInfoSaving || !productDraftChanged || !productNameDraft.trim() || !productCategoryDraft.trim()} onClick={() => { onUpdateProductInfo(food.id, { name: productNameDraft.trim(), brand: productBrandDraft.trim(), category: productCategoryDraft.trim() }); keyboard.hide(); }}>{productInfoSaving ? "저장하는 중" : productInfoError ? "다시 저장" : "상품 정보 저장"}</button>
      </div>
    </div>
  ) : null;

  const productCard = (
    <section className="food-card food-product-card" aria-label="구매와 상품 정보">
      <div className="food-card-heading"><h3 className="food-card-title">상품</h3></div>
      {productInfoError ? <div className="account-error product-info-save-error" role="alert" aria-busy={productInfoSaving}><InfoCircledIcon width={15} height={15} /><span>{productInfoSaving ? "상품 정보를 다시 저장하는 중이에요." : productInfoError}</span>{!editProductInfoOpen ? <button className="account-error-action" type="button" disabled={productInfoSaving} onPointerDown={(event) => event.preventDefault()} onClick={() => setEditProductInfoOpen(true)}>입력 내용 확인</button> : null}</div> : null}
      {productInfoNotice ? <div className="product-info-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productInfoNotice}</span>{onRefreshProductInfo ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductInfo()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceNotice ? <div className="product-provenance-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productProvenanceNotice}</span>{onRefreshProductProvenance ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductProvenance()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceError ? <div className="account-error product-provenance-save-error" role="alert" aria-busy={productProvenanceMutating}><InfoCircledIcon width={15} height={15} /><span>{productProvenanceMutating ? "상품 정보를 지우는 중이에요." : productProvenanceError}</span>{onRetryProductProvenance ? <button className="account-error-action" type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductProvenance}>{productProvenanceMutating ? "다시 시도하는 중" : "다시 시도"}</button> : null}</div> : null}
      <div className="food-rows">
        {readOnly ? null : editProductInfoOpen ? productEditor : (
          <button ref={productInfoEditActionRef} type="button" className="food-row food-row-button food-name-row" aria-label="상품 정보 수정" onClick={() => setEditProductInfoOpen(true)}>
            <span className="food-row-label">이름과 분류</span>
            <span className="food-row-value"><strong>{food.name}</strong><small>{[brand, food.category].filter(Boolean).join(", ")}</small></span>
            <span className="food-row-edit" aria-hidden="true">수정</span>
          </button>
        )}
        {!readOnly ? <QuantityReferenceEditor key={food.id} food={food} initiallyEditing={autoFocusQuantityReference} returnToMeal={autoFocusQuantityReference} onSave={onUpdateQuantityReference} /> : null}
        {hasPurchaseFacts ? <div className="food-row food-provenance-card" role="group" aria-label="구매 기록">
          <span className="food-row-label">구매</span>
          <span className="food-row-value">
            <strong>{hasReceiptProvenance || hasReceiptPurchase ? "영수증에서 추가" : hasShoppingPurchase ? "장보기 목록에서 구매" : "직접 입력"}</strong>
            <small>{purchasedAtLabel ? `${purchasedAtLabel} 구매` : "구매일 미등록"}</small>
            {hasReceiptProvenance ? <small>영수증 상품 항목에서 가져왔어요</small> : null}
            {food.barcode ? <small>바코드 {food.barcode}</small> : null}
            {food.dateKind !== "estimated_use_first" ? <small>구매일만으로 소비기한을 알 수는 없어요.</small> : null}
          </span>
        </div> : null}
        {food.productProvenance ? <div className="food-row food-provenance-card product-provenance-card" role="group" aria-label="상품 정보">
          <span className="food-row-label">참고 정보</span>
          <span className="food-row-value">
            <strong>{productSourceLabel(food.productProvenance.source)}</strong>
            <small>{productFreshnessLabel(food.productProvenance.sourceFreshness)}</small>
            {storageHintLabel(food.productProvenance.storageHint) ? <small>상품 정보에 나온 보관 방법: {storageHintLabel(food.productProvenance.storageHint)}</small> : null}
            <small>{productProvenanceNote(food.productProvenance.note)}</small>
            {productStorageMismatch ? <small className="storage-hint-mismatch-note">상품 정보에 나온 보관 방법과 현재 보관 위치가 달라요.</small> : null}
            <small>상품 정보만으로 개별 포장의 소비기한을 알 수는 없어요. 포장지 날짜를 살펴봐 주세요.</small>
            {food.productProvenance.sourceUrl && /^https?:\/\//.test(food.productProvenance.sourceUrl) ? <a href={food.productProvenance.sourceUrl} target="_blank" rel="noreferrer">상품 정보 원문</a> : null}
          </span>
        </div> : null}
      </div>
      {food.productProvenance && !readOnly ? removeProductProvenanceConfirm ? <div className="product-provenance-remove-confirm" role="alert" aria-busy={productProvenanceMutating}><p>{productProvenanceMutating ? "상품 정보를 지우는 중이에요." : "상품명은 그대로 두고 참고한 상품 정보만 지워요."}</p><div className="food-inline-buttons"><button type="button" className="secondary-sheet-button" disabled={productProvenanceMutating} onClick={closeProductProvenanceConfirm}>취소</button><button type="button" className="danger-sheet-button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onClick={() => onRemoveProductProvenance(food.id)}>{productProvenanceMutating ? "지우는 중" : "정보 지우기"}</button></div></div> : <button ref={productProvenanceReviewActionRef} type="button" className="food-text-button product-provenance-remove-button" onClick={() => setRemoveProductProvenanceConfirm(true)}>참고 상품 정보 지우기</button> : null}
    </section>
  );

  /* ---------- history ---------- */

  const historyCard = mealApi.isConfigured ? (
    <details className="food-card detail-history-disclosure" open={historyDisclosureOpen} onToggle={(event) => { const open = event.currentTarget.open; setHistoryDisclosureOpen(open); onHistoryDisclosureChange?.(open); }}>
      <summary className="food-history-summary"><span className="food-card-title">변경 기록</span><span className="food-history-toggle">{historyDisclosureOpen ? "접기" : "기록 보기"}</span></summary>
      {historyDisclosureOpen ? <div className="food-history-body"><Suspense fallback={<p className="food-history-loading" role="status">기록을 불러오는 중이에요</p>}><FoodHistory foodId={food.id} unit={availableQuantity.unit} storageLocations={storageLocations} historyRefreshKey={historyRefreshKey} highlightSyncOutboxId={focusSyncOutboxId} onOpenSyncRecord={onOpenSyncRecord} onOpenSyncNotification={onOpenSyncNotification} /><ProductProvenanceHistory foodId={food.id} refreshKey={food.productProvenance ? `${food.productProvenance.source}:${food.productProvenance.confidence}:${food.productProvenance.note}` : "none"} /><ProductInfoHistory foodId={food.id} refreshKey={`${food.name}:${food.brand}:${food.category}`} /></Suspense></div> : null}
    </details>
  ) : null;

  /* ---------- discard ---------- */

  const discardSection = readOnly ? null : discardConfirm ? (
    <div ref={discardConfirmRef} className="food-inline-card discard-confirm" role="alert">
      <strong className="food-inline-title">버릴 항목과 수량을 확인해 주세요</strong>
      <dl className="food-inline-facts">
        <div role="group" aria-label="이번 버림 기록"><dt>{food.name}</dt><dd>{amountLabel(eventQuantity)}</dd></div>
      </dl>
      <p>{discardConsequenceCopy}</p>
      <p>날짜만으로 안전 여부를 판단하지 않아요. 실제 상태가 이상할 때만 버림으로 기록해 주세요.</p>
      <div className="food-inline-buttons">
        <button className="secondary-sheet-button" type="button" onClick={closeDiscardConfirmation}>취소</button>
        <button className="danger-sheet-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!readOnly && isValidEventQuantity(eventQuantity, availableQuantity.amount)) onDiscard(food.id, eventQuantity); }}>버림 기록</button>
      </div>
    </div>
  ) : <button ref={discardActionRef} className="food-text-button food-discard-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!isValidEventQuantity(eventQuantity, availableQuantity.amount)) return; keyboard.hide(); setDiscardConfirm(true); }}>{partialOpen && canRecordQuantity && eventQuantity < availableQuantity.amount ? `상태가 이상해서 ${amountLabel(eventQuantity)} 버림` : "상태가 이상해서 버림"}</button>;

  return (
    <div className="food-page" data-condensed={condensed || undefined} data-read-only={readOnly ? "true" : undefined}>
      <div className="food-top">
        <div className="food-top-photo">
          <FoodPhoto src={food.image} foodName={food.name} category={food.category} storage={food.storage} loading="eager" alt="" className="food-top-image" draggable={false} />
          {food.dateKind !== "unknown" ? <FreshnessChip food={food} referenceDate={now} className="food-top-chip" /> : null}
        </div>
        <div className="food-top-copy">
          <p className="food-title" aria-hidden="true">{food.name}</p>
          {brand ? <p className="food-brand">{brand}</p> : null}
          <div className="food-top-facts" role="group" aria-label="보관 및 개봉 상태">
            <span className="food-quantity">남은 {food.quantity}</span>
            <span className="food-top-fact">{shownStorageLabel}</span>
            <span className="food-top-fact">{food.opened ? "개봉함" : "미개봉"}</span>
          </div>
        </div>
        <span ref={heroEndRef} className="food-top-end" aria-hidden="true" />
      </div>
      {actionRow}
      <div className="food-page-body">
        {consumeConfirmCard}
        {partialPanel}
        {readOnly ? <div className="detail-read-only-callout" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>최근 확인한 기록이에요</strong><small>오프라인이라 지금은 바꿀 수 없어요. 연결되면 기록할 수 있어요.</small></span></div> : null}
        {remoteRefreshRequired ? <div className="detail-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>저장된 식품 정보를 다시 확인해 주세요</strong><small>지금 입력한 내용은 그대로예요. 다시 불러오면 저장하지 않은 입력은 사라질 수 있어요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={async () => { await onRefreshRemote?.(); window.requestAnimationFrame(() => primaryActionRef.current?.focus({ preventScroll: true })); }}>다시 불러오기</button></div> : null}
        {dateCard}
        {storageCard}
        {productCard}
        {historyCard}
        {discardSection ? <div className="food-discard-zone">{discardSection}</div> : null}
      </div>
    </div>
  );
}
