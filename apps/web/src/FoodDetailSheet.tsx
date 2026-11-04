import { FoodPhoto } from "./FoodPhoto";
import { foodFreshness, freshnessChipLabel, freshnessSpokenLabel } from "./freshness";
import { storageLocationSummary } from "./storageLocationPresentation";
import { displayFoodBrand, foodIdentityParts, productInfoDraftChanged } from "./foodBrandPresentation";
import { detailFoodNote } from "./detailFoodNotes";
import { Metadata, MetadataText } from "./Metadata";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArchiveIcon, ArrowRightIcon, CalendarIcon, CheckCircledIcon, CheckIcon, FileTextIcon, InfoCircledIcon, Pencil1Icon, ReaderIcon, SewingPinIcon } from "@radix-ui/react-icons";
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
import { formatQuantityAmount } from "./quantityArithmetic";

const FoodHistory = lazy(() => import("./FoodHistory"));
const ProductProvenanceHistory = lazy(() => import("./ProductProvenanceHistory"));
const ProductInfoHistory = lazy(() => import("./ProductInfoHistory"));
const DateAssertionEditor = lazy(() => import("./DateAssertionEditor"));
const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];

function getStorageClass(storage: StorageType) {
  return storage === "냉동" ? "storage-freezer" : storage === "실온" ? "storage-room" : "storage-fridge";
}

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
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function storageFromApi(storage: ApiStorageLocation["storage_type"]): StorageType {
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

function StoragePicker({
  value,
  locationId,
  locations = [],
  onChange,
  label = "보관 위치 선택",
  readOnly = false,
}: {
  value: StorageType;
  locationId: string | null;
  locations?: ApiStorageLocation[];
  onChange: (value: StorageType, locationId: string | null) => void;
  label?: string;
  readOnly?: boolean;
}) {
  const keyboard = useKeyboard();
  const customLocations = locations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  return (
    <div className="storage-picker" role="group" aria-label={label}>
      {STORAGE_OPTIONS.map((option) => <button key={option} className={`storage-option ${!locationId && value === option ? "storage-option-active" : ""}`} type="button" aria-pressed={!locationId && value === option} disabled={readOnly} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(option, null); }}>{option}{!locationId && value === option ? <CheckIcon width={14} height={14} /> : null}</button>)}
      {customLocations.length ? <div className="storage-custom-options" role="group" aria-label="사용자 정의 보관 위치"><span className="storage-custom-heading">내 보관 위치</span>{customLocations.map((location) => <button key={location.id} className={`storage-option storage-custom-option ${locationId === location.id ? "storage-option-active" : ""}`} type="button" aria-pressed={locationId === location.id} disabled={readOnly} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(storageFromApi(location.storage_type), location.id); }}>{storageLocationSummary(location.name, storageFromApi(location.storage_type))}{locationId === location.id ? <CheckIcon width={14} height={14} /> : null}</button>)}</div> : null}
    </div>
  );
}

export type FoodDetailGuidanceDraft = {
  source: string;
  storage: StorageType;
  storageLocationId: string | null;
  opened: boolean;
  quantity: string;
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
  onSave: (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number, storageLocationId: string | null) => void;
  onConsume: (foodId: string, eventQuantity?: number) => void;
  onDiscard: (foodId: string, eventQuantity?: number) => void;
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
  const [storage, setStorage] = useState<StorageType>(retainedDraft?.storage ?? food.storage);
  const [storageLocationId, setStorageLocationId] = useState<string | null>(retainedDraft ? retainedDraft.storageLocationId : food.storageLocationId ?? null);
  const [opened, setOpened] = useState(retainedDraft?.opened ?? food.opened);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [consumeConfirm, setConsumeConfirm] = useState(false);
  const [historyDisclosureOpen, setHistoryDisclosureOpen] = useState(initialHistoryDisclosureOpen);
  const discardConfirmRef = useRef<HTMLDivElement | null>(null);
  const discardActionRef = useRef<HTMLButtonElement | null>(null);
  const consumeConfirmRef = useRef<HTMLDivElement | null>(null);
  const consumeConfirmWasOpenRef = useRef(false);
  const detailActionsAnchorRef = useRef<HTMLDivElement | null>(null);
  const detailActionPrimaryRef = useRef<HTMLButtonElement | null>(null);
  const dateConfirmationActionRef = useRef<HTMLButtonElement | null>(null);
  const dateReviewActionRef = useRef<HTMLButtonElement | null>(null);
  const dateProofRef = useRef<HTMLDivElement | null>(null);
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
  const availableQuantity = parseDisplayQuantity(food.quantity) ?? { amount: 0, unit: "개" };
  const [quantityDraft, setQuantityDraft] = useState(retainedDraft?.quantity ?? quantityDraftValue(availableQuantity.amount));
  const quantitySourceRef = useRef({ foodId: food.id, ...availableQuantity });
  const currentQuantityDraft = quantitySourceRef.current.foodId === food.id && quantitySourceRef.current.unit === availableQuantity.unit
    ? quantityDraft
    : quantityDraftValue(availableQuantity.amount);
  const quantitySelection = validateQuantitySelection(currentQuantityDraft, availableQuantity.amount);
  const eventQuantity = quantitySelection.quantity ?? 0;
  const canRecordQuantity = quantitySelection.error === null;
  const halfQuantity = halfEventQuantity(availableQuantity.amount);
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
  const selectedStorageCode = storageCode(storage);
  const selectedStorageLocationName = storageLocationId
    ? storageLocations?.find((location) => location.id === storageLocationId)?.name
    : undefined;
  const selectedStorageLabel = storageLocationSummary(selectedStorageLocationName, storage);
  const storageSelectionChanged = storage !== food.storage || storageLocationId !== (food.storageLocationId ?? null);
  const openedSelectionChanged = opened !== food.opened;
  const openedStateSummary = openedSelectionChanged
    ? "개봉 상태 저장 전"
    : `개봉 상태 · ${opened ? "개봉됨" : "미개봉"}`;
  const hasPendingStorageChanges = storageSelectionChanged || openedSelectionChanged;
  const hasPendingQuantityChanges = eventQuantity !== availableQuantity.amount;
  const hasPendingSaveChanges = hasPendingStorageChanges;
  const pendingDetailChangeLabels = [
    storageSelectionChanged ? "보관 위치" : null,
    openedSelectionChanged ? "개봉 상태" : null,
    hasPendingStorageChanges && hasPendingQuantityChanges ? "수량" : null,
  ].filter((value): value is string => Boolean(value));
  const pendingDetailChangeSummary = pendingDetailChangeLabels.length
    ? `저장 필요 · ${pendingDetailChangeLabels.join(" · ")}`
    : "";
  const pendingConsumeStateLabels = [
    storageSelectionChanged ? "보관 위치" : null,
    openedSelectionChanged ? "개봉 상태" : null,
  ].filter((value): value is string => Boolean(value));
  const pendingConsumeStateCopy = pendingConsumeStateLabels.length
    ? `저장하지 않은 ${pendingConsumeStateLabels.join("와 ")} 변경은 먹은 기록에 포함되지 않아요. 저장하려면 돌아가서 변경 저장을 눌러 주세요.`
    : null;
  const dateStorageMismatch = Boolean(food.dateStorageHint && food.dateStorageHint !== selectedStorageCode);
  const productStorageMismatch = Boolean(!dateStorageMismatch && food.productProvenance?.storageHint && food.productProvenance.storageHint !== selectedStorageCode);
  const needsSafetyReviewBeforeConsume = Boolean(food.dateKind === "unknown" || dateReviewReason || dateStorageMismatch);
  const dateProofDetail = food.dateKind === "user_confirmed" ? dateEditorValue(food).replaceAll("-", ".") || food.dateLabel : food.dateDetail;
  const canConfirmDate = food.dateKind === "estimated_use_first" || food.dateKind === "unknown" || food.dateKind === "user_confirmed";
  const editingUserReminder = food.dateKind === "user_confirmed";
  const dateConfirmationTitle = editingUserReminder
    ? "내 알림일 수정"
    : food.dateKind === "unknown"
      ? "포장지 날짜 입력"
      : "포장지에서 확인한 날짜 입력";
  const dateConfirmationDescription = editingUserReminder
    ? ""
    : food.dateKind === "unknown"
      ? "날짜 의미를 골라 입력해요."
      : "날짜 의미를 골라 입력해요.";
  const canRecheckPrintedLabel = Boolean(onOpenLabelReview && !readOnly && food.dateKind === "actual_printed");
  const compactPrintedDateRecheck = canRecheckPrintedLabel && dateReviewReason === "조리 전 날짜 확인";
  const manualPackageDateConfirmationNote = food.dateKind === "actual_printed"
    && ["user_input", "사용자 입력", "포장지에서 사용자 확인"].includes(food.dateSource.trim())
    // The date proof already reads "포장지에서 사용자 확인"; the confirm flow's saved note only repeats it.
    && ["포장지에서 확인한 날짜를 사용자 확인으로 기록했어요.", "포장지에서 날짜를 확인했어요."].includes(food.note.trim());
  const detailNote = detailFoodNote(food.note, food.dateKind, Boolean(dateReviewReason), Boolean(purchasedAtLabel && (hasShoppingPurchase || hasReceiptPurchase)));
  const showDetailNote = Boolean(detailNote) && !manualPackageDateConfirmationNote;
  const hasReferenceSources = Boolean(hasReceiptProvenance || hasReceiptPurchase || hasShoppingPurchase || purchasedAtLabel || food.barcode || food.productProvenance);
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
  const dateConfirmationAction = canConfirmDate && !readOnly
    ? dateEditorOpen
        ? <Suspense fallback={<div className="date-editor-loading" role="status">날짜 입력 화면을 준비하고 있어요</div>}><DateAssertionEditor initialValue={dateEditorDraft?.value ?? dateEditorValue(food)} initialKind={dateEditorDraft ? dateEditorDraft.kind : dateEditorKind(food)} originalKind={dateEditorKind(food)} onDraftChange={setDateEditorDraft} title={editingUserReminder ? "내 알림일 수정" : undefined} description={editingUserReminder ? "" : undefined} onCancel={closeDateEditor} onConfirm={(dateValue, kind) => onConfirmDate(food.id, dateValue, kind)} /></Suspense>
        : <button ref={dateConfirmationActionRef} data-testid="date-confirmation-action" className={`date-edit-button${food.dateKind === "unknown" ? " date-edit-button-needed" : ""}`} type="button" onClick={() => setDateEditorOpen(true)}><CalendarIcon width={15} height={15} /><span><strong>{dateConfirmationTitle}</strong><small>{dateConfirmationDescription}</small></span><ArrowRightIcon width={15} height={15} /></button>
    : null;

  useEffect(() => {
    setStorage(retainedDraft?.storage ?? food.storage);
    setStorageLocationId(retainedDraft ? retainedDraft.storageLocationId : food.storageLocationId ?? null);
    setOpened(retainedDraft?.opened ?? food.opened);
    setDiscardConfirm(false);
    setConsumeConfirm(false);
    setDateEditorOpen(retainedDraft?.dateEditorOpen ?? false);
    setDateEditorDraft(retainedDraft?.dateDraft ?? null);
    setRemoveProductProvenanceConfirm(false);
    if (!productInfoSaving && !productInfoError && !productInfoNotice) setEditProductInfoOpen(retainedDraft?.productEditor?.open ?? false);
    setProductNameDraft(retainedDraft?.productEditor?.name ?? food.name);
    setProductBrandDraft(retainedDraft?.productEditor?.brand ?? displayFoodBrand(food.brand));
    setProductCategoryDraft(retainedDraft?.productEditor?.category ?? food.category);
  }, [food.brand, food.category, food.id, food.name, food.opened, food.openedAt, food.quantity, food.storage, food.storageLocationId, food.dateKind, food.dateDetail, food.dateAssertionKind]);

  useEffect(() => {
    if (retainedDraft || (!autoFocusDateReview && !autoFocusPrimaryAction && !autoFocusProvenanceReview) || readOnly || dateEditorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const storageReviewTarget = dateStorageMismatch
        ? document.querySelector<HTMLElement>(".detail-sheet-content .storage-picker .storage-option-active")
        : null;
      const target = autoFocusDateReview
        ? dateConfirmationActionRef.current ?? (!dateReviewReason ? storageReviewTarget : null) ?? dateReviewActionRef.current ?? storageReviewTarget ?? dateProofRef.current
        : autoFocusProvenanceReview
          ? productProvenanceReviewActionRef.current
          : detailActionPrimaryRef.current;
      revealAndFocus(target, { block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusDateReview, autoFocusPrimaryAction, autoFocusProvenanceReview, canConfirmDate, dateEditorOpen, dateReviewReason, dateStorageMismatch, food.dateAssertionKind, food.dateKind, food.dateLabel, food.id, readOnly]);

  const requestConsume = () => {
    if (readOnly || !isValidEventQuantity(eventQuantity, availableQuantity.amount)) return;
    keyboard.hide();
    if (needsSafetyReviewBeforeConsume) {
      setConsumeConfirm(true);
      return;
    }
    onConsume(food.id, eventQuantity);
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
      consumeConfirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
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
    const frame = window.requestAnimationFrame(() => revealAndFocus(detailActionPrimaryRef.current, { block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [consumeConfirm]);

  useEffect(() => {
    if (!discardConfirm) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(discardConfirmRef.current, "nearest", getMobileScrollBehavior());
      discardConfirmRef.current?.querySelector<HTMLButtonElement>(".secondary-sheet-button")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [discardConfirm]);

  useEffect(() => {
    if (!readOnly) return;
    setDiscardConfirm(false);
    setDateEditorOpen(retainedDraft?.dateEditorOpen ?? false);
    setDateEditorDraft(retainedDraft?.dateDraft ?? null);
    setRemoveProductProvenanceConfirm(false);
    setEditProductInfoOpen(false);
    keyboard.hide();
  }, [keyboard, readOnly]);

  const detailActionReviewCopy = [
    "이미 먹은 경우에만 기록해 주세요.",
    "먹어도 되는지는 앱에서 판단할 수 없어요.",
  ] as const;
  const discardRemainingQuantity = quantitySelection.remaining ?? availableQuantity.amount;
  const discardConsequenceCopy = discardRemainingQuantity > 0
    ? `폐기 후 남는 수량: ${formatQuantityAmount(discardRemainingQuantity)}${availableQuantity.unit}.`
    : "폐기 기록 후 이 식품은 목록에서 사라져요.";
  const storageMismatchCallout = dateStorageMismatch ? <div className="storage-mismatch-callout" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>포장지 보관조건과 현재 위치가 달라요</strong><small>{food.dateStorageConditionText ?? `${storageHintLabel(food.dateStorageHint)} 보관 기준으로 표시된 날짜예요.`} 현재는 {selectedStorageLabel}에 보관 중이라 포장지와 실제 보관 상태를 다시 확인해 주세요. 날짜 자체는 자동으로 바꾸지 않아요.</small></span></div> : null;

  const detailActionsSection = (
    <div className="detail-actions-anchor" ref={detailActionsAnchorRef}>
      <span className="detail-actions-sentinel" aria-hidden="true" />
      {consumeConfirm ? <div ref={consumeConfirmRef} className="discard-confirm consume-confirm" role="group" aria-labelledby="consume-confirm-title" aria-describedby="consume-confirm-description" aria-live="polite"><div><strong id="consume-confirm-title">이 수량을 먹은 기록으로 남길까요?</strong><div className="consume-confirm-quantity" role="group" aria-label="이번 소비 기록"><span>{food.name}</span><strong>{formatQuantityAmount(eventQuantity)}{availableQuantity.unit}</strong></div><div className="consume-confirm-remaining" role="status"><span>남는 수량</span><strong>{quantitySelection.remaining === null ? "수량 확인" : `${formatQuantityAmount(quantitySelection.remaining)}${availableQuantity.unit}`}</strong></div><div id="consume-confirm-description" className="consume-confirm-description">{pendingConsumeStateCopy ? <small className="consume-confirm-unsaved-copy"><MetadataText text={pendingConsumeStateCopy} /></small> : null}<small className="consume-confirm-safety-copy">이미 먹은 수량만 기록해요. 먹어도 되는지는 앱에서 판단할 수 없어요.</small></div></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setConsumeConfirm(false)}>{pendingConsumeStateCopy ? "돌아가서 변경 저장" : "돌아가기"}</button><button className="primary-sheet-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!readOnly && isValidEventQuantity(eventQuantity, availableQuantity.amount)) onConsume(food.id, eventQuantity); }}>먹었어요</button></div></div> : (
        <>
          {needsSafetyReviewBeforeConsume ? <span id="consume-safety-hint" className="sr-only">{detailActionReviewCopy[0]}</span> : null}
          <div className={`detail-actions${needsSafetyReviewBeforeConsume ? " detail-actions-review" : ""}${hasPendingSaveChanges ? "" : " detail-actions-no-save"}`} role="group" aria-label="식품 기록 행동"><button ref={detailActionPrimaryRef} className={`secondary-sheet-button detail-consume-action${needsSafetyReviewBeforeConsume ? " detail-consume-action-review" : ""}`} type="button" aria-label={needsSafetyReviewBeforeConsume ? "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기" : undefined} aria-describedby={needsSafetyReviewBeforeConsume ? "consume-safety-hint" : undefined} disabled={!canRecordQuantity} onClick={requestConsume}><CheckCircledIcon width={17} height={17} /> {needsSafetyReviewBeforeConsume ? "먹은 기록 남기기" : canRecordQuantity && eventQuantity < availableQuantity.amount ? `${formatQuantityAmount(eventQuantity)}${availableQuantity.unit} 먹었어요` : "먹었어요"}</button>{hasPendingSaveChanges ? <button className="primary-sheet-button detail-save-action detail-save-pending" type="button" aria-label={`${pendingDetailChangeLabels.join(", ")} 변경 저장`} disabled={!canRecordQuantity} onClick={() => { if (!readOnly && isValidEventQuantity(eventQuantity, availableQuantity.amount)) { keyboard.hide(); onSave(food.id, storage, opened, eventQuantity, storageLocationId); } }}>{storageSaving ? "저장 중" : "변경 저장"} <ArrowRightIcon width={17} height={17} /></button> : null}</div>
          {hasPendingSaveChanges ? <p className="detail-save-hint" role="note" style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "6px 2px 0", padding: 0, border: 0, background: "transparent", color: "var(--atelier-amber)", fontSize: 12, lineHeight: 1.45, wordBreak: "keep-all" }}><InfoCircledIcon width={14} height={14} />저장하지 않고 닫으면 보관 상태가 바뀌지 않아요.</p> : null}
        </>
      )}
    </div>
  );
  const discardSection = discardConfirm && !readOnly ? (
    <div ref={discardConfirmRef} className="discard-confirm" role="alert">
      <div>
        <strong>폐기할 항목과 수량을 확인해 주세요</strong>
        <div className="discard-confirm-quantity" role="group" aria-label="이번 폐기 기록">
          <span>{food.name}</span>
          <strong>{formatQuantityAmount(eventQuantity)}{availableQuantity.unit}</strong>
        </div>
        <small>{discardConsequenceCopy}</small>
        <small>날짜만으로 안전 여부를 판단하지 않아요. 실제 상태가 이상한 경우에만 폐기 기록을 남겨 주세요.</small>
      </div>
      <div className="discard-confirm-actions">
        <button className="secondary-sheet-button" type="button" onClick={closeDiscardConfirmation}>취소</button>
        <button className="danger-sheet-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!readOnly && isValidEventQuantity(eventQuantity, availableQuantity.amount)) onDiscard(food.id, eventQuantity); }}>폐기 기록</button>
      </div>
    </div>
  ) : <button ref={discardActionRef} className="danger-text-button" type="button" disabled={!canRecordQuantity} onClick={() => { if (!isValidEventQuantity(eventQuantity, availableQuantity.amount)) return; keyboard.hide(); setDiscardConfirm(true); }}><InfoCircledIcon width={14} height={14} /> 상태가 이상해 폐기하기</button>;
  const productDraftChanged = productInfoDraftChanged(food, { name: productNameDraft, brand: productBrandDraft, category: productCategoryDraft });
  const productInfoSection = readOnly ? null : editProductInfoOpen ? (
    <div className="product-info-editor" role="group" aria-label="상품 정보 수정" aria-busy={productInfoSaving}>
      <div className="product-info-editor-heading">
        <span><Pencil1Icon width={16} height={16} /><strong>상품 정보 수정</strong></span>
      </div>
      <label className="product-info-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={productNameDraft} autoComplete="off" spellCheck={false} aria-label="상품명 수정" disabled={productInfoSaving} onChange={(event) => setProductNameDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>브랜드 (선택)</span><KeyboardInput className="app-input" value={productBrandDraft} autoComplete="off" spellCheck={false} aria-label="브랜드 수정" disabled={productInfoSaving} onChange={(event) => setProductBrandDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>분류</span><KeyboardInput className="app-input" value={productCategoryDraft} autoComplete="off" spellCheck={false} aria-label="분류 수정" disabled={productInfoSaving} onChange={(event) => setProductCategoryDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      {productDraftChanged && food.productProvenance ? <p className="product-info-editor-note"><InfoCircledIcon width={14} height={14} />참고한 상품 정보 연결은 해제되고 변경 내역에 남아요. 날짜·수량·보관 위치는 유지돼요.</p> : null}
      <div className="product-info-editor-actions">
        <button type="button" className="secondary-sheet-button" disabled={productInfoSaving} onClick={closeProductInfoEditor}>취소</button>
        <button type="button" className="primary-sheet-button" aria-busy={productInfoSaving} onPointerDown={(event) => event.preventDefault()} disabled={productInfoSaving || !productDraftChanged || !productNameDraft.trim() || !productCategoryDraft.trim()} onClick={() => { onUpdateProductInfo(food.id, { name: productNameDraft.trim(), brand: productBrandDraft.trim(), category: productCategoryDraft.trim() }); keyboard.hide(); }}>{productInfoSaving ? "저장 중" : productInfoError ? "다시 저장" : "상품 정보 저장"}</button>
      </div>
    </div>
  ) : (
    <button ref={productInfoEditActionRef} type="button" className="product-info-edit-button" disabled={readOnly} onClick={() => setEditProductInfoOpen(true)}>
      <Pencil1Icon width={15} height={15} />
      <span><strong>상품 정보 수정</strong></span>
      <ArrowRightIcon width={15} height={15} />
    </button>
  );

  return (
      <div className="detail-storage-view" aria-busy={storageSaving}>
      {storageSaving ? <p className="detail-storage-save-status" role="status">보관 변경을 저장하고 있어요.</p> : storageRecovery ? <div className="account-error detail-storage-recovery" role="alert"><InfoCircledIcon width={16} height={16} /><span>{storageRecovery.message}</span><button ref={storageRetryActionRef} className="account-error-action" type="button" onClick={storageRecovery.retry}>다시 시도</button>{storageRecovery.canEdit && onEditStorageRecovery ? <button className="account-error-action" type="button" onClick={onEditStorageRecovery}>선택 다시 수정</button> : null}</div> : null}
      <fieldset className="detail-sheet-content detail-edit-fields" data-read-only={readOnly ? "true" : undefined} disabled={storageSaving || Boolean(storageRecovery)}>
      <div className="detail-hero"><div className={`detail-image-wrap detail-sticker freshness-${foodFreshness(food, new Date()).bucket}`} data-estimated={foodFreshness(food, new Date()).estimated}><FoodPhoto src={food.image} foodName={food.name} loading="eager" alt="" className="detail-image" draggable={false} /></div><div className="detail-hero-copy"><div className="detail-hero-state-summary" role="group" aria-label="보관 및 개봉 상태"><span className={`storage-pill ${getStorageClass(storage)}${storageSelectionChanged ? " detail-hero-storage-pending" : ""}`}><MetadataText text={<>{storageSelectionChanged ? `저장 전 · ${selectedStorageLabel}` : `${selectedStorageLabel} 보관 중`}</>} /></span><span className={openedSelectionChanged ? "detail-hero-open-state-pending" : ""}><MetadataText text={<>{openedStateSummary}</>} /></span></div><strong className="detail-quantity-summary">남은 {food.quantity}</strong>{foodIdentityParts(food.brand, food.purchaseSource).length ? <p><Metadata parts={foodIdentityParts(food.brand, food.purchaseSource)} /></p> : null}</div></div>
      {readOnly ? <div className="detail-read-only-callout" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>최근 확인한 기록이에요</strong><small>오프라인 상태라 수정할 수 없어요. 연결 후 기록할 수 있어요.</small></span></div> : null}
      {remoteRefreshRequired ? <div className="detail-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>저장된 식품 정보를 다시 확인해 주세요</strong><small>지금 입력한 내용은 그대로예요. 다시 불러오면 저장하지 않은 입력은 사라질 수 있어요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={async () => { await onRefreshRemote?.(); window.requestAnimationFrame(() => detailActionPrimaryRef.current?.focus({ preventScroll: true })); }}>다시 불러오기</button></div> : null}
      {productInfoError ? <div className="account-error product-info-save-error" role="alert" aria-busy={productInfoSaving}><InfoCircledIcon width={15} height={15} /><span>{productInfoSaving ? "상품 정보를 다시 저장하는 중이에요." : productInfoError}</span>{!editProductInfoOpen ? <button className="account-error-action" type="button" disabled={productInfoSaving} onPointerDown={(event) => event.preventDefault()} onClick={() => setEditProductInfoOpen(true)}>입력 내용 확인</button> : null}</div> : null}
      {productInfoNotice ? <div className="product-info-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productInfoNotice}</span>{onRefreshProductInfo ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductInfo()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceNotice ? <div className="product-provenance-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productProvenanceNotice}</span>{onRefreshProductProvenance ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductProvenance()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceError ? <div className="account-error product-provenance-save-error" role="alert" aria-busy={productProvenanceMutating}><InfoCircledIcon width={15} height={15} /><span>{productProvenanceMutating ? "상품 정보를 지우는 중이에요." : productProvenanceError}</span>{onRetryProductProvenance ? <button className="account-error-action" type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductProvenance}>{productProvenanceMutating ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
      <div ref={dateProofRef} tabIndex={-1} className={`date-proof-card date-proof-${food.dateKind === "user_confirmed" ? "user-confirmed" : food.dateKind === "unknown" ? "unknown" : food.dateKind === "estimated_use_first" ? "estimated" : "printed"}`} data-date-state={food.dateKind} role="group" aria-label={`날짜 정보: ${getDateBadge(food)}`}>
        <div className="proof-icon"><CalendarIcon width={18} height={18} /></div>
        <div>
          <span>{getDateBadge(food)}</span>
          {food.dateKind !== "unknown" ? <strong><MetadataText text={food.dateKind === "estimated_use_first" ? food.dateLabel : dateProofDetail} /></strong> : null}
          <small><MetadataText text={food.dateKind === "unknown" ? "포장지 날짜를 아직 기록하지 않았어요." : dateSourceLabel(food.dateSource, food.dateKind)} /></small>
        </div>
        {food.dateKind !== "unknown" ? (() => { const freshness = foodFreshness(food, new Date()); return <strong className={`freshness-chip detail-freshness-chip freshness-${freshness.bucket}`} data-estimated={freshness.estimated} aria-label={freshnessSpokenLabel(freshness)}>{freshnessChipLabel(freshness)}</strong>; })() : null}
        <button ref={guidanceActionRef} type="button" onClick={() => onShowGuidance({ source: guidanceDraftSource(food), storage, storageLocationId, opened, quantity: currentQuantityDraft, dateEditorOpen, dateDraft: dateEditorDraft, productEditor: { open: editProductInfoOpen, name: productNameDraft, brand: productBrandDraft, category: productCategoryDraft } })} aria-label="날짜 안내 보기"><InfoCircledIcon width={16} height={16} /></button>
      </div>
      {dateReviewReason && food.dateKind !== "unknown" ? (
        <div className={`date-review-callout${compactPrintedDateRecheck ? " date-review-callout-compact" : ""}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="date-review-icon"><InfoCircledIcon width={16} height={16} /></span>
          <span>
            <strong>{dateReviewReason === "날짜 의미 확인" ? "포장지 날짜 종류를 골라 주세요" : dateReviewReason === "포장지 날짜 확인" ? "포장지 날짜를 확인해 주세요" : "조리 전 확인이 필요해요"}</strong>
    <small>{dateReviewReason === "날짜 의미 확인" ? "포장일과 제조일은 소비기한이 아니에요. 이 날짜를 소비기한으로 바꾸지 않고, 소비기한이 적힌 면과 보관 방법을 따로 살펴봐 주세요." : dateReviewReason === "포장지 날짜 확인" ? "포장지 날짜를 기록하지 않았어요. 포장지와 보관 방법을 살펴본 뒤 조리해 주세요." : `${printedDatePassedSentence(food.dateLabel)} 보관 방법과 개봉 상태도 확인해 주세요.`}</small>
            {canRecheckPrintedLabel && dateReviewReason === "날짜 의미 확인" ? <button ref={dateReviewActionRef} className="date-edit-button" type="button" onClick={onOpenLabelReview}><CalendarIcon width={15} height={15} /><span><strong>포장지에서 소비기한 다시 확인</strong><small>날짜를 새 식품 기록에 저장하거나 기존 식품 기록을 수정할지 선택해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : null}
          </span>
          {compactPrintedDateRecheck ? <button ref={dateReviewActionRef} className="date-edit-button date-edit-button-compact" type="button" aria-label="포장지에서 날짜 다시 확인" title="포장지에서 날짜 다시 확인" onClick={() => onOpenLabelReview?.()}><CalendarIcon width={17} height={17} /><span>날짜 다시 확인</span></button> : null}
        </div>
      ) : null}
      {food.dateKind === "estimated_use_first" ? <p className="detail-note" role="note"><InfoCircledIcon width={15} height={15} />소비기한이 아닌 참고 날짜예요.</p> : null}
      {dateConfirmationAction}
      {canRecheckPrintedLabel && !dateReviewReason ? <button className="date-edit-button date-edit-button-compact date-edit-button-neutral" type="button" aria-label="포장지에서 날짜 다시 확인" onClick={() => onOpenLabelReview?.()}><CalendarIcon width={17} height={17} /><span>날짜 다시 확인</span><ArrowRightIcon width={15} height={15} /></button> : null}
      {showDetailNote ? <p className="detail-note"><InfoCircledIcon width={15} height={15} /> {detailNote}</p> : null}
      {!readOnly ? <QuantityReferenceEditor key={food.id} food={food} initiallyEditing={autoFocusQuantityReference} returnToMeal={autoFocusQuantityReference} onSave={onUpdateQuantityReference} /> : null}
      {productInfoSection}
      {!readOnly ? <>
      <section className="detail-quantity-controls" aria-label="기록 수량 선택">
        <div className="detail-quantity-heading"><label htmlFor="food-event-quantity">기록할 수량</label><span id="food-event-quantity-available">남은 {food.quantity}</span></div>
        <div className="detail-quantity-presets" role="group" aria-label="수량 빠르게 선택">
          <button type="button" onPointerDown={(event) => event.preventDefault()} disabled={readOnly || !isValidEventQuantity(availableQuantity.amount, availableQuantity.amount)} aria-pressed={canRecordQuantity && eventQuantity === availableQuantity.amount} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(availableQuantity.amount)); }}>전체</button>
          {halfQuantity !== null ? <button type="button" onPointerDown={(event) => event.preventDefault()} disabled={readOnly} aria-pressed={eventQuantity === halfQuantity} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(halfQuantity)); }}><span>절반</span>{" "}<span className="quantity-preset-value">{formatQuantityAmount(halfQuantity)}{availableQuantity.unit}</span></button> : null}
        </div>
        <div className="detail-quantity-editor">
          <button type="button" onPointerDown={(event) => event.preventDefault()} aria-label={`수량 줄이기 (${formatQuantityAmount(step)}${availableQuantity.unit}씩)`} disabled={readOnly || !canRecordQuantity || eventQuantity <= Math.min(MIN_QUANTITY_STEP, step)} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(stepEventQuantity(eventQuantity, -1, availableQuantity.amount, availableQuantity.unit))); }}>−</button>
          <div className="detail-quantity-input-wrap">
            <KeyboardInput id="food-event-quantity" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" value={currentQuantityDraft} disabled={readOnly} aria-invalid={!canRecordQuantity} aria-describedby="food-event-quantity-available food-event-quantity-note" onChange={(event) => updateQuantityDraft(event.target.value)} onBlur={() => keyboard.hide()} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); keyboard.hide(); } }} />
            <span>{availableQuantity.unit}</span>
          </div>
          <button type="button" onPointerDown={(event) => event.preventDefault()} aria-label={`수량 늘리기 (${formatQuantityAmount(step)}${availableQuantity.unit}씩)`} disabled={readOnly || !canRecordQuantity || eventQuantity >= availableQuantity.amount} onClick={() => { keyboard.hide(); updateQuantityDraft(quantityDraftValue(stepEventQuantity(eventQuantity, 1, availableQuantity.amount, availableQuantity.unit))); }}>+</button>
        </div>
        <p id="food-event-quantity-note" className={`detail-quantity-note${canRecordQuantity ? "" : " detail-quantity-error"}`} role="status">{quantitySelection.error ?? (quantitySelection.remaining > 0 ? `먹거나 폐기한 뒤 ${formatQuantityAmount(quantitySelection.remaining)}${availableQuantity.unit} 남아요.` : "")}</p>
      </section>
      </> : null}
      {!readOnly ? detailActionsSection : null}
      {!readOnly ? <div className="detail-danger-zone" role="group" aria-label="폐기">{discardSection}</div> : null}
      {hasReferenceSources ? <section className="detail-source-group" aria-label="구매와 상품 정보" style={{ display: "grid", gap: 8 }}><div className="detail-source-group-heading" style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between", padding: "1px 2px 0" }}><span style={{ color: "var(--atelier-muted)", fontSize: 12, fontWeight: 600 }}>구매와 상품 정보</span></div>
      {hasReceiptProvenance || hasReceiptPurchase || hasShoppingPurchase || purchasedAtLabel || food.barcode ? <div className="food-provenance-card" role="group" aria-label="구매 기록"><span className="food-provenance-icon"><FileTextIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>구매 내역</span><strong>{hasReceiptProvenance || hasReceiptPurchase ? "영수증에서 추가" : hasShoppingPurchase ? "장보기 목록에서 구매" : "구매 기록"}</strong><small><MetadataText text={<>{purchasedAtLabel ? `${purchasedAtLabel} 구매` : "구매일 미등록"} · {hasReceiptProvenance ? "영수증 상품 항목" : hasReceiptPurchase ? "영수증에서 추가" : hasShoppingPurchase ? "장보기 목록에서 추가" : "직접 입력"}</>} /></small>{food.barcode ? <small><MetadataText text={<>상품 바코드 · {food.barcode}</>} /></small> : null}{food.dateKind !== "estimated_use_first" ? <small>구매일만으로 소비기한을 알 수는 없어요.</small> : null}</span></div> : null}
      {food.productProvenance ? <div className="food-provenance-card product-provenance-card" role="group" aria-label="상품 정보"><span className="food-provenance-icon"><ReaderIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>상품 정보 <em className="provenance-role-label">참고</em></span><strong>{productSourceLabel(food.productProvenance.source)}</strong><small><MetadataText text={<>{productFreshnessLabel(food.productProvenance.sourceFreshness)}{storageHintLabel(food.productProvenance.storageHint) ? ` · 상품 정보에 나온 보관 방법 ${storageHintLabel(food.productProvenance.storageHint)}` : ""}</>} /></small><small>{productProvenanceNote(food.productProvenance.note)}</small>{productStorageMismatch ? <small className="storage-hint-mismatch-note">상품 정보에 나온 보관 방법과 현재 보관 위치가 달라요.</small> : null}{food.productProvenance.sourceUrl && /^https?:\/\//.test(food.productProvenance.sourceUrl) ? <a href={food.productProvenance.sourceUrl} target="_blank" rel="noreferrer">상품 정보 더 보기</a> : null}<small>상품 정보만으로 개별 포장의 소비기한을 알 수는 없어요. 포장지 날짜를 살펴봐 주세요.</small></span></div> : null}
      {food.productProvenance && !readOnly ? removeProductProvenanceConfirm ? <div className="product-provenance-remove-confirm" role="alert" aria-busy={productProvenanceMutating}><small>{productProvenanceMutating ? "상품 정보를 지우고 있어요." : "상품명은 그대로 두고 참고한 상품 정보만 지워요."}</small><span><button type="button" disabled={productProvenanceMutating} onClick={closeProductProvenanceConfirm}>취소</button><button type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onClick={() => onRemoveProductProvenance(food.id)}>{productProvenanceMutating ? "지우는 중" : "정보 지우기"}</button></span></div> : <button ref={productProvenanceReviewActionRef} type="button" className="product-provenance-remove-button" onClick={() => setRemoveProductProvenanceConfirm(true)}>상품 정보 지우기</button> : null}
      </section> : null}
      {readOnly ? <>
        {storageMismatchCallout}
        {food.storageLocationName ? <div className="detail-read-only-field"><strong>보관 위치</strong><span>{food.storageLocationName}</span></div> : null}
        {opened ? <div className="detail-read-only-field"><strong>개봉일</strong><span>{openedAtLabel ?? "미기록"}</span></div> : null}
      </> : <>
      <div className={`detail-section${hasPendingSaveChanges && !readOnly ? " detail-section-pending" : ""}`}><div className="detail-section-heading"><span><SewingPinIcon width={16} height={16} /> 보관 위치</span><small className={hasPendingSaveChanges && !readOnly ? "detail-section-status-pending" : ""} aria-live={hasPendingSaveChanges && !readOnly ? "polite" : undefined}><MetadataText text={readOnly ? "연결 후 변경할 수 있어요" : hasPendingSaveChanges ? pendingDetailChangeSummary : `${selectedStorageLabel}에 보관 중`} /></small></div><StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} readOnly={readOnly} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); }} />{storageMismatchCallout}</div>
      <div className="opened-row"><span><ArchiveIcon width={17} height={17} /><span><strong>개봉했어요</strong><small>{openedSelectionChanged ? "저장 전 선택이에요." : food.opened ? (openedAtLabel ? `${openedAtLabel}에 개봉 기록했어요.` : "개봉 기록은 되돌릴 수 없어요.") : readOnly ? "연결 후 개봉 기록을 남길 수 있어요." : ""}</small></span></span><button className={`toggle ${opened ? "toggle-on" : ""}`} type="button" role="switch" aria-label={`${food.name} 개봉 상태`} aria-checked={opened} disabled={readOnly || food.opened} onClick={() => setOpened((current) => !current)}><span /></button></div>
      </>}
      {mealApi.isConfigured ? <details className="detail-history-disclosure" open={historyDisclosureOpen} onToggle={(event) => { const open = event.currentTarget.open; setHistoryDisclosureOpen(open); onHistoryDisclosureChange?.(open); }} style={{ marginTop: 4, border: "1px solid var(--sheet-border)", borderRadius: 14, background: "color-mix(in srgb, var(--atelier-surface) 78%, transparent)" }}><summary style={{ display: "flex", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 12px", color: "var(--atelier-ink)", cursor: "pointer", listStyle: "none" }}><span style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, fontWeight: 600 }}><ReaderIcon width={16} height={16} style={{ color: "var(--atelier-pistachio)" }} />변경 기록</span><span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--atelier-muted)", fontSize: 12 }}>{historyDisclosureOpen ? "접기" : "기록 보기"} <ArrowRightIcon width={14} height={14} /></span></summary>{historyDisclosureOpen ? <div style={{ display: "grid", gap: 8, padding: "0 12px 12px" }}><Suspense fallback={null}><FoodHistory foodId={food.id} unit={availableQuantity.unit} storageLocations={storageLocations} historyRefreshKey={historyRefreshKey} highlightSyncOutboxId={focusSyncOutboxId} onOpenSyncRecord={onOpenSyncRecord} onOpenSyncNotification={onOpenSyncNotification} /><ProductProvenanceHistory foodId={food.id} refreshKey={food.productProvenance ? `${food.productProvenance.source}:${food.productProvenance.confidence}:${food.productProvenance.note}` : "none"} /><ProductInfoHistory foodId={food.id} refreshKey={`${food.name}:${food.brand}:${food.category}`} /></Suspense></div> : null}</details> : null}
      </fieldset>
    </div>
  );
}
