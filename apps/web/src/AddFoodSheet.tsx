import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { CalendarIcon, CameraIcon, CheckCircledIcon, CheckIcon, Cross2Icon, FileTextIcon, InfoCircledIcon, PlusIcon, ReaderIcon, UploadIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import CameraCapture, { type CaptureFileHandler } from "./CameraCapture";
import { isMealApiProductEnrichmentPersistenceError, isMealApiReceiptDraftPersistenceError, mealApi, type ApiBarcodeParse, type ApiDateKind, type ApiOcrReviewObservation, type ApiPriorityInference, type ApiProductEnrichmentJob, type ApiProductLookup, type ApiProductNameLookup, type ApiReceiptDraft, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import type { AddMode, FoodItem, ReceiptCommitPayload, ReceiptLine, StorageType } from "./Prototype";

const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];
type LabelDateKind = Exclude<ApiDateKind, "unknown" | "estimated_use_first" | "user_reminder">;
const LABEL_DATE_KINDS: LabelDateKind[] = ["production_date", "packaging_date", "sell_by", "use_by", "best_before"];
type SourcePreviewKind = "image" | "pdf";
type ReceiptTemplateId = "grocery-mart-v1" | "retail-beverage-v1" | "restaurant-card-v1" | "grocery-generic-v1" | "generic-v1";

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

function labelDateInputValue(value: string) {
  return value.replaceAll(".", "-");
}

function isCompleteLabelDate(value: string) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(value);
}

function normalizeFoodName(value: string) {
  return value.trim().replace(/\s+/g, " ");
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
  const providerLabel = provider === "open_food_facts" ? "공개 상품 DB" : provider === "mfds_c005" ? "식품안전나라 상품 DB" : "상품 정보 source";
  return status === "rate_limited"
    ? `${providerLabel} 요청이 잠시 많아요. 지금 보이는 후보만 확인하고 잠시 후 다시 시도해 주세요.`
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
  if (source === "open_food_facts") return "Open Food Facts";
  if (source === "mfds_c005") return "식품안전나라 C005";
  if (source === "mfds_i1250") return "식품안전나라 I1250";
  return "검증 상품 fixture";
}

function productFreshnessLabel(freshness: "current" | "legacy" | "unknown") {
  if (freshness === "current") return "현재 후보";
  if (freshness === "legacy") return "과거 기준 후보";
  return "최신성 확인 필요";
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
}: {
  value: StorageType | null;
  locationId?: string | null;
  locations?: ApiStorageLocation[];
  onChange: (value: StorageType, locationId: string | null) => void;
  label?: string;
}) {
  const keyboard = useKeyboard();
  const customLocations = locations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  return (
    <div className="storage-picker" role="group" aria-label={label}>
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
    <div className="capture-actions" role="group" aria-label={label}>
      <button className="primary-sheet-button capture-action capture-action-camera" type="button" disabled={disabled} onClick={onCameraOpen}>
        <CameraIcon width={17} height={17} /> 카메라로 촬영
      </button>
      <label className={`secondary-sheet-button file-button capture-action capture-action-library${disabled ? " capture-action-disabled" : ""}`}>
        <UploadIcon width={17} height={17} /> <span>사진에서 선택</span>{allowPdf ? <small className="capture-file-hint">PDF 가능</small> : null}
        <input type="file" accept={allowPdf ? "image/*,.pdf,application/pdf" : "image/*"} data-input-source="library" aria-label={`${label} 사진${allowPdf ? " 또는 PDF" : ""} 선택`} onChange={handleChange} disabled={disabled} />
      </label>
    </div>
  );
}

function receiptMatchSourceLabel(source: ReceiptLine["matchSource"]) {
  if (source === "user_confirmed_alias") return "이전에 확인한 별칭";
  if (source === "local_rule") return "검토된 상품명 규칙";
  if (source === "local_fixture") return "검증 상품 fixture";
  if (source === "mfds_i1250") return "I1250 제품 기준 후보";
  if (source === "open_food_facts") return "Open Food Facts 검색 후보";
  if (source === "unmatched") return "상품 매칭 필요";
  return "parser 후보";
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
  return <div className="capture-intro unavailable-state"><div className="capture-visual warning"><InfoCircledIcon width={25} height={25} /></div><h3>사진을 다시 확인해 주세요</h3><p>{message || "OCR 엔진을 연결한 뒤 실제 사진을 분석할 수 있어요."}</p><button className="secondary-sheet-button" type="button" onClick={onBack}>다시 촬영하거나 사진 선택</button><div className="capture-hint"><InfoCircledIcon width={14} height={14} /> 자동 인식이 실패해도 수동 review로 등록할 수 있게 설계합니다.</div></div>;
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
      <div className="label-source-preview-heading"><span><ReaderIcon width={15} height={15} /><strong>라벨 원본 대조</strong></span><small>이 화면에서만 임시로 표시해요</small></div>
      <div className="label-source-preview-frame" data-preview-ready={sourceAspectRatio ? "true" : "false"} style={sourceAspectRatio ? { width: `min(100%, ${Math.round(270 * sourceAspectRatio)}px)`, aspectRatio: String(sourceAspectRatio) } : undefined}>
        <img src={sourcePreviewUrl} alt="업로드한 라벨 원본 미리보기" draggable={false} onLoad={onImageLoad} />
        <div className="label-source-preview-overlay" aria-hidden="true">
          {reviewObservations.map((observation) => {
            const [x, y, width, height] = observation.bbox;
            return <span className={`label-source-box ${activeIds.has(observation.id) ? "label-source-box-active" : ""}`} data-observation-id={observation.id} key={observation.id} style={{ left: `${x * 100}%`, bottom: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }} />;
          })}
        </div>
      </div>
      <p>{activeObservationIds.length ? "날짜 후보가 읽힌 위치를 강조했어요. 표시 문구와 날짜를 원본에서 확인한 뒤 반영해 주세요." : "날짜 후보의 원본 위치를 자동으로 연결하지 못했어요. 라벨에 적힌 날짜 의미를 직접 확인한 뒤 반영해 주세요."} 원본 파일 자체는 재고 기록에 저장하지 않아요.</p>
    </div>
  );
}

function ReceiptSourcePreview({
  sourcePreviewUrl,
  sourcePreviewKind,
  reviewObservations,
  activeObservationIds,
}: {
  sourcePreviewUrl: string;
  sourcePreviewKind: SourcePreviewKind;
  reviewObservations: ApiOcrReviewObservation[];
  activeObservationIds: string[];
}) {
  const [sourceAspectRatio, setSourceAspectRatio] = useState<number | null>(null);
  const activeSourceObservationIds = new Set(activeObservationIds);

  useEffect(() => {
    setSourceAspectRatio(null);
  }, [sourcePreviewKind, sourcePreviewUrl]);

  return (
    <div className="receipt-source-preview" role="region" aria-label={sourcePreviewKind === "pdf" ? "영수증 PDF 원본 미리보기" : "영수증 원본 미리보기"}>
      <div className="receipt-source-preview-heading"><span><ReaderIcon width={15} height={15} /><strong>영수증 원본 대조</strong></span><small>이 화면에서만 임시로 표시해요</small></div>
      {sourcePreviewKind === "pdf" ? (
        <div className="receipt-source-preview-frame receipt-source-pdf-frame" data-preview-ready="true">
          <object data={sourcePreviewUrl} type="application/pdf" title="업로드한 영수증 PDF 원본 미리보기">
            <a href={sourcePreviewUrl} target="_blank" rel="noreferrer">PDF 원본 열기</a>
          </object>
        </div>
      ) : (
        <div className="receipt-source-preview-frame" data-preview-ready={sourceAspectRatio ? "true" : "false"} style={sourceAspectRatio ? { width: `min(100%, ${Math.round(270 * sourceAspectRatio)}px)`, aspectRatio: String(sourceAspectRatio) } : undefined}>
          <img src={sourcePreviewUrl} alt="업로드한 영수증 원본 미리보기" draggable={false} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setSourceAspectRatio(image.naturalWidth / image.naturalHeight); }} />
          <div className="receipt-source-preview-overlay" aria-hidden="true">
            {reviewObservations.map((observation) => {
              const [x, y, width, height] = observation.bbox;
              const active = activeSourceObservationIds.has(observation.id);
              return <span className={`receipt-source-box ${active ? "receipt-source-box-active" : ""}`} data-observation-id={observation.id} key={observation.id} style={{ left: `${x * 100}%`, bottom: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }} />;
            })}
          </div>
        </div>
      )}
      <p>{sourcePreviewKind === "pdf" ? "PDF는 상품 line 위치를 자동으로 강조하지 않아요. 추출 결과와 원본을 함께 확인해 주세요." : reviewObservations.length ? "상품 항목을 누르면 원본에서 읽은 위치가 강조돼요. OCR 결과를 원본과 대조한 뒤 필요한 항목만 체크해 주세요." : "OCR 결과를 원본과 대조한 뒤 필요한 항목만 체크해 주세요."} 원본 파일 자체는 재고 기록에 저장하지 않아요.</p>
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
  const [editingIds, setEditingIds] = useState<string[]>(() => lines.filter((line) => line.requiresReview).map((line) => line.id));
  const [activeSourceLineId, setActiveSourceLineId] = useState<string | null>(() => lines.find((line) => line.sourceObservationIds?.length)?.id ?? lines[0]?.id ?? null);
  const reviewCount = lines.filter((line) => selectedIds.includes(line.id)).length;
  const invalidSelectedLines = lines.filter((line) => selectedIds.includes(line.id) && receiptLineError(line));
  const activeSourceObservationIds = new Set(lines.find((line) => line.id === activeSourceLineId)?.sourceObservationIds ?? []);
  const toggleEditing = (id: string) => {
    setEditingIds((current) => current.includes(id) ? current.filter((lineId) => lineId !== id) : [...current, id]);
  };

  return (
    <div className="receipt-review">
      <div className="review-summary"><span className="review-file-icon"><FileTextIcon width={20} height={20} /></span><span><strong>{merchantName ?? source}</strong><small>{merchantName ? `${source} · ` : ""}{templateId && (templateConfidence ?? 0) > 0 ? `${receiptTemplateLabel(templateId)} · ` : ""}상품 후보 {lines.length}개 · 선택 {reviewCount}개</small></span><button type="button" onClick={() => { keyboard.hide(); onBack(); }} aria-label="영수증 다시 선택"><Cross2Icon width={17} height={17} /></button></div>
      {sourcePreviewUrl && sourcePreviewKind ? <ReceiptSourcePreview sourcePreviewUrl={sourcePreviewUrl} sourcePreviewKind={sourcePreviewKind} reviewObservations={reviewObservations} activeObservationIds={activeSourceObservationIds.size ? [...activeSourceObservationIds] : []} /> : null}
      {resumedFromDraft ? <div className="receipt-resume-callout" role="status"><ReaderIcon width={16} height={16} /><span><strong>저장해 둔 검수 초안이에요</strong><small>원본 사진은 저장하지 않아서 미리보기 없이 상품 정보만 다시 확인해요. 반영 전까지 재고에는 저장되지 않아요.</small></span></div> : null}
      {qualityWarnings.length ? <div className="quality-callout"><InfoCircledIcon width={17} height={17} /><span><strong>{sourcePreviewKind === "pdf" ? "PDF 입력 참고" : "사진 품질 참고"}</strong><small>{qualityWarnings.join(" ")}</small></span></div> : null}
      <div className="review-callout"><InfoCircledIcon width={17} height={17} /><span><strong>애매한 항목은 한 번 더 확인해요</strong><small>상품명·수량·단위를 확인하거나 수정한 뒤, 체크된 항목만 내 식품 목록으로 이동합니다.</small></span></div>
      {receiptDraftId ? <div className={`receipt-enrichment-callout ${productEnrichmentError ? "receipt-enrichment-callout-error" : ""}`} role={productEnrichmentError ? "alert" : undefined}><span><strong>제품 기준 정보 보강</strong><small>{productEnrichmentError || (productEnrichmentJob?.status === "succeeded" ? `제품 후보 ${productEnrichmentJob.enriched_candidates}개를 갱신했어요.` : productEnrichmentJob?.status === "in_flight" ? "백그라운드에서 제품 기준 정보를 확인하고 있어요." : productEnrichmentJob?.status === "queued" ? "제품정보 조회를 대기 중이에요. 영수증 반영은 지금도 진행할 수 있어요." : productEnrichmentJob?.status === "dead_letter" ? productEnrichmentJob.last_error ?? "제품정보 조회가 여러 번 실패했어요." : "상품명이 애매한 line을 제품 기준 데이터로 보강할 수 있어요.")}</small></span>{productEnrichmentJob?.status === "dead_letter" ? <button type="button" onClick={onRetryProductEnrichment}>재시도</button> : <button type="button" disabled={Boolean(productEnrichmentJob)} onClick={onEnqueueProductEnrichment}>{productEnrichmentError ? "다시 시도" : productEnrichmentJob?.status === "succeeded" ? "조회 완료" : productEnrichmentJob?.status === "queued" || productEnrichmentJob?.status === "in_flight" ? "조회 대기 중" : "백그라운드 조회"}</button>}</div> : null}
      {invalidSelectedLines.length ? <div className="receipt-validation-callout" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>반영 전 확인이 필요해요</strong><small>선택한 항목의 상품명·수량·단위를 올바르게 입력해 주세요.</small></span></div> : null}
      <div className="receipt-lines">
        {lines.map((line) => {
          const checked = selectedIds.includes(line.id);
          const editing = editingIds.includes(line.id);
          const error = receiptLineError(line);
          const productLookup = productNameLookups[line.id];
          const receiptBarcodeLookup = barcodeLookups[line.id];
          return (
            <div className={`receipt-line-card ${checked ? "receipt-line-card-checked" : ""} ${reviewObservations.length && activeSourceLineId === line.id ? "receipt-line-card-source-active" : ""}`} data-line-id={line.id} key={line.id}>
              <div className="receipt-line">
                <button className="receipt-line-toggle" type="button" aria-pressed={checked} aria-label={`${line.name} ${formatReceiptLineDetail(line)}${line.requiresReview ? " 확인 필요" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setActiveSourceLineId(line.id); onToggle(line.id); }}>
                  <span className={`check-box ${checked ? "check-box-checked" : ""}`}>{checked ? <CheckIcon width={13} height={13} /> : null}</span>
                  <img src={line.image} alt="" draggable={false} />
                  <span className="receipt-line-copy"><strong>{line.name || "상품명 확인"}</strong><small>{formatReceiptLineDetail(line)}</small>{line.barcode ? <small className="receipt-line-barcode">영수증 바코드 · {line.barcode}</small> : null}{line.matchSource && line.matchSource !== "parser" ? <small className="receipt-line-match-source">{receiptMatchSourceLabel(line.matchSource)}{line.matchCandidates && line.matchCandidates.length > 1 ? ` · 후보 ${line.matchCandidates.length}개` : ""}</small> : null}</span>
                  <span className={`ocr-confidence ${line.requiresReview ? "ocr-review" : ""}`}>{line.requiresReview ? "확인 필요" : `${Math.round(line.confidence * 100)}%`}</span>
                </button>
                <button className="receipt-line-edit-button" type="button" aria-expanded={editing} aria-label={`${line.name || "상품"} 항목 ${editing ? "수정 닫기" : "수정"}`} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setActiveSourceLineId(line.id); toggleEditing(line.id); }}>{editing ? "닫기" : "수정"}</button>
              </div>
              {editing ? (
                <div className="receipt-line-editor">
                  <div className="receipt-line-editor-heading"><strong>반영 전 보정</strong><small>OCR 원문: {line.rawName ?? line.name}</small></div>
                  <label className="receipt-line-editor-field"><span>상품명</span><KeyboardInput className="app-input" value={line.name} autoComplete="off" spellCheck={false} aria-label="상품명" onChange={(event) => onChange(line.id, { name: event.target.value })} onBlur={() => keyboard.hide()} /></label>
                  <div className="receipt-line-editor-grid">
                    <label className="receipt-line-editor-field"><span>수량</span><KeyboardInput className="app-input" type="number" inputMode="decimal" min="0.001" step="0.001" value={line.quantity} aria-label="수량" onChange={(event) => onChange(line.id, { quantity: event.target.value })} onBlur={() => keyboard.hide()} /></label>
                    <label className="receipt-line-editor-field"><span>단위</span><KeyboardInput className="app-input" value={line.unit} autoComplete="off" aria-label="단위" onChange={(event) => onChange(line.id, { unit: event.target.value })} onBlur={() => keyboard.hide()} /></label>
                  </div>
                  <div className="receipt-line-storage-field"><span>보관 위치</span><StoragePicker value={line.storage} locationId={line.storageLocationId} locations={storageLocations} label={`${line.name || "상품"} 보관 위치`} onChange={(storage, storageLocationId) => onChange(line.id, { storage, storageLocationId })} /><small>상품명 기준 추천이에요. 실제 구매 후 보관 위치를 확인해 주세요.</small></div>
                  {line.barcode ? (
                    <div className="receipt-barcode-lookup" role="group" aria-label={`${line.name || "상품"} 영수증 바코드 상품 조회`}>
                      <div className="receipt-barcode-lookup-heading"><span><strong>영수증 GTIN</strong><small>{line.barcode}</small></span><small>상품 식별자예요. 소비기한은 포장지 날짜로 확인해요.</small></div>
                      <button className="receipt-line-enrich-button" type="button" disabled={!mealApi.isConfigured || receiptBarcodeLookup === "loading"} onPointerDown={(event) => event.preventDefault()} onClick={() => onLookupBarcode(line)}>{receiptBarcodeLookup === "loading" ? "바코드 상품 조회 중" : mealApi.isConfigured ? "바코드로 상품 후보 조회" : "서버 연결 후 조회"}</button>
                      {receiptBarcodeLookup && receiptBarcodeLookup !== "loading" ? (
                        <div className={`receipt-product-lookup ${receiptBarcodeLookup.status === "matched" ? "" : "receipt-product-lookup-warning"}`} aria-live="polite">
                          {receiptBarcodeLookup.candidates.length ? <>{receiptBarcodeLookup.candidates.map((candidate) => <div className="receipt-product-candidate" key={`${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small>{[candidate.brand, candidate.category, candidate.quantity_text].filter(Boolean).join(" · ") || "상품 기본 정보"}</small><small className="receipt-line-match-source">{productSourceLabel(candidate.source)} · 신뢰도 {Math.round(candidate.confidence * 100)}% · {candidate.provenance_note}</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onApplyBarcodeCandidate(line.id, candidate)}>이 후보 적용</button></div>)}</> : null}
                          {receiptBarcodeLookup.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{warning}</small>)}
                          {!receiptBarcodeLookup.candidates.length && !receiptBarcodeLookup.warnings.length ? <small>바코드 상품 후보를 찾지 못했어요.</small> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button className="receipt-line-enrich-button" type="button" disabled={!line.name.trim() || productLookup === "loading"} onPointerDown={(event) => event.preventDefault()} onClick={() => onLookupProductName(line)}>{productLookup === "loading" ? "제품 기준 정보 조회 중" : "제품 기준 정보 조회"}</button>
                  {productLookup && productLookup !== "loading" ? (
                    <div className={`receipt-product-lookup ${productLookup.status === "matched" ? "" : "receipt-product-lookup-warning"}`}>
                      {productLookup.candidates.length ? <>{productLookup.candidates.map((candidate) => <div className="receipt-product-candidate" key={`${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small>{[candidate.brand, candidate.category, candidate.shelf_life_text ? `제품 기준 기간 참고: ${candidate.shelf_life_text}` : ""].filter(Boolean).join(" · ")}</small><small className="receipt-line-match-source">{productSourceLabel(candidate.source)} · {candidate.provenance_note}</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onApplyProductCandidate(line.id, candidate)}>이 후보 적용</button></div>)}{productLookup.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{warning}</small>)}</> : <small>{productLookup.warnings[0] ?? "제품 기준 후보를 찾지 못했어요."}</small>}
                    </div>
                  ) : null}
                  {line.matchCandidates?.filter((candidate) => candidate.source === "local_fixture" || candidate.source === "mfds_c005" || candidate.source === "mfds_i1250" || candidate.source === "open_food_facts").map((candidate) => <div className="receipt-product-candidate receipt-product-candidate-background" key={`background-${candidate.source}-${candidate.canonical_name}`}><span><strong>{candidate.canonical_name}</strong><small>{[candidate.brand, candidate.category, candidate.shelf_life_text ? `제품 기준 기간 참고: ${candidate.shelf_life_text}` : ""].filter(Boolean).join(" · ")}</small><small className="receipt-line-match-source">{productSourceLabel(candidate.source)} · {candidate.provenance_note}</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onApplyReceiptMatchCandidate(line.id, candidate)}>제품 기준 후보 적용</button></div>)}
                  {error ? <p className="receipt-line-error" role="alert"><InfoCircledIcon width={14} height={14} />{error}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button className="primary-sheet-button" type="button" disabled={reviewCount === 0 || invalidSelectedLines.length > 0} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); onSubmit(); }}><CheckIcon width={17} height={17} /> {reviewCount}개 항목 반영하기</button>
      <p className="sheet-footnote">영수증에는 보통 소비기한이 없어서, 날짜는 포장지 확인 전까지 ‘확인 필요’로 남겨요. 이 화면에서 수정한 상품명·수량·단위는 사용자 확인값으로 기록합니다.</p>
    </div>
  );
}

export default function AddFoodSheet({
  mode,
  onModeChange,
  onAddManual,
  onAddReceipt,
  resumeReceiptId,
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
}: {
  mode: AddMode;
  onModeChange: (mode: AddMode) => void;
  onAddManual: (food: FoodItem) => void;
  onAddReceipt: (payload: ReceiptCommitPayload) => void;
  resumeReceiptId?: string | null;
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
}) {
  const keyboard = useKeyboard();
  const [receiptStage, setReceiptStage] = useState<"idle" | "processing" | "review" | "unavailable">("idle");
  const [receiptSource, setReceiptSource] = useState("샘플 영수증");
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptPreviewKind, setReceiptPreviewKind] = useState<SourcePreviewKind | null>(null);
  const [receiptTemplateId, setReceiptTemplateId] = useState<ReceiptTemplateId | null>(null);
  const [receiptTemplateConfidence, setReceiptTemplateConfidence] = useState<number | null>(null);
  const [receiptMerchantName, setReceiptMerchantName] = useState<string | null>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const modeTabRefs = useRef<Record<AddMode, HTMLButtonElement | null>>({ receipt: null, barcode: null, label: null, manual: null });
  const [receiptReviewObservations, setReceiptReviewObservations] = useState<ApiOcrReviewObservation[]>([]);
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>(initialReceiptLines);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>(initialReceiptLines.map((line) => line.id));
  const [receiptDraftId, setReceiptDraftId] = useState<string | undefined>();
  const [receiptResumed, setReceiptResumed] = useState(false);
  const [receiptQualityWarnings, setReceiptQualityWarnings] = useState<string[]>([]);
  const [receiptError, setReceiptError] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [barcodeParse, setBarcodeParse] = useState<ApiBarcodeParse | null>(null);
  const [barcodeLookup, setBarcodeLookup] = useState<ApiProductLookup | null>(null);
  const [productNameLookups, setProductNameLookups] = useState<Record<string, ApiProductNameLookup | "loading">>({});
  const [barcodeLookups, setBarcodeLookups] = useState<Record<string, ApiProductLookup | "loading">>({});
  const [productEnrichmentJob, setProductEnrichmentJob] = useState<ApiProductEnrichmentJob | null>(null);
  const [productEnrichmentError, setProductEnrichmentError] = useState("");
  const [labelResult, setLabelResult] = useState(false);
  const [labelDetectedDate, setLabelDetectedDate] = useState("2026.09.02");
  const [labelDateKind, setLabelDateKind] = useState<LabelDateKind | null>("use_by");
  const [labelDetectedProductName, setLabelDetectedProductName] = useState("시금치");
  const [labelDetectedStorage, setLabelDetectedStorage] = useState<StorageType | null>("냉장");
  const [labelDetectedStorageLocationId, setLabelDetectedStorageLocationId] = useState<string | null>(null);
  const [labelStorageHint, setLabelStorageHint] = useState<ApiStorageType | undefined>("refrigerated");
  const [labelDetectedStorageConditionText, setLabelDetectedStorageConditionText] = useState<string | undefined>("포장지에 냉장 보관 표시");
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null);
  const labelPreviewUrlRef = useRef<string | null>(null);
  const [labelSourceAspectRatio, setLabelSourceAspectRatio] = useState<number | null>(null);
  const [labelReviewObservations, setLabelReviewObservations] = useState<ApiOcrReviewObservation[]>([]);
  const [labelDateObservationIds, setLabelDateObservationIds] = useState<string[]>([]);
  const [labelLotAction, setLabelLotAction] = useState<"create" | "correct">("create");
  const [labelTargetFoodId, setLabelTargetFoodId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<"receipt" | "label" | null>(null);
  const receiptRequestGeneration = useRef(0);
  const labelRequestGeneration = useRef(0);
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
  const [productBrand, setProductBrand] = useState("직접 추가한 식품");
  const [productCategory, setProductCategory] = useState("기타");
  const [productProvenance, setProductProvenance] = useState<FoodItem["productProvenance"]>(undefined);
  const barcodeDateCandidate = barcodeParse?.date_assertions[0] ?? null;
  const barcodeProviderNotice = getBarcodeProviderNotice(barcodeLookup);
  const normalizedLabelProductName = normalizeFoodName(labelDetectedProductName);
  const labelTargetCandidates = normalizedLabelProductName
    ? existingFoods.filter((food) => normalizeFoodName(food.name) === normalizedLabelProductName)
    : [];

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
    if (resumeReceiptId || !sessionKey) return;
    resetReceiptSession();
  }, [resumeReceiptId, sessionKey]);

  useEffect(() => {
    if (!resumeReceiptId || mode !== "receipt" || !mealApi.isConfigured) return;
    let active = true;
    const requestGeneration = receiptRequestGeneration.current + 1;
    receiptRequestGeneration.current = requestGeneration;
    receiptAbortController.current?.abort();
    receiptAbortController.current = null;
    setReceiptStage("processing");
    setReceiptError("");
    setReceiptSource("저장된 영수증 검수");
    setReceiptDraftId(resumeReceiptId);
    setReceiptResumed(false);
    setReceiptReviewObservations([]);
    setReceiptQualityWarnings([]);
    void mealApi.getReceiptDraft(resumeReceiptId).then((draft) => {
      if (!active || requestGeneration !== receiptRequestGeneration.current) return;
      if (!draft || draft.status !== "review_required" || draft.stock_created) {
        setReceiptError("이 영수증 검수 초안을 더 이상 이어갈 수 없어요. 영수증을 다시 선택해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      const mappedLines = mapReceiptDraftLines(draft, storageFromApi, imageForFoodName);
      if (!mappedLines.length) {
        setReceiptError("저장된 검수 초안에서 상품 line을 찾지 못했어요. 영수증을 다시 선택해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      setReceiptLines(mappedLines);
      setSelectedReceiptIds(mappedLines.map((line) => line.id));
      setReceiptSource(draft.source_filename?.trim() || "저장된 영수증 검수");
      setReceiptDraftId(draft.id);
      setReceiptTemplateId(draft.template_id ?? null);
      setReceiptTemplateConfidence(draft.template_confidence ?? null);
      setReceiptMerchantName(draft.merchant_name ?? null);
      setReceiptStage("review");
      setReceiptResumed(true);
    }).catch(() => {
      if (!active || requestGeneration !== receiptRequestGeneration.current) return;
      setReceiptError("저장된 영수증 검수 초안을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setReceiptStage("unavailable");
    });
    return () => {
      active = false;
    };
  }, [imageForFoodName, mode, resumeReceiptId, sessionKey, storageFromApi]);

  useEffect(() => () => {
    receiptRequestGeneration.current += 1;
    labelRequestGeneration.current += 1;
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

  const switchMode = (nextMode: AddMode) => {
    keyboard.hide();
    receiptRequestGeneration.current += 1;
    labelRequestGeneration.current += 1;
    receiptAbortController.current?.abort();
    labelAbortController.current?.abort();
    receiptAbortController.current = null;
    labelAbortController.current = null;
    setCameraTarget(null);
    onModeChange(nextMode);
    setBarcodeResult(null);
    setBarcodeParse(null);
    setBarcodeLookup(null);
    setScannerOpen(false);
    setLabelResult(false);
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
    setReceiptStage("idle");
    replaceReceiptPreview(null);
    setReceiptReviewObservations([]);
    setReceiptError("");
    setReceiptLines(initialReceiptLines);
    setSelectedReceiptIds(initialReceiptLines.map((line) => line.id));
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
    setPriorityInference(null);
    setPriorityInferenceError("");
    setPriorityInferenceLoading(false);
    clearProductCandidate();
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
      setReceiptStage("review");
      receiptAbortController.current = null;
      return;
    }
    setReceiptStage("processing");
    try {
      const intake = await mealApi.intakeReceipt(file, abortController.signal);
      if (abortController.signal.aborted || requestGeneration !== receiptRequestGeneration.current) return;
      if (!intake || intake.status !== "review_required" || !intake.draft) {
        setReceiptError(intake?.message ?? "OCR 엔진 응답이 없습니다.");
        setReceiptStage("unavailable");
        return;
      }
      const mappedLines = mapReceiptDraftLines(intake.draft, storageFromApi, imageForFoodName);
      if (!mappedLines.length) {
        setReceiptError("상품 line을 찾지 못했습니다. 사진을 다시 촬영해 주세요.");
        setReceiptStage("unavailable");
        return;
      }
      setReceiptLines(mappedLines);
      setSelectedReceiptIds(mappedLines.map((line) => line.id));
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
        ? "영수증 검수 초안을 저장하지 못했어요. 같은 사진을 다시 선택해 주세요."
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
          warnings: ["제품 기준 정보를 불러오지 못했어요."],
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
          warnings: ["제품 기준 정보 조회를 완료하지 못했어요."],
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
          warnings: ["바코드 상품 후보를 불러오지 못했어요."],
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
          warnings: ["바코드 상품 후보 조회를 완료하지 못했어요."],
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
        setProductEnrichmentError("제품정보 조회를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
        ? "제품정보 조회 작업을 저장하지 못했어요. 검수 상태를 유지했어요."
        : "제품정보 조회를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const retryReceiptProductEnrichment = async () => {
    if (!receiptDraftId || !mealApi.isConfigured) return;
    setProductEnrichmentError("");
    try {
      const job = await mealApi.retryProductEnrichment(receiptDraftId);
      if (!job) {
        setProductEnrichmentError("제품정보 조회를 재시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setProductEnrichmentJob(job);
    } catch (reason) {
      setProductEnrichmentError(isMealApiProductEnrichmentPersistenceError(reason)
        ? "제품정보 조회 재시작을 저장하지 못했어요. 기존 작업 상태를 유지했어요."
        : "제품정보 조회를 재시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const lookupBarcode = async (input: string) => {
    const rawBarcode = input.trim();
    setBarcodeResult(rawBarcode ? "바코드 형식을 확인하고 있어요" : "예시 바코드를 입력하면 상품 후보를 보여드려요");
    setBarcodeParse(null);
    setBarcodeLookup(null);
    keyboard.hide();
    if (!rawBarcode || !mealApi.isConfigured) {
      if (rawBarcode) setBarcodeResult("풀무원 국산콩 두부 · 상품 후보 1개");
      return;
    }
    try {
      const parsed = await mealApi.parseBarcode(rawBarcode);
      if (!parsed) return;
      const dateCandidate = parsed.date_assertions[0] ?? null;
      setBarcodeParse(parsed);
      if (dateCandidate) {
        setBarcodeResult(`GS1 날짜 후보 ${dateCandidate.value.replaceAll("-", ".")} · 라벨 확인 필요`);
      }
      if (parsed.barcode_type === "restricted_circulation") {
        setBarcodeResult("가변중량·매장용 코드 후보 · 상품/중량 확인 필요");
        return;
      }
      const lookup = await mealApi.resolveProduct(parsed.gtin ?? rawBarcode);
      setBarcodeLookup(lookup ?? null);
      const candidate = lookup?.candidates[0];
      if (candidate) {
        const freshness = candidate.source_freshness === "legacy" ? " · 오래된 공공데이터 후보" : "";
        const candidateLabel = `${candidate.brand ? `${candidate.brand} ` : ""}${candidate.canonical_name} · 상품 후보 ${lookup?.candidates.length ?? 1}개${freshness}`;
        setBarcodeResult(dateCandidate ? `${candidateLabel} · GS1 ${labelDateKindLabel(dateCandidate.kind)} 후보 함께 확인` : candidateLabel);
      } else if (!dateCandidate) {
        setBarcodeResult(lookup?.warnings[0] ?? parsed.warnings[0] ?? "상품 후보를 찾지 못했어요");
      }
    } catch {
      setBarcodeLookup(null);
      setBarcodeResult("바코드 서버 조회를 완료하지 못했어요");
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
    setProductBrand(candidate.brand?.trim() || "상품 정보 확인 필요");
    setProductCategory(candidate.category?.trim() || "기타");
    setProductProvenance(productProvenanceFromCandidate(candidate));
    setBarcodeLookup(null);
    setBarcodeResult(null);
    keyboard.hide();
    onModeChange("manual");
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
      setProductBrand(product.brand?.trim() || "상품 정보 확인 필요");
      setProductCategory(product.category?.trim() || "기타");
      setProductProvenance(productProvenanceFromCandidate(product));
    }
    setBarcodeLookup(null);
    setBarcodeResult(null);
    keyboard.hide();
    onModeChange("manual");
  };

  const applyLabelSample = () => {
    keyboard.hide();
    replaceLabelPreview(null);
    setLabelReviewObservations([]);
    setLabelDateObservationIds([]);
    setLabelError("");
    setLabelDetectedDate("2026.09.02");
    setLabelDateKind("use_by");
    setLabelDetectedProductName("시금치");
    setLabelDetectedStorage("냉장");
    setLabelDetectedStorageLocationId(null);
    setLabelStorageHint("refrigerated");
    setLabelDetectedStorageConditionText("포장지에 냉장 보관 표시");
    setLabelLotAction("create");
    setLabelTargetFoodId(null);
    setLabelResult(true);
  };

  const handleLabelFile = async (file: File) => {
    const requestGeneration = labelRequestGeneration.current + 1;
    labelRequestGeneration.current = requestGeneration;
    labelAbortController.current?.abort();
    const abortController = new AbortController();
    labelAbortController.current = abortController;
    keyboard.hide();
    replaceLabelPreview(file);
    setLabelReviewObservations([]);
    setLabelDateObservationIds([]);
    setLabelDetectedStorageConditionText(undefined);
    setLabelError("");
    setLabelResult(false);
    setLabelDateKind(null);
    setLabelDetectedProductName("");
    setLabelDetectedStorage(null);
    setLabelDetectedStorageLocationId(null);
    setLabelStorageHint(undefined);
    setLabelLotAction("create");
    setLabelTargetFoodId(null);
    if (!mealApi.isConfigured) {
      setLabelResult(false);
      setLabelError("서버 OCR이 연결되지 않아 실제 라벨을 분석하지 못했어요.");
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
        setLabelError(intake?.warnings?.[0] ?? "소비기한을 확인하지 못했습니다. 다른 면을 촬영해 주세요.");
        setLabelResult(false);
        return;
      }
      setLabelDetectedProductName(intake.product_name?.trim() || "");
      const storageHint = intake.storage_hint === "ambient" || intake.storage_hint === "refrigerated" || intake.storage_hint === "frozen" ? intake.storage_hint : undefined;
      setLabelStorageHint(storageHint);
      setLabelDetectedStorageLocationId(null);
      if (intake.storage_hint === "ambient") setLabelDetectedStorage("실온");
      if (intake.storage_hint === "refrigerated") setLabelDetectedStorage("냉장");
      if (intake.storage_hint === "frozen") setLabelDetectedStorage("냉동");
      if (!storageHint) setLabelDetectedStorage(null);
      setLabelDetectedStorageConditionText(intake.storage_condition_text ?? undefined);
      if (!dateCandidate) {
        setLabelError(intake.warnings?.[0] ?? "소비기한을 확인하지 못했습니다. 다른 면을 촬영해 주세요.");
        setLabelResult(false);
        return;
      }
      setLabelDetectedDate(dateCandidate.value.replaceAll("-", "."));
      setLabelDateKind(candidateKind);
      setLabelError(candidateKind ? (intake.warnings?.[0] ?? "") : (intake.warnings?.[0] ?? "날짜 숫자는 읽었지만 의미를 확인하지 못했어요. 원본 라벨에서 날짜 종류를 선택해 주세요."));
      setLabelResult(true);
    } catch {
      if (abortController.signal.aborted || requestGeneration !== labelRequestGeneration.current) return;
      setLabelError("파일을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLabelResult(false);
    } finally {
      if (labelAbortController.current === abortController) labelAbortController.current = null;
      if (!abortController.signal.aborted && requestGeneration === labelRequestGeneration.current) setLabelProcessing(false);
    }
  };

  const submitLabel = () => {
    const normalizedName = labelDetectedProductName.trim();
    if (!labelDateKind || !labelDetectedStorage || !normalizedName || !isCompleteLabelDate(labelDetectedDate)) return;
    if (labelLotAction === "correct" && !labelTargetFoodId) return;
    keyboard.hide();
    onAddManual(createFood({
      lotAction: labelLotAction,
      targetFoodId: labelLotAction === "correct" ? labelTargetFoodId ?? undefined : undefined,
      name: normalizedName,
      brand: "라벨 확인 필요",
      quantity: "1개",
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

  const submitManual = () => {
    const normalizedName = foodName.trim();
    if (!normalizedName) return;
    const dateCandidate = barcodeDateCandidate;
    keyboard.hide();
    onAddManual(createFood({
      name: normalizedName,
      quantity: quantity.trim() || "1개",
      storage,
      storageLocationId: storageLocationId ?? undefined,
      storageLocationName: storageLocationId ? storageLocations.find((location) => location.id === storageLocationId)?.name : undefined,
      brand: productBrand,
      category: productCategory,
      productProvenance,
      dateLabel: dateCandidate ? formatApiDate(dateCandidate.value) : "확인 필요",
      dateDetail: dateCandidate ? `${barcodeDateKindLabel(dateCandidate.kind)} ${dateCandidate.value.replaceAll("-", ".")}` : "날짜 확인 필요",
      dateKind: dateCandidate ? "actual_printed" : "unknown",
      dateAssertionKind: dateCandidate?.kind,
      dateSource: dateCandidate ? `gs1:${barcodeParse?.lot ?? ""}` : "사용자 입력",
      note: dateCandidate ? `GS1 바코드 날짜 후보를 기록했어요.${barcodeParse?.lot ? ` ${barcodeParse.lot}도 함께 확인했어요.` : ""} 포장지와 실제 lot를 다시 확인해 주세요.` : "실제 소비기한이 아니라 먼저 확인할 순서예요. 표시 날짜를 확인하면 직접 갱신할 수 있어요.",
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
      setPriorityInferenceError("우선순위 추정을 완료하지 못했어요. 포장지 날짜를 직접 확인해 주세요.");
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

  return (
    <div className="add-sheet-content">
      <div className="mode-tabs" role="tablist" aria-label="식품 추가 방법">
        {([
          ["receipt", "영수증", FileTextIcon],
          ["barcode", "바코드", CameraIcon],
          ["label", "라벨", CalendarIcon],
          ["manual", "직접 입력", PlusIcon],
        ] as const).map(([tabMode, label, Icon]) => (
          <button
            key={tabMode}
            ref={(element) => { modeTabRefs.current[tabMode] = element; }}
            id={`add-mode-tab-${tabMode}`}
            className={`mode-tab ${mode === tabMode ? "mode-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={mode === tabMode}
            aria-controls={`add-mode-panel-${tabMode}`}
            tabIndex={mode === tabMode ? 0 : -1}
            onKeyDown={handleModeTabKeyDown}
            onClick={() => switchMode(tabMode)}
          >
            <Icon width={16} height={16} />{label}
          </button>
        ))}
      </div>

      <div className="mode-tabpanel" id={`add-mode-panel-${mode}`} role="tabpanel" aria-labelledby={`add-mode-tab-${mode}`} tabIndex={0}>
      {mode === "receipt" ? (
        cameraTarget === "receipt" ? (
          <CameraCapture title="영수증" detail="영수증 전체가 보이도록 맞춰 주세요." onFile={(file) => { setCameraTarget(null); void handleReceiptFile(file); }} onCancel={() => setCameraTarget(null)} />
        ) : (
          <>
            {receiptStage === "idle" ? (
              <div className="capture-intro">
                <div className="capture-visual"><UploadIcon width={25} height={25} /></div>
                <h3>영수증 한 장이면 충분해요</h3>
                <p>카메라로 영수증을 바로 찍거나 사진을 선택하면<br />상품명과 수량 후보를 만들어 드려요.</p>
                <CaptureActions label="영수증 이미지 입력 방법" allowPdf onFile={handleReceiptFile} onCameraOpen={() => setCameraTarget("receipt")} />
                <button className="secondary-sheet-button" type="button" onClick={() => { replaceReceiptPreview(null); setReceiptReviewObservations([]); setReceiptSource("샘플 영수증 · 10개 품목"); setReceiptLines(initialReceiptLines); setSelectedReceiptIds(initialReceiptLines.map((line) => line.id)); setProductNameLookups({}); setBarcodeLookups({}); setProductEnrichmentJob(null); setProductEnrichmentError(""); setReceiptDraftId(undefined); setReceiptResumed(false); setReceiptTemplateId(null); setReceiptTemplateConfidence(null); setReceiptMerchantName(null); setReceiptQualityWarnings([]); setReceiptStage("review"); }}>샘플 영수증으로 시작</button>
                <div className="capture-hint"><CheckIcon width={14} height={14} /> 카메라 권한이 없거나 촬영이 어려우면 사진에서 선택할 수 있어요. 전자 영수증 PDF도 지원하며, OCR 결과는 반영 전에 직접 확인합니다.</div>
              </div>
            ) : receiptStage === "processing" ? (
              <ProcessingState label="영수증을 읽고 있어요" detail="파일을 서버로 보내 OCR 가능 여부와 상품 후보를 확인합니다." />
            ) : receiptStage === "unavailable" ? (
              <UnavailableState message={receiptError} onBack={() => { replaceReceiptPreview(null); setReceiptReviewObservations([]); setReceiptStage("idle"); }} />
            ) : (
              <ReceiptReview lines={receiptLines} qualityWarnings={receiptQualityWarnings} source={receiptSource} resumedFromDraft={receiptResumed} sourcePreviewUrl={receiptPreviewUrl} sourcePreviewKind={receiptPreviewKind} templateId={receiptTemplateId} templateConfidence={receiptTemplateConfidence} merchantName={receiptMerchantName} reviewObservations={receiptReviewObservations} selectedIds={selectedReceiptIds} onToggle={(id) => setSelectedReceiptIds((ids) => ids.includes(id) ? ids.filter((currentId) => currentId !== id) : [...ids, id])} onChange={(id, changes) => setReceiptLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line))} onSubmit={submitReceipt} onBack={() => { replaceReceiptPreview(null); setReceiptReviewObservations([]); setReceiptResumed(false); setReceiptStage("idle"); }} formatReceiptLineDetail={formatReceiptLineDetail} receiptLineError={receiptLineError} productNameLookups={productNameLookups} onLookupProductName={lookupReceiptProductName} onApplyProductCandidate={applyReceiptProductCandidate} onApplyReceiptMatchCandidate={applyReceiptMatchCandidate} barcodeLookups={barcodeLookups} onLookupBarcode={lookupReceiptBarcode} onApplyBarcodeCandidate={applyReceiptBarcodeCandidate} storageLocations={storageLocations} receiptDraftId={receiptDraftId} productEnrichmentJob={productEnrichmentJob} productEnrichmentError={productEnrichmentError} onEnqueueProductEnrichment={() => void enqueueReceiptProductEnrichment()} onRetryProductEnrichment={() => void retryReceiptProductEnrichment()} />
            )}
          </>
        )
      ) : null}

      {mode === "barcode" ? (
        <div className="input-flow">
          <div className="capture-visual compact"><CameraIcon width={25} height={25} /></div>
          <h3>바코드로 상품을 찾기</h3>
          <p>상품 바코드만으로는 소비기한을 알 수 없어요.<br />상품 정보를 찾아 보관 기준을 먼저 채워드려요.</p>
          <label className="app-input-label" htmlFor="barcode-input">바코드 숫자</label>
          <KeyboardInput id="barcode-input" className="app-input" value={barcode} inputMode="numeric" placeholder="예: 8801114167523" onChange={(event) => setBarcode(event.target.value)} onBlur={() => keyboard.hide()} />
          <button className="primary-sheet-button" type="button" onClick={() => setScannerOpen(true)}><CameraIcon width={17} height={17} /> 카메라로 스캔</button>
          {scannerOpen ? <Suspense fallback={<div className="scanner-loading" role="status">바코드 스캐너를 준비하고 있어요</div>}><BarcodeScanner onDetected={(value) => { setBarcode(value); setScannerOpen(false); void lookupBarcode(value); }} onCancel={() => setScannerOpen(false)} /></Suspense> : null}
          <button className="secondary-sheet-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void lookupBarcode(barcode)}><ReaderIcon width={17} height={17} /> 상품 후보 조회</button>
          <button className="secondary-sheet-button" type="button" onClick={() => { setBarcode("8801114167523"); setBarcodeParse(null); setBarcodeResult("풀무원 국산콩 두부 · 상품 후보 1개"); }}>예시 바코드 입력</button>
          {barcodeResult ? <div className={`result-callout ${barcodeLookup?.status === "provider_unavailable" ? "result-callout-warning" : ""}`}><CheckCircledIcon width={17} height={17} /><span><strong>{barcodeResult}</strong><small>소비기한은 포장지의 날짜를 촬영해 확인해 주세요.</small></span></div> : null}
          {barcodeProviderNotice ? <div className="barcode-provider-warning" role="status"><InfoCircledIcon width={16} height={16} /><span><strong>일부 상품 source 확인 필요</strong><small>{barcodeProviderNotice}</small></span></div> : null}
          {barcodeDateCandidate ? <div className="barcode-date-candidate" role="group" aria-label="GS1 날짜 후보"><div><strong>{barcodeDateKindLabel(barcodeDateCandidate.kind)} {barcodeDateCandidate.value.replaceAll("-", ".")}</strong><small>GS1 AI {barcodeDateCandidate.ai}{barcodeLookup?.candidates[0] ? " · 상품 후보와 함께 확인했어요." : " · 상품 후보를 별도로 확인해 주세요."}</small><small>포장지와 실제 lot를 확인한 뒤 날짜 후보로 반영할 수 있어요.</small></div><button className="candidate-apply-button" type="button" onClick={applyBarcodeDateCandidate}>상품·날짜를 입력에 반영</button></div> : null}
          {barcodeLookup?.candidates.length ? (
            <div className="barcode-candidate-list" aria-label="바코드 상품 후보">
              {barcodeLookup.candidates.map((candidate) => (
                <div className="barcode-candidate-card" key={`${candidate.source}-${candidate.canonical_name}`}>
                  <div className="barcode-candidate-copy">
                    <strong>{candidate.brand ? `${candidate.brand} ` : ""}{candidate.canonical_name}</strong>
                    <small>{productSourceLabel(candidate.source)} · 신뢰도 {Math.round(candidate.confidence * 100)}% · {productFreshnessLabel(candidate.source_freshness)}</small>
                    <small>{[candidate.category, candidate.quantity_text].filter(Boolean).join(" · ") || "상품 기본 정보"}</small>
                    {candidate.shelf_life_text ? <small>제품 기준 기간 참고: {candidate.shelf_life_text}</small> : null}
                    {candidate.storage_hint ? <small>보관 힌트: {candidate.storage_hint === "frozen" ? "냉동" : candidate.storage_hint === "refrigerated" ? "냉장" : "실온"}</small> : null}
                    <small className="barcode-candidate-provenance">{candidate.provenance_note}</small>
                  </div>
                  <button className="candidate-apply-button" type="button" onClick={() => applyBarcodeCandidate(candidate)}>이름 채우기</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "label" ? (
        cameraTarget === "label" ? (
          <CameraCapture title="라벨" detail="날짜가 보이는 포장 면을 맞춰 주세요." onFile={(file) => { setCameraTarget(null); void handleLabelFile(file); }} onCancel={() => setCameraTarget(null)} />
        ) : (
          <div className="input-flow">
            <div className="capture-visual compact"><CalendarIcon width={25} height={25} /></div>
            <h3>포장지 날짜를 읽어볼게요</h3>
            <p>카메라로 날짜가 보이는 면을 찍거나 사진을 선택하면<br />실제 표시 문구와 날짜 후보를 확인합니다.</p>
            <CaptureActions label="라벨 이미지 입력 방법" onFile={handleLabelFile} onCameraOpen={() => setCameraTarget("label")} disabled={labelProcessing} />
            <button className="secondary-sheet-button capture-sample-button" type="button" onClick={applyLabelSample} disabled={labelProcessing}><CameraIcon width={17} height={17} /> 샘플 라벨 인식</button>
            {labelProcessing ? <ProcessingState label="라벨을 읽고 있어요" detail="표시 날짜와 보관 조건 후보를 확인하는 중입니다." /> : null}
            <div className="capture-hint"><InfoCircledIcon width={14} height={14} /> 권한이 없으면 사진에서 선택하세요. 날짜 의미는 사용자가 확인하기 전까지 소비기한으로 확정하지 않아요.</div>
            {labelPreviewUrl ? <LabelSourcePreview sourcePreviewUrl={labelPreviewUrl} sourceAspectRatio={labelSourceAspectRatio} reviewObservations={labelReviewObservations} activeObservationIds={labelDateObservationIds} onImageLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setLabelSourceAspectRatio(image.naturalWidth / image.naturalHeight); }} /> : null}
            {labelError ? <div className="result-callout result-callout-warning" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{labelError}</strong><small>{labelDateKind ? "원본 라벨과 표시 날짜를 확인한 뒤 반영해 주세요." : labelResult ? "날짜 숫자는 후보로만 남겨두고, 의미를 선택하기 전에는 저장하지 않아요." : "날짜가 없는 면이라면 다른 면을 촬영하거나 직접 입력으로 이어갈 수 있어요."}</small></span>{!labelResult ? <button className="result-callout-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={continueWithManual}>직접 입력으로 계속</button> : null}</div> : null}
            {labelResult ? (
              <div className={`label-result-card ${!labelDateKind || !labelDetectedStorage ? "label-result-card-ambiguous" : ""}`}>
                <div className="label-result-fields">
                  <label className="label-result-name-field"><span>상품명</span><KeyboardInput className="app-input" value={labelDetectedProductName} placeholder="상품명을 입력해 주세요" autoComplete="off" spellCheck={false} aria-label="라벨 상품명" onChange={(event) => { setLabelDetectedProductName(event.target.value); setLabelLotAction("create"); setLabelTargetFoodId(null); }} onBlur={() => keyboard.hide()} /></label>
                  {labelDateKind ? (
                    <div className="label-date-kind-summary">
                      <strong data-label-date-candidate="true">{labelDateKindLabel(labelDateKind)} {labelDetectedDate}</strong>
                      <button className="label-date-kind-edit" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => setLabelDateKind(null)}>날짜 의미 변경</button>
                    </div>
                  ) : (
                    <div className="label-date-meaning-review" role="group" aria-label="라벨 날짜 의미 확인">
                      <strong>날짜 의미를 확인해 주세요</strong>
                      <small>OCR은 숫자만 읽었어요. 원본 라벨에서 이 날짜가 무엇을 뜻하는지 선택해 주세요.</small>
                      <div className="label-date-kind-options" role="radiogroup" aria-label="표시 날짜 종류">
                        {LABEL_DATE_KINDS.map((kind) => <button key={kind} className={`label-date-kind-option ${labelDateKind === kind ? "label-date-kind-option-active" : ""}`} type="button" role="radio" aria-checked={labelDateKind === kind} onPointerDown={(event) => event.preventDefault()} onClick={() => setLabelDateKind(kind)}>{labelDateKindChoiceLabel(kind)}</button>)}
                      </div>
                    </div>
                  )}
                  <label className="label-result-date-field"><span>{labelDateKind ? "표시 날짜 확인" : "읽힌 날짜 후보"}</span><KeyboardInput className="app-input" type="date" value={labelDateInputValue(labelDetectedDate)} aria-label="라벨 표시 날짜" onChange={(event) => setLabelDetectedDate(event.target.value.replaceAll("-", "."))} onBlur={() => keyboard.hide()} /></label>
                  <small>{labelDateKind ? (labelDateKind === "use_by" || labelDateKind === "sell_by" || labelDateKind === "best_before" ? "소비 우선순위와 별도로 표시 날짜를 기록해요." : "소비기한이 아닌 날짜 후보예요. 소비기한·보관 방법을 따로 확인해 주세요.") : "포장일·유효일 중 어느 쪽인지 원본 라벨에서 확인한 뒤 종류를 선택해 주세요."}</small>
                  {labelDetectedStorageConditionText ? <small className="label-storage-condition-note">포장지 보관 조건: {labelDetectedStorageConditionText}</small> : null}
                  <StoragePicker value={labelDetectedStorage} locationId={labelDetectedStorageLocationId} locations={storageLocations} onChange={(nextStorage, nextLocationId) => { setLabelDetectedStorage(nextStorage); setLabelDetectedStorageLocationId(nextLocationId); }} label="라벨 식품 보관 위치" />
                  {!labelDetectedStorage ? <small className="label-storage-required">보관 위치도 확인한 뒤 저장할 수 있어요.</small> : null}
                  {labelTargetCandidates.length ? (
                    <div className="label-lot-target" role="group" aria-label="날짜를 반영할 식품 lot">
                      <div className="label-lot-target-heading"><strong>같은 상품 기록이 있어요</strong><small>새로 산 제품이면 새 lot으로 추가하고, 기존 기록의 포장지를 확인한 경우에만 해당 lot을 선택하세요.</small></div>
                      <div className="label-lot-target-options" role="radiogroup" aria-label="날짜를 반영할 lot 선택">
                        <button className={`label-lot-target-option ${labelLotAction === "create" ? "label-lot-target-option-active" : ""}`} type="button" role="radio" aria-checked={labelLotAction === "create"} onPointerDown={(event) => event.preventDefault()} onClick={() => { setLabelLotAction("create"); setLabelTargetFoodId(null); }}>
                          <span><strong>새 구매 lot으로 추가</strong><small>기존 재고와 날짜·수량을 분리해요</small></span>
                        </button>
                        {labelTargetCandidates.map((food) => (
                          <button className={`label-lot-target-option ${labelLotAction === "correct" && labelTargetFoodId === food.id ? "label-lot-target-option-active" : ""}`} type="button" role="radio" aria-checked={labelLotAction === "correct" && labelTargetFoodId === food.id} key={food.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { setLabelLotAction("correct"); setLabelTargetFoodId(food.id); }}>
                            <span><strong>기존 lot · {food.quantity}</strong><small>{food.storage} · {food.dateLabel} · {food.brand}</small></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <span className={`confirmed-badge ${!labelDateKind || !labelDetectedStorage ? "review-badge" : ""}`}><CheckIcon width={13} height={13} /> {labelDateKind && labelDetectedStorage ? "표시 후보" : "추가 확인 필요"}</span>
                <button type="button" disabled={!labelDateKind || !labelDetectedStorage || !labelDetectedProductName.trim() || !isCompleteLabelDate(labelDetectedDate) || (labelLotAction === "correct" && !labelTargetFoodId)} onPointerDown={(event) => { event.preventDefault(); submitLabel(); }} onClick={(event) => { if (event.detail === 0) submitLabel(); }}>{labelDateKind && labelDetectedStorage ? "확인 후 반영" : "날짜·보관 위치를 확인해 주세요"}</button>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {mode === "manual" ? (
        <div className="input-flow manual-flow">
          <div className="manual-note"><InfoCircledIcon width={17} height={17} /><span>날짜가 없거나 신선식품이면 먼저 이름과 보관 위치만 기록해도 괜찮아요.</span></div>
          <label className="app-input-label" htmlFor="food-name-input">식품 이름</label>
          <KeyboardInput id="food-name-input" className="app-input" value={foodName} placeholder="예: 대파, 김치, 남은 카레" onChange={(event) => { setFoodName(event.target.value); setPriorityInference(null); setPriorityInferenceError(""); if (productProvenance) clearProductCandidate(); }} onBlur={() => keyboard.hide()} />
          <label className="app-input-label" htmlFor="food-quantity-input">수량</label>
          <KeyboardInput id="food-quantity-input" className="app-input" value={quantity} placeholder="예: 1팩" onChange={(event) => setQuantity(event.target.value)} onBlur={() => keyboard.hide()} />
          <span className="app-input-label">보관 위치</span>
          <StoragePicker value={storage} locationId={storageLocationId} locations={storageLocations} onChange={(nextStorage, nextLocationId) => { setStorage(nextStorage); setStorageLocationId(nextLocationId); setPriorityInference(null); setPriorityInferenceError(""); }} />
          <div className="manual-note"><InfoCircledIcon width={17} height={17} /><span>표시 날짜가 없을 때는 상품명과 보관 위치로 먼저 확인할 순서를 계산할 수 있어요. 소비기한을 확정하는 기능은 아니에요.</span></div>
          <button className="secondary-sheet-button" type="button" disabled={!foodName.trim() || priorityInferenceLoading || !mealApi.isConfigured} onPointerDown={(event) => event.preventDefault()} onClick={() => void requestPriorityInference()}>{priorityInferenceLoading ? "우선순위 계산 중" : "먼저 먹을 순서 확인"}<ReaderIcon width={17} height={17} /></button>
          {priorityInferenceError ? <div className="result-callout result-callout-warning" role="alert"><InfoCircledIcon width={17} height={17} /><span><strong>{priorityInferenceError}</strong><small>실제 포장지 표시 날짜와 보관 상태를 우선 확인해 주세요.</small></span></div> : null}
          {priorityInference ? <div className={`result-callout ${priorityInference.abstained ? "result-callout-warning" : ""}`} role={priorityInference.abstained ? "status" : undefined}><InfoCircledIcon width={17} height={17} /><span><strong>{priorityInference.abstained ? "추정하지 않고 확인을 요청했어요" : `먼저 확인할 기간 · ${priorityInference.estimated_use_first_window ? `${formatApiDate(priorityInference.estimated_use_first_window.start_date)}~${formatApiDate(priorityInference.estimated_use_first_window.end_date)}` : "확인 필요"}`}</strong><small>{priorityInference.reasoning[0] ?? "상품명과 보관 조건을 검토했어요."}</small><small>{priorityInference.safety_disclaimer}</small></span></div> : null}
          {productProvenance ? <div className="manual-product-provenance" role="status"><ReaderIcon width={17} height={17} /><span><strong>상품 후보를 확인했어요</strong><small>{productSourceLabel(productProvenance.source)} · 신뢰도 {Math.round(productProvenance.confidence * 100)}% · {productFreshnessLabel(productProvenance.sourceFreshness)}{productProvenance.storageHint ? ` · 보관 힌트 ${productProvenance.storageHint === "refrigerated" ? "냉장" : productProvenance.storageHint === "frozen" ? "냉동" : "실온"}` : ""}</small><small>{productProvenance.note}</small></span></div> : null}
          {barcodeDateCandidate ? <div className="manual-date-candidate" role="status"><span><strong>GS1 {barcodeDateKindLabel(barcodeDateCandidate.kind)} 후보를 반영할 예정이에요.</strong><small>{barcodeDateCandidate.value.replaceAll("-", ".")} · 포장지와 실제 lot를 확인한 뒤 저장하세요.</small></span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => setBarcodeParse(null)}>날짜 후보 제외</button></div> : null}
          <p className="manual-lot-note">같은 식품을 다시 추가하면 구매 lot을 분리해 날짜와 보관 상태를 따로 관리해요.</p>
          <button className="primary-sheet-button manual-submit" type="button" onPointerDown={(event) => { event.preventDefault(); submitManual(); }} onClick={(event) => { if (event.detail === 0) submitManual(); }} disabled={!foodName.trim()}><PlusIcon width={17} height={17} /> 식품 추가하기</button>
        </div>
      ) : null}
      </div>
    </div>
  );
}
