import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArchiveIcon, ArrowRightIcon, CalendarIcon, CheckCircledIcon, CheckIcon, FileTextIcon, InfoCircledIcon, Pencil1Icon, ReaderIcon, SewingPinIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { revealAndFocusWithinNearestContainer as revealAndFocus, scrollTargetWithinNearestContainer } from "./appScroll";
import { mealApi } from "./mealApi";
import type { ApiStorageLocation } from "./mealApi";
import type { DateConfirmationKind } from "./DateAssertionEditor";
import type { FoodItem, StorageType } from "./Prototype";
import { dateSourceLabel, getDateBadge } from "./datePresentation";

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

function isPrintedDateEvidenceNote(note: string) {
  return /포장지|유효년월일|표시 소비기한|표시 날짜/.test(note);
}

function displayFoodNote(note: string) {
  if (note === "소비기한은 포장지에서 확인해 주세요. 구매일과 AI 소비 우선순위만 기록했어요.") {
    return "구매일은 기록했어요. 소비기한은 포장지에서 확인해 주세요. 먼저 살펴볼 순서는 참고용이에요.";
  }
  return note;
}

function quantityParts(quantity: string) {
  const match = quantity.trim().match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);
  return { amount: match ? Number(match[1]) : 1, unit: match?.[2] || "개" };
}

function formatQuantityAmount(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
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
      {STORAGE_OPTIONS.map((option) => <button key={option} className={`storage-option ${!locationId && value === option ? "storage-option-active" : ""}`} type="button" aria-pressed={!locationId && value === option} disabled={readOnly} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(option, null); }}><span className={`storage-dot ${getStorageClass(option)}`} />{option}{!locationId && value === option ? <CheckIcon width={14} height={14} /> : null}</button>)}
      {customLocations.length ? <div className="storage-custom-options" role="group" aria-label="사용자 정의 보관 위치"><span className="storage-custom-heading">내 보관 위치</span>{customLocations.map((location) => <button key={location.id} className={`storage-option storage-custom-option ${locationId === location.id ? "storage-option-active" : ""}`} type="button" aria-pressed={locationId === location.id} disabled={readOnly} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(storageFromApi(location.storage_type), location.id); }}><span className={`storage-dot ${getStorageClass(storageFromApi(location.storage_type))}`} />{location.name}{locationId === location.id ? <CheckIcon width={14} height={14} /> : null}</button>)}</div> : null}
    </div>
  );
}

export default function FoodDetailSheet({
  food,
  readOnly = false,
  autoFocusDateReview = false,
  autoFocusPrimaryAction = false,
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
  productInfoError,
  onRetryProductInfo,
  productInfoSaving = false,
  productInfoNotice,
  onRefreshProductInfo,
  productProvenanceError,
  onRetryProductProvenance,
  productProvenanceMutating = false,
  productProvenanceNotice,
  onRefreshProductProvenance,
  onShowGuidance,
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
  autoFocusDateReview?: boolean;
  autoFocusPrimaryAction?: boolean;
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
  onUpdateProductInfo: (foodId: string, input: { name: string; brand: string; category: string }) => void;
  productInfoError?: string;
  onRetryProductInfo?: () => void;
  productInfoSaving?: boolean;
  productInfoNotice?: string;
  onRefreshProductInfo?: () => void | Promise<void>;
  productProvenanceError?: string;
  onRetryProductProvenance?: () => void;
  productProvenanceMutating?: boolean;
  productProvenanceNotice?: string;
  onRefreshProductProvenance?: () => void | Promise<void>;
  onShowGuidance: () => void;
  onOpenLabelReview?: () => void;
  onOpenSyncRecord?: (outboxId: string, foodId: string) => void;
  onOpenSyncNotification?: (outboxId: string) => void;
  focusSyncOutboxId?: string | null;
  historyRefreshKey?: number;
  initialHistoryDisclosureOpen?: boolean;
  onHistoryDisclosureChange?: (open: boolean) => void;
}) {
  const keyboard = useKeyboard();
  const [storage, setStorage] = useState<StorageType>(food.storage);
  const [storageLocationId, setStorageLocationId] = useState<string | null>(food.storageLocationId ?? null);
  const [opened, setOpened] = useState(food.opened);
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
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [removeProductProvenanceConfirm, setRemoveProductProvenanceConfirm] = useState(false);
  const [editProductInfoOpen, setEditProductInfoOpen] = useState(false);
  const [productNameDraft, setProductNameDraft] = useState(food.name);
  const [productBrandDraft, setProductBrandDraft] = useState(food.brand);
  const [productCategoryDraft, setProductCategoryDraft] = useState(food.category);

  useEffect(() => {
    if (focusSyncOutboxId) {
      setHistoryDisclosureOpen(true);
      onHistoryDisclosureChange?.(true);
    }
  }, [focusSyncOutboxId, onHistoryDisclosureChange]);
  const availableQuantity = quantityParts(food.quantity);
  const [eventQuantity, setEventQuantity] = useState(availableQuantity.amount);
  const purchasedAtLabel = formatPurchasedAt(food.purchasedAt);
  const openedAtLabel = formatOpenedAt(food.openedAt);
  const hasReceiptProvenance = Boolean(food.sourceReceiptId || food.sourceReceiptLineId);
  const hasReceiptPurchase = food.purchaseSource === "receipt";
  const hasShoppingPurchase = food.purchaseSource === "shopping_list";
  const selectedStorageCode = storageCode(storage);
  const selectedStorageLocationName = storageLocationId
    ? storageLocations?.find((location) => location.id === storageLocationId)?.name
    : undefined;
  const selectedStorageLabel = selectedStorageLocationName ?? storageHintLabel(selectedStorageCode);
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
    ? `저장하지 않은 ${pendingConsumeStateLabels.join(" · ")} 변경은 먹은 기록에 포함되지 않아요. 저장하려면 돌아가서 변경 저장을 눌러 주세요.`
    : null;
  const dateStorageMismatch = Boolean(food.dateStorageHint && food.dateStorageHint !== selectedStorageCode);
  const productStorageMismatch = Boolean(!dateStorageMismatch && food.productProvenance?.storageHint && food.productProvenance.storageHint !== selectedStorageCode);
  const needsSafetyReviewBeforeConsume = Boolean(dateReviewReason || dateStorageMismatch);
  const dateProofDetail = food.dateKind === "user_confirmed" ? food.dateLabel : food.dateDetail;
  const canConfirmDate = food.dateKind === "estimated_use_first" || food.dateKind === "unknown" || food.dateKind === "user_confirmed";
  const editingUserReminder = food.dateKind === "user_confirmed";
  const dateConfirmationTitle = editingUserReminder
    ? "확인한 알림 날짜 수정"
    : food.dateKind === "unknown"
      ? "확인하지 못한 날짜 입력"
      : "포장지에서 확인한 날짜 입력";
  const dateConfirmationDescription = editingUserReminder
    ? "기존 알림 날짜와 의미를 다시 확인해요."
    : food.dateKind === "unknown"
      ? "포장지에서 날짜 의미를 확인한 뒤 소비기한·품질유지기한·알림일로 저장해요."
      : "확인 후 소비기한·품질유지기한·알림일로 저장해요.";
  const canRecheckPrintedLabel = Boolean(onOpenLabelReview && !readOnly && food.dateKind === "actual_printed");
  const compactPrintedDateRecheck = canRecheckPrintedLabel && dateReviewReason === "조리 전 날짜 확인";
  const manualPackageDateConfirmationNote = food.dateKind === "actual_printed"
    && ["user_input", "사용자 입력", "포장지에서 사용자 확인"].includes(food.dateSource.trim())
    && food.note === "포장지에서 확인한 날짜를 사용자 확인으로 기록했어요.";
  const showDetailNote = Boolean(food.note.trim())
    && !(dateReviewReason && isPrintedDateEvidenceNote(food.note))
    && !manualPackageDateConfirmationNote;
  const detailNote = displayFoodNote(food.note);
  const hasReferenceSources = Boolean(hasReceiptProvenance || hasReceiptPurchase || hasShoppingPurchase || purchasedAtLabel || food.barcode || food.productProvenance);
  const closeDateEditor = () => {
    setDateEditorOpen(false);
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
  const dateConfirmationAction = canConfirmDate
    ? readOnly
      ? <div className="detail-read-only-inline-note" role="note"><CalendarIcon width={15} height={15} /><span><strong>날짜 수정은 연결 후 가능해요</strong><small>포장지 날짜는 볼 수 있어요. 연결이 복구되면 수정한 날짜를 저장할 수 있어요.</small></span></div>
      : dateEditorOpen
        ? <Suspense fallback={<div className="date-editor-loading" role="status">날짜 입력 화면을 준비하고 있어요</div>}><DateAssertionEditor initialValue={dateEditorValue(food)} initialKind={dateEditorKind(food)} title={editingUserReminder ? "확인한 알림 날짜 수정" : undefined} description={editingUserReminder ? "기존 알림 날짜와 의미를 다시 확인해요." : undefined} onCancel={closeDateEditor} onConfirm={(dateValue, kind) => onConfirmDate(food.id, dateValue, kind)} /></Suspense>
        : <button ref={dateConfirmationActionRef} data-testid="date-confirmation-action" className={`date-edit-button${food.dateKind === "unknown" ? " date-edit-button-needed" : ""}`} type="button" onClick={() => setDateEditorOpen(true)}><CalendarIcon width={15} height={15} /><span><strong>{dateConfirmationTitle}</strong><small>{dateConfirmationDescription}</small></span><ArrowRightIcon width={15} height={15} /></button>
    : null;

  useEffect(() => {
    setStorage(food.storage);
    setStorageLocationId(food.storageLocationId ?? null);
    setOpened(food.opened);
    setDiscardConfirm(false);
    setConsumeConfirm(false);
    setDateEditorOpen(false);
    setRemoveProductProvenanceConfirm(false);
    if (!productInfoSaving && !productInfoError && !productInfoNotice) setEditProductInfoOpen(false);
    setProductNameDraft(food.name);
    setProductBrandDraft(food.brand);
    setProductCategoryDraft(food.category);
    setEventQuantity(quantityParts(food.quantity).amount);
  }, [food.brand, food.category, food.id, food.name, food.opened, food.openedAt, food.quantity, food.storage, food.storageLocationId, productInfoError, productInfoNotice, productInfoSaving]);

  useEffect(() => {
    if ((!autoFocusDateReview && !autoFocusPrimaryAction && !autoFocusProvenanceReview) || readOnly || dateEditorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const storageReviewTarget = dateStorageMismatch
        ? document.querySelector<HTMLElement>(".detail-sheet-content .storage-picker .storage-option-active")
        : null;
      const target = autoFocusDateReview
        ? dateConfirmationActionRef.current ?? dateReviewActionRef.current ?? storageReviewTarget ?? dateProofRef.current
        : autoFocusProvenanceReview
          ? productProvenanceReviewActionRef.current
          : detailActionPrimaryRef.current;
      revealAndFocus(target, { block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusDateReview, autoFocusPrimaryAction, autoFocusProvenanceReview, canConfirmDate, dateEditorOpen, dateReviewReason, dateStorageMismatch, food.dateAssertionKind, food.dateKind, food.dateLabel, food.id, readOnly]);

  const requestConsume = () => {
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
    setDateEditorOpen(false);
    setRemoveProductProvenanceConfirm(false);
    setEditProductInfoOpen(false);
    keyboard.hide();
  }, [keyboard, readOnly]);

  const detailSaveHint = availableQuantity.amount > 1
    ? "보관 위치나 개봉 여부는 저장할 수 있어요. 수량 변경은 먹거나 버린 기록에 함께 저장돼요."
    : "보관 위치나 개봉 여부를 바꾼 뒤 저장할 수 있어요.";
  const detailActionReviewCopy = "이미 먹은 경우에만 기록해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.";
  const discardRemainingQuantity = Math.max(0, Number((availableQuantity.amount - eventQuantity).toFixed(3)));
  const discardConsequenceCopy = discardRemainingQuantity > 0
    ? `폐기 후 남는 수량: ${formatQuantityAmount(discardRemainingQuantity)}${availableQuantity.unit}.`
    : "폐기 기록 후 이 식품은 목록에서 사라져요.";
  const detailActionsSection = (
    <div className="detail-actions-anchor" ref={detailActionsAnchorRef}>
      <span className="detail-actions-sentinel" aria-hidden="true" />
      {readOnly ? <div className="detail-actions detail-actions-read-only" role="note"><InfoCircledIcon width={16} height={16} /><span><strong>기록 기능은 잠시 쉬고 있어요</strong><small>다시 연결하면 보관 상태 저장과 소비 기록을 이어갈 수 있어요.</small></span></div> : consumeConfirm ? <div ref={consumeConfirmRef} className="discard-confirm consume-confirm" role="group" aria-labelledby="consume-confirm-title" aria-describedby="consume-confirm-description" aria-live="polite"><div><strong id="consume-confirm-title">이 수량을 먹은 기록으로 남길까요?</strong><div className="consume-confirm-quantity" role="group" aria-label="이번 소비 기록"><span>{food.name}</span><strong>{formatQuantityAmount(eventQuantity)}{availableQuantity.unit}</strong></div><div id="consume-confirm-description" className="consume-confirm-description">{pendingConsumeStateCopy ? <small className="consume-confirm-unsaved-copy">{pendingConsumeStateCopy}</small> : null}<small className="consume-confirm-safety-copy">이미 먹은 경우에만 기록해 주세요. 포장지 날짜와 보관 상태를 살펴봐 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.</small></div></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setConsumeConfirm(false)}>{pendingConsumeStateCopy ? "돌아가서 변경 저장" : "돌아가기"}</button><button className="primary-sheet-button" type="button" onClick={() => onConsume(food.id, eventQuantity)}>먹었어요</button></div></div> : (
        <>
          {needsSafetyReviewBeforeConsume ? <div id="consume-safety-hint" className="detail-actions-review-copy" role="note"><strong>먹은 기록 안내</strong><small>{detailActionReviewCopy}</small></div> : null}
          <div className={`detail-actions${needsSafetyReviewBeforeConsume ? " detail-actions-review" : ""}${hasPendingSaveChanges ? "" : " detail-actions-no-save"}`} role="group" aria-label="식품 기록 행동"><button ref={detailActionPrimaryRef} className={`secondary-sheet-button detail-consume-action${needsSafetyReviewBeforeConsume ? " detail-consume-action-review" : ""}`} type="button" aria-label={needsSafetyReviewBeforeConsume ? "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기" : undefined} aria-describedby={needsSafetyReviewBeforeConsume ? "consume-safety-hint" : undefined} onClick={requestConsume}><CheckCircledIcon width={17} height={17} /> {needsSafetyReviewBeforeConsume ? "먹은 기록 남기기" : eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit} 먹었어요` : "먹었어요"}</button>{hasPendingSaveChanges ? <button className="primary-sheet-button detail-save-action detail-save-pending" type="button" aria-label={`${pendingDetailChangeSummary} 저장`} onClick={() => onSave(food.id, storage, opened, eventQuantity, storageLocationId)}>변경 저장 <ArrowRightIcon width={17} height={17} /></button> : null}</div>
          <p className="detail-save-hint" role="note" style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "6px 2px 0", padding: 0, border: 0, background: "transparent", color: hasPendingSaveChanges ? "var(--atelier-amber)" : "var(--atelier-muted)", fontSize: 12, lineHeight: 1.45 }}><InfoCircledIcon width={14} height={14} />{hasPendingSaveChanges ? "저장하지 않고 닫으면 보관 상태가 바뀌지 않아요." : detailSaveHint}</p>
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
        <button className="danger-sheet-button" type="button" onClick={() => onDiscard(food.id, eventQuantity)}>폐기 기록</button>
      </div>
    </div>
  ) : readOnly ? <div className="detail-read-only-inline-note detail-read-only-danger" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>폐기 기록은 연결 후 가능해요</strong><small>현재 화면은 마지막으로 확인한 재고를 보여주고 있어요.</small></span></div> : <button ref={discardActionRef} className="danger-text-button" type="button" onClick={() => setDiscardConfirm(true)}><InfoCircledIcon width={14} height={14} /> 상태가 이상해 폐기하기</button>;
  const productInfoSection = editProductInfoOpen ? (
    <div className="product-info-editor" role="group" aria-label="상품 정보 수정" aria-busy={productInfoSaving}>
      <div className="product-info-editor-heading">
        <span><Pencil1Icon width={16} height={16} /><strong>상품 정보 수정</strong></span>
        <small>{productInfoSaving ? "저장하고 있어요. 입력한 내용은 그대로 남아 있어요." : "상품명·브랜드·분류를 살펴봐요."}</small>
      </div>
      <label className="product-info-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={productNameDraft} autoComplete="off" spellCheck={false} aria-label="상품명 수정" disabled={productInfoSaving} onChange={(event) => setProductNameDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>브랜드</span><KeyboardInput className="app-input" value={productBrandDraft} autoComplete="off" spellCheck={false} aria-label="브랜드 수정" disabled={productInfoSaving} onChange={(event) => setProductBrandDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>분류</span><KeyboardInput className="app-input" value={productCategoryDraft} autoComplete="off" spellCheck={false} aria-label="분류 수정" disabled={productInfoSaving} onChange={(event) => setProductCategoryDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <p className="product-info-editor-note"><InfoCircledIcon width={14} height={14} />상품명을 바꾸면 기존 상품 정보는 기록에서 지워지고 변경 내역에 남아요. 날짜·수량·보관 위치는 유지돼요.</p>
      <div className="product-info-editor-actions">
        <button type="button" className="secondary-sheet-button" disabled={productInfoSaving} onClick={closeProductInfoEditor}>취소</button>
        <button type="button" className="primary-sheet-button" aria-busy={productInfoSaving} onPointerDown={(event) => event.preventDefault()} disabled={productInfoSaving || !productNameDraft.trim() || !productBrandDraft.trim() || !productCategoryDraft.trim()} onClick={() => { onUpdateProductInfo(food.id, { name: productNameDraft.trim(), brand: productBrandDraft.trim(), category: productCategoryDraft.trim() }); keyboard.hide(); }}>{productInfoSaving ? "저장 중" : "상품 정보 저장"}</button>
      </div>
    </div>
  ) : (
    <button ref={productInfoEditActionRef} type="button" className="product-info-edit-button" disabled={readOnly} onClick={() => setEditProductInfoOpen(true)}>
      <Pencil1Icon width={15} height={15} />
      <span><strong>{readOnly ? "상품 정보 수정은 연결 후 가능" : "상품 정보 수정"}</strong><small>{readOnly ? "최근 화면에서는 변경할 수 없어요." : "상품명이 다르면 직접 고칠 수 있어요."}</small></span>
      <ArrowRightIcon width={15} height={15} />
    </button>
  );

  return (
      <div className="detail-sheet-content">
      <div className="detail-hero"><div className="detail-image-wrap"><img src={food.image} alt="" className="detail-image" draggable={false} /></div><div className="detail-hero-copy"><div className="detail-hero-state-summary" role="group" aria-label="보관 및 개봉 상태"><span className={`storage-pill ${getStorageClass(storage)}${storageSelectionChanged ? " detail-hero-storage-pending" : ""}`}>{storageSelectionChanged ? `저장 전 · ${selectedStorageLabel}` : `${selectedStorageLabel} 보관 중`}</span><span className={openedSelectionChanged ? "detail-hero-open-state-pending" : ""}>{openedStateSummary}</span></div><h3>{food.name}</h3><p>{food.purchaseSource === "shopping_list" ? `장보기 · ${food.quantity}` : food.brand.trim() ? `${food.brand} · 남은 ${food.quantity}` : `남은 ${food.quantity}`}</p></div></div>
      {readOnly ? <div className="detail-read-only-callout" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>최근 확인한 화면이에요</strong><small>오프라인 상태라 변경할 수 없어요. 다시 연결하면 저장·소비·폐기를 기록할 수 있어요.</small></span></div> : null}
      {remoteRefreshRequired ? <div className="detail-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 이 식품이나 재고가 바뀌었어요</strong><small>지금 입력한 내용은 그대로예요. 다시 불러오면 저장하지 않은 입력은 사라질 수 있어요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={async () => { await onRefreshRemote?.(); window.requestAnimationFrame(() => detailActionPrimaryRef.current?.focus({ preventScroll: true })); }}>다시 불러오기</button></div> : null}
      {productInfoError ? <div className="account-error product-info-save-error" role="alert" aria-busy={productInfoSaving}><InfoCircledIcon width={15} height={15} /><span>{productInfoSaving ? "상품 정보를 다시 저장하는 중이에요." : productInfoError}</span>{onRetryProductInfo ? <button className="account-error-action" type="button" disabled={productInfoSaving} aria-busy={productInfoSaving} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductInfo}>{productInfoSaving ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
      {productInfoNotice ? <div className="product-info-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productInfoNotice}</span>{onRefreshProductInfo ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductInfo()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceNotice ? <div className="product-provenance-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productProvenanceNotice}</span>{onRefreshProductProvenance ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductProvenance()}>목록 새로고침</button> : null}</div> : null}
      {productProvenanceError ? <div className="account-error product-provenance-save-error" role="alert" aria-busy={productProvenanceMutating}><InfoCircledIcon width={15} height={15} /><span>{productProvenanceMutating ? "상품 정보를 지우는 중이에요." : productProvenanceError}</span>{onRetryProductProvenance ? <button className="account-error-action" type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductProvenance}>{productProvenanceMutating ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
      <div ref={dateProofRef} tabIndex={-1} className={`date-proof-card date-proof-${food.dateKind === "user_confirmed" ? "user-confirmed" : food.dateKind === "unknown" ? "unknown" : food.dateKind === "estimated_use_first" ? "estimated" : "printed"}`} data-date-state={food.dateKind} role="group" aria-label={`날짜 정보: ${getDateBadge(food)}`}><div className="proof-icon"><CalendarIcon width={18} height={18} /></div><div><span>{getDateBadge(food)}</span><strong>{food.dateKind === "estimated_use_first" ? `먼저 살펴볼 시점 · ${food.dateLabel}` : food.dateKind === "unknown" ? "포장지 날짜를 기록하지 않았어요" : dateProofDetail}</strong><small>{food.dateKind === "unknown" ? "포장지 날짜를 직접 살펴봐 주세요." : dateSourceLabel(food.dateSource, food.dateKind)}</small></div><button type="button" onClick={onShowGuidance} aria-label="날짜 안내 보기"><InfoCircledIcon width={16} height={16} /></button></div>
      {dateReviewReason ? (
        <div className={`date-review-callout${compactPrintedDateRecheck ? " date-review-callout-compact" : ""}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="date-review-icon"><InfoCircledIcon width={16} height={16} /></span>
          <span>
            <strong>{dateReviewReason === "날짜 의미 확인" ? "포장지 날짜 종류를 골라 주세요" : "조리 전에 포장지 날짜를 살펴봐 주세요"}</strong>
    <small>{dateReviewReason === "날짜 의미 확인" ? "포장일·제조일은 소비기한이 아니에요. 이 날짜를 소비기한으로 바꾸지 않고, 소비기한이 적힌 면과 보관 방법을 따로 살펴봐 주세요." : dateReviewReason === "포장지 날짜 확인" ? "포장지 날짜를 기록하지 않았어요. 포장지와 보관 방법을 살펴본 뒤 조리해 주세요." : "표시 날짜가 오늘이거나 지났어요. 현재 보관·개봉 상태도 함께 확인해 주세요."}</small>
            {canRecheckPrintedLabel && dateReviewReason === "날짜 의미 확인" ? <button ref={dateReviewActionRef} className="date-edit-button" type="button" onClick={onOpenLabelReview}><CalendarIcon width={15} height={15} /><span><strong>포장지에서 소비기한 다시 확인</strong><small>날짜를 새 식품 기록에 저장하거나 기존 식품 기록을 수정할지 선택해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : null}
          </span>
          {compactPrintedDateRecheck ? <button ref={dateReviewActionRef} className="date-edit-button date-edit-button-compact" type="button" aria-label="포장지에서 날짜 다시 확인" title="포장지에서 날짜 다시 확인" onClick={() => onOpenLabelReview?.()}><CalendarIcon width={17} height={17} /><span>날짜 다시 확인</span></button> : null}
        </div>
      ) : null}
      {dateConfirmationAction}
      {productInfoSection}
      {detailActionsSection}
      <div className="detail-danger-zone" role="group" aria-label="폐기">{discardSection}</div>
      {hasReferenceSources ? <section className="detail-source-group" aria-label="구매와 상품 정보" style={{ display: "grid", gap: 8 }}><div className="detail-source-group-heading" style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between", padding: "1px 2px 0" }}><span style={{ color: "var(--atelier-muted)", fontSize: 12, fontWeight: 600 }}>구매와 상품 정보</span><small style={{ color: "var(--atelier-dim)", fontSize: 12 }}>소비기한은 포장지에서 확인해 주세요.</small></div>
      {hasReceiptProvenance || hasReceiptPurchase || hasShoppingPurchase || purchasedAtLabel || food.barcode ? <div className="food-provenance-card" role="group" aria-label="구매 기록"><span className="food-provenance-icon"><FileTextIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>구매 내역</span><strong>{hasReceiptProvenance || hasReceiptPurchase ? "영수증에서 추가" : hasShoppingPurchase ? "장보기 목록에서 구매" : "구매 기록"}</strong><small>{purchasedAtLabel ? `${purchasedAtLabel} 구매` : "구매일 미등록"} · {hasReceiptProvenance ? "영수증 상품 항목" : hasReceiptPurchase ? "영수증에서 추가" : hasShoppingPurchase ? "장보기 목록에서 추가" : "직접 입력"}</small>{food.barcode ? <small>상품 바코드 · {food.barcode}</small> : null}<small>구매일만으로 소비기한을 알 수는 없어요.</small></span></div> : null}
      {food.productProvenance ? <div className="food-provenance-card product-provenance-card" role="group" aria-label="상품 정보"><span className="food-provenance-icon"><ReaderIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>상품 정보 <em className="provenance-role-label">참고</em></span><strong>{productSourceLabel(food.productProvenance.source)}</strong><small>{productFreshnessLabel(food.productProvenance.sourceFreshness)}{storageHintLabel(food.productProvenance.storageHint) ? ` · 상품 정보에 나온 보관 방법 ${storageHintLabel(food.productProvenance.storageHint)}` : ""}</small><small>{productProvenanceNote(food.productProvenance.note)}</small>{productStorageMismatch ? <small className="storage-hint-mismatch-note">상품 정보에 나온 보관 방법과 현재 보관 위치가 달라요.</small> : null}{food.productProvenance.sourceUrl && /^https?:\/\//.test(food.productProvenance.sourceUrl) ? <a href={food.productProvenance.sourceUrl} target="_blank" rel="noreferrer">상품 정보 더 보기</a> : null}<small>상품 정보만으로 개별 포장의 소비기한을 알 수는 없어요. 포장지 날짜를 살펴봐 주세요.</small></span></div> : null}
      {food.productProvenance ? readOnly ? <p className="detail-read-only-inline-note" role="note"><ReaderIcon width={15} height={15} /><span><strong>상품 정보는 연결 후 바꿀 수 있어요</strong><small>현재 상품 정보를 보여드려요.</small></span></p> : removeProductProvenanceConfirm ? <div className="product-provenance-remove-confirm" role="alert" aria-busy={productProvenanceMutating}><small>{productProvenanceMutating ? "상품 정보를 지우고 있어요." : "상품명은 그대로 두고 참고한 상품 정보만 지워요."}</small><span><button type="button" disabled={productProvenanceMutating} onClick={closeProductProvenanceConfirm}>취소</button><button type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onClick={() => onRemoveProductProvenance(food.id)}>{productProvenanceMutating ? "지우는 중" : "정보 지우기"}</button></span></div> : <button ref={productProvenanceReviewActionRef} type="button" className="product-provenance-remove-button" onClick={() => setRemoveProductProvenanceConfirm(true)}>상품 정보 지우기</button> : null}
      </section> : null}
      {food.dateKind === "estimated_use_first" ? <p className="detail-note" role="note"><InfoCircledIcon width={15} height={15} />먼저 살펴볼 순서는 식품 종류와 보관 방법을 참고한 안내예요. 소비기한이나 먹어도 되는지를 뜻하지 않아요. 포장지 날짜와 식품 상태를 확인해 주세요.</p> : null}
      {showDetailNote ? <p className="detail-note"><InfoCircledIcon width={15} height={15} /> {detailNote}</p> : null}
      <div className={`detail-section${hasPendingSaveChanges && !readOnly ? " detail-section-pending" : ""}`}><div className="detail-section-heading"><span><SewingPinIcon width={16} height={16} /> 보관 위치</span><small className={hasPendingSaveChanges && !readOnly ? "detail-section-status-pending" : ""} aria-live={hasPendingSaveChanges && !readOnly ? "polite" : undefined}>{readOnly ? "연결 후 변경할 수 있어요" : hasPendingSaveChanges ? pendingDetailChangeSummary : `${selectedStorageLabel}에 보관 중`}</small></div><StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} readOnly={readOnly} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); }} />{dateStorageMismatch ? <div className="storage-mismatch-callout" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>포장지 보관조건과 현재 위치가 달라요</strong><small>{food.dateStorageConditionText ?? `${storageHintLabel(food.dateStorageHint)} 보관 기준으로 표시된 날짜예요.`} 현재는 {selectedStorageLabel}에 보관 중이라 포장지와 실제 보관 상태를 다시 확인해 주세요. 날짜 자체는 자동으로 바꾸지 않아요.</small></span></div> : null}</div>
      {availableQuantity.amount > 1 ? <div className="quantity-row"><span><strong>변경할 수량</strong><small>일부만 옮기거나 먹을 수 있어요.</small></span><span className="quantity-stepper"><button type="button" aria-label="수량 줄이기" disabled={readOnly || eventQuantity <= 1} onClick={() => setEventQuantity((current) => Math.max(1, current - 1))}>−</button><strong>{eventQuantity}{availableQuantity.unit}</strong><button type="button" aria-label="수량 늘리기" disabled={readOnly || eventQuantity >= availableQuantity.amount} onClick={() => setEventQuantity((current) => Math.min(availableQuantity.amount, current + 1))}>+</button></span></div> : null}
      <div className="opened-row"><span><ArchiveIcon width={17} height={17} /><span><strong>개봉했어요</strong><small>{opened ? (openedAtLabel ? `${openedAtLabel}에 개봉 기록했어요.` : "개봉 기록은 되돌릴 수 없어요.") : readOnly ? "연결 후 개봉 기록을 남길 수 있어요." : "개봉한 식품은 먼저 살펴볼 수 있도록 보여드려요."}</small></span></span><button className={`toggle ${opened ? "toggle-on" : ""}`} type="button" role="switch" aria-label={`${food.name} 개봉 상태`} aria-checked={opened} disabled={readOnly || opened} onClick={() => setOpened(true)}><span /></button></div>
      {mealApi.isConfigured ? <details className="detail-history-disclosure" open={historyDisclosureOpen} onToggle={(event) => { const open = event.currentTarget.open; setHistoryDisclosureOpen(open); onHistoryDisclosureChange?.(open); }} style={{ marginTop: 4, border: "1px solid var(--sheet-border)", borderRadius: 14, background: "color-mix(in srgb, var(--atelier-surface) 78%, transparent)" }}><summary style={{ display: "flex", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 12px", color: "var(--atelier-ink)", cursor: "pointer", listStyle: "none" }}><span style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, fontWeight: 600 }}><ReaderIcon width={16} height={16} style={{ color: "var(--atelier-pistachio)" }} />변경 기록</span><span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--atelier-muted)", fontSize: 12 }}>{historyDisclosureOpen ? "접기" : "기록 보기"} <ArrowRightIcon width={14} height={14} /></span></summary>{historyDisclosureOpen ? <div style={{ display: "grid", gap: 8, padding: "0 12px 12px" }}><Suspense fallback={null}><FoodHistory foodId={food.id} unit={availableQuantity.unit} storageLocations={storageLocations} historyRefreshKey={historyRefreshKey} highlightSyncOutboxId={focusSyncOutboxId} onOpenSyncRecord={onOpenSyncRecord} onOpenSyncNotification={onOpenSyncNotification} /><ProductProvenanceHistory foodId={food.id} refreshKey={food.productProvenance ? `${food.productProvenance.source}:${food.productProvenance.confidence}:${food.productProvenance.note}` : "none"} /><ProductInfoHistory foodId={food.id} refreshKey={`${food.name}:${food.brand}:${food.category}`} /></Suspense></div> : null}</details> : null}
    </div>
  );
}
