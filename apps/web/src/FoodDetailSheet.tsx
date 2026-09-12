import { lazy, Suspense, useEffect, useState } from "react";
import { ArchiveIcon, ArrowRightIcon, CalendarIcon, CheckCircledIcon, CheckIcon, FileTextIcon, InfoCircledIcon, LightningBoltIcon, Pencil1Icon, ReaderIcon, SewingPinIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { mealApi } from "./mealApi";
import type { ApiStorageLocation } from "./mealApi";
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
  return "AI 소비 우선순위";
}

function dateSourceLabel(source: string) {
  if (source === "gs1") return "GS1 바코드";
  if (source.startsWith("gs1:")) return `GS1 바코드${source.slice(4) ? ` · ${source.slice(4)}` : ""}`;
  if (source === "label_ocr") return "포장지 표시";
  if (source === "user_input") return "사용자 입력";
  return source;
}

function productSourceLabel(source: string) {
  if (source === "open_food_facts") return "Open Food Facts 공개 상품 DB";
  if (source === "mfds_c005") return "식품안전나라 C005";
  if (source === "mfds_i1250") return "식품안전나라 I1250";
  if (source === "user_confirmed_alias") return "사용자 확인 영수증 별칭";
  if (source === "local_rule") return "검토된 영수증 상품명 규칙";
  if (source === "parser") return "영수증 parser 후보";
  return "프로젝트 검증 상품 fixture";
}

function productFreshnessLabel(freshness: "current" | "legacy" | "unknown") {
  if (freshness === "current") return "현재 제공되는 source 후보";
  if (freshness === "legacy") return "과거 기준 데이터 후보";
  return "최신성 확인 필요";
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
}: {
  value: StorageType;
  locationId: string | null;
  locations?: ApiStorageLocation[];
  onChange: (value: StorageType, locationId: string | null) => void;
  label?: string;
}) {
  const keyboard = useKeyboard();
  const customLocations = locations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  return (
    <div className="storage-picker" role="group" aria-label={label}>
      {STORAGE_OPTIONS.map((option) => <button key={option} className={`storage-option ${!locationId && value === option ? "storage-option-active" : ""}`} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(option, null); }}><span className={`storage-dot ${getStorageClass(option)}`} />{option}{!locationId && value === option ? <CheckIcon width={14} height={14} /> : null}</button>)}
      {customLocations.length ? <div className="storage-custom-options" role="group" aria-label="사용자 정의 보관 위치"><span className="storage-custom-heading">내 보관 위치</span>{customLocations.map((location) => <button key={location.id} className={`storage-option storage-custom-option ${locationId === location.id ? "storage-option-active" : ""}`} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(storageFromApi(location.storage_type), location.id); }}><span className={`storage-dot ${getStorageClass(storageFromApi(location.storage_type))}`} />{location.name}{locationId === location.id ? <CheckIcon width={14} height={14} /> : null}</button>)}</div> : null}
    </div>
  );
}

export default function FoodDetailSheet({
  food,
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
  productProvenanceError,
  onRetryProductProvenance,
  productProvenanceNotice,
  onShowGuidance,
}: {
  food: FoodItem;
  dateReviewReason?: string | null;
  storageLocations?: ApiStorageLocation[];
  remoteRefreshRequired?: boolean;
  onRefreshRemote?: () => void;
  onSave: (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number, storageLocationId: string | null) => void;
  onConsume: (foodId: string, eventQuantity?: number) => void;
  onDiscard: (foodId: string, eventQuantity?: number) => void;
  onConfirmDate: (foodId: string, dateValue: string, kind: "sell_by" | "use_by" | "best_before" | "user_reminder") => void;
  onRemoveProductProvenance: (foodId: string) => void;
  onUpdateProductInfo: (foodId: string, input: { name: string; brand: string; category: string }) => void;
  productInfoError?: string;
  onRetryProductInfo?: () => void;
  productProvenanceError?: string;
  onRetryProductProvenance?: () => void;
  productProvenanceNotice?: string;
  onShowGuidance: () => void;
}) {
  const keyboard = useKeyboard();
  const [storage, setStorage] = useState<StorageType>(food.storage);
  const [storageLocationId, setStorageLocationId] = useState<string | null>(food.storageLocationId ?? null);
  const [opened, setOpened] = useState(food.opened);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [removeProductProvenanceConfirm, setRemoveProductProvenanceConfirm] = useState(false);
  const [editProductInfoOpen, setEditProductInfoOpen] = useState(false);
  const [productNameDraft, setProductNameDraft] = useState(food.name);
  const [productBrandDraft, setProductBrandDraft] = useState(food.brand);
  const [productCategoryDraft, setProductCategoryDraft] = useState(food.category);
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
  const dateStorageMismatch = Boolean(food.dateStorageHint && food.dateStorageHint !== selectedStorageCode);
  const productStorageMismatch = Boolean(!dateStorageMismatch && food.productProvenance?.storageHint && food.productProvenance.storageHint !== selectedStorageCode);
  const canConfirmDate = food.dateKind === "estimated_use_first" || food.dateKind === "unknown";
  const inferenceReasons = food.dateKind === "estimated_use_first"
    ? [`${food.dateSource} 기준으로 계산했어요.`, `${food.storage} 보관 · ${food.opened ? "개봉" : "미개봉"} 상태를 반영했어요.`]
    : [];

  useEffect(() => {
    setStorage(food.storage);
    setStorageLocationId(food.storageLocationId ?? null);
    setOpened(food.opened);
    setDiscardConfirm(false);
    setDateEditorOpen(false);
    setRemoveProductProvenanceConfirm(false);
    setEditProductInfoOpen(false);
    setProductNameDraft(food.name);
    setProductBrandDraft(food.brand);
    setProductCategoryDraft(food.category);
    setEventQuantity(quantityParts(food.quantity).amount);
  }, [food.brand, food.category, food.id, food.name, food.opened, food.openedAt, food.quantity, food.storage, food.storageLocationId]);

  useEffect(() => {
    if (productProvenanceError) setRemoveProductProvenanceConfirm(false);
  }, [productProvenanceError]);

  return (
      <div className="detail-sheet-content">
      <div className="detail-hero"><div className="detail-image-wrap"><img src={food.image} alt="" className="detail-image" draggable={false} /></div><div className="detail-hero-copy"><span className={`storage-pill ${getStorageClass(food.storage)}`}>{food.storageLocationName ?? food.storage} 보관 중</span><h3>{food.name}</h3><p>{food.brand} · {food.quantity}</p></div></div>
      {remoteRefreshRequired ? <div className="detail-remote-refresh" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 이 식품이나 재고가 변경됐어요</strong><small>현재 입력은 유지하고 있어요. 최신 상태를 확인하면 저장하지 않은 상세 입력은 최신 값으로 바뀔 수 있어요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onRefreshRemote?.()}>최신 상태 확인</button></div> : null}
      {productInfoError ? <div className="account-error product-info-save-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{productInfoError}</span>{onRetryProductInfo ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductInfo}>다시 시도</button> : null}</div> : null}
      {productProvenanceNotice ? <div className="product-provenance-save-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{productProvenanceNotice}</span></div> : null}
      {productProvenanceError ? <div className="account-error product-provenance-save-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{productProvenanceError}</span>{onRetryProductProvenance ? <button className="account-error-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={onRetryProductProvenance}>다시 시도</button> : null}</div> : null}
      {editProductInfoOpen ? <div className="product-info-editor" role="group" aria-label="상품 정보 수정"><div className="product-info-editor-heading"><span><Pencil1Icon width={16} height={16} /><strong>상품 정보 수정</strong></span><small>상품명·브랜드·분류를 직접 확인해요.</small></div><label className="product-info-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={productNameDraft} autoComplete="off" spellCheck={false} aria-label="상품명 수정" onChange={(event) => setProductNameDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label><label className="product-info-editor-field"><span>브랜드</span><KeyboardInput className="app-input" value={productBrandDraft} autoComplete="off" spellCheck={false} aria-label="브랜드 수정" onChange={(event) => setProductBrandDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label><label className="product-info-editor-field"><span>분류</span><KeyboardInput className="app-input" value={productCategoryDraft} autoComplete="off" spellCheck={false} aria-label="분류 수정" onChange={(event) => setProductCategoryDraft(event.target.value)} onBlur={() => keyboard.hide()} /></label><p className="product-info-editor-note"><InfoCircledIcon width={14} height={14} />상품명을 바꾸면 기존 상품 출처는 제거되고 변경 이력으로 남아요. 날짜·수량·보관 위치는 유지됩니다.</p><div className="product-info-editor-actions"><button type="button" className="secondary-sheet-button" onClick={() => { keyboard.hide(); setEditProductInfoOpen(false); }}>취소</button><button type="button" className="primary-sheet-button" onPointerDown={(event) => event.preventDefault()} disabled={!productNameDraft.trim() || !productBrandDraft.trim() || !productCategoryDraft.trim()} onClick={() => { onUpdateProductInfo(food.id, { name: productNameDraft.trim(), brand: productBrandDraft.trim(), category: productCategoryDraft.trim() }); keyboard.hide(); setEditProductInfoOpen(false); }}>상품 정보 저장</button></div></div> : <button type="button" className="product-info-edit-button" onClick={() => setEditProductInfoOpen(true)}><Pencil1Icon width={15} height={15} /><span><strong>상품 정보 수정</strong><small>상품명이 다르면 직접 고칠 수 있어요.</small></span><ArrowRightIcon width={15} height={15} /></button>}
      <div className={`date-proof-card ${food.dateKind === "estimated_use_first" ? "date-proof-estimated" : ""}`}><div className="proof-icon"><CalendarIcon width={18} height={18} /></div><div><span>{getDateBadge(food)}</span><strong>{food.dateKind === "estimated_use_first" ? food.dateLabel + "까지 먼저 먹기" : food.dateKind === "unknown" ? "날짜 확인 필요" : food.dateDetail}</strong><small>{dateSourceLabel(food.dateSource)}</small></div><button type="button" onClick={onShowGuidance} aria-label="날짜 기준 자세히 보기"><InfoCircledIcon width={16} height={16} /></button></div>
      {dateReviewReason ? <div className="date-review-callout" role="note"><span className="date-review-icon"><InfoCircledIcon width={16} height={16} /></span><span><strong>조리 전 날짜 확인이 필요해요</strong><small>{dateReviewReason === "날짜 의미 확인" ? "포장일·제조일은 소비기한과 다를 수 있어요. 포장지의 소비기한과 보관 상태를 확인해 주세요." : dateReviewReason === "날짜 확인 필요" ? "표시 날짜를 확인하지 못했어요. 포장지와 보관 상태를 확인한 뒤 조리해 주세요." : "표시 날짜가 오늘이거나 지났어요. 포장지·보관 상태·개봉 여부를 다시 확인해 주세요."}</small></span></div> : null}
      {food.dateKind === "estimated_use_first" ? <div className="inference-trace-card" role="group" aria-label="AI 소비 우선순위 근거"><div className="inference-trace-heading"><span className="inference-trace-icon"><LightningBoltIcon width={16} height={16} /></span><span><strong>AI 소비 우선순위 근거</strong><small>상품 유형·보관 위치·개봉 상태를 함께 계산했어요</small></span></div><ul className="inference-trace-list">{inferenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div className="inference-trace-footnote"><InfoCircledIcon width={14} height={14} /><span>소비기한이나 안전 판정이 아니라, 먼저 확인할 순서예요.</span></div></div> : null}
      {hasReceiptProvenance || purchasedAtLabel || food.barcode ? <div className="food-provenance-card" role="group" aria-label="구매 출처"><span className="food-provenance-icon"><FileTextIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>구매 출처</span><strong>{hasReceiptProvenance ? "영수증에서 추가" : "구매 기록"}</strong><small>{purchasedAtLabel ? `${purchasedAtLabel} 구매` : "구매일 확인 필요"} · {hasReceiptProvenance ? "영수증 상품 항목 연결됨" : "직접 입력 기록"}</small>{food.barcode ? <small>상품 GTIN · {food.barcode}</small> : null}<small>구매 기록은 소비기한을 확정하지 않아요.</small></span></div> : null}
      {food.productProvenance ? <div className="food-provenance-card product-provenance-card" role="group" aria-label="상품 정보 출처"><span className="food-provenance-icon"><ReaderIcon width={17} height={17} /></span><span className="food-provenance-copy"><span>상품 정보 출처</span><strong>{productSourceLabel(food.productProvenance.source)} · 신뢰도 {Math.round(food.productProvenance.confidence * 100)}%</strong><small>{productFreshnessLabel(food.productProvenance.sourceFreshness)}{storageHintLabel(food.productProvenance.storageHint) ? ` · 후보 보관 힌트 ${storageHintLabel(food.productProvenance.storageHint)}` : ""}</small><small>{food.productProvenance.note}</small>{productStorageMismatch ? <small className="storage-hint-mismatch-note">상품 후보는 {storageHintLabel(food.productProvenance.storageHint)} 기준이에요. 현재 {storageHintLabel(selectedStorageCode)} 보관과 달라 확인이 필요해요.</small> : null}{food.productProvenance.sourceUrl && /^https?:\/\//.test(food.productProvenance.sourceUrl) ? <a href={food.productProvenance.sourceUrl} target="_blank" rel="noreferrer">원본 상품 정보 보기</a> : null}<small>상품 후보 정보는 개별 포장의 소비기한을 확정하지 않아요.</small></span></div> : null}
      {food.productProvenance ? (removeProductProvenanceConfirm ? <div className="product-provenance-remove-confirm" role="alert"><small>상품명은 남고 출처 기록만 지워져요. 이전 이력은 보존됩니다.</small><span><button type="button" onClick={() => setRemoveProductProvenanceConfirm(false)}>취소</button><button type="button" onClick={() => onRemoveProductProvenance(food.id)}>출처 지우기</button></span></div> : <button type="button" className="product-provenance-remove-button" onClick={() => setRemoveProductProvenanceConfirm(true)}>상품 출처 다시 확인</button>) : null}
      <p className="detail-note"><InfoCircledIcon width={15} height={15} /> {food.note}</p>
      {canConfirmDate ? (dateEditorOpen ? <Suspense fallback={<div className="date-editor-loading" role="status">날짜 입력 화면을 준비하고 있어요</div>}><DateAssertionEditor onCancel={() => setDateEditorOpen(false)} onConfirm={(dateValue, kind) => onConfirmDate(food.id, dateValue, kind)} /></Suspense> : <button className="date-edit-button" type="button" onClick={() => setDateEditorOpen(true)}><CalendarIcon width={15} height={15} /><span><strong>포장지에서 확인한 날짜 입력</strong><small>확인 후 소비기한·품질유지기한·알림일로 저장해요.</small></span><ArrowRightIcon width={15} height={15} /></button>) : null}
      <div className="detail-section"><div className="detail-section-heading"><span><SewingPinIcon width={16} height={16} /> 보관 위치</span><small>바꾼 뒤 저장하세요</small></div><StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); }} />{dateStorageMismatch ? <div className="storage-mismatch-callout" role="alert"><InfoCircledIcon width={16} height={16} /><span><strong>포장지 보관조건과 현재 위치가 달라요</strong><small>{food.dateStorageConditionText ?? `${storageHintLabel(food.dateStorageHint)} 보관 기준으로 표시된 날짜예요.`} 현재는 {selectedStorageLabel}에 보관 중이라 포장지와 실제 보관 상태를 다시 확인해 주세요. 날짜 자체는 자동으로 바꾸지 않아요.</small></span></div> : null}</div>
      {availableQuantity.amount > 1 ? <div className="quantity-row"><span><strong>변경할 수량</strong><small>일부만 옮기거나 먹을 수 있어요.</small></span><span className="quantity-stepper"><button type="button" aria-label="수량 줄이기" disabled={eventQuantity <= 1} onClick={() => setEventQuantity((current) => Math.max(1, current - 1))}>−</button><strong>{eventQuantity}{availableQuantity.unit}</strong><button type="button" aria-label="수량 늘리기" disabled={eventQuantity >= availableQuantity.amount} onClick={() => setEventQuantity((current) => Math.min(availableQuantity.amount, current + 1))}>+</button></span></div> : null}
      <div className="opened-row"><span><ArchiveIcon width={17} height={17} /><span><strong>개봉했어요</strong><small>{opened ? (openedAtLabel ? `${openedAtLabel}에 개봉 기록했어요.` : "개봉 기록은 되돌릴 수 없어요.") : "개봉 후 소비 우선순위를 높여요."}</small></span></span><button className={`toggle ${opened ? "toggle-on" : ""}`} type="button" role="switch" aria-label={`${food.name} 개봉 상태`} aria-checked={opened} disabled={opened} onClick={() => setOpened(true)}><span /></button></div>
      <div className="detail-actions"><button className="secondary-sheet-button" type="button" onClick={() => onConsume(food.id, eventQuantity)}><CheckCircledIcon width={17} height={17} /> {eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit} 먹었어요` : "먹었어요"}</button><button className="primary-sheet-button" type="button" onClick={() => onSave(food.id, storage, opened, eventQuantity, storageLocationId)}>보관 상태 저장 <ArrowRightIcon width={17} height={17} /></button></div>
      {discardConfirm ? <div className="discard-confirm" role="alert"><div><strong>{eventQuantity < availableQuantity.amount ? `${eventQuantity}${availableQuantity.unit}` : "이 식품"}을 폐기할까요?</strong><small>폐기 후 목록에서 사라지고 기록으로 남아요.</small></div><div className="discard-confirm-actions"><button className="secondary-sheet-button" type="button" onClick={() => setDiscardConfirm(false)}>취소</button><button className="danger-sheet-button" type="button" onClick={() => onDiscard(food.id, eventQuantity)}>폐기 기록</button></div></div> : <button className="danger-text-button" type="button" onClick={() => setDiscardConfirm(true)}><InfoCircledIcon width={14} height={14} /> 상태가 이상해 폐기하기</button>}
      {mealApi.isConfigured ? <Suspense fallback={null}><FoodHistory foodId={food.id} unit={availableQuantity.unit} storageLocations={storageLocations} /><ProductProvenanceHistory foodId={food.id} refreshKey={food.productProvenance ? `${food.productProvenance.source}:${food.productProvenance.confidence}:${food.productProvenance.note}` : "none"} /><ProductInfoHistory foodId={food.id} refreshKey={`${food.name}:${food.brand}:${food.category}`} /></Suspense> : null}
    </div>
  );
}
