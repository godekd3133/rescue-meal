import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import {
  ArchiveIcon,
  ArrowRightIcon,
  BellIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  FileTextIcon,
  HomeIcon,
  InfoCircledIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  ReaderIcon,
  ReloadIcon,
  SewingPinIcon,
  SunIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile/Keyboard";
import { MobileScroll } from "./mobile/MobileScroll";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { scrollTargetWithinContainer, scrollTargetWithinNearestContainer, targetScrollTop } from "./appScroll";
import ConnectionStatus from "./ConnectionStatus";
import { createReceiptCommitIdempotencyKey, isMealApiAuthError, isMealApiConflictError, isMealApiFoodDateConfirmedError, isMealApiFoodDatePersistenceError, isMealApiFoodLotSelectionError, isMealApiFoodLotTargetMissingError, isMealApiManualFoodPersistenceError, isMealApiNotificationReadPersistenceError, isMealApiProductInfoPersistenceError, isMealApiProductProvenancePersistenceError, isMealApiReceiptCommitPersistenceError, isMealApiShoppingListPersistenceError, isMealApiShoppingReceivePersistenceError, isMealApiStorageEventPersistenceError, isMealApiWorkspaceConflictError, MEAL_API_WORKSPACE_CONFLICT_MESSAGE, mealApi, type ApiDateKind, type ApiFood, type ApiGrocySyncStatus, type ApiNotification, type ApiOcrReviewObservation, type ApiProductProvenance, type ApiReceiptDraft, type ApiReceiptSummary, type ApiShoppingListItem, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import RuntimeConfigurationGuard from "./RuntimeConfigurationGuard";
import RuntimeErrorBoundary from "./RuntimeErrorBoundary";
import InstallPrompt from "./InstallPrompt";
import ServiceWorkerUpdatePrompt from "./ServiceWorkerUpdatePrompt";
import { createWorkspaceSyncTransport, WorkspaceSyncCoordinator, type WorkspaceSyncInvalidation, type WorkspaceSyncTransport } from "./workspaceSync";
import { clearCompletedOutboxHandoff } from "./completedOutboxHandoff";
import { runAuthoritativeMutation } from "./mutationReadback";
import { runStorageMutationRecovery } from "./storageMutationRecovery";
import { getDateBadge, getInventoryDateOriginLabel } from "./datePresentation";
import { getHomeReviewTopicLabel } from "./homeReviewSummary";

export type StorageType = "냉장" | "냉동" | "실온";
type InventoryStorageFilter = StorageType | "전체" | `location:${string}`;
type InventoryStatusFilter = "all" | "needs-review" | "priority";
export type DateKind = "actual_printed" | "estimated_use_first" | "user_confirmed" | "unknown";
export type AddMode = "receipt" | "barcode" | "label" | "manual";
export type ProductProvenance = {
  source: ApiProductProvenance["source"];
  sourceUrl?: string;
  confidence: number;
  note: string;
  storageHint?: ApiStorageType;
  sourceFreshness: ApiProductProvenance["source_freshness"];
};
type SheetName = "add" | "detail" | "meal" | "shopping" | "guidance" | "account" | "notifications" | "recipe-review" | "receipt-queue" | null;
type ConnectionState = "fixture" | "checking" | "connected" | "offline" | "auth_required";
type ThemeMode = "light" | "dark";
type NotificationSyncFocus = "action_required" | "queued" | "processing";
type InventorySearchStatus = "idle" | "loading" | "ready" | "error";
type ShoppingListStatus = "idle" | "loading" | "ready" | "error";
type ToastAction = {
  message: string;
  label: string;
  onInvoke: () => void;
};
type ShoppingListRetryAction = {
  label: string;
  onRetry: () => void;
};
type NotificationRetryAction = {
  label: string;
  onRetry: () => void;
};
type StorageMutationResult = {
  statuses: ApiGrocySyncStatus[];
  inventory: ApiFood[] | null;
};
type ProductInfoRetryAction = {
  foodId: string;
  input: { name: string; brand: string; category: string };
  message: string;
};
type ProductProvenanceStatus = {
  foodId: string;
  message: string;
  retryable: boolean;
};
type InventoryReturnContext = {
  foodId: string;
  returnNav: "food";
  scrollTop: number;
  rowOffset: number | null;
};
type PendingAddedFoodFocus = {
  name: string;
  sourceNav: "home" | "food";
  trigger: HTMLElement | null;
};
type PendingFoodDateFocus = {
  foodId: string;
  name: string;
  sourceNav: "home" | "food";
  trigger: HTMLElement | null;
};
type PendingMealCompletionFocus = {
  sourceNav: "home" | "food";
  preferredFoodIds: string[];
  beforeFoodsSignature: string;
  trigger: HTMLElement | null;
};
export type FoodItem = {
  id: string;
  lotAction?: "create" | "correct";
  targetFoodId?: string;
  parentId?: string;
  sourceReceiptId?: string;
  sourceReceiptLineId?: string;
  purchaseSource?: "shopping_list" | "receipt";
  purchasedAt?: string;
  barcode?: string;
  barcodeLot?: string;
  openedAt?: string;
  name: string;
  brand: string;
  quantity: string;
  storage: StorageType;
  storageLocationId?: string;
  storageLocationName?: string;
  dateLabel: string;
  dateDetail: string;
  dateKind: DateKind;
  dateAssertionKind?: ApiDateKind;
  dateStorageHint?: ApiStorageType;
  dateStorageConditionText?: string;
  dateSource: string;
  image: string;
  category: string;
  priority: number;
  confidence: number;
  note: string;
  opened: boolean;
  productProvenance?: ProductProvenance;
};

export type ReceiptLine = {
  id: string;
  backendId?: string;
  rawName?: string;
  barcode?: string | null;
  name: string;
  quantity: string;
  unit: string;
  totalPrice: number;
  storage: StorageType;
  storageLocationId?: string | null;
  confidence: number;
  requiresReview: boolean;
  matchSource?: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched";
  sourceObservationIds?: string[];
  matchCandidates?: Array<{
    source: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched";
    source_url?: string | null;
    canonical_name: string;
    brand?: string | null;
    category?: string | null;
    quantity_text?: string | null;
    confidence: number;
    provenance_note: string;
    shelf_life_text: string | null;
    storage_hint: "ambient" | "refrigerated" | "frozen" | null;
    source_freshness: "current" | "legacy" | "unknown";
  }>;
  image: string;
};

type PreparedReceiptLine = {
  line: ReceiptLine;
  canonicalName: string;
  quantity: number;
  unit: string;
  storage: StorageType;
  storageLocationId: string | null;
};

export type ReceiptCommitPayload = {
  lines: ReceiptLine[];
  draftId?: string;
  sourceFilename: string;
};

const FOOD_IMAGES = {
  spinach: "/assets/food/spinach-photo.jpg",
  tofu: "/assets/food/tofu-photo.jpg",
  chicken: "/assets/food/chicken-photo.jpg",
  mushroom: "/assets/food/mushroom-photo.jpg",
  eggs: "/assets/food/eggs-photo.jpg",
  milk: "/assets/food/milk-photo.jpg",
  tomato: "/assets/food/tomato-photo.jpg",
  groceries: "/assets/food/groceries-photo.jpg",
} as const;

const LEGACY_FOOD_IMAGES: Record<string, string> = {
  "/assets/food/spinach.png": FOOD_IMAGES.spinach,
  "/assets/food/spinach-cutout-v1.png": FOOD_IMAGES.spinach,
  "/assets/food/tofu.png": FOOD_IMAGES.tofu,
  "/assets/food/tofu-cutout-v1.png": FOOD_IMAGES.tofu,
  "/assets/food/chicken.png": FOOD_IMAGES.chicken,
  "/assets/food/chicken-cutout-v1.png": FOOD_IMAGES.chicken,
  "/assets/food/mushroom.png": FOOD_IMAGES.mushroom,
  "/assets/food/eggs.png": FOOD_IMAGES.eggs,
  "/assets/food/milk.png": FOOD_IMAGES.milk,
  "/assets/food/tomato.png": FOOD_IMAGES.tomato,
};
const LOCAL_FOOD_IMAGES = new Set<string>(Object.values(FOOD_IMAGES));

const INITIAL_FOODS: FoodItem[] = [
  {
    id: "spinach-1",
    name: "시금치",
    brand: "국내산 시금치",
    quantity: "1팩",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-02"),
    dateDetail: "2026.09.02",
    dateKind: "actual_printed",
    dateSource: "포장지 표시",
    image: FOOD_IMAGES.spinach,
    category: "채소",
    priority: 1,
    confidence: 1,
    note: "포장지에서 유효년월일을 확인했어요.",
    opened: true,
  },
  {
    id: "tofu-1",
    name: "국산콩 두부",
    brand: "풀무원",
    quantity: "1모",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-04"),
    dateDetail: "먼저 먹기 참고",
    dateKind: "estimated_use_first",
    dateSource: "상품 유형 + 보관 방식",
    image: FOOD_IMAGES.tofu,
    category: "두부·콩",
    priority: 2,
    confidence: 0.72,
    note: "실제 소비기한이 아닌 먼저 먹을 순서예요.",
    opened: false,
  },
  {
    id: "chicken-1",
    name: "닭가슴살",
    brand: "무항생제 닭가슴살",
    quantity: "2팩",
    storage: "냉동",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "2026.09.06",
    dateKind: "user_confirmed",
    dateAssertionKind: "user_reminder",
    dateSource: "사용자 입력",
    image: FOOD_IMAGES.chicken,
    category: "육류",
    priority: 3,
    confidence: 0.9,
    note: "직접 확인한 날짜를 기준으로 보여드려요.",
    opened: false,
  },
  {
    id: "mushroom-1",
    name: "맛타리버섯",
    brand: "국내산 맛타리",
    quantity: "2팩",
    sourceReceiptId: "demo-receipt-20260901",
    sourceReceiptLineId: "demo-receipt-20260901:receipt-mushroom",
    purchasedAt: "2026-09-01T13:20:00+09:00",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-05"),
    dateDetail: "먼저 먹기 참고",
    dateKind: "estimated_use_first",
    dateSource: "영수증 + 상품 유형",
    image: FOOD_IMAGES.mushroom,
    category: "채소",
    priority: 4,
    confidence: 0.64,
    note: "신선식품은 날짜가 없을 수 있어 먼저 살펴볼 순서만 알려드려요.",
    opened: false,
  },
  {
    id: "egg-1",
    name: "동물복지 달걀",
    brand: "10구",
    quantity: "1판",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-09"),
    dateDetail: "2026.09.09",
    dateKind: "actual_printed",
    dateSource: "포장지 표시",
    image: FOOD_IMAGES.eggs,
    category: "달걀",
    priority: 5,
    confidence: 1,
    note: "달걀 포장지에 있는 표시 날짜를 기록했어요.",
    opened: false,
  },
  {
    id: "milk-1",
    name: "저지방 우유",
    brand: "900ml",
    quantity: "1개",
    storage: "냉장",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "먼저 먹기 참고",
    dateKind: "estimated_use_first",
    dateSource: "영수증 + 상품 유형",
    image: FOOD_IMAGES.milk,
    category: "유제품",
    priority: 6,
    confidence: 0.68,
    note: "개봉 후 사용자 확인이 필요해요.",
    opened: true,
  },
  {
    id: "tomato-1",
    name: "대추방울토마토",
    brand: "국내산",
    quantity: "1팩",
    storage: "실온",
    dateLabel: formatApiDate("2026-09-06"),
    dateDetail: "먼저 먹기 참고",
    dateKind: "estimated_use_first",
    dateSource: "상품 유형 + 보관 방식",
    image: FOOD_IMAGES.tomato,
    category: "채소",
    priority: 7,
    confidence: 0.58,
    note: "토마토는 실온에 보관해요. 먹기 전에 상태를 살펴봐 주세요.",
    opened: false,
  },
];

function withGrocySyncNotice(base: string, status?: ApiGrocySyncStatus | ApiGrocySyncStatus[]) {
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  if (statuses.includes("dead_letter")) return `${base} · 외부 재고 반영에 실패해 확인이 필요해요`;
  if (statuses.includes("needs_reconciliation")) return `${base} · 외부 반영 여부를 확인해 주세요`;
  if (statuses.includes("needs_mapping")) return `${base} · 외부 상품·보관 위치 연결을 확인해 주세요`;
  if (statuses.some((item) => item === "queued" || item === "in_flight")) return `${base} · 외부 재고 반영을 대기 중이에요`;
  return base;
}

function hasDeferredExternalSync(status?: ApiGrocySyncStatus | ApiGrocySyncStatus[]) {
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  return statuses.some((item) => item === "queued" || item === "in_flight" || item === "dead_letter" || item === "needs_reconciliation" || item === "needs_mapping");
}

function needsExternalSyncAttention(status?: ApiGrocySyncStatus | ApiGrocySyncStatus[]) {
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  return statuses.some((item) => item === "dead_letter" || item === "needs_reconciliation" || item === "needs_mapping");
}

function externalSyncHomeTitle(attentionCount: number, processingCount: number) {
  if (attentionCount > 0) return "재고 앱에 추가되지 않은 항목이 있어요";
  if (processingCount > 0) return "재고 앱에 추가하고 있어요";
  return "재고 앱에 보낼 항목이 있어요";
}

function withServerReadbackNotice(base: string, synced: boolean) {
  return synced ? base : `${base} · 서버 저장은 완료됐지만 최신 목록은 아직 다시 읽지 못했어요`;
}

function withNextPriorityCue(base: string, foods: FoodItem[], enabled: boolean) {
  if (!enabled) return base;
  const next = [...foods]
    .sort((left, right) => left.priority - right.priority)
    .find((food) => food.priority <= 3);
  return next ? `${base} · 이어서 ${next.name}도 확인해 보세요` : `${base} · 오늘은 더 확인할 식품이 없어요`;
}

function mealCompletionMessage(foodIds: string[], skippedCount: number, consumedAllocations: Array<{ food_id: string; quantity: number }>) {
  const consumedCount = Math.max(foodIds.length, consumedAllocations.filter((allocation) => allocation.quantity > 0).length);
  if (skippedCount > 0) return `조리 완료 · ${consumedCount}개 재료를 사용했어요 · ${skippedCount}개는 재고에 남겼어요`;
  if (consumedCount > 0) return `조리 완료 · ${consumedCount}개 재료를 차감했어요`;
  return "조리 완료 기록을 남겼어요";
}

function withKoreanObjectParticle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const lastCodePoint = trimmed.charCodeAt(trimmed.length - 1);
  const hasFinalConsonant = lastCodePoint >= 0xac00 && lastCodePoint <= 0xd7a3 && (lastCodePoint - 0xac00) % 28 !== 0;
  return `${trimmed}${hasFinalConsonant ? "을" : "를"}`;
}

function addedFoodFollowUpLabel(food: FoodItem) {
  if (food.dateKind !== "unknown") return null;
  return food.productProvenance ? "상품 정보와 날짜 살펴보기" : "날짜와 보관 방법 살펴보기";
}

const RECEIPT_LINES: ReceiptLine[] = [
  {
    id: "receipt-spinach",
    rawName: "국내산 시금치",
    name: "시금치",
    quantity: "1",
    unit: "팩",
    totalPrice: 2980,
    storage: "냉장",
    confidence: 0.96,
    requiresReview: false,
    image: FOOD_IMAGES.spinach,
  },
  {
    id: "receipt-tofu",
    rawName: "국산콩 두부",
    name: "국산콩 두부",
    quantity: "1",
    unit: "모",
    totalPrice: 2490,
    storage: "냉장",
    confidence: 0.91,
    requiresReview: false,
    image: FOOD_IMAGES.tofu,
  },
  {
    id: "receipt-mushroom",
    rawName: "맛타리버섯",
    name: "맛타리버섯",
    quantity: "2",
    unit: "팩",
    totalPrice: 3980,
    storage: "냉장",
    confidence: 0.63,
    requiresReview: true,
    image: FOOD_IMAGES.mushroom,
  },
];

const RECEIPT_SOURCE_REVIEW_FIXTURE = {
  source: "샘플 영수증",
  merchantName: "익명 동네마트",
  sourcePreviewUrl: "/assets/receipts/source-review-fixture-v1.png",
  sourcePreviewKind: "image" as const,
  reviewObservations: [
    { id: "fixture-observation-spinach", bbox: [0.36, 0.735, 0.32, 0.022] as [number, number, number, number], confidence: 0.96 },
    { id: "fixture-observation-tofu", bbox: [0.36, 0.695, 0.32, 0.022] as [number, number, number, number], confidence: 0.94 },
    { id: "fixture-observation-mushroom", bbox: [0.36, 0.675, 0.32, 0.022] as [number, number, number, number], confidence: 0.91 },
  ] satisfies ApiOcrReviewObservation[],
  lines: RECEIPT_LINES.map((line, index) => ({
    ...line,
    sourceObservationIds: index === 0 ? ["fixture-observation-spinach"] : index === 1 ? ["fixture-observation-tofu"] : ["fixture-observation-mushroom"],
  })),
};

const RECEIPT_SOURCE_UNMAPPED_FIXTURE = {
  ...RECEIPT_SOURCE_REVIEW_FIXTURE,
  lines: RECEIPT_SOURCE_REVIEW_FIXTURE.lines.map((line) => ({ ...line, sourceObservationIds: [] })),
};

const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];
const THEME_STORAGE_KEY = "rescue-meal.theme";
const IS_WEB_SURFACE = ((import.meta.env.VITE_APP_SHELL as string | undefined)?.trim().toLowerCase() ?? "web") === "web";
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));
const loadBottomSheet = () => import("./mobile/BottomSheet").then(({ BottomSheet }) => ({ default: BottomSheet }));
const LazyBottomSheet = lazy(loadBottomSheet);
const FoodHistory = lazy(() => import("./FoodHistory"));
const DateAssertionEditor = lazy(() => import("./DateAssertionEditor"));
const AccountSheet = lazy(() => import("./AccountSheet"));
const loadMealPlanSheet = () => import("./MealPlanSheet");
const MealPlanSheet = lazy(loadMealPlanSheet);
const ShoppingListSheet = lazy(() => import("./ShoppingListSheet"));
const RecipeReviewPanel = lazy(() => import("./RecipeReviewPanel"));
const NotificationSheet = lazy(() => import("./NotificationSheet"));
const GuidanceSheet = lazy(() => import("./GuidanceSheet"));
const loadAddFoodSheet = () => import("./AddFoodSheet");
const AddFoodSheet = lazy(loadAddFoodSheet);
const FoodDetailSheet = lazy(() => import("./FoodDetailSheet"));

function DeferredBottomSheet({ open, onOpenChange, title, description, snap, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; snap?: number; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(open);

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  if (!hasOpened) return null;
  return <Suspense fallback={open ? <ProcessingState label="화면을 준비하고 있어요" detail="잠시만 기다려 주세요." /> : null}><LazyBottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description} snap={snap}>{children}</LazyBottomSheet></Suspense>;
}

function ReceiptReviewQueue({ receipts, onSelect, onAddReceipt, notice }: { receipts: ApiReceiptSummary[]; onSelect: (receiptId: string) => void; onAddReceipt: () => void; notice?: string }) {
  return (
    <div className="receipt-review-queue">
      <div className="receipt-review-queue-intro" role="status">
        <span className="receipt-review-queue-icon"><ReaderIcon width={19} height={19} /></span>
        <span><strong>영수증에서 읽은 식품을 살펴봐 주세요</strong><small>사진은 저장하지 않아요. 상품명과 수량을 다 살펴본 뒤 식품 목록에 추가해요.</small></span>
      </div>
      {notice ? <div className="receipt-review-queue-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {receipts.length ? <div className="receipt-review-queue-list" role="list" aria-label="살펴볼 영수증 목록">
        {receipts.map((receipt) => <div role="listitem" key={receipt.id}><button className="receipt-review-queue-row" type="button" onClick={() => onSelect(receipt.id)}>
          <span className="receipt-review-queue-row-icon"><FileTextIcon width={16} height={16} /></span>
          <span className="receipt-review-queue-row-copy"><strong>{receipt.merchant_name ?? "저장된 영수증"}</strong><small>{formatPurchasedAt(receipt.purchased_at) ?? "구매일 미등록"} · 상품 {receipt.line_count}개</small></span>
          <span className="receipt-review-queue-row-action">이어서 살펴보기 <ChevronRightIcon width={14} height={14} /></span>
        </button></div>)}
      </div> : <div className="receipt-review-queue-empty" role="status"><strong>살펴볼 영수증이 없어요</strong><small>새 영수증을 추가해 식품을 기록해 보세요.</small><button className="secondary-sheet-button" type="button" onClick={onAddReceipt}><PlusIcon width={15} height={15} /> 영수증 추가</button></div>}
      <p className="receipt-review-queue-footnote">식품 목록에 저장했거나 삭제한 영수증은 여기에서 사라져요.</p>
    </div>
  );
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

type DemoShoppingSourceType = ApiShoppingListItem["sources"][number]["source_type"];
type DemoShoppingEntry = {
  canonicalName: string;
  quantity: number;
  unit: string;
  sourceType: DemoShoppingSourceType;
  sourceId?: string;
  dayIndex?: number | null;
};

function mergeDemoShoppingEntries(current: ApiShoppingListItem[], entries: DemoShoppingEntry[]) {
  const now = new Date().toISOString();
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  const next = [...current];

  for (const entry of entries) {
    const canonicalName = entry.canonicalName.trim().replace(/\s+/g, " ");
    const unit = entry.unit.trim().replace(/\s+/g, " ");
    const quantity = Math.round(entry.quantity * 1000) / 1000;
    if (!canonicalName || !unit || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (entry.sourceType !== "manual" && !entry.sourceId) continue;

    const existingIndex = next.findIndex((item) => normalize(item.canonical_name) === normalize(canonicalName) && normalize(item.unit) === normalize(unit));
    const existing = existingIndex >= 0 ? next[existingIndex] : null;
    const itemId = existing?.id ?? createId("shopping");
    const dayIndex = entry.sourceType === "multi_day" ? entry.dayIndex ?? null : null;
    const sourceId = entry.sourceType === "manual" ? `manual:${itemId}` : entry.sourceId!;
    const retainedSources = (existing?.sources ?? []).filter((source) => {
      if (entry.sourceType === "manual") return source.source_type !== "manual";
      return !(source.source_type === entry.sourceType && source.source_id === sourceId && source.day_index === dayIndex);
    });
    const sources: ApiShoppingListItem["sources"] = [
      ...retainedSources,
      { source_type: entry.sourceType, source_id: sourceId, day_index: dayIndex, quantity },
    ];
    const nextQuantity = Math.round(sources.reduce((total, source) => total + source.quantity, 0) * 1000) / 1000;
    const item: ApiShoppingListItem = {
      id: itemId,
      canonical_name: canonicalName,
      quantity: nextQuantity,
      unit,
      checked: existing ? (Math.abs(nextQuantity - existing.quantity) < 1e-9 ? existing.checked : false) : false,
      sources,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    if (existingIndex >= 0) next[existingIndex] = item;
    else next.push(item);
  }

  return next.sort((left, right) => Number(left.checked) - Number(right.checked)
    || left.canonical_name.localeCompare(right.canonical_name, "ko")
    || left.unit.localeCompare(right.unit, "ko")
    || left.id.localeCompare(right.id));
}

function reduceDemoShoppingQuantity(current: ApiShoppingListItem[], itemId: string, receivedQuantity: number) {
  const now = new Date().toISOString();
  const received = Math.max(0, Math.round(receivedQuantity * 1000) / 1000);
  if (!received) return current;

  const next = current.flatMap((item) => {
    if (item.id !== itemId) return [item];
    let remainingToReceive = received;
    const sources = [...item.sources]
      .sort((left, right) => Number(left.source_type === "manual") - Number(right.source_type === "manual"))
      .map((source) => {
        const applied = Math.min(source.quantity, remainingToReceive);
        remainingToReceive = Math.round((remainingToReceive - applied) * 1000) / 1000;
        return { ...source, quantity: Math.round((source.quantity - applied) * 1000) / 1000 };
      })
      .filter((source) => source.quantity > 1e-9);
    const quantity = Math.round(sources.reduce((total, source) => total + source.quantity, 0) * 1000) / 1000;
    if (quantity <= 1e-9) return [];
    return [{ ...item, quantity, sources, checked: false, updated_at: now }];
  });

  return next.sort((left, right) => Number(left.checked) - Number(right.checked)
    || left.canonical_name.localeCompare(right.canonical_name, "ko")
    || left.unit.localeCompare(right.unit, "ko")
    || left.id.localeCompare(right.id));
}

function createFood(input: Partial<FoodItem> & Pick<FoodItem, "name">): FoodItem {
  return {
    id: createId("food"),
    lotAction: input.lotAction,
    targetFoodId: input.targetFoodId,
    purchaseSource: input.purchaseSource,
    purchasedAt: input.purchasedAt,
    name: input.name,
    brand: input.brand ?? "직접 추가한 식품",
    quantity: input.quantity ?? "1개",
    storage: input.storage ?? "냉장",
    storageLocationId: input.storageLocationId,
    storageLocationName: input.storageLocationName,
    dateLabel: input.dateLabel ?? "날짜 미확인",
    dateDetail: input.dateDetail ?? "포장지 날짜를 살펴봐 주세요",
    dateKind: input.dateKind ?? "unknown",
    dateAssertionKind: input.dateAssertionKind,
    dateStorageHint: input.dateStorageHint,
    dateStorageConditionText: input.dateStorageConditionText,
    barcode: input.barcode,
    dateSource: input.dateSource ?? "사용자 입력",
    image: input.image ?? FOOD_IMAGES.groceries,
    category: input.category ?? "기타",
    priority: input.priority ?? 99,
    confidence: input.confidence ?? 1,
    note: input.note ?? "날짜와 보관 방법을 확인해 주세요.",
    opened: input.opened ?? false,
    productProvenance: input.productProvenance,
  };
}

const DEMO_NOTIFICATION_SOURCE = {
  actual_printed: "printed_date",
  estimated_use_first: "estimated_window",
  user_confirmed: "user_reminder",
  unknown: "unknown_date",
} as const;

function getStorageClass(storage: StorageType) {
  return storage === "냉동" ? "storage-freezer" : storage === "실온" ? "storage-room" : "storage-fridge";
}

function storageFromApi(storage: ApiStorageType): StorageType {
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

function formatApiDate(value: string | null) {
  if (!value) return "날짜 미확인";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "날짜 미확인";
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  return `${month}월 ${day}일`;
}

function formatTodayEyebrow(value: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).formatToParts(value);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "오늘";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${weekday}, ${month} ${day}`;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Theme preference is optional. Keep the selected light design when
    // storage is unavailable instead of blocking the home screen.
  }

  return "light";
}

function mealPlanHint(priorityFoods: FoodItem[], foodCount: number, priorityNeedsReviewCount = 0) {
  if (foodCount === 0) return "식품을 추가하면 오늘 메뉴를 골라볼게요.";
  if (priorityFoods.length === 0) return "다른 식품으로 오늘 메뉴를 골라볼게요.";
  if (priorityNeedsReviewCount > 0) return `날짜나 보관 방법을 살펴볼 식품 ${priorityNeedsReviewCount}개`;
  const names = priorityFoods.slice(0, 3).map((food) => food.name);
  const suffix = priorityFoods.length > names.length ? ` 외 ${priorityFoods.length - names.length}개` : "";
  return `${names.join("·")}${suffix}을 먼저 써볼까요?`;
}

function formatPurchasedAt(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

function parseDashboardCacheTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDashboardCacheAge(value: string, now = new Date()) {
  const parsed = parseDashboardCacheTime(value);
  if (!parsed) return "시간 정보를 알 수 없어요";
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60_000));
  return elapsedMinutes < 1
    ? "방금 전"
    : elapsedMinutes < 60
      ? `${elapsedMinutes}분 전`
      : elapsedMinutes < 24 * 60
        ? `${Math.floor(elapsedMinutes / 60)}시간 전`
        : elapsedMinutes < 48 * 60
          ? "어제"
          : `${Math.floor(elapsedMinutes / (24 * 60))}일 전`;
}

function dashboardCacheFreshness(value: string, now = new Date()): "recent" | "stale" | "old" | "unknown" {
  const parsed = parseDashboardCacheTime(value);
  if (!parsed) return "unknown";
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60_000));
  if (elapsedMinutes < 60) return "recent";
  if (elapsedMinutes < 24 * 60) return "stale";
  return "old";
}

function formatDashboardCacheTime(value: string, now = new Date()) {
  const parsed = parseDashboardCacheTime(value);
  if (!parsed) return "최근에 불러온 시간을 알 수 없어요";
  const relative = formatDashboardCacheAge(value, now);
  const absolute = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
  return `${relative} · ${absolute}`;
}

function mapApiFood(food: ApiFood, storageLocations: ApiStorageLocation[] = []): FoodItem {
  const estimate = food.estimated_use_first_window;
  const sourceReceiptId = food.source_receipt_id ?? undefined;
  const sourceReceiptLineId = food.source_receipt_line_id ?? undefined;
  const hasReceiptSource = Boolean(sourceReceiptId || sourceReceiptLineId);
  const hasShoppingSource = food.brand === "장보기에서 추가한 식품" || food.date_assertion.source_detail.startsWith("장보기 구매 ·");
  const brand = hasReceiptSource && food.brand.trim() === food.display_name.trim() ? "" : food.brand;
  const assertionKind = food.date_assertion.kind;
  const actualDate = assertionKind !== "unknown"
    && assertionKind !== "estimated_use_first"
    && assertionKind !== "user_reminder";
  const dateKind: DateKind = actualDate
    ? "actual_printed"
    : assertionKind === "user_reminder"
      ? "user_confirmed"
      : estimate ? "estimated_use_first" : "unknown";
  const estimatedDate = estimate?.end_date ?? null;
  const displayDate = actualDate || dateKind === "user_confirmed" ? food.date_assertion.value : estimatedDate;
  return {
    id: food.id,
    sourceReceiptId,
    sourceReceiptLineId,
    purchaseSource: hasReceiptSource ? "receipt" : hasShoppingSource ? "shopping_list" : undefined,
    purchasedAt: food.purchased_at ?? undefined,
    barcode: food.barcode ?? undefined,
    barcodeLot: food.barcode_lot ?? undefined,
    openedAt: food.opened_at ?? undefined,
    productProvenance: food.product_provenance ? {
      source: food.product_provenance.source,
      sourceUrl: food.product_provenance.source_url ?? undefined,
      confidence: food.product_provenance.confidence,
      note: food.product_provenance.note,
      storageHint: food.product_provenance.storage_hint ?? undefined,
      sourceFreshness: food.product_provenance.source_freshness,
    } : undefined,
    name: food.display_name,
    brand,
    quantity: `${food.quantity}${food.unit}`,
    storage: storageFromApi(food.storage_type),
    storageLocationId: food.storage_location_id ?? undefined,
    storageLocationName: food.storage_location_id
      ? storageLocations.find((location) => location.id === food.storage_location_id)?.name
      : undefined,
    dateLabel: formatApiDate(displayDate),
    dateDetail: food.date_assertion.display_label.replaceAll("-", "."),
    dateKind,
    dateAssertionKind: assertionKind,
    dateStorageHint: food.date_assertion.applicable_storage_type ?? undefined,
    dateStorageConditionText: food.date_assertion.storage_condition_text ?? undefined,
    dateSource: food.date_assertion.source_detail,
    image: imageForApiFood(food.display_name, food.image_path),
    category: food.category,
    priority: food.priority,
    confidence: estimate?.confidence ?? food.date_assertion.confidence,
    note: food.note,
    opened: food.opened,
  };
}

function storageToApi(storage: StorageType): ApiStorageType {
  return storage === "냉동" ? "frozen" : storage === "실온" ? "ambient" : "refrigerated";
}

function storageLocationIdFromFilter(filter: InventoryStorageFilter) {
  return filter.startsWith("location:") ? filter.slice("location:".length) : undefined;
}

function storageTypeFromFilter(filter: InventoryStorageFilter) {
  if (filter === "냉장" || filter === "냉동" || filter === "실온") return storageToApi(filter);
  return undefined;
}

function dateValueForFood(food: FoodItem) {
  const match = food.dateDetail.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function dateReviewReason(food: FoodItem, referenceDate: Date) {
  if (food.dateKind === "unknown") return "포장지 날짜 확인";
  if (food.dateAssertionKind === "production_date" || food.dateAssertionKind === "packaging_date") return "날짜 의미 확인";
  if (food.dateKind !== "actual_printed") return null;

  const dateValue = dateValueForFood(food);
  if (!dateValue) return "포장지 날짜 확인";
  const [year, month, day] = dateValue.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const assertionKind = food.dateAssertionKind ?? "use_by";
  if (["use_by", "sell_by", "best_before"].includes(assertionKind) && target.getTime() <= today.getTime()) return "조리 전 날짜 확인";
  return null;
}

function storageConditionReviewReason(food: FoodItem) {
  if (!food.dateStorageHint || food.dateStorageHint === storageToApi(food.storage)) return null;
  return "보관 방법 확인";
}

function attentionReviewReason(food: FoodItem, referenceDate: Date) {
  return dateReviewReason(food, referenceDate) ?? storageConditionReviewReason(food);
}

function priorityActionLabel(food: FoodItem, reviewReason: string | null) {
  if (reviewReason?.startsWith("보관")) return "보관 확인";
  if (reviewReason) return "날짜 확인";
  return "먼저 살펴보기";
}

function quantityParts(quantity: string) {
  const match = quantity.match(/^(\d+(?:\.\d+)?)(.*)$/);
  return { amount: match ? Number.parseFloat(match[1]) : 1, unit: match?.[2] || "개" };
}

function imageForFoodName(name: string) {
  if (name.includes("시금치")) return FOOD_IMAGES.spinach;
  if (name.includes("두부")) return FOOD_IMAGES.tofu;
  if (name.includes("닭")) return FOOD_IMAGES.chicken;
  if (name.includes("버섯")) return FOOD_IMAGES.mushroom;
  if (name.includes("달걀") || name.includes("계란")) return FOOD_IMAGES.eggs;
  if (name.includes("우유")) return FOOD_IMAGES.milk;
  if (name.includes("토마토")) return FOOD_IMAGES.tomato;
  return FOOD_IMAGES.groceries;
}

function foodSourceSummary(food: FoodItem) {
  if (food.purchaseSource === "shopping_list") return "장보기";
  if (food.purchaseSource === "receipt" && !food.brand.trim()) return "영수증";
  return food.brand;
}

function imageForKnownFoodName(name: string) {
  if (["시금치", "두부", "닭", "버섯", "달걀", "계란", "우유", "토마토"].some((token) => name.includes(token))) {
    return imageForFoodName(name);
  }
  return null;
}

function imageForApiFood(name: string, imagePath: string) {
  const legacyImage = Object.prototype.hasOwnProperty.call(LEGACY_FOOD_IMAGES, imagePath)
    ? LEGACY_FOOD_IMAGES[imagePath]
    : undefined;
  const isLocalFoodImage = legacyImage !== undefined || LOCAL_FOOD_IMAGES.has(imagePath);
  if (!isLocalFoodImage) return imagePath;

  const knownFoodImage = imageForKnownFoodName(name);
  if (knownFoodImage) return knownFoodImage;
  if (legacyImage) return imagePath === "/assets/food/tomato.png" ? FOOD_IMAGES.groceries : legacyImage;
  return imagePath;
}

function parseReceiptQuantity(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function canonicalReceiptName(value: string) {
  return value.trim().replace(/^국내산\s+/, "");
}

function formatReceiptAmount(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

function formatReceiptLineDetail(line: ReceiptLine) {
  const quantity = parseReceiptQuantity(line.quantity);
  const quantityLabel = quantity === null ? line.quantity.trim() || "수량 확인" : formatReceiptAmount(quantity);
  const unitLabel = line.unit.trim() || "단위 확인";
  return `${quantityLabel}${unitLabel} · ${line.totalPrice.toLocaleString("ko-KR")}원`;
}

function receiptLineError(line: ReceiptLine) {
  if (!line.name.trim()) return "상품명을 입력해 주세요.";
  if (parseReceiptQuantity(line.quantity) === null) return "수량은 0보다 큰 숫자로 입력해 주세요.";
  if (!line.unit.trim()) return "단위를 입력해 주세요.";
  return "";
}

function prepareReceiptLine(line: ReceiptLine): PreparedReceiptLine | null {
  const canonicalName = canonicalReceiptName(line.name);
  const quantity = parseReceiptQuantity(line.quantity);
  const unit = line.unit.trim();
  if (!canonicalName || quantity === null || !unit) return null;
  return { line, canonicalName, quantity, unit, storage: line.storage, storageLocationId: line.storageLocationId ?? null };
}

type ViewportMetrics = {
  height: number;
  offsetTop: number;
};

function readViewportMetrics(): ViewportMetrics {
  if (typeof window === "undefined") return { height: 852, offsetTop: 0 };
  const visualViewport = window.visualViewport;
  const height = typeof visualViewport?.height === "number" && visualViewport.height > 0
    ? visualViewport.height
    : window.innerHeight;
  return {
    height,
    offsetTop: typeof visualViewport?.offsetTop === "number" ? visualViewport.offsetTop : 0,
  };
}

function useViewportMetrics() {
  const [metrics, setMetrics] = useState(readViewportMetrics);

  useEffect(() => {
    const update = () => setMetrics((current) => {
      const next = readViewportMetrics();
      return current.height === next.height && current.offsetTop === next.offsetTop ? current : next;
    });
    const visualViewport = window.visualViewport;
    update();
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return metrics;
}

function PrototypeContent() {
  const keyboard = useKeyboard();
  const keyboardHideRef = useRef(keyboard.hide);
  keyboardHideRef.current = keyboard.hide;
  const viewportMetrics = useViewportMetrics();
  const viewportHeight = viewportMetrics.height;
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.rescueTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    const themeColor = themeMode === "dark" ? "#141b16" : "#f4f0e7";
    document.documentElement.style.setProperty("--rescue-app-background", themeColor);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColor);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // A private browsing policy may reject localStorage. The in-memory
      // toggle remains functional for this session.
    }
  }, [themeMode]);

  useEffect(() => {
    // Keep the initial bundle lazy, but warm the primary intake path in the
    // first task after the initial commit. A slow module fetch should not make
    // the first user tap pay the full chunk-load cost.
    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      void Promise.all([loadAddFoodSheet(), loadBottomSheet()]).catch(() => {
        // The explicit openAdd() prefetch still owns the retryable failure UI.
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, []);

  // A production API is authoritative. Never show demo fixture foods while a
  // production workspace is still loading or unavailable; only an explicit
  // dashboard cache may be shown in the offline branch below. Demo mode keeps
  // its fixture fallback so local connected E2E and product walkthroughs can
  // exercise the UI without pretending to be a user's workspace.
  const [foods, setFoods] = useState<FoodItem[]>(() => mealApi.deploymentMode === "production" ? [] : INITIAL_FOODS);
  const [storageLocations, setStorageLocations] = useState<ApiStorageLocation[]>([]);
  const storageLocationsRef = useRef<ApiStorageLocation[]>([]);
  const updateStorageLocations = (nextStorageLocations: ApiStorageLocation[]) => {
    storageLocationsRef.current = nextStorageLocations;
    setStorageLocations(nextStorageLocations);
  };
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [sheet, setSheet] = useState<SheetName>(null);
  const [mealPlanSheetMounted, setMealPlanSheetMounted] = useState(false);
  const [activeNav, setActiveNav] = useState<"home" | "food" | "meal">("home");
  const [inventoryNavTailSpace, setInventoryNavTailSpace] = useState(0);
  const activeContentNavRef = useRef<"home" | "food">("home");
  const navigationIntentRef = useRef<"home" | "food" | null>(null);
  const navigationIntentLastScrollTopRef = useRef<number | null>(null);
  const mealSheetOriginNavRef = useRef<"home" | "food">("home");
  const mealReturnSheetRef = useRef<"shopping" | null>(null);
  const shoppingReturnSheetRef = useRef<"meal" | null>(null);
  const shoppingOriginNavRef = useRef<"home" | "food">("home");
  const shoppingDetailReturnRef = useRef(false);
  const mealDetailReturnRef = useRef(false);
  const mealDetailReturnFocusIdRef = useRef<string | null>(null);
  const mealDetailReturnScrollTopRef = useRef<number | null>(null);
  const mealDetailSessionReturnRef = useRef(false);
  const accountDetailReturnRef = useRef(false);
  const accountOriginNavRef = useRef<"home" | "food">("home");
  const notificationDetailReturnRef = useRef(false);
  const notificationReturnSheetRef = useRef<"meal" | null>(null);
  const notificationAccountReturnRef = useRef(false);
  const notificationReturnFocusIdRef = useRef<string | null>(null);
  const notificationInitialFocusRef = useRef(false);
  const mealPlanOptionsRef = useRef({ maxMinutes: 30, servings: 1 });
  const guidanceReturnSheetRef = useRef<"detail" | null>(null);
  const addReturnSheetRef = useRef<"detail" | null>(null);
  const addReturnFoodContextRef = useRef<{ id: string; name: string; dateSummary: string | null } | null>(null);
  const sheetRef = useRef<SheetName>(null);
  sheetRef.current = sheet;
  const sheetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const addOriginFocusRef = useRef<HTMLElement | null>(null);
  const pendingAddedFoodFocusRef = useRef<PendingAddedFoodFocus | null>(null);
  const pendingFoodDateFocusRef = useRef<PendingFoodDateFocus | null>(null);
  const pendingMealCompletionFocusRef = useRef<PendingMealCompletionFocus | null>(null);
  const inventoryReturnContextRef = useRef<InventoryReturnContext | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("receipt");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [detailEntryIntent, setDetailEntryIntent] = useState<"date-review" | "provenance-review" | "consume-action" | null>(null);
  const [detailSyncFocusId, setDetailSyncFocusId] = useState<string | null>(null);
  const pendingDateMutationKeysRef = useRef(new Set<string>());
  const pendingReceiptCommitKeysRef = useRef(new Set<string>());
  const pendingManualFoodMutationKeysRef = useRef(new Set<string>());
  const [detailHistoryRefreshKey, setDetailHistoryRefreshKey] = useState(0);
  const detailHistoryDisclosureOpenRef = useRef(false);
  const updateDetailHistoryDisclosure = useCallback((open: boolean) => {
    detailHistoryDisclosureOpenRef.current = open;
  }, []);
  const [detailRemoteRefreshRequired, setDetailRemoteRefreshRequired] = useState(false);
  const detailRevisionRef = useRef<number | null>(null);
  const detailPollingInFlightRef = useRef(false);
  const [accountRemoteRefreshRequired, setAccountRemoteRefreshRequired] = useState(false);
  const [accountRemoteRefreshing, setAccountRemoteRefreshing] = useState(false);
  const [accountRefreshNonce, setAccountRefreshNonce] = useState(0);
  const [accountGrocyOutboxFocusId, setAccountGrocyOutboxFocusId] = useState<string | null>(null);
  const accountRevisionRef = useRef<number | null>(null);
  const accountPollingInFlightRef = useRef(false);
  const [storageFilter, setStorageFilter] = useState<InventoryStorageFilter>("전체");
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<InventoryStatusFilter>("all");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const inventorySearchFocusRef = useRef(false);
  const [inventorySearchResults, setInventorySearchResults] = useState<FoodItem[]>([]);
  const [inventorySearchTotal, setInventorySearchTotal] = useState<number | null>(null);
  const [inventorySearchHasMore, setInventorySearchHasMore] = useState(false);
  const [inventorySearchStatus, setInventorySearchStatus] = useState<InventorySearchStatus>("idle");
  const [inventorySearchError, setInventorySearchError] = useState("");
  const [inventorySearchKey, setInventorySearchKey] = useState("");
  const [inventorySearchRetry, setInventorySearchRetry] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<string | null>(null);
  toastRef.current = toast;
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [toastActionBusy, setToastActionBusy] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsNotice, setNotificationsNotice] = useState("");
  const [notificationRetryAction, setNotificationRetryAction] = useState<NotificationRetryAction | null>(null);
  const [notificationSyncFocus, setNotificationSyncFocus] = useState<NotificationSyncFocus | null>(null);
  const [notificationFocusRequest, setNotificationFocusRequest] = useState(0);
  const [pendingNotificationSyncRecordId, setPendingNotificationSyncRecordId] = useState<string | null>(null);
  const notificationRevisionRef = useRef<number | null>(null);
  const notificationPollingInFlightRef = useRef(false);
  const notificationReadInFlightRef = useRef(0);
  const notificationRefreshQueuedRef = useRef(false);
  const notificationReadOverridesRef = useRef(new Map<string, string>());
  const notificationFocusOverrideRef = useRef(false);
  const [productInfoRetryAction, setProductInfoRetryAction] = useState<ProductInfoRetryAction | null>(null);
  const [productInfoSavingFoodId, setProductInfoSavingFoodId] = useState<string | null>(null);
  const [productInfoNotice, setProductInfoNotice] = useState<{ foodId: string; message: string; requiresRefresh?: boolean } | null>(null);
  const [productProvenanceStatus, setProductProvenanceStatus] = useState<ProductProvenanceStatus | null>(null);
  const [productProvenanceMutatingFoodId, setProductProvenanceMutatingFoodId] = useState<string | null>(null);
  const [productProvenanceNotice, setProductProvenanceNotice] = useState<{ foodId: string; message: string; requiresRefresh?: boolean } | null>(null);
  const [demoNotificationReadAt, setDemoNotificationReadAt] = useState<Record<string, string>>({});
  const [shoppingList, setShoppingList] = useState<ApiShoppingListItem[]>([]);
  const [shoppingListStatus, setShoppingListStatus] = useState<ShoppingListStatus>("idle");
  const [shoppingListError, setShoppingListError] = useState("");
  const [shoppingListNotice, setShoppingListNotice] = useState("");
  const [shoppingListMutating, setShoppingListMutating] = useState(false);
  const [shoppingListRetryAction, setShoppingListRetryAction] = useState<ShoppingListRetryAction | null>(null);
  const [recentlyReceivedFood, setRecentlyReceivedFood] = useState<{ id: string; name: string } | null>(null);
  const recentlyReceivedFoodRef = useRef<{ id: string; name: string } | null>(null);
  const shoppingListMutatingRef = useRef(false);
  shoppingListMutatingRef.current = shoppingListMutating;
  const shoppingListRevisionRef = useRef<number | null>(null);
  const shoppingListPollingInFlightRef = useRef(false);
  const shoppingListSyncInFlightRef = useRef(false);
  const shoppingListRefreshQueuedRef = useRef(false);
  const shoppingReceiveKeys = useRef(new Map<string, string>());
  const shoppingInitialFocusRef = useRef(false);
  const [receiptSummaries, setReceiptSummaries] = useState<ApiReceiptSummary[]>([]);
  const [receiptSummariesStatus, setReceiptSummariesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [receiptSummariesNotice, setReceiptSummariesNotice] = useState("");
  const receiptSummariesRevisionRef = useRef<number | null>(null);
  const receiptSummariesPollingInFlightRef = useRef(false);
  const receiptSummariesSyncInFlightRef = useRef(false);
  const receiptQueueInitialFocusRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(mealApi.isConfigured ? "checking" : "fixture");
  const [dashboardStaleAt, setDashboardStaleAt] = useState<string | null>(null);
  const dashboardRevisionRef = useRef<number | null>(null);
  const dashboardPollingInFlightRef = useRef(false);
  const dashboardPollQueuedRef = useRef(false);
  const dashboardSyncInFlightRef = useRef(false);
  const [resumeReceiptId, setResumeReceiptId] = useState<string | null>(null);
  const [addSheetSessionKey, setAddSheetSessionKey] = useState(0);
  const addSheetOpenRequestRef = useRef(0);
  const mealSheetOpenRequestRef = useRef(0);
  const [reviewMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("review") === "1");
  const [receiptSourceReviewMode] = useState(() => typeof window !== "undefined" && mealApi.deploymentMode === "demo" && new URLSearchParams(window.location.search).get("review") === "1" && (new URLSearchParams(window.location.search).get("receipt_source_review") === "1" || new URLSearchParams(window.location.search).get("receipt_source_unmapped") === "1"));
  const [receiptSourceUnmappedMode] = useState(() => typeof window !== "undefined" && mealApi.deploymentMode === "demo" && new URLSearchParams(window.location.search).get("review") === "1" && new URLSearchParams(window.location.search).get("receipt_source_unmapped") === "1");
  const receiptSourceReviewOpenedRef = useRef(false);
  const [passwordResetToken] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset_token")?.trim() ?? "" : "");
  const workspaceSyncRef = useRef<WorkspaceSyncCoordinator | null>(null);
  if (workspaceSyncRef.current === null) {
    workspaceSyncRef.current = new WorkspaceSyncCoordinator(() => mealApi.prepareWorkspace(), mealApi.workspaceKey);
  }
  const workspaceSync = workspaceSyncRef.current;
  const [workspaceTransport, setWorkspaceTransport] = useState<WorkspaceSyncTransport | null>(null);

  useEffect(() => {
    const transport = createWorkspaceSyncTransport();
    setWorkspaceTransport(transport);
    return () => {
      transport.close();
      setWorkspaceTransport(null);
      workspaceSync.invalidateAll();
    };
  }, [workspaceSync]);

  useEffect(() => {
    if (!passwordResetToken || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("reset_token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [passwordResetToken]);

  const restoreContentNavigation = (destination: "home" | "food") => {
    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    const screen = document.querySelector<HTMLElement>("[data-testid=\"device-screen\"]");
    navigationIntentRef.current = destination;
    navigationIntentLastScrollTopRef.current = scroll?.scrollTop ?? null;
    activeContentNavRef.current = destination;
    setActiveNav(destination);
    window.requestAnimationFrame(() => {
      if (screen) screen.scrollTop = 0;
      if (destination === "home") {
        setInventoryNavTailSpace(0);
        scroll?.scrollTo({ top: 0, behavior: "auto" });
      } else {
        const inventory = document.querySelector<HTMLElement>(".inventory-section");
        if (scroll && inventory) {
          const desiredTop = targetScrollTop(scroll, inventory, "start");
          const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
          setInventoryNavTailSpace(Math.ceil(Math.max(0, desiredTop - maxScrollTop)));
          window.requestAnimationFrame(() => {
            if (screen) screen.scrollTop = 0;
            scrollTargetWithinContainer(scroll, inventory, "start", "auto");
            navigationIntentLastScrollTopRef.current = scroll.scrollTop;
            activeContentNavRef.current = destination;
            navigationIntentRef.current = destination;
            setActiveNav(destination);
          });
          return;
        }
        setInventoryNavTailSpace(0);
      }
      activeContentNavRef.current = destination;
      navigationIntentRef.current = destination;
      navigationIntentLastScrollTopRef.current = scroll?.scrollTop ?? null;
      setActiveNav(destination);
    });
  };

  useEffect(() => {
    if (inventoryNavTailSpace <= 0 || activeContentNavRef.current !== "food") return;
    let frame: number | null = null;
    frame = window.requestAnimationFrame(() => {
      const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
      const inventory = document.querySelector<HTMLElement>(".inventory-section");
      const screen = document.querySelector<HTMLElement>("[data-testid=\"device-screen\"]");
      if (!scroll || !inventory) return;
      if (screen) screen.scrollTop = 0;
      scrollTargetWithinContainer(scroll, inventory, "start", "auto");
      navigationIntentLastScrollTopRef.current = scroll.scrollTop;
    });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [inventoryNavTailSpace]);

  useEffect(() => {
    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    if (!scroll) return;
    let frame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (activeContentNavRef.current !== "food" || sheetRef.current !== null || inventorySearchFocusRef.current || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const inventory = document.querySelector<HTMLElement>(".inventory-section");
        const screen = document.querySelector<HTMLElement>("[data-testid=\"device-screen\"]");
        if (!inventory) return;
        if (screen) screen.scrollTop = 0;
        const desiredTop = targetScrollTop(scroll, inventory, "start");
        const currentTailSpace = document.querySelector<HTMLElement>(".inventory-nav-tail-space")?.clientHeight ?? 0;
        const maxScrollWithoutTail = Math.max(0, scroll.scrollHeight - scroll.clientHeight - currentTailSpace);
        const nextTailSpace = Math.ceil(Math.max(0, desiredTop - maxScrollWithoutTail));
        setInventoryNavTailSpace((current) => current === nextTailSpace ? current : nextTailSpace);
        if (nextTailSpace === currentTailSpace) {
          scrollTargetWithinContainer(scroll, inventory, "start", "auto");
          navigationIntentLastScrollTopRef.current = scroll.scrollTop;
        }
      });
    });
    resizeObserver.observe(scroll);
    return () => {
      resizeObserver.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const changeSheet = (next: SheetName) => {
    if (next === "account" && sheet === null) {
      accountOriginNavRef.current = activeContentNavRef.current;
    }
    const returningFromDetailDateReview = next === null && sheet === "add" && addReturnSheetRef.current === "detail";
    const resolvedNext = next === null && sheet === "add" && addReturnSheetRef.current
      ? addReturnSheetRef.current
      : next;
    if (resolvedNext !== sheet) keyboardHideRef.current();
    if (resolvedNext === "receipt-queue" && sheet !== "receipt-queue") receiptQueueInitialFocusRef.current = true;
    if (resolvedNext !== null && sheet === null) {
      const activeElement = document.activeElement;
      sheetRestoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    }
    if (resolvedNext === null && sheet === "meal") {
      const returnSheet = mealReturnSheetRef.current;
      mealReturnSheetRef.current = null;
      if (!returnSheet) mealDetailSessionReturnRef.current = false;
      if (returnSheet) {
        pendingMealCompletionFocusRef.current = null;
        setSheet(returnSheet);
        return;
      }
      restoreContentNavigation(mealSheetOriginNavRef.current);
    }
    if (resolvedNext === null && sheet === "detail") {
      setDetailEntryIntent(null);
      setDetailSyncFocusId(null);
    }
    if (resolvedNext === null && sheet === "detail" && notificationDetailReturnRef.current) {
      notificationDetailReturnRef.current = false;
      setDetailSyncFocusId(null);
      inventoryReturnContextRef.current = null;
      // The notification list may have refreshed while the detail sheet was
      // open. Re-entering the list therefore needs to reclaim focus even if
      // the original row was replaced by a cleared/empty notification state.
      notificationFocusOverrideRef.current = true;
      notificationReturnFocusIdRef.current = notificationReturnFocusIdRef.current ?? "__notification-summary__";
      setNotificationFocusRequest((current) => current + 1);
      setSheet("notifications");
      return;
    }
    if (resolvedNext === null && sheet === "detail" && accountDetailReturnRef.current) {
      accountDetailReturnRef.current = false;
      setDetailSyncFocusId(null);
      inventoryReturnContextRef.current = null;
      setSheet("account");
      return;
    }
    if (resolvedNext === null && sheet === "detail" && shoppingDetailReturnRef.current) {
      shoppingDetailReturnRef.current = false;
      shoppingInitialFocusRef.current = true;
      setSheet("shopping");
      return;
    }
    if (resolvedNext === null && sheet === "shopping") {
      shoppingInitialFocusRef.current = false;
      const returnSheet = shoppingReturnSheetRef.current;
      shoppingReturnSheetRef.current = null;
      // The received-food action is scoped to the shopping readback sheet.
      // Once that context is finally closed, do not leak a stale detail entry
      // into the home surface or a later shopping session.
      recentlyReceivedFoodRef.current = null;
      setRecentlyReceivedFood(null);
      if (returnSheet) {
        setSheet(returnSheet);
        if (returnSheet === "meal") {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const target = Array.from(document.querySelectorAll<HTMLElement>(".recipe-shopping-inline-button"))
                .find((element) => element.textContent?.includes("장보기 목록에 담기"));
              target?.focus({ preventScroll: true });
            });
          });
        }
        return;
      }
      restoreContentNavigation(shoppingOriginNavRef.current);
    }
    if (resolvedNext === null && sheet === "receipt-queue") {
      receiptQueueInitialFocusRef.current = false;
    }
    if (resolvedNext === null && sheet === "notifications") {
      const returnSheet = notificationReturnSheetRef.current;
      notificationReturnSheetRef.current = null;
      if (returnSheet) {
        notificationDetailReturnRef.current = false;
        notificationAccountReturnRef.current = false;
        setNotificationSyncFocus(null);
        setSheet(returnSheet);
        return;
      }
      notificationDetailReturnRef.current = false;
      notificationAccountReturnRef.current = false;
      notificationReturnFocusIdRef.current = null;
      notificationInitialFocusRef.current = false;
      setNotificationSyncFocus(null);
    }
    if (resolvedNext === null && sheet === "account" && notificationAccountReturnRef.current) {
      notificationAccountReturnRef.current = false;
      setAccountGrocyOutboxFocusId(null);
      notificationInitialFocusRef.current = false;
      setSheet("notifications");
      return;
    }
    if (resolvedNext === null && sheet === "account" && accountDetailReturnRef.current) {
      accountDetailReturnRef.current = false;
      setAccountGrocyOutboxFocusId(null);
      setSheet("detail");
      return;
    }
    if (resolvedNext === null && sheet === "add" && activeNav === "meal") {
      activeContentNavRef.current = mealSheetOriginNavRef.current;
      navigationIntentRef.current = mealSheetOriginNavRef.current;
      navigationIntentLastScrollTopRef.current = null;
      setActiveNav(mealSheetOriginNavRef.current);
    }
    if (resolvedNext === null && sheet === "detail" && mealDetailReturnRef.current) {
      mealDetailReturnRef.current = false;
      setSheet("meal");
      return;
    }
    if (resolvedNext === null && sheet === "account") {
      restoreContentNavigation(accountOriginNavRef.current);
      accountOriginNavRef.current = "home";
    }
    if (next === null && sheet === "add") {
      addReturnSheetRef.current = null;
      addReturnFoodContextRef.current = null;
      if (returningFromDetailDateReview) setDetailEntryIntent("date-review");
    }
    setSheet(resolvedNext);
  };

  const openGuidanceSheet = () => {
    guidanceReturnSheetRef.current = sheet === "detail" ? "detail" : null;
    changeSheet("guidance");
  };

  const closeGuidanceSheet = () => {
    const returnSheet = guidanceReturnSheetRef.current;
    guidanceReturnSheetRef.current = null;
    changeSheet(returnSheet);
  };

  const toggleTheme = () => {
    setThemeMode((current) => current === "light" ? "dark" : "light");
  };

  useEffect(() => {
    if (sheet !== null) return;
    const trigger = sheetRestoreFocusRef.current;
    if (!trigger) return;
    sheetRestoreFocusRef.current = null;

    let disposed = false;
    let fallbackTimer: number | undefined;
    let restoreTimer: number | undefined;
    const restoreFocus = () => {
      if (disposed || document.querySelector('[data-testid="bottom-sheet"]')) return;
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        restoreTimer = undefined;
        if (disposed || document.querySelector('[data-testid="bottom-sheet"]')) return;
        const fallbackCandidates = activeContentNavRef.current === "food"
          ? [
            ...document.querySelectorAll<HTMLElement>("[data-inventory-food-id]"),
            ...document.querySelectorAll<HTMLElement>(".inventory-empty-action, .inventory-add-button"),
          ]
          : [
            ...document.querySelectorAll<HTMLElement>(".priority-card"),
            ...document.querySelectorAll<HTMLElement>(".priority-section .section-heading, .meal-plan-button"),
          ];
        const fallback = fallbackCandidates.find((element) => !element.hasAttribute("disabled"))
          ?? document.querySelector<HTMLElement>(".connection-pill");
        const target = trigger.isConnected && !trigger.hasAttribute("disabled") ? trigger : fallback;
        if (!target || target.hasAttribute("disabled")) return;
        target.focus({ preventScroll: true });
        observer.disconnect();
        if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      }, 60);
    };
    const observer = new MutationObserver(restoreFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    restoreFocus();
    fallbackTimer = window.setTimeout(() => {
      if (!disposed) restoreFocus();
    }, 1200);

    return () => {
      disposed = true;
      observer.disconnect();
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    };
  }, [sheet]);

  // An intake sheet closes before a connected mutation has necessarily
  // returned. Keep the user's focus on the newly added food once its
  // authoritative row appears, but never steal focus if they have already
  // started another interaction.
  useEffect(() => {
    const pending = pendingAddedFoodFocusRef.current;
    if (!pending || sheet !== null) return;

    let disposed = false;
    let timer: number | undefined;
    let focusTimer: number | undefined;
    let settleFocusInterval: number | undefined;
    let observer: MutationObserver;
    const normalizedName = pending.name.trim().replace(/\s+/g, " ");
    const findTarget = () => {
      const matchesName = (element: HTMLElement) => !element.hasAttribute("disabled") && element.textContent?.replace(/\s+/g, " ").includes(normalizedName);
      const priorityTarget = Array.from(document.querySelectorAll<HTMLElement>(".priority-card")).find(matchesName);
      if (pending.sourceNav === "home" && priorityTarget) return priorityTarget;
      return Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]")).find(matchesName) ?? null;
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      if (settleFocusInterval !== undefined) window.clearInterval(settleFocusInterval);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
      const activeElement = document.activeElement;
      const isExpectedFocus = activeElement === pending.trigger
      || activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && activeElement.classList.contains("sheet-close-button"))
        || (activeElement instanceof HTMLElement && Boolean(activeElement.closest(".toast")))
        || !activeElement?.isConnected;
      if (!isExpectedFocus) {
        pendingAddedFoodFocusRef.current = null;
        cleanup();
        return;
      }
      const candidates = pending.sourceNav === "food"
        ? Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]"))
        : Array.from(document.querySelectorAll<HTMLElement>(".priority-card"));
      const target = findTarget() ?? candidates.find((element) => !element.hasAttribute("disabled") && element.textContent?.replace(/\s+/g, " ").includes(normalizedName));
      if (!target) return;
      if (focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
        const currentActiveElement = document.activeElement;
          const canTakeFocus = currentActiveElement === pending.trigger
          || currentActiveElement === document.body
          || currentActiveElement === document.documentElement
          || (currentActiveElement instanceof HTMLElement && currentActiveElement.classList.contains("sheet-close-button"))
          || (currentActiveElement instanceof HTMLElement && Boolean(currentActiveElement.closest(".toast")))
          || !currentActiveElement?.isConnected;
        if (!canTakeFocus) {
          pendingAddedFoodFocusRef.current = null;
          cleanup();
          return;
        }
        const currentTarget = findTarget();
        if (!currentTarget) {
          tryFocus();
          return;
        }
        if (currentTarget.matches(".inventory-row")) scrollTargetWithinNearestContainer(currentTarget, "center", getMobileScrollBehavior());
        currentTarget.focus({ preventScroll: true });
        const settleStartedAt = performance.now();
        settleFocusInterval = window.setInterval(() => {
          if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) {
            cleanup();
            return;
          }
          const settleActiveElement = document.activeElement;
          const canSettle = settleActiveElement === pending.trigger
            || settleActiveElement === document.body
            || settleActiveElement === document.documentElement
            || (settleActiveElement instanceof HTMLElement && Boolean(settleActiveElement.closest(".toast")))
            || !settleActiveElement?.isConnected
            || settleActiveElement === currentTarget;
          if (!canSettle) {
            pendingAddedFoodFocusRef.current = null;
            cleanup();
            return;
          }
          const settledTarget = findTarget();
          settledTarget?.focus({ preventScroll: true });
          if (performance.now() - settleStartedAt >= 1_000) {
            pendingAddedFoodFocusRef.current = null;
            cleanup();
          }
        }, 80);
      }, 100);
    };

    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(() => {
      if (pendingAddedFoodFocusRef.current !== pending) {
        cleanup();
        return;
      }
      const activeElement = document.activeElement;
      const canUseFallback = activeElement === pending.trigger
        || activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && activeElement.classList.contains("sheet-close-button"))
        || (activeElement instanceof HTMLElement && Boolean(activeElement.closest(".toast")))
        || !activeElement?.isConnected;
      pendingAddedFoodFocusRef.current = null;
      if (canUseFallback) document.querySelector<HTMLElement>(".connection-pill")?.focus({ preventScroll: true });
      cleanup();
    }, 8_000);
    tryFocus();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [foods, sheet]);

  // Keep the notification list as the task context after a notification
  // opens a food detail. The row may rerender when its read state is written,
  // so focus by notification id after the list is mounted again.
  useEffect(() => {
    if (sheet !== "notifications" || !notificationReturnFocusIdRef.current) return;

    const notificationId = notificationReturnFocusIdRef.current;
    let disposed = false;
    let timer: number | undefined;
    let focusTimer: number | undefined;
    let settleFocusInterval: number | undefined;
    let observer: MutationObserver;
    const canTakeFocus = () => {
      const activeElement = document.activeElement;
      return notificationFocusOverrideRef.current
        || activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && activeElement.classList.contains("sheet-close-button"))
        || !activeElement?.isConnected;
    };
    const findTarget = () => {
      const exactTarget = Array.from(document.querySelectorAll<HTMLElement>("[data-notification-id]"))
        .find((element) => element.dataset.notificationId === notificationId && !element.hasAttribute("disabled"));
      if (exactTarget) return exactTarget;
      if (notificationsLoading) return null;
      return document.querySelector<HTMLElement>(".notification-row, .notification-read-all, .notification-summary");
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      if (settleFocusInterval !== undefined) window.clearInterval(settleFocusInterval);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== "notifications" || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== "notifications" || !canTakeFocus()) return;
        const currentTarget = findTarget();
        if (!currentTarget) {
          tryFocus();
          return;
        }
        const forceSettleFocus = notificationFocusOverrideRef.current;
        scrollTargetWithinNearestContainer(currentTarget, "end", "auto");
        currentTarget.focus({ preventScroll: true });
        // Returning to a notification row is non-text navigation; do not let
        // a previously focused detail field keep the mobile keyboard visible.
        keyboardHideRef.current();
        notificationFocusOverrideRef.current = false;
        if (forceSettleFocus) {
          const settleStartedAt = performance.now();
          settleFocusInterval = window.setInterval(() => {
            if (disposed || sheetRef.current !== "notifications") {
              cleanup();
              return;
            }
            const settledTarget = findTarget();
            settledTarget?.focus({ preventScroll: true });
            keyboardHideRef.current();
            if (performance.now() - settleStartedAt >= 1_800) {
              notificationReturnFocusIdRef.current = null;
              cleanup();
            }
          }, 80);
        } else {
          notificationReturnFocusIdRef.current = null;
          cleanup();
        }
      }, 80);
    };

    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-describedby"] });
    timer = window.setTimeout(() => {
      if (notificationReturnFocusIdRef.current !== notificationId) {
        cleanup();
        return;
      }
      if (canTakeFocus()) {
        (findTarget() ?? document.querySelector<HTMLElement>(".notification-row, .notification-read-all"))?.focus({ preventScroll: true });
        keyboardHideRef.current();
      }
      notificationFocusOverrideRef.current = false;
      notificationReturnFocusIdRef.current = null;
      cleanup();
    }, notificationFocusOverrideRef.current ? 3_000 : 1_500);
    tryFocus();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [demoNotificationReadAt, notifications, notificationsLoading, pendingNotificationSyncRecordId, sheet]);

  // A detail return can land on an intentionally empty notification list
  // after a remote readback. In that state there is no row for the normal
  // return-focus effect to target, so reclaim the summary explicitly after
  // the notification sheet has committed its new empty state.
  useEffect(() => {
    if (sheet !== "notifications" || !notificationFocusRequest || notificationsLoading || notifications.length > 0) return;
    let disposed = false;
    let settle: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      settle = window.requestAnimationFrame(() => {
        if (disposed || sheetRef.current !== "notifications") return;
        const summary = document.querySelector<HTMLElement>(".notification-summary");
        summary?.focus({ preventScroll: true });
      });
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      if (settle !== undefined) window.cancelAnimationFrame(settle);
    };
  }, [notificationFocusRequest, notifications.length, notificationsLoading, sheet]);

  useEffect(() => {
    if (sheet !== "notifications" || !pendingNotificationSyncRecordId || notificationsLoading) return;
    const target = notifications.find((notification) => notification.sync_record_id === pendingNotificationSyncRecordId);
    if (target) {
      notificationInitialFocusRef.current = false;
      notificationReturnFocusIdRef.current = target.id;
      setPendingNotificationSyncRecordId(null);
      return;
    }
    const message = "이 작업의 알림은 현재 목록에서 찾지 못했어요. 계정에서 작업 상세를 확인해 주세요.";
    setPendingNotificationSyncRecordId(null);
    setToastAction({
      message,
      label: "계정에서 확인",
      onInvoke: () => {
        notificationAccountReturnRef.current = true;
        setAccountGrocyOutboxFocusId(pendingNotificationSyncRecordId);
        changeSheet("account");
      },
    });
    setToast(message);
  }, [notifications, notificationsLoading, pendingNotificationSyncRecordId, sheet]);

  // A notification center opened from Home is an action list, so the first
  // unread row is the useful starting point for keyboard and assistive-tech
  // users. Returning from food detail has a separate exact-row contract above;
  // this intent is only set for a fresh notification-center entry.
  useEffect(() => {
    if (sheet !== "notifications" || !notificationInitialFocusRef.current || notificationReturnFocusIdRef.current) return;
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
      const unreadTarget = document.querySelector<HTMLElement>(".notification-row:not(.notification-row-read)");
      if (unreadTarget) return unreadTarget;
      if (notificationsLoading) return null;
      return document.querySelector<HTMLElement>(".notification-summary");
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== "notifications" || notificationReturnFocusIdRef.current || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || target.hasAttribute("disabled") || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== "notifications" || notificationReturnFocusIdRef.current || !canTakeFocus()) return;
        const currentTarget = findTarget();
        if (!currentTarget || currentTarget.hasAttribute("disabled")) {
          tryFocus();
          return;
        }
        scrollTargetWithinNearestContainer(currentTarget, "nearest", "auto");
        currentTarget.focus({ preventScroll: true });
        notificationInitialFocusRef.current = false;
        cleanup();
      }, 120);
    };
    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-describedby"] });
    timer = window.setTimeout(() => {
      notificationInitialFocusRef.current = false;
      cleanup();
    }, 3_000);
    tryFocus();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [demoNotificationReadAt, notifications, notificationsLoading, sheet]);

  // A fresh receipt queue entry is itself a task list. Focus the first resume
  // row after the sheet settles, while a selected receipt hands off to the
  // AddFoodSheet review-focus contract instead.
  useEffect(() => {
    if (sheet !== "receipt-queue" || !receiptQueueInitialFocusRef.current) return;
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
    const findTarget = () => document.querySelector<HTMLElement>(".receipt-review-queue-row, .receipt-review-queue-empty .secondary-sheet-button");
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== "receipt-queue" || !receiptQueueInitialFocusRef.current || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || target.hasAttribute("disabled") || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== "receipt-queue" || !receiptQueueInitialFocusRef.current || !canTakeFocus()) return;
        const currentTarget = findTarget();
        if (!currentTarget || currentTarget.hasAttribute("disabled")) {
          tryFocus();
          return;
        }
        scrollTargetWithinNearestContainer(currentTarget, "nearest", "auto");
        currentTarget.focus({ preventScroll: true });
        receiptQueueInitialFocusRef.current = false;
        cleanup();
      }, 120);
    };
    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-describedby"] });
    timer = window.setTimeout(() => {
      receiptQueueInitialFocusRef.current = false;
      cleanup();
    }, 3_000);
    tryFocus();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [receiptSummaries, receiptSummariesStatus, sheet]);

  // A planner safety link opens a detail sheet without leaving the planner.
  // Restore that exact link after the detail closes so a user can continue
  // checking the remaining guidance where they left off.
  useEffect(() => {
    if (sheet !== "meal" || !mealDetailReturnFocusIdRef.current) return;

    const foodId = mealDetailReturnFocusIdRef.current;
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
      const linkedTarget = Array.from(document.querySelectorAll<HTMLElement>("[data-meal-food-id]"))
        .find((element) => element.dataset.mealFoodId === foodId && !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      if (linkedTarget) return linkedTarget;
      return Array.from(document.querySelectorAll<HTMLElement>(".recipe-safety-summary, .recipe-actions .primary-sheet-button"))
        .find((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0) ?? null;
    };
    const mealSheetHasSettled = () => {
      const activeSheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
      const deviceScreen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      if (!activeSheet || !deviceScreen) return true;
      return Math.abs(activeSheet.getBoundingClientRect().bottom - deviceScreen.getBoundingClientRect().bottom) <= 0.25
        && getComputedStyle(activeSheet).transform === "none";
    };
    const restorePlannerPositionAndFocus = (target: HTMLElement | null) => {
      if (!target) return false;
      const content = target.closest<HTMLElement>(".meal-sheet-content")?.closest<HTMLElement>(".sheet-content");
      const previousScrollTop = mealDetailReturnScrollTopRef.current;
      if (content && previousScrollTop !== null) {
        const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight);
        content.scrollTop = Math.max(0, Math.min(maxScrollTop, previousScrollTop));
        const contentBox = content.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        if (targetBox.top < contentBox.top - 1 || targetBox.bottom > contentBox.bottom + 1) {
          scrollTargetWithinContainer(content, target, "nearest", "auto");
        }
      } else {
        scrollTargetWithinNearestContainer(target, "nearest", getMobileScrollBehavior());
      }
      target.focus({ preventScroll: true });
      mealDetailReturnFocusIdRef.current = null;
      mealDetailReturnScrollTopRef.current = null;
      return true;
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== "meal" || !canTakeFocus()) return;
      const target = findTarget();
      if (!target || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== "meal" || !canTakeFocus()) return;
        if (!mealSheetHasSettled()) {
          focusTimer = window.setTimeout(() => {
            focusTimer = undefined;
            tryFocus();
          }, 32);
          return;
        }
        const currentTarget = findTarget();
        if (!currentTarget) {
          tryFocus();
          return;
        }
        restorePlannerPositionAndFocus(currentTarget);
        cleanup();
      }, 80);
    };

    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-describedby"] });
    timer = window.setTimeout(() => {
      if (mealDetailReturnFocusIdRef.current !== foodId) {
        cleanup();
        return;
      }
      if (canTakeFocus()) restorePlannerPositionAndFocus(findTarget());
      mealDetailReturnFocusIdRef.current = null;
      mealDetailReturnScrollTopRef.current = null;
      cleanup();
    }, 1_500);
    tryFocus();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [foods, sheet]);

  // Meal completion closes the planner before the authoritative inventory
  // readback necessarily arrives. Wait for food rows/quantities to change,
  // then focus the first remaining ingredient in the same origin.
  useEffect(() => {
    const pending = pendingMealCompletionFocusRef.current;
    if (!pending || sheet !== null) return;
    const currentFoodsSignature = foods.map((food) => `${food.id}:${food.quantity}`).join("|");
    if (currentFoodsSignature === pending.beforeFoodsSignature) return;

    let disposed = false;
    let timer: number | undefined;
    let focusTimer: number | undefined;
    let observer: MutationObserver;
    const canTakeFocus = () => {
      const activeElement = document.activeElement;
      return activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && (activeElement.classList.contains("sheet-close-button") || activeElement.classList.contains("app-bottom-nav-item")))
        || !activeElement?.isConnected;
    };
    const findTarget = () => {
      const candidates = pending.sourceNav === "home"
        ? Array.from(document.querySelectorAll<HTMLElement>(".priority-card"))
        : Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]"));
      const preferred = pending.preferredFoodIds
        .map((foodId) => candidates.find((element) => (pending.sourceNav === "home" ? element.dataset.priorityFoodId : element.dataset.inventoryFoodId) === foodId && !element.hasAttribute("disabled")))
        .find((element): element is HTMLElement => Boolean(element));
      return preferred ?? candidates.find((element) => !element.hasAttribute("disabled")) ?? null;
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
      if (!canTakeFocus()) {
        pendingMealCompletionFocusRef.current = null;
        cleanup();
        return;
      }
      if (!findTarget() || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
        if (!canTakeFocus()) {
          pendingMealCompletionFocusRef.current = null;
          cleanup();
          return;
        }
        const currentTarget = findTarget();
        if (!currentTarget) {
          tryFocus();
          return;
        }
        if (pending.sourceNav === "food") scrollTargetWithinNearestContainer(currentTarget, "center", getMobileScrollBehavior());
        currentTarget.focus({ preventScroll: true });
        pendingMealCompletionFocusRef.current = null;
        cleanup();
      }, 100);
    };

    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(() => {
      if (pendingMealCompletionFocusRef.current !== pending) {
        cleanup();
        return;
      }
      if (canTakeFocus()) document.querySelector<HTMLElement>(".connection-pill")?.focus({ preventScroll: true });
      pendingMealCompletionFocusRef.current = null;
      cleanup();
    }, 8_000);
    tryFocus();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [foods, sheet]);

  // Date confirmation closes the detail sheet before a connected mutation
  // necessarily returns. Keep the result discoverable by restoring focus to
  // the exact food row once the updated dashboard state is rendered. This is
  // separate from intake focus because a date write can keep the existing row
  // in place and should not be treated as a newly added item.
  useEffect(() => {
    const pending = pendingFoodDateFocusRef.current;
    if (!pending || sheet !== null) return;

    let disposed = false;
    let timer: number | undefined;
    let focusTimer: number | undefined;
    let observer: MutationObserver;
    const normalizedName = pending.name.trim().replace(/\s+/g, " ");
    const findTarget = () => {
      const matches = (element: HTMLElement) => {
        if (element.hasAttribute("disabled")) return false;
        if (pending.sourceNav === "food" && element.dataset.inventoryFoodId === pending.foodId) return true;
        if (pending.sourceNav === "home" && element.dataset.priorityFoodId === pending.foodId) return true;
        return element.textContent?.replace(/\s+/g, " ").includes(normalizedName) ?? false;
      };
      const scoped = pending.sourceNav === "home"
        ? Array.from(document.querySelectorAll<HTMLElement>(".priority-card"))
        : Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]"));
      return scoped.find(matches) ?? null;
    };
    const cleanup = () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
    const canTakeFocus = () => {
      const activeElement = document.activeElement;
      return activeElement === pending.trigger
        || activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && Boolean(activeElement.closest(".toast")))
        || !activeElement?.isConnected;
    };
    const tryFocus = () => {
      if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
      if (!canTakeFocus()) {
        pendingFoodDateFocusRef.current = null;
        cleanup();
        return;
      }
      const target = findTarget();
      if (!target || focusTimer !== undefined) return;
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        if (disposed || sheetRef.current !== null || document.querySelector('[data-testid="bottom-sheet"]')) return;
        if (!canTakeFocus()) {
          pendingFoodDateFocusRef.current = null;
          cleanup();
          return;
        }
        const currentTarget = findTarget();
        if (!currentTarget) {
          tryFocus();
          return;
        }
        if (currentTarget.matches(".inventory-row")) scrollTargetWithinNearestContainer(currentTarget, "center", getMobileScrollBehavior());
        currentTarget.focus({ preventScroll: true });
        pendingFoodDateFocusRef.current = null;
        cleanup();
      }, 100);
    };

    observer = new MutationObserver(tryFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(() => {
      if (pendingFoodDateFocusRef.current !== pending) {
        cleanup();
        return;
      }
      if (canTakeFocus()) document.querySelector<HTMLElement>(".connection-pill")?.focus({ preventScroll: true });
      pendingFoodDateFocusRef.current = null;
      cleanup();
    }, 8_000);
    tryFocus();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [foods, sheet]);

  const findFoodById = (foodId: string) => foods.find((food) => food.id === foodId)
    ?? inventorySearchResults.find((food) => food.id === foodId)
    ?? null;
  const selectedFood = selectedFoodId ? findFoodById(selectedFoodId) : null;
  const customStorageLocations = useMemo(
    () => storageLocations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id)),
    [storageLocations],
  );
  const selectedStorageLocation = customStorageLocations.find((location) => `location:${location.id}` === storageFilter) ?? null;
  const priorityFoods = useMemo(
    () => foods.filter((food) => food.priority <= 3).sort((a, b) => a.priority - b.priority),
    [foods],
  );
  const mealDateReviewFoods = useMemo(
    () => foods.slice(0, 3)
      .filter((food) => Boolean(dateReviewReason(food, currentDate)))
      .map((food) => ({ id: food.id, name: food.name })),
    [currentDate, foods],
  );
  const priorityNeedsReviewCount = useMemo(
    () => priorityFoods.filter((food) => Boolean(attentionReviewReason(food, currentDate))).length,
    [currentDate, priorityFoods],
  );
  const inventoryNeedsReviewFoods = useMemo(
    () => foods.filter((food) => Boolean(attentionReviewReason(food, currentDate))),
    [currentDate, foods],
  );
  const inventoryNeedsReviewCount = inventoryNeedsReviewFoods.length;
  const inventoryReviewTopicLabel = useMemo(() => {
    const topics = new Set<"date" | "storage">();
    inventoryNeedsReviewFoods.forEach((food) => {
      const reason = attentionReviewReason(food, currentDate);
      if (!reason) return;
      if (reason === "보관 방법 확인") topics.add("storage");
      else topics.add("date");
    });
    return getHomeReviewTopicLabel(topics);
  }, [currentDate, inventoryNeedsReviewFoods]);
  const homeTrustTitle = inventoryNeedsReviewCount
    ? `${inventoryReviewTopicLabel} 살펴볼 식품 ${inventoryNeedsReviewCount}개`
    : "먼저 살펴볼 날짜는 소비기한이 아니에요";
  const homeTrustDescription = inventoryNeedsReviewCount
    ? "포장지 날짜와 보관 방법을 살펴봐 주세요."
    : "포장지 날짜와 식품 상태를 보고 직접 판단해 주세요.";
  const normalizedInventoryQuery = inventoryQuery.trim().toLocaleLowerCase("ko-KR");
  const inventoryScopeFoods = useMemo(() => {
    const inventorySearchActive = mealApi.isConfigured && (Boolean(normalizedInventoryQuery) || storageFilter !== "전체");
    const requestKey = `${normalizedInventoryQuery}|${storageFilter}`;
    if (inventorySearchActive && inventorySearchKey === requestKey && inventorySearchStatus !== "idle") return inventorySearchResults;
    const selectedLocationId = storageLocationIdFromFilter(storageFilter);
    const byStorage = storageFilter === "전체"
      ? foods
      : selectedLocationId
        ? foods.filter((food) => food.storageLocationId === selectedLocationId)
        : foods.filter((food) => food.storage === storageFilter);
    if (!normalizedInventoryQuery) return byStorage;
    return byStorage.filter((food) => [food.name, food.brand, food.category].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedInventoryQuery)));
  }, [foods, inventorySearchKey, inventorySearchResults, inventorySearchStatus, normalizedInventoryQuery, storageFilter]);
  const inventoryScopedNeedsReviewCount = useMemo(
    () => inventoryScopeFoods.filter((food) => Boolean(attentionReviewReason(food, currentDate))).length,
    [currentDate, inventoryScopeFoods],
  );
  const inventoryScopedPriorityCount = useMemo(
    () => inventoryScopeFoods.filter((food) => food.priority <= 3).length,
    [inventoryScopeFoods],
  );
  const filteredFoods = useMemo(() => {
    const byStatus = inventoryStatusFilter === "needs-review"
      ? inventoryScopeFoods.filter((food) => Boolean(attentionReviewReason(food, currentDate)))
      : inventoryStatusFilter === "priority"
        ? inventoryScopeFoods.filter((food) => food.priority <= 3)
        : inventoryScopeFoods;
    return byStatus;
  }, [currentDate, inventoryScopeFoods, inventoryStatusFilter]);
  const todayEyebrow = formatTodayEyebrow(currentDate);
  const currentMealPlanHint = mealPlanHint(priorityFoods, foods.length, priorityNeedsReviewCount);
  const hasInventoryQuery = inventoryQuery.trim().length > 0;
  const inventorySearchCanUseServer = mealApi.isConfigured && connectionState !== "offline" && connectionState !== "auth_required";
  const inventorySearchActive = inventorySearchCanUseServer && (Boolean(normalizedInventoryQuery) || storageFilter !== "전체");
  const inventorySearchRequestKey = `${normalizedInventoryQuery}|${storageFilter}`;
  const inventorySearchOwnsResults = inventorySearchActive && inventorySearchKey === inventorySearchRequestKey && inventorySearchStatus !== "idle";
  const inventoryCount = inventoryStatusFilter === "all" && inventorySearchOwnsResults && inventorySearchTotal != null ? inventorySearchTotal : filteredFoods.length;
  const inventorySearchPending = inventorySearchOwnsResults && inventorySearchStatus === "loading";
  const inventoryDataUnknown = mealApi.isConfigured && connectionState !== "connected" && !foods.length;
  const inventoryDataStatusLabel = connectionState === "checking"
    ? "식품 목록을 불러오는 중이에요"
    : connectionState === "auth_required"
      ? "다시 로그인해 주세요"
      : "식품 목록을 불러오지 못했어요";
  const inventoryDataStatusDescription = connectionState === "auth_required"
    ? "다시 로그인하면 저장한 식품을 볼 수 있어요."
    : connectionState === "checking"
      ? "저장한 식품을 불러오고 있어요."
      : "인터넷에 연결한 뒤 다시 불러와 주세요.";
  const priorityDataStatusLabel = connectionState === "offline" ? "식품 목록을 불러오지 못했어요" : inventoryDataStatusLabel;
  const priorityDataStatusDescription = connectionState === "offline" ? "연결되면 먼저 살펴볼 식품을 보여드려요." : inventoryDataStatusDescription;
  const inventoryListStatusLabel = connectionState === "offline" ? "인터넷에 연결되지 않았어요" : inventoryDataStatusLabel;
  const inventoryListStatusDescription = connectionState === "offline" ? "다시 연결하면 식품 목록을 불러올 수 있어요." : inventoryDataStatusDescription;
  const mealPlanStatusDescription = connectionState === "offline" ? "최신 재고를 불러온 뒤 식단을 만들 수 있어요." : inventoryDataStatusDescription;
  const demoOfflineFixturePreview = mealApi.deploymentMode === "demo" && connectionState === "offline" && !dashboardStaleAt && foods.length > 0;
  const priorityHeadingAccessibleName = inventoryDataUnknown
    ? priorityDataStatusLabel
    : connectionState === "offline" && dashboardStaleAt
      ? `최근에 불러온 식품 중 먼저 살펴볼 항목 ${priorityFoods.length}개`
      : connectionState === "auth_required" && dashboardStaleAt
        ? `최근에 불러온 식품 중 먼저 살펴볼 항목 ${priorityFoods.length}개`
      : `먼저 살펴볼 식품 ${priorityFoods.length}개`;
  const inventoryStatusLabel = inventoryStatusFilter === "needs-review" ? "날짜·보관 확인" : inventoryStatusFilter === "priority" ? "먼저 살펴보기" : "";
  const inventoryScopeIsStale = inventorySearchActive && inventorySearchStatus === "error" && filteredFoods.length > 0;
  const inventoryScopeLabel = [
    inventoryScopeIsStale ? "이전 결과" : "",
    hasInventoryQuery ? `“${inventoryQuery.trim()}” 검색 결과` : "",
    storageFilter !== "전체" ? `${selectedStorageLocation?.name ?? storageFilter} 보관 식품` : "",
    inventoryStatusLabel,
  ].filter(Boolean).join(" · ");
  const inventorySearchLoadingLabel = hasInventoryQuery
    ? `“${inventoryQuery.trim()}” 검색 결과를 불러오고 있어요`
    : storageFilter !== "전체"
      ? `${selectedStorageLocation?.name ?? storageFilter} 보관 식품을 불러오고 있어요`
      : "재고를 불러오고 있어요";
  const inventorySearchErrorLabel = hasInventoryQuery
    ? `“${inventoryQuery.trim()}” 검색 결과를 불러오지 못했어요`
    : storageFilter !== "전체"
      ? `${selectedStorageLocation?.name ?? storageFilter} 보관 식품을 불러오지 못했어요`
      : "재고를 불러오지 못했어요";
  const showInventoryScope = Boolean(inventoryScopeLabel)
    && !(inventorySearchPending && !filteredFoods.length)
    && !(inventorySearchStatus === "error" && !filteredFoods.length);
  const inventoryHasEmptyResult = (hasInventoryQuery || storageFilter !== "전체" || inventoryStatusFilter !== "all") && !filteredFoods.length;
  const pendingReceiptSummaries = useMemo(
    () => receiptSummaries
      .filter((receipt) => receipt.status === "review_required" && !receipt.stock_created && !receipt.source_redacted)
      .sort((left, right) => {
        const leftTime = left.purchased_at ? Date.parse(left.purchased_at) : Number.NEGATIVE_INFINITY;
        const rightTime = right.purchased_at ? Date.parse(right.purchased_at) : Number.NEGATIVE_INFINITY;
        return (Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY) - (Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY);
      }),
    [receiptSummaries],
  );
  const latestPendingReceipt = pendingReceiptSummaries[0] ?? null;

  useEffect(() => {
    const selectedLocationId = storageLocationIdFromFilter(storageFilter);
    if (selectedLocationId && !storageLocations.some((location) => location.id === selectedLocationId)) {
      setStorageFilter("전체");
    }
  }, [storageFilter, storageLocations]);

  const captureInventoryReturnContext = (foodId: string) => {
    if (typeof document === "undefined") return;
    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    if (!scroll) return;
    const scrollTop = scroll.getBoundingClientRect().top;
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]")).find((element) => element.dataset.inventoryFoodId === foodId);
    inventoryReturnContextRef.current = {
      foodId,
      returnNav: "food",
      scrollTop: scroll.scrollTop,
      rowOffset: row ? row.getBoundingClientRect().top - scrollTop : null,
    };
  };

  const restoreInventoryReturnContext = () => {
    const context = inventoryReturnContextRef.current;
    inventoryReturnContextRef.current = null;
    if (!context || typeof document === "undefined") return;
    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    if (!scroll) return;

    activeContentNavRef.current = context.returnNav;
    navigationIntentRef.current = context.returnNav;
    navigationIntentLastScrollTopRef.current = scroll.scrollTop;
    setActiveNav(context.returnNav);

    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-food-id]")).find((element) => element.dataset.inventoryFoodId === context.foodId);
    if (row && context.rowOffset !== null) {
      const currentOffset = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const targetScrollTop = Math.max(0, Math.min(maxScrollTop, scroll.scrollTop + currentOffset - context.rowOffset));
      scroll.scrollTo({ top: targetScrollTop, behavior: "auto" });
      window.requestAnimationFrame(() => row.focus({ preventScroll: true }));
      return;
    }

    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTo({ top: Math.max(0, Math.min(maxScrollTop, context.scrollTop)), behavior: "auto" });
    if (row) scrollTargetWithinNearestContainer(row, "center", "auto");
    window.requestAnimationFrame(() => row?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (sheet !== null || typeof document === "undefined") return;

    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    const inventory = document.querySelector<HTMLElement>(".inventory-section");
    if (!scroll || !inventory) return;

    let frame: number | null = null;
    const updateActiveNav = () => {
      frame = null;
      const viewportTop = scroll.getBoundingClientRect().top;
      const inventoryTop = inventory.getBoundingClientRect().top;
      const threshold = viewportTop + Math.min(scroll.clientHeight * 0.42, 360);
      const atBottom = scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 8;
      // Programmatic scroll can settle with a small fractional/overscroll delta
      // on mobile. Do not interpret that settling noise as the user abandoning
      // the tab they just selected; a real reverse scroll is still allowed to
      // clear the intent once it moves beyond this tolerance.
      const navigationIntentJitter = Math.min(16, Math.max(8, scroll.clientHeight * 0.02));
      const previousIntentScrollTop = navigationIntentLastScrollTopRef.current;
      if (navigationIntentRef.current !== null && previousIntentScrollTop !== null) {
        const movedAwayFromIntent = navigationIntentRef.current === "food"
          ? scroll.scrollTop < previousIntentScrollTop - navigationIntentJitter
          : scroll.scrollTop > previousIntentScrollTop + navigationIntentJitter;
        if (movedAwayFromIntent) {
          navigationIntentRef.current = null;
          navigationIntentLastScrollTopRef.current = null;
        }
      }
      const navigationIntent = navigationIntentRef.current;
      if (navigationIntent === "home" && scroll.scrollTop > 1) {
        activeContentNavRef.current = "home";
        navigationIntentLastScrollTopRef.current = scroll.scrollTop;
        setActiveNav((current) => current === "home" ? current : "home");
        return;
      }
      if (navigationIntent === "food" && inventoryTop > viewportTop + 5 && !atBottom) {
        activeContentNavRef.current = "food";
        navigationIntentLastScrollTopRef.current = scroll.scrollTop;
        setActiveNav((current) => current === "food" ? current : "food");
        return;
      }
      navigationIntentRef.current = null;
      navigationIntentLastScrollTopRef.current = null;
      const nextNav = inventoryTop <= threshold || atBottom ? "food" : "home";
      activeContentNavRef.current = nextNav;
      setActiveNav((current) => current === nextNav ? current : nextNav);
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateActiveNav);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);

    scroll.addEventListener("scroll", scheduleUpdate, { passive: true });
    resizeObserver.observe(scroll);
    resizeObserver.observe(inventory);
    const content = scroll.querySelector<HTMLElement>(".mobile-scroll-content");
    if (content) resizeObserver.observe(content);
    scheduleUpdate();

    return () => {
      scroll.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [sheet]);

  useEffect(() => {
    if (sheet !== null || !inventoryReturnContextRef.current) return;
    const frame = window.requestAnimationFrame(restoreInventoryReturnContext);
    return () => window.cancelAnimationFrame(frame);
  }, [sheet]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestKey = `${normalizedInventoryQuery}|${storageFilter}`;
    const active = inventorySearchCanUseServer && (Boolean(normalizedInventoryQuery) || storageFilter !== "전체");
    if (!active) {
      workspaceSync.invalidate("inventory-search");
      setInventorySearchKey("");
      setInventorySearchResults([]);
      setInventorySearchTotal(null);
      setInventorySearchHasMore(false);
      setInventorySearchError("");
      setInventorySearchStatus("idle");
      return;
    }

    setInventorySearchKey(requestKey);
    setInventorySearchResults([]);
    setInventorySearchTotal(null);
    setInventorySearchHasMore(false);
    setInventorySearchError("");
    setInventorySearchStatus("loading");
    const timer = window.setTimeout(() => {
      void workspaceSync.run("inventory-search", (signal) => mealApi.searchInventory(normalizedInventoryQuery, storageTypeFromFilter(storageFilter), 0, 40, signal, storageLocationIdFromFilter(storageFilter)))
        .then((result) => {
          if (!result.current) return;
          if (result.error) throw result.error;
          const payload = result.value;
          if (!payload) throw new Error("inventory-search-empty");
          setInventorySearchResults(payload.items.map((food) => mapApiFood(food, storageLocationsRef.current)));
          setInventorySearchTotal(payload.total);
          setInventorySearchHasMore(payload.has_more);
          setInventorySearchStatus("ready");
        })
        .catch((reason) => {
          if (isMealApiAuthError(reason)) {
            mealApi.clearSession();
            resetWorkspaceReads();
            setDashboardStaleAt(null);
            setConnectionState("auth_required");
            setInventorySearchError("로그인이 만료됐어요. 다시 로그인해 주세요.");
          } else {
            setInventorySearchError("재고를 찾지 못했어요. 잠시 후 다시 시도해 주세요.");
          }
          setInventorySearchStatus("error");
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      workspaceSync.invalidate("inventory-search");
    };
  }, [connectionState, inventorySearchCanUseServer, inventorySearchRetry, normalizedInventoryQuery, storageFilter, workspaceSync]);

  useEffect(() => {
    setInventorySearchResults((current) => {
      let changed = false;
      const next = current.map((food) => {
        const nextName = food.storageLocationId
          ? storageLocations.find((location) => location.id === food.storageLocationId)?.name
          : undefined;
        if (nextName === food.storageLocationName) return food;
        changed = true;
        return { ...food, storageLocationName: nextName };
      });
      return changed ? next : current;
    });
  }, [storageLocations]);

  const keepInventorySearchVisible = () => {
    if (typeof document === "undefined") return;
    const scroll = document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll");
    const inventory = document.querySelector<HTMLElement>(".inventory-section");
    if (!scroll || !inventory) return;
    const offset = inventory.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const targetScrollTop = Math.max(0, Math.min(maxScrollTop, scroll.scrollTop + offset));
    scroll.scrollTop = targetScrollTop;

    const input = document.querySelector<HTMLElement>(".inventory-search-input");
    if (!input) return;
    const scrollRect = scroll.getBoundingClientRect();
    const screenRect = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const visualViewportBottom = typeof window.visualViewport?.height === "number"
      ? (window.visualViewport.offsetTop + window.visualViewport.height)
      : window.innerHeight;
    const visibleBottom = Math.min(scrollRect.bottom, screenRect?.bottom ?? Number.POSITIVE_INFINITY, visualViewportBottom);
    const inputRect = input.getBoundingClientRect();
    const toolbarRect = document.querySelector<HTMLElement>(".inventory-toolbar")?.getBoundingClientRect();
    const inputDelta = Math.max(0, inputRect.bottom - visibleBottom) + Math.min(0, inputRect.top - scrollRect.top);
    const toolbarDelta = toolbarRect ? Math.max(0, toolbarRect.bottom - visibleBottom) : 0;
    const scrollDelta = Math.max(inputDelta, toolbarDelta);
    if (scrollDelta === 0) return;
    const adjustedScrollTop = Math.max(0, Math.min(maxScrollTop, scroll.scrollTop + scrollDelta));
    scroll.scrollTo({ top: adjustedScrollTop, behavior: "auto" });
  };

  useEffect(() => {
    if (!inventorySearchFocusRef.current) return;
    let secondFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(keepInventorySearchVisible);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [filteredFoods.length, inventoryQuery, inventorySearchStatus, keyboard.height, storageFilter, viewportHeight, viewportMetrics.offsetTop]);

  const rememberNotificationRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    notificationRevisionRef.current = notificationRevisionRef.current === null
      ? value
      : Math.max(notificationRevisionRef.current, value);
    return notificationRevisionRef.current;
  };

  const rememberCurrentNotificationRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberNotificationRevision(mealApi.workspaceRevision);
  };

  const applyNotificationReadOverrides = (items: ApiNotification[]) => items.map((notification) => {
    const readAt = notificationReadOverridesRef.current.get(notification.id);
    if (!readAt) return notification;
    if (notification.read_at) {
      notificationReadOverridesRef.current.delete(notification.id);
      return notification;
    }
    return { ...notification, read_at: readAt };
  });

  const refreshNotifications = async (nextNotice?: string) => {
    if (!mealApi.isConfigured) return false;
    if (notificationReadInFlightRef.current > 0) {
      notificationRefreshQueuedRef.current = true;
      return false;
    }
    notificationRefreshQueuedRef.current = false;
    setNotificationsLoading(true);
    setNotificationsError("");
    setNotificationsNotice("");
    setNotificationRetryAction(null);
    const result = await workspaceSync.run("notifications", async (signal) => {
      const [nextNotifications, revision] = await Promise.all([
        mealApi.getNotifications(false, 50, signal),
        mealApi.getNotificationRevision(signal).catch(() => null),
      ]);
      return { nextNotifications, revision };
    });
    if (!result.current) {
      setNotificationsLoading(false);
      return false;
    }
    try {
      if (result.error) throw result.error;
      const payload = result.value;
      const nextNotifications = payload?.nextNotifications;
      if (!nextNotifications) throw new Error("notifications-empty");
      if (notificationReadInFlightRef.current > 0) {
        notificationRefreshQueuedRef.current = true;
        return false;
      }
      setNotifications(applyNotificationReadOverrides(nextNotifications));
      if (payload?.revision) rememberNotificationRevision(payload.revision.revision);
      else rememberCurrentNotificationRevision();
      if (nextNotice) setNotificationsNotice(nextNotice);
      setNotificationRetryAction(null);
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        resetWorkspaceReads();
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setNotificationsError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else {
        setNotificationsError("알림을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.");
        setNotificationRetryAction({ label: "다시 시도", onRetry: () => void refreshNotifications() });
      }
      return false;
    } finally {
      setNotificationsLoading(false);
    }
  };

  const finishNotificationRead = () => {
    notificationReadInFlightRef.current = Math.max(0, notificationReadInFlightRef.current - 1);
    if (notificationReadInFlightRef.current !== 0 || !notificationRefreshQueuedRef.current) return;
    notificationRefreshQueuedRef.current = false;
    // The user may have followed a notification into a food detail while the
    // read mutation was in flight. Refresh the in-memory notification source
    // even when the sheet is no longer visible, so reopening it cannot show
    // the pre-mutation or pre-revision list.
    void refreshNotifications();
  };

  const rememberShoppingListRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    shoppingListRevisionRef.current = shoppingListRevisionRef.current === null
      ? value
      : Math.max(shoppingListRevisionRef.current, value);
    return shoppingListRevisionRef.current;
  };

  const rememberCurrentShoppingListRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberShoppingListRevision(mealApi.workspaceRevision);
  };

  const refreshShoppingList = async (nextNotice?: string) => {
    if (!mealApi.isConfigured) {
      setShoppingListStatus("ready");
      setShoppingListError("");
      setShoppingListRetryAction(null);
      if (nextNotice) setShoppingListNotice(nextNotice);
      return true;
    }
    if (shoppingListMutatingRef.current) {
      shoppingListRefreshQueuedRef.current = true;
      return false;
    }
    shoppingListRefreshQueuedRef.current = false;
    shoppingListSyncInFlightRef.current = true;
    setShoppingListStatus("loading");
    setShoppingListError("");
    setShoppingListNotice("");
    setShoppingListRetryAction(null);
    try {
      const result = await workspaceSync.run("shopping-list", async (signal) => {
        const [nextShoppingList, revision] = await Promise.all([
          mealApi.getShoppingList(signal),
          mealApi.getShoppingListRevision(signal).catch(() => null),
        ]);
        return { nextShoppingList, revision };
      });
      if (!result.current) return false;
      if (result.error) throw result.error;
      const payload = result.value;
      const nextShoppingList = payload?.nextShoppingList;
      if (!nextShoppingList) throw new Error("shopping-list-empty");
      if (shoppingListMutatingRef.current) {
        shoppingListRefreshQueuedRef.current = true;
        return false;
      }
      setShoppingList(nextShoppingList);
      if (payload?.revision) rememberShoppingListRevision(payload.revision.revision);
      else rememberCurrentShoppingListRevision();
      if (nextNotice) setShoppingListNotice(nextNotice);
      setShoppingListStatus("ready");
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        resetWorkspaceReads();
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setShoppingListError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else {
        setShoppingListError("장보기 목록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.");
      }
      setShoppingListStatus("error");
      return false;
    } finally {
      shoppingListSyncInFlightRef.current = false;
    }
  };

  const finishShoppingListMutation = () => {
    shoppingListMutatingRef.current = false;
    setShoppingListMutating(false);
    if (shoppingListRefreshQueuedRef.current && sheetRef.current === "shopping") {
      shoppingListRefreshQueuedRef.current = false;
      void refreshShoppingList();
    }
  };

  const clearReceiptSummaries = () => {
    workspaceSync.invalidate("receipt-summaries");
    receiptSummariesRevisionRef.current = null;
    setReceiptSummaries([]);
    setReceiptSummariesStatus("idle");
    setReceiptSummariesNotice("");
    setResumeReceiptId(null);
  };

  const rememberReceiptSummariesRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    receiptSummariesRevisionRef.current = receiptSummariesRevisionRef.current === null
      ? value
      : Math.max(receiptSummariesRevisionRef.current, value);
    return receiptSummariesRevisionRef.current;
  };

  const rememberCurrentReceiptSummariesRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberReceiptSummariesRevision(mealApi.workspaceRevision);
  };

  const refreshReceiptSummaries = async (nextNotice?: string) => {
    if (!mealApi.isConfigured) return false;
    receiptSummariesSyncInFlightRef.current = true;
    setReceiptSummariesStatus("loading");
    setReceiptSummariesNotice("");
    try {
      const result = await workspaceSync.run("receipt-summaries", async (signal) => {
        const [nextReceipts, revision] = await Promise.all([
          mealApi.getReceiptSummaries(signal),
          mealApi.getReceiptRevision(signal).catch(() => null),
        ]);
        return { nextReceipts, revision };
      });
      if (!result.current) return false;
      if (result.error) throw result.error;
      const payload = result.value;
      const nextReceipts = payload?.nextReceipts;
      if (!nextReceipts) throw new Error("receipt-summaries-empty");
      setReceiptSummaries(nextReceipts);
      if (payload?.revision) rememberReceiptSummariesRevision(payload.revision.revision);
      else rememberCurrentReceiptSummariesRevision();
      if (nextNotice) setReceiptSummariesNotice(nextNotice);
      setReceiptSummariesStatus("ready");
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        resetWorkspaceReads();
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
      } else {
        setReceiptSummariesStatus("error");
      }
      return false;
    } finally {
      receiptSummariesSyncInFlightRef.current = false;
    }
  };

  const resetWorkspaceReads = () => {
    workspaceSync.invalidateAll();
    dashboardRevisionRef.current = null;
    dashboardPollingInFlightRef.current = false;
    dashboardSyncInFlightRef.current = false;
    detailRevisionRef.current = null;
    detailPollingInFlightRef.current = false;
    setDetailRemoteRefreshRequired(false);
    accountRevisionRef.current = null;
    accountPollingInFlightRef.current = false;
    setAccountRemoteRefreshRequired(false);
    setAccountRemoteRefreshing(false);
    setAccountRefreshNonce(0);
    dashboardPollQueuedRef.current = false;
    notificationRevisionRef.current = null;
    notificationPollingInFlightRef.current = false;
    notificationReadInFlightRef.current = 0;
    notificationRefreshQueuedRef.current = false;
    notificationReadOverridesRef.current.clear();
    shoppingListRevisionRef.current = null;
    shoppingListPollingInFlightRef.current = false;
    shoppingListSyncInFlightRef.current = false;
    shoppingListRefreshQueuedRef.current = false;
    receiptSummariesRevisionRef.current = null;
    receiptSummariesPollingInFlightRef.current = false;
    receiptSummariesSyncInFlightRef.current = false;
    setNotifications([]);
    setNotificationsLoading(false);
    setNotificationsError("");
    setNotificationsNotice("");
    setShoppingList([]);
    setShoppingListStatus("idle");
    setShoppingListError("");
    setShoppingListNotice("");
    clearReceiptSummaries();
  };

  const resetWorkspacePresentation = () => {
    resetWorkspaceReads();
    setFoods([]);
    updateStorageLocations([]);
    setInventoryQuery("");
    setStorageFilter("전체");
    setInventorySearchResults([]);
    setInventorySearchTotal(null);
    setInventorySearchHasMore(false);
    setInventorySearchStatus("idle");
    setInventorySearchError("");
    setInventorySearchKey("");
    setProductInfoRetryAction(null);
    setProductProvenanceStatus(null);
    setProductProvenanceNotice(null);
    recentlyReceivedFoodRef.current = null;
    setRecentlyReceivedFood(null);
    setDashboardStaleAt(null);
    setSelectedFoodId(null);
    setDetailEntryIntent(null);
    setDetailRemoteRefreshRequired(false);
    setDemoNotificationReadAt({});
  };

  const demoNotifications: ApiNotification[] = priorityFoods.slice(0, 3).map((food, index) => {
    const hasReferenceWindow = food.dateKind === "estimated_use_first";
    const isUserReminder = food.dateKind === "user_confirmed";
    const message = index === 0
      ? `${food.name} 날짜를 확인해 주세요.`
      : hasReferenceWindow
        ? `${food.name}: ${food.dateLabel}은 참고로 표시한 날짜예요. 소비기한과는 다르니 포장지 날짜를 확인해 주세요.`
        : isUserReminder
          ? `${food.name}: 내가 기록한 날짜는 ${food.dateLabel}예요. 포장지의 소비기한과 다를 수 있으니 날짜와 보관 방법도 살펴봐 주세요.`
          : food.dateKind === "unknown"
            ? `${food.name} 날짜를 아직 기록하지 않았어요. 포장지 날짜와 보관 방법을 살펴봐 주세요.`
            : "표시 날짜와 보관 상태를 확인해 주세요.";

    return {
      id: `demo-priority:${food.id}`,
      kind: hasReferenceWindow || isUserReminder ? "date_due" : "date_check",
      severity: index === 0 ? "urgent" : "attention",
      title: index === 0 ? "오늘 먼저 확인할 식품이에요" : `${food.name} 확인이 필요해요`,
      message,
      canonical_name: food.name,
      food_id: food.id,
      due_date: null,
      source: DEMO_NOTIFICATION_SOURCE[food.dateKind],
      action: "food",
      read_at: demoNotificationReadAt[`demo-priority:${food.id}`] ?? null,
      created_at: new Date().toISOString(),
    };
  });
  const visibleNotifications = mealApi.isConfigured ? notifications : demoNotifications;
  const grocySyncNotifications = visibleNotifications.filter((notification) => notification.kind === "grocy_sync");
  const homeSyncAttentionCount = grocySyncNotifications.filter((notification) => (notification.sync_state ?? "action_required") === "action_required").length;
  const homeSyncQueuedCount = grocySyncNotifications.filter((notification) => notification.sync_state === "queued").length;
  const homeSyncProcessingCount = grocySyncNotifications.filter((notification) => notification.sync_state === "processing").length;
  const homeSyncWaitingCount = homeSyncQueuedCount + homeSyncProcessingCount;
  const homeSyncFocus: NotificationSyncFocus = homeSyncAttentionCount > 0
    ? "action_required"
    : homeSyncProcessingCount > 0
      ? "processing"
      : "queued";
  const homeSyncSummaryAccessibleName = [
    "재고 앱",
    externalSyncHomeTitle(homeSyncAttentionCount, homeSyncProcessingCount),
    homeSyncAttentionCount ? `살펴볼 항목 ${homeSyncAttentionCount}개` : "",
    homeSyncQueuedCount ? `추가 대기 ${homeSyncQueuedCount}개` : "",
    homeSyncProcessingCount ? `추가 중 ${homeSyncProcessingCount}개` : "",
    "알림에서 보기",
  ].filter(Boolean).join(" · ");
  const showHomeSyncSummary = mealApi.isConfigured && connectionState === "connected" && (homeSyncAttentionCount > 0 || homeSyncWaitingCount > 0);
  const unreadNotificationCount = visibleNotifications.filter((notification) => notification.read_at === null).length;
  const unreadUrgentNotificationCount = visibleNotifications.filter((notification) => notification.read_at === null && notification.severity === "urgent").length;
  const unreadAttentionNotificationCount = visibleNotifications.filter((notification) => notification.read_at === null && notification.severity === "attention").length;
  const unreadNotificationTone = unreadUrgentNotificationCount ? "urgent" : unreadAttentionNotificationCount ? "attention" : "info";
  const unreadNotificationDotColor = unreadNotificationTone === "urgent" ? "var(--atelier-coral)" : unreadNotificationTone === "attention" ? "var(--atelier-amber)" : "var(--atelier-blue)";
  const notificationDataUnavailable = mealApi.isConfigured && connectionState !== "connected";
  const notificationUnavailableLabel = connectionState === "auth_required"
    ? "로그인 후 알림 보기"
    : connectionState === "offline"
      ? "다시 연결 후 알림 보기"
      : null;
  const notificationTriggerLabel = notificationUnavailableLabel
    ? notificationUnavailableLabel
    : unreadNotificationCount
      ? `알림 보기, ${unreadUrgentNotificationCount ? `먼저 볼 알림 ${unreadUrgentNotificationCount}개, ` : ""}읽지 않은 알림 ${unreadNotificationCount}개`
      : "알림 보기";
  const unreadNotificationBadge = unreadNotificationCount > 9 ? "9+" : String(unreadNotificationCount);
  const shoppingRemainingCount = shoppingList.filter((item) => !item.checked).length;
  const shoppingCompletedCount = shoppingList.length - shoppingRemainingCount;
  const hasManualShoppingItems = shoppingList.some((item) => item.sources.some((source) => source.source_type === "manual"));
  const hasPlannedShoppingItems = shoppingList.some((item) => item.sources.some((source) => source.source_type !== "manual"));
  const shoppingOriginLabel = hasManualShoppingItems && hasPlannedShoppingItems
    ? "식단 재료와 직접 추가"
    : hasManualShoppingItems
      ? "직접 추가한 항목"
      : "식단에서 자동으로 모았어요";
  const shoppingSummaryTitle = shoppingListStatus === "loading" && !shoppingList.length
    ? "장보기 목록을 불러오는 중"
    : shoppingListStatus === "error"
      ? "장보기 목록을 다시 확인해요"
      : shoppingRemainingCount > 0
        ? `장보기 ${shoppingRemainingCount}개가 남아 있어요`
      : shoppingList.length
        ? "모두 구매했어요 · 재고 반영 전"
          : "아직 담은 재료가 없어요";
  const shoppingSummaryDescription = shoppingListStatus === "error"
    ? "탭해서 다시 동기화해 주세요."
    : shoppingList.length
      ? shoppingRemainingCount > 0
        ? `${shoppingCompletedCount}개 구매 완료 · ${shoppingOriginLabel}`
        : `${shoppingCompletedCount}개 구매 완료 · 재고에 반영해 주세요 · ${shoppingOriginLabel}`
      : "식단에서 재료를 담거나 직접 추가해 보세요.";
  const shoppingSummaryIsEmpty = !shoppingList.length && shoppingListStatus !== "loading" && shoppingListStatus !== "error";
  const showShoppingSummary = !mealApi.isConfigured || (connectionState === "connected" && shoppingListStatus !== "idle");

  useEffect(() => {
    if (!toast || toastAction?.message === toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast, toastAction]);

  useEffect(() => {
    if (toastAction && toastAction.message !== toast) setToastAction(null);
  }, [toast, toastAction]);

  useEffect(() => {
    setToastActionBusy(false);
  }, [toastAction?.message, toastAction?.label]);

  const showRetryToast = (message: string, onRetry: () => void) => {
    setToastActionBusy(false);
    setToastAction({ message, label: "다시 시도", onInvoke: onRetry });
    setToast(message);
  };

  const focusToastRecoveryTarget = () => {
    if (pendingAddedFoodFocusRef.current) return;
    let disposed = false;
    let fallbackTimer: number | undefined;
    let focusTimer: number | undefined;
    let settleTimer: number | undefined;
    let hasFocusedTarget = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };
    const focusTarget = () => {
      if (disposed) return;
      if (document.querySelector('[data-testid="bottom-sheet"]')) {
        cleanup();
        return;
      }
      const fallbackCandidates = activeNav === "meal"
        ? [
          ...document.querySelectorAll<HTMLElement>(".meal-plan-button"),
          ...document.querySelectorAll<HTMLElement>(".priority-card"),
        ]
        : activeContentNavRef.current === "food"
          ? [
            ...document.querySelectorAll<HTMLElement>("[data-inventory-food-id]"),
            ...document.querySelectorAll<HTMLElement>(".inventory-empty-action, .inventory-add-button"),
          ]
        : [
          ...document.querySelectorAll<HTMLElement>(".priority-card"),
          ...document.querySelectorAll<HTMLElement>(".priority-section .section-heading, .meal-plan-button"),
        ];
      const target = fallbackCandidates.find((element) => !element.hasAttribute("disabled"));
      if (!target) return;
      target.focus({ preventScroll: true });
      hasFocusedTarget = true;
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(cleanup, 400);
    };
    const scheduleFocus = () => {
      if (disposed) return;
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        focusTarget();
      }, 30);
    };
    const observer = new MutationObserver(scheduleFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    window.requestAnimationFrame(scheduleFocus);
    fallbackTimer = window.setTimeout(() => {
      if (disposed) return;
      if (!hasFocusedTarget) document.querySelector<HTMLElement>(".connection-pill")?.focus({ preventScroll: true });
      cleanup();
    }, 5000);
  };

  useEffect(() => {
    if (!mealApi.isConfigured) return;
    let active = true;
    void workspaceSync.run("dashboard", (signal) => mealApi.getDashboard(signal)).then((result) => {
      if (!active || !result.current) return;
      if (result.error) throw result.error;
      const payload = result.value;
      if (payload) {
        const nextStorageLocations = payload.storage_locations ?? [];
        updateStorageLocations(nextStorageLocations);
        setFoods(payload.inventory.map((food) => mapApiFood(food, nextStorageLocations)));
        setDashboardStaleAt(null);
        setConnectionState("connected");
        // The dashboard response already carries the workspace revision. Seed
        // the polling baseline here so the first visibility probe can detect a
        // remote change instead of consuming it as initialisation.
        rememberDashboardRevision(mealApi.workspaceRevision);
        void refreshShoppingList();
        void refreshReceiptSummaries();
      }
    }).catch((reason) => {
      if (!active) return;
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        resetWorkspaceReads();
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        return;
      }
      const cached = mealApi.getCachedDashboard();
      if (active && cached) {
        const cachedStorageLocations = cached.payload.storage_locations ?? [];
          updateStorageLocations(cachedStorageLocations);
        setFoods(cached.payload.inventory.map((food) => mapApiFood(food, cachedStorageLocations)));
        setDashboardStaleAt(cached.saved_at);
      }
      setConnectionState("offline");
    });
    return () => {
      active = false;
      workspaceSync.invalidate("dashboard");
    };
  }, [workspaceSync]);

  useEffect(() => {
    if (!mealApi.isConfigured || connectionState !== "connected" || sheet !== null || typeof window === "undefined" || typeof document === "undefined") return;
    let active = true;
    let queuedTimer: number | null = null;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden") return;
      if (dashboardPollingInFlightRef.current || dashboardSyncInFlightRef.current) {
        dashboardPollQueuedRef.current = true;
        return;
      }
      dashboardPollingInFlightRef.current = true;
      try {
        const previousRevision = dashboardRevisionRef.current;
        const result = await workspaceSync.run("dashboard", (signal) => mealApi.getDashboardRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberDashboardRevision(revision);
          return;
        }
        if (revision <= previousRevision || sheetRef.current !== null) return;
        const synced = await syncDashboard(true);
        if (synced && inventorySearchActive) setInventorySearchRetry((current) => current + 1);
        if (synced && sheetRef.current === null && toastRef.current === null) {
          setToast("다른 기기에서 재고가 바뀌어 최신 목록을 불러왔어요.");
        }
      } catch {
        // A bounded probe is advisory. Preserve the visible dashboard and let
        // the next visible/interval probe retry.
      } finally {
        dashboardPollingInFlightRef.current = false;
        if (dashboardPollQueuedRef.current && active && document.visibilityState === "visible" && sheetRef.current === null) {
          dashboardPollQueuedRef.current = false;
          queuedTimer = window.setTimeout(() => {
            queuedTimer = null;
            if (active) void pollRevision();
          }, 0);
        }
      }
    };
    void pollRevision();
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      dashboardPollQueuedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (queuedTimer !== null) window.clearTimeout(queuedTimer);
    };
  }, [connectionState, inventorySearchActive, sheet, workspaceSync]);

  useEffect(() => {
    void refreshNotifications();
  }, []);

  useEffect(() => {
    if (sheet !== "notifications" || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || notificationReadInFlightRef.current > 0 || notificationPollingInFlightRef.current) return;
      notificationPollingInFlightRef.current = true;
      try {
        const previousRevision = notificationRevisionRef.current;
        const result = await workspaceSync.run("notifications", (signal) => mealApi.getNotificationRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberNotificationRevision(revision);
          return;
        }
        if (revision <= previousRevision) return;
        if (notificationReadInFlightRef.current > 0) {
          notificationRefreshQueuedRef.current = true;
          return;
        }
        await refreshNotifications("다른 기기에서 알림 상태가 바뀌어 최신 목록을 불러왔어요.");
      } catch {
        // A bounded probe is advisory. Keep the current list when the probe
        // cannot complete and let the next visible/interval probe retry.
      } finally {
        notificationPollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sheet, workspaceSync]);

  useEffect(() => {
    if (sheet !== "shopping" || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || shoppingListMutatingRef.current || shoppingListSyncInFlightRef.current || shoppingListPollingInFlightRef.current) return;
      shoppingListPollingInFlightRef.current = true;
      try {
        const previousRevision = shoppingListRevisionRef.current;
        const result = await workspaceSync.run("shopping-list", (signal) => mealApi.getShoppingListRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberShoppingListRevision(revision);
          return;
        }
        if (revision <= previousRevision) return;
        if (shoppingListMutatingRef.current || shoppingListSyncInFlightRef.current) {
          shoppingListRefreshQueuedRef.current = true;
          return;
        }
        await refreshShoppingList("다른 기기에서 장보기 목록이 바뀌어 최신 목록을 불러왔어요.");
      } catch {
        // A bounded probe is advisory. Preserve the current list and retry
        // on the next visible/interval probe.
      } finally {
        shoppingListPollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sheet, workspaceSync]);

  useEffect(() => {
    if (sheet !== "receipt-queue" || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || receiptSummariesSyncInFlightRef.current || receiptSummariesPollingInFlightRef.current) return;
      receiptSummariesPollingInFlightRef.current = true;
      try {
        const previousRevision = receiptSummariesRevisionRef.current;
        const result = await workspaceSync.run("receipt-summaries", (signal) => mealApi.getReceiptRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberReceiptSummariesRevision(revision);
          return;
        }
        if (revision <= previousRevision || sheetRef.current !== "receipt-queue") return;
        await refreshReceiptSummaries("다른 기기에서 확인할 영수증이 바뀌어 최신 목록을 불러왔어요.");
      } catch {
        // A bounded probe is advisory. Preserve the current queue and retry
        // on the next visible/interval probe.
      } finally {
        receiptSummariesPollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sheet, workspaceSync]);

  useEffect(() => {
    if (sheet !== "detail" || !selectedFoodId || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || detailRemoteRefreshRequired || detailPollingInFlightRef.current || dashboardSyncInFlightRef.current) return;
      detailPollingInFlightRef.current = true;
      try {
        const previousRevision = detailRevisionRef.current;
        const result = await workspaceSync.run("dashboard", (signal) => mealApi.getDashboardRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberDetailRevision(revision);
          return;
        }
        if (revision <= previousRevision || sheetRef.current !== "detail") return;
        rememberDetailRevision(revision);
        setDetailRemoteRefreshRequired(true);
      } catch {
        // A bounded probe is advisory. Keep the current detail draft and
        // retry on the next visible/interval probe.
      } finally {
        detailPollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [detailRemoteRefreshRequired, selectedFoodId, sheet, workspaceSync]);

  useEffect(() => {
    if (sheet !== "account" || !mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || accountRemoteRefreshRequired || accountRemoteRefreshing || accountPollingInFlightRef.current) return;
      accountPollingInFlightRef.current = true;
      try {
        const previousRevision = accountRevisionRef.current;
        const knownClientRevision = mealApi.workspaceRevision;
        if (previousRevision !== null && knownClientRevision !== null && knownClientRevision > previousRevision) {
          rememberAccountRevision(knownClientRevision);
          return;
        }
        const result = await workspaceSync.run("dashboard", (signal) => mealApi.getDashboardRevision(signal));
        if (!result.current || result.error || !result.value) return;
        const revision = result.value.revision;
        if (!Number.isSafeInteger(revision) || revision < 0) return;
        if (previousRevision === null) {
          rememberAccountRevision(revision);
          return;
        }
        if (revision <= previousRevision || sheetRef.current !== "account") return;
        rememberAccountRevision(revision);
        setAccountRemoteRefreshRequired(true);
      } catch {
        // A bounded probe is advisory. Preserve all account panel drafts and
        // retry on the next visible/interval probe.
      } finally {
        accountPollingInFlightRef.current = false;
      }
    };
    void pollRevision();
    const interval = window.setInterval(() => { void pollRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [accountRemoteRefreshRequired, accountRemoteRefreshing, sheet, workspaceSync]);

  const openAdd = (mode: AddMode = "receipt", receiptId: string | null = null, returnSheet: "detail" | null = null) => {
    // Start the primary intake chunk on user intent so the sheet's dialog
    // shell and its file/camera controls become ready together. Keep the
    // lazy split to avoid increasing the initial bundle for users who do not
    // open intake.
    const requestId = addSheetOpenRequestRef.current + 1;
    addSheetOpenRequestRef.current = requestId;
    receiptQueueInitialFocusRef.current = false;
    keyboard.hide();
    const activeElement = document.activeElement;
    addOriginFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    addReturnSheetRef.current = returnSheet;
    addReturnFoodContextRef.current = returnSheet === "detail" && selectedFood
      ? {
        id: selectedFood.id,
        name: selectedFood.name,
        dateSummary: selectedFood.dateKind === "actual_printed" && selectedFood.dateDetail.trim()
          ? `${getDateBadge(selectedFood)} · ${selectedFood.dateDetail} · ${getInventoryDateOriginLabel(selectedFood) ?? "날짜 정보 없음"}`
          : null,
      }
      : null;
    setAddMode(mode);
    setResumeReceiptId(receiptId);
    setAddSheetSessionKey((current) => current + 1);
    void Promise.all([loadAddFoodSheet(), loadBottomSheet()]).then(() => {
      if (requestId !== addSheetOpenRequestRef.current) return;
      setToast(null);
      setToastAction(null);
      changeSheet("add");
    }).catch(() => {
      if (requestId !== addSheetOpenRequestRef.current) return;
      // Preserve the originating detail sheet on a lazy-load retry. Without
      // the returnSheet argument, a label review retry would reopen as a
      // standalone intake flow and lose the date-review context.
      showRetryToast("입력 화면을 준비하지 못했어요.", () => openAdd(mode, receiptId, returnSheet));
    });
  };

  useEffect(() => {
    if (!receiptSourceReviewMode || receiptSourceReviewOpenedRef.current) return;
    receiptSourceReviewOpenedRef.current = true;
    openAdd("receipt");
  }, [receiptSourceReviewMode]);

  const openMealPlan = () => {
    const returnNav = activeContentNavRef.current ?? "home";
    if (mealApi.isConfigured && connectionState !== "connected") {
      const message = connectionState === "auth_required"
        ? "로그인 후 최신 재고로 식단을 확인할 수 있어요"
        : "최신 재고에 연결한 뒤 식단을 확인할 수 있어요";
      setActiveNav(returnNav);
      setToast(message);
      setToastAction({ message, label: connectionState === "auth_required" ? "계정 연결" : "다시 연결", onInvoke: connectionState === "auth_required" ? () => changeSheet("account") : retryConnection });
      return;
    }
    mealDetailReturnRef.current = false;
    mealDetailReturnFocusIdRef.current = null;
    mealDetailReturnScrollTopRef.current = null;
    mealDetailSessionReturnRef.current = false;
    pendingMealCompletionFocusRef.current = null;
    mealReturnSheetRef.current = sheet === "shopping" ? "shopping" : null;
    if (sheet === "shopping") shoppingInitialFocusRef.current = false;
    mealSheetOriginNavRef.current = navigationIntentRef.current ?? activeContentNavRef.current;
    setActiveNav("meal");
    const requestId = mealSheetOpenRequestRef.current + 1;
    mealSheetOpenRequestRef.current = requestId;
    keyboard.hide();
    void loadMealPlanSheet().then(() => {
      if (requestId !== mealSheetOpenRequestRef.current) return;
      setToast(null);
      setToastAction(null);
      setActiveNav("meal");
      setMealPlanSheetMounted(true);
      changeSheet("meal");
    }).catch(() => {
      if (requestId !== mealSheetOpenRequestRef.current) return;
      setActiveNav(mealSheetOriginNavRef.current);
      showRetryToast("식단 화면을 준비하지 못했어요.", openMealPlan);
    });
  };

  const rememberDetailRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    detailRevisionRef.current = detailRevisionRef.current === null
      ? value
      : Math.max(detailRevisionRef.current, value);
    return detailRevisionRef.current;
  };

  const rememberCurrentDetailRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberDetailRevision(mealApi.workspaceRevision);
  };

  const openDetail = (food: FoodItem, source: "home" | "inventory" = "inventory", intentOverride: "date-review" | "provenance-review" | "consume-action" | null = null) => {
    if (source === "inventory") captureInventoryReturnContext(food.id);
    else inventoryReturnContextRef.current = null;
    detailHistoryDisclosureOpenRef.current = false;
    detailRevisionRef.current = dashboardRevisionRef.current;
    if (detailRevisionRef.current === null) rememberCurrentDetailRevision();
    setDetailRemoteRefreshRequired(false);
    const needsDateReview = Boolean(attentionReviewReason(food, currentDate));
    const needsProvenanceReview = Boolean(food.productProvenance && !needsDateReview);
    // Browsing an item is not the same as asking to recheck its date. Keep the
    // summary in the first view; explicit review routes may focus the action.
    const defaultEntryIntent = needsDateReview
      ? null
      : needsProvenanceReview
        ? "provenance-review"
        : source === "home" && food.priority <= 3
          ? "consume-action"
          : null;
    setDetailEntryIntent(intentOverride ?? defaultEntryIntent);
    setSelectedFoodId(food.id);
    changeSheet("detail");
  };

  const openFoodDetailFromMeal = (foodId: string) => {
    const food = findFoodById(foodId);
    if (!food) return;
    const mealScroller = document.querySelector<HTMLElement>(".meal-sheet-content")?.closest<HTMLElement>(".sheet-content");
    mealDetailReturnRef.current = true;
    mealDetailReturnFocusIdRef.current = food.id;
    mealDetailReturnScrollTopRef.current = mealScroller?.scrollTop ?? null;
    mealDetailSessionReturnRef.current = true;
    inventoryReturnContextRef.current = null;
    detailHistoryDisclosureOpenRef.current = false;
    detailRevisionRef.current = dashboardRevisionRef.current;
    if (detailRevisionRef.current === null) rememberCurrentDetailRevision();
    setDetailRemoteRefreshRequired(false);
    setDetailEntryIntent(null);
    setSelectedFoodId(food.id);
    changeSheet("detail");
  };

  const openFoodFromSyncHistory = (foodId: string, canonicalName: string, outboxId?: string) => {
    const food = findFoodById(foodId);
    if (!food) {
      const message = `${canonicalName}의 최신 식품 기록을 찾지 못했어요.`;
      setToastAction({
        message,
        label: "최신 재고 확인",
        onInvoke: () => {
          void syncDashboard().then((synced) => {
            setToast(synced ? "최신 식품 목록을 확인했어요" : "최신 식품 목록을 불러오지 못했어요");
            if (synced) openInventory();
          });
        },
      });
      setToast(message);
      return;
    }
    accountDetailReturnRef.current = true;
    openDetail(food, "inventory");
    detailHistoryDisclosureOpenRef.current = true;
    setDetailSyncFocusId(outboxId ?? null);
  };

  const refreshDetailFromRemote = async () => {
    if (!selectedFoodId) return false;
    setDetailRemoteRefreshRequired(false);
    setToast("식품 정보를 다시 불러오는 중이에요");
    const synced = await syncDashboard();
    if (!synced) {
      setDetailRemoteRefreshRequired(true);
      setToast("식품 정보를 불러오지 못했어요. 다시 시도해 주세요");
      return false;
    }
    rememberCurrentDetailRevision();
    setToast("식품 정보를 다시 불러왔어요");
    return true;
  };

  const refreshProductProvenanceFromRemote = async () => {
    const synced = await refreshDetailFromRemote();
    if (synced) {
      setProductProvenanceNotice((current) => current ? { ...current, requiresRefresh: false } : current);
    }
  };

  const refreshProductInfoFromRemote = async () => {
    const synced = await refreshDetailFromRemote();
    if (synced) {
      setProductInfoNotice((current) => current ? { ...current, requiresRefresh: false } : current);
    }
  };

  const rememberAccountRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    accountRevisionRef.current = accountRevisionRef.current === null
      ? value
      : Math.max(accountRevisionRef.current, value);
    return accountRevisionRef.current;
  };

  const rememberCurrentAccountRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberAccountRevision(mealApi.workspaceRevision);
  };

  const refreshAccountFromRemote = async () => {
    if (accountRemoteRefreshing) return;
    setAccountRemoteRefreshRequired(false);
    setAccountRemoteRefreshing(true);
    setToast("계정 정보를 다시 불러오는 중이에요");
    try {
      const synced = await syncDashboard();
      if (!synced) {
        setAccountRemoteRefreshRequired(true);
        setToast("계정 정보를 불러오지 못했어요. 다시 시도해 주세요");
        return;
      }
      rememberCurrentAccountRevision();
      setAccountRefreshNonce((current) => current + 1);
      setToast("계정 정보를 다시 불러왔어요");
    } finally {
      setAccountRemoteRefreshing(false);
    }
  };

  const openNotifications = (syncFocus: NotificationSyncFocus | null = null) => {
    if (mealApi.isConfigured && connectionState !== "connected") {
      const message = connectionState === "auth_required"
        ? "로그인 후 최신 알림을 확인할 수 있어요"
        : "다시 연결한 뒤 최신 알림을 확인할 수 있어요";
      setToast(message);
      setToastAction({ message, label: connectionState === "auth_required" ? "계정 연결" : "다시 연결", onInvoke: connectionState === "auth_required" ? () => changeSheet("account") : retryConnection });
      return;
    }
    notificationDetailReturnRef.current = false;
    notificationAccountReturnRef.current = false;
    notificationReturnSheetRef.current = sheet === "meal" ? "meal" : null;
    setAccountGrocyOutboxFocusId(null);
    notificationReturnFocusIdRef.current = null;
    notificationInitialFocusRef.current = syncFocus === null;
    setNotificationSyncFocus(syncFocus);
    const notificationAlreadyOpen = sheet === "notifications";
    changeSheet("notifications");
    if (!notificationAlreadyOpen || !notificationsLoading) void refreshNotifications();
  };

  const openShoppingList = () => {
    if (mealApi.isConfigured && connectionState !== "connected") {
      const message = connectionState === "auth_required"
        ? "로그인 후 최신 장보기 목록을 확인할 수 있어요"
        : "다시 연결한 뒤 최신 장보기 목록을 확인할 수 있어요";
      setToast(message);
      setToastAction({ message, label: connectionState === "auth_required" ? "계정 연결" : "다시 연결", onInvoke: connectionState === "auth_required" ? () => changeSheet("account") : retryConnection });
      return;
    }
    // A new shopping session owns its own return path. Do not carry a
    // completed shopping-detail handoff into a later direct entry.
    shoppingDetailReturnRef.current = false;
    shoppingReturnSheetRef.current = sheet === "meal" ? "meal" : null;
    shoppingOriginNavRef.current = activeContentNavRef.current;
    shoppingInitialFocusRef.current = true;
    changeSheet("shopping");
    if (shoppingListStatus === "idle" || shoppingListStatus === "error") void refreshShoppingList();
  };

  const openRecentlyReceivedFood = () => {
    const recent = recentlyReceivedFood ?? recentlyReceivedFoodRef.current;
    if (!recent) return;
    const food = findFoodById(recent.id);
    if (food) {
      shoppingDetailReturnRef.current = true;
      shoppingInitialFocusRef.current = true;
      openDetail(food, "inventory");
      setDetailEntryIntent("date-review");
      return;
    }
    recentlyReceivedFoodRef.current = null;
    setRecentlyReceivedFood(null);
    openInventory();
    setToast(`${recent.name} 재고를 목록에서 확인해 주세요`);
  };

  const beginShoppingListMutation = () => {
    shoppingListMutatingRef.current = true;
    setShoppingListMutating(true);
    setShoppingListNotice("");
  };

  const addManualShoppingItem = async (input: { canonicalName: string; quantity: number; unit: string }) => {
    if (shoppingListMutating) return false;
    beginShoppingListMutation();
    setShoppingListError("");
    setShoppingListRetryAction(null);
    try {
      if (!mealApi.isConfigured) {
        const manualAddMessage = `${withKoreanObjectParticle(input.canonicalName)} 장보기 목록에 추가했어요`;
        const nextItems = mergeDemoShoppingEntries(shoppingList, [{
          canonicalName: input.canonicalName,
          quantity: input.quantity,
          unit: input.unit,
          sourceType: "manual",
        }]);
        setShoppingList(nextItems);
        setShoppingListStatus("ready");
        setShoppingListError("");
        setShoppingListRetryAction(null);
        setShoppingListNotice(`${manualAddMessage}. 구매가 끝나면 실제 수량과 보관 위치를 확인해 재고에 반영해 주세요.`);
        setToast(manualAddMessage);
        return true;
      }
      const response = await mealApi.addManualShoppingListItem(input.canonicalName, input.quantity, input.unit);
      if (!response) throw new Error("shopping-list-manual-add-empty");
      setShoppingList(response.items);
      rememberCurrentShoppingListRevision();
      setShoppingListStatus("ready");
      setToast("장보기 목록에 직접 추가했어요");
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        setShoppingList([]);
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setShoppingListError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else if (isMealApiWorkspaceConflictError(reason)) {
        void syncDashboard();
        setShoppingListError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
      } else if (isMealApiShoppingListPersistenceError(reason)) {
        setShoppingListError("장보기 항목을 직접 추가하지 못했어요. 기존 목록을 유지했어요");
        setShoppingListRetryAction({ label: "다시 시도", onRetry: () => void addManualShoppingItem(input) });
      } else {
        setShoppingListError("장보기 항목을 직접 추가하지 못했어요.");
      }
      return false;
    } finally {
      finishShoppingListMutation();
    }
  };

  const receiveShoppingItem = async (item: ApiShoppingListItem, input: { quantity: number; storageType: ApiStorageType; storageLocationId?: string | null }) => {
    if (shoppingListMutating) return false;
    beginShoppingListMutation();
    setShoppingListError("");
    setShoppingListRetryAction(null);
    setToastAction(null);
    const requestFingerprint = `${item.id}:${input.quantity}:${input.storageType}:${input.storageLocationId ?? ""}`;
    const idempotencyKey = shoppingReceiveKeys.current.get(requestFingerprint) ?? createId("shopping-receive");
    shoppingReceiveKeys.current.set(requestFingerprint, idempotencyKey);
    try {
      if (!mealApi.isConfigured) {
        const purchasedAt = new Date().toISOString();
        const storage = storageFromApi(input.storageType);
        const food = createFood({
          lotAction: "create",
          purchaseSource: "shopping_list",
          purchasedAt,
          name: item.canonical_name,
          brand: "장보기에서 추가한 식품",
          quantity: `${formatReceiptAmount(input.quantity)}${item.unit}`,
          storage,
          storageLocationId: input.storageLocationId ?? undefined,
          storageLocationName: input.storageLocationId ? storageLocations.find((location) => location.id === input.storageLocationId)?.name : undefined,
          dateLabel: "날짜 미확인",
          dateDetail: "포장지 날짜를 살펴봐 주세요",
          dateKind: "unknown",
          dateSource: "unknown",
          image: imageForFoodName(item.canonical_name),
          category: item.canonical_name.includes("시금치") || item.canonical_name.includes("버섯") ? "채소" : item.canonical_name.includes("두부") ? "두부·콩" : item.canonical_name.includes("우유") ? "유제품" : item.canonical_name.includes("달걀") || item.canonical_name.includes("계란") ? "달걀" : "기타",
          note: "구매일과 보관 위치를 기록했어요. 소비기한은 포장지에서 확인해 주세요.",
        });
        mergeFoods([food]);
        setShoppingList((current) => reduceDemoShoppingQuantity(current, item.id, input.quantity));
        setShoppingListStatus("ready");
        setShoppingListError("");
        setShoppingListRetryAction(null);
        recentlyReceivedFoodRef.current = { id: food.id, name: food.name };
        setRecentlyReceivedFood({ id: food.id, name: food.name });
        const receiveMessage = `${withKoreanObjectParticle(food.name)} 재고에 추가했어요`;
        setToastAction({ message: receiveMessage, label: "식품 정보 보기", onInvoke: openRecentlyReceivedFood });
        setToast(receiveMessage);
        return true;
      }
      const response = await mealApi.receiveShoppingListItem(item.id, input.quantity, input.storageType, idempotencyKey, input.storageLocationId);
      if (!response) throw new Error("shopping-list-receive-empty");
      shoppingReceiveKeys.current.delete(requestFingerprint);
      let receivedFoodForReadback: { id: string; name: string } | null = null;
      if (response.inventory_lot?.id) {
        receivedFoodForReadback = {
          id: response.inventory_lot.id,
          name: response.inventory_lot.display_name ?? response.inventory_lot.canonical_name ?? item.canonical_name,
        };
        recentlyReceivedFoodRef.current = receivedFoodForReadback;
        setRecentlyReceivedFood(receivedFoodForReadback);
      }
      setShoppingList(response.items);
      rememberCurrentShoppingListRevision();
      setShoppingListStatus("ready");
      const synced = await syncDashboard();
      const receiveMessage = synced
        ? response.removed_planned_source_count > 0
          ? `${withKoreanObjectParticle(item.canonical_name)} 재고에 추가하고 식단 장보기를 정리했어요`
          : `${withKoreanObjectParticle(item.canonical_name)} 재고에 추가했어요`
        : `${withKoreanObjectParticle(item.canonical_name)} 재고에 반영했어요`;
      const receiveReadbackMessage = withServerReadbackNotice(
        `${receiveMessage} · 반영 수량: ${response.received_quantity}${item.unit}`,
        synced,
      );
      const finalReceiveMessage = synced ? receiveMessage : receiveReadbackMessage;
      if (!synced) {
        setToastAction({
          message: finalReceiveMessage,
          label: "최신 재고 확인",
          onInvoke: () => {
            void syncDashboard(false, false).then(async (latestSynced) => {
              if (latestSynced) await refreshShoppingList();
              if (receivedFoodForReadback) {
                recentlyReceivedFoodRef.current = receivedFoodForReadback;
                setRecentlyReceivedFood(receivedFoodForReadback);
              }
              // The readback action belongs to the shopping surface. If the
              // controlled sheet was briefly dismissed while the dependent
              // refresh settled, restore that surface before announcing the
              // result so the received-food notice and its next action remain
              // mounted together.
              if (sheetRef.current !== "shopping") setSheet("shopping");
              setToast(latestSynced ? "최신 재고를 확인했어요" : "최신 재고를 아직 불러오지 못했어요");
            });
          },
        });
      } else if (response.inventory_lot?.id) {
        setToastAction({
          message: finalReceiveMessage,
          label: "식품 정보 보기",
          onInvoke: openRecentlyReceivedFood,
        });
      }
      setToast(finalReceiveMessage);
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        setShoppingList([]);
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setShoppingListError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else if (isMealApiWorkspaceConflictError(reason)) {
        void syncDashboard();
        setShoppingListError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setShoppingListRetryAction({ label: "다시 불러오기", onRetry: () => void refreshShoppingList() });
      } else if (isMealApiShoppingReceivePersistenceError(reason)) {
        setShoppingListError("구매한 항목을 저장하지 못했어요. 기존 장보기 목록과 재고를 유지했어요.");
        setShoppingListRetryAction({ label: "다시 시도", onRetry: () => void receiveShoppingItem(item, input) });
      } else {
        setShoppingListError("구매한 항목을 재고에 반영하지 못했어요. 다시 시도해 주세요.");
        setShoppingListRetryAction({ label: "다시 시도", onRetry: () => void receiveShoppingItem(item, input) });
      }
      return false;
    } finally {
      finishShoppingListMutation();
    }
  };

  const toggleShoppingItem = async (item: ApiShoppingListItem) => {
    if (shoppingListMutating) return;
    beginShoppingListMutation();
    setShoppingListError("");
    setShoppingListRetryAction(null);
    try {
      if (!mealApi.isConfigured) {
        const checked = !item.checked;
        const now = new Date().toISOString();
        setShoppingList((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, checked, updated_at: now } : candidate));
        setShoppingListStatus("ready");
        setShoppingListNotice(checked ? "구매 완료로 표시했어요. 아직 재고에는 반영되지 않았어요." : "구매 예정으로 되돌렸어요.");
        return;
      }
      const updated = await mealApi.updateShoppingListItem(item.id, !item.checked);
      if (!updated) throw new Error("shopping-list-update-empty");
      setShoppingList((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      rememberCurrentShoppingListRevision();
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        setShoppingList([]);
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setShoppingListError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else if (isMealApiWorkspaceConflictError(reason)) {
        void syncDashboard();
        setShoppingListError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
      } else if (isMealApiShoppingListPersistenceError(reason)) {
        const message = "장보기 항목 상태를 저장하지 못했어요. 기존 상태를 유지했어요";
        setShoppingListError(message);
        setShoppingListRetryAction({ label: "다시 시도", onRetry: () => void toggleShoppingItem(item) });
      } else {
        setShoppingListError("장보기 항목 상태를 저장하지 못했어요.");
      }
    } finally {
      finishShoppingListMutation();
    }
  };

  const removeShoppingItem = async (item: ApiShoppingListItem) => {
    if (shoppingListMutating) return;
    beginShoppingListMutation();
    setShoppingListError("");
    setShoppingListRetryAction(null);
    try {
      if (!mealApi.isConfigured) {
        setShoppingList((current) => current.filter((candidate) => candidate.id !== item.id));
        setShoppingListStatus("ready");
        setShoppingListError("");
        setToast(`${withKoreanObjectParticle(item.canonical_name)} 장보기 목록에서 뺐어요`);
        return;
      }
      const result = await mealApi.deleteShoppingListItem(item.id);
      if (!result?.removed) throw new Error("shopping-list-delete-empty");
      setShoppingList((current) => current.filter((candidate) => candidate.id !== item.id));
      rememberCurrentShoppingListRevision();
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        setShoppingList([]);
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
        setShoppingListError("로그인이 만료됐어요. 다시 로그인해 주세요.");
      } else if (isMealApiWorkspaceConflictError(reason)) {
        void syncDashboard();
        setShoppingListError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
      } else if (isMealApiShoppingListPersistenceError(reason)) {
        const message = "장보기 항목을 삭제하지 못했어요. 기존 목록을 유지했어요";
        setShoppingListError(message);
        setShoppingListRetryAction({ label: "다시 시도", onRetry: () => void removeShoppingItem(item) });
      } else {
        setShoppingListError("장보기 항목을 삭제하지 못했어요.");
      }
    } finally {
      finishShoppingListMutation();
    }
  };

  const addDemoShoppingItems = async (
    sourceType: "meal_plan" | "multi_day",
    sourceId: string,
    entries: Array<{ canonical_name: string; quantity: number; unit: string; day_index?: number | null }>,
  ) => {
    const nextItems = mergeDemoShoppingEntries(shoppingList, entries.map((entry) => ({
      canonicalName: entry.canonical_name,
      quantity: entry.quantity,
      unit: entry.unit,
      sourceType,
      sourceId,
      dayIndex: entry.day_index,
    })));
    setShoppingList(nextItems);
    setShoppingListStatus("ready");
    setShoppingListError("");
    setShoppingListRetryAction(null);
    setShoppingListNotice(`${entries.length}개 부족 재료를 장보기 목록에 담았어요.`);
    setToastAction(null);
    setToast("부족한 재료를 장보기 목록에 담았어요");
    return nextItems;
  };

  const markNotificationRead = async (notification: ApiNotification) => {
    const readAt = new Date().toISOString();
    if (!mealApi.isConfigured) {
      setDemoNotificationReadAt((current) => ({ ...current, [notification.id]: readAt }));
      return;
    }
    notificationReadInFlightRef.current += 1;
    const retryingNotificationRead = Boolean(notificationRetryAction);
    if (!retryingNotificationRead) {
      setNotificationsError("");
      setNotificationRetryAction(null);
    }
    try {
      const updated = await mealApi.markNotificationRead(notification.id);
      if (!updated) throw new Error("notification-read-empty");
      notificationReadOverridesRef.current.set(updated.id, updated.read_at ?? readAt);
      setNotifications((current) => current.map((item) => item.id === updated.id ? { ...updated, read_at: updated.read_at ?? readAt } : item));
      rememberCurrentNotificationRevision();
      setNotificationsError("");
      setNotificationRetryAction(null);
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        void refreshNotifications();
        setNotificationsError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setNotificationRetryAction({ label: "다시 불러오기", onRetry: () => void refreshNotifications() });
      } else if (isMealApiNotificationReadPersistenceError(reason)) {
        setNotificationsError("알림 읽음 상태를 저장하지 못했어요. 기존 읽지 않음 상태를 유지했어요.");
        setNotificationRetryAction({ label: "다시 시도", onRetry: () => void markNotificationRead(notification) });
      } else {
        setNotificationsError("알림 읽음 상태를 저장하지 못했어요.");
        setNotificationRetryAction({ label: "다시 시도", onRetry: () => void markNotificationRead(notification) });
      }
    } finally {
      finishNotificationRead();
    }
  };

  const markAllNotificationsRead = async () => {
    const readAt = new Date().toISOString();
    if (!mealApi.isConfigured) {
      setDemoNotificationReadAt((current) => Object.fromEntries(demoNotifications.map((notification) => [notification.id, current[notification.id] ?? readAt])));
      return;
    }
    notificationReadInFlightRef.current += 1;
    setNotificationsError("");
    setNotificationRetryAction(null);
    try {
      const result = await mealApi.markAllNotificationsRead();
      if (!result) throw new Error("notifications-read-all-empty");
      notifications.forEach((notification) => {
        notificationReadOverridesRef.current.set(notification.id, notification.read_at ?? readAt);
      });
      rememberCurrentNotificationRevision();
      await refreshNotifications();
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        void refreshNotifications();
        setNotificationsError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setNotificationRetryAction({ label: "다시 불러오기", onRetry: () => void refreshNotifications() });
      } else if (isMealApiNotificationReadPersistenceError(reason)) {
        setNotificationsError("알림 읽음 상태를 저장하지 못했어요. 기존 읽지 않음 상태를 유지했어요.");
        setNotificationRetryAction({ label: "다시 시도", onRetry: () => void markAllNotificationsRead() });
      } else {
        setNotificationsError("알림 읽음 상태를 저장하지 못했어요.");
        setNotificationRetryAction({ label: "다시 시도", onRetry: () => void markAllNotificationsRead() });
      }
    } finally {
      finishNotificationRead();
    }
  };

  const openNotificationTarget = (notification: ApiNotification) => {
    notificationInitialFocusRef.current = false;
    void markNotificationRead(notification);
    if (notification.action === "food" && notification.food_id) {
      if (mealApi.isConfigured && !findFoodById(notification.food_id)) {
        const message = "알림에 연결된 식품을 최신 목록에서 찾지 못했어요.";
        notificationDetailReturnRef.current = false;
        notificationReturnFocusIdRef.current = null;
        inventoryReturnContextRef.current = null;
        changeSheet(null);
        setToastAction({
          message,
          label: "최신 재고 확인",
          onInvoke: () => {
            void syncDashboard().then((synced) => {
              setToast(synced ? "최신 식품 목록을 확인했어요" : "최신 식품 목록을 불러오지 못했어요");
              if (synced) openInventory();
            });
          },
        });
        setToast(message);
        return;
      }
      notificationDetailReturnRef.current = true;
      notificationFocusOverrideRef.current = true;
      notificationReturnFocusIdRef.current = notification.id;
      captureInventoryReturnContext(notification.food_id);
      const notificationFood = findFoodById(notification.food_id);
      setDetailEntryIntent(notificationFood
        ? attentionReviewReason(notificationFood, currentDate)
          ? "date-review"
          : notificationFood.productProvenance
            ? "provenance-review"
            : null
        : null);
      setSelectedFoodId(notification.food_id);
      changeSheet("detail");
    } else if (notification.action === "grocy") {
      notificationDetailReturnRef.current = false;
      notificationAccountReturnRef.current = true;
      const notificationOutboxId = notification.sync_record_id
        ?? (notification.id.startsWith("grocy-outbox:") ? notification.id.split(":")[1] ?? null : null);
      setAccountGrocyOutboxFocusId(notificationOutboxId);
      notificationReturnFocusIdRef.current = notification.id;
      changeSheet("account");
    }
  };

  const openSyncRecordFromDetail = (outboxId: string) => {
    const returnToNotification = notificationAccountReturnRef.current || notificationDetailReturnRef.current;
    notificationDetailReturnRef.current = false;
    accountDetailReturnRef.current = !returnToNotification;
    notificationAccountReturnRef.current = returnToNotification;
    setAccountGrocyOutboxFocusId(outboxId);
    changeSheet("account");
  };

  const openSyncNotificationFromDetail = (outboxId: string) => {
    notificationDetailReturnRef.current = false;
    notificationAccountReturnRef.current = false;
    accountDetailReturnRef.current = false;
    setAccountGrocyOutboxFocusId(null);
    notificationReturnFocusIdRef.current = null;
    notificationFocusOverrideRef.current = true;
    notificationInitialFocusRef.current = false;
    setPendingNotificationSyncRecordId(outboxId);
    changeSheet("notifications");
    void refreshNotifications();
  };

  const rememberDashboardRevision = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    dashboardRevisionRef.current = dashboardRevisionRef.current === null
      ? value
      : Math.max(dashboardRevisionRef.current, value);
    return dashboardRevisionRef.current;
  };

  const rememberCurrentDashboardRevision = () => {
    if (mealApi.workspaceRevision !== null) rememberDashboardRevision(mealApi.workspaceRevision);
  };

  const syncDashboard = async (homeOnly = false, refreshDependentSurfaces = true) => {
    dashboardSyncInFlightRef.current = true;
    try {
      const result = await workspaceSync.run("dashboard", async (signal) => {
        const [payload, revision] = await Promise.all([
          mealApi.getDashboard(signal),
          mealApi.getDashboardRevision(signal).catch(() => null),
        ]);
        return { payload, revision };
      });
      if (!result.current) return false;
      if (result.error) throw result.error;
      const dashboardResult = result.value;
      const payload = dashboardResult?.payload;
      if (!payload) return false;
      if (homeOnly && sheetRef.current !== null) return false;
      const nextStorageLocations = payload.storage_locations ?? [];
      updateStorageLocations(nextStorageLocations);
      setFoods(payload.inventory.map((food) => mapApiFood(food, nextStorageLocations)));
      if (sheetRef.current === "detail") setDetailHistoryRefreshKey((current) => current + 1);
      if (mealApi.isConfigured && (inventoryQuery.trim() || storageFilter !== "전체")) {
        setInventorySearchRetry((current) => current + 1);
      }
      if (dashboardResult?.revision) {
        rememberDashboardRevision(dashboardResult.revision.revision);
        if (sheetRef.current === "detail") rememberDetailRevision(dashboardResult.revision.revision);
        if (sheetRef.current === "account") rememberAccountRevision(dashboardResult.revision.revision);
      } else {
        rememberCurrentDashboardRevision();
        if (sheetRef.current === "detail") rememberCurrentDetailRevision();
        if (sheetRef.current === "account") rememberCurrentAccountRevision();
      }
      setDashboardStaleAt(null);
      setConnectionState("connected");
      // A successful dashboard readback is also the mutation boundary for
      // notification state. Await the dependent notification request so a
      // caller cannot report "synced" while the open detail still exposes a
      // pre-mutation notification list. The notification reader already
      // queues safely behind an in-flight read operation.
      await refreshNotifications();
      if (refreshDependentSurfaces) void refreshShoppingList();
      void refreshReceiptSummaries();
      return true;
    } catch (reason) {
      if (isMealApiAuthError(reason)) {
        mealApi.clearSession();
        resetWorkspaceReads();
        setDashboardStaleAt(null);
        setConnectionState("auth_required");
      } else {
        const cached = mealApi.getCachedDashboard();
        if (cached) {
          const cachedStorageLocations = cached.payload.storage_locations ?? [];
          updateStorageLocations(cachedStorageLocations);
          setFoods(cached.payload.inventory.map((food) => mapApiFood(food, cachedStorageLocations)));
          setDashboardStaleAt(cached.saved_at);
        }
        setConnectionState("offline");
      }
      return false;
    } finally {
      dashboardSyncInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!workspaceTransport) return;
    const hasChannel = (message: WorkspaceSyncInvalidation, channel: Parameters<typeof workspaceSync.invalidate>[0]) => (
      message.channels === "all" || message.channels.includes(channel)
    );
    return workspaceTransport.subscribe((message) => {
      if (message.workspaceKey !== workspaceSync.currentWorkspaceKey) return;
      if (message.channels === "all") workspaceSync.invalidateAll();
      else message.channels.forEach((channel) => workspaceSync.invalidate(channel));

      if (hasChannel(message, "inventory-search") && inventorySearchActive) {
        setInventorySearchRetry((current) => current + 1);
      }
      if (hasChannel(message, "dashboard")) {
        void syncDashboard();
        return;
      }
      if (hasChannel(message, "notifications")) void refreshNotifications();
      if (hasChannel(message, "shopping-list")) void refreshShoppingList();
      if (hasChannel(message, "receipt-summaries")) void refreshReceiptSummaries();
    });
  }, [inventorySearchActive, workspaceSync, workspaceTransport]);

  const retryConnection = () => {
    setConnectionState("checking");
    void syncDashboard().then((synced) => {
      setToast(synced ? "서버에 다시 연결했어요" : "아직 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요");
    });
  };

  const clearInventorySearch = () => {
    keyboard.hide();
    setInventoryQuery("");
  };

  const clearInventoryFilters = () => {
    keyboard.hide();
    setInventoryQuery("");
    setStorageFilter("전체");
    setInventoryStatusFilter("all");
    if (activeContentNavRef.current === "food") {
      restoreContentNavigation("food");
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.inventory-status-filters button[aria-pressed="true"]')?.focus({ preventScroll: true });
      });
    }
  };

  const retryInventorySearch = () => {
    const activeStatusFilter = document.querySelector<HTMLElement>('.inventory-status-filters button[aria-pressed="true"]');
    setInventorySearchRetry((current) => current + 1);
    window.requestAnimationFrame(() => activeStatusFilter?.focus({ preventScroll: true }));
  };

  const openInventory = (query = "", resetStatusFilter = false) => {
    keyboard.hide();
    setStorageFilter("전체");
    setInventoryQuery(query);
    if (resetStatusFilter) setInventoryStatusFilter("all");
    restoreContentNavigation("food");
    if (sheet === "account") accountOriginNavRef.current = "food";
    changeSheet(null);
  };

  const openNeedsReviewInventory = () => {
    setInventoryStatusFilter("needs-review");
    openInventory();
  };

  const navigateFromBottom = (destination: "home" | "food") => {
    keyboard.hide();
    restoreContentNavigation(destination);
    changeSheet(null);
  };

  const loadMoreInventory = () => {
    if (!inventorySearchOwnsResults || !inventorySearchHasMore || inventorySearchStatus === "loading") return;
    const offset = inventorySearchResults.length;
    void workspaceSync.run("inventory-search", (signal) => mealApi.searchInventory(normalizedInventoryQuery, storageTypeFromFilter(storageFilter), offset, 40, signal, storageLocationIdFromFilter(storageFilter)))
      .then((result) => {
        if (!result.current) return;
        if (result.error) throw result.error;
        const payload = result.value;
        if (!payload || payload.offset !== offset) throw new Error("inventory-search-page-mismatch");
        setInventorySearchResults((current) => [...current, ...payload.items.map((food) => mapApiFood(food, storageLocationsRef.current))]);
        setInventorySearchTotal(payload.total);
        setInventorySearchHasMore(payload.has_more);
        setInventorySearchStatus("ready");
      })
      .catch((reason) => {
        if (isMealApiAuthError(reason)) {
          mealApi.clearSession();
          resetWorkspaceReads();
          setDashboardStaleAt(null);
          setConnectionState("auth_required");
          setInventorySearchError("로그인이 만료됐어요. 다시 로그인해 주세요.");
        } else {
          setInventorySearchError("더 많은 재고를 불러오지 못했어요. 다시 시도해 주세요.");
        }
        setInventorySearchStatus("error");
      });
  };

  const handleAuthenticated = async (session: { mode: "account" | "guest" }, successMessage?: string) => {
    clearCompletedOutboxHandoff();
    changeSheet(null);
    resetWorkspacePresentation();
    setAddSheetSessionKey((current) => current + 1);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
    const finalMessage = synced ? successMessage ?? (session.mode === "account" ? "계정에 연결했어요" : "게스트 기록 공간에 연결했어요") : "계정은 연결했지만 식품 목록을 읽지 못했어요";
    if (synced && successMessage) {
      setToastAction({ message: finalMessage, label: "식품 목록 확인", onInvoke: openInventory });
    } else {
      setToastAction(null);
    }
    setToast(finalMessage);
  };

  const handleSignedOut = async () => {
    clearCompletedOutboxHandoff();
    resetWorkspacePresentation();
    setAddSheetSessionKey((current) => current + 1);
    const serverRevoked = await mealApi.logoutSession();
    changeSheet(null);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
      setToast(synced ? serverRevoked ? "로그아웃하고 새 게스트 기록 공간으로 전환했어요" : "이 기기에서 로그아웃하고 새 게스트 기록 공간으로 전환했어요" : "로그아웃했지만 식품 목록을 읽지 못했어요");
  };

  const handleAccountDeleted = async () => {
    clearCompletedOutboxHandoff();
    mealApi.clearSession();
    changeSheet(null);
    resetWorkspacePresentation();
    setAddSheetSessionKey((current) => current + 1);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
      setToast(synced ? "계정과 기록을 삭제하고 새 게스트 기록 공간으로 전환했어요" : "계정과 기록은 삭제했지만 새 게스트 기록 공간을 열지 못했어요");
  };

  const focusNextPriorityCard = () => {
    const target = document.querySelector<HTMLElement>(".priority-card:not([disabled])");
    if (!target) return;
    scrollTargetWithinNearestContainer(target, "center", getMobileScrollBehavior());
    window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  };

  const handleMealCompleted = (foodIds: string[], skippedCount = 0, consumedAllocations: Array<{ food_id: string; quantity: number }> = [], grocySyncStatus?: ApiGrocySyncStatus) => {
    const mealOriginNav = mealSheetOriginNavRef.current;
    const hasInventoryResult = foodIds.length > 0 || consumedAllocations.length > 0;
    pendingMealCompletionFocusRef.current = hasInventoryResult
      ? {
          sourceNav: mealOriginNav,
          preferredFoodIds: Array.from(new Set(consumedAllocations.map((allocation) => allocation.food_id))),
          beforeFoodsSignature: foods.map((food) => `${food.id}:${food.quantity}`).join("|"),
          trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        }
      : null;
    if (hasInventoryResult) sheetRestoreFocusRef.current = null;
    changeSheet(null);
    if (mealOriginNav === "home") {
      activeContentNavRef.current = "home";
      navigationIntentRef.current = "home";
      setActiveNav("home");
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".app-screen.mobile-scroll, .app-screen .mobile-scroll")?.scrollTo({ top: 0, behavior: "auto" });
      });
    }
    const completionMessage = mealCompletionMessage(foodIds, skippedCount, consumedAllocations);
    if (!mealApi.isConfigured) {
      const consumedIds = new Set(foodIds);
      const quantitiesByFoodId = new Map(consumedAllocations.map((allocation) => [allocation.food_id, allocation.quantity]));
      setFoods((current) => current
        .flatMap((food) => {
          if (!consumedIds.has(food.id)) return [food];
          const consumedQuantity = quantitiesByFoodId.get(food.id);
          if (consumedQuantity == null) return [];
          const currentQuantity = quantityParts(food.quantity);
          const remaining = Number((currentQuantity.amount - consumedQuantity).toFixed(3));
          return remaining > 0 ? [{ ...food, quantity: `${remaining}${currentQuantity.unit}` }] : [];
        })
        .map((food, index) => ({ ...food, priority: index + 1 })));
      setToastAction(mealOriginNav === "home" && hasInventoryResult
        ? { message: withGrocySyncNotice(completionMessage, grocySyncStatus), label: "다음 식품 살펴보기", onInvoke: focusNextPriorityCard }
        : null);
      setToast(withGrocySyncNotice(completionMessage, grocySyncStatus));
      return;
    }
    setToastAction(null);
    setToast("식단 완료를 서버에 저장하는 중이에요");
    void syncDashboard().then((synced) => {
      const completionSyncMessage = withGrocySyncNotice(completionMessage, grocySyncStatus);
      const finalCompletionMessage = withServerReadbackNotice(completionSyncMessage, synced);
      if (needsExternalSyncAttention(grocySyncStatus)) {
        setToastAction({ message: finalCompletionMessage, label: "재고 앱 설정 보기", onInvoke: () => changeSheet("account") });
      } else if (mealOriginNav === "home" && hasInventoryResult) {
        setToastAction({ message: finalCompletionMessage, label: "다음 식품 살펴보기", onInvoke: focusNextPriorityCard });
      } else {
        setToastAction(null);
      }
      setToast(finalCompletionMessage);
    });
  };

  const handleMealSaved = (
    kind?: "single" | "multi-day",
    hasMissingIngredients = false,
    addMissingIngredients?: () => void | Promise<void>,
  ) => {
    const message = !mealApi.isConfigured
      ? kind === "multi-day"
        ? hasMissingIngredients
          ? "미리보기 3일 식단을 저장했어요 · 부족 재료를 장보기 목록에 담아 주세요"
          : "미리보기 3일 식단을 저장했어요 · 화면을 벗어나면 초기화돼요"
        : hasMissingIngredients
          ? "미리보기 식단을 저장했어요 · 부족 재료를 장보기 목록에 담아 주세요"
          : "미리보기 식단을 저장했어요 · 화면을 벗어나면 초기화돼요"
      : kind === "multi-day"
        ? hasMissingIngredients
          ? "3일 식단 저장 완료 · 부족한 재료를 장보기 목록에 담아 주세요"
          : "3일 식단을 저장했어요"
        : hasMissingIngredients
          ? "식단 저장 완료 · 부족한 재료를 장보기 목록에 담아 주세요"
          : "식단 저장 완료 · 사용량을 확인해 주세요";
    setToast(message);
    setToastAction(hasMissingIngredients && addMissingIngredients
      ? { message, label: "부족 재료 담기", onInvoke: () => { void addMissingIngredients(); } }
      : null);
  };

  const mergeFoods = (incoming: FoodItem[]) => {
    setFoods((current) => {
      const next = [...current];
      incoming.forEach((incomingFood) => {
        if (incomingFood.lotAction === "create") {
          const newLot = { ...incomingFood };
          delete newLot.lotAction;
          delete newLot.targetFoodId;
          next.unshift(newLot);
          return;
        }
        if (incomingFood.lotAction === "correct" && incomingFood.targetFoodId) {
          const targetIndex = next.findIndex((food) => food.id === incomingFood.targetFoodId);
          const targetFood = targetIndex >= 0 ? next[targetIndex] : undefined;
          if (!targetFood || targetFood.name.trim().replace(/\s+/g, " ") !== incomingFood.name.trim().replace(/\s+/g, " ")) return;
          const existingStorageLocation = targetFood.storageLocationId
            ? storageLocations.find((location) => location.id === targetFood.storageLocationId)
            : undefined;
          const keepExistingLocation = Boolean(
            !incomingFood.storageLocationId
            && targetFood.storageLocationId
            && (
              targetFood.storage === incomingFood.storage
              || (existingStorageLocation && storageFromApi(existingStorageLocation.storage_type) === incomingFood.storage)
            ),
          );
          next[targetIndex] = {
            ...targetFood,
            storage: incomingFood.storage,
            storageLocationId: incomingFood.storageLocationId ?? (keepExistingLocation ? targetFood.storageLocationId : undefined),
            storageLocationName: incomingFood.storageLocationId
              ? incomingFood.storageLocationName
              : keepExistingLocation ? targetFood.storageLocationName : undefined,
            dateLabel: incomingFood.dateLabel,
            dateDetail: incomingFood.dateDetail,
            dateKind: incomingFood.dateKind,
            dateAssertionKind: incomingFood.dateAssertionKind,
            dateSource: incomingFood.dateSource,
            dateStorageHint: incomingFood.dateStorageHint,
            dateStorageConditionText: incomingFood.dateStorageConditionText,
          };
          return;
        }
        const existingIndex = next.findIndex((food) => food.name === incomingFood.name);
        if (existingIndex >= 0) {
          const existingFood = next[existingIndex];
          const existingKind = existingFood.dateKind;
          const incomingKind = incomingFood.dateKind;
          const keepTrustedDate = (existingKind === "actual_printed" || existingKind === "user_confirmed")
            && (incomingKind === "estimated_use_first" || incomingKind === "unknown");
          next[existingIndex] = {
            ...existingFood,
            ...incomingFood,
            id: existingFood.id,
            storage: existingFood.storage,
            opened: existingFood.opened,
            ...(keepTrustedDate
              ? {
                  dateLabel: existingFood.dateLabel,
                  dateDetail: existingFood.dateDetail,
                  dateKind: existingFood.dateKind,
                  dateSource: existingFood.dateSource,
                  note: existingFood.note,
                }
              : {}),
          };
        } else {
          next.unshift(incomingFood);
        }
      });
      return next.map((food, index) => ({ ...food, priority: index + 1 }));
    });
  };

  const queueAddedFoodFocus = (foodName: string) => {
    if (!foodName.trim() || addReturnSheetRef.current) {
      pendingAddedFoodFocusRef.current = null;
      return;
    }
    pendingAddedFoodFocusRef.current = {
      name: foodName,
      sourceNav: activeNav === "meal" ? mealSheetOriginNavRef.current : activeContentNavRef.current,
      trigger: addOriginFocusRef.current ?? sheetRestoreFocusRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    };
  };

  const queueFoodDateFocus = (food: FoodItem) => {
    if (mealDetailReturnRef.current || notificationDetailReturnRef.current) {
      // Planner and notification detail both return to an already-open
      // context sheet. Do not let a dashboard-row focus intent survive until
      // that sheet is closed later.
      pendingFoodDateFocusRef.current = null;
      return;
    }
    const sourceNav = inventoryReturnContextRef.current ? "food" : activeContentNavRef.current;
    pendingFoodDateFocusRef.current = {
      foodId: food.id,
      name: food.name,
      sourceNav,
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    // A detail sheet can be opened from the shopping sheet, so the generic
    // sheet trigger may point at a now-hidden shopping control. The date
    // result owns restoration for this transition.
    sheetRestoreFocusRef.current = null;
  };

  const syncStorageMutation = async () => {
    const synced = await syncDashboard();
    // Storage changes can create or clear a mismatch notification while the
    // detail sheet remains open. Await the dependent read model explicitly
    // so dashboard success cannot be reported with stale notifications.
    await refreshNotifications();
    return synced;
  };

  const saveFood = (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number, storageLocationId: string | null = null) => {
    const previousFood = findFoodById(foodId);
    const storageMutationKey = createId("storage-event");
    const previousQuantity = previousFood ? quantityParts(previousFood.quantity) : { amount: eventQuantity, unit: "개" };
    const isPartial = Boolean(previousFood && eventQuantity < previousQuantity.amount);
    const previousStorageLocationId = previousFood?.storageLocationId ?? null;
    const nextStorageLocationId = storageLocationId ?? null;
    const nextStorageLocationName = nextStorageLocationId
      ? storageLocations.find((location) => location.id === nextStorageLocationId)?.name
      : undefined;
    const storageChanged = Boolean(previousFood && (previousFood.storage !== storage || previousStorageLocationId !== nextStorageLocationId));
    const shouldSplit = Boolean(isPartial && previousFood && (storageChanged || (!previousFood.opened && opened)));
    const pendingChangeLabels = [
      storageChanged ? "보관 위치" : null,
      previousFood && !previousFood.opened && opened ? "개봉 상태" : null,
      isPartial ? "수량" : null,
    ].filter((value): value is string => Boolean(value));
    const pendingChangeSummary = pendingChangeLabels.join("·");
    const persistenceFailureMessage = pendingChangeLabels.length > 1
      ? `보관 상태를 저장하지 못했어요. ${pendingChangeSummary} 변경 전 상태를 유지했어요.`
      : "보관 상태를 저장하지 못했어요. 기존 상태를 유지했어요.";
    const rollbackFailureMessage = pendingChangeLabels.length > 1
      ? `서버 저장에 실패해 ${pendingChangeSummary} 변경 전 상태로 되돌렸어요`
      : "서버 저장에 실패해 원래 상태로 되돌렸어요";
    const storageSavedMessage = shouldSplit ? "보관 상태를 저장하고 남은 수량을 나눴어요" : "보관 상태를 저장했어요";
    const storageScopeLabel = pendingChangeLabels.join("·");
    const withStorageScope = (includeScope: boolean) => includeScope && storageScopeLabel
      ? `${storageSavedMessage} · 변경 범위: ${storageScopeLabel}`
      : storageSavedMessage;
    const previousFoods = foods;
    const applyOptimistic = () => {
      if (!(mealApi.isConfigured && shouldSplit) && previousFood) {
        if (shouldSplit) {
          const child: FoodItem = {
            ...previousFood,
            id: createId("lot"),
            parentId: previousFood.id,
            quantity: `${eventQuantity}${previousQuantity.unit}`,
            storage,
            storageLocationId: nextStorageLocationId || undefined,
            storageLocationName: nextStorageLocationName,
            opened,
            dateSource: previousFood.dateKind === "estimated_use_first" ? `${storage} 보관 기준` : previousFood.dateSource,
          };
          const remaining: FoodItem = { ...previousFood, quantity: `${previousQuantity.amount - eventQuantity}${previousQuantity.unit}` };
          setFoods((current) => current.flatMap((food) => food.id === foodId ? [remaining, child] : [food]).map((food, index) => ({ ...food, priority: index + 1 })));
        } else {
          setFoods((current) => current.map((food) => (
            food.id === foodId
              ? {
                  ...food,
                  storage,
                  storageLocationId: nextStorageLocationId || undefined,
                  storageLocationName: nextStorageLocationName,
                  opened,
                  dateSource: food.dateKind === "estimated_use_first" ? `${storage} 보관 기준` : food.dateSource,
                }
              : food
          )));
        }
      }
    };
    if (!mealApi.isConfigured || !previousFood) applyOptimistic();
    changeSheet(null);
    setToast(mealApi.isConfigured ? "보관 상태를 서버에 저장하는 중이에요" : storageSavedMessage);
    if (mealApi.isConfigured && previousFood) {
      const persistEvents = async (): Promise<StorageMutationResult> => {
        const moveRequested = storageChanged;
        const openRequested = !previousFood.opened && opened;
        let targetFoodId = foodId;
        const statuses: ApiGrocySyncStatus[] = [];
        if (moveRequested && openRequested) {
          const sequence = await mealApi.createStorageEventSequence(foodId, [
            {
              event_type: "moved",
              to_storage_type: storageToApi(storage),
              to_storage_location_id: nextStorageLocationId || undefined,
              quantity: isPartial ? eventQuantity : undefined,
            },
            { event_type: "opened" },
          ], storageMutationKey);
          if (!sequence || sequence.events.length !== 2) throw new Error("storage-event-sequence-empty");
          sequence.events.forEach((event) => {
            if (event.grocy_sync_status) statuses.push(event.grocy_sync_status);
          });
          return { statuses, inventory: sequence.events[sequence.events.length - 1]?.inventory ?? null };
        }
        let inventory: ApiFood[] | null = null;
        if (moveRequested) {
          const moved = await mealApi.createStorageEvent(targetFoodId, {
            event_type: "moved",
            to_storage_type: storageToApi(storage),
            to_storage_location_id: nextStorageLocationId || undefined,
            quantity: isPartial ? eventQuantity : undefined,
          }, `${storageMutationKey}:move`);
          if (moved?.grocy_sync_status) statuses.push(moved.grocy_sync_status);
          inventory = moved?.inventory ?? inventory;
          if (moved?.created_child_food_id) targetFoodId = moved.created_child_food_id;
        }
        if (openRequested) {
          const openedEvent = await mealApi.createStorageEvent(targetFoodId, {
            event_type: "opened",
            quantity: targetFoodId === foodId && isPartial ? eventQuantity : undefined,
          }, `${storageMutationKey}:open`);
          if (openedEvent?.grocy_sync_status) statuses.push(openedEvent.grocy_sync_status);
          inventory = openedEvent?.inventory ?? inventory;
        }
        return { statuses, inventory };
      };
      const persistAndSync = () => {
        void runStorageMutationRecovery({
          applyOptimistic,
          restore: () => setFoods(previousFoods),
          mutate: persistEvents,
          sync: syncStorageMutation,
          onSuccess: ({ value: result, synced }) => {
            if (result.inventory) {
              setFoods(result.inventory.map((food, index) => ({ ...mapApiFood(food, storageLocations), priority: index + 1 })));
            }
            const externalSyncDeferred = hasDeferredExternalSync(result.statuses);
            const storageSyncMessage = withGrocySyncNotice(withStorageScope(externalSyncDeferred || !synced), result.statuses);
            const finalStorageMessage = withServerReadbackNotice(storageSyncMessage, synced);
            const externalSyncNeedsAttention = needsExternalSyncAttention(result.statuses);
            if (externalSyncNeedsAttention) {
              setToastAction({ message: finalStorageMessage, label: "재고 앱 설정 보기", onInvoke: () => changeSheet("account") });
            } else {
              setToastAction(null);
            }
            setToast(finalStorageMessage);
          },
          onFailure: (reason, retry) => {
            showRetryToast(
              isMealApiWorkspaceConflictError(reason)
                ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
                : isMealApiStorageEventPersistenceError(reason)
                  ? persistenceFailureMessage
                  : rollbackFailureMessage,
              () => { void retry(); },
            );
          },
        });
      };
      persistAndSync();
    }
  };

  const consumeFood = (foodId: string, eventQuantity?: number) => {
    const food = findFoodById(foodId);
    const consumeMutationKey = createId("consume-event");
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
    const consumeSuccessMessage = food ? `${withKoreanObjectParticle(food.name)} 먹은 기록으로 남겼어요` : "먹은 기록을 저장했어요";
    const consumeScopeMessage = `기록 범위: ${isPartial ? `${eventQuantity}${quantity.unit}` : `전체 ${quantity.amount}${quantity.unit}`}`;
    const withConsumeScope = (includeScope: boolean) => includeScope ? `${consumeSuccessMessage} · ${consumeScopeMessage}` : consumeSuccessMessage;
    const previousFoods = foods;
    const shouldCueNextPriority = activeContentNavRef.current === "home"
      && !inventoryReturnContextRef.current
      && !mealDetailReturnRef.current;
    const optimisticFoods = (isPartial
      ? previousFoods.map((item) => item.id === foodId ? { ...item, quantity: `${quantity.amount - (eventQuantity ?? 0)}${quantity.unit}` } : item)
      : previousFoods.filter((item) => item.id !== foodId)
    ).map((item, index) => ({ ...item, priority: index + 1 }));
    const applyOptimistic = () => {
      if (isPartial) {
        setFoods((current) => current.map((item) => item.id === foodId ? { ...item, quantity: `${quantity.amount - (eventQuantity ?? 0)}${quantity.unit}` } : item));
      } else {
        setFoods((current) => current.filter((item) => item.id !== foodId));
      }
    };
    if (!mealApi.isConfigured) applyOptimistic();
    changeSheet(null);
    setToastAction(null);
    setToast(mealApi.isConfigured ? "먹은 기록을 서버에 저장하는 중이에요" : withNextPriorityCue(consumeSuccessMessage, optimisticFoods, shouldCueNextPriority));
    if (mealApi.isConfigured) {
      const persistAndSync = () => {
        void runStorageMutationRecovery({
          applyOptimistic,
          restore: () => setFoods(previousFoods),
          mutate: async () => {
            const event = await mealApi.createStorageEvent(foodId, { event_type: "consumed", quantity: isPartial ? eventQuantity : undefined }, consumeMutationKey);
            return { statuses: event?.grocy_sync_status ? [event.grocy_sync_status] : [], inventory: event?.inventory ?? null } satisfies StorageMutationResult;
          },
          sync: syncStorageMutation,
          onSuccess: ({ value: result, synced }) => {
            const nextInventory = result.inventory
              ? result.inventory.map((item, index) => ({ ...mapApiFood(item, storageLocations), priority: index + 1 }))
              : optimisticFoods;
            if (result.inventory) {
              setFoods(nextInventory);
            }
            const successMessage = withGrocySyncNotice(withConsumeScope(hasDeferredExternalSync(result.statuses) || !synced), result.statuses);
            const finalConsumeMessage = withNextPriorityCue(withServerReadbackNotice(successMessage, synced), nextInventory, shouldCueNextPriority);
            if (needsExternalSyncAttention(result.statuses)) {
              setToastAction({ message: finalConsumeMessage, label: "재고 앱 설정 보기", onInvoke: () => changeSheet("account") });
            } else {
              setToastAction(null);
            }
            setToast(finalConsumeMessage);
          },
          onFailure: (reason, retry) => {
            showRetryToast(
              isMealApiWorkspaceConflictError(reason)
                ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
                : isMealApiStorageEventPersistenceError(reason)
                  ? "먹은 기록을 저장하지 못했어요. 기존 목록을 유지했어요."
                  : "서버 저장에 실패해 목록을 되돌렸어요",
              () => { void retry(); },
            );
          },
        });
      };
      persistAndSync();
    }
  };

  const discardFood = (foodId: string, eventQuantity?: number) => {
    const food = findFoodById(foodId);
    const discardMutationKey = createId("discard-event");
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
    const discardSuccessMessage = food
      ? isPartial ? `${food.name} ${eventQuantity}${quantity.unit}을 폐기 기록으로 남겼어요` : `${food.name} 폐기 기록을 남겼어요`
      : "폐기 기록을 저장했어요";
    const discardScopeMessage = `기록 범위: ${isPartial ? `${eventQuantity}${quantity.unit}` : `전체 ${quantity.amount}${quantity.unit}`}`;
    const withDiscardScope = (includeScope: boolean) => includeScope ? `${discardSuccessMessage} · ${discardScopeMessage}` : discardSuccessMessage;
    const previousFoods = foods;
    const applyOptimistic = () => {
      if (isPartial) {
        setFoods((current) => current.map((item) => item.id === foodId ? { ...item, quantity: `${quantity.amount - (eventQuantity ?? 0)}${quantity.unit}` } : item));
      } else {
        setFoods((current) => current.filter((item) => item.id !== foodId));
      }
    };
    if (!mealApi.isConfigured) applyOptimistic();
    changeSheet(null);
    setToastAction(null);
    setToast(mealApi.isConfigured ? "폐기 기록을 서버에 저장하는 중이에요" : discardSuccessMessage);
    if (mealApi.isConfigured) {
      const persistAndSync = () => {
        void runStorageMutationRecovery({
          applyOptimistic,
          restore: () => setFoods(previousFoods),
          mutate: async () => {
            const event = await mealApi.createStorageEvent(foodId, { event_type: "discarded", quantity: isPartial ? eventQuantity : undefined }, discardMutationKey);
            return { statuses: event?.grocy_sync_status ? [event.grocy_sync_status] : [], inventory: event?.inventory ?? null } satisfies StorageMutationResult;
          },
          sync: syncStorageMutation,
          onSuccess: ({ value: result, synced }) => {
            if (result.inventory) {
              setFoods(result.inventory.map((item, index) => ({ ...mapApiFood(item, storageLocations), priority: index + 1 })));
            }
            const discardSyncMessage = withGrocySyncNotice(withDiscardScope(hasDeferredExternalSync(result.statuses) || !synced), result.statuses);
            const finalDiscardMessage = withServerReadbackNotice(discardSyncMessage, synced);
            if (needsExternalSyncAttention(result.statuses)) {
              setToastAction({ message: finalDiscardMessage, label: "재고 앱 설정 보기", onInvoke: () => changeSheet("account") });
            } else {
              setToastAction(null);
            }
            setToast(finalDiscardMessage);
          },
          onFailure: (reason, retry) => {
            showRetryToast(
              isMealApiWorkspaceConflictError(reason)
                ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
                : isMealApiStorageEventPersistenceError(reason)
                  ? "폐기 기록을 저장하지 못했어요. 기존 목록을 유지했어요."
                  : "서버 저장에 실패해 목록을 되돌렸어요",
              () => { void retry(); },
            );
          },
        });
      };
      persistAndSync();
    }
  };

  const confirmFoodDate = (foodId: string, dateValue: string, kind: "sell_by" | "use_by" | "best_before" | "user_reminder") => {
    const mutationKey = `${foodId}:${dateValue}:${kind}`;
    if (pendingDateMutationKeysRef.current.has(mutationKey)) return;
    pendingDateMutationKeysRef.current.add(mutationKey);
    const food = findFoodById(foodId);
    if (!food) {
      pendingDateMutationKeysRef.current.delete(mutationKey);
      return;
    }
    const returnedFromNotification = notificationDetailReturnRef.current;
    const nextPriorityFood = priorityFoods.find((candidate) => candidate.id !== foodId && candidate.priority <= 3);
    const actualPrinted = kind !== "user_reminder";
    const updatedFood: FoodItem = {
      ...food,
      dateLabel: formatApiDate(dateValue),
      dateDetail: dateValue.replaceAll("-", "."),
      dateKind: actualPrinted ? "actual_printed" : "user_confirmed",
      dateAssertionKind: kind,
      dateSource: actualPrinted ? "포장지에서 사용자 확인" : "사용자 입력",
      confidence: 1,
      note: actualPrinted ? "포장지에서 확인한 날짜를 사용자 확인으로 기록했어요." : "사용자가 설정한 알림 날짜를 기록했어요.",
    };
    const dateMeaning = kind === "sell_by" ? "유통기한" : kind === "best_before" ? "품질유지기한" : kind === "user_reminder" ? "알림일" : "소비기한";
    const savedDateMessage = actualPrinted
      ? `${food.name} ${dateMeaning}을 사용자 확인으로 저장했어요`
      : `${food.name} ${dateMeaning}을 저장했어요`;
    const displaySavedDateMessage = returnedFromNotification ? `${savedDateMessage} · 알림으로 돌아왔어요` : savedDateMessage;
    // A confirmed date is an inventory mutation. Leave the temporary shopping
    // detail origin so authoritative readback restores the food row focus.
    shoppingDetailReturnRef.current = false;
    queueFoodDateFocus(food);
    changeSheet(null);
    setToastAction(null);
    setToast(mealApi.isConfigured ? "확인한 날짜를 서버에 저장하는 중이에요" : displaySavedDateMessage);
    if (!mealApi.isConfigured) {
      setFoods((current) => current.map((item) => item.id === foodId ? updatedFood : item));
      if (nextPriorityFood && !returnedFromNotification) {
        setToastAction({ message: displaySavedDateMessage, label: "다음 식품 살펴보기", onInvoke: () => openDetail(nextPriorityFood, "home") });
      } else {
        setToastAction(null);
      }
      pendingDateMutationKeysRef.current.delete(mutationKey);
      return;
    }
    void runAuthoritativeMutation({
      operation: "food-date",
      mutate: () => mealApi.updateDateAssertion(foodId, {
        kind,
        date_value: dateValue,
        source_detail: actualPrinted ? "포장지에서 사용자 확인" : "사용자 알림 설정",
      }),
      apply: (updatedApiFood) => {
        const updatedReadModel = mapApiFood(updatedApiFood, storageLocations);
        setFoods((current) => current.map((item) => item.id === foodId ? updatedReadModel : item));
      },
      sync: syncDashboard,
    })
      .then(({ synced }) => {
        const finalDateMessage = withServerReadbackNotice(displaySavedDateMessage, synced);
        if (!synced) {
          setToastAction({
            message: finalDateMessage,
            label: "최신 목록 확인",
            onInvoke: () => {
              void syncDashboard().then((latestSynced) => {
                setToast(latestSynced ? "최신 목록을 확인했어요" : "최신 목록을 아직 불러오지 못했어요");
              });
            },
          });
        } else if (nextPriorityFood && !returnedFromNotification) {
          setToastAction({ message: finalDateMessage, label: "다음 식품 살펴보기", onInvoke: () => openDetail(nextPriorityFood, "home") });
        } else {
          setToastAction(null);
        }
        setToast(finalDateMessage);
      })
      .catch(async (reason) => {
        await syncDashboard();
        const message = isMealApiWorkspaceConflictError(reason)
          ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
          : isMealApiFoodDatePersistenceError(reason)
            ? "확인한 날짜를 저장하지 못했어요. 기존 정보를 유지했어요"
            : "날짜 저장에 실패해 기존 정보를 유지했어요";
        if (isMealApiWorkspaceConflictError(reason)) setToast(message);
        else if (isMealApiFoodDatePersistenceError(reason)) showRetryToast(message, () => confirmFoodDate(foodId, dateValue, kind));
        else setToast(message);
      })
      .finally(() => pendingDateMutationKeysRef.current.delete(mutationKey));
  };

  const removeProductProvenance = (foodId: string) => {
    const food = findFoodById(foodId);
    if (!food?.productProvenance) return;
    if (productProvenanceMutatingFoodId === foodId) return;
    setProductProvenanceMutatingFoodId(foodId);
    setProductProvenanceStatus(null);
    setProductProvenanceNotice(null);
    if (!mealApi.isConfigured) {
      setFoods((current) => current.map((item) => item.id === foodId ? { ...item, productProvenance: undefined } : item));
      setProductProvenanceNotice({ foodId, message: `${food.name}의 상품 정보를 지웠어요`, requiresRefresh: false });
      setToast(`${food.name}의 상품 정보를 지웠어요`);
      setProductProvenanceMutatingFoodId(null);
      return;
    }
    setFoods((current) => current.map((item) => item.id === foodId ? { ...item, productProvenance: undefined } : item));
    setToast(`${food.name}의 상품 정보를 지우는 중이에요`);
    void runAuthoritativeMutation({
      operation: "product-provenance",
      mutate: () => mealApi.clearProductProvenance(foodId),
      apply: (updatedApiFood) => {
        const updatedReadModel = mapApiFood(updatedApiFood, storageLocations);
        setFoods((current) => current.map((item) => item.id === foodId ? updatedReadModel : item));
      },
      sync: syncDashboard,
    })
      .then(({ synced }) => {
        setProductProvenanceStatus(null);
        const noticeMessage = synced
          ? `${food.name}의 상품 정보를 지웠어요. 이전 변경 기록은 그대로예요.`
          : `${food.name}의 상품 정보를 지웠어요. 최신 목록을 불러오지 못했어요.`;
        setProductProvenanceNotice({
          foodId,
          message: noticeMessage,
          requiresRefresh: !synced,
        });
        setToast(noticeMessage);
      })
      .catch(async (reason) => {
        const conflict = isMealApiWorkspaceConflictError(reason);
        const persistenceFailure = isMealApiProductProvenancePersistenceError(reason);
        // A failed mutation did not produce an authoritative response, so
        // restore the previous provenance. For a workspace conflict the
        // following dashboard read owns the winner state instead.
        if (!conflict) {
          setFoods((current) => current.map((item) => item.id === foodId ? food : item));
        }
        if (conflict) {
          await syncDashboard();
          setProductProvenanceStatus({ foodId, message: MEAL_API_WORKSPACE_CONFLICT_MESSAGE, retryable: false });
          setToast(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        } else if (persistenceFailure) {
          // The typed persistence failure is already authoritative: the
          // server kept the old state. Show the retry immediately instead of
          // waiting for a dashboard read that can restore stale confirmation
          // UI and outlive the short-lived toast.
          setProductProvenanceStatus({ foodId, message: "상품 정보를 지우지 못했어요. 기존 정보는 그대로예요.", retryable: true });
        } else {
          // Network/unknown failures are also restored locally. Do not make a
          // potentially stale read race with the retry affordance.
          setFoods((current) => current.map((item) => item.id === foodId ? food : item));
          setProductProvenanceStatus({ foodId, message: "상품 정보를 지우지 못했어요. 기존 정보는 그대로예요.", retryable: true });
        }
      })
      .finally(() => setProductProvenanceMutatingFoodId(null));
  };

  const updateProductInfo = (foodId: string, input: { name: string; brand: string; category: string }) => {
    const food = findFoodById(foodId);
    if (!food) return;
    setProductInfoRetryAction(null);
    setProductInfoSavingFoodId(foodId);
    setProductInfoNotice(null);
    const updatedFood: FoodItem = {
      ...food,
      name: input.name,
      brand: input.brand,
      category: input.category,
      productProvenance: undefined,
    };
    setFoods((current) => current.map((item) => item.id === foodId ? updatedFood : item));
    if (!mealApi.isConfigured) {
      setProductInfoSavingFoodId(null);
      setToastAction(null);
      setProductInfoNotice({ foodId, message: `${input.name} 상품 정보를 저장했어요`, requiresRefresh: false });
      setToast(`${input.name} 상품 정보를 저장했어요`);
      return;
    }
    setToastAction(null);
    setToast("상품 정보를 서버에 저장하는 중이에요");
    void runAuthoritativeMutation({
      operation: "product-info",
      mutate: () => mealApi.updateProductInfo(foodId, {
        canonical_name: input.name,
        brand: input.brand,
        category: input.category,
      }),
      apply: (updatedApiFood) => {
        const updatedReadModel = mapApiFood(updatedApiFood, storageLocations);
        setFoods((current) => current.map((item) => item.id === foodId ? updatedReadModel : item));
      },
      sync: syncDashboard,
    })
      .then(({ synced }) => {
        setProductInfoSavingFoodId(null);
        setProductInfoRetryAction(null);
        const savedProductInfoMessage = `${input.name} 상품 정보를 저장했어요. 이전 정보는 변경 기록에 남았어요.`;
        const finalProductInfoMessage = withServerReadbackNotice(savedProductInfoMessage, synced);
        setProductInfoNotice({ foodId, message: finalProductInfoMessage, requiresRefresh: !synced });
        if (!synced) {
          setToastAction({
            message: finalProductInfoMessage,
            label: "최신 목록 확인",
            onInvoke: () => {
              void syncDashboard().then((latestSynced) => {
                setToast(latestSynced ? "최신 목록을 확인했어요" : "최신 목록을 아직 불러오지 못했어요");
              });
            },
          });
        } else {
          setToastAction(null);
        }
        setToast(finalProductInfoMessage);
      })
      .catch(async (reason) => {
        // Only the mutation failure path restores the previous local state.
        // A successful PATCH followed by a failed dashboard read is handled
        // above without hiding the durable server result.
        setProductInfoSavingFoodId(null);
        setProductInfoNotice(null);
        setFoods((current) => current.map((item) => item.id === foodId ? food : item));
        const persistenceFailure = isMealApiProductInfoPersistenceError(reason);
        if (persistenceFailure) {
          setProductInfoRetryAction({
            foodId,
            input,
            message: "상품 정보를 저장하지 못했어요. 기존 정보를 유지했어요",
          });
        }
        await syncDashboard();
        if (isMealApiWorkspaceConflictError(reason)) {
          setToast(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        } else if (persistenceFailure) {
          return;
        } else {
          setToast("상품 정보 저장에 실패해 기존 정보를 유지했어요");
        }
      });
  };

  const addManualFood = (food: FoodItem) => {
    if (pendingManualFoodMutationKeysRef.current.has(food.id)) return;
    const isLotCorrection = food.lotAction === "correct";
    const correctionTarget = isLotCorrection && food.targetFoodId
      ? foods.find((existingFood) => existingFood.id === food.targetFoodId)
      : undefined;
    const normalizeManualFoodName = (value: string) => value.trim().replace(/\s+/g, " ");
    if (!mealApi.isConfigured && isLotCorrection && (!correctionTarget || normalizeManualFoodName(correctionTarget.name) !== normalizeManualFoodName(food.name))) {
      setToast("기존 식품을 찾지 못해 날짜를 반영하지 않았어요. 최신 목록을 확인해 주세요.");
      return;
    }
    pendingManualFoodMutationKeysRef.current.add(food.id);
    if (!isLotCorrection) queueAddedFoodFocus(food.name);
    if (sheet === "add") changeSheet(null);
    setToastAction(null);
    const followUpLabel = isLotCorrection ? null : addedFoodFollowUpLabel(food);
    const reviewAddedFood = (foodId: string) => {
      pendingAddedFoodFocusRef.current = null;
      const addedFood = findFoodById(foodId) ?? (food.id === foodId ? food : null);
      if (addedFood) {
        openDetail(addedFood, "home", "date-review");
      } else {
        openInventory();
        setToast(`${food.name}을 식품 목록에서 확인해 주세요`);
      }
    };
    if (!mealApi.isConfigured) {
      mergeFoods([food]);
      if (isLotCorrection) {
        setToast(`${food.name}의 날짜를 기존 기록에 저장했어요`);
        pendingManualFoodMutationKeysRef.current.delete(food.id);
        return;
      }
      if (followUpLabel) {
        setToastAction({ message: `${withKoreanObjectParticle(food.name)} 식품 목록에 추가했어요`, label: followUpLabel, onInvoke: () => reviewAddedFood(food.id) });
      }
      setToast(`${withKoreanObjectParticle(food.name)} 식품 목록에 추가했어요`);
      pendingManualFoodMutationKeysRef.current.delete(food.id);
      return;
    }
    setToast(isLotCorrection ? `${food.name}의 날짜를 기존 기록에 저장하는 중이에요` : `${withKoreanObjectParticle(food.name)} 서버에 추가하는 중이에요`);
    let authoritativeFoodId = food.id;
    const dateKind = food.dateKind === "actual_printed"
      ? food.dateAssertionKind ?? "use_by"
      : food.dateKind === "user_confirmed" ? "user_reminder" : "unknown";
    const targetFoodId = food.lotAction === "correct" ? food.targetFoodId : undefined;
    void runAuthoritativeMutation({
      operation: "manual-food",
      mutate: () => mealApi.createManualFood({
        canonical_name: food.name,
        lot_action: food.lotAction ?? "create",
        ...(targetFoodId ? { target_food_id: targetFoodId } : {}),
        idempotencyKey: `manual-food:${food.id}`,
        quantity: Number.parseFloat(food.quantity) || 1,
        unit: food.quantity.replace(/[\d.\s]/g, "") || "개",
        storage_type: storageToApi(food.storage),
        category: food.category,
        note: food.note,
        brand: food.brand,
        image_path: food.image,
        date_kind: dateKind,
        date_value: dateValueForFood(food),
        date_source: food.dateKind === "actual_printed" ? food.dateSource.split(":")[0] : food.dateKind === "user_confirmed" ? "user_input" : "unknown",
        date_source_detail: food.dateSource,
        applicable_storage_type: food.dateStorageHint,
        storage_condition_text: food.dateStorageConditionText,
        storage_location_id: food.storageLocationId,
        barcode: food.barcode,
        barcode_lot: food.barcodeLot,
        product_provenance: food.productProvenance ? {
          source: food.productProvenance.source,
          source_url: food.productProvenance.sourceUrl ?? null,
          confidence: food.productProvenance.confidence,
          note: food.productProvenance.note,
          storage_hint: food.productProvenance.storageHint ?? null,
          source_freshness: food.productProvenance.sourceFreshness,
        } : undefined,
        user_confirmed: food.dateKind === "actual_printed" || food.dateKind === "user_confirmed",
      }),
      apply: (updatedApiFood) => {
        authoritativeFoodId = updatedApiFood.id;
        const updatedReadModel = mapApiFood(updatedApiFood, storageLocations);
        setFoods((current) => {
          const existingIndex = current.findIndex((item) => item.id === updatedReadModel.id);
          const next = existingIndex >= 0
            ? current.map((item) => item.id === updatedReadModel.id ? updatedReadModel : item)
            : [updatedReadModel, ...current];
          return next.map((item, index) => ({ ...item, priority: index + 1 }));
        });
      },
      // Label correction can complete while the initial dashboard request is
      // still settling. Keep the notification read model explicit at this
      // mutation boundary instead of relying only on dashboard coalescing.
      sync: async () => {
        const synced = await syncDashboard();
        await refreshNotifications();
        return synced;
      },
    })
      .then(({ synced }) => {
        const addedFoodMessage = isLotCorrection
          ? `${food.name}의 날짜를 기존 기록에 저장했어요`
          : `${withKoreanObjectParticle(food.name)} 식품 목록에 추가했어요`;
        const finalAddedFoodMessage = withServerReadbackNotice(addedFoodMessage, synced);
        if (!synced) {
          setToastAction({
            message: finalAddedFoodMessage,
            label: "최신 목록 확인",
            onInvoke: () => {
              void syncDashboard().then((latestSynced) => {
                setToast(latestSynced ? "최신 목록을 확인했어요" : "최신 목록을 아직 불러오지 못했어요");
              });
            },
          });
        } else if (followUpLabel) {
          setToastAction({ message: finalAddedFoodMessage, label: followUpLabel, onInvoke: () => reviewAddedFood(authoritativeFoodId) });
        } else {
          setToastAction(null);
        }
        setToast(finalAddedFoodMessage);
      })
      .catch(async (reason) => {
        await syncDashboard();
        if (isLotCorrection && isMealApiFoodLotTargetMissingError(reason)) {
          const message = "선택한 식품 기록을 찾지 못해 날짜를 저장하지 않았어요. 식품 목록을 다시 확인해 주세요.";
          setToastAction({ message, label: "식품 목록 보기", onInvoke: () => openInventory(food.name, true) });
          setToast(message);
          return;
        }
        const message = isMealApiAuthError(reason)
          ? "로그인이 만료됐어요. 다시 로그인해 주세요"
          : isMealApiWorkspaceConflictError(reason)
            ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
            : isMealApiFoodLotSelectionError(reason)
              ? "같은 상품의 식품 기록이 여러 개라 날짜를 자동으로 바꾸지 않았어요. 식품 목록에서 해당 기록을 열어 확인해 주세요"
            : isMealApiFoodDateConfirmedError(reason)
                ? "이미 확인된 날짜가 있어 기존 기록을 유지했어요"
                : isMealApiManualFoodPersistenceError(reason)
                  ? isLotCorrection ? "날짜를 저장하지 못했어요. 기존 식품 기록을 유지했어요" : "식품을 저장하지 못했어요. 기존 목록을 유지했어요"
                : "서버 추가에 실패했어요. 기존 목록을 유지합니다";
        if (isMealApiAuthError(reason) || isMealApiWorkspaceConflictError(reason) || isMealApiFoodLotSelectionError(reason) || isMealApiFoodDateConfirmedError(reason)) setToast(message);
        else showRetryToast(message, () => addManualFood(food));
      })
      .finally(() => pendingManualFoodMutationKeysRef.current.delete(food.id));
  };

  const addReceiptFoods = ({ lines, draftId, sourceFilename }: ReceiptCommitPayload) => {
    const preparedLines = lines.map(prepareReceiptLine).filter((line): line is PreparedReceiptLine => line !== null);
    if (preparedLines.length !== lines.length) {
      setToast("상품명·수량·단위를 확인한 뒤 반영해 주세요");
      return;
    }
    const receiptCommitKey = draftId ?? `${sourceFilename || "sample-receipt.jpg"}:${lines.map((line) => line.backendId ?? line.name).join("|")}`;
    if (pendingReceiptCommitKeysRef.current.has(receiptCommitKey)) return;
    pendingReceiptCommitKeysRef.current.add(receiptCommitKey);
    const lineFoods = preparedLines.map(({ line, canonicalName, quantity, unit, storage, storageLocationId }) => createFood({
      name: canonicalName,
      brand: "",
      purchaseSource: "receipt",
      quantity: `${formatReceiptAmount(quantity)}${unit}`,
      storage,
      storageLocationId: storageLocationId ?? undefined,
      storageLocationName: storageLocationId ? storageLocations.find((location) => location.id === storageLocationId)?.name : undefined,
      dateLabel: "날짜 미확인",
      dateDetail: "영수증에는 소비기한이 없어요",
      dateKind: "unknown",
      dateSource: "영수증 + 상품 유형",
      image: line.image,
      category: canonicalName.includes("두부") ? "두부·콩" : "채소",
      confidence: line.confidence,
      barcode: line.barcode ?? undefined,
      note: "",
    }));
    queueAddedFoodFocus(lineFoods[0]?.name ?? "");
    changeSheet(null);
    if (!mealApi.isConfigured) {
      mergeFoods(lineFoods);
      const message = `${lines.length}개 항목을 검토 후 반영했어요`;
      setToastAction(null);
      setToast(message);
      pendingReceiptCommitKeysRef.current.delete(receiptCommitKey);
      return;
    }
    setToastAction(null);
    setToast(`${lines.length}개 항목을 서버에 반영하는 중이에요`);
    {
      const apiLines = preparedLines.map(({ line, canonicalName, quantity, unit }) => ({
        raw_name: line.rawName ?? line.name,
        quantity,
        unit,
        barcode: line.barcode ?? null,
        total_price: line.totalPrice,
        line_type: "product" as const,
        canonical_name: canonicalName,
        match_confidence: line.confidence,
        match_source: line.matchSource,
      }));
      const selectedBackendLineIds = preparedLines.map(({ line }) => line.backendId).filter((id): id is string => Boolean(id));
      const overrides = Object.fromEntries(preparedLines.map(({ line, canonicalName, quantity, unit, storage, storageLocationId }, index) => [
        line.backendId ?? `line-${index + 1}`,
        { canonical_name: canonicalName, quantity, unit, storage_type: storageToApi(storage), storage_location_id: storageLocationId, match_source: line.matchSource, match_candidates: line.matchCandidates, barcode: line.barcode ?? null },
      ]));
      const draftPayload = {
        source_filename: sourceFilename || "sample-receipt.jpg",
        purchased_at: new Date().toISOString(),
        lines: apiLines,
      };
      const commitIdempotencyKey = createReceiptCommitIdempotencyKey();
      let createdDraft: ApiReceiptDraft | null = null;
      let commitLineIds = selectedBackendLineIds;
      let commitOverrides = overrides;
      const commitDraft = async () => {
        const targetDraftId = draftId ?? createdDraft?.id;
        if (targetDraftId) {
          return mealApi.commitReceipt(targetDraftId, commitLineIds, commitOverrides, commitIdempotencyKey);
        }
        const draft = await mealApi.createReceiptDraft(draftPayload);
        if (!draft) throw new Error("receipt-draft-failed");
        createdDraft = draft;
        commitLineIds = draft.lines.map((line) => line.id);
        commitOverrides = Object.fromEntries(draft.lines.map((line, index) => [line.id, {
          canonical_name: line.canonical_name ?? line.raw_name,
          quantity: line.quantity,
          unit: line.unit,
          storage_type: storageToApi(preparedLines[index]?.storage ?? "냉장"),
          storage_location_id: preparedLines[index]?.storageLocationId ?? null,
          match_source: line.match_source,
          match_candidates: line.match_candidates,
          barcode: line.barcode,
        }]));
        return mealApi.commitReceipt(draft.id, commitLineIds, commitOverrides, commitIdempotencyKey);
      };
      const persistAndSync = () => {
        return runAuthoritativeMutation({
          operation: "receipt-commit",
          mutate: commitDraft,
          apply: (commit) => {
            const updatedFoods = commit.inventory.map((food) => mapApiFood(food, storageLocations));
            setFoods(updatedFoods.map((food, index) => ({ ...food, priority: index + 1 })));
          },
          sync: syncDashboard,
        })
          .then(({ value: commit, synced }) => {
            const updatedFoods = commit.inventory.map((food) => mapApiFood(food, storageLocations));
            const idempotencyReplayed = commit.idempotency_replayed === true;
            const receiptCommitMessage = idempotencyReplayed
              ? `${lines.length}개 항목은 이미 반영되어 최신 목록을 확인했어요`
              : withGrocySyncNotice(`${lines.length}개 항목을 검토 후 반영했어요`, commit.grocy_sync_status);
            const finalReceiptMessage = withServerReadbackNotice(receiptCommitMessage, synced);
            if (!idempotencyReplayed && needsExternalSyncAttention(commit.grocy_sync_status)) {
              setToastAction({ message: finalReceiptMessage, label: "재고 앱 설정 보기", onInvoke: () => changeSheet("account") });
            } else {
              const nextDateReviewFood = updatedFoods
                .filter((food) => food.dateKind === "unknown")
                .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name, "ko") || left.id.localeCompare(right.id))[0];
              setToastAction(nextDateReviewFood ? { message: finalReceiptMessage, label: "식품 정보 보기", onInvoke: () => openDetail(nextDateReviewFood, "inventory", "date-review") } : null);
            }
            setToast(finalReceiptMessage);
          })
          .catch(async (reason) => {
            await syncDashboard();
            const message = isMealApiAuthError(reason)
              ? "로그인이 만료됐어요. 다시 로그인해 주세요"
              : isMealApiWorkspaceConflictError(reason)
                ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
                : isMealApiConflictError(reason)
                  ? "이미 반영된 영수증이에요. 기존 목록을 유지했어요"
                  : isMealApiReceiptCommitPersistenceError(reason)
                    ? "영수증 반영을 저장하지 못했어요. 기존 목록을 유지했어요"
                    : "영수증 서버 반영에 실패해 기존 목록을 유지합니다";
            if (isMealApiAuthError(reason) || isMealApiWorkspaceConflictError(reason) || isMealApiConflictError(reason)) {
              setToast(message);
            } else {
              showRetryToast(message, persistAndSync);
            }
          })
          .finally(() => pendingReceiptCommitKeysRef.current.delete(receiptCommitKey));
      };
      persistAndSync();
    }
  };

  const detailSheetSnap = Math.min(0.993, Math.max(0.78, (viewportHeight - 6) / Math.max(1, viewportHeight)));
  const homeAddFoodAction = foods.length ? <button className="add-food-button" style={!IS_WEB_SURFACE ? { marginTop: 0, minHeight: 53, gap: 4, justifyContent: "center", padding: "0 8px", border: "1px solid var(--atelier-border-strong)", borderRadius: 13, background: "color-mix(in srgb, var(--atelier-surface) 82%, transparent)", textAlign: "center" } : undefined} type="button" aria-label="식품 추가하기" onClick={() => openAdd("receipt")}>
    <span className="add-food-plus"><PlusIcon width={20} height={20} /></span>
    <span><strong><span className="add-food-label-prefix">식품 </span>추가</strong><small>영수증·바코드·라벨·직접 입력</small></span>
    <ArrowRightIcon width={18} height={18} />
  </button> : null;

  return (
    <MotionConfig reducedMotion="user">
    <>
      <MobileScroll className={`app-screen rescue-theme-${themeMode}`}>
        <main className={`screen-content meal-home${inventoryDataUnknown ? " meal-home-data-unknown" : ""}`} aria-label="Rescue Meal 홈">
          <header className="app-header">
            <div className="brand-lockup" role="img" aria-label="Rescue Meal">
              <span className="brand-mark" aria-hidden="true">r</span>
              <span className="brand-name" aria-hidden="true">rescue meal</span>
            </div>
            <div className="header-actions">
              <ConnectionStatus state={connectionState} hasCachedData={Boolean(dashboardStaleAt)} cachedAtLabel={dashboardStaleAt ? formatDashboardCacheAge(dashboardStaleAt, currentDate) : undefined} cachedAtFreshness={dashboardStaleAt ? dashboardCacheFreshness(dashboardStaleAt, currentDate) : undefined} onOpenAccount={() => changeSheet("account")} />
              <button
                className="icon-button theme-toggle-button"
                type="button"
                data-testid="theme-toggle"
                aria-label={themeMode === "light" ? "현재 라이트모드, 다크모드로 전환" : "현재 다크모드, 라이트모드로 전환"}
                aria-pressed={themeMode === "dark"}
                title={themeMode === "light" ? "현재 라이트모드 · 다크모드로 전환" : "현재 다크모드 · 라이트모드로 전환"}
                onClick={toggleTheme}
              >
                {themeMode === "light" ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
              </button>
              <button className={`notification-button ${IS_WEB_SURFACE ? "web-header-notification" : "mobile-hero-notification"}`} type="button" onClick={() => openNotifications()} aria-label={notificationTriggerLabel}>
                <BellIcon width={18} height={18} />
                {unreadNotificationCount && !notificationDataUnavailable ? <span className={`notification-dot notification-dot-${unreadNotificationTone}`} style={{ background: unreadNotificationDotColor }} aria-hidden="true">{unreadNotificationBadge}</span> : null}
              </button>
            </div>
          </header>

          {connectionState === "checking" && !foods.length ? (
            <div className="service-bootstrap-status" role="status" aria-live="polite">
              <span className="service-bootstrap-dot" aria-hidden="true" />
              <span><strong>기록을 불러오고 있어요</strong><small>보관 중인 식품과 먼저 살펴볼 재료를 확인하고 있어요.</small></span>
            </div>
          ) : null}

          {connectionState === "auth_required" ? (
            <div className="session-expired-callout" role="alert">
              <InfoCircledIcon width={17} height={17} />
              <span><strong>계정 연결이 만료됐어요</strong><small>기록을 안전하게 이어가려면 다시 로그인해 주세요. 다른 기록 공간으로 자동 전환하지 않았어요.</small></span>
              <button type="button" onClick={() => changeSheet("account")}>다시 로그인</button>
            </div>
          ) : null}
          {connectionState === "offline" ? (
            <div className="connection-retry-callout" role="alert">
              <InfoCircledIcon width={17} height={17} />
              <span><strong>{demoOfflineFixturePreview ? "예시 식품 미리보기" : "인터넷에 연결되지 않았어요"}</strong><small>{demoOfflineFixturePreview ? "실제 기록은 불러오지 못했어요. 연결하면 최신 재고를 확인할 수 있어요." : dashboardStaleAt ? `마지막으로 불러온 식품(${formatDashboardCacheTime(dashboardStaleAt)})을 보여드려요. 기록은 지금 수정할 수 없어요.` : "식품 목록을 불러오지 못했어요."}</small></span>
            </div>
          ) : null}
          {connectionState === "connected" && receiptSummariesStatus === "ready" && latestPendingReceipt ? (
            <button className="receipt-review-entry-card" type="button" data-testid="pending-receipt-review" onClick={() => pendingReceiptSummaries.length > 1 ? changeSheet("receipt-queue") : openAdd("receipt", latestPendingReceipt.id)}>
              <span className="receipt-review-entry-icon"><ReaderIcon width={17} height={17} /></span>
              <span className="receipt-review-entry-copy">
                <span className="receipt-review-entry-kicker">영수증</span>
                <strong>살펴볼 영수증 {pendingReceiptSummaries.length > 1 ? `${pendingReceiptSummaries.length}개` : "1개"}</strong>
                <small>{latestPendingReceipt.merchant_name ? `${latestPendingReceipt.merchant_name} · ` : "저장된 영수증 · "}{formatPurchasedAt(latestPendingReceipt.purchased_at) ?? "구매일 미등록"} · 상품 {latestPendingReceipt.line_count}개</small>
              </span>
              <span className="receipt-review-entry-action">{pendingReceiptSummaries.length > 1 ? "모두 보기" : "이어서 살펴보기"} <ChevronRightIcon width={15} height={15} /></span>
            </button>
          ) : null}

          <div className="home-hero-copy">
            <section className="greeting-block" aria-labelledby="greeting-title">
              <div>
                <p className="eyebrow">{todayEyebrow}</p>
                <h1 id="greeting-title">냉장고에<br /><em>뭐가 남았지?</em></h1>
                <p className="hero-description">있는 재료로 오늘 한 끼를 준비해요.</p>
              </div>
            </section>

            <section className="mini-summary" aria-label="냉장고 요약">
              <div className="summary-item">
                <ArchiveIcon width={17} height={17} />
                <span><strong>{inventoryDataUnknown ? "—" : `${foods.length}개`}</strong> {inventoryDataUnknown ? "식품 목록을 볼 수 없어요" : "보관 중"}</span>
              </div>
              <div className="summary-divider" />
              <div className="summary-item">
                <LightningBoltIcon width={17} height={17} />
                <span><strong>{inventoryDataUnknown ? "—" : `${priorityFoods.length}개`}</strong> {inventoryDataUnknown ? "식품 목록을 볼 수 없어요" : "먼저 살펴볼 식품"}</span>
              </div>
            </section>
          </div>

          <section className="priority-section" aria-labelledby="priority-title">
            <div className="section-heading">
              <div>
                <h2 id="priority-title" aria-label={priorityHeadingAccessibleName}>
                  {inventoryDataUnknown ? inventoryDataStatusLabel : "먼저 살펴볼 식품"}
                  <span>{inventoryDataUnknown ? "" : `${priorityFoods.length}개`}</span>
                </h2>
              </div>
              <button className="text-button" type="button" disabled={inventoryDataUnknown && connectionState === "checking"} onClick={() => inventoryDataUnknown ? connectionState === "auth_required" ? changeSheet("account") : retryConnection() : openInventory()}>
                {inventoryDataUnknown ? connectionState === "auth_required" ? "다시 로그인" : "다시 연결" : <><MagnifyingGlassIcon width={14} height={14} aria-hidden="true" /><span>식품 찾기</span></>}
                <ChevronRightIcon width={14} height={14} aria-hidden="true" />
              </button>
            </div>

            <div className="priority-list">
              {priorityFoods.length ? <div className="priority-list-items">
                <span id="priority-card-action-hint" className="sr-only">날짜와 보관 방법을 더 살펴보려면 식품을 열어 주세요.</span>
                {priorityFoods.map((food) => {
                  const reviewReason = attentionReviewReason(food, currentDate);
                  return (
                    <button
                      key={food.id}
                      className={`priority-card ${food.priority === 1 ? "priority-card-accent" : ""}`}
                      type="button"
                      data-priority-food-id={food.id}
                      data-priority-state={reviewReason ? "needs-review" : "use-next"}
                      aria-describedby="priority-card-action-hint"
                      onClick={() => openDetail(food, "home")}
                    >
                      <div className="food-image-wrap">
                        <img src={food.image} alt="" className="food-image" draggable={false} />
                      </div>
                      <span className="priority-copy">
                        <span className="food-name-line">
                          <strong>{food.name}</strong>
                          {food.opened ? <span className="opened-dot" title="개봉됨" /> : null}
                        </span>
                        <span className="food-subline">{foodSourceSummary(food)} · {food.quantity}</span>
                        <span className="food-meta-line">
                          <span className={`storage-pill ${getStorageClass(food.storage)}`}>{food.storageLocationName ?? food.storage}</span>
                          <span className="date-source">{getDateBadge(food)}</span>
                        </span>
                      </span>
                      <span className="priority-date">
                        <small
                          className={`priority-state-label ${reviewReason ? "priority-state-review" : "priority-state-action"}`}
                          title={reviewReason ?? (food.dateKind === "estimated_use_first" ? "소비기한이 아닌 먼저 살펴볼 시점이에요" : "날짜와 보관 방법을 살펴본 뒤 사용해요")}
                        >{priorityActionLabel(food, reviewReason)}</small>
                        <strong>{food.dateLabel}</strong>
                        <ChevronRightIcon width={14} height={14} />
                      </span>
                    </button>
                  );
                })}
              </div> : <div className={`priority-empty-state${inventoryDataUnknown ? " priority-unknown-state" : ""}`}>
                <span className="priority-empty-icon"><ArchiveIcon width={19} height={19} /></span>
                <span className="priority-empty-copy">
                  <strong>{inventoryDataUnknown ? priorityDataStatusLabel : foods.length ? "오늘 먼저 살펴볼 식품이 없어요" : "아직 식품을 등록하지 않았어요"}</strong>
                  <small>{inventoryDataUnknown ? priorityDataStatusDescription : foods.length ? "포장지 날짜와 보관 방법을 살펴봐 주세요." : "영수증·바코드·라벨 중 편한 방법으로 추가해 보세요."}</small>
                </span>
              </div>}
            </div>

            <div className={`home-action-row${foods.length ? " home-action-row-with-add" : ""}`}>
              <button className="meal-plan-button" type="button" disabled={inventoryDataUnknown && connectionState === "checking"} onClick={() => inventoryDataUnknown ? connectionState === "auth_required" ? changeSheet("account") : retryConnection() : connectionState === "auth_required" ? changeSheet("account") : connectionState === "offline" ? retryConnection() : foods.length ? openMealPlan() : openAdd("receipt")}>
                <span className="meal-plan-icon">{connectionState === "offline" ? <ReloadIcon width={17} height={17} /> : <LightningBoltIcon width={17} height={17} />}</span>
                <span><strong>{inventoryDataUnknown ? connectionState === "auth_required" ? "다시 로그인하기" : connectionState === "checking" ? "기록을 불러오는 중" : "다시 연결하기" : connectionState === "auth_required" ? "다시 로그인하기" : connectionState === "offline" ? "최신 재고 불러오기" : foods.length ? "오늘 식단 만들기" : "식품 추가하기"}</strong><small>{inventoryDataUnknown ? mealPlanStatusDescription : connectionState === "auth_required" ? "기록을 이어서 볼 수 있어요." : connectionState === "offline" ? mealPlanStatusDescription : currentMealPlanHint}</small></span>
                <ArrowRightIcon width={18} height={18} />
              </button>
              {homeAddFoodAction}
            </div>

            {showHomeSyncSummary ? (
              <button className="shopping-summary-card" type="button" aria-label={homeSyncSummaryAccessibleName} data-sync-focus={homeSyncFocus} data-sync-state={homeSyncFocus} data-sync-attention-count={homeSyncAttentionCount} data-sync-queued-count={homeSyncQueuedCount} data-sync-processing-count={homeSyncProcessingCount} onClick={() => openNotifications(homeSyncFocus)}>
                <span className="shopping-summary-icon"><SewingPinIcon width={17} height={17} /></span>
                <span className="shopping-summary-copy">
                  <span className="shopping-summary-kicker">재고 앱</span>
                  <strong>{externalSyncHomeTitle(homeSyncAttentionCount, homeSyncProcessingCount)}</strong>
                  <small>{[homeSyncAttentionCount ? `살펴볼 항목 ${homeSyncAttentionCount}개` : "", homeSyncQueuedCount ? `추가 대기 ${homeSyncQueuedCount}개` : "", homeSyncProcessingCount ? `추가 중 ${homeSyncProcessingCount}개` : ""].filter(Boolean).join(" · ")} · 알림에서 보기</small>
                </span>
                <ChevronRightIcon width={16} height={16} />
              </button>
            ) : null}

          </section>

          <button
            className="trust-card"
            data-trust-state={inventoryNeedsReviewCount ? "needs-review" : "neutral"}
            aria-label={`${homeTrustTitle}. ${homeTrustDescription} ${inventoryNeedsReviewCount ? "확인할 식품 목록 보기" : "날짜 안내 보기"}`}
            style={!IS_WEB_SURFACE ? { marginTop: 9 } : undefined}
            type="button"
            onClick={() => inventoryNeedsReviewCount ? openNeedsReviewInventory() : openGuidanceSheet()}
          >
            <span className="trust-icon"><InfoCircledIcon width={18} height={18} /></span>
            <span><strong style={inventoryNeedsReviewCount ? { color: "var(--atelier-coral)" } : undefined}>{homeTrustTitle}</strong><small>{homeTrustDescription}</small></span>
            <ChevronRightIcon width={16} height={16} />
          </button>

          {showShoppingSummary ? (
            <button className={`shopping-summary-card${shoppingSummaryIsEmpty ? " shopping-summary-card-empty" : ""}`} type="button" aria-label={shoppingSummaryIsEmpty ? `장보기 목록 열기. ${shoppingSummaryTitle}` : undefined} aria-describedby={shoppingSummaryIsEmpty ? "shopping-summary-empty-help" : undefined} onClick={openShoppingList}>
              <span className="shopping-summary-icon"><ReaderIcon width={17} height={17} /></span>
              <span className="shopping-summary-copy">
                <span className="shopping-summary-kicker">장보기</span>
                <strong>{shoppingSummaryTitle}</strong>
                <small id={shoppingSummaryIsEmpty ? "shopping-summary-empty-help" : undefined} className={shoppingSummaryIsEmpty ? "shopping-summary-empty-help" : undefined}>{shoppingSummaryDescription}</small>
              </span>
              <ChevronRightIcon width={16} height={16} />
            </button>
          ) : null}

          <section className={`inventory-section${inventoryHasEmptyResult || inventoryDataUnknown ? " inventory-section-empty-result" : ""}${inventoryDataUnknown ? " inventory-section-unknown" : ""}`} aria-labelledby="inventory-title" aria-busy={inventorySearchPending}>
            <div className="inventory-toolbar">
              <div className="section-heading inventory-heading">
                <div className="inventory-heading-copy">
                  <p className="section-kicker">내 식품 목록</p>
                  <h2 id="inventory-title" aria-label={inventoryDataUnknown ? "내 식품 목록을 불러오지 못했어요" : `내 식품 목록 ${inventoryCount}`}>내 식품 목록 <span>{inventoryDataUnknown ? "—" : inventoryCount}</span></h2>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
                  <button className="icon-button inventory-add-button" style={{ display: "inline-flex", width: 62, height: 44, gap: 4, alignItems: "center", justifyContent: "center", padding: "0 6px", borderRadius: 11, whiteSpace: "nowrap" }} type="button" aria-label="식품 목록에 추가" title="식품 목록에 추가" onClick={() => openAdd("receipt")}>
                    <PlusIcon width={16} height={16} aria-hidden="true" />
                    <span>추가</span>
                  </button>
                  <label className="filter-select-wrap">
                    <span className="sr-only">보관 위치 필터</span>
                    <select value={storageFilter} onChange={(event) => {
                      setStorageFilter(event.target.value as InventoryStorageFilter);
                      if (activeContentNavRef.current === "food") restoreContentNavigation("food");
                    }}>
                      <option value="전체">보관위치 전체</option>
                      <option value="냉장">냉장만</option>
                      <option value="냉동">냉동만</option>
                      <option value="실온">실온만</option>
                      {customStorageLocations.length ? <optgroup label="내 보관 위치">{customStorageLocations.map((location) => <option key={location.id} value={`location:${location.id}`}>{location.name}만</option>)}</optgroup> : null}
                    </select>
                    <ChevronDownIcon width={13} height={13} />
                  </label>
                </div>
              </div>
              <label className="inventory-search">
                <MagnifyingGlassIcon width={15} height={15} aria-hidden="true" />
                <KeyboardInput className="inventory-search-input" type="search" value={inventoryQuery} placeholder="식품·브랜드·카테고리 검색" aria-label="식품·브랜드·카테고리 검색" onChange={(event) => setInventoryQuery(event.target.value)} onFocus={() => { inventorySearchFocusRef.current = true; window.requestAnimationFrame(keepInventorySearchVisible); }} onBlur={() => { inventorySearchFocusRef.current = false; keyboard.hide(); }} />
                {hasInventoryQuery ? <button type="button" aria-label="식품 검색어 지우기" onPointerDown={(event) => event.preventDefault()} onClick={clearInventorySearch}><Cross2Icon width={14} height={14} /></button> : null}
              </label>
              <div className="inventory-status-filters" role="group" aria-label={`식품 상태 필터${inventoryScopeIsStale ? " · 이전 결과" : ""}`} data-scope-state={inventoryScopeIsStale ? "stale" : inventorySearchPending ? "loading" : "current"} aria-busy={inventorySearchPending}>
                <button className={inventoryStatusFilter === "all" ? "inventory-status-filter-active" : ""} type="button" aria-pressed={inventoryStatusFilter === "all"} aria-controls="inventory-list" onClick={() => { setInventoryStatusFilter("all"); if (activeContentNavRef.current === "food") restoreContentNavigation("food"); }}>전체 <span>{inventoryScopeFoods.length}</span></button>
                <button className={inventoryStatusFilter === "needs-review" ? "inventory-status-filter-active inventory-status-filter-warning" : "inventory-status-filter-warning"} type="button" aria-pressed={inventoryStatusFilter === "needs-review"} aria-controls="inventory-list" onClick={() => { setInventoryStatusFilter("needs-review"); if (activeContentNavRef.current === "food") restoreContentNavigation("food"); }}>날짜·보관 확인 <span>{inventoryScopedNeedsReviewCount}</span></button>
                <button className={inventoryStatusFilter === "priority" ? "inventory-status-filter-active inventory-status-filter-priority" : "inventory-status-filter-priority"} type="button" aria-pressed={inventoryStatusFilter === "priority"} aria-controls="inventory-list" onClick={() => { setInventoryStatusFilter("priority"); if (activeContentNavRef.current === "food") restoreContentNavigation("food"); }}>먼저 살펴보기 <span>{inventoryScopedPriorityCount}</span></button>
              </div>
              {showInventoryScope ? <div className="inventory-filter-summary" role="status" aria-live="polite">
                <span><i aria-hidden="true" />{inventoryScopeLabel} · {inventoryCount}개</span>
                <button type="button" onClick={clearInventoryFilters}>검색·필터 초기화</button>
              </div> : !inventoryDataUnknown && !hasInventoryQuery && storageFilter === "전체" && inventoryNeedsReviewCount ? <div className="inventory-filter-summary inventory-health-summary">
                <span><i aria-hidden="true" />날짜·보관을 살펴볼 식품 {inventoryNeedsReviewCount}개</span>
                <span>포장지 날짜와 보관 방법을 살펴봐 주세요</span>
              </div> : null}
            </div>

            {inventorySearchActive && inventorySearchPending && !filteredFoods.length ? <div className="inventory-search-state inventory-search-loading" role="status"><span className="inventory-search-loading-icon" aria-hidden="true"><MagnifyingGlassIcon width={16} height={16} /></span><span>{inventorySearchLoadingLabel}</span></div> : inventorySearchActive && inventorySearchStatus === "error" && !filteredFoods.length ? <div className="inventory-search-state inventory-search-error" role="alert"><span><strong>{inventorySearchErrorLabel}</strong><small>{inventorySearchError || "잠시 후 다시 시도해 주세요."}</small></span><button type="button" onClick={retryInventorySearch}>다시 시도</button></div> : filteredFoods.length ? <>
              {inventorySearchActive && inventorySearchStatus === "error" ? <div className="inventory-search-inline-error" role="alert"><span>{inventorySearchError || "더 많은 재고를 불러오지 못했어요."}</span><button type="button" onClick={retryInventorySearch}>다시 시도</button></div> : null}
            <div className="inventory-list" id="inventory-list">
              {filteredFoods.map((food) => {
                const reviewReason = attentionReviewReason(food, currentDate);
                const dateOriginLabel = getInventoryDateOriginLabel(food);
                const reviewDetail = reviewReason
                      ? food.dateKind === "unknown"
                        ? reviewReason
                        : `${reviewReason} · ${food.dateLabel}`
                  : null;

                return (
                  <button className="inventory-row" type="button" key={food.id} data-inventory-food-id={food.id} data-date-state={food.dateKind} onClick={() => openDetail(food, "inventory")}>
                    <div className="inventory-image-wrap"><img src={food.image} alt="" className="inventory-image" draggable={false} /></div>
                    <span className="inventory-copy">
                      <strong>{food.name}</strong>
                      <small>{foodSourceSummary(food)} · {food.quantity}{food.storageLocationName ? ` · ${food.storageLocationName}` : ""}</small>
                      <small className="inventory-storage-meta"><span className={`storage-dot ${getStorageClass(food.storage)}`} aria-hidden="true" /><span>{food.storage}{dateOriginLabel ? ` · ${dateOriginLabel}` : ""}</span></small>
                    </span>
                    <span className={`inventory-status ${reviewReason ? "inventory-status-warning" : ""}`} data-inventory-status={reviewReason ? "needs-review" : food.priority <= 3 ? "priority" : "stored"}>
                      <span className={`storage-dot ${reviewReason ? "status-dot-warning" : getStorageClass(food.storage)}`} aria-hidden="true" />
                      <span className="inventory-status-content">
                        <span className="inventory-status-label">{reviewReason ? reviewReason === "보관 방법 확인" ? "보관 확인" : "날짜 확인" : food.priority <= 3 ? <><b>먼저 살펴보기</b><span> · </span>{food.dateLabel}</> : food.dateLabel}</span>
                        {reviewDetail ? <small className="inventory-review-detail">{reviewDetail}</small> : null}
                      </span>
                    </span>
                    <ChevronRightIcon className="row-chevron" width={15} height={15} />
                  </button>
                );
              })}
            </div>
            {inventorySearchOwnsResults && inventorySearchHasMore ? <button className="inventory-load-more" type="button" disabled={inventorySearchPending} aria-busy={inventorySearchPending} onClick={loadMoreInventory}>{inventorySearchPending ? "더 불러오는 중" : `더 보기 · ${Math.max(0, (inventorySearchTotal ?? 0) - filteredFoods.length)}개 남음`}</button> : null}
            </> : <div className={`inventory-empty-state${inventoryDataUnknown ? " inventory-unknown-state" : ""}`}>
              <span className="inventory-empty-icon"><ArchiveIcon width={18} height={18} /></span>
              <span className="inventory-empty-copy">
                <strong>{inventoryDataUnknown ? inventoryListStatusLabel : hasInventoryQuery ? `“${inventoryQuery.trim()}” 검색 결과가 없어요` : inventoryStatusFilter === "needs-review" ? "날짜나 보관 방법을 살펴볼 식품이 없어요" : inventoryStatusFilter === "priority" ? "먼저 살펴볼 식품이 없어요" : foods.length ? `${selectedStorageLocation?.name ?? storageFilter} 보관 식품이 없어요` : "아직 등록된 식품이 없어요"}</strong>
                <small>{inventoryDataUnknown ? inventoryListStatusDescription : hasInventoryQuery || inventoryStatusFilter !== "all" ? "다른 상태를 선택하거나 검색·필터 조건을 초기화해 보세요." : foods.length ? "다른 보관 위치를 선택하거나 새 식품을 추가해 보세요." : "첫 식품을 기록하면 이곳에서 보관 상태와 날짜를 관리할 수 있어요."}</small>
                {inventoryDataUnknown ? <button className="inventory-empty-action" type="button" onClick={() => connectionState === "auth_required" ? changeSheet("account") : retryConnection()}>{connectionState === "auth_required" ? "계정 다시 연결" : "다시 연결"}</button> : hasInventoryQuery || inventoryStatusFilter !== "all" ? <button className="inventory-empty-action" type="button" onClick={clearInventoryFilters}>검색·필터 초기화</button> : storageFilter !== "전체" ? <button className="inventory-empty-action" type="button" onClick={() => setStorageFilter("전체")}>전체 목록 보기</button> : <button className="inventory-empty-action" type="button" onClick={() => openAdd("receipt")}>식품 추가하기</button>}
              </span>
            </div>}
          </section>

          {!inventoryDataUnknown && inventoryStatusFilter === "needs-review" && filteredFoods.length > 0 ? (
            <section className="inventory-review-guide" aria-labelledby="inventory-review-guide-title">
              <div className="inventory-review-guide-heading">
                <span className="inventory-review-guide-icon"><InfoCircledIcon width={17} height={17} aria-hidden="true" /></span>
                <h3 id="inventory-review-guide-title">식품을 살펴볼 때</h3>
                <button className="inventory-review-guide-action" type="button" aria-label="날짜와 보관 확인 방법 자세히 보기" onClick={openGuidanceSheet}>
                  자세히 <ChevronRightIcon width={14} height={14} aria-hidden="true" />
                </button>
              </div>
              <ul className="inventory-review-guide-list" aria-label="식품 확인 항목">
                <li><span>01</span><strong>포장지 날짜</strong></li>
                <li><span>02</span><strong>보관·개봉 상태</strong></li>
                <li><span>03</span><strong>냄새·색·포장 상태</strong></li>
              </ul>
              <p className="inventory-review-guide-note">앱은 먹어도 되는지 판단하지 않아요.</p>
            </section>
          ) : null}

          <InstallPrompt />
          <ServiceWorkerUpdatePrompt />

          {inventoryNavTailSpace > 0 ? <div className="inventory-nav-tail-space" aria-hidden="true" style={{ height: inventoryNavTailSpace }} /> : null}
          <p className="footer-caption"><ReaderIcon width={14} height={14} /> Rescue Meal은 기록을 돕는 생활 도구예요.</p>
          {reviewMode ? <button className="recipe-review-entry" type="button" onClick={() => changeSheet("recipe-review")}>운영자 레시피 검토 열기</button> : null}
          {receiptSourceReviewMode ? <button className="recipe-review-entry receipt-source-review-entry" type="button" onClick={() => openAdd("receipt")}>영수증 내용 다시 보기</button> : null}
        </main>
      </MobileScroll>

      <nav className="app-bottom-nav" aria-label="주요 메뉴">
        <button className={`app-bottom-nav-item${activeNav === "home" ? " app-bottom-nav-item-active" : ""}`} type="button" aria-current={activeNav === "home" ? "page" : undefined} onClick={() => navigateFromBottom("home")}>
          <HomeIcon width={19} height={19} aria-hidden="true" />
          <span>홈</span>
        </button>
        <button className={`app-bottom-nav-item${activeNav === "food" ? " app-bottom-nav-item-active" : ""}`} type="button" aria-current={activeNav === "food" ? "page" : undefined} onClick={() => navigateFromBottom("food")}>
          <ArchiveIcon width={19} height={19} aria-hidden="true" />
          <span>식품</span>
        </button>
        <button className={`app-bottom-nav-item${activeNav === "meal" ? " app-bottom-nav-item-active" : ""}`} type="button" aria-current={activeNav === "meal" ? "page" : undefined} onClick={openMealPlan}>
          <CalendarIcon width={19} height={19} aria-hidden="true" />
          <span>식단</span>
        </button>
      </nav>

      <DeferredBottomSheet
        open={sheet === "add"}
        onOpenChange={(open) => {
          if (!open) setResumeReceiptId(null);
          changeSheet(open ? "add" : null);
        }}
        title={receiptSourceReviewMode && addMode === "receipt" ? "영수증 살펴보기" : addMode === "label" && addReturnFoodContextRef.current ? "날짜 다시 살펴보기" : addMode === "receipt" ? "영수증으로 추가" : addMode === "barcode" ? "바코드로 추가" : addMode === "label" ? "라벨로 추가" : "직접 추가"}
        description={receiptSourceReviewMode && addMode === "receipt"
          ? receiptSourceUnmappedMode ? "사진에서 읽은 위치가 어느 상품인지 찾지 못했어요. 영수증을 보며 상품명과 수량을 살펴봐 주세요." : "사진에서 읽은 상품이 영수증과 맞는지 살펴봐 주세요."
          : addMode === "label" && addReturnFoodContextRef.current
            ? `${addReturnFoodContextRef.current.name}의 포장지 날짜를 확인해요. 저장 전까지 기록은 그대로예요.`
            : addMode === "label"
              ? "날짜가 보이는 포장 면을 읽어요. 날짜 종류와 보관 위치를 살펴본 뒤 식품 목록에 추가해요."
            : addMode === "receipt"
                ? "영수증에서 읽은 상품과 수량을 살펴본 뒤 식품 목록에 추가해요."
                : addMode === "barcode"
                  ? "바코드로 상품을 찾고, 맞는 상품인지 살펴봐요."
                  : "식품 이름·수량·보관 위치를 직접 입력해요."}
        snap={addReturnFoodContextRef.current ? 0.9 : 0.84}
      >
        <AddFoodSheet mode={addMode} onModeChange={setAddMode} onAddManual={addManualFood} onAddReceipt={addReceiptFoods} resumeReceiptId={resumeReceiptId} initialLabelTargetFoodId={addReturnFoodContextRef.current?.id ?? null} initialLabelTargetFoodName={addReturnFoodContextRef.current?.name ?? null} initialLabelTargetDateSummary={addReturnFoodContextRef.current?.dateSummary ?? null} sessionKey={addSheetSessionKey} receiptLines={RECEIPT_LINES} existingFoods={foods} storageLocations={storageLocations} createFood={createFood} formatApiDate={formatApiDate} storageFromApi={storageFromApi} imageForFoodName={imageForFoodName} formatReceiptLineDetail={formatReceiptLineDetail} receiptLineError={receiptLineError} reviewFixture={receiptSourceReviewMode ? receiptSourceUnmappedMode ? RECEIPT_SOURCE_UNMAPPED_FIXTURE : RECEIPT_SOURCE_REVIEW_FIXTURE : undefined} />
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "receipt-queue"}
        onOpenChange={(open) => changeSheet(open ? "receipt-queue" : null)}
        title="영수증 살펴보기"
        description="영수증에서 읽은 식품을 살펴보고 목록에 추가해요."
        snap={0.72}
      >
        <ReceiptReviewQueue receipts={pendingReceiptSummaries} notice={receiptSummariesNotice} onSelect={(receiptId) => openAdd("receipt", receiptId)} onAddReceipt={() => openAdd("receipt")} />
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "detail" && Boolean(selectedFood)}
        onOpenChange={(open) => changeSheet(open ? "detail" : null)}
        title={selectedFood?.name ?? "식품 상세"}
        description={selectedFood ? "" : "보관 방법과 포장지 날짜를 살펴봐요."}
        snap={detailSheetSnap}
      >
        {selectedFood ? (
          <Suspense fallback={<ProcessingState label="식품 상세를 준비하고 있어요" detail="보관 기록과 날짜 정보를 불러옵니다." />}>
            <FoodDetailSheet
              food={selectedFood}
              readOnly={connectionState === "offline"}
              autoFocusDateReview={detailEntryIntent === "date-review"}
              autoFocusPrimaryAction={detailEntryIntent === "consume-action"}
              autoFocusProvenanceReview={detailEntryIntent === "provenance-review"}
              focusSyncOutboxId={detailSyncFocusId}
              historyRefreshKey={detailHistoryRefreshKey}
              initialHistoryDisclosureOpen={detailHistoryDisclosureOpenRef.current}
              onHistoryDisclosureChange={updateDetailHistoryDisclosure}
              storageLocations={storageLocations}
              dateReviewReason={dateReviewReason(selectedFood, currentDate)}
              remoteRefreshRequired={detailRemoteRefreshRequired}
              onRefreshRemote={refreshDetailFromRemote}
              productInfoError={productInfoRetryAction?.foodId === selectedFood.id ? productInfoRetryAction.message : undefined}
              onRetryProductInfo={productInfoRetryAction?.foodId === selectedFood.id ? () => updateProductInfo(selectedFood.id, productInfoRetryAction.input) : undefined}
              productInfoSaving={productInfoSavingFoodId === selectedFood.id}
              productInfoNotice={productInfoNotice?.foodId === selectedFood.id ? productInfoNotice.message : undefined}
              onRefreshProductInfo={productInfoNotice?.foodId === selectedFood.id && productInfoNotice.requiresRefresh ? refreshProductInfoFromRemote : undefined}
              productProvenanceError={productProvenanceStatus?.foodId === selectedFood.id ? productProvenanceStatus.message : undefined}
              onRetryProductProvenance={productProvenanceStatus?.foodId === selectedFood.id && productProvenanceStatus.retryable ? () => removeProductProvenance(selectedFood.id) : undefined}
              productProvenanceMutating={productProvenanceMutatingFoodId === selectedFood.id}
              productProvenanceNotice={productProvenanceNotice?.foodId === selectedFood.id ? productProvenanceNotice.message : undefined}
              onRefreshProductProvenance={productProvenanceNotice?.foodId === selectedFood.id && productProvenanceNotice.requiresRefresh ? refreshProductProvenanceFromRemote : undefined}
              onSave={saveFood}
              onConsume={consumeFood}
              onDiscard={discardFood}
              onConfirmDate={confirmFoodDate}
              onRemoveProductProvenance={removeProductProvenance}
              onUpdateProductInfo={updateProductInfo}
              onShowGuidance={openGuidanceSheet}
              onOpenLabelReview={() => openAdd("label", null, "detail")}
              onOpenSyncRecord={openSyncRecordFromDetail}
              onOpenSyncNotification={openSyncNotificationFromDetail}
            />
          </Suspense>
        ) : null}
      </DeferredBottomSheet>

      {mealPlanSheetMounted ? <Suspense fallback={sheet === "meal" ? <ProcessingState label="식단 화면을 준비하고 있어요" detail="잠시만 기다려 주세요." /> : null}>
        <MealPlanSheet
          active={sheet === "meal"}
          returningFromDetail={mealDetailSessionReturnRef.current}
          plannerContextKey={JSON.stringify(foods.map(({ id, name, quantity, storage, storageLocationId, openedAt, dateDetail, dateKind, dateSource }) => [id, name, quantity, storage, storageLocationId ?? null, openedAt ?? null, dateDetail, dateKind, dateSource]))}
          onOpenChange={(open) => changeSheet(open ? "meal" : null)}
          foods={foods}
          initialMaxMinutes={mealPlanOptionsRef.current.maxMinutes}
          initialServings={mealPlanOptionsRef.current.servings}
          dateReviewFoods={mealDateReviewFoods}
          onOptionsChange={(options) => { mealPlanOptionsRef.current = options; }}
          workspaceSync={workspaceSync}
          workspaceTransport={workspaceTransport}
          onOpenFoodDetail={openFoodDetailFromMeal}
          onOpenAdd={() => openAdd("receipt")}
          onOpenSyncReview={(state) => openNotifications(state)}
          onOpenShoppingList={openShoppingList}
          onAddDemoShoppingItems={addDemoShoppingItems}
          onSaved={handleMealSaved}
          onCompleted={handleMealCompleted}
        />
      </Suspense> : null}

      <DeferredBottomSheet
        open={sheet === "shopping"}
        onOpenChange={(open) => changeSheet(open ? "shopping" : null)}
        title="장보기 목록"
        description="살 재료를 모아 구매 여부를 기록해요."
        snap={0.82}
      >
        <Suspense fallback={<ProcessingState label="장보기 목록을 준비하고 있어요" detail="저장한 식단과 식품 목록을 살펴보고 있어요." />}><ShoppingListSheet items={shoppingList} loading={shoppingListStatus === "loading"} mutating={shoppingListMutating} error={shoppingListError} notice={shoppingListNotice} retryAction={shoppingListRetryAction} recentlyReceivedFoodName={recentlyReceivedFood?.name ?? recentlyReceivedFoodRef.current?.name} onOpenReceivedFood={openRecentlyReceivedFood} onOpenMeal={openMealPlan} initialFocus={shoppingInitialFocusRef.current} demoMode={!mealApi.isConfigured} storageLocations={storageLocations} onRefresh={() => void refreshShoppingList()} onToggle={(item) => void toggleShoppingItem(item)} onDelete={(item) => void removeShoppingItem(item)} onAddManual={addManualShoppingItem} onReceive={receiveShoppingItem} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "guidance"}
        onOpenChange={(open) => open ? changeSheet("guidance") : closeGuidanceSheet()}
        title="날짜를 읽는 방법"
        snap={0.68}
      >
        <Suspense fallback={<ProcessingState label="날짜 안내를 불러오고 있어요" detail="포장지 날짜와 식품 상태를 살펴봐요." />}><GuidanceSheet /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "account"}
        onOpenChange={(open) => changeSheet(open ? "account" : null)}
        title="내 계정"
        description="식품 기록을 여러 기기에서 이어 보세요."
        snap={0.9}
      >
        <Suspense fallback={<ProcessingState label="계정 화면을 준비하고 있어요" detail="잠시만 기다려 주세요." />}><AccountSheet active={sheet === "account"} initialPasswordResetToken={passwordResetToken} workspaceSync={workspaceSync} workspaceTransport={workspaceTransport} remoteRefreshRequired={accountRemoteRefreshRequired} remoteRefreshing={accountRemoteRefreshing} refreshNonce={accountRefreshNonce} onRefreshRemote={() => void refreshAccountFromRemote()} onRefreshWorkspace={syncDashboard} focusGrocyOutboxId={accountGrocyOutboxFocusId} returnToNotification={notificationAccountReturnRef.current} onReturnToNotification={() => changeSheet(null)} onOpenFoodFromSync={openFoodFromSyncHistory} onAuthenticated={handleAuthenticated} onSignedOut={handleSignedOut} onAccountDeleted={handleAccountDeleted} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "notifications"}
        onOpenChange={(open) => changeSheet(open ? "notifications" : null)}
        title="알림"
        description="식품 알림과 재고 앱 소식을 모았어요."
        snap={0.72}
      >
        <Suspense fallback={<ProcessingState label="알림을 준비하고 있어요" detail="확인이 필요한 항목을 불러옵니다." />}><NotificationSheet notifications={visibleNotifications} loading={mealApi.isConfigured && notificationsLoading} error={notificationsError} notice={notificationsNotice} retryAction={notificationRetryAction} onSelect={openNotificationTarget} onReadAll={() => void markAllNotificationsRead()} returnFocusNotificationId={notificationReturnFocusIdRef.current} initialSyncFocus={notificationSyncFocus} onSyncFocusHandled={() => setNotificationSyncFocus(null)} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "recipe-review"}
        onOpenChange={(open) => changeSheet(open ? "recipe-review" : null)}
        title="공개 레시피 검토"
        description="내용을 살펴본 레시피만 식단 추천에 보여요."
        snap={0.9}
      >
        <Suspense fallback={<ProcessingState label="레시피 검토를 준비하고 있어요" detail="운영자 검토 도구를 불러옵니다." />}><RecipeReviewPanel workspaceTransport={workspaceTransport} /></Suspense>
      </DeferredBottomSheet>

      {toast ? <div className="toast-layer" data-active-sheet={sheet ?? "none"} style={{ position: "absolute", zIndex: 1102, inset: 0, pointerEvents: "none" }}><div className={`toast${toastAction?.message === toast && toastAction.label === "다시 시도" ? " toast-retry" : ""}`} data-toast-action={toastAction?.message === toast ? toastAction.label : undefined} role="status" aria-live="polite" aria-atomic="true" style={{ pointerEvents: "auto" }}><CheckCircledIcon width={17} height={17} /><span className="toast-message">{toast}</span>{toastAction?.message === toast ? <button className="toast-action" type="button" disabled={toastAction.label === "다시 시도" && toastActionBusy} aria-busy={toastAction.label === "다시 시도" && toastActionBusy} onClick={() => { const action = toastAction; const isRetry = action.label === "다시 시도"; if (isRetry) { setToastActionBusy(true); action.onInvoke(); } else { setToast(null); setToastAction(null); action.onInvoke(); } window.setTimeout(focusToastRecoveryTarget, 0); }}>{toastAction.label === "다시 시도" && toastActionBusy ? "다시 시도 중" : toastAction.label}</button> : null}</div></div> : null}
    </>
    </MotionConfig>
  );
}

function ProcessingState({ label, detail }: { label: string; detail: string }) {
  return <div className="capture-intro processing-state"><div className="capture-visual"><UploadIcon width={25} height={25} /></div><h3>{label}</h3><p>{detail}</p><span className="processing-pulse" aria-hidden="true" /></div>;
}

export default function Prototype() {
  const configurationError = mealApi.configurationError;
  return configurationError ? <RuntimeConfigurationGuard message={configurationError} /> : <RuntimeErrorBoundary><PrototypeContent /></RuntimeErrorBoundary>;
}
