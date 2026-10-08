import { MetadataText } from "./Metadata";
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type FocusEvent, type KeyboardEvent, type MouseEvent, type RefObject, type SetStateAction, type SyntheticEvent } from "react";
import { CalendarIcon, CameraIcon, CheckCircledIcon, CheckIcon, Cross2Icon, FileTextIcon, InfoCircledIcon, PlusIcon, ReaderIcon, UploadIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { scrollTargetWithinContainer, scrollTargetWithinNearestContainer } from "./appScroll";
import { isStaleLabelLotTarget } from "./labelLotSelection";
import CameraCapture, { type CaptureFileHandler } from "./CameraCapture";
import { isMealApiProductEnrichmentPersistenceError, isMealApiReceiptDraftPersistenceError, mealApi, type ApiBarcodeParse, type ApiDateKind, type ApiOcrReviewObservation, type ApiPriorityInference, type ApiProductEnrichmentJob, type ApiProductLookup, type ApiProductNameLookup, type ApiReceiptDraft, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import type { AddMode, FoodItem, ReceiptCommitPayload, ReceiptLine, StorageType } from "./Prototype";
import { changeManualQuantityUnit, getManualFoodNameSuggestions, MANUAL_QUANTITY_UNITS, parseManualQuantity } from "./manualEntryConvenience";
import "./manualEntryConvenience.css";

const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];
const DEMO_BARCODE = "8801114167523";
const DEMO_BARCODE_FOUND_MESSAGE = "상품 정보 1개를 찾았어요.";
const DEMO_BARCODE_UNAVAILABLE_MESSAGE = "이 데모에서는 예시 바코드만 조회할 수 있어요.";
type LabelDateKind = Exclude<ApiDateKind, "unknown" | "estimated_use_first" | "user_reminder">;
const LABEL_DATE_KINDS: LabelDateKind[] = ["production_date", "packaging_date", "sell_by", "use_by", "best_before"];
type SourcePreviewKind = "image" | "pdf";
type ReceiptTemplateId = "grocery-mart-v1" | "retail-beverage-v1" | "restaurant-card-v1" | "grocery-generic-v1" | "generic-v1";
type ReceiptReviewSessionState = {
  candidateAppliedLineId: string | null;
  candidateUserEditedLineId: string | null;
  editingIds: string[];
  userConfirmedLineIds: string[];
  activeSourceLineId: string | null;
};

function createReceiptReviewSessionState(lines: ReceiptLine[]): ReceiptReviewSessionState {
  const firstReviewLine = lines.find((line) => line.requiresReview);
  const firstSourceLine = lines.find((line) => line.requiresReview && line.sourceObservationIds?.length)
    ?? lines.find((line) => line.sourceObservationIds?.length);
  return {
    candidateAppliedLineId: null,
    candidateUserEditedLineId: null,
    editingIds: firstReviewLine ? [firstReviewLine.id] : [],
    userConfirmedLineIds: [],
    activeSourceLineId: firstSourceLine?.id ?? null,
  };
}

function applyStateAction<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
}

function sourcePreviewKind(file: File): SourcePreviewKind {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "image";
}

function receiptTemplateLabel(templateId: string) {
  if (templateId === "grocery-mart-v1") return "마트 영수증 형식";
  if (templateId === "retail-beverage-v1") return "음료·주류 영수증 형식";
  if (templateId === "restaurant-card-v1") return "식당 영수증 형식";
  if (templateId === "grocery-generic-v1") return "일반 식료품 영수증 형식";
  return "일반 영수증 형식";
}

function normalizeLabelDateKind(value: string): LabelDateKind | null {
  return LABEL_DATE_KINDS.includes(value as LabelDateKind) ? value as LabelDateKind : null;
}

function labelDateKindLabel(kind: LabelDateKind) {
  if (kind === "production_date") return "제조일";
  if (kind === "packaging_date") return "포장일";
  if (kind === "sell_by") return "유통기한";
  if (kind === "best_before") return "품질유지기한";
  return "유효년월일";
}

function labelDateKindChoiceLabel(kind: LabelDateKind) {
  return kind === "use_by" ? "소비기한" : labelDateKindLabel(kind);
}

function labelDateReviewGuidance(kind: LabelDateKind) {
  const correction = "숫자가 다르면 아래 날짜를 바꿔 주세요.";
  return kind === "production_date" || kind === "packaging_date"
    ? `${correction} 이 날짜는 소비기한이 아닐 수 있어요. 보관 방법도 살펴봐 주세요.`
    : correction;
}

function labelDateInputValue(value: string) {
  return value.replaceAll(".", "-");
}

function isCompleteLabelDate(value: string) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(value);
}

function normalizeFoodName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function revealFocusedInput(event: FocusEvent<HTMLInputElement>, block: ScrollLogicalPosition = "nearest") {
  const input = event.currentTarget;
  window.requestAnimationFrame(() => {
    if (!input.isConnected) return;
    scrollTargetWithinNearestContainer(input, block, getMobileScrollBehavior());
  });
}

function storageCodeFromUi(storage: StorageType): ApiStorageType {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

function barcodeDateKindLabel(kind: ApiBarcodeParse["date_assertions"][number]["kind"]) {
  return kind === "use_by" ? "소비기한" : labelDateKindLabel(kind);
}

function getBarcodeProviderNotice(lookup: ApiProductLookup | null) {
  if (!lookup) return null;
  const degradedProvider = Object.entries(lookup.provider_statuses).find(([, status]) => status === "rate_limited" || status === "unavailable");
  if (!degradedProvider) return null;
  const [provider, status] = degradedProvider;
  const providerLabel = provider === "open_food_facts" ? "공개 상품 정보" : provider === "mfds_c005" ? "식품안전나라" : "상품 정보 제공처";
  return status === "rate_limited"
    ? `${providerLabel} 요청이 잠시 많아요. 찾은 상품 정보만 확인하고 잠시 후 다시 시도해 주세요.`
    : `${providerLabel}를 확인하지 못했어요. 포장지 상품명과 날짜를 직접 확인해 주세요.`;
}

function productProvenanceFromCandidate(candidate: NonNullable<ApiProductLookup["candidates"]>[number]): NonNullable<FoodItem["productProvenance"]> {
  return {
    source: candidate.source,
    sourceUrl: candidate.source_url ?? undefined,
    confidence: candidate.confidence,
    note: candidate.provenance_note,
    storageHint: candidate.storage_hint ?? undefined,
    sourceFreshness: candidate.source_freshness,
  };
}

function productSourceLabel(source: string) {
  if (source === "open_food_facts") return "공개 상품 정보";
  if (source === "mfds_c005" || source === "mfds_i1250") return "식품안전나라 상품 정보";
  return "서비스 상품 정보";
}

function productProvenanceNote(note: string) {
  const normalized = note
    .replaceAll("프로젝트 local fixture", "서비스에서 제공하는 상품 정보")
    .replaceAll("이 workspace에서 사용자가 확인한 영수증 별칭", "이 기록에서 사용자가 확인한 상품명")
    .replaceAll("프로젝트에서 검토한 영수증 상품명 별칭 규칙", "확인된 영수증 상품명 정보")
    .replaceAll("영수증 parser가 만든 canonical 후보; 사용자 확인 필요", "영수증에서 읽은 상품명이에요. 내용을 확인해 주세요.")
    .replaceAll("Open Food Facts 사용자 기여 데이터 후보; 실제 라벨 확인 필요", "공개 상품 정보예요. 실제 상품명과 포장지 날짜를 확인해 주세요.")
    .replaceAll("Open Food Facts 검색 후보(사용자 기여 데이터); 실제 상품명·포장지 날짜 확인 필요", "공개 상품 정보예요. 실제 상품명과 포장지 날짜를 확인해 주세요.")
    .replaceAll("식품안전나라 C005 제품 기준 후보; 2018년 이후 최신화 중단 안내와 개별 라벨 확인 필요", "식품안전나라에서 제공한 상품 정보예요. 2018년 이후 갱신되지 않았을 수 있어요. 개별 포장지를 확인해 주세요.")
    .replaceAll("식품안전나라 I1250 제품·품목제조보고 후보; 개별 팩 라벨과 제조일 확인 필요", "식품안전나라 상품 정보예요. 개별 포장지와 제조일을 확인해 주세요.")
    .replaceAll("식품안전나라 C005 제품 기준 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 C005 상품 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 I1250 제품 기준 후보", "식품안전나라 상품 정보")
    .replaceAll("식품안전나라 I1250", "식품안전나라 상품 정보")
    .replaceAll("Open Food Facts 검색 후보", "공개 상품 정보")
    .replaceAll("Open Food Facts", "공개 상품 정보")
    .replaceAll("GS1 바코드 날짜 후보", "바코드 날짜 후보")
    .replaceAll("GS1 날짜 후보", "바코드 날짜 후보");
  return /\b(?:workspace|canonical|candidate|confidence|provider|fixture|parser|provenance|source|snapshot|gate|validation|evidence|review)\b/i.test(normalized)
    ? "참고 상품 정보예요. 실제 상품명과 포장지 날짜를 확인해 주세요."
    : normalized;
}

function productFreshnessLabel(freshness: "current" | "legacy" | "unknown") {
  if (freshness === "current") return "최근 정보";
  if (freshness === "legacy") return "오래된 정보";
  return "정보 날짜를 알 수 없어요";
}

function normalizeKnownInferenceText(text: string) {
  const trimmed = text.trim();
  if (trimmed === "개봉일과 개봉 상태를 반영했지만, 실제 라벨 날짜를 대신하지 않습니다.") return "개봉 여부를 고려했어요. 실제 포장지 날짜를 대신하지 않아요.";
  if (trimmed === "개봉 여부를 반영했지만, 실제 라벨 날짜를 대신하지 않습니다.") return "개봉 여부를 고려했어요. 실제 포장지 날짜를 대신하지 않아요.";
  if (trimmed === "개봉 전 상태로 계산했으며, 실제 라벨 날짜를 대신하지 않습니다.") return "개봉 전 상태를 고려했어요. 실제 포장지 날짜를 대신하지 않아요.";
  if (trimmed === "모델 confidence는 안전 확률이 아니며, 포장지 표시 날짜를 대신하지 않습니다.") return "이 정보는 먹어도 되는지를 알려주지 않아요. 포장지 날짜도 살펴봐 주세요.";
  if (trimmed === "추정값을 만들지 않고 review를 요청합니다.") return "정보가 부족해 먼저 살펴볼 날짜를 알려드릴 수 없어요.";
  if (trimmed === "안전 판정이나 소비기한 확정이 아닌, 먼저 확인할 순서입니다." || trimmed === "AI가 소비기한이나 안전 여부를 판정한 결과가 아닙니다. 먼저 확인할 순서만 제안합니다.") return "먼저 살펴볼 순서는 참고용이에요. 소비기한이나 먹어도 되는지를 뜻하지 않아요.";
  if (trimmed === "정보가 부족해 우선순위를 계산하지 않았습니다. 실제 표시 날짜와 상태를 확인하세요.") return "포장지 날짜나 보관 정보가 부족해 먼저 살펴볼 순서를 정하기 어려워요. 포장지 날짜와 식품 상태를 확인해 주세요.";
  const category = trimmed.match(/^상품명에서 (.+) 후보를 찾았습니다\.$/);
  if (category) return `${category[1]} 식품일 수 있어요.`;
  const localCategory = trimmed.match(/^로컬 모델이 (.+) 후보로 분류했습니다\.$/);
  if (localCategory) return `${localCategory[1]} 식품일 수 있어요.`;
  const range = trimmed.match(/^(개봉일|기준일) (\d{4}-\d{2}-\d{2})와 (.+) 보관 기준의 (\d+)일 우선순위 범위를 계산했습니다\.$/);
  if (range) return `${range[1]}과 ${range[3]} 보관 방법을 참고했어요. 소비기한은 포장지에서 살펴봐 주세요.`;
  const modelRange = trimmed.match(/^(사용자가 선택한|모델이 제안한) (냉장|냉동|실온) 보관과 기준일 (\d{4}-\d{2}-\d{2})의 (\d+)일 우선순위 범위입니다\.$/);
  if (modelRange) return `${modelRange[1]} ${modelRange[2]} 보관과 날짜를 참고했어요. 소비기한이나 먹어도 되는지를 뜻하지 않아요.`;
  return text;
}

function normalizeKnownProductWarning(text: string) {
  if (text === "Open Food Facts에서 상품을 찾지 못했습니다." || text === "Open Food Facts에서 등록된 상품 정보가 없습니다." || text === "Open Food Facts 상품명 필드가 비어 있습니다." || text === "Open Food Facts에서 일치하는 상품명 후보를 찾지 못했습니다.") return "공개 상품 정보에서 해당 상품을 찾지 못했어요. 포장지의 상품명을 확인해 주세요.";
  if (text === "Open Food Facts 조회를 완료하지 못했습니다." || text === "Open Food Facts 응답 형식을 확인하지 못했습니다.") return "공개 상품 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
  if (text === "상품명이 비어 있어 Open Food Facts 검색을 시작하지 않았습니다." || text === "상품명에 검색 가능한 문자가 없어 Open Food Facts 검색을 시작하지 않았습니다.") return "상품명을 입력한 뒤 다시 확인해 주세요.";
  if (text === "식품안전나라 C005 상품명 필드가 비어 있습니다." || text === "식품안전나라 I1250 응답에 상품명이 없습니다.") return "식품안전나라에서 상품 정보를 찾지 못했어요. 포장지에서 확인해 주세요.";
  if (text === "식품안전나라 C005에서 해당 바코드 상품을 찾지 못했습니다." || text === "식품안전나라 I1250에서 상품명 후보를 찾지 못했습니다.") return "식품안전나라에서 해당 상품을 찾지 못했어요. 포장지에서 확인해 주세요.";
  if (/^PaddleOCR (?:initialization|warm-up) failed: [A-Za-z]+$/.test(text) || /^OCR failed: [A-Za-z]+$/.test(text)) return "사진을 읽지 못했어요. 잠시 후 다시 촬영해 주세요.";
  if (text === "OCR worker is at capacity; retry shortly") return "사진을 읽는 요청이 많아요. 잠시 후 다시 시도해 주세요.";
  if (text === "OCR result is empty") return "사진에서 읽을 내용을 찾지 못했어요. 더 선명하게 촬영해 주세요.";
  if (text === "OCR input dimensions exceed worker limit" || text === "OCR input could not be prepared" || text === "OCR model is not available; retry after the worker is ready.") return "사진을 읽지 못했어요. 다른 사진을 선택해 다시 시도해 주세요.";
  if (text === "PaddleOCR 런타임이 설치되지 않았습니다." || text === "OCR을 완료하지 못했습니다.") return "사진을 읽지 못했어요. 다시 촬영하거나 직접 입력해 주세요.";
  if (/^(open_food_facts|mfds_c005|mfds_i1250) provider 호출 한도에 도달했습니다\./.test(text)) return "상품 정보 조회가 잠시 많아요. 잠시 후 다시 시도해 주세요.";
  if (/^(open_food_facts|mfds_c005|mfds_i1250) provider 조회를 완료하지 못했습니다\./.test(text)) return "상품 정보를 확인하지 못했어요. 포장지에서 다시 확인해 주세요.";
  if (/^식품안전나라 C005(?:가| )/.test(text) && /(호출 한도|일시적으로 응답|응답 시간이 초과|조회를 완료하지 못)/.test(text)
    || /^식품안전나라 I1250(?:이| )/.test(text) && /(호출 한도|일시적으로 응답|응답 시간이 초과|조회를 완료하지 못)/.test(text)) return "식품안전나라에서 상품 정보를 확인하지 못했어요. 포장지에서 상품 정보를 확인해 주세요.";
  if (/^Open Food Facts (?:가 일시적으로 응답하지 않습니다|응답 시간이 초과되었습니다|조회가 일시적으로 응답하지 않습니다|검색 응답 시간이 초과되었습니다|조회 한도에 도달했습니다|검색 한도에 도달했습니다)/.test(text)) return "공개 상품 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.";
  const normalized = text
    .replaceAll("Open Food Facts", "공개 상품 정보")
    .replaceAll("식품안전나라 C005 API key가 설정되지 않았습니다.", "식품안전나라 상품 정보를 확인할 수 없어요. 포장지에서 상품 정보를 확인해 주세요.")
    .replaceAll("식품안전나라 I1250 API key가 설정되지 않았습니다.", "식품안전나라 상품 정보를 확인할 수 없어요. 포장지에서 상품 정보를 확인해 주세요.")
    .replaceAll("provider adapter raised an unexpected error", "상품 정보 제공처에 연결하지 못했어요.")
    .replaceAll(" provider 호출 한도에 도달했습니다.", " 상품 정보 조회가 잠시 많아요.")
    .replaceAll(" provider 조회를 완료하지 못했습니다.", " 상품 정보를 확인하지 못했어요.")
    .replaceAll("C005", "")
    .replaceAll("I1250", "")
    .replaceAll("provider", "상품 정보 제공처")
    .replaceAll("상품명 후보", "상품명 정보")
    .replaceAll("상품 후보", "상품 정보");
  if (normalized === "GS1 element string에서 지원하지 않는 AI를 만났습니다.") return "바코드에서 읽을 수 없는 정보가 있어요. 포장지에서 상품 정보를 확인해 주세요.";
  if (/^GS1 AI \d+ 값의 길이가 부족합니다\.$/.test(text)) return "바코드 정보가 온전하지 않아요. 포장지에서 상품 정보를 확인해 주세요.";
  if (text === "GS1 Digital Link에서 상품 식별 field를 찾지 못했습니다.") return "바코드에서 상품 정보를 찾지 못했어요.";
  if (/^GS1 AI \d+ 날짜를 해석하지 못했습니다\.$/.test(text)) return "바코드 날짜를 읽지 못했어요. 포장지에서 날짜를 확인해 주세요.";
  if (text === "GS1 AI 01 값이 숫자가 아니어서 GTIN으로 확정하지 않습니다." || text === "GS1 AI 01 값의 길이가 14자리가 아니어서 review가 필요합니다.") return "바코드 형식을 확인할 수 없어요. 숫자를 확인하거나 상품 정보를 직접 입력해 주세요.";
  if (text === "GS1 상품 코드에서 날짜 AI를 찾지 못했습니다.") return "이 바코드에서 날짜 정보를 찾지 못했어요. 날짜는 포장지에서 확인해 주세요.";
  if (text === "날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다.") return "날짜는 읽었지만 어떤 날짜인지는 확인하지 못했어요. 포장지에서 날짜 종류를 확인해 주세요.";
  if (text === "소비기한·유통기한 숫자를 찾지 못했습니다. 다른 면이나 뚜껑을 촬영해 주세요.") return "날짜를 찾지 못했어요. 포장지의 다른 면이나 뚜껑을 촬영해 주세요.";
  const pdfPageFailure = text.match(/^(\d+)쪽 텍스트를 읽지 못했습니다: [A-Za-z]+$/);
  if (pdfPageFailure) return `PDF ${pdfPageFailure[1]}쪽을 읽지 못했어요. 파일을 확인한 뒤 다시 선택해 주세요.`;
  return normalized;
}

const BarcodeScanner = lazy(() => import("./BarcodeScanner"));

function storageClassFromType(storage: StorageType) {
  return storage === "냉동" ? "storage-freezer" : storage === "실온" ? "storage-room" : "storage-fridge";
}

function storageFromApiCode(storage: ApiStorageType): StorageType {
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

function StoragePicker({
  value,
  locationId,
  locations = [],
  onChange,
  label = "보관 위치 선택",
  descriptionId,
}: {
  value: StorageType | null;
  locationId?: string | null;
  locations?: ApiStorageLocation[];
  onChange: (value: StorageType, locationId: string | null) => void;
  label?: string;
  descriptionId?: string;
}) {
  const keyboard = useKeyboard();
  const customLocations = locations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  return (
    <div className="storage-picker" role="group" aria-label={label} aria-describedby={descriptionId}>
      {STORAGE_OPTIONS.map((option) => <button key={option} className={!locationId && value === option ? "storage-option storage-option-active" : "storage-option"} type="button" aria-pressed={!locationId && value === option} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(option, null); }}><span className={`storage-dot ${storageClassFromType(option)}`} />{option}{!locationId && value === option ? <CheckIcon width={14} height={14} /> : null}</button>)}
      {customLocations.length ? <div className="storage-custom-options" role="group" aria-label="사용자 정의 보관 위치"><span className="storage-custom-heading">내 보관 위치</span>{customLocations.map((location) => { const storage = storageFromApiCode(location.storage_type); return <button key={location.id} className={`storage-option storage-custom-option ${locationId === location.id ? "storage-option-active" : ""}`} type="button" aria-pressed={locationId === location.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onChange(storage, location.id); }}><span className={`storage-dot ${storageClassFromType(storage)}`} />{location.name}{locationId === location.id ? <CheckIcon width={14} height={14} /> : null}</button>; })}</div> : null}
    </div>
  );
}

function ProcessingState({ label, detail }: { label: string; detail: string }) {
  return <div className="capture-intro processing-state" role="status" aria-live="polite"><div className="capture-visual"><UploadIcon width={25} height={25} /></div><h3>{label}</h3><p>{detail}</p><span className="processing-pulse" aria-hidden="true" /></div>;
}

function CaptureActions({
  label,
  onFile,
  onCameraOpen,
  allowPdf = false,
  disabled = false,
}: {
  label: string;
  onFile: CaptureFileHandler;
  onCameraOpen: () => void;
  allowPdf?: boolean;
  disabled?: boolean;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void onFile(file);
  };

  return (
    <div className="capture-actions" role="group" aria-label={label} aria-busy={disabled}>
      <button className="primary-sheet-button capture-action capture-action-camera" type="button" disabled={disabled} onClick={onCameraOpen}>
        <CameraIcon width={17} height={17} /> 카메라로 촬영
      </button>
      <label className={`secondary-sheet-button file-button capture-action capture-action-library${disabled ? " capture-action-disabled" : ""}`} aria-disabled={disabled}>
        <UploadIcon width={17} height={17} /> <span>{allowPdf ? "사진·PDF 선택" : "사진 선택"}</span>
        <input type="file" accept={allowPdf ? "image/*,.pdf,application/pdf" : "image/*"} data-input-source="library" aria-label={`${label} 사진${allowPdf ? " 또는 PDF" : ""} 선택`} onChange={handleChange} disabled={disabled} />
      </label>
    </div>
  );
}

function receiptMatchSourceLabel(source: ReceiptLine["matchSource"]) {
  if (source === "user_confirmed_alias") return "이전에 확인한 상품명";
  if (source === "local_rule") return "확인된 상품명 정보";
  if (source === "local_fixture") return "서비스 상품 정보";
  if (source === "mfds_i1250") return "식품안전나라 상품 정보";
  if (source === "open_food_facts") return "공개 상품 정보";
  if (source === "unmatched") return "상품명을 살펴봐 주세요";
  return "영수증에서 읽은 상품명";
}

function mapReceiptDraftLines(
  draft: ApiReceiptDraft,
  storageFromApi: (storage: ApiStorageType) => StorageType,
  imageForFoodName: (name: string) => string,
): ReceiptLine[] {
  return draft.lines
    .filter((line) => line.line_type === "product")
    .map((line) => ({
      id: `api-${line.id}`,
      backendId: line.id,
      rawName: line.raw_name,
      barcode: line.barcode,
      name: line.canonical_name ?? line.raw_name,
      quantity: String(line.quantity),
      unit: line.unit,
      totalPrice: line.total_price ?? 0,
      storage: storageFromApi(line.storage_suggestion ?? "refrigerated"),
      confidence: line.match_confidence,
      requiresReview: line.review_status === "pending",
      matchSource: line.match_source,
      matchCandidates: line.match_candidates,
      sourceObservationIds: line.source_observation_ids ?? [],
      image: imageForFoodName(line.canonical_name ?? line.raw_name),
    }));
}

function mergeReceiptMatchCandidates(
  current: ReceiptLine["matchCandidates"],
  refreshed: ReceiptLine["matchCandidates"],
): ReceiptLine["matchCandidates"] {
  const candidates = [...(current ?? []), ...(refreshed ?? [])];
  if (!candidates.length) return undefined;
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.source}:${candidate.canonical_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeReceiptDraftLines(current: ReceiptLine[], refreshed: ReceiptLine[]) {
  const currentById = new Map(current.map((line) => [line.id, line]));
  return refreshed.map((nextLine) => {
    const currentLine = currentById.get(nextLine.id);
    if (!currentLine) return nextLine;
    return {
      ...nextLine,
      // Receipt draft readback may add candidates, but it must not overwrite
      // edits the user made while the background request was in flight.
      name: currentLine.name,
      quantity: currentLine.quantity,
      unit: currentLine.unit,
      storage: currentLine.storage,
      storageLocationId: currentLine.storageLocationId,
      confidence: currentLine.confidence,
      requiresReview: currentLine.requiresReview,
      barcode: currentLine.barcode ?? nextLine.barcode,
      matchSource: currentLine.matchSource ?? nextLine.matchSource,
      matchCandidates: mergeReceiptMatchCandidates(currentLine.matchCandidates, nextLine.matchCandidates),
      sourceObservationIds: currentLine.sourceObservationIds?.length ? currentLine.sourceObservationIds : nextLine.sourceObservationIds,
      image: currentLine.image,
    };
  });
}

function UnavailableState({ message, onBack }: { message: string; onBack: () => void }) {
  return <div className="capture-intro unavailable-state"><div className="capture-visual warning"><InfoCircledIcon width={25} height={25} /></div><h3>사진을 다시 확인해 주세요</h3><p>{message || "지금은 사진을 읽을 수 없어요. 식품 정보를 직접 확인해 등록할 수 있어요."}</p><button className="secondary-sheet-button" type="button" onClick={onBack}>다시 촬영하거나 사진 선택</button><div className="capture-hint"><InfoCircledIcon width={14} height={14} /> 사진을 읽지 못해도 직접 확인해서 등록할 수 있어요.</div></div>;
}

function LabelSourcePreview({
  sourcePreviewUrl,
  sourceAspectRatio,
  reviewObservations,
  activeObservationIds,
  onImageLoad,
}: {
  sourcePreviewUrl: string;
  sourceAspectRatio: number | null;
  reviewObservations: ApiOcrReviewObservation[];
  activeObservationIds: string[];
  onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const activeIds = new Set(activeObservationIds);
  return (
    <div className="label-source-preview" role="region" aria-label="라벨 원본 미리보기">
      <div className="label-source-preview-heading"><span><ReaderIcon width={15} height={15} /><strong>포장지 날짜 확인</strong></span><small>이 사진은 이 화면에서만 보여요</small></div>
      <div className="label-source-preview-frame" data-preview-ready={sourceAspectRatio ? "true" : "false"} style={sourceAspectRatio ? { width: `min(100%, ${Math.round(270 * sourceAspectRatio)}px)`, aspectRatio: String(sourceAspectRatio) } : undefined}>
        <img src={sourcePreviewUrl} alt="업로드한 라벨 원본 미리보기" draggable={false} onLoad={onImageLoad} />
        <div className="label-source-preview-overlay" aria-hidden="true">
          {reviewObservations.map((observation) => {
            const [x, y, width, height] = observation.bbox;
            return <span className={`label-source-box ${activeIds.has(observation.id) ? "label-source-box-active" : ""}`} data-observation-id={observation.id} key={observation.id} style={{ left: `${x * 100}%`, bottom: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }} />;
          })}
        </div>
      </div>
      <p>{activeObservationIds.length ? "읽은 날짜가 있는 곳을 표시했어요. 포장지의 날짜 문구와 날짜를 확인한 뒤 저장해 주세요." : "읽은 날짜가 포장지의 어느 부분인지 찾지 못했어요. 날짜가 무엇을 뜻하는지 포장지에서 확인한 뒤 저장해 주세요."} 사진 파일은 식품 기록에 저장하지 않아요.</p>
    </div>
  );
}

function ReceiptSourcePreview({
  previewRef,
  activeLineLabel,
  activeLineIncluded,
  sourcePreviewUrl,
  sourcePreviewKind,
  reviewObservations,
  activeObservationIds,
  observationLabels,
  onSelectObservation,
}: {
  previewRef: RefObject<HTMLDivElement | null>;
  activeLineLabel: string | null;
  activeLineIncluded: boolean | null;
  sourcePreviewUrl: string;
  sourcePreviewKind: SourcePreviewKind;
  reviewObservations: ApiOcrReviewObservation[];
  activeObservationIds: string[];
  observationLabels: Record<string, string>;
  onSelectObservation: (observationId: string) => void;
}) {
  const [sourceAspectRatio, setSourceAspectRatio] = useState<number | null>(null);
  const [sourceZoomed, setSourceZoomed] = useState(false);
  const activeSourceObservationIds = new Set(activeObservationIds);
  const interactiveObservationIds = new Set(reviewObservations.map((observation) => observation.id).filter((id) => observationLabels[id]));
  const sourceMappingState = interactiveObservationIds.size > 0 ? "mapped" : reviewObservations.length ? "unmapped" : "none";
  const activeZoomObservations = reviewObservations.filter((observation) => activeSourceObservationIds.has(observation.id) && observationLabels[observation.id]);
  const sourceZoomFocus = activeZoomObservations.length
    ? activeZoomObservations.reduce((focus, observation) => {
      const [x, y, width, height] = observation.bbox;
      return { x: focus.x + x + width / 2, y: focus.y + 1 - y - height / 2 };
    }, { x: 0, y: 0 })
    : { x: 0.5, y: 0.5 };
  const zoomScale = sourceZoomed ? 2.2 : 1;
  const zoomTranslateX = sourceZoomed ? 0.5 - (sourceZoomFocus.x / Math.max(1, activeZoomObservations.length)) * zoomScale : 0;
  const zoomTranslateY = sourceZoomed ? 0.5 - (sourceZoomFocus.y / Math.max(1, activeZoomObservations.length)) * zoomScale : 0;
  const sourceZoomStyle = sourceZoomed
    ? { transform: `translate(${zoomTranslateX * 100}%, ${zoomTranslateY * 100}%) scale(${zoomScale})`, transformOrigin: "top left" }
    : undefined;
  const sourceFrameBackground = typeof document !== "undefined" && document.documentElement.dataset.rescueTheme === "dark" ? "#121a22" : "#eef1eb";

  const selectObservationAtPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactiveObservationIds.size) return;
    const frame = event.currentTarget.parentElement;
    const frameBox = frame?.getBoundingClientRect();
    if (!frameBox?.width || !frameBox.height) return;
    const pointX = (event.clientX - frameBox.left) / frameBox.width;
    const pointTopY = (event.clientY - frameBox.top) / frameBox.height;
    const normalizedX = (pointX - zoomTranslateX) / zoomScale;
    const normalizedY = 1 - (pointTopY - zoomTranslateY) / zoomScale;
    const nearest = reviewObservations
      .filter((observation) => observationLabels[observation.id])
      .map((observation) => {
        const [x, y, width, height] = observation.bbox;
        const distanceX = normalizedX < x ? x - normalizedX : normalizedX > x + width ? normalizedX - (x + width) : 0;
        const distanceY = normalizedY < y ? y - normalizedY : normalizedY > y + height ? normalizedY - (y + height) : 0;
        return { id: observation.id, distance: distanceX * distanceX + distanceY * distanceY };
      })
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest) onSelectObservation(nearest.id);
  };

  useEffect(() => {
    setSourceAspectRatio(null);
    setSourceZoomed(false);
  }, [sourcePreviewKind, sourcePreviewUrl]);


  useEffect(() => {
    if (!sourceZoomed) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(previewRef.current, "nearest", getMobileScrollBehavior());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewRef, sourceZoomed]);

  return (
    <div ref={previewRef} className="receipt-source-preview" data-testid="receipt-source-preview" role="region" data-source-preview-mode={sourcePreviewKind} data-source-mapping-state={sourceMappingState} data-active-source-count={activeObservationIds.length} data-active-source-line={activeObservationIds.length ? activeLineLabel ?? "" : ""} data-active-source-included={activeObservationIds.length ? String(activeLineIncluded) : ""} aria-label={sourcePreviewKind === "pdf" ? "영수증 PDF 원본 미리보기" : "영수증 원본 미리보기"} aria-describedby="receipt-source-preview-hint">
      <div className="receipt-source-preview-heading"><span><ReaderIcon width={15} height={15} /><strong>영수증 내용</strong></span><small className={activeLineLabel && activeObservationIds.length && activeLineIncluded === false ? "receipt-source-preview-excluded" : undefined} aria-live="polite" aria-atomic="true"><MetadataText text={<>{activeLineLabel && activeObservationIds.length ? activeLineIncluded === false ? `저장 제외 · ${activeLineLabel}` : `현재 항목 · ${activeLineLabel} · 영수증 위치` : sourceMappingState === "unmapped" ? "상품과 연결되지 않은 위치예요" : "이 사진은 이 화면에서만 보여요"}</>} /></small>{sourcePreviewKind === "image" ? <button className="candidate-apply-button receipt-line-source-button" type="button" aria-pressed={sourceZoomed} aria-label={sourceZoomed ? "원본 축소" : "원본 확대"} onPointerDown={(event) => event.preventDefault()} onClick={() => setSourceZoomed((current) => !current)}>{sourceZoomed ? "축소" : "확대"}</button> : null}</div>
      {sourcePreviewKind === "pdf" ? (
        <div className="receipt-source-preview-frame receipt-source-pdf-frame" data-preview-ready="true">
          <object data={sourcePreviewUrl} type="application/pdf" title="업로드한 영수증 PDF 원본 미리보기">
            <a href={sourcePreviewUrl} target="_blank" rel="noreferrer">PDF 원본 열기</a>
          </object>
        </div>
      ) : (
      <div className="receipt-source-preview-frame" data-preview-ready={sourceAspectRatio ? "true" : "false"} data-preview-zoomed={sourceZoomed ? "true" : "false"} style={{ background: sourceFrameBackground, maxHeight: sourceZoomed ? 430 : 242, ...(sourceAspectRatio ? { width: `min(100%, ${Math.round((sourceZoomed ? 430 : 270) * sourceAspectRatio)}px)`, aspectRatio: String(sourceAspectRatio) } : {}) }}>
          <img src={sourcePreviewUrl} alt="업로드한 영수증 원본 미리보기" draggable={false} style={sourceZoomStyle} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setSourceAspectRatio(image.naturalWidth / image.naturalHeight); }} />
          <div className="receipt-source-preview-overlay" aria-hidden={interactiveObservationIds.size ? undefined : true} style={{ pointerEvents: interactiveObservationIds.size ? "auto" : "none", ...(sourceZoomStyle ?? {}) }} onClick={selectObservationAtPoint}>
            {reviewObservations.map((observation) => {
              const [x, y, width, height] = observation.bbox;
              const label = observationLabels[observation.id];
              const active = Boolean(label) && activeSourceObservationIds.has(observation.id);
              const boxStyle = { left: `${x * 100}%`, bottom: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%`, pointerEvents: "none" as const };
              return label ? [
                <span className={`receipt-source-box ${active ? "receipt-source-box-active" : ""}`} data-observation-id={observation.id} aria-hidden="true" key={`${observation.id}-box`} style={boxStyle} />,
                <button className="receipt-source-hit-target" type="button" data-observation-id={observation.id} aria-label={`${label} 영수증에서 확인하기`} aria-pressed={active} aria-describedby="receipt-source-preview-hint" key={`${observation.id}-hit`} style={{ position: "absolute", top: `${(1 - y - height / 2) * 100}%`, left: `${(x + width / 2) * 100}%`, width: 44, height: 44, padding: 0, border: 0, borderRadius: 0, background: "transparent", color: "transparent", cursor: "pointer", pointerEvents: "none", transform: "translate(-50%, -50%)", zIndex: 2 }} onClick={(event) => { event.stopPropagation(); onSelectObservation(observation.id); }} />,
              ] : <span className="receipt-source-box receipt-source-box-unmapped" data-observation-id={observation.id} aria-hidden="true" key={observation.id} style={boxStyle} />;
            })}
          </div>
        </div>
      )}
      <p id="receipt-source-preview-hint" aria-live="polite" aria-atomic="true">{sourcePreviewKind === "pdf" ? "PDF에서는 상품 위치를 표시하지 않아요. 영수증과 상품 내용을 함께 살펴봐 주세요." : interactiveObservationIds.size ? "테두리는 영수증에서 읽은 부분을 가리켜요. 선택한 항목만 저장돼요. 영수증을 누르면 해당 항목을 수정할 수 있어요." : reviewObservations.length ? "테두리는 영수증에서 읽은 부분이에요. 특정 상품과 연결된 표시는 아니에요." : "영수증과 상품 내용을 비교한 뒤 필요한 항목만 선택해 주세요."} 사진 파일은 식품 기록에 저장하지 않아요.</p>
    </div>
  );
}

function ReceiptReview({
  lines,
  qualityWarnings,
  source,
  resumedFromDraft,
  sourcePreviewUrl,
  sourcePreviewKind,
  templateId,
  templateConfidence,
  merchantName,
  reviewObservations,
  reviewSessionState,
  setReviewSessionState,
  selectedIds,
  onToggle,
  onChange,
  onSubmit,
  onBack,
  formatReceiptLineDetail,
  receiptLineError,
  productNameLookups,
  onLookupProductName,
  onApplyProductCandidate,
  onApplyReceiptMatchCandidate,
  barcodeLookups,
  onLookupBarcode,
  onApplyBarcodeCandidate,
  storageLocations,
  receiptDraftId,
  productEnrichmentJob,
  onEnqueueProductEnrichment,
  onRetryProductEnrichment,
  productEnrichmentError,
}: {
  lines: ReceiptLine[];
  qualityWarnings: string[];
  source: string;
  resumedFromDraft: boolean;
  sourcePreviewUrl: string | null;
  sourcePreviewKind: SourcePreviewKind | null;
  templateId: string | null;
  templateConfidence: number | null;
  merchantName: string | null;
  reviewObservations: ApiOcrReviewObservation[];
  reviewSessionState: ReceiptReviewSessionState;
  setReviewSessionState: Dispatch<SetStateAction<ReceiptReviewSessionState>>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onChange: (id: string, changes: Partial<Pick<ReceiptLine, "name" | "quantity" | "unit" | "storage" | "storageLocationId">>) => void;
  onSubmit: () => void;
  onBack: () => void;
  formatReceiptLineDetail: (line: ReceiptLine) => string;
  receiptLineError: (line: ReceiptLine) => string;
  productNameLookups: Record<string, ApiProductNameLookup | "loading">;
  onLookupProductName: (line: ReceiptLine) => void;
  onApplyProductCandidate: (lineId: string, candidate: ApiProductNameLookup["candidates"][number]) => void;
  onApplyReceiptMatchCandidate: (lineId: string, candidate: NonNullable<ReceiptLine["matchCandidates"]>[number]) => void;
  barcodeLookups: Record<string, ApiProductLookup | "loading">;
  onLookupBarcode: (line: ReceiptLine) => void;
  onApplyBarcodeCandidate: (lineId: string, candidate: ApiProductLookup["candidates"][number]) => void;
  storageLocations: ApiStorageLocation[];
  receiptDraftId?: string;
  productEnrichmentJob: ApiProductEnrichmentJob | null;
  onEnqueueProductEnrichment: () => void;
  onRetryProductEnrichment: () => void;
  productEnrichmentError: string;
}) {
  const keyboard = useKeyboard();
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const sourcePreviewRef = useRef<HTMLDivElement | null>(null);
  const lineCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const productCandidateActionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const invalidFieldFocusRef = useRef<"상품명" | "수량" | "단위" | null>(null);
  const initialReviewFocusHandledRef = useRef(false);
  const resumedFocusHandledRef = useRef(false);
  const { candidateAppliedLineId, candidateUserEditedLineId, editingIds, userConfirmedLineIds, activeSourceLineId } = reviewSessionState;
  const setCandidateAppliedLineId: Dispatch<SetStateAction<string | null>> = (value) => setReviewSessionState((current) => ({ ...current, candidateAppliedLineId: applyStateAction(value, current.candidateAppliedLineId) }));
  const setCandidateUserEditedLineId: Dispatch<SetStateAction<string | null>> = (value) => setReviewSessionState((current) => ({ ...current, candidateUserEditedLineId: applyStateAction(value, current.candidateUserEditedLineId) }));
  const setEditingIds: Dispatch<SetStateAction<string[]>> = (value) => setReviewSessionState((current) => ({ ...current, editingIds: applyStateAction(value, current.editingIds) }));
  const setUserConfirmedLineIds: Dispatch<SetStateAction<string[]>> = (value) => setReviewSessionState((current) => ({ ...current, userConfirmedLineIds: applyStateAction(value, current.userConfirmedLineIds) }));
  const setActiveSourceLineId: Dispatch<SetStateAction<string | null>> = (value) => setReviewSessionState((current) => ({ ...current, activeSourceLineId: applyStateAction(value, current.activeSourceLineId) }));
  const [revealEditingId, setRevealEditingId] = useState<string | null>(null);
  const reviewCount = lines.filter((line) => selectedIds.includes(line.id)).length;
  const selectedReviewCount = lines.filter((line) => selectedIds.includes(line.id) && line.requiresReview && !userConfirmedLineIds.includes(line.id)).length;
  const invalidSelectedLines = lines.filter((line) => selectedIds.includes(line.id) && receiptLineError(line));
  const canSubmit = reviewCount > 0 && selectedReviewCount === 0 && invalidSelectedLines.length === 0;
  const submitState = invalidSelectedLines.length > 0
    ? "invalid"
    : selectedReviewCount > 0
      ? "needs-confirmation"
      : reviewCount > 0 ? "ready" : "empty";
  const submitHintId = submitState === "invalid"
    ? "receipt-review-invalid-hint"
    : submitState === "needs-confirmation" ? "receipt-review-submit-hint" : "receipt-review-ready-hint";
  const submitHintTone = submitState === "invalid" ? "error" : submitState === "needs-confirmation" ? "warning" : "ready";
  const submitHintMessage = submitState === "invalid"
    ? selectedReviewCount > 0
      ? `상품 정보 ${selectedReviewCount}개와 입력 내용 ${invalidSelectedLines.length}개를 확인해 주세요.`
      : `입력 내용 ${invalidSelectedLines.length}개를 확인해 주세요.`
    : submitState === "needs-confirmation"
      ? `확인이 필요한 항목 ${selectedReviewCount}개를 살펴보거나 선택을 해제해 주세요.`
      : "";
  const activeSourceObservationIds = new Set(lines.find((line) => line.id === activeSourceLineId)?.sourceObservationIds ?? []);
  const activeSourceLineLabel = lines.find((line) => line.id === activeSourceLineId)?.name ?? null;
  const observationLabels = lines.reduce<Record<string, string>>((labels, line) => {
    const sourceLabel = line.rawName?.trim() || line.name.trim() || "상품";
    for (const observationId of line.sourceObservationIds ?? []) labels[observationId] = sourceLabel;
    return labels;
  }, {});
  const productCandidateFocusLineId = lines.find((line) => {
    const lookup = productNameLookups[line.id];
    return lookup && lookup !== "loading" && lookup.candidates.length > 0;
  })?.id ?? null;

  const revealSourcePreview = () => {
    window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(sourcePreviewRef.current, "start", getMobileScrollBehavior());
    });
  };

  const selectSourceObservation = (observationId: string) => {
    const line = lines.find((candidate) => candidate.sourceObservationIds?.includes(observationId));
    if (!line) return;
    keyboard.hide();
    setActiveSourceLineId(line.id);
    setEditingIds([line.id]);
    setRevealEditingId(line.id);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(reviewRef.current, "nearest", getMobileScrollBehavior());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (resumedFromDraft || initialReviewFocusHandledRef.current || !lines.some((line) => line.requiresReview)) return;
    const frame = window.requestAnimationFrame(() => {
      const target = reviewRef.current?.querySelector<HTMLElement>(".receipt-line-card-editing .receipt-line-toggle")
        ?? reviewRef.current?.querySelector<HTMLElement>(".receipt-line-toggle[aria-label*='살펴봐 주세요']");
      if (!target || target.hasAttribute("disabled")) return;
      scrollTargetWithinNearestContainer(target, "center", getMobileScrollBehavior());
      target.focus({ preventScroll: true });
      // Keep the review surface itself inside the sheet after centering the
      // first unresolved line. The line owns focus, but the root must remain
      // readable in the same viewport for desktop preview and narrow mobile.
      scrollTargetWithinNearestContainer(reviewRef.current, "nearest", getMobileScrollBehavior());
      initialReviewFocusHandledRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lines, resumedFromDraft]);

  useEffect(() => {
    if (!resumedFromDraft || resumedFocusHandledRef.current) return;
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
    const findTarget = () => reviewRef.current?.querySelector<HTMLElement>(".receipt-line-card-editing input, .receipt-line-toggle") ?? null;
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || !resumedFromDraft || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || target.hasAttribute("disabled") || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || !resumedFromDraft || !canTakeFocus()) return;
        const currentTarget = findTarget();
        if (!currentTarget || currentTarget.hasAttribute("disabled")) {
          tryFocus();
          return;
        }
        scrollTargetWithinNearestContainer(currentTarget, "nearest", "auto");
        currentTarget.focus({ preventScroll: true });
        resumedFocusHandledRef.current = true;
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
  }, [resumedFromDraft]);

  useEffect(() => {
    if (!revealEditingId || !editingIds.includes(revealEditingId)) return;
    let keyboardLayoutFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      const card = lineCardRefs.current[revealEditingId];
      const fieldLabel = invalidFieldFocusRef.current;
      const invalidField = fieldLabel ? card?.querySelector<HTMLInputElement>(`[aria-label="${fieldLabel}"]`) : null;
      if (invalidField) {
        invalidField.focus({ preventScroll: true });
        keyboardLayoutFrame = window.requestAnimationFrame(() => {
          scrollTargetWithinNearestContainer(invalidField, "center", getMobileScrollBehavior());
          invalidFieldFocusRef.current = null;
          setRevealEditingId(null);
        });
      } else {
        scrollTargetWithinNearestContainer(card, "nearest", getMobileScrollBehavior());
        invalidFieldFocusRef.current = null;
        setRevealEditingId(null);
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (keyboardLayoutFrame !== null) window.cancelAnimationFrame(keyboardLayoutFrame);
    };
  }, [editingIds, revealEditingId]);

  useEffect(() => {
    if (!productCandidateFocusLineId) return;
    const frame = window.requestAnimationFrame(() => {
      const action = productCandidateActionRefs.current[productCandidateFocusLineId];
      if (!action || action.hasAttribute("disabled")) return;
      scrollTargetWithinNearestContainer(action, "center", getMobileScrollBehavior());
      action.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [productCandidateFocusLineId, productNameLookups]);

  const toggleEditing = (id: string) => {
    const isOpening = !editingIds.includes(id);
    setEditingIds((current) => current.includes(id) ? current.filter((lineId) => lineId !== id) : [id]);
    setRevealEditingId(isOpening ? id : null);
  };

  const openFirstInvalidLine = () => {
    const targetInvalidLine = invalidSelectedLines.find((line) => !editingIds.includes(line.id)) ?? invalidSelectedLines[0];
    if (!targetInvalidLine) return;
    const error = receiptLineError(targetInvalidLine);
    invalidFieldFocusRef.current = error.startsWith("상품명") ? "상품명" : error.startsWith("수량") ? "수량" : "단위";
    keyboard.hide();
    setActiveSourceLineId(targetInvalidLine.id);
    setEditingIds([targetInvalidLine.id]);
    setRevealEditingId(targetInvalidLine.id);
  };

  const handleLineChange = (id: string, changes: Partial<Pick<ReceiptLine, "name" | "quantity" | "unit" | "storage" | "storageLocationId">>) => {
    setUserConfirmedLineIds((current) => current.includes(id) ? current : [...current, id]);
    if (candidateAppliedLineId === id) {
      setCandidateAppliedLineId(null);
      setCandidateUserEditedLineId(id);
    }
    onChange(id, changes);
  };

  const confirmLine = (id: string) => {
    setUserConfirmedLineIds((current) => current.includes(id) ? current : [...current, id]);
    const nextLine = lines.find((line) => line.id !== id && selectedIds.includes(line.id) && line.requiresReview && !userConfirmedLineIds.includes(line.id));
    if (!nextLine) return;
    window.requestAnimationFrame(() => {
      const target = reviewRef.current?.querySelector<HTMLElement>(`[data-line-id="${nextLine.id}"] .receipt-line-toggle`);
      if (!target || target.hasAttribute("disabled")) return;
      scrollTargetWithinNearestContainer(target, "center", getMobileScrollBehavior());
      target.focus({ preventScroll: true });
    });
  };

  return (
      <div ref={reviewRef} className="receipt-review">
      <div className="review-summary">
        <span className="review-file-icon"><FileTextIcon width={20} height={20} /></span>
        <span>
          <strong>{merchantName ?? source}</strong>
          <small>{merchantName ? `${source} · ` : ""}{templateId && (templateConfidence ?? 0) > 0 ? `${receiptTemplateLabel(templateId)} · ` : ""}찾은 식품 {lines.length}개</small>
        </span>
        <button type="button" onClick={() => { keyboard.hide(); onBack(); }} aria-label="영수증 다시 선택"><Cross2Icon width={17} height={17} /></button>
      </div>
      <div className="receipt-review-contract" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>상품명과 수량을 살펴봐 주세요</strong><small>필요한 항목만 추가할 수 있어요. 날짜는 포장지에서 따로 입력해요.</small></span></div>
      {resumedFromDraft ? <div className="receipt-resume-callout" role="status"><ReaderIcon width={16} height={16} /><span><strong>이어서 볼 영수증이에요</strong><small>사진은 저장하지 않아 상품 정보만 다시 보여요. 내용을 살펴보고 저장하면 식품 목록에 추가돼요.</small></span></div> : null}
      {qualityWarnings.length ? <div className="quality-callout"><InfoCircledIcon width={17} height={17} /><span><strong>{sourcePreviewKind === "pdf" ? "PDF 확인" : "사진 확인"}</strong><small>{qualityWarnings.map(normalizeKnownProductWarning).join(" ")}</small></span></div> : null}
      {receiptDraftId ? <div className={`receipt-enrichment-callout ${productEnrichmentError ? "receipt-enrichment-callout-error" : ""}`} role={productEnrichmentError ? "alert" : undefined} aria-live="polite" aria-busy={productEnrichmentJob?.status === "queued" || productEnrichmentJob?.status === "in_flight"}><span><strong>상품 정보</strong><small>{productEnrichmentError ? normalizeKnownProductWarning(productEnrichmentError) : productEnrichmentJob?.status === "succeeded" ? `상품 정보 ${productEnrichmentJob.enriched_candidates}개를 찾았어요.` : productEnrichmentJob?.status === "in_flight" ? "상품 정보를 찾고 있어요." : productEnrichmentJob?.status === "queued" ? "상품 정보를 찾고 있어요. 영수증은 지금 저장할 수 있어요." : productEnrichmentJob?.status === "dead_letter" ? "상품 정보를 찾지 못했어요. 잠시 후 다시 시도해 주세요." : "이름이 분명하지 않은 식품의 정보를 더 찾아볼 수 있어요."}</small></span>{productEnrichmentJob?.status === "dead_letter" ? <button type="button" onClick={onRetryProductEnrichment}>다시 시도</button> : <button type="button" disabled={Boolean(productEnrichmentJob)} aria-busy={productEnrichmentJob?.status === "queued" || productEnrichmentJob?.status === "in_flight"} onClick={onEnqueueProductEnrichment}>{productEnrichmentError ? "다시 시도" : productEnrichmentJob?.status === "succeeded" ? "찾았어요" : productEnrichmentJob?.status === "queued" || productEnrichmentJob?.status === "in_flight" ? "찾는 중" : "더 찾아보기"}</button>}</div> : null}
      {invalidSelectedLines.length ? <div className="receipt-validation-callout" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>입력할 내용이 남은 항목 {invalidSelectedLines.length}개</strong><small>{invalidSelectedLines.length === 1 ? receiptLineError(invalidSelectedLines[0]) : `입력할 내용: ${receiptLineError(invalidSelectedLines[0])}`}</small><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={openFirstInvalidLine}>수정하기</button></span></div> : null}
      <div className="receipt-lines">
        {lines.map((line) => {
          const checked = selectedIds.includes(line.id);
          const editing = editingIds.includes(line.id);
          const userConfirmed = userConfirmedLineIds.includes(line.id);
          const reviewNeedsAction = line.requiresReview && !userConfirmed;
          const error = receiptLineError(line);
          const productLookup = productNameLookups[line.id];
          const receiptBarcodeLookup = barcodeLookups[line.id];
          return (
              <div ref={(element) => { lineCardRefs.current[line.id] = element; }} className={`receipt-line-card ${checked ? "receipt-line-card-checked" : ""} ${editing ? "receipt-line-card-editing" : ""} ${checked && line.requiresReview && !userConfirmedLineIds.includes(line.id) ? "receipt-line-card-needs-confirmation" : ""} ${checked && line.requiresReview && userConfirmedLineIds.includes(line.id) ? "receipt-line-card-confirmed" : ""} ${reviewObservations.length && line.sourceObservationIds?.length && activeSourceLineId === line.id ? "receipt-line-card-source-active" : ""}`} style={editing ? { scrollMarginBottom: "96px" } : undefined} data-line-id={line.id} data-receipt-review-state={line.requiresReview ? userConfirmedLineIds.includes(line.id) ? "user_confirmed" : "needs_confirmation" : "auto_read"} key={line.id}>
              <div className="receipt-line">
                <button className="receipt-line-toggle" type="button" aria-pressed={checked} aria-label={`${line.name} ${formatReceiptLineDetail(line)}${line.requiresReview ? ` ${userConfirmed ? "내용이 맞아요" : "내용을 살펴봐 주세요"}` : ""}`} aria-describedby={`receipt-line-status-${line.id}`} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setActiveSourceLineId(line.id); onToggle(line.id); }}>
                  <span className={`check-box ${checked ? "check-box-checked" : ""}`}>{checked ? <CheckIcon width={13} height={13} /> : null}</span>
                  <img src={line.image} alt="" draggable={false} />
                  <span className="receipt-line-copy"><strong>{line.name || "상품명이 없어요"}</strong><small><MetadataText text={<>{formatReceiptLineDetail(line)}</>} /></small>{line.barcode ? <small className="receipt-line-barcode"><MetadataText text={<>영수증 바코드 · {line.barcode}</>} /></small> : null}{line.matchSource && line.matchSource !== "parser" ? <small className="receipt-line-match-source">{receiptMatchSourceLabel(line.matchSource)}{line.matchCandidates && line.matchCandidates.length > 1 ? ` · 비슷한 정보 ${line.matchCandidates.length}개` : ""}</small> : null}</span>
                  <span aria-hidden="true" className={`ocr-confidence ${reviewNeedsAction ? "ocr-review" : ""}`}>{reviewNeedsAction ? "살펴봐 주세요" : "읽었어요"}</span>
                </button>
                <button className="receipt-line-edit-button" type="button" aria-expanded={editing} aria-label={`${line.name || "상품"} 항목 ${editing ? "수정 닫기" : "수정"}`} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setActiveSourceLineId(line.id); toggleEditing(line.id); }}>{editing ? "닫기" : "수정"}</button>
              </div>
              {reviewObservations.length && line.sourceObservationIds?.length ? <div className="receipt-line-source-action-row"><button className="candidate-apply-button receipt-line-source-button" type="button" aria-label={`${line.name || "상품"} 영수증에서 위치 보기`} aria-pressed={activeSourceLineId === line.id} aria-describedby="receipt-source-preview-hint" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setActiveSourceLineId(line.id); revealSourcePreview(); }}><ReaderIcon width={14} height={14} /> 영수증에서 위치 보기</button></div> : null}
              <span id={`receipt-line-status-${line.id}`} className="sr-only"><MetadataText text={<>{`${line.requiresReview ? userConfirmedLineIds.includes(line.id) ? "항목 내용이 맞아요" : "읽어낸 내용이 맞는지 살펴봐 주세요" : "영수증에서 읽었어요"}${reviewObservations.length && line.sourceObservationIds?.length && activeSourceLineId === line.id ? " · 영수증 위치" : ""}`}</>} /></span>
              {editing ? (
                <div className="receipt-line-editor">
                  <div className="receipt-line-editor-heading"><div><strong>상품 정보 수정</strong><em>현재 항목</em></div><small>영수증에 적힌 이름: {line.rawName ?? line.name}</small></div>
                  <label className="receipt-line-editor-field"><span>재고에 저장할 상품명</span><KeyboardInput className="app-input" value={line.name} autoComplete="off" spellCheck={false} aria-label="재고에 저장할 상품명" onChange={(event) => handleLineChange(line.id, { name: event.target.value })} onFocus={(event) => revealFocusedInput(event, "center")} onBlur={() => keyboard.hide()} /></label>
                  <div className="receipt-line-editor-grid">
                    <label className="receipt-line-editor-field"><span>수량</span><KeyboardInput className="app-input" type="number" inputMode="decimal" min="0.001" step="0.001" value={line.quantity} aria-label="수량" onChange={(event) => handleLineChange(line.id, { quantity: event.target.value })} onFocus={(event) => revealFocusedInput(event, "center")} onBlur={() => keyboard.hide()} /></label>
                    <label className="receipt-line-editor-field"><span>단위</span><KeyboardInput className="app-input" value={line.unit} autoComplete="off" aria-label="단위" onChange={(event) => handleLineChange(line.id, { unit: event.target.value })} onFocus={(event) => revealFocusedInput(event, "center")} onBlur={() => keyboard.hide()} /></label>
                  </div>
                  <div className="receipt-line-storage-field"><span>보관 위치</span><StoragePicker value={line.storage} locationId={line.storageLocationId} locations={storageLocations} label={`${line.name || "상품"} 보관 위치`} descriptionId={`receipt-storage-hint-${line.id}`} onChange={(storage, storageLocationId) => handleLineChange(line.id, { storage, storageLocationId })} /><small id={`receipt-storage-hint-${line.id}`}>상품 정보에서 찾은 보관 방법이에요. 실제 보관 위치를 골라 주세요.</small></div>
                  {line.barcode ? (
                    <div className="receipt-barcode-lookup" role="group" aria-label={`${line.name || "상품"} 영수증 바코드 상품 조회`}>
                      <div className="receipt-barcode-lookup-heading"><span><strong>영수증 바코드</strong><small>{line.barcode}</small></span><small>상품 식별자예요. 소비기한은 포장지 날짜로 확인해요.</small></div>
                      <button className="receipt-line-enrich-button" type="button" disabled={!mealApi.isConfigured || receiptBarcodeLookup === "loading"} aria-busy={receiptBarcodeLookup === "loading"} onPointerDown={(event) => event.preventDefault()} onClick={() => onLookupBarcode(line)}>{receiptBarcodeLookup === "loading" ? "바코드로 상품 찾는 중" : mealApi.isConfigured ? "바코드로 상품 찾기" : "상품 정보 확인 불가"}</button>
                      {receiptBarcodeLookup && receiptBarcodeLookup !== "loading" ? (
                        <div className={`receipt-product-lookup ${receiptBarcodeLookup.status === "matched" ? "" : "receipt-product-lookup-warning"}`} aria-live="polite">
                      {receiptBarcodeLookup.candidates.length ? <>{receiptBarcodeLookup.candidates.map((candidate) => <div className="receipt-product-candidate" key={`${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small><MetadataText text={<>{[candidate.brand, candidate.category, candidate.quantity_text].filter(Boolean).join(" · ") || "상품 기본 정보"}</>} /></small><small className="receipt-line-match-source"><MetadataText text={<>{productSourceLabel(candidate.source)} · {productFreshnessLabel(candidate.source_freshness)} · {productProvenanceNote(candidate.provenance_note)}</>} /></small></span><button className="candidate-apply-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onApplyBarcodeCandidate(line.id, candidate); setCandidateUserEditedLineId(null); setCandidateAppliedLineId(line.id); }}>상품 정보 적용</button></div>)}</> : null}
                          {!receiptBarcodeLookup.candidates.length && !receiptBarcodeLookup.warnings.length ? <small>이 바코드에 맞는 상품 정보를 찾지 못했어요.</small> : null}
                          {receiptBarcodeLookup.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{normalizeKnownProductWarning(warning)}</small>)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button className="receipt-line-enrich-button" type="button" disabled={!line.name.trim() || productLookup === "loading"} aria-busy={productLookup === "loading"} onPointerDown={(event) => event.preventDefault()} onClick={() => onLookupProductName(line)}>{productLookup === "loading" ? "상품 정보를 찾는 중" : "상품 정보 찾기"}</button>
                  {productLookup && productLookup !== "loading" ? (
                    <div className={`receipt-product-lookup ${productLookup.status === "matched" ? "" : "receipt-product-lookup-warning"}`} aria-live="polite">
                      {productLookup.candidates.length ? <>{productLookup.candidates.map((candidate, index) => <div className="receipt-product-candidate" key={`${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small><MetadataText text={<>{[candidate.brand, candidate.category, candidate.shelf_life_text ? `상품 정보에 나온 기간: ${candidate.shelf_life_text}` : ""].filter(Boolean).join(" · ")}</>} /></small><small className="receipt-line-match-source"><MetadataText text={<>{productSourceLabel(candidate.source)} · {productFreshnessLabel(candidate.source_freshness)} · {productProvenanceNote(candidate.provenance_note)}</>} /></small></span><button ref={index === 0 ? (element) => { productCandidateActionRefs.current[line.id] = element; } : undefined} className="candidate-apply-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onApplyProductCandidate(line.id, candidate); setCandidateUserEditedLineId(null); setCandidateAppliedLineId(line.id); }}>상품 정보 적용</button></div>)}{productLookup.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{normalizeKnownProductWarning(warning)}</small>)}</> : <small>{productLookup.warnings[0] ? normalizeKnownProductWarning(productLookup.warnings[0]) : "상품 정보를 찾지 못했어요."}</small>}
                    </div>
                  ) : null}
                  {line.matchCandidates?.filter((candidate) => candidate.source === "local_fixture" || candidate.source === "mfds_c005" || candidate.source === "mfds_i1250" || candidate.source === "open_food_facts").map((candidate) => <div className="receipt-product-candidate receipt-product-candidate-background" key={`background-${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small><MetadataText text={<>{[candidate.brand, candidate.category, candidate.shelf_life_text ? `상품 정보에 나온 기간: ${candidate.shelf_life_text}` : ""].filter(Boolean).join(" · ")}</>} /></small><small className="receipt-line-match-source"><MetadataText text={<>{productSourceLabel(candidate.source)} · {productFreshnessLabel(candidate.source_freshness)} · {productProvenanceNote(candidate.provenance_note)}</>} /></small></span><button className="candidate-apply-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onApplyReceiptMatchCandidate(line.id, candidate); setCandidateUserEditedLineId(null); setCandidateAppliedLineId(line.id); }}>상품 정보 적용</button></div>)}
                  {error ? <p className="receipt-line-error" role="alert"><InfoCircledIcon width={14} height={14} />{error}</p> : null}
                </div>
              ) : null}
              {line.requiresReview && !userConfirmedLineIds.includes(line.id) ? <button className="receipt-line-confirm-button" type="button" aria-describedby={`receipt-line-status-${line.id}`} onPointerDown={(event) => event.preventDefault()} onClick={() => confirmLine(line.id)}>내용이 맞아요</button> : null}
              {line.requiresReview && userConfirmedLineIds.includes(line.id) ? <span className="receipt-line-confirmed-badge" role="status" aria-live="polite" aria-atomic="true" aria-label="항목 내용이 맞아요"><CheckIcon width={12} height={12} /> 맞아요</span> : null}
              {candidateAppliedLineId === line.id ? <div className="receipt-review-contract receipt-candidate-applied" role="status" aria-live="polite"><CheckIcon width={15} height={15} /><span><strong>상품 정보를 적용했어요</strong><small>상품명과 보관 정보가 입력됐어요. 포장지 날짜는 별도로 확인해 주세요.</small></span></div> : null}
              {candidateUserEditedLineId === line.id ? <div className="receipt-review-contract receipt-candidate-user-edited" role="status" aria-live="polite"><ReaderIcon width={15} height={15} /><span><strong>상품 정보를 직접 수정했어요</strong><small>지금 보이는 내용으로 저장돼요. 참고한 상품 정보는 변경 기록에서 볼 수 있어요.</small></span></div> : null}
            </div>
          );
        })}
      </div>
      {sourcePreviewUrl && sourcePreviewKind ? <ReceiptSourcePreview previewRef={sourcePreviewRef} activeLineLabel={activeSourceLineLabel} activeLineIncluded={activeSourceLineId ? selectedIds.includes(activeSourceLineId) : null} sourcePreviewUrl={sourcePreviewUrl} sourcePreviewKind={sourcePreviewKind} reviewObservations={reviewObservations} activeObservationIds={activeSourceObservationIds.size ? [...activeSourceObservationIds] : []} observationLabels={observationLabels} onSelectObservation={selectSourceObservation} /> : null}
      <div className={`receipt-review-submit-bar receipt-review-submit-bar-${submitState}`} role="group" aria-label="영수증에서 읽은 식품 저장" data-review-state={submitState}>
        {reviewCount > 0 ? <small id={submitHintId} className={`receipt-review-submit-hint receipt-review-submit-hint-${submitHintTone}`} role={submitState === "ready" ? "status" : "note"}>
          {submitState !== "ready" ? <span>{submitHintMessage}</span> : null}
          <span className="receipt-review-submit-date-hint">소비기한은 미확인으로 저장돼요.</span>
        </small> : null}
        <button className="primary-sheet-button" type="button" aria-describedby={reviewCount > 0 ? submitHintId : undefined} disabled={!canSubmit} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onSubmit(); }}><CheckIcon width={17} height={17} /> {reviewCount}개 식품 저장하기</button>
      </div>
    </div>
  );
}

export default function AddFoodSheet({
  mode,
  onModeChange,
  onAddManual,
  onAddReceipt,
  resumeReceiptId,
  initialLabelTargetFoodId,
  initialLabelTargetFoodName,
  initialLabelTargetDateSummary,
  sessionKey,
  receiptLines: initialReceiptLines,
  createFood,
  formatApiDate,
  storageFromApi,
  imageForFoodName,
  formatReceiptLineDetail,
  receiptLineError,
  existingFoods,
  storageLocations,
  reviewFixture,
}: {
  mode: AddMode;
  onModeChange: (mode: AddMode) => void;
  onAddManual: (food: FoodItem) => void;
  onAddReceipt: (payload: ReceiptCommitPayload) => void;
  resumeReceiptId?: string | null;
  initialLabelTargetFoodId?: string | null;
  initialLabelTargetFoodName?: string | null;
  initialLabelTargetDateSummary?: string | null;
  sessionKey: number;
  receiptLines: ReceiptLine[];
  createFood: (input: Partial<FoodItem> & Pick<FoodItem, "name">) => FoodItem;
  formatApiDate: (value: string | null) => string;
  storageFromApi: (storage: ApiStorageType) => StorageType;
  imageForFoodName: (name: string) => string;
  formatReceiptLineDetail: (line: ReceiptLine) => string;
  receiptLineError: (line: ReceiptLine) => string;
  existingFoods: FoodItem[];
  storageLocations: ApiStorageLocation[];
  reviewFixture?: {
    source: string;
    merchantName: string;
    sourcePreviewUrl: string;
    sourcePreviewKind: SourcePreviewKind;
    reviewObservations: ApiOcrReviewObservation[];
    lines: ReceiptLine[];
  };
}) {
  const keyboard = useKeyboard();
  const demoInputsAvailable = mealApi.deploymentMode === "demo";
  const addSheetContentRef = useRef<HTMLDivElement | null>(null);
  const [receiptStage, setReceiptStage] = useState<"idle" | "processing" | "review" | "unavailable">(reviewFixture ? "review" : "idle");
  const [receiptSource, setReceiptSource] = useState(reviewFixture?.source ?? "샘플 영수증");
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(reviewFixture?.sourcePreviewUrl ?? null);
  const [receiptPreviewKind, setReceiptPreviewKind] = useState<SourcePreviewKind | null>(reviewFixture?.sourcePreviewKind ?? null);
  const [receiptTemplateId, setReceiptTemplateId] = useState<ReceiptTemplateId | null>(null);
  const [receiptTemplateConfidence, setReceiptTemplateConfidence] = useState<number | null>(null);
  const [receiptMerchantName, setReceiptMerchantName] = useState<string | null>(reviewFixture?.merchantName ?? null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const modeTabRefs = useRef<Record<AddMode, HTMLButtonElement | null>>({ receipt: null, barcode: null, label: null, manual: null });
  const [receiptReviewObservations, setReceiptReviewObservations] = useState<ApiOcrReviewObservation[]>(reviewFixture?.reviewObservations ?? []);
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>(reviewFixture?.lines ?? initialReceiptLines);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>(() => (reviewFixture?.lines ?? initialReceiptLines).map((line) => line.id));
  const [receiptReviewSessionState, setReceiptReviewSessionState] = useState<ReceiptReviewSessionState>(() => createReceiptReviewSessionState(reviewFixture?.lines ?? initialReceiptLines));
  const [receiptDraftId, setReceiptDraftId] = useState<string | undefined>();
  const [receiptResumed, setReceiptResumed] = useState(false);
  const [receiptQualityWarnings, setReceiptQualityWarnings] = useState<string[]>([]);
  const [receiptError, setReceiptError] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [barcodeParse, setBarcodeParse] = useState<ApiBarcodeParse | null>(null);
  const [barcodeLookup, setBarcodeLookup] = useState<ApiProductLookup | null>(null);
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false);
  const [productNameLookups, setProductNameLookups] = useState<Record<string, ApiProductNameLookup | "loading">>({});
  const [barcodeLookups, setBarcodeLookups] = useState<Record<string, ApiProductLookup | "loading">>({});
  const [productEnrichmentJob, setProductEnrichmentJob] = useState<ApiProductEnrichmentJob | null>(null);
  const [productEnrichmentError, setProductEnrichmentError] = useState("");
  const [labelResult, setLabelResult] = useState(false);
  const [labelResultFocusRequest, setLabelResultFocusRequest] = useState(0);
  const [labelSampleApplied, setLabelSampleApplied] = useState(false);
  const [labelDetectedDate, setLabelDetectedDate] = useState("2026.09.02");
  const [labelDateKind, setLabelDateKind] = useState<LabelDateKind | null>("use_by");
  const [labelDetectedProductName, setLabelDetectedProductName] = useState("시금치");
  const [labelQuantity, setLabelQuantity] = useState("1개");
  const [labelQuantityEdited, setLabelQuantityEdited] = useState(false);
  const [labelDetectedStorage, setLabelDetectedStorage] = useState<StorageType | null>("냉장");
  const [labelDetectedStorageLocationId, setLabelDetectedStorageLocationId] = useState<string | null>(null);
  const [labelStorageHint, setLabelStorageHint] = useState<ApiStorageType | undefined>("refrigerated");
  const [labelDetectedStorageConditionText, setLabelDetectedStorageConditionText] = useState<string | undefined>("포장지에 냉장 보관 표시");
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [labelSubmitting, setLabelSubmitting] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null);
  const labelPreviewUrlRef = useRef<string | null>(null);
  const [labelSourceAspectRatio, setLabelSourceAspectRatio] = useState<number | null>(null);
  const [labelReviewObservations, setLabelReviewObservations] = useState<ApiOcrReviewObservation[]>([]);
  const [labelDateObservationIds, setLabelDateObservationIds] = useState<string[]>([]);
  const labelResultActionRef = useRef<HTMLButtonElement | null>(null);
  const labelErrorActionRef = useRef<HTMLButtonElement | null>(null);
  const barcodeCandidateActionRef = useRef<HTMLButtonElement | null>(null);
  const barcodeManualFallbackActionRef = useRef<HTMLButtonElement | null>(null);
  const initialModeFocusHandledRef = useRef(false);
  const initialModeFocusSessionRef = useRef<number | null>(null);
  const [labelLotAction, setLabelLotAction] = useState<"create" | "correct">("create");
  const [labelTargetFoodId, setLabelTargetFoodId] = useState<string | null>(null);
  const [labelLotDecisionMade, setLabelLotDecisionMade] = useState(true);
  const [cameraTarget, setCameraTarget] = useState<"receipt" | "label" | null>(null);
  const barcodeLookupGeneration = useRef(0);
  const barcodeSessionKeyRef = useRef(sessionKey);
  const receiptRequestGeneration = useRef(0);
  const labelRequestGeneration = useRef(0);
  const receiptResumeRequestKeyRef = useRef<string | null>(null);
  const receiptAbortController = useRef<AbortController | null>(null);
  const labelAbortController = useRef<AbortController | null>(null);
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("1개");
  const [storage, setStorage] = useState<StorageType>("냉장");
  const [storageLocationId, setStorageLocationId] = useState<string | null>(null);
  const [priorityInference, setPriorityInference] = useState<ApiPriorityInference | null>(null);
  const [priorityInferenceLoading, setPriorityInferenceLoading] = useState(false);
  const [priorityInferenceError, setPriorityInferenceError] = useState("");
  const priorityInferenceGeneration = useRef(0);
  const priorityInferenceRef = useRef<HTMLDivElement | null>(null);
  const [productBrand, setProductBrand] = useState("직접 추가한 식품");
  const [productCategory, setProductCategory] = useState("기타");
  const [productProvenance, setProductProvenance] = useState<FoodItem["productProvenance"]>(undefined);
  const barcodeDateCandidate = barcodeParse?.date_assertions[0] ?? null;
  const barcodeProviderNotice = getBarcodeProviderNotice(barcodeLookup);
  const hasBarcodeCandidate = Boolean(barcodeLookup?.candidates.length || (!mealApi.isConfigured && barcodeResult === DEMO_BARCODE_FOUND_MESSAGE));
  const barcodeDemoUnavailable = !mealApi.isConfigured && barcodeResult === DEMO_BARCODE_UNAVAILABLE_MESSAGE;
  const barcodeManualFallback = Boolean(barcode.trim() && barcodeResult && !barcodeLookupLoading && !hasBarcodeCandidate && !barcodeDateCandidate);
  const barcodeCanReview = hasBarcodeCandidate || Boolean(barcodeDateCandidate);
  const barcodeScanIsPrimary = !barcode.trim() && !barcodeCanReview && !barcodeManualFallback;
  const barcodeSearchIsPrimary = Boolean(barcode.trim() && !barcodeCanReview && !barcodeManualFallback);
  const barcodeProductCandidateCount = barcodeLookup?.candidates.length ?? (!mealApi.isConfigured && barcodeResult === DEMO_BARCODE_FOUND_MESSAGE ? 1 : 0);
  const barcodeProductApplyIsPrimary = barcodeProductCandidateCount === 1;
  const barcodeDateApplyIsPrimary = Boolean(barcodeDateCandidate && barcodeProductCandidateCount === 0);
  const normalizedLabelProductName = normalizeFoodName(labelDetectedProductName);
  const labelQuantityAmount = Number.parseFloat(labelQuantity);
  const labelQuantityInvalid = labelQuantity.trim() === "" || !Number.isFinite(labelQuantityAmount) || labelQuantityAmount <= 0;
  const labelRecheckTargetFood = initialLabelTargetFoodId
    ? existingFoods.find((food) => food.id === initialLabelTargetFoodId)
    : undefined;
  const labelSelectedTargetFood = labelTargetFoodId
    ? existingFoods.find((food) => food.id === labelTargetFoodId)
    : undefined;
  const labelNameMatchesRecheckTarget = Boolean(
    labelRecheckTargetFood
    && normalizedLabelProductName
    && normalizeFoodName(labelRecheckTargetFood.name) === normalizedLabelProductName,
  );
  const labelRecheckMismatch = Boolean(initialLabelTargetFoodId && labelResult && !labelNameMatchesRecheckTarget);
  const labelRecheckMismatchTitle = labelRecheckTargetFood
    ? normalizedLabelProductName
      ? `읽은 상품명이 ${labelRecheckTargetFood.name}과 달라요.`
      : "라벨에서 상품명을 읽지 못했어요."
    : `${initialLabelTargetFoodName ?? "기존 식품"} 기록을 찾지 못했어요.`;
  const labelRecheckMismatchGuidance = labelRecheckTargetFood
    ? normalizedLabelProductName
      ? `포장지 상품명이 ${labelRecheckTargetFood.name}과 같은지 확인해 상품명 값을 바로잡아 주세요. 다른 식품이면 닫고 일반 라벨 입력에서 시작하세요.`
      : `${labelRecheckTargetFood.name}의 포장지인지 확인해 상품명을 입력해 주세요. 다른 식품이면 닫고 일반 라벨 입력에서 시작하세요.`
    : `${initialLabelTargetFoodName ?? "기존 식품"} 기록을 찾지 못해 저장하지 않았어요. 화면을 닫고 식품 목록을 다시 불러와 주세요.`;
  const labelTargetMatches = normalizedLabelProductName
    ? existingFoods.filter((food) => normalizeFoodName(food.name) === normalizedLabelProductName)
    : [];
  const labelTargetCandidates = initialLabelTargetFoodId
    ? labelTargetMatches.filter((food) => food.id === initialLabelTargetFoodId)
    : labelTargetMatches;
  const labelTargetSelectionStale = isStaleLabelLotTarget(labelLotAction, labelTargetFoodId, existingFoods);
  const labelTargetSelectionStaleGuidance = labelTargetCandidates.length
    ? "날짜는 저장하지 않았어요. 아래에서 현재 기록을 다시 선택해 주세요."
    : "날짜는 저장하지 않았어요. 화면을 닫고 식품 목록을 다시 불러와 주세요.";
  const labelActionDateSummary = isCompleteLabelDate(labelDetectedDate)
    ? labelDateKind
      ? `${labelDateKindChoiceLabel(labelDateKind)} · ${labelDetectedDate}`
      : `날짜 종류를 골라 주세요 · ${labelDetectedDate}`
    : "포장지 날짜를 입력해 주세요";
  const labelActionLotSummary = labelLotAction === "create"
    ? labelQuantityInvalid ? "새 식품 수량을 입력해 주세요" : `새 식품 ${labelQuantity.trim() || "1개"}`
    : labelTargetSelectionStale ? "기존 식품 다시 선택 필요"
      : labelSelectedTargetFood ? `기존 식품 ${labelSelectedTargetFood.quantity}` : "기존 식품 선택 필요";
  const labelActionStorageSummary = labelDetectedStorageLocationId
    ? storageLocations.find((location) => location.id === labelDetectedStorageLocationId)?.name ?? labelDetectedStorage ?? "보관 위치 선택"
    : labelDetectedStorage ?? "보관 위치 선택";
  const selectLabelTargetForName = (productName: string) => {
    const targetFood = initialLabelTargetFoodId
      ? existingFoods.find((food) => food.id === initialLabelTargetFoodId)
      : undefined;
    if (targetFood && normalizeFoodName(targetFood.name) === normalizeFoodName(productName)) {
      setLabelLotAction("correct");
      setLabelTargetFoodId(targetFood.id);
      setLabelLotDecisionMade(true);
      return;
    }
    setLabelLotAction("create");
    setLabelTargetFoodId(null);
    setLabelLotDecisionMade(!initialLabelTargetFoodId);
  };

  const replaceReceiptPreview = (file: File | null) => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
    }
    const nextUrl = file ? URL.createObjectURL(file) : null;
    receiptPreviewUrlRef.current = nextUrl;
    setReceiptPreviewUrl(nextUrl);
    setReceiptPreviewKind(file ? sourcePreviewKind(file) : null);
  };

  const replaceLabelPreview = (file: File | null) => {
    if (labelPreviewUrlRef.current) {
      URL.revokeObjectURL(labelPreviewUrlRef.current);
    }
    const nextUrl = file ? URL.createObjectURL(file) : null;
    labelPreviewUrlRef.current = nextUrl;
    setLabelPreviewUrl(nextUrl);
    setLabelSourceAspectRatio(null);
  };

  const resetReceiptSession = () => {
    receiptRequestGeneration.current += 1;
    receiptAbortController.current?.abort();
    receiptAbortController.current = null;
    replaceReceiptPreview(null);
    setReceiptStage("idle");
    setReceiptSource("샘플 영수증");
    setReceiptReviewObservations([]);
    setReceiptError("");
    setReceiptLines(initialReceiptLines);
    setSelectedReceiptIds(initialReceiptLines.map((line) => line.id));
    setReceiptReviewSessionState(createReceiptReviewSessionState(initialReceiptLines));
    setReceiptDraftId(undefined);
    setReceiptResumed(false);
    setReceiptTemplateId(null);
    setReceiptTemplateConfidence(null);
    setReceiptMerchantName(null);
    setReceiptQualityWarnings([]);
    setProductNameLookups({});
    setBarcodeLookups({});
    setProductEnrichmentJob(null);
    setProductEnrichmentError("");
  };

  useEffect(() => {
    if (reviewFixture) {
      receiptRequestGeneration.current += 1;
      receiptAbortController.current?.abort();
      receiptAbortController.current = null;
      if (receiptPreviewUrlRef.current) URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
      setReceiptStage("review");
      setReceiptSource(reviewFixture.source);
      setReceiptPreviewUrl(reviewFixture.sourcePreviewUrl);
      setReceiptPreviewKind(reviewFixture.sourcePreviewKind);
      setReceiptReviewObservations(reviewFixture.reviewObservations);
      setReceiptLines(reviewFixture.lines);
      setSelectedReceiptIds(reviewFixture.lines.map((line) => line.id));
      setReceiptReviewSessionState(createReceiptReviewSessionState(reviewFixture.lines));
      setReceiptDraftId(undefined);
      setReceiptResumed(false);
      setReceiptError("");
      setReceiptTemplateId(null);
      setReceiptTemplateConfidence(null);
      setReceiptMerchantName(reviewFixture.merchantName);
      setReceiptQualityWarnings([]);
      setProductNameLookups({});
      setBarcodeLookups({});
      setProductEnrichmentJob(null);
      setProductEnrichmentError("");
      return;
    }
    if (resumeReceiptId || !sessionKey) return;
    resetReceiptSession();
  }, [resumeReceiptId, reviewFixture, sessionKey]);

  useEffect(() => {
    if (!resumeReceiptId) {
      if (receiptResumeRequestKeyRef.current) receiptRequestGeneration.current += 1;
      receiptResumeRequestKeyRef.current = null;
      return;
    }
    if (mode !== "receipt" || !mealApi.isConfigured) return;
    const requestKey = `${sessionKey}:${resumeReceiptId}`;
    if (receiptResumeRequestKeyRef.current === requestKey) return;
    receiptResumeRequestKeyRef.current = requestKey;
    const requestGeneration = receiptRequestGeneration.current + 1;
    receiptRequestGeneration.current = requestGeneration;
    receiptAbortController.current?.abort();
    receiptAbortController.current = null;
    setReceiptStage("processing");
    setReceiptError("");
    setReceiptSource("이어서 확인할 영수증");
    setReceiptDraftId(resumeReceiptId);
    setReceiptResumed(false);
    setReceiptReviewObservations([]);
    setReceiptQualityWarnings([]);
    setReceiptReviewSessionState(createReceiptReviewSessionState(initialReceiptLines));
    void mealApi.getReceiptDraft(resumeReceiptId).then((draft) => {
      if (requestGeneration !== receiptRequestGeneration.current) return;
      if (!draft || draft.status !== "review_required" || draft.stock_created) {
        setReceiptError("이 영수증 확인을 이어갈 수 없어요. 영수증을 다시 선택해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      const mappedLines = mapReceiptDraftLines(draft, storageFromApi, imageForFoodName);
      if (!mappedLines.length) {
        setReceiptError("저장된 영수증에서 상품을 찾지 못했어요. 영수증을 다시 선택해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      setReceiptLines(mappedLines);
      setSelectedReceiptIds(mappedLines.map((line) => line.id));
      setReceiptReviewSessionState(createReceiptReviewSessionState(mappedLines));
      setReceiptSource(draft.source_filename?.trim() || "이어서 확인할 영수증");
      setReceiptDraftId(draft.id);
      setReceiptTemplateId(draft.template_id ?? null);
      setReceiptTemplateConfidence(draft.template_confidence ?? null);
      setReceiptMerchantName(draft.merchant_name ?? null);
      setReceiptStage("review");
      setReceiptResumed(true);
    }).catch(() => {
      if (requestGeneration !== receiptRequestGeneration.current) return;
      setReceiptError("저장된 영수증 확인 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setReceiptStage("unavailable");
    });
  }, [imageForFoodName, mode, resumeReceiptId, sessionKey, storageFromApi]);

  useEffect(() => () => {
    receiptRequestGeneration.current += 1;
    labelRequestGeneration.current += 1;
    barcodeLookupGeneration.current += 1;
    priorityInferenceGeneration.current += 1;
    receiptAbortController.current?.abort();
    labelAbortController.current?.abort();
    receiptAbortController.current = null;
    labelAbortController.current = null;
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
    if (labelPreviewUrlRef.current) {
      URL.revokeObjectURL(labelPreviewUrlRef.current);
      labelPreviewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (barcodeSessionKeyRef.current === sessionKey) return;
    barcodeSessionKeyRef.current = sessionKey;
    barcodeLookupGeneration.current += 1;
    setBarcode("");
    setBarcodeParse(null);
    setBarcodeLookup(null);
    setBarcodeResult(null);
    setBarcodeLookupLoading(false);
    setScannerOpen(false);
  }, [sessionKey]);

  const clearProductCandidate = () => {
    setProductBrand("직접 추가한 식품");
    setProductCategory("기타");
    setProductProvenance(undefined);
  };

  useEffect(() => {
    if (!receiptDraftId || receiptStage !== "review" || !mealApi.isConfigured || !productEnrichmentJob || !["queued", "in_flight"].includes(productEnrichmentJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const job = await mealApi.getProductEnrichmentJob(receiptDraftId);
        if (cancelled || !job) return;
        if (job.status === "succeeded") {
          const draft = await mealApi.getReceiptDraft(receiptDraftId);
          if (!cancelled && draft) {
            const refreshedLines = mapReceiptDraftLines(draft, storageFromApi, imageForFoodName);
            if (refreshedLines.length) setReceiptLines((current) => mergeReceiptDraftLines(current, refreshedLines));
          }
        }
        if (!cancelled) setProductEnrichmentJob(job);
      })().catch(() => {
        // A transient polling failure must not interrupt receipt review.
      });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [imageForFoodName, productEnrichmentJob?.status, receiptDraftId, receiptStage, storageFromApi]);

  useEffect(() => {
    if (!labelResult || mode !== "label") return;
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest(".label-result-fields")) return;
      const action = labelResultActionRef.current;
      const nextTarget = !labelDetectedProductName.trim()
        ? document.querySelector<HTMLElement>(".label-result-name-field input")
        : !labelDateKind
          ? document.querySelector<HTMLElement>('.label-date-kind-options [role="radio"]')
          : !isCompleteLabelDate(labelDetectedDate)
            ? document.querySelector<HTMLElement>(".label-result-date-field input")
            : !labelDetectedStorage
              ? document.querySelector<HTMLElement>(".label-result-card .storage-option")
              : document.querySelector<HTMLElement>(".label-result-provenance") ?? action;
      const block: ScrollLogicalPosition = nextTarget?.classList.contains("label-result-provenance") ? "start" : "center";
      const sheetContent = nextTarget?.closest<HTMLElement>(".sheet-content");
      if (sheetContent && nextTarget) {
        scrollTargetWithinContainer(sheetContent, nextTarget, block, getMobileScrollBehavior());
      } else {
        scrollTargetWithinNearestContainer(nextTarget, block, getMobileScrollBehavior());
      }
      nextTarget?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [labelResult, labelResultFocusRequest, mode]);

  useEffect(() => {
    if (mode !== "label" || !labelError || labelResult) return;
    // A native file picker can restore focus after the change handler. Wait
    // for that return before moving focus from the hidden file input to the
    // visible recovery action.
    const timer = window.setTimeout(() => {
      const action = labelErrorActionRef.current;
      if (!action) return;
      const recoveryPanel = action.closest<HTMLElement>(".label-result-error-callout") ?? action;
      scrollTargetWithinNearestContainer(recoveryPanel, "center", getMobileScrollBehavior());
      action.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [labelError, labelResult, mode]);

  useEffect(() => {
    if (mode !== "barcode" || !hasBarcodeCandidate) return;
    const frame = window.requestAnimationFrame(() => {
      const action = barcodeCandidateActionRef.current;
      scrollTargetWithinNearestContainer(action, "center", getMobileScrollBehavior());
      action?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [barcodeLookup, barcodeResult, hasBarcodeCandidate, mode]);

  useEffect(() => {
    if (mode !== "barcode" || !barcodeManualFallback) return;
    const frame = window.requestAnimationFrame(() => {
      const action = barcodeManualFallbackActionRef.current;
      if (!action) return;
      scrollTargetWithinNearestContainer(action, "center", getMobileScrollBehavior());
      action.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [barcodeManualFallback, barcodeResult, mode]);

  useEffect(() => {
    if (sessionKey == null || receiptStage !== "idle") return;
    if (initialModeFocusSessionRef.current === sessionKey && initialModeFocusHandledRef.current) return;
    initialModeFocusSessionRef.current = sessionKey;
    initialModeFocusHandledRef.current = false;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`#add-mode-tab-${mode}`);
      if (!target || target.hasAttribute("disabled")) return;
      target.focus({ preventScroll: true });
      initialModeFocusHandledRef.current = true;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [mode, receiptStage, sessionKey]);

  useEffect(() => {
    if (!priorityInference) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTargetWithinNearestContainer(priorityInferenceRef.current, "nearest", getMobileScrollBehavior());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [priorityInference]);

  const resetAddSheetScroll = () => {
    window.requestAnimationFrame(() => {
      const scrollContainer = addSheetContentRef.current?.closest<HTMLElement>(".sheet-content");
      if (scrollContainer) scrollContainer.scrollTop = 0;
    });
  };

  const switchMode = (nextMode: AddMode) => {
    const preserveReceiptResumeRequest = Boolean(resumeReceiptId && receiptStage === "processing");
    const preserveReceiptSession = receiptStage === "review" || preserveReceiptResumeRequest;
    const preserveLabelReview = labelResult && !labelProcessing;
    keyboard.hide();
    if (!preserveReceiptResumeRequest) receiptRequestGeneration.current += 1;
    labelRequestGeneration.current += 1;
    if (!preserveReceiptResumeRequest) receiptAbortController.current?.abort();
    labelAbortController.current?.abort();
    if (!preserveReceiptResumeRequest) receiptAbortController.current = null;
    labelAbortController.current = null;
    setCameraTarget(null);
    onModeChange(nextMode);
    resetAddSheetScroll();
    setScannerOpen(false);
    if (!preserveLabelReview) {
      setLabelResult(false);
      setLabelSampleApplied(false);
      setLabelDetectedDate("2026.09.02");
      setLabelDateKind("use_by");
      setLabelDetectedProductName("시금치");
      setLabelDetectedStorage(null);
      setLabelDetectedStorageLocationId(null);
      setLabelStorageHint(undefined);
      setLabelDetectedStorageConditionText(undefined);
      setLabelError("");
      setLabelProcessing(false);
      replaceLabelPreview(null);
      setLabelReviewObservations([]);
      setLabelDateObservationIds([]);
      setLabelLotAction("create");
      setLabelTargetFoodId(null);
    }
    if (!preserveReceiptSession) {
      setReceiptStage("idle");
      replaceReceiptPreview(null);
      setReceiptReviewObservations([]);
      setReceiptError("");
      setReceiptLines(initialReceiptLines);
      setSelectedReceiptIds(initialReceiptLines.map((line) => line.id));
      setReceiptReviewSessionState(createReceiptReviewSessionState(initialReceiptLines));
      setReceiptDraftId(undefined);
      setReceiptResumed(false);
      setReceiptTemplateId(null);
      setReceiptTemplateConfidence(null);
      setReceiptMerchantName(null);
      setReceiptQualityWarnings([]);
      setProductNameLookups({});
      setBarcodeLookups({});
      setProductEnrichmentJob(null);
      setProductEnrichmentError("");
    }
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    // Tab changes are not a new intake: keep the unsaved manual draft and its provenance.
  };

  const modeTabOrder: AddMode[] = ["receipt", "barcode", "label", "manual"];
  const focusModeTab = (nextMode: AddMode) => {
    switchMode(nextMode);
    window.requestAnimationFrame(() => modeTabRefs.current[nextMode]?.focus());
  };
  const handleModeTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = modeTabOrder.indexOf(mode);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % modeTabOrder.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + modeTabOrder.length) % modeTabOrder.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = modeTabOrder.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    focusModeTab(modeTabOrder[nextIndex]);
  };

  const handleReceiptFile = async (file: File) => {
    const requestGeneration = receiptRequestGeneration.current + 1;
    receiptRequestGeneration.current = requestGeneration;
    receiptAbortController.current?.abort();
    const abortController = new AbortController();
    receiptAbortController.current = abortController;
    keyboard.hide();
    setReceiptReviewSessionState(createReceiptReviewSessionState(initialReceiptLines));
    replaceReceiptPreview(file);
    setReceiptReviewObservations([]);
    setReceiptSource(file.name);
    setReceiptResumed(false);
    setReceiptError("");
    setReceiptTemplateId(null);
    setReceiptTemplateConfidence(null);
    setReceiptMerchantName(null);
    setBarcodeLookups({});
    if (!mealApi.isConfigured) {
      setReceiptLines(initialReceiptLines);
      setSelectedReceiptIds(initialReceiptLines.map((line) => line.id));
      setReceiptReviewSessionState(createReceiptReviewSessionState(initialReceiptLines));
      setReceiptStage("review");
      receiptAbortController.current = null;
      return;
    }
    setReceiptStage("processing");
    try {
      const intake = await mealApi.intakeReceipt(file, abortController.signal);
      if (abortController.signal.aborted || requestGeneration !== receiptRequestGeneration.current) return;
      if (!intake || intake.status !== "review_required" || !intake.draft) {
        setReceiptError(intake?.message ?? "사진 인식 응답이 없어요.");
        setReceiptStage("unavailable");
        return;
      }
      const mappedLines = mapReceiptDraftLines(intake.draft, storageFromApi, imageForFoodName);
      if (!mappedLines.length) {
        setReceiptError("상품 항목을 찾지 못했습니다. 사진을 다시 촬영해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      setReceiptLines(mappedLines);
      setSelectedReceiptIds(mappedLines.map((line) => line.id));
      setReceiptReviewSessionState(createReceiptReviewSessionState(mappedLines));
      setProductNameLookups({});
      setBarcodeLookups({});
      setProductEnrichmentJob(null);
      setProductEnrichmentError("");
      setReceiptDraftId(intake.draft.id);
      setReceiptTemplateId(intake.draft.template_id ?? null);
      setReceiptTemplateConfidence(intake.draft.template_confidence ?? null);
      setReceiptMerchantName(intake.draft.merchant_name ?? null);
      setReceiptQualityWarnings(intake.quality.warnings);
      setReceiptReviewObservations(intake.review_observations ?? []);
      setReceiptStage("review");
    } catch (reason) {
      if (abortController.signal.aborted || requestGeneration !== receiptRequestGeneration.current) return;
      setReceiptError(isMealApiReceiptDraftPersistenceError(reason)
        ? "영수증 확인 내용을 저장하지 못했어요. 같은 사진을 다시 선택해 주세요."
        : "파일을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setReceiptStage("unavailable");
    } finally {
      if (receiptAbortController.current === abortController) receiptAbortController.current = null;
    }
  };

  const lookupReceiptProductName = async (line: ReceiptLine) => {
    const query = line.name.trim();
    if (!query || !mealApi.isConfigured) return;
    setProductNameLookups((current) => ({ ...current, [line.id]: "loading" }));
    try {
      const result = await mealApi.resolveProductName(query);
      setProductNameLookups((current) => ({
        ...current,
        [line.id]: result ?? {
          query,
          provider: "mfds_i1250",
          status: "unavailable",
          candidates: [],
          warnings: ["상품 정보를 불러오지 못했어요."],
          requires_review: true,
        },
      }));
    } catch {
      setProductNameLookups((current) => ({
        ...current,
        [line.id]: {
          query,
          provider: "mfds_i1250",
          status: "unavailable",
          candidates: [],
          warnings: ["상품 정보를 확인하지 못했어요."],
          requires_review: true,
        },
      }));
    }
  };

  const lookupReceiptBarcode = async (line: ReceiptLine) => {
    const value = line.barcode?.trim();
    if (!value || !mealApi.isConfigured) return;
    setBarcodeLookups((current) => ({ ...current, [line.id]: "loading" }));
    try {
      const result = await mealApi.resolveProduct(value);
      setBarcodeLookups((current) => ({
        ...current,
        [line.id]: result ?? {
          barcode: value,
          status: "provider_unavailable",
          candidates: [],
          warnings: ["바코드로 상품 정보를 불러오지 못했어요."],
          requires_review: true,
          provider_statuses: {},
        },
      }));
    } catch {
      setBarcodeLookups((current) => ({
        ...current,
        [line.id]: {
          barcode: value,
          status: "provider_unavailable",
          candidates: [],
          warnings: ["바코드로 상품 정보를 확인하지 못했어요."],
          requires_review: true,
          provider_statuses: {},
        },
      }));
    }
  };

  const applyReceiptProductCandidate = (lineId: string, candidate: ApiProductNameLookup["candidates"][number]) => {
    setReceiptLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      name: candidate.canonical_name,
      storage: candidate.storage_hint ? storageFromApi(candidate.storage_hint) : line.storage,
      storageLocationId: candidate.storage_hint ? null : line.storageLocationId,
      confidence: candidate.confidence,
      requiresReview: true,
      matchSource: candidate.source === "open_food_facts" ? "open_food_facts" : "mfds_i1250",
      matchCandidates: [{
        source: candidate.source === "open_food_facts" ? "open_food_facts" : "mfds_i1250",
        source_url: candidate.source_url,
        canonical_name: candidate.canonical_name,
        confidence: candidate.confidence,
        provenance_note: candidate.provenance_note,
        shelf_life_text: candidate.shelf_life_text,
        storage_hint: candidate.storage_hint,
        source_freshness: candidate.source_freshness,
      }],
    } : line));
    setProductNameLookups((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  };

  const applyReceiptMatchCandidate = (lineId: string, candidate: NonNullable<ReceiptLine["matchCandidates"]>[number]) => {
    setReceiptLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      name: candidate.canonical_name,
      storage: candidate.storage_hint ? storageFromApi(candidate.storage_hint) : line.storage,
      storageLocationId: candidate.storage_hint ? null : line.storageLocationId,
      confidence: candidate.confidence,
      requiresReview: true,
      matchSource: candidate.source,
      matchCandidates: [candidate],
    } : line));
  };

  const applyReceiptBarcodeCandidate = (lineId: string, candidate: ApiProductLookup["candidates"][number]) => {
    setReceiptLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      name: candidate.canonical_name,
      storage: candidate.storage_hint ? storageFromApi(candidate.storage_hint) : line.storage,
      storageLocationId: candidate.storage_hint ? null : line.storageLocationId,
      confidence: candidate.confidence,
      requiresReview: true,
      matchSource: candidate.source,
      matchCandidates: [candidate],
    } : line));
    setBarcodeLookups((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  };

  const enqueueReceiptProductEnrichment = async () => {
    if (!receiptDraftId || !mealApi.isConfigured) return;
    setProductEnrichmentError("");
    try {
      const job = await mealApi.enqueueProductEnrichment(receiptDraftId);
      if (!job) {
        setProductEnrichmentError("상품 정보 확인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setProductEnrichmentJob(job);
      if (job.status === "succeeded") {
        const draft = await mealApi.getReceiptDraft(receiptDraftId);
        if (draft) {
          const refreshedLines = mapReceiptDraftLines(draft, storageFromApi, imageForFoodName);
          if (refreshedLines.length) setReceiptLines((current) => mergeReceiptDraftLines(current, refreshedLines));
        }
      }
    } catch (reason) {
      setProductEnrichmentError(isMealApiProductEnrichmentPersistenceError(reason)
        ? "상품 정보 확인 내용을 저장하지 못했어요. 기존 내용을 유지했어요."
        : "상품 정보 확인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const retryReceiptProductEnrichment = async () => {
    if (!receiptDraftId || !mealApi.isConfigured) return;
    setProductEnrichmentError("");
    try {
      const job = await mealApi.retryProductEnrichment(receiptDraftId);
      if (!job) {
        setProductEnrichmentError("상품 정보 확인을 다시 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setProductEnrichmentJob(job);
    } catch (reason) {
      setProductEnrichmentError(isMealApiProductEnrichmentPersistenceError(reason)
        ? "상품 정보 확인 재시작을 저장하지 못했어요. 기존 작업 상태를 유지했어요."
        : "상품 정보 확인을 다시 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const updateBarcodeInput = (value: string) => {
    barcodeLookupGeneration.current += 1;
    setBarcode(value);
    setBarcodeLookupLoading(false);
    setBarcodeResult(null);
    setBarcodeParse(null);
    setBarcodeLookup(null);
  };

  const lookupBarcode = async (input: string) => {
    const rawBarcode = input.trim();
    const requestGeneration = barcodeLookupGeneration.current + 1;
    barcodeLookupGeneration.current = requestGeneration;
    setBarcodeLookupLoading(true);
    setBarcodeResult(rawBarcode ? "바코드 형식을 확인하고 있어요" : demoInputsAvailable ? "예시 바코드를 입력하면 상품 정보를 보여드려요" : "바코드 숫자를 입력해 주세요");
    setBarcodeParse(null);
    setBarcodeLookup(null);
    keyboard.hide();
    if (!rawBarcode) {
      setBarcodeLookupLoading(false);
      return;
    }
    if (!mealApi.isConfigured) {
      setBarcodeResult(rawBarcode === DEMO_BARCODE ? DEMO_BARCODE_FOUND_MESSAGE : DEMO_BARCODE_UNAVAILABLE_MESSAGE);
      setBarcodeLookupLoading(false);
      return;
    }
    try {
      const parsed = await mealApi.parseBarcode(rawBarcode);
      if (requestGeneration !== barcodeLookupGeneration.current) return;
      if (!parsed) {
        setBarcodeResult("바코드 형식을 확인하지 못했어요. 숫자를 다시 확인해 주세요.");
        return;
      }
      const dateCandidate = parsed.date_assertions[0] ?? null;
      setBarcodeParse(parsed);
      if (dateCandidate) {
        setBarcodeResult(`바코드에서 읽은 날짜 · ${dateCandidate.value.replaceAll("-", ".")} · 포장지와 비교해 주세요`);
      }
      if (parsed.barcode_type === "restricted_circulation") {
        setBarcodeResult("매장용 바코드일 수 있어요. 상품명과 중량을 확인해 주세요.");
        return;
      }
      const lookup = await mealApi.resolveProduct(parsed.gtin ?? rawBarcode);
      if (requestGeneration !== barcodeLookupGeneration.current) return;
      setBarcodeLookup(lookup ?? null);
      const candidate = lookup?.candidates[0];
      if (candidate) {
        const candidateCountLabel = `상품 정보 ${lookup?.candidates.length ?? 1}개를 찾았어요.`;
        setBarcodeResult(dateCandidate ? `${candidateCountLabel} · 포장지 날짜를 살펴봐 주세요` : candidateCountLabel);
      } else if (!dateCandidate) {
        setBarcodeResult(normalizeKnownProductWarning(lookup?.warnings[0] ?? parsed.warnings[0] ?? "상품 정보를 찾지 못했어요"));
      }
    } catch {
      if (requestGeneration !== barcodeLookupGeneration.current) return;
      setBarcodeLookup(null);
      setBarcodeResult("바코드로 상품 정보를 확인하지 못했어요. 포장지에서 상품 정보를 확인해 주세요.");
    } finally {
      if (requestGeneration === barcodeLookupGeneration.current) setBarcodeLookupLoading(false);
    }
  };

  const applyBarcodeCandidate = (candidate: NonNullable<ApiProductLookup["candidates"]>[number]) => {
    priorityInferenceGeneration.current += 1;
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    setFoodName(candidate.canonical_name);
    if (candidate.storage_hint) {
      setStorage(storageFromApi(candidate.storage_hint));
      setStorageLocationId(null);
    }
    setProductBrand(candidate.brand?.trim() || "");
    setProductCategory(candidate.category?.trim() || "기타");
    setProductProvenance(productProvenanceFromCandidate(candidate));
    setBarcodeLookup(null);
    setBarcodeResult(null);
    keyboard.hide();
    onModeChange("manual");
    resetAddSheetScroll();
  };

  const applyDemoBarcodeCandidate = () => {
    priorityInferenceGeneration.current += 1;
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    setFoodName("국산콩 두부");
    setStorage("냉장");
    setStorageLocationId(null);
    setProductBrand("풀무원");
    setProductCategory("두부");
    setProductProvenance({ source: "local_fixture", confidence: 0.95, note: "샘플 상품 정보예요. 개별 포장지와 날짜를 확인해 주세요.", storageHint: "refrigerated", sourceFreshness: "current" });
    setBarcodeLookup(null);
    setBarcodeResult(null);
    keyboard.hide();
    onModeChange("manual");
    resetAddSheetScroll();
  };

  const applyBarcodeDateCandidate = () => {
    if (!barcodeDateCandidate) return;
    priorityInferenceGeneration.current += 1;
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    const product = barcodeLookup?.candidates[0];
    if (product) {
      setFoodName(product.canonical_name);
      if (product.storage_hint) {
        setStorage(storageFromApi(product.storage_hint));
        setStorageLocationId(null);
      }
    setProductBrand(product.brand?.trim() || "");
      setProductCategory(product.category?.trim() || "기타");
      setProductProvenance(productProvenanceFromCandidate(product));
    }
    setBarcodeLookup(null);
    setBarcodeResult(null);
    keyboard.hide();
    onModeChange("manual");
    resetAddSheetScroll();
  };

  const applyLabelSample = () => {
    keyboard.hide();
    replaceLabelPreview(null);
    setLabelSampleApplied(true);
    setLabelReviewObservations([]);
    setLabelDateObservationIds([]);
    setLabelError("");
    setLabelDetectedDate("2026.09.02");
    setLabelDateKind("use_by");
    setLabelDetectedProductName("시금치");
    setLabelQuantity("1개");
    setLabelQuantityEdited(false);
    selectLabelTargetForName("시금치");
    setLabelDetectedStorage("냉장");
    setLabelDetectedStorageLocationId(null);
    setLabelStorageHint("refrigerated");
    setLabelDetectedStorageConditionText("냉장 보관");
    setLabelResult(true);
    setLabelResultFocusRequest((current) => current + 1);
  };

  const handleLabelFile = async (file: File) => {
    const requestGeneration = labelRequestGeneration.current + 1;
    labelRequestGeneration.current = requestGeneration;
    labelAbortController.current?.abort();
    const abortController = new AbortController();
    labelAbortController.current = abortController;
    keyboard.hide();
    replaceLabelPreview(file);
    setLabelSampleApplied(false);
    setLabelReviewObservations([]);
    setLabelDateObservationIds([]);
    setLabelDetectedStorageConditionText(undefined);
    setLabelError("");
    setLabelResult(false);
    setLabelDateKind(null);
    setLabelDetectedProductName("");
    setLabelQuantity("1개");
    setLabelQuantityEdited(false);
    setLabelDetectedStorage(null);
    setLabelDetectedStorageLocationId(null);
    setLabelStorageHint(undefined);
    setLabelLotAction("create");
    setLabelTargetFoodId(null);
    setLabelLotDecisionMade(!initialLabelTargetFoodId);
    if (!mealApi.isConfigured) {
      setLabelResult(false);
      setLabelError("포장지 사진을 읽지 못했어요. 직접 입력으로 기록할 수 있어요.");
      labelAbortController.current = null;
      return;
    }
    setLabelProcessing(true);
    try {
      const intake = await mealApi.intakeLabel(file, abortController.signal);
      if (abortController.signal.aborted || requestGeneration !== labelRequestGeneration.current) return;
      const dateCandidate = intake?.consumption_date_candidate ?? intake?.date_candidates.find((candidate) => Boolean(candidate.value));
      const candidateKind = dateCandidate ? normalizeLabelDateKind(dateCandidate.kind) : null;
      setLabelReviewObservations(intake?.review_observations ?? []);
      setLabelDateObservationIds(dateCandidate?.source_observation_ids ?? []);
      if (!intake || intake.status === "needs_ocr_engine" || intake.status === "failed") {
        setLabelError(normalizeKnownProductWarning(intake?.warnings?.[0] ?? "날짜를 확인하지 못했어요. 포장지의 다른 면을 촬영해 주세요."));
        setLabelResult(false);
        return;
      }
      const recognizedProductName = intake.product_name?.trim() || "";
      setLabelDetectedProductName(recognizedProductName);
      selectLabelTargetForName(recognizedProductName);
      const storageHint = intake.storage_hint === "ambient" || intake.storage_hint === "refrigerated" || intake.storage_hint === "frozen" ? intake.storage_hint : undefined;
      setLabelStorageHint(storageHint);
      setLabelDetectedStorageLocationId(null);
      if (intake.storage_hint === "ambient") setLabelDetectedStorage("실온");
      if (intake.storage_hint === "refrigerated") setLabelDetectedStorage("냉장");
      if (intake.storage_hint === "frozen") setLabelDetectedStorage("냉동");
      if (!storageHint) setLabelDetectedStorage(null);
      setLabelDetectedStorageConditionText(intake.storage_condition_text ?? undefined);
      if (!dateCandidate) {
        setLabelError(normalizeKnownProductWarning(intake.warnings?.[0] ?? "날짜를 확인하지 못했어요. 포장지의 다른 면을 촬영해 주세요."));
        setLabelResult(false);
        return;
      }
      setLabelDetectedDate(dateCandidate.value.replaceAll("-", "."));
      setLabelDateKind(candidateKind);
      setLabelError(normalizeKnownProductWarning(candidateKind ? (intake.warnings?.[0] ?? "") : (intake.warnings?.[0] ?? "날짜 숫자는 읽었지만 의미를 확인하지 못했어요. 포장지에서 날짜 종류를 확인해 주세요.")));
      setLabelResult(true);
      setLabelResultFocusRequest((current) => current + 1);
    } catch {
      if (abortController.signal.aborted || requestGeneration !== labelRequestGeneration.current) return;
      setLabelError("사진을 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
      setLabelResult(false);
    } finally {
      if (labelAbortController.current === abortController) labelAbortController.current = null;
      if (!abortController.signal.aborted && requestGeneration === labelRequestGeneration.current) setLabelProcessing(false);
    }
  };

  const submitLabel = () => {
    if (labelSubmitting || !labelLotDecisionMade) return;
    const normalizedName = labelDetectedProductName.trim();
    if (!labelDateKind || !labelDetectedStorage || !normalizedName || !isCompleteLabelDate(labelDetectedDate)) return;
    if (labelLotAction === "create" && labelQuantityInvalid) return;
    if (labelLotAction === "correct" && (!labelTargetFoodId || labelTargetSelectionStale || !labelSelectedTargetFood)) return;
    const quantityToSave = labelLotAction === "correct" ? labelSelectedTargetFood?.quantity : labelQuantity.trim();
    if (!quantityToSave) return;
    keyboard.hide();
    setLabelSubmitting(true);
    onAddManual(createFood({
      lotAction: labelLotAction,
      targetFoodId: labelLotAction === "correct" ? labelTargetFoodId ?? undefined : undefined,
      name: normalizedName,
      brand: "",
      quantity: quantityToSave,
      storage: labelDetectedStorage,
      storageLocationId: labelDetectedStorageLocationId ?? undefined,
      storageLocationName: labelDetectedStorageLocationId ? storageLocations.find((location) => location.id === labelDetectedStorageLocationId)?.name : undefined,
      dateLabel: formatApiDate(labelDetectedDate.replaceAll(".", "-")),
      dateDetail: labelDetectedDate,
      dateKind: "actual_printed",
      dateAssertionKind: labelDateKind,
      dateStorageHint: labelStorageHint,
      dateStorageConditionText: labelDetectedStorageConditionText,
      dateSource: "label_ocr",
      image: imageForFoodName(normalizedName),
      category: "기타",
      note: `${labelDateKindChoiceLabel(labelDateKind)}를 포장지에서 확인했어요.`,
    }));
  };

  const continueWithManual = () => {
    const normalizedName = labelDetectedProductName.trim();
    if (normalizedName) setFoodName(normalizedName);
    if (labelDetectedStorage) {
      setStorage(labelDetectedStorage);
      setStorageLocationId(labelDetectedStorageLocationId);
    }
    switchMode("manual");
  };

  const changeManualFoodName = (name: string) => {
    setFoodName(name);
    priorityInferenceGeneration.current += 1;
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    clearProductCandidate();
  };

  const submitManual = () => {
    const normalizedName = foodName.trim();
    if (!normalizedName || manualQuantityInvalid) return;
    const dateCandidate = barcodeDateCandidate;
    keyboard.hide();
    onAddManual(createFood({
      name: normalizedName,
      quantity: quantity.trim(),
      storage,
      storageLocationId: storageLocationId ?? undefined,
      storageLocationName: storageLocationId ? storageLocations.find((location) => location.id === storageLocationId)?.name : undefined,
      brand: productBrand,
      category: productCategory,
      productProvenance,
      dateLabel: dateCandidate ? formatApiDate(dateCandidate.value) : "날짜 미확인",
      dateDetail: dateCandidate ? `${barcodeDateKindLabel(dateCandidate.kind)} ${dateCandidate.value.replaceAll("-", ".")}` : "포장지 날짜를 살펴봐 주세요",
      dateKind: dateCandidate ? "actual_printed" : "unknown",
      dateAssertionKind: dateCandidate?.kind,
      dateSource: dateCandidate ? `gs1:${barcodeParse?.lot ?? ""}` : "사용자 입력",
      note: dateCandidate ? "바코드에서 읽은 날짜를 기록했어요. 포장지와 해당 식품의 날짜를 확인해 주세요." : "실제 소비기한이 아니라 먼저 확인할 순서예요. 표시 날짜를 확인하면 직접 갱신할 수 있어요.",
      barcode: (barcodeParse?.gtin ?? barcode.trim()) || undefined,
      barcodeLot: barcodeParse?.lot ?? undefined,
    }));
  };

  const requestPriorityInference = async () => {
    const normalizedName = foodName.trim();
    if (!normalizedName || !mealApi.isConfigured) return;
    const generation = priorityInferenceGeneration.current + 1;
    priorityInferenceGeneration.current = generation;
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(true);
    try {
      const result = await mealApi.inferPriority({ product_name: normalizedName, storage_type: storageCodeFromUi(storage) });
      if (generation !== priorityInferenceGeneration.current) return;
      setPriorityInference(result);
    } catch {
      if (generation !== priorityInferenceGeneration.current) return;
      setPriorityInferenceError("먼저 살펴볼 순서를 정하지 못했어요. 포장지 날짜를 확인해 주세요.");
    } finally {
      if (generation === priorityInferenceGeneration.current) setPriorityInferenceLoading(false);
    }
  };

  const submitReceipt = () => {
    keyboard.hide();
    onAddReceipt({
      lines: receiptLines.filter((line) => selectedReceiptIds.includes(line.id)),
      draftId: receiptDraftId,
      sourceFilename: receiptSource,
    });
  };

  const manualBrandSummary = productProvenance
    ? productBrand ? ` · 브랜드 ${productBrand}` : ""
    : "";
  const manualDateSummary = barcodeDateCandidate
    ? ` · ${barcodeDateKindLabel(barcodeDateCandidate.kind)} ${barcodeDateCandidate.value.replaceAll("-", ".")}`
    : "";
  const manualQuantity = parseManualQuantity(quantity);
  const manualQuantityInvalid = manualQuantity === null;
  const manualNameSuggestions = productProvenance || barcodeDateCandidate
    ? []
    : getManualFoodNameSuggestions(existingFoods, foodName);
  const intakeStep = mode === "receipt"
    ? receiptStage === "review" ? 2 : 1
    : mode === "barcode" ? barcodeCanReview ? 2 : 1
      : mode === "label" ? labelResult ? 2 : 1
        : 1;
  const intakeStepTitle = mode === "receipt"
    ? receiptStage === "review" ? "영수증 항목을 살펴봐요" : receiptStage === "unavailable" ? "영수증을 다시 선택해요" : "영수증 사진을 선택해요"
    : mode === "barcode" ? barcodeManualFallback ? "상품을 찾지 못했어요" : hasBarcodeCandidate ? "찾은 상품 정보를 살펴봐요" : barcodeDateCandidate ? "바코드에서 읽은 날짜를 살펴봐요" : "바코드를 입력하거나 스캔해요"
      : mode === "label" ? labelResult ? "날짜와 보관 방법을 살펴봐요" : "날짜가 보이는 면을 선택해요"
        : productProvenance ? "상품명과 보관 방법을 살펴봐요" : priorityInference ? "먼저 살펴볼 시점을 보여줘요" : "이름과 보관 위치를 입력해요";
  const intakeStepDetail = mode === "receipt"
    ? receiptStage === "review"
      ? "필요한 항목만 골라 식품 목록에 추가해요."
      : "사진은 저장하지 않아요. 목록에 담을 식품만 골라요."
    : mode === "label"
      ? labelResult
        ? "날짜 종류와 보관 위치를 살펴본 뒤 저장해 주세요."
        : "날짜 종류와 보관 방법을 포장지에서 확인해요."
      : mode === "barcode"
        ? barcodeManualFallback
          ? "바코드 숫자를 다시 살펴보거나 다른 방법으로 추가해요."
          : barcodeDateCandidate
            ? "읽은 날짜와 식품이 맞는지 포장지에서 살펴봐 주세요."
            : barcodeCanReview
              ? "찾은 상품명과 보관 위치를 살펴봐 주세요."
              : "찾은 상품명과 보관 방법을 확인해 식품 목록에 담아요."
        : mode === "manual" && productProvenance
          ? "바코드에서 찾은 상품 정보예요. 이름·수량·보관 위치를 살펴봐 주세요."
          : mode === "manual" && priorityInference
            ? "입력한 내용은 참고용이에요. 소비기한이나 먹어도 되는지를 알려주지 않아요."
            : "살펴본 내용만 식품 기록에 저장돼요.";
  const intakeStepNames = ["입력", "살펴보기", "저장"] as const;
  const barcodeResultCallout = barcodeResult ? (
    <div className={`result-callout ${barcodeLookup?.status === "provider_unavailable" || barcodeManualFallback ? "result-callout-warning" : ""} ${barcodeManualFallback ? "result-callout-manual-fallback" : ""}`} role="status" aria-live="polite" aria-busy={barcodeLookupLoading}>
      {barcodeManualFallback ? <InfoCircledIcon width={17} height={17} /> : <CheckCircledIcon width={17} height={17} />}
      <span><strong>{hasBarcodeCandidate ? `상품 정보 ${barcodeLookup?.candidates.length ?? 1}개를 찾았어요.` : barcodeResult}</strong>{hasBarcodeCandidate ? null : <small id={barcodeManualFallback ? "barcode-manual-fallback-hint" : undefined}>{barcodeDemoUnavailable ? "다른 식품은 이름으로 직접 입력해 주세요." : barcodeManualFallback ? "상품명을 직접 입력할 수 있어요." : "소비기한은 포장지의 날짜를 촬영해 확인해 주세요."}</small>}</span>
      {barcodeManualFallback ? <button ref={barcodeManualFallbackActionRef} className="result-callout-action" type="button" aria-describedby="barcode-manual-fallback-hint" onPointerDown={(event) => event.preventDefault()} onClick={() => switchMode("manual")}>직접 입력으로 계속</button> : null}
    </div>
  ) : null;

  return (
    <div ref={addSheetContentRef} className={`add-sheet-content${initialLabelTargetFoodId ? " add-sheet-content-date-recheck" : ""}`}>
      {initialLabelTargetFoodId && initialLabelTargetDateSummary && mode === "label" ? <div className="date-recheck-current-date" role="group" aria-label={`현재 기록된 날짜 ${initialLabelTargetDateSummary}`}><span>현재 기록</span><strong>{initialLabelTargetDateSummary}</strong></div> : null}
      <div className="mode-tabs" role="tablist" aria-label="식품 추가 방법">
        {([
          ["receipt", "영수증", FileTextIcon, "여러 식품"],
          ["barcode", "바코드", CameraIcon, "상품 찾기"],
          ["label", "라벨", CalendarIcon, "날짜 읽기"],
          ["manual", "직접 입력", PlusIcon, "이름 입력"],
        ] as const).map(([tabMode, label, Icon, purpose]) => {
          const recommendForCurrentTask = initialLabelTargetFoodId ? tabMode === "label" : tabMode === "receipt";
          return <button
            key={tabMode}
            ref={(element) => { modeTabRefs.current[tabMode] = element; }}
            id={`add-mode-tab-${tabMode}`}
            className={`mode-tab ${mode === tabMode ? "mode-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-label={recommendForCurrentTask ? `${label}, 추천` : undefined}
            aria-selected={mode === tabMode}
            aria-controls={`add-mode-panel-${tabMode}`}
            tabIndex={mode === tabMode ? 0 : -1}
            onPointerDown={(event) => event.preventDefault()}
            onKeyDown={handleModeTabKeyDown}
            onClick={() => focusModeTab(tabMode)}
          >
            <Icon width={16} height={16} /><span>{label}</span><small className="mode-tab-purpose" aria-hidden="true">{purpose}</small>{recommendForCurrentTask ? <span className="mode-tab-recommendation" aria-hidden="true">추천</span> : null}
          </button>
        })}
      </div>
      {initialLabelTargetFoodId && initialLabelTargetFoodName && mode !== "label" ? <div className="date-recheck-context" role="status" aria-live="polite" aria-atomic="true"><InfoCircledIcon width={16} height={16} /><span><strong>기존 {initialLabelTargetFoodName} 날짜는 그대로예요</strong>{initialLabelTargetDateSummary ? <small className="date-recheck-saved-date"><MetadataText text={<>현재 기록 · {initialLabelTargetDateSummary}</>} /></small> : null}<small>다른 입력 방식은 새 식품을 추가해요. 기존 날짜를 확인하려면 라벨로 돌아가세요.</small></span><button type="button" onClick={() => switchMode("label")}>라벨 날짜 확인으로 돌아가기</button></div> : null}
      {!cameraTarget && mode !== "manual" ? <div className={`intake-flow-rail intake-flow-step-${intakeStep}`} role="group" aria-label={`${initialLabelTargetFoodId ? "날짜 확인" : "식품 추가"} ${intakeStep}단계`}>
        <div className="intake-flow-rail-heading" aria-live="polite" aria-atomic="true"><span><strong>{intakeStepTitle}</strong><small>{intakeStepDetail}</small></span>{!(initialLabelTargetFoodId && mode === "label") ? <em>{intakeStep}/3</em> : null}</div>
        <ol>
          {intakeStepNames.map((label, index) => {
            const step = index + 1;
            return <li className={step === intakeStep ? "intake-flow-step-active" : step < intakeStep ? "intake-flow-step-complete" : ""} aria-current={step === intakeStep ? "step" : undefined} key={label}><span>{step}</span><small>{label}</small></li>;
          })}
        </ol>
      </div> : null}

      <div className="mode-tabpanel" id={`add-mode-panel-${mode}`} role="tabpanel" aria-labelledby={`add-mode-tab-${mode}`} tabIndex={initialLabelTargetFoodId && mode === "label" ? -1 : 0}>
      {mode === "receipt" ? (
        cameraTarget === "receipt" ? (
          <CameraCapture title="영수증" detail="영수증 전체가 보이도록 맞춰 주세요." onFile={(file) => { setCameraTarget(null); void handleReceiptFile(file); }} onCancel={() => setCameraTarget(null)} />
        ) : (
          <>
            {receiptStage === "idle" ? (
              <div className="capture-intro">
                <div className="capture-visual"><UploadIcon width={25} height={25} /></div>
                <h3>영수증 사진을 선택해 주세요</h3>
                <p>촬영하거나 사진 보관함에서 고를 수 있어요.<br />상품명과 수량을 살펴본 뒤 저장해 주세요.</p>
                <CaptureActions label="영수증 이미지 입력 방법" allowPdf onFile={handleReceiptFile} onCameraOpen={() => setCameraTarget("receipt")} />
                {demoInputsAvailable ? <button className="secondary-sheet-button" type="button" onClick={() => { resetReceiptSession(); setReceiptStage("review"); }}>예시 영수증 보기</button> : null}
              </div>
            ) : receiptStage === "processing" ? (
              <ProcessingState label="영수증을 읽고 있어요" detail="영수증에서 상품명과 수량을 확인하고 있어요." />
            ) : receiptStage === "unavailable" ? (
              <UnavailableState message={receiptError} onBack={resetReceiptSession} />
            ) : (
              <ReceiptReview lines={receiptLines} qualityWarnings={receiptQualityWarnings} source={receiptSource} resumedFromDraft={receiptResumed} sourcePreviewUrl={receiptPreviewUrl} sourcePreviewKind={receiptPreviewKind} templateId={receiptTemplateId} templateConfidence={receiptTemplateConfidence} merchantName={receiptMerchantName} reviewObservations={receiptReviewObservations} reviewSessionState={receiptReviewSessionState} setReviewSessionState={setReceiptReviewSessionState} selectedIds={selectedReceiptIds} onToggle={(id) => setSelectedReceiptIds((ids) => ids.includes(id) ? ids.filter((currentId) => currentId !== id) : [...ids, id])} onChange={(id, changes) => setReceiptLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line))} onSubmit={submitReceipt} onBack={resetReceiptSession} formatReceiptLineDetail={formatReceiptLineDetail} receiptLineError={receiptLineError} productNameLookups={productNameLookups} onLookupProductName={lookupReceiptProductName} onApplyProductCandidate={applyReceiptProductCandidate} onApplyReceiptMatchCandidate={applyReceiptMatchCandidate} barcodeLookups={barcodeLookups} onLookupBarcode={lookupReceiptBarcode} onApplyBarcodeCandidate={applyReceiptBarcodeCandidate} storageLocations={storageLocations} receiptDraftId={receiptDraftId} productEnrichmentJob={productEnrichmentJob} productEnrichmentError={productEnrichmentError} onEnqueueProductEnrichment={() => void enqueueReceiptProductEnrichment()} onRetryProductEnrichment={() => void retryReceiptProductEnrichment()} />
            )}
          </>
        )
      ) : null}

      {mode === "barcode" ? (
        <div className="input-flow">
          <div className="capture-visual compact"><CameraIcon width={25} height={25} /></div>
          <h3>바코드로 상품 찾기</h3>
          <p>{barcodeDateCandidate ? "바코드에서 날짜를 읽었어요. 포장지에서 날짜 종류와 숫자를 비교해 주세요." : "바코드만으로는 소비기한을 알 수 없어요. 상품 정보를 찾아 보관 방법을 보여드려요."}</p>
          <label className="app-input-label" htmlFor="barcode-input">바코드 숫자</label>
          <KeyboardInput id="barcode-input" className="app-input" value={barcode} inputMode="numeric" enterKeyHint="search" placeholder={demoInputsAvailable ? `예: ${DEMO_BARCODE}` : "바코드 숫자를 입력해 주세요"} onChange={(event) => updateBarcodeInput(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter" || event.nativeEvent.isComposing) return; event.preventDefault(); void lookupBarcode(barcode); }} onBlur={() => keyboard.hide()} />
          {barcodeManualFallback ? barcodeResultCallout : null}
          <button className={barcodeScanIsPrimary ? "primary-sheet-button" : "secondary-sheet-button"} type="button" onClick={() => setScannerOpen(true)}><CameraIcon width={17} height={17} /> 카메라로 스캔</button>
          {scannerOpen ? <Suspense fallback={<div className="scanner-loading" role="status">바코드 스캐너를 준비하고 있어요</div>}><BarcodeScanner onDetected={(value) => { updateBarcodeInput(value); setScannerOpen(false); void lookupBarcode(value); }} onCancel={() => setScannerOpen(false)} /></Suspense> : null}
          <button className={barcodeSearchIsPrimary ? "primary-sheet-button" : "secondary-sheet-button"} type="button" disabled={barcodeLookupLoading} aria-busy={barcodeLookupLoading} onPointerDown={(event) => event.preventDefault()} onClick={() => void lookupBarcode(barcode)}><ReaderIcon width={17} height={17} /> {barcodeLookupLoading ? "상품 정보 찾는 중" : barcode.trim() && barcodeResult ? "다시 찾기" : "상품 정보 찾기"}</button>
          {demoInputsAvailable ? <button className="secondary-sheet-button" type="button" onClick={() => { updateBarcodeInput(DEMO_BARCODE); if (!mealApi.isConfigured) setBarcodeResult(DEMO_BARCODE_FOUND_MESSAGE); }}>예시 바코드 입력</button> : null}
          {barcodeResult && !barcodeManualFallback && !barcodeDateCandidate ? barcodeResultCallout : null}
          {!mealApi.isConfigured && barcodeResult === DEMO_BARCODE_FOUND_MESSAGE ? <div className="barcode-candidate-list" aria-label="바코드로 찾은 상품 정보"><div className="barcode-candidate-heading"><strong>찾은 상품 정보</strong><small>상품명과 보관 방법을 살펴본 뒤 적용해 주세요</small></div><div className="barcode-candidate-card"><div className="barcode-candidate-copy"><strong>풀무원 국산콩 두부</strong><small><MetadataText text={<>샘플 정보 · 냉장 보관 기준</>} /></small><small>소비기한은 포장지에서 살펴봐 주세요.</small></div><button ref={barcodeCandidateActionRef} className={`candidate-apply-button${barcodeProductApplyIsPrimary ? " barcode-candidate-apply-primary" : ""}`} type="button" onClick={applyDemoBarcodeCandidate}>상품 정보 적용</button></div></div> : null}
          {barcodeProviderNotice ? <div className="barcode-provider-warning" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>상품 정보를 모두 찾지는 못했어요</strong><small>{barcodeProviderNotice}</small></span></div> : null}
          {barcodeDateCandidate ? <div className="barcode-date-candidate" data-date-state="actual_printed" data-date-confirmation="candidate" role="group" aria-live="polite" aria-label="바코드에서 읽은 날짜"><div><strong><MetadataText text={<>{barcodeDateKindLabel(barcodeDateCandidate.kind)} · {barcodeDateCandidate.value.replaceAll("-", ".")}</>} /></strong><small>바코드에서 읽은 날짜예요.</small><small>포장지와 식품 이름을 비교한 뒤 입력해 주세요.</small></div><button className={`candidate-apply-button${barcodeDateApplyIsPrimary ? " barcode-candidate-apply-primary" : ""}`} type="button" onClick={applyBarcodeDateCandidate}>상품·날짜 입력하기</button></div> : null}
          {barcodeLookup?.candidates.length ? (
            <div className="barcode-candidate-list" aria-label="바코드로 찾은 상품 정보" aria-live="polite">
              <div className="barcode-candidate-heading"><strong>찾은 상품 정보</strong><small>상품명과 보관 방법을 살펴본 뒤 적용해 주세요</small></div>
              {barcodeLookup.candidates.map((candidate, index) => (
                <div className="barcode-candidate-card" key={`${candidate.source}-${candidate.canonical_name}`}>
                  <div className="barcode-candidate-copy">
                    <strong>{candidate.brand ? `${candidate.brand} ` : ""}{candidate.canonical_name}</strong>
                    <small><MetadataText text={<>{productSourceLabel(candidate.source)} · {productFreshnessLabel(candidate.source_freshness)}</>} /></small>
                    <small><MetadataText text={<>{[candidate.category, candidate.quantity_text].filter(Boolean).join(" · ") || "상품 기본 정보"}</>} /></small>
                    {candidate.shelf_life_text ? <small>상품 정보에 나온 기간: {candidate.shelf_life_text}</small> : null}
                    {candidate.storage_hint ? <small>상품 정보에 나온 보관 방법: {candidate.storage_hint === "frozen" ? "냉동" : candidate.storage_hint === "refrigerated" ? "냉장" : "실온"}</small> : null}
                    <small className="barcode-candidate-provenance">{productProvenanceNote(candidate.provenance_note)}</small>
                  </div>
                  <button ref={index === 0 ? barcodeCandidateActionRef : undefined} className={`candidate-apply-button${barcodeProductApplyIsPrimary ? " barcode-candidate-apply-primary" : ""}`} type="button" onClick={() => applyBarcodeCandidate(candidate)}>상품 정보 적용</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "label" ? (
        cameraTarget === "label" ? (
          <CameraCapture title="라벨" detail="날짜가 보이도록 포장지를 맞춰 주세요." onFile={(file) => { setCameraTarget(null); void handleLabelFile(file); }} onCancel={() => setCameraTarget(null)} />
        ) : (
          <div className="input-flow" aria-busy={labelProcessing}>
            {!labelResult ? (
              <>
                <div className="capture-visual compact"><CalendarIcon width={25} height={25} /></div>
                <h3>포장지 날짜를 읽어볼게요</h3>
                <p>사진에서 포장지 날짜를 읽어드려요.<br />{" "}사진은 식품 기록에 저장하지 않아요.</p>
                <div className="capture-hint capture-guidance-note capture-date-meaning-note" role="note">
                  <InfoCircledIcon width={15} height={15} />
                  <span>
                    <strong>읽은 날짜를 포장지에서 확인해 주세요.</strong>
                    <small>날짜가 무엇을 뜻하는지 확인하기 전에는 소비기한으로 저장하지 않아요.</small>
                  </span>
                </div>
                {labelError ? <div className="result-callout result-callout-warning result-callout-manual-fallback label-result-error-callout" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{normalizeKnownProductWarning(labelError)}</strong><small>날짜가 없는 면이면 다른 면을 촬영하거나 직접 입력해 주세요.</small></span><button ref={labelErrorActionRef} className="result-callout-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={continueWithManual}>직접 입력으로 계속</button></div> : null}
                <CaptureActions label="라벨 이미지 입력 방법" onFile={handleLabelFile} onCameraOpen={() => setCameraTarget("label")} disabled={labelProcessing} />
                {demoInputsAvailable ? <button className="secondary-sheet-button capture-sample-button" type="button" onClick={applyLabelSample} disabled={labelProcessing} aria-busy={labelProcessing}><FileTextIcon width={17} height={17} aria-hidden="true" /> {labelProcessing ? "라벨 읽는 중" : "예시 라벨 결과 보기"}</button> : null}
              </>
            ) : null}
            {labelProcessing ? <ProcessingState label="포장지를 읽고 있어요" detail="표시된 날짜와 보관 방법을 확인하고 있어요." /> : null}
            {labelPreviewUrl ? <LabelSourcePreview sourcePreviewUrl={labelPreviewUrl} sourceAspectRatio={labelSourceAspectRatio} reviewObservations={labelReviewObservations} activeObservationIds={labelDateObservationIds} onImageLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setLabelSourceAspectRatio(image.naturalWidth / image.naturalHeight); }} /> : null}
            {labelResult ? <details className="label-recapture-details"><summary><span><strong>다른 라벨로 다시 읽기</strong><small>현재 결과는 이 시트 안에서만 유지돼요.</small></span><CameraIcon width={17} height={17} /></summary><div className="label-recapture-options"><CaptureActions label="다른 라벨 이미지 입력 방법" onFile={handleLabelFile} onCameraOpen={() => setCameraTarget("label")} disabled={labelProcessing} />{demoInputsAvailable ? <button className="secondary-sheet-button capture-sample-button" type="button" onClick={applyLabelSample} disabled={labelProcessing} aria-busy={labelProcessing}><FileTextIcon width={17} height={17} aria-hidden="true" /> 예시 라벨 결과 보기</button> : null}</div></details> : null}
            {labelError && labelResult ? <div className="result-callout result-callout-warning" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{normalizeKnownProductWarning(labelError)}</strong><small>{labelDateKind ? "포장지에 적힌 날짜를 확인한 뒤 저장해 주세요." : "날짜가 무엇을 뜻하는지 확인하기 전에는 저장하지 않아요."}</small></span></div> : null}
            {labelResult ? (
              <div className="label-result-flow" data-testid="label-result-flow">
                  {labelRecheckMismatch ? <div className="result-callout result-callout-warning label-recheck-mismatch" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{labelRecheckMismatchTitle}</strong><small>{labelRecheckMismatchGuidance}</small></span></div> : null}
                  <div className={`label-result-card ${!labelDateKind || !labelDetectedStorage ? "label-result-card-ambiguous" : ""}`} data-date-state={labelDateKind ? "actual_printed" : "unknown"} data-date-confirmation="candidate" data-label-source={labelSampleApplied ? "example" : "recognized"}>
                  <div className="label-result-provenance" data-label-source={labelSampleApplied ? "example" : "recognized"} role="group" tabIndex={-1} aria-label={labelSampleApplied ? "예시 라벨 결과" : "포장지에서 읽은 날짜"}><strong>{labelSampleApplied ? "예시 라벨 결과" : "포장지에서 읽은 날짜"}</strong><span>{labelSampleApplied ? "예시 결과예요. 실제 식품을 등록할 때 포장지 날짜를 선택해 주세요." : "날짜 종류와 숫자를 포장지와 비교해 주세요."}</span></div>
                  <div className="label-result-fields">
                    {labelDateKind ? (
                      <div className="label-date-kind-summary">
                        <strong data-label-date-candidate="true">{labelDateKindChoiceLabel(labelDateKind)} {labelDetectedDate}</strong>
                        <button className="label-date-kind-edit" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setLabelDateKind(null); window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.label-date-kind-options [role="radio"]')?.focus({ preventScroll: true })); }}>날짜 의미 변경</button>
                      </div>
                    ) : (
                      <div className="label-date-meaning-review" role="group" aria-label="라벨 날짜 의미 확인" aria-describedby="label-date-meaning-hint">
                        <strong>포장지에 적힌 날짜 이름을 골라 주세요</strong>
                        <small id="label-date-meaning-hint">날짜 옆에 적힌 이름을 그대로 선택해 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.</small>
                        <div className="label-date-kind-options" role="radiogroup" aria-label="표시 날짜 종류">
                          {LABEL_DATE_KINDS.map((kind) => <button key={kind} className={`label-date-kind-option ${labelDateKind === kind ? "label-date-kind-option-active" : ""}`} type="button" role="radio" aria-checked={labelDateKind === kind} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setLabelDateKind(kind); window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".label-date-kind-edit")?.focus({ preventScroll: true })); }}>{labelDateKindChoiceLabel(kind)}</button>)}
                        </div>
                      </div>
                    )}
                    <label className="label-result-date-field"><span>포장지 날짜</span><KeyboardInput className="app-input" type="date" value={labelDateInputValue(labelDetectedDate)} aria-label="포장지 날짜" aria-describedby={labelDateKind ? "label-result-date-readable label-date-review-guidance" : "label-result-date-readable"} onChange={(event) => setLabelDetectedDate(event.target.value.replaceAll("-", "."))} onBlur={() => keyboard.hide()} /></label>
                    <small id="label-result-date-readable" className="label-result-date-readable"><MetadataText text={<>{isCompleteLabelDate(labelDetectedDate) ? `선택한 날짜 · ${labelDetectedDate}` : "날짜를 선택해 주세요"}</>} /></small>
                    {labelDateKind ? <small id="label-date-review-guidance" className="label-date-review-guidance">{labelDateReviewGuidance(labelDateKind)}</small> : null}
                    <label className="label-result-name-field"><span>상품명</span><KeyboardInput className="app-input" value={labelDetectedProductName} placeholder="상품명을 입력해 주세요" autoComplete="off" spellCheck={false} aria-label="라벨 상품명" onChange={(event) => { setLabelDetectedProductName(event.target.value); setLabelLotAction("create"); setLabelTargetFoodId(null); setLabelLotDecisionMade(!initialLabelTargetFoodId); }} onBlur={() => keyboard.hide()} /></label>
                    {labelTargetSelectionStale && !labelRecheckMismatch ? <div className="result-callout result-callout-warning label-stale-lot-target" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>선택한 식품 기록을 목록에서 찾지 못했어요.</strong><small>{labelTargetSelectionStaleGuidance}</small></span></div> : null}
                    {labelTargetCandidates.length ? (
                      <div className="label-lot-target" role="group" aria-label="날짜를 저장할 식품 선택">
                        <div className="label-lot-target-heading"><strong>같은 식품 기록이 있어요</strong><small>새로 샀다면 새 기록, 이미 보유 중이라면 기존 기록을 골라요.</small></div>
                        <div className="label-lot-target-options" role="radiogroup" aria-label="날짜를 저장할 식품 선택">
                          <button className={`label-lot-target-option ${labelLotAction === "create" && labelLotDecisionMade ? "label-lot-target-option-active" : ""}`} type="button" role="radio" aria-checked={labelLotAction === "create" && labelLotDecisionMade} onPointerDown={(event) => event.preventDefault()} onClick={() => { setLabelLotAction("create"); setLabelTargetFoodId(null); setLabelLotDecisionMade(true); }}>
                            <span><strong>새로 산 식품으로 추가</strong><small>기본 1개예요. 실제 수량을 확인해 주세요.</small></span>
                          </button>
                          {labelTargetCandidates.map((food) => (
                            <button className={`label-lot-target-option ${labelLotAction === "correct" && labelLotDecisionMade && labelTargetFoodId === food.id ? "label-lot-target-option-active" : ""}`} type="button" role="radio" aria-checked={labelLotAction === "correct" && labelLotDecisionMade && labelTargetFoodId === food.id} key={food.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { setLabelLotAction("correct"); setLabelTargetFoodId(food.id); setLabelLotDecisionMade(true); }}>
                              <span><strong><MetadataText text={<>기존 식품 · {food.quantity}</>} /></strong><small><MetadataText text={<>{food.storage} · {food.dateLabel} · {food.brand}</>} /></small></span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {labelLotAction === "create" && labelLotDecisionMade ? (
                      <div className="label-new-lot-quantity">
                        <label className="label-result-quantity-field" htmlFor="label-new-food-quantity">
                          <span>새 식품 수량</span>
                          <KeyboardInput id="label-new-food-quantity" className="app-input" value={labelQuantity} placeholder="예: 1팩" aria-invalid={labelQuantityInvalid} aria-describedby="label-new-food-quantity-hint" onChange={(event) => { setLabelQuantity(event.target.value); setLabelQuantityEdited(true); }} onFocus={(event) => revealFocusedInput(event, "start")} onBlur={() => keyboard.hide()} />
                        </label>
                        <small id="label-new-food-quantity-hint" className={`label-new-lot-quantity-hint${labelQuantityInvalid ? " label-new-lot-quantity-hint-error" : ""}`} role={labelQuantityInvalid ? "alert" : "note"}>
                          {labelQuantityInvalid ? "수량은 0보다 큰 숫자로 입력해 주세요." : labelQuantityEdited ? `입력한 수량 ${labelQuantity.trim()}을 새 기록에 저장해요.` : "기본값 1개예요. 실제 보유 수량을 확인해 주세요."}
                        </small>
                      </div>
                    ) : labelLotAction === "correct" && labelLotDecisionMade && labelSelectedTargetFood ? (
                      <p className="label-lot-quantity-preserved" role="status">기존 수량 {labelSelectedTargetFood.quantity}은 그대로 두고, 선택한 날짜와 보관 정보만 바꿔요.</p>
                    ) : null}
                    {labelDetectedStorageConditionText ? <small id="label-storage-hint" className="label-storage-condition-note"><MetadataText text={<>{labelSampleApplied ? `예시 보관 정보 · ${labelDetectedStorageConditionText}` : `포장지에 적힌 보관 방법: ${labelDetectedStorageConditionText}`}</>} /></small> : !labelDetectedStorage ? <small id="label-storage-hint" className="label-storage-required">보관 위치를 선택해 주세요.</small> : <span id="label-storage-hint" className="sr-only">보관 위치를 선택했어요.</span>}
                    <StoragePicker value={labelDetectedStorage} locationId={labelDetectedStorageLocationId} locations={storageLocations} onChange={(nextStorage, nextLocationId) => { setLabelDetectedStorage(nextStorage); setLabelDetectedStorageLocationId(nextLocationId); }} label="라벨 식품 보관 위치" descriptionId="label-storage-hint" />
                  </div>
                  <span className={`confirmed-badge ${labelSampleApplied || !labelDateKind || !labelDetectedStorage ? "review-badge" : ""}`}>{!labelSampleApplied && labelDateKind && labelDetectedStorage ? <CheckIcon width={13} height={13} /> : <InfoCircledIcon width={13} height={13} />} {labelSampleApplied ? "예시 정보" : labelDateKind && labelDetectedStorage ? "날짜 종류를 골랐어요" : "포장지 날짜를 살펴봐 주세요"}</span>
                </div>
                <div className="receipt-review-submit-bar label-result-action-bar">
                  <div id="label-result-action-summary" className="label-result-action-summary" role="note"><MetadataText text={<> {labelSampleApplied ? "예시 결과 · 저장 전 확인" : "저장할 내용"} · {labelActionDateSummary} · {labelActionLotSummary} · {labelActionStorageSummary} </>} /></div>
                  <button
                    ref={labelResultActionRef}
                    className="primary-sheet-button label-result-action"
                    type="button"
                    aria-busy={labelSubmitting}
                    aria-describedby="label-result-action-summary"
                    disabled={labelSubmitting || !labelDateKind || !labelDetectedStorage || !labelDetectedProductName.trim() || !isCompleteLabelDate(labelDetectedDate) || !labelLotDecisionMade || (labelLotAction === "create" && labelQuantityInvalid) || labelTargetSelectionStale || (labelLotAction === "correct" && !labelTargetFoodId)}
                    onPointerDown={(event) => { event.preventDefault(); submitLabel(); }}
                    onClick={(event) => { if (event.detail === 0) submitLabel(); }}
                  >
                    {labelSubmitting ? "저장 중"
                      : labelTargetSelectionStale ? labelRecheckMismatch ? "식품 목록을 다시 불러와 주세요" : "기존 식품을 다시 골라 주세요"
                        : !labelLotDecisionMade ? labelRecheckMismatch ? labelRecheckTargetFood ? "상품명을 살펴봐 주세요" : "기존 식품을 골라 주세요" : "저장할 식품을 선택해 주세요"
                          : labelLotAction === "create" && labelQuantityInvalid ? "수량을 입력해 주세요"
                            : labelDateKind && labelDetectedStorage
                              ? labelTargetCandidates.length
                                ? labelLotAction === "correct" ? "기존 식품 날짜 바꾸기" : "새 식품 추가하기"
                                : "식품 목록에 추가하기"
                              : "날짜·보관 위치를 선택해 주세요"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {mode === "manual" ? (
        <div className="input-flow manual-flow manual-entry-convenience">
          {productProvenance ? <div className="manual-product-provenance manual-source-confirmation" role="status"><ReaderIcon width={17} height={17} /><span><strong>상품 정보</strong><small><MetadataText text={<>{productSourceLabel(productProvenance.source)} · {productFreshnessLabel(productProvenance.sourceFreshness)}{productProvenance.storageHint ? ` · 상품 정보에 나온 보관 방법: ${productProvenance.storageHint === "refrigerated" ? "냉장" : productProvenance.storageHint === "frozen" ? "냉동" : "실온"}` : ""}</>} /></small><small>{productProvenanceNote(productProvenance.note)}</small></span><em>참고</em></div> : null}
          {foodName.trim() || manualQuantityInvalid ? (
            <div className="receipt-review-submit-bar manual-submit-bar" style={{ position: "sticky", top: 0, bottom: "auto", zIndex: 5, marginTop: 0, marginBottom: 2, padding: "7px 0 8px" }}>
              <button className="primary-sheet-button manual-submit" type="button" onPointerDown={(event) => { event.preventDefault(); submitManual(); }} onClick={(event) => { if (event.detail === 0) submitManual(); }} disabled={!foodName.trim() || manualQuantityInvalid} aria-describedby={manualQuantityInvalid ? "manual-quantity-submit-error" : "manual-submit-summary"}><PlusIcon width={17} height={17} /> 식품 추가하기</button>
              {manualQuantityInvalid
                ? <small id="manual-quantity-submit-error" role="alert" style={{ display: "block", marginTop: 4, color: "var(--atelier-coral)", fontSize: 12, lineHeight: 1.4, textAlign: "center" }}>수량은 0보다 큰 숫자로 입력해 주세요.</small>
              : <div id="manual-submit-summary" className="manual-submit-summary" role="note"><strong>추가할 식품</strong><span>{foodName.trim()}{manualBrandSummary}</span><span><MetadataText text={<>{quantity.trim()}{manualDateSummary} · {storage} 보관</>} /></span>{!mealApi.isConfigured ? <small>체험 기록이에요. 새로고침하면 사라져요.</small> : null}</div>}
            </div>
          ) : null}
          <label className="app-input-label" htmlFor="food-name-input">식품 이름</label>
          <KeyboardInput id="food-name-input" className="app-input" value={foodName} placeholder="예: 대파, 김치, 남은 카레" onChange={(event) => changeManualFoodName(event.target.value)} onFocus={revealFocusedInput} onBlur={() => keyboard.hide()} />
          {manualNameSuggestions.length ? <div className="manual-name-suggestions" role="group" aria-label="목록에 있는 이름"><span className="manual-name-suggestions-label">목록에 있는 이름</span><div className="manual-entry-choices">{manualNameSuggestions.map((name) => <button key={name} className="manual-entry-choice" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => changeManualFoodName(name)}>{name}</button>)}</div></div> : null}
          <label className="app-input-label" htmlFor="food-quantity-input">수량</label>
          <KeyboardInput id="food-quantity-input" className="app-input" value={quantity} placeholder="예: 1팩" aria-invalid={manualQuantityInvalid} aria-describedby={manualQuantityInvalid ? "manual-quantity-submit-error" : undefined} onChange={(event) => setQuantity(event.target.value)} onFocus={revealFocusedInput} onBlur={() => keyboard.hide()} />
          <div className="manual-entry-choices" role="group" aria-label="수량 단위">{MANUAL_QUANTITY_UNITS.map((unit) => <button key={unit} className="manual-entry-choice" type="button" aria-label={`수량 단위 ${unit}`} aria-pressed={manualQuantity?.unit === unit} disabled={manualQuantityInvalid} onPointerDown={(event) => event.preventDefault()} onClick={() => setQuantity((current) => changeManualQuantityUnit(current, unit))}>{unit}</button>)}</div>
          <span className="app-input-label">보관 위치</span>
          <StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); setPriorityInference(null); setPriorityInferenceError(""); }} />
          <div className="manual-note"><InfoCircledIcon width={17} height={17} /><span>날짜는 포장지를 확인한 뒤 추가할 수 있어요. 먼저 살펴볼 시점은 소비기한이나 먹어도 되는지를 뜻하지 않아요.</span></div>
          {mealApi.isConfigured ? <button className="secondary-sheet-button" type="button" disabled={!foodName.trim() || priorityInferenceLoading} onPointerDown={(event) => event.preventDefault()} onClick={() => void requestPriorityInference()}>{priorityInferenceLoading ? "확인 중" : "먼저 살펴볼 식품 보기"}<ReaderIcon width={17} height={17} /></button> : null}
          {priorityInferenceError ? <div className="result-callout result-callout-warning" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{priorityInferenceError}</strong><small>실제 포장지 표시 날짜와 보관 상태를 우선 확인해 주세요.</small></span></div> : null}
          {priorityInference ? <div ref={priorityInferenceRef} className={`result-callout ${priorityInference.abstained ? "result-callout-warning" : ""}`} role={priorityInference.abstained ? "status" : undefined}><InfoCircledIcon width={17} height={17} /><span><strong><MetadataText text={<>{priorityInference.abstained ? "먼저 살펴볼 시점을 정하지 못했어요" : `먼저 살펴볼 시점 · ${priorityInference.estimated_use_first_window ? `${formatApiDate(priorityInference.estimated_use_first_window.start_date)}~${formatApiDate(priorityInference.estimated_use_first_window.end_date)}` : "날짜 미정"}`}</>} /></strong><small>{normalizeKnownInferenceText(priorityInference.reasoning[0] ?? "식품 종류와 보관 방법을 참고했어요.")}</small><small>{normalizeKnownInferenceText(priorityInference.safety_disclaimer)}</small></span></div> : null}
          {barcodeDateCandidate ? <div className="manual-date-candidate" role="status"><span><strong>바코드에서 읽은 {barcodeDateKindLabel(barcodeDateCandidate.kind)}예요.</strong><small><MetadataText text={<>{barcodeDateCandidate.value.replaceAll("-", ".")} · 포장지 날짜와 식품 이름을 비교한 뒤 저장해 주세요.</>} /></small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => setBarcodeParse(null)}>날짜 지우기</button></div> : null}
          <details className="manual-record-help"><summary>같은 식품을 다시 추가하면?</summary><p className="manual-lot-note">구매한 식품을 나눠 날짜와 보관 상태를 따로 관리해요. 새로 산 식품은 기존 식품과 별도로 추가해 주세요.</p></details>
        </div>
      ) : null}
      </div>
    </div>
  );
}
