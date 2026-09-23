import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArchiveIcon, ArrowRightIcon, CalendarIcon, CheckCircledIcon, CheckIcon, FileTextIcon, InfoCircledIcon, LightningBoltIcon, Pencil1Icon, ReaderIcon, SewingPinIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior, revealAndFocus } from "./mobile/scroll";
import { mealApi } from "./mealApi";
import type { ApiStorageLocation } from "./mealApi";
import type { DateConfirmationKind } from "./DateAssertionEditor";
import type { FoodItem, StorageType } from "./Prototype";

const FoodHistory = lazy(() => import("./FoodHistory"));
const ProductProvenanceHistory = lazy(() => import("./ProductProvenanceHistory"));
const ProductInfoHistory = lazy(() => import("./ProductInfoHistory"));
const DateAssertionEditor = lazy(() => import("./DateAssertionEditor"));
const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];

function getStorageClass(storage: StorageType) {
  return storage === "냉동" ? "storage-freezer" : storage === "실온" ? "storage-room" : "storage-fridge";
}

function getDateBadge(food: FoodItem) {
  if (food.dateKind === "actual_printed") {
    if (food.dateAssertionKind === "production_date") return "표시 제조일";
    if (food.dateAssertionKind === "packaging_date") return "표시 포장일";
    if (food.dateAssertionKind === "sell_by") return "표시 유통기한";
    if (food.dateAssertionKind === "best_before") return "표시 품질유지기한";
    return "표시 소비기한";
  }
  if (food.dateKind === "user_confirmed") return "사용자 확인";
  if (food.dateKind === "unknown") return "확인 필요";
  return "먼저 사용 권장";
}

function dateSourceLabel(source: string) {
  const normalized = source.trim();
  if (!normalized || /fixture|revision|parser|metadata|endpoint|debug/i.test(normalized)) return "출처 확인 필요";
  if (normalized === "gs1" || normalized.startsWith("gs1:") || /^GS1(?:\s|$)/i.test(normalized)) return "바코드 날짜 후보";
  if (normalized === "label_ocr" || normalized === "printed_date" || normalized === "label") return "포장지 표시";
  if (normalized === "user_input") return "사용자 입력";
  if (normalized === "user_confirmed") return "사용자 확인";
  if (normalized === "estimated_use_first") return "먼저 사용 권장";
  if (normalized === "storage_condition") return "보관 조건";
  return normalized === "unknown" ? "출처 확인 필요" : normalized;
}

function productSourceLabel(source: string) {
  if (source === "open_food_facts") return "공개 상품 DB";
  if (source === "mfds_c005" || source === "mfds_i1250") return "식품안전나라 상품 기준";
  if (source === "user_confirmed_alias") return "사용자 확인 영수증 별칭";
  if (source === "local_rule") return "검토된 영수증 상품명 규칙";
  if (source === "parser") return "영수증 분석 후보";
  return "서비스 상품 기준";
}

function productProvenanceNote(note: string) {
  return note
    .replaceAll("식품안전나라 C005 제품 기준 후보", "식품안전나라 상품 기준 후보")
    .replaceAll("식품안전나라 C005 상품 후보", "식품안전나라 상품 기준 후보")
    .replaceAll("식품안전나라 I1250 제품 기준 후보", "식품안전나라 제품 기준 후보")
    .replaceAll("식품안전나라 I1250", "식품안전나라 제품 기준")
    .replaceAll("Open Food Facts 검색 후보", "공개 상품 DB 후보")
    .replaceAll("Open Food Facts", "공개 상품 DB");
}

function productFreshnessLabel(freshness: "current" | "legacy" | "unknown") {
  if (freshness === "current") return "현재 확인 가능한 상품 기준";
  if (freshness === "legacy") return "과거 기준 데이터 후보";
  return "최신성 확인 필요";
}

function dateEditorValue(food: FoodItem) {
  const match = food.dateDetail.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function dateEditorKind(food: FoodItem): DateConfirmationKind {
  if (food.dateAssertionKind === "sell_by" || food.dateAssertionKind === "use_by" || food.dateAssertionKind === "best_before" || food.dateAssertionKind === "user_reminder") return food.dateAssertionKind;
  return food.dateKind === "user_confirmed" ? "user_reminder" : "use_by";
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

function quantityParts(quantity: string) {
  const match = quantity.trim().match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);
  return { amount: match ? Number(match[1]) : 1, unit: match?.[2] || "개" };
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
  const consumeConfirmRef = useRef<HTMLDivElement | null>(null);
  const detailActionsAnchorRef = useRef<HTMLDivElement | null>(null);
  const detailActionPrimaryRef = useRef<HTMLButtonElement | null>(null);
  const dateConfirmationActionRef = useRef<HTMLButtonElement | null>(null);
  const dateReviewActionRef = useRef<HTMLButtonElement | null>(null);
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
  const selectedStorageCode = storageCode(storage);
  const selectedStorageLocationName = storageLocationId
    ? storageLocations?.find((location) => location.id === storageLocationId)?.name
    : undefined;
  const selectedStorageLabel = selectedStorageLocationName ?? storageHintLabel(selectedStorageCode);
  const storageSelectionChanged = storage !== food.storage || storageLocationId !== (food.storageLocationId ?? null);
  const openedSelectionChanged = opened !== food.opened;
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
  const showDetailNote = Boolean(food.note.trim()) && !(dateReviewReason && isPrintedDateEvidenceNote(food.note));
  const hasReferenceSources = Boolean(hasReceiptProvenance || purchasedAtLabel || food.barcode || food.productProvenance);
  const inferenceReasons = food.dateKind === "estimated_use_first"
    ? [`${dateSourceLabel(food.dateSource)} 기준으로 계산했어요.`, `${food.storage} 보관 · ${food.opened ? "개봉" : "미개봉"} 상태를 반영했어요.`]
    : [];
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
      ? <div className="detail-read-only-inline-note" role="note"><CalendarIcon width={15} height={15} /><span><strong>날짜 수정은 연결 후 가능해요</strong><small>포장지 날짜는 확인할 수 있지만, 저장은 서버에 다시 연결한 뒤 할 수 있어요.</small></span></div>
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
        ? dateConfirmationActionRef.current ?? dateReviewActionRef.current ?? storageReviewTarget
        : autoFocusProvenanceReview
          ? productProvenanceReviewActionRef.current
          : detailActionPrimaryRef.current;
      revealAndFocus(target, { block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusDateReview, autoFocusPrimaryAction, autoFocusProvenanceReview, canConfirmDate, dateEditorOpen, dateStorageMismatch, readOnly]);

  const requestConsume = () => {
    if (needsSafetyReviewBeforeConsume) {
      setConsumeConfirm(true);
      return;
    }
    onConsume(food.id, eventQuantity);
  };

  useEffect(() => {
    if (productProvenanceError) setRemoveProductProvenanceConfirm(false);
  }, [productProvenanceError]);

  useEffect(() => {
    if (!consumeConfirm) return;
    const frame = window.requestAnimationFrame(() => {
      consumeConfirmRef.current?.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
      consumeConfirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [consumeConfirm]);

  useEffect(() => {
    if (!readOnly) return;
    setDiscardConfirm(false);
    setDateEditorOpen(false);
    setRemoveProductProvenanceConfirm(false);
    setEditProductInfoOpen(false);
    keyboard.hide();
  }, [keyboard, readOnly]);

  const detailSaveHint = availableQuantity.amount > 1
    ? "보관 위치·개봉 상태를 바꾸면 저장할 수 있어요. 수량만 바꿨다면 먹었어요·폐기 기록에 적용돼요."
    : "보관 위치나 개봉 상태를 바꾸면 저장할 수 있어요.";
  const detailActionReviewCopy = "이미 먹은 경우에만 기록해 주세요. Rescue Meal은 안전 여부를 판정하지 않아요.";
  const detailActionsSection = (
    <div className="detail-actions-anchor" ref={detailActionsAnchorRef}>
      <span className="detail-actions-sentinel" aria-hidden="true" />
      {readOnly ? <div className="detail-actions detail-actions-read-only" role="note"><InfoCircledIcon width={16} height={16} /><span><strong>기록 기능은 잠시 쉬고 있어요</strong><small>다시 연결하면 보관 상태 저장과 소비 기록을 이어갈 수 있어요.</small></span></div> : consumeConfirm ? <div ref={consumeConfirmRef} className="discard-confirm consume-confirm" role="alert"><div><strong>먹은 기록을 남기기 전에 확인해 주세요</strong><small>포장지와 보관 상태를 확인한 뒤 먹은 기록을 남겨 주세요. Rescue Meal은 안전 여부를 판정하지 않아요.</small></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setConsumeConfirm(false)}>돌아가기</button><button className="primary-sheet-button" type="button" onClick={() => onConsume(food.id, eventQuantity)}>확인했어요 · 먹었어요 기록</button></div></div> : (
        <>
          {needsSafetyReviewBeforeConsume ? <div id="consume-safety-hint" className="detail-actions-review-copy" role="note"><strong>먹은 기록 안내</strong><small>{detailActionReviewCopy}</small></div> : null}
          <div className={`detail-actions${needsSafetyReviewBeforeConsume ? " detail-actions-review" : ""}`} role="group" aria-label="식품 기록 행동"><button ref={detailActionPrimaryRef} className={`secondary-sheet-button detail-consume-action${needsSafetyReviewBeforeConsume ? " detail-consume-action-review" : ""}`} type="button" aria-label={needsSafetyReviewBeforeConsume ? "날짜와 보관 상태를 확인한 뒤 먹었어요 기록" : undefined} aria-describedby={needsSafetyReviewBeforeConsume ? "consume-safety-hint" : undefined} onClick={requestConsume}><CheckCircledIcon width={17} height={17} /> {needsSafetyReviewBeforeConsume ? "확인 후 먹었어요" : eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit} 먹었어요` : "먹었어요"}</button><button className={`primary-sheet-button detail-save-action${hasPendingSaveChanges ? " detail-save-pending" : ""}`} style={!hasPendingSaveChanges ? { borderColor: "var(--atelier-border-strong)", background: "color-mix(in srgb, var(--atelier-surface-raised) 82%, transparent)", color: "var(--atelier-muted)", boxShadow: "none", opacity: 0.78 } : undefined} type="button" disabled={!hasPendingSaveChanges} aria-label={hasPendingSaveChanges ? `${pendingDetailChangeSummary} 저장` : "변경 없음"} title={!hasPendingSaveChanges ? detailSaveHint : undefined} onClick={() => onSave(food.id, storage, opened, eventQuantity, storageLocationId)}>{hasPendingSaveChanges ? <>변경 저장 <ArrowRightIcon width={17} height={17} /></> : "변경 없음"}</button></div>
          <p className="detail-save-hint" role="note" style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "6px 2px 0", padding: 0, border: 0, background: "transparent", color: hasPendingSaveChanges ? "var(--atelier-amber)" : "var(--atelier-muted)", fontSize: 9, lineHeight: 1.45 }}><InfoCircledIcon width={14} height={14} />{hasPendingSaveChanges ? "저장하지 않고 닫으면 변경한 보관 상태는 반영되지 않아요." : detailSaveHint}</p>
        </>
      )}
    </div>
  );
  const discardSection = discardConfirm && !readOnly ? <div className="discard-confirm" role="alert"><div><strong>{eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit}` : "이 식품"}을 폐기할까요?</strong><small>폐기 후 목록에서 사라지고 기록으로 남아요.</small></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setDiscardConfirm(false)}>취소</button><button className="danger-sheet-button" type="button" onClick={() => onDiscard(food.id, eventQuantity)}>폐기 기록</button></div></div> : readOnly ? <div className="detail-read-only-inline-note detail-read-only-danger" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>폐기 기록은 연결 후 가능해요</strong><small>현재 화면은 마지막으로 확인한 재고를 보여주고 있어요.</small></span></div> : <button className="danger-text-button" type="button" onClick={() => setDiscardConfirm(true)}><InfoCircledIcon width={14} height={14} /> 상태가 이상해 폐기하기</button>;
  const productInfoSection = editProductInfoOpen ? (
    <div className="product-info-editor" role="group" aria-label="상품 정보 수정" aria-busy={productInfoSaving}>
      <div className="product-info-editor-heading">
        <span><Pencil1Icon width={16} height={16} /><strong>상품 정보 수정</strong></span>
        <small>{productInfoSaving ? "서버에 저장 중이에요. 입력값은 유지돼요." : "상품명·브랜드·분류를 확인해요."}</small>
      </div>
      <label className="product-info-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={productNameDraft} autoComplete="off" spellCheck={false} aria-label="상품명 수정" disabled={productInfoSaving} onChange={(event) => setProductNameDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>브랜드</span><KeyboardInput className="app-input" value={productBrandDraft} autoComplete="off" spellCheck={false} aria-label="브랜드 수정" disabled={productInfoSaving} onChange={(event) => setProductBrandDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <label className="product-info-editor-field"><span>분류</span><KeyboardInput className="app-input" value={productCategoryDraft} autoComplete="off" spellCheck={false} aria-label="분류 수정" disabled={productInfoSaving} onChange={(event) => setProductCategoryDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label>
      <p className="product-info-editor-note"><InfoCircledIcon width={14} height={14} />상품명을 바꾸면 기존 상품 출처는 제거되고 변경 이력으로 남아요. 날짜·수량·보관 위치는 유지됩니다.</p>
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
      <div className="detail-hero"><div className="detail-image-wrap"><img src={food.image} alt="" className="detail-image" draggable={false} /></div><div className="detail-hero-copy"><span className={`storage-pill ${getStorageClass(storage)}`}>{selectedStorageLabel} 보관 중</span><h3>{food.name}</h3><p>{food.brand} · 남은 {food.quantity}</p></div></div>
      {readOnly ? <div className="detail-read-only-callout" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>최근 확인한 화면이에요</strong><small>오프라인 상태라 변경할 수 없어요. 다시 연결하면 저장·소비·폐기를 기록할 수 있어요.</small></span></div> : null}
      {remoteRefreshRequired ? <div className="detail-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 이 식품이나 재고가 변경됐어요</strong><small>현재 입력은 유지하고 있어요. 최신 상태를 확인하면 저장하지 않은 상세 입력은 최신 값으로 바뀔 수 있어요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={async () => { await onRefreshRemote?.(); window.requestAnimationFrame(() => detailActionPrimaryRef.current?.focus({ preventScroll: true })); }}>최신 상태 확인</button></div> : null}
      {productInfoError ? <div className="account-error product-info-save-error" role="alert" aria-busy={productInfoSaving}><InfoCircledIcon width={15} height={15} /><span>{productInfoSaving ? "상품 정보를 다시 저장하는 중이에요." : productInfoError}</span>{onRetryProductInfo ? <button className="account-error-action" type="button" disabled={productInfoSaving} aria-busy={productInfoSaving} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductInfo}>{productInfoSaving ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
      {productInfoNotice ? <div className="product-info-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productInfoNotice}</span>{onRefreshProductInfo ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductInfo()}>최신 목록 확인</button> : null}</div> : null}
      {productProvenanceNotice ? <div className="product-provenance-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productProvenanceNotice}</span>{onRefreshProductProvenance ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void onRefreshProductProvenance()}>최신 목록 확인</button> : null}</div> : null}
      {productProvenanceError ? <div className="account-error product-provenance-save-error" role="alert" aria-busy={productProvenanceMutating}><InfoCircledIcon width={15} height={15} /><span>{productProvenanceMutating ? "상품 출처를 다시 지우는 중이에요." : productProvenanceError}</span>{onRetryProductProvenance ? <button className="account-error-action" type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductProvenance}>{productProvenanceMutating ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
      <div className={`date-proof-card date-proof-${food.dateKind === "user_confirmed" ? "user-confirmed" : food.dateKind === "unknown" ? "unknown" : food.dateKind === "estimated_use_first" ? "estimated" : "printed"}`} data-date-state={food.dateKind} role="group" aria-label={`날짜 근거: ${getDateBadge(food)}`}><div className="proof-icon"><CalendarIcon width={18} height={18} /></div><div><span>{getDateBadge(food)}</span><strong>{food.dateKind === "estimated_use_first" ? food.dateLabel + "까지 먼저 먹기" : food.dateKind === "unknown" ? "날짜 확인 필요" : dateProofDetail}</strong><small>{dateSourceLabel(food.dateSource)}</small></div><button type="button" onClick={onShowGuidance} aria-label="날짜 기준 자세히 보기"><InfoCircledIcon width={16} height={16} /></button></div>
      {dateReviewReason ? (
        <div className={`date-review-callout${compactPrintedDateRecheck ? " date-review-callout-compact" : ""}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="date-review-icon"><InfoCircledIcon width={16} height={16} /></span>
          <span>
            <strong>{dateReviewReason === "날짜 의미 확인" ? "포장지 날짜의 종류를 확인해 주세요" : "조리 전 날짜 확인이 필요해요"}</strong>
            <small>{dateReviewReason === "날짜 의미 확인" ? "포장일·제조일은 소비기한이 아니에요. 이 날짜를 소비기한으로 덮어쓰지 않고, 소비기한이 보이는 면과 보관 상태를 따로 확인해 주세요." : dateReviewReason === "날짜 확인 필요" ? "표시 날짜를 확인하지 못했어요. 포장지와 보관 상태를 확인한 뒤 조리해 주세요." : "표시 날짜가 오늘이거나 지났어요. 포장지·보관 상태·개봉 여부를 다시 확인해 주세요."}</small>
            {canRecheckPrintedLabel && dateReviewReason === "날짜 의미 확인" ? <button ref={dateReviewActionRef} className="date-edit-button" type="button" onClick={onOpenLabelReview}><CalendarIcon width={15} height={15} /><span><strong>포장지에서 소비기한 다시 확인</strong><small>라벨을 읽고 새 lot 또는 기존 lot 반영 여부를 선택해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : null}
          </span>
          {compactPrintedDateRecheck ? <button ref={dateReviewActionRef} className="date-edit-button date-edit-button-compact" type="button" aria-label="포장지에서 날짜 다시 확인" title="포장지에서 날짜 다시 확인" onClick={() => onOpenLabelReview?.()}><CalendarIcon width={17} height={17} /><span>날짜 다시 확인</span></button> : null}
        </div>
      ) : null}
      {dateConfirmationAction}
      {productInfoSection}
      {detailActionsSection}
      <div className="detail-danger-zone" role="group" aria-label="예외 처리">{discardSection}</div>
      {hasReferenceSources ? <section className="detail-source-group" aria-label="참고 출처" style={{ display: "grid", gap: 8 }}><div className="detail-source-group-heading" style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between", padding: "1px 2px 0" }}><span style={{ color: "var(--atelier-muted)", fontSize: 9, fontWeight: 800 }}>참고 출처</span><small style={{ color: "var(--atelier-dim)", fontSize: 9 }}>날짜·안전 판정을 대신하지 않는 기록</small></div>
      {hasReceiptProvenance || purchasedAtLabel || food.barcode ? <div className="food-provenance-card" role="group" aria-label="구매 출처"><span className="food-provenance-icon"><FileTextIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>구매 출처 <em className="provenance-role-label">확인된 기록</em></span><strong>{hasReceiptProvenance ? "영수증에서 추가" : "구매 기록"}</strong><small>{purchasedAtLabel ? `${purchasedAtLabel} 구매` : "구매일 확인 필요"} · {hasReceiptProvenance ? "영수증 상품 항목 연결됨" : "직접 입력 기록"}</small>{food.barcode ? <small>상품 바코드 · {food.barcode}</small> : null}<small>구매 기록은 소비기한을 확정하지 않아요.</small></span></div> : null}
      {food.productProvenance ? <div className="food-provenance-card product-provenance-card" role="group" aria-label="상품 정보 출처"><span className="food-provenance-icon"><ReaderIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>상품 정보 출처 <em className="provenance-role-label">참고 후보</em></span><strong>{productSourceLabel(food.productProvenance.source)} · 신뢰도 {Math.round(food.productProvenance.confidence * 100)}%</strong><small>{productFreshnessLabel(food.productProvenance.sourceFreshness)}{storageHintLabel(food.productProvenance.storageHint) ? ` · 상품 기준 보관 정보 ${storageHintLabel(food.productProvenance.storageHint)}` : ""}</small><small>{productProvenanceNote(food.productProvenance.note)}</small>{productStorageMismatch ? <small className="storage-hint-mismatch-note">상품 후보는 {storageHintLabel(food.productProvenance.storageHint)} 기준이에요. 현재 {storageHintLabel(selectedStorageCode)} 보관과 달라 확인이 필요해요.</small> : null}{food.productProvenance.sourceUrl && /^https?:\/\//.test(food.productProvenance.sourceUrl) ? <a href={food.productProvenance.sourceUrl} target="_blank" rel="noreferrer">원본 상품 정보 보기</a> : null}<small>상품 후보 정보는 개별 포장의 소비기한을 확정하지 않아요.</small></span></div> : null}
      {food.productProvenance ? readOnly ? <p className="detail-read-only-inline-note" role="note"><ReaderIcon width={15} height={15} /><span><strong>상품 출처 변경은 연결 후 가능해요</strong><small>현재 상품 정보는 마지막으로 확인한 출처를 보여주고 있어요.</small></span></p> : removeProductProvenanceConfirm ? <div className="product-provenance-remove-confirm" role="alert" aria-busy={productProvenanceMutating}><small>{productProvenanceMutating ? "상품 출처를 지우는 중이에요. 입력을 잠시만 기다려 주세요." : "상품명은 남고 출처 기록만 지워져요. 이전 이력은 보존됩니다."}</small><span><button type="button" disabled={productProvenanceMutating} onClick={closeProductProvenanceConfirm}>취소</button><button type="button" disabled={productProvenanceMutating} aria-busy={productProvenanceMutating} onClick={() => onRemoveProductProvenance(food.id)}>{productProvenanceMutating ? "지우는 중" : "출처 지우기"}</button></span></div> : <button ref={productProvenanceReviewActionRef} type="button" className="product-provenance-remove-button" onClick={() => setRemoveProductProvenanceConfirm(true)}>상품 출처 다시 확인</button> : null}
      </section> : null}
      {food.dateKind === "estimated_use_first" ? <div className="inference-trace-card" role="group" aria-label="AI 소비 우선순위 근거"><div className="inference-trace-heading"><span className="inference-trace-icon"><LightningBoltIcon width={16} height={16} /></span><span><strong>AI 소비 우선순위 근거</strong><small>상품 유형·보관 위치·개봉 상태를 함께 계산했어요</small></span></div><ul className="inference-trace-list">{inferenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div className="inference-trace-footnote"><InfoCircledIcon width={14} height={14} /><span>소비기한이나 안전 판정이 아니라, 먼저 확인할 순서예요.</span></div></div> : null}
      {showDetailNote ? <p className="detail-note"><InfoCircledIcon width={15} height={15} /> {food.note}</p> : null}
      <div className={`detail-section${hasPendingSaveChanges && !readOnly ? " detail-section-pending" : ""}`}><div className="detail-section-heading"><span><SewingPinIcon width={16} height={16} /> 보관 위치</span><small className={hasPendingSaveChanges && !readOnly ? "detail-section-status-pending" : ""} aria-live={hasPendingSaveChanges && !readOnly ? "polite" : undefined}>{readOnly ? "연결 후 변경할 수 있어요" : hasPendingSaveChanges ? pendingDetailChangeSummary : `${selectedStorageLabel}에 보관 중`}</small></div><StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} readOnly={readOnly} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); }} />{dateStorageMismatch ? <div className="storage-mismatch-callout" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>포장지 보관조건과 현재 위치가 달라요</strong><small>{food.dateStorageConditionText ?? `${storageHintLabel(food.dateStorageHint)} 보관 기준으로 표시된 날짜예요.`} 현재는 {selectedStorageLabel}에 보관 중이라 포장지와 실제 보관 상태를 다시 확인해 주세요. 날짜 자체는 자동으로 바꾸지 않아요.</small></span></div> : null}</div>
      {availableQuantity.amount > 1 ? <div className="quantity-row"><span><strong>변경할 수량</strong><small>일부만 옮기거나 먹을 수 있어요.</small></span><span className="quantity-stepper"><button type="button" aria-label="수량 줄이기" disabled={readOnly || eventQuantity <= 1} onClick={() => setEventQuantity((current) => Math.max(1, current - 1))}>−</button><strong>{eventQuantity}{availableQuantity.unit}</strong><button type="button" aria-label="수량 늘리기" disabled={readOnly || eventQuantity >= availableQuantity.amount} onClick={() => setEventQuantity((current) => Math.min(availableQuantity.amount, current + 1))}>+</button></span></div> : null}
      <div className="opened-row"><span><ArchiveIcon width={17} height={17} /><span><strong>개봉했어요</strong><small>{opened ? (openedAtLabel ? `${openedAtLabel}에 개봉 기록했어요.` : "개봉 기록은 되돌릴 수 없어요.") : readOnly ? "연결 후 개봉 상태를 기록할 수 있어요." : "개봉 후 소비 우선순위를 높여요."}</small></span></span><button className={`toggle ${opened ? "toggle-on" : ""}`} type="button" role="switch" aria-label={`${food.name} 개봉 상태`} aria-checked={opened} disabled={readOnly || opened} onClick={() => setOpened(true)}><span /></button></div>
      {mealApi.isConfigured ? <details className="detail-history-disclosure" open={historyDisclosureOpen} onToggle={(event) => { const open = event.currentTarget.open; setHistoryDisclosureOpen(open); onHistoryDisclosureChange?.(open); }} style={{ marginTop: 4, border: "1px solid var(--sheet-border)", borderRadius: 14, background: "color-mix(in srgb, var(--atelier-surface) 78%, transparent)" }}><summary style={{ display: "flex", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 12px", color: "var(--atelier-ink)", cursor: "pointer", listStyle: "none" }}><span style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 11, fontWeight: 760 }}><ReaderIcon width={16} height={16} style={{ color: "var(--atelier-pistachio)" }} />기록·출처 이력</span><span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--atelier-muted)", fontSize: 9 }}>{historyDisclosureOpen ? "접기" : "필요할 때 보기"} <ArrowRightIcon width={14} height={14} /></span></summary>{historyDisclosureOpen ? <div style={{ display: "grid", gap: 8, padding: "0 12px 12px" }}><Suspense fallback={null}><FoodHistory foodId={food.id} unit={availableQuantity.unit} storageLocations={storageLocations} historyRefreshKey={historyRefreshKey} highlightSyncOutboxId={focusSyncOutboxId} onOpenSyncRecord={onOpenSyncRecord} onOpenSyncNotification={onOpenSyncNotification} /><ProductProvenanceHistory foodId={food.id} refreshKey={food.productProvenance ? `${food.productProvenance.source}:${food.productProvenance.confidence}:${food.productProvenance.note}` : "none"} /><ProductInfoHistory foodId={food.id} refreshKey={`${food.name}:${food.brand}:${food.category}`} /></Suspense></div> : null}</details> : null}
    </div>
  );
}
