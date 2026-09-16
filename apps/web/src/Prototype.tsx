import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
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
  SewingPinIcon,
  SunIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile/Keyboard";
import { MobileScroll } from "./mobile/MobileScroll";
import { createReceiptCommitIdempotencyKey, isMealApiAuthError, isMealApiConflictError, isMealApiFoodDateConfirmedError, isMealApiFoodDatePersistenceError, isMealApiFoodLotSelectionError, isMealApiManualFoodPersistenceError, isMealApiNotificationReadPersistenceError, isMealApiProductInfoPersistenceError, isMealApiProductProvenancePersistenceError, isMealApiReceiptCommitPersistenceError, isMealApiShoppingListPersistenceError, isMealApiShoppingReceivePersistenceError, isMealApiStorageEventPersistenceError, isMealApiWorkspaceConflictError, MEAL_API_WORKSPACE_CONFLICT_MESSAGE, mealApi, type ApiDateKind, type ApiFood, type ApiGrocySyncStatus, type ApiNotification, type ApiProductProvenance, type ApiReceiptDraft, type ApiReceiptSummary, type ApiShoppingListItem, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import RuntimeConfigurationGuard from "./RuntimeConfigurationGuard";
import RuntimeErrorBoundary from "./RuntimeErrorBoundary";
import InstallPrompt from "./InstallPrompt";
import ServiceWorkerUpdatePrompt from "./ServiceWorkerUpdatePrompt";
import { createWorkspaceSyncTransport, WorkspaceSyncCoordinator, type WorkspaceSyncInvalidation, type WorkspaceSyncTransport } from "./workspaceSync";
import { runAuthoritativeMutation } from "./mutationReadback";
import { runStorageMutationRecovery } from "./storageMutationRecovery";

export type StorageType = "냉장" | "냉동" | "실온";
type InventoryStorageFilter = StorageType | "전체" | `location:${string}`;
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
export type FoodItem = {
  id: string;
  lotAction?: "create" | "correct";
  targetFoodId?: string;
  parentId?: string;
  sourceReceiptId?: string;
  sourceReceiptLineId?: string;
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
  spinach: "/assets/food/spinach-cutout-v1.png",
  tofu: "/assets/food/tofu-cutout-v1.png",
  chicken: "/assets/food/chicken-cutout-v1.png",
  mushroom: "/assets/food/mushroom.png",
  eggs: "/assets/food/eggs.png",
  milk: "/assets/food/milk.png",
  tomato: "/assets/food/tomato.png",
} as const;

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
    dateDetail: "AI 소비 우선순위",
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
    dateDetail: "사용자 확인",
    dateKind: "user_confirmed",
    dateSource: "사용자 입력",
    image: FOOD_IMAGES.chicken,
    category: "육류",
    priority: 3,
    confidence: 0.9,
    note: "사용자가 확인한 날짜를 우선 사용하고 있어요.",
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
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "영수증 + 상품 유형",
    image: FOOD_IMAGES.mushroom,
    category: "채소",
    priority: 4,
    confidence: 0.64,
    note: "신선식품은 날짜가 인쇄되지 않을 수 있어 우선순위로만 안내해요.",
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
    dateDetail: "AI 소비 우선순위",
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
    dateDetail: "AI 소비 우선순위",
    dateKind: "estimated_use_first",
    dateSource: "상품 유형 + 보관 방식",
    image: FOOD_IMAGES.tomato,
    category: "채소",
    priority: 7,
    confidence: 0.58,
    note: "실온 보관 중인 신선식품은 상태 확인과 함께 드세요.",
    opened: false,
  },
];

function withGrocySyncNotice(base: string, status?: ApiGrocySyncStatus | ApiGrocySyncStatus[]) {
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  if (statuses.includes("dead_letter")) return `${base} Grocy 동기화에 실패해 재확인이 필요해요`;
  if (statuses.includes("needs_reconciliation")) return `${base} Grocy 외부 반영 여부를 확인해 주세요`;
  if (statuses.includes("needs_mapping")) return `${base} Grocy 상품·보관 위치 매핑을 확인해 주세요`;
  if (statuses.some((item) => item === "queued" || item === "in_flight")) return `${base} Grocy 동기화를 대기 중이에요`;
  return base;
}

const RECEIPT_LINES: ReceiptLine[] = [
  {
    id: "receipt-spinach",
    rawName: "국내산 시금치",
    name: "국내산 시금치",
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

const STORAGE_OPTIONS: StorageType[] = ["냉장", "냉동", "실온"];
const THEME_STORAGE_KEY = "rescue-meal.theme";
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));
const loadBottomSheet = () => import("./mobile/BottomSheet").then(({ BottomSheet }) => ({ default: BottomSheet }));
const LazyBottomSheet = lazy(loadBottomSheet);
const ConnectionStatus = lazy(() => import("./ConnectionStatus"));
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

function ReceiptReviewQueue({ receipts, onSelect, notice }: { receipts: ApiReceiptSummary[]; onSelect: (receiptId: string) => void; notice?: string }) {
  return (
    <div className="receipt-review-queue">
      <div className="receipt-review-queue-intro" role="status">
        <span className="receipt-review-queue-icon"><ReaderIcon width={19} height={19} /></span>
        <span><strong>확인이 끝나지 않은 영수증이에요</strong><small>원본 사진은 저장하지 않고, 확인이 필요한 상품 정보만 잠시 보관해요.</small></span>
      </div>
      {notice ? <div className="receipt-review-queue-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {receipts.length ? <div className="receipt-review-queue-list" role="list" aria-label="검수 대기 영수증 목록">
        {receipts.map((receipt) => <div role="listitem" key={receipt.id}><button className="receipt-review-queue-row" type="button" onClick={() => onSelect(receipt.id)}>
          <span className="receipt-review-queue-row-icon"><FileTextIcon width={16} height={16} /></span>
          <span className="receipt-review-queue-row-copy"><strong>{receipt.merchant_name ?? "저장된 영수증"}</strong><small>{formatPurchasedAt(receipt.purchased_at) ?? "구매일 확인 필요"} · 상품 {receipt.line_count}개</small></span>
          <span className="receipt-review-queue-row-action">이어서 확인 <ChevronRightIcon width={14} height={14} /></span>
        </button></div>)}
      </div> : <div className="receipt-review-queue-empty" role="status"><strong>검수할 영수증이 없어요</strong><small>목록을 다시 확인하거나 새 영수증을 선택해 주세요.</small></div>}
      <p className="receipt-review-queue-footnote">이미 반영했거나 삭제한 영수증은 이 목록에서 자동으로 빠져요.</p>
    </div>
  );
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function createFood(input: Partial<FoodItem> & Pick<FoodItem, "name">): FoodItem {
  return {
    id: createId("food"),
    lotAction: input.lotAction,
    targetFoodId: input.targetFoodId,
    name: input.name,
    brand: input.brand ?? "직접 추가한 식품",
    quantity: input.quantity ?? "1개",
    storage: input.storage ?? "냉장",
    storageLocationId: input.storageLocationId,
    storageLocationName: input.storageLocationName,
    dateLabel: input.dateLabel ?? "확인 필요",
    dateDetail: input.dateDetail ?? "확인 필요",
    dateKind: input.dateKind ?? "unknown",
    dateAssertionKind: input.dateAssertionKind,
    dateStorageHint: input.dateStorageHint,
    dateStorageConditionText: input.dateStorageConditionText,
    barcode: input.barcode,
    dateSource: input.dateSource ?? "사용자 입력",
    image: input.image ?? FOOD_IMAGES.tomato,
    category: input.category ?? "기타",
    priority: input.priority ?? 99,
    confidence: input.confidence ?? 1,
    note: input.note ?? "날짜와 보관 방법을 확인해 주세요.",
    opened: input.opened ?? false,
    productProvenance: input.productProvenance,
  };
}

function getDateBadge(food: FoodItem) {
  if (food.dateKind === "actual_printed") {
    if (food.dateAssertionKind === "sell_by") return "표시 유통기한";
    if (food.dateAssertionKind === "best_before") return "표시 품질유지기한";
    if (food.dateAssertionKind === "use_by" || !food.dateAssertionKind) return "표시 소비기한";
    return "표시 날짜";
  }
  if (food.dateKind === "user_confirmed") return "사용자 확인";
  if (food.dateKind === "unknown") return "확인 필요";
  return "AI 소비 우선순위";
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
  if (!value) return "확인 필요";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "확인 필요";
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

function mealPlanHint(priorityFoods: FoodItem[], foodCount: number) {
  if (foodCount === 0) return "식품을 추가하면 바로 맞춤 식단을 만들어요.";
  if (priorityFoods.length === 0) return "먼저 먹을 식품을 확인하면 맞춤 식단을 만들어요.";
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

function formatDashboardCacheTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "최근 동기화 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function mapApiFood(food: ApiFood, storageLocations: ApiStorageLocation[] = []): FoodItem {
  const estimate = food.estimated_use_first_window;
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
    sourceReceiptId: food.source_receipt_id ?? undefined,
    sourceReceiptLineId: food.source_receipt_line_id ?? undefined,
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
    brand: food.brand,
    quantity: `${food.quantity}${food.unit}`,
    storage: storageFromApi(food.storage_type),
    storageLocationId: food.storage_location_id ?? undefined,
    storageLocationName: food.storage_location_id
      ? storageLocations.find((location) => location.id === food.storage_location_id)?.name
      : undefined,
    dateLabel: formatApiDate(displayDate),
    dateDetail: dateKind === "user_confirmed" ? "사용자 확인" : food.date_assertion.display_label.replaceAll("-", "."),
    dateKind,
    dateAssertionKind: assertionKind,
    dateStorageHint: food.date_assertion.applicable_storage_type ?? undefined,
    dateStorageConditionText: food.date_assertion.storage_condition_text ?? undefined,
    dateSource: food.date_assertion.source_detail,
    image: imageForKnownFoodName(food.display_name) ?? food.image_path,
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
  if (food.dateKind === "unknown") return "날짜 확인 필요";
  if (food.dateAssertionKind === "production_date" || food.dateAssertionKind === "packaging_date") return "날짜 의미 확인";
  if (food.dateKind !== "actual_printed") return null;

  const dateValue = dateValueForFood(food);
  if (!dateValue) return "날짜 확인 필요";
  const [year, month, day] = dateValue.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const assertionKind = food.dateAssertionKind ?? "use_by";
  if (["use_by", "sell_by", "best_before"].includes(assertionKind) && target.getTime() <= today.getTime()) return "조리 전 날짜 확인";
  return null;
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
  return FOOD_IMAGES.tomato;
}

function imageForKnownFoodName(name: string) {
  if (["시금치", "두부", "닭", "버섯", "달걀", "계란", "우유"].some((token) => name.includes(token))) {
    return imageForFoodName(name);
  }
  return null;
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

function useViewportHeight() {
  const [height, setHeight] = useState(() => typeof window === "undefined" ? 852 : window.innerHeight);

  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return height;
}

function PrototypeContent() {
  const keyboard = useKeyboard();
  const viewportHeight = useViewportHeight();
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.rescueTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;

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
  const [activeNav, setActiveNav] = useState<"home" | "food" | "meal">("home");
  const sheetRef = useRef<SheetName>(null);
  sheetRef.current = sheet;
  const sheetRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("receipt");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [detailRemoteRefreshRequired, setDetailRemoteRefreshRequired] = useState(false);
  const detailRevisionRef = useRef<number | null>(null);
  const detailPollingInFlightRef = useRef(false);
  const [accountRemoteRefreshRequired, setAccountRemoteRefreshRequired] = useState(false);
  const [accountRemoteRefreshing, setAccountRemoteRefreshing] = useState(false);
  const [accountRefreshNonce, setAccountRefreshNonce] = useState(0);
  const accountRevisionRef = useRef<number | null>(null);
  const accountPollingInFlightRef = useRef(false);
  const [storageFilter, setStorageFilter] = useState<InventoryStorageFilter>("전체");
  const [inventoryQuery, setInventoryQuery] = useState("");
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
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsNotice, setNotificationsNotice] = useState("");
  const [notificationRetryAction, setNotificationRetryAction] = useState<NotificationRetryAction | null>(null);
  const notificationRevisionRef = useRef<number | null>(null);
  const notificationPollingInFlightRef = useRef(false);
  const notificationReadInFlightRef = useRef(0);
  const notificationRefreshQueuedRef = useRef(false);
  const [productInfoRetryAction, setProductInfoRetryAction] = useState<ProductInfoRetryAction | null>(null);
  const [productProvenanceStatus, setProductProvenanceStatus] = useState<ProductProvenanceStatus | null>(null);
  const [productProvenanceNotice, setProductProvenanceNotice] = useState<{ foodId: string; message: string } | null>(null);
  const [demoNotificationReadAt, setDemoNotificationReadAt] = useState<Record<string, string>>({});
  const [shoppingList, setShoppingList] = useState<ApiShoppingListItem[]>([]);
  const [shoppingListStatus, setShoppingListStatus] = useState<ShoppingListStatus>("idle");
  const [shoppingListError, setShoppingListError] = useState("");
  const [shoppingListNotice, setShoppingListNotice] = useState("");
  const [shoppingListMutating, setShoppingListMutating] = useState(false);
  const [shoppingListRetryAction, setShoppingListRetryAction] = useState<ShoppingListRetryAction | null>(null);
  const shoppingListMutatingRef = useRef(false);
  shoppingListMutatingRef.current = shoppingListMutating;
  const shoppingListRevisionRef = useRef<number | null>(null);
  const shoppingListPollingInFlightRef = useRef(false);
  const shoppingListSyncInFlightRef = useRef(false);
  const shoppingListRefreshQueuedRef = useRef(false);
  const shoppingReceiveKeys = useRef(new Map<string, string>());
  const [receiptSummaries, setReceiptSummaries] = useState<ApiReceiptSummary[]>([]);
  const [receiptSummariesStatus, setReceiptSummariesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [receiptSummariesNotice, setReceiptSummariesNotice] = useState("");
  const receiptSummariesRevisionRef = useRef<number | null>(null);
  const receiptSummariesPollingInFlightRef = useRef(false);
  const receiptSummariesSyncInFlightRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(mealApi.isConfigured ? "checking" : "fixture");
  const [dashboardStaleAt, setDashboardStaleAt] = useState<string | null>(null);
  const dashboardRevisionRef = useRef<number | null>(null);
  const dashboardPollingInFlightRef = useRef(false);
  const dashboardSyncInFlightRef = useRef(false);
  const [resumeReceiptId, setResumeReceiptId] = useState<string | null>(null);
  const [addSheetSessionKey, setAddSheetSessionKey] = useState(0);
  const addSheetOpenRequestRef = useRef(0);
  const mealSheetOpenRequestRef = useRef(0);
  const [reviewMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("review") === "1");
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

  const changeSheet = (next: SheetName) => {
    if (next !== null && sheet === null) {
      const activeElement = document.activeElement;
      sheetRestoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    }
    setSheet(next);
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
    const restoreFocus = () => {
      if (disposed || document.querySelector('[data-testid="bottom-sheet"]')) return;
      if (trigger.isConnected && !trigger.hasAttribute("disabled")) {
        trigger.focus({ preventScroll: true });
      }
      observer.disconnect();
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
    const observer = new MutationObserver(restoreFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    restoreFocus();
    fallbackTimer = window.setTimeout(() => {
      if (!disposed && trigger.isConnected && !trigger.hasAttribute("disabled")) {
        trigger.focus({ preventScroll: true });
      }
      observer.disconnect();
    }, 1200);

    return () => {
      disposed = true;
      observer.disconnect();
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, [sheet]);

  const selectedFood = foods.find((food) => food.id === selectedFoodId) ?? null;
  const customStorageLocations = useMemo(
    () => storageLocations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id)),
    [storageLocations],
  );
  const selectedStorageLocation = customStorageLocations.find((location) => `location:${location.id}` === storageFilter) ?? null;
  const priorityFoods = useMemo(
    () => foods.filter((food) => food.priority <= 3).sort((a, b) => a.priority - b.priority),
    [foods],
  );
  const priorityNeedsReviewCount = useMemo(
    () => priorityFoods.filter((food) => Boolean(dateReviewReason(food, currentDate))).length,
    [currentDate, priorityFoods],
  );
  const normalizedInventoryQuery = inventoryQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredFoods = useMemo(() => {
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
  const todayEyebrow = formatTodayEyebrow(currentDate);
  const currentMealPlanHint = mealPlanHint(priorityFoods, foods.length);
  const hasInventoryQuery = inventoryQuery.trim().length > 0;
  const inventorySearchCanUseServer = mealApi.isConfigured && connectionState !== "offline" && connectionState !== "auth_required";
  const inventorySearchActive = inventorySearchCanUseServer && (Boolean(normalizedInventoryQuery) || storageFilter !== "전체");
  const inventorySearchRequestKey = `${normalizedInventoryQuery}|${storageFilter}`;
  const inventorySearchOwnsResults = inventorySearchActive && inventorySearchKey === inventorySearchRequestKey && inventorySearchStatus !== "idle";
  const inventoryCount = inventorySearchOwnsResults && inventorySearchTotal != null ? inventorySearchTotal : filteredFoods.length;
  const inventorySearchPending = inventorySearchOwnsResults && inventorySearchStatus === "loading";
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
      setNotifications(nextNotifications);
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
    if (sheetRef.current === "notifications") void refreshNotifications();
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
    if (!mealApi.isConfigured) return false;
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
    notificationRevisionRef.current = null;
    notificationPollingInFlightRef.current = false;
    notificationReadInFlightRef.current = 0;
    notificationRefreshQueuedRef.current = false;
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

  const demoNotifications: ApiNotification[] = priorityFoods.slice(0, 3).map((food, index) => ({
    id: `demo-priority:${food.id}`,
    kind: food.dateKind === "estimated_use_first" ? "date_due" : "date_check",
    severity: index === 0 ? "urgent" : "attention",
    title: index === 0 ? "오늘 먼저 확인할 식품이에요" : "확인할 식품이 있어요",
    message: `${food.name}을(를) 먼저 확인해 보세요. 데모 모드에서는 서버 알림을 저장하지 않아요.`,
    canonical_name: food.name,
    food_id: food.id,
    due_date: null,
    source: DEMO_NOTIFICATION_SOURCE[food.dateKind],
    action: "food",
    read_at: demoNotificationReadAt[`demo-priority:${food.id}`] ?? null,
    created_at: new Date().toISOString(),
  }));
  const visibleNotifications = mealApi.isConfigured ? notifications : demoNotifications;
  const unreadNotificationCount = visibleNotifications.filter((notification) => notification.read_at === null).length;
  const shoppingRemainingCount = shoppingList.filter((item) => !item.checked).length;
  const shoppingCompletedCount = shoppingList.length - shoppingRemainingCount;
  const hasManualShoppingItems = shoppingList.some((item) => item.sources.some((source) => source.source_type === "manual"));
  const hasPlannedShoppingItems = shoppingList.some((item) => item.sources.some((source) => source.source_type !== "manual"));
  const shoppingOriginLabel = hasManualShoppingItems && hasPlannedShoppingItems
    ? "식단 재료와 직접 추가"
    : hasManualShoppingItems
      ? "직접 추가한 항목"
      : "식단에서 자동으로 모았어요";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (toastAction && toastAction.message !== toast) setToastAction(null);
  }, [toast, toastAction]);

  const showRetryToast = (message: string, onRetry: () => void) => {
    setToastAction({ message, label: "다시 시도", onInvoke: onRetry });
    setToast(message);
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
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || dashboardPollingInFlightRef.current || dashboardSyncInFlightRef.current) return;
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
        await refreshReceiptSummaries("다른 기기에서 검수 대기 영수증이 바뀌어 최신 목록을 불러왔어요.");
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

  const openAdd = (mode: AddMode = "receipt", receiptId: string | null = null) => {
    // Start the primary intake chunk on user intent so the sheet's dialog
    // shell and its file/camera controls become ready together. Keep the
    // lazy split to avoid increasing the initial bundle for users who do not
    // open intake.
    const requestId = addSheetOpenRequestRef.current + 1;
    addSheetOpenRequestRef.current = requestId;
    keyboard.hide();
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
      showRetryToast("입력 화면을 준비하지 못했어요.", () => openAdd(mode, receiptId));
    });
  };

  const openMealPlan = () => {
    setActiveNav("meal");
    const requestId = mealSheetOpenRequestRef.current + 1;
    mealSheetOpenRequestRef.current = requestId;
    keyboard.hide();
    void loadMealPlanSheet().then(() => {
      if (requestId !== mealSheetOpenRequestRef.current) return;
      setToast(null);
      setToastAction(null);
      changeSheet("meal");
    }).catch(() => {
      if (requestId !== mealSheetOpenRequestRef.current) return;
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

  const openDetail = (food: FoodItem) => {
    detailRevisionRef.current = dashboardRevisionRef.current;
    if (detailRevisionRef.current === null) rememberCurrentDetailRevision();
    setDetailRemoteRefreshRequired(false);
    setSelectedFoodId(food.id);
    changeSheet("detail");
  };

  const refreshDetailFromRemote = async () => {
    if (!selectedFoodId) return;
    setDetailRemoteRefreshRequired(false);
    setToast("식품 상세를 최신 상태로 읽는 중이에요");
    const synced = await syncDashboard();
    if (!synced) {
      setDetailRemoteRefreshRequired(true);
      setToast("최신 식품 상태를 불러오지 못했어요. 다시 시도해 주세요");
      return;
    }
    rememberCurrentDetailRevision();
    setToast("식품 상세를 최신 상태로 갱신했어요");
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
    setToast("계정 설정을 최신 상태로 확인하는 중이에요");
    try {
      const synced = await syncDashboard();
      if (!synced) {
        setAccountRemoteRefreshRequired(true);
        setToast("최신 계정 설정을 불러오지 못했어요. 다시 시도해 주세요");
        return;
      }
      rememberCurrentAccountRevision();
      setAccountRefreshNonce((current) => current + 1);
      setToast("계정 설정을 최신 상태로 확인했어요");
    } finally {
      setAccountRemoteRefreshing(false);
    }
  };

  const openNotifications = () => {
    changeSheet("notifications");
    void refreshNotifications();
  };

  const openShoppingList = () => {
    changeSheet("shopping");
    if (shoppingListStatus === "idle" || shoppingListStatus === "error") void refreshShoppingList();
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
    const requestFingerprint = `${item.id}:${input.quantity}:${input.storageType}:${input.storageLocationId ?? ""}`;
    const idempotencyKey = shoppingReceiveKeys.current.get(requestFingerprint) ?? createId("shopping-receive");
    shoppingReceiveKeys.current.set(requestFingerprint, idempotencyKey);
    try {
      const response = await mealApi.receiveShoppingListItem(item.id, input.quantity, input.storageType, idempotencyKey, input.storageLocationId);
      if (!response) throw new Error("shopping-list-receive-empty");
      shoppingReceiveKeys.current.delete(requestFingerprint);
      setShoppingList(response.items);
      rememberCurrentShoppingListRevision();
      setShoppingListStatus("ready");
      const synced = await syncDashboard();
      setToast(synced
        ? response.removed_planned_source_count > 0
          ? `${item.canonical_name}을(를) 재고에 추가하고 식단 장보기를 정리했어요`
          : `${item.canonical_name}을(를) 재고에 추가했어요`
        : `${item.canonical_name}을(를) 재고에 반영했어요. 화면을 다시 읽지는 못했어요`);
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
        setShoppingListRetryAction({ label: "최신 상태 확인", onRetry: () => void refreshShoppingList() });
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

  const markNotificationRead = async (notification: ApiNotification) => {
    const readAt = new Date().toISOString();
    if (!mealApi.isConfigured) {
      setDemoNotificationReadAt((current) => ({ ...current, [notification.id]: readAt }));
      return;
    }
    notificationReadInFlightRef.current += 1;
    setNotificationsError("");
    setNotificationRetryAction(null);
    try {
      const updated = await mealApi.markNotificationRead(notification.id);
      if (!updated) throw new Error("notification-read-empty");
      setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      rememberCurrentNotificationRevision();
      setNotificationsError("");
      setNotificationRetryAction(null);
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        void refreshNotifications();
        setNotificationsError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setNotificationRetryAction({ label: "최신 상태 확인", onRetry: () => void refreshNotifications() });
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
      rememberCurrentNotificationRevision();
      await refreshNotifications();
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        void refreshNotifications();
        setNotificationsError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setNotificationRetryAction({ label: "최신 상태 확인", onRetry: () => void refreshNotifications() });
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
    void markNotificationRead(notification);
    if (notification.action === "food" && notification.food_id) {
      setSelectedFoodId(notification.food_id);
      changeSheet("detail");
    } else if (notification.action === "grocy") {
      changeSheet("account");
    }
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

  const syncDashboard = async (homeOnly = false) => {
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
      void refreshNotifications();
      void refreshShoppingList();
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
  };

  const retryInventorySearch = () => {
    setInventorySearchRetry((current) => current + 1);
  };

  const navigateFromBottom = (destination: "home" | "food") => {
    keyboard.hide();
    setActiveNav(destination);
    changeSheet(null);
    window.setTimeout(() => {
      const scroll = document.querySelector<HTMLElement>(".app-screen .mobile-scroll");
      if (!scroll) return;
      if (destination === "home") {
        scroll.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      document.querySelector<HTMLElement>(".inventory-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
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

  const handleAuthenticated = async (session: { mode: "account" | "guest" }) => {
    changeSheet(null);
    resetWorkspaceReads();
    setAddSheetSessionKey((current) => current + 1);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
    setToast(synced ? session.mode === "account" ? "계정 workspace에 연결했어요" : "게스트 workspace에 연결했어요" : "계정은 연결했지만 식품 목록을 읽지 못했어요");
  };

  const handleSignedOut = async () => {
    resetWorkspaceReads();
    setAddSheetSessionKey((current) => current + 1);
    const serverRevoked = await mealApi.logoutSession();
    changeSheet(null);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
    setToast(synced ? serverRevoked ? "로그아웃하고 게스트 workspace로 전환했어요" : "이 기기에서 로그아웃하고 게스트 workspace로 전환했어요" : "로그아웃했지만 식품 목록을 읽지 못했어요");
  };

  const handleAccountDeleted = async () => {
    mealApi.clearSession();
    changeSheet(null);
    resetWorkspaceReads();
    setAddSheetSessionKey((current) => current + 1);
    shoppingReceiveKeys.current.clear();
    setConnectionState("checking");
    const synced = await syncDashboard();
    setToast(synced ? "계정과 기록을 삭제하고 새 게스트 workspace로 전환했어요" : "계정과 기록은 삭제했지만 새 게스트 workspace를 열지 못했어요");
  };

  const handleMealCompleted = (foodIds: string[], skippedCount = 0, consumedAllocations: Array<{ food_id: string; quantity: number }> = [], grocySyncStatus?: ApiGrocySyncStatus) => {
    changeSheet(null);
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
      setToast(withGrocySyncNotice(skippedCount ? `일부 재료만 차감하고 ${skippedCount}개는 확인이 필요해요` : foodIds.length ? "식단을 완료하고 재고를 갱신했어요" : "조리 완료 기록을 남겼어요", grocySyncStatus));
      return;
    }
    setToast("식단 완료를 서버에 저장하는 중이에요");
    void syncDashboard().then((synced) => {
      setToast(synced ? withGrocySyncNotice(skippedCount ? `일부 재료만 차감하고 ${skippedCount}개는 확인이 필요해요` : "식단을 완료하고 재고를 갱신했어요", grocySyncStatus) : "식단은 기록했지만 재고를 다시 읽지 못했어요");
    });
  };

  const mergeFoods = (incoming: FoodItem[]) => {
    setFoods((current) => {
      const next = [...current];
      incoming.forEach((incomingFood) => {
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

  const saveFood = (foodId: string, storage: StorageType, opened: boolean, eventQuantity: number, storageLocationId: string | null = null) => {
    const previousFood = foods.find((food) => food.id === foodId);
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
    setToast(mealApi.isConfigured ? "보관 상태를 서버에 저장하는 중이에요" : "보관 상태를 저장했어요");
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
          sync: syncDashboard,
          onSuccess: ({ value: result, synced }) => {
            if (result.inventory) {
              setFoods(result.inventory.map((food, index) => ({ ...mapApiFood(food, storageLocations), priority: index + 1 })));
            }
            setToast(synced
              ? withGrocySyncNotice("보관 상태를 저장했어요", result.statuses)
              : "보관 상태를 저장했어요. 최신 목록은 아직 다시 읽지 못했어요");
          },
          onFailure: (reason, retry) => {
            showRetryToast(
              isMealApiWorkspaceConflictError(reason)
                ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
                : isMealApiStorageEventPersistenceError(reason)
                  ? "보관 상태를 저장하지 못했어요. 기존 상태를 유지했어요."
                  : "서버 저장에 실패해 원래 상태로 되돌렸어요",
              () => { void retry(); },
            );
          },
        });
      };
      persistAndSync();
    }
  };

  const consumeFood = (foodId: string, eventQuantity?: number) => {
    const food = foods.find((item) => item.id === foodId);
    const consumeMutationKey = createId("consume-event");
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
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
    setToast(mealApi.isConfigured ? "먹은 기록을 서버에 저장하는 중이에요" : food ? `${food.name}을(를) 먹은 기록으로 남겼어요` : "먹은 기록을 저장했어요");
    if (mealApi.isConfigured) {
      const persistAndSync = () => {
        void runStorageMutationRecovery({
          applyOptimistic,
          restore: () => setFoods(previousFoods),
          mutate: async () => {
            const event = await mealApi.createStorageEvent(foodId, { event_type: "consumed", quantity: isPartial ? eventQuantity : undefined }, consumeMutationKey);
            return { statuses: event?.grocy_sync_status ? [event.grocy_sync_status] : [], inventory: event?.inventory ?? null } satisfies StorageMutationResult;
          },
          sync: syncDashboard,
          onSuccess: ({ value: result, synced }) => {
            if (result.inventory) {
              setFoods(result.inventory.map((item, index) => ({ ...mapApiFood(item, storageLocations), priority: index + 1 })));
            }
            setToast(synced
              ? withGrocySyncNotice(food ? `${food.name}을(를) 먹은 기록으로 남겼어요` : "먹은 기록을 저장했어요", result.statuses)
              : "먹은 기록을 저장했어요. 최신 목록은 아직 다시 읽지 못했어요");
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
    const food = foods.find((item) => item.id === foodId);
    const discardMutationKey = createId("discard-event");
    const quantity = food ? quantityParts(food.quantity) : { amount: eventQuantity ?? 1, unit: "개" };
    const isPartial = Boolean(eventQuantity && eventQuantity < quantity.amount);
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
    setToast(mealApi.isConfigured ? "폐기 기록을 서버에 저장하는 중이에요" : food ? `${food.name} 폐기 기록을 남겼어요` : "폐기 기록을 저장했어요");
    if (mealApi.isConfigured) {
      const persistAndSync = () => {
        void runStorageMutationRecovery({
          applyOptimistic,
          restore: () => setFoods(previousFoods),
          mutate: async () => {
            const event = await mealApi.createStorageEvent(foodId, { event_type: "discarded", quantity: isPartial ? eventQuantity : undefined }, discardMutationKey);
            return { statuses: event?.grocy_sync_status ? [event.grocy_sync_status] : [], inventory: event?.inventory ?? null } satisfies StorageMutationResult;
          },
          sync: syncDashboard,
          onSuccess: ({ value: result, synced }) => {
            if (result.inventory) {
              setFoods(result.inventory.map((item, index) => ({ ...mapApiFood(item, storageLocations), priority: index + 1 })));
            }
            setToast(synced
              ? withGrocySyncNotice(food ? `${food.name} 폐기 기록을 남겼어요` : "폐기 기록을 저장했어요", result.statuses)
              : "폐기 기록을 저장했어요. 최신 목록은 아직 다시 읽지 못했어요");
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
    const food = foods.find((item) => item.id === foodId);
    if (!food) return;
    const actualPrinted = kind !== "user_reminder";
    const updatedFood: FoodItem = {
      ...food,
      dateLabel: formatApiDate(dateValue),
      dateDetail: dateValue.replaceAll("-", "."),
      dateKind: actualPrinted ? "actual_printed" : "user_confirmed",
      dateAssertionKind: kind,
      dateSource: "사용자 입력",
      confidence: 1,
      note: actualPrinted ? "포장지에서 확인한 날짜를 사용자 확인으로 기록했어요." : "사용자가 설정한 알림 날짜를 기록했어요.",
    };
    changeSheet(null);
    setToast(mealApi.isConfigured ? "확인한 날짜를 서버에 저장하는 중이에요" : `${food.name} 날짜를 사용자 확인으로 저장했어요`);
    if (!mealApi.isConfigured) {
      setFoods((current) => current.map((item) => item.id === foodId ? updatedFood : item));
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
        setToast(synced
          ? `${food.name} 날짜를 사용자 확인으로 저장했어요`
          : `${food.name} 날짜를 저장했어요. 최신 목록은 아직 다시 읽지 못했어요`);
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
      });
  };

  const removeProductProvenance = (foodId: string) => {
    const food = foods.find((item) => item.id === foodId);
    if (!food?.productProvenance) return;
    setProductProvenanceStatus(null);
    setProductProvenanceNotice(null);
    if (!mealApi.isConfigured) {
      setFoods((current) => current.map((item) => item.id === foodId ? { ...item, productProvenance: undefined } : item));
      setProductProvenanceNotice({ foodId, message: `${food.name}의 상품 출처 기록을 지웠어요` });
      setToast(`${food.name}의 상품 출처 기록을 지웠어요`);
      return;
    }
    setFoods((current) => current.map((item) => item.id === foodId ? { ...item, productProvenance: undefined } : item));
    setToast(`${food.name}의 상품 출처를 지우는 중이에요`);
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
        setProductProvenanceNotice({
          foodId,
          message: synced
            ? `${food.name}의 상품 출처를 지웠어요. 이전 변경 이력은 보존됩니다`
            : `${food.name}의 상품 출처를 지웠어요. 최신 목록은 아직 다시 읽지 못했어요`,
        });
        setToast(synced
          ? `${food.name}의 상품 출처를 지웠어요. 이전 변경 이력은 보존됩니다`
          : `${food.name}의 상품 출처를 지웠어요. 최신 목록은 아직 다시 읽지 못했어요`);
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
          setProductProvenanceStatus({ foodId, message: "상품 출처를 지우지 못했어요. 기존 정보를 유지했어요", retryable: true });
        } else {
          // Network/unknown failures are also restored locally. Do not make a
          // potentially stale read race with the retry affordance.
          setFoods((current) => current.map((item) => item.id === foodId ? food : item));
          setProductProvenanceStatus({ foodId, message: "상품 출처를 지우지 못했어요. 기존 정보를 유지했어요", retryable: true });
        }
      });
  };

  const updateProductInfo = (foodId: string, input: { name: string; brand: string; category: string }) => {
    const food = foods.find((item) => item.id === foodId);
    if (!food) return;
    setProductInfoRetryAction(null);
    const updatedFood: FoodItem = {
      ...food,
      name: input.name,
      brand: input.brand,
      category: input.category,
      productProvenance: undefined,
    };
    setFoods((current) => current.map((item) => item.id === foodId ? updatedFood : item));
    if (!mealApi.isConfigured) {
      setToast(`${input.name} 상품 정보를 저장했어요`);
      return;
    }
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
        setProductInfoRetryAction(null);
        setToast(synced
          ? `${input.name} 상품 정보를 저장했어요. 기존 상품 출처는 변경 이력에 남겼어요`
          : `${input.name} 상품 정보를 저장했어요. 최신 목록은 아직 다시 읽지 못했어요`);
      })
      .catch(async (reason) => {
        // Only the mutation failure path restores the previous local state.
        // A successful PATCH followed by a failed dashboard read is handled
        // above without hiding the durable server result.
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
    changeSheet(null);
    if (!mealApi.isConfigured) {
      mergeFoods([food]);
      setToast(`${food.name}을(를) 식품 목록에 추가했어요`);
      return;
    }
    setToast(`${food.name}을(를) 서버에 추가하는 중이에요`);
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
        const updatedReadModel = mapApiFood(updatedApiFood, storageLocations);
        setFoods((current) => {
          const existingIndex = current.findIndex((item) => item.id === updatedReadModel.id);
          const next = existingIndex >= 0
            ? current.map((item) => item.id === updatedReadModel.id ? updatedReadModel : item)
            : [updatedReadModel, ...current];
          return next.map((item, index) => ({ ...item, priority: index + 1 }));
        });
      },
      sync: syncDashboard,
    })
      .then(({ synced }) => {
        setToast(synced
          ? `${food.name}을(를) 식품 목록에 추가했어요`
          : `${food.name}을(를) 추가했어요. 최신 목록은 아직 다시 읽지 못했어요`);
      })
      .catch(async (reason) => {
        await syncDashboard();
        const message = isMealApiAuthError(reason)
          ? "로그인이 만료됐어요. 다시 로그인해 주세요"
          : isMealApiWorkspaceConflictError(reason)
            ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
            : isMealApiFoodLotSelectionError(reason)
              ? "같은 상품의 lot이 여러 개라 날짜를 자동 반영하지 않았어요. 식품 목록에서 대상 lot을 열어 확인해 주세요"
              : isMealApiFoodDateConfirmedError(reason)
                ? "이미 확인된 날짜가 있어 기존 기록을 유지했어요"
                : isMealApiManualFoodPersistenceError(reason)
                  ? "식품을 저장하지 못했어요. 기존 목록을 유지했어요"
                : "서버 추가에 실패했어요. 기존 목록을 유지합니다";
        if (isMealApiAuthError(reason) || isMealApiWorkspaceConflictError(reason) || isMealApiFoodLotSelectionError(reason) || isMealApiFoodDateConfirmedError(reason)) setToast(message);
        else showRetryToast(message, () => addManualFood(food));
      });
  };

  const addReceiptFoods = ({ lines, draftId, sourceFilename }: ReceiptCommitPayload) => {
    const preparedLines = lines.map(prepareReceiptLine).filter((line): line is PreparedReceiptLine => line !== null);
    if (preparedLines.length !== lines.length) {
      setToast("상품명·수량·단위를 확인한 뒤 반영해 주세요");
      return;
    }
    const lineFoods = preparedLines.map(({ line, canonicalName, quantity, unit, storage, storageLocationId }) => createFood({
      name: canonicalName,
      brand: line.rawName ?? line.name,
      quantity: `${formatReceiptAmount(quantity)}${unit}`,
      storage,
      storageLocationId: storageLocationId ?? undefined,
      storageLocationName: storageLocationId ? storageLocations.find((location) => location.id === storageLocationId)?.name : undefined,
      dateLabel: "확인 필요",
      dateDetail: "영수증에는 소비기한이 없어요",
      dateKind: "unknown",
      dateSource: "영수증 + 상품 유형",
      image: line.image,
      category: canonicalName.includes("두부") ? "두부·콩" : "채소",
      confidence: line.confidence,
      barcode: line.barcode ?? undefined,
      note: "영수증 구매일은 기록했지만, 실제 소비기한은 포장지에서 확인해야 해요.",
    }));
    changeSheet(null);
    if (!mealApi.isConfigured) {
      mergeFoods(lineFoods);
      setToast(`${lines.length}개 항목을 검토 후 반영했어요`);
      return;
    }
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
        void runAuthoritativeMutation({
          operation: "receipt-commit",
          mutate: commitDraft,
          apply: (commit) => {
            const updatedFoods = commit.inventory.map((food) => mapApiFood(food, storageLocations));
            setFoods(updatedFoods.map((food, index) => ({ ...food, priority: index + 1 })));
          },
          sync: syncDashboard,
        })
          .then(({ value: commit, synced }) => {
            const idempotencyReplayed = commit.idempotency_replayed === true;
            setToast(idempotencyReplayed
              ? `${lines.length}개 항목은 이미 반영되어 최신 목록을 확인했어요`
              : commit.grocy_sync_status === "needs_mapping"
              ? `${lines.length}개 항목을 반영했지만 Grocy 상품 매핑이 필요해요`
              : commit.grocy_sync_status === "queued"
                ? `${lines.length}개 항목을 반영했고 Grocy 동기화를 대기 중이에요`
                : synced
                  ? `${lines.length}개 항목을 검토 후 반영했어요`
                  : `${lines.length}개 항목을 반영했어요. 최신 목록은 아직 다시 읽지 못했어요`);
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
          });
      };
      persistAndSync();
    }
  };

  const detailSheetSnap = Math.min(0.993, Math.max(0.78, (viewportHeight - 6) / 852));

  return (
    <MotionConfig reducedMotion="user">
    <>
      <MobileScroll className={`app-screen rescue-theme-${themeMode}`}>
        <main className="screen-content meal-home" aria-label="Rescue Meal 홈">
          <header className="app-header">
            <div className="brand-lockup" aria-label="Rescue Meal">
              <span className="brand-mark">r</span>
              <span className="brand-name">rescue meal</span>
            </div>
            <div className="header-actions">
              <Suspense fallback={null}><ConnectionStatus state={connectionState} hasCachedData={Boolean(dashboardStaleAt)} onOpenAccount={() => changeSheet("account")} /></Suspense>
              <button
                className="icon-button theme-toggle-button"
                type="button"
                data-testid="theme-toggle"
                aria-label={themeMode === "light" ? "다크모드로 전환" : "라이트모드로 전환"}
                aria-pressed={themeMode === "dark"}
                title={themeMode === "light" ? "다크모드로 전환" : "라이트모드로 전환"}
                onClick={toggleTheme}
              >
                {themeMode === "light" ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
              </button>
              <button className="icon-button scan-button" type="button" onClick={() => openAdd("receipt")} aria-label="식품 스캔 열기">
                <CameraIcon width={18} height={18} />
              </button>
            </div>
          </header>

          <InstallPrompt />
          <ServiceWorkerUpdatePrompt />

          {connectionState === "checking" && !foods.length ? (
            <div className="service-bootstrap-status" role="status" aria-live="polite">
              <span className="service-bootstrap-dot" aria-hidden="true" />
              <span><strong>기록을 불러오고 있어요</strong><small>내 식품과 오늘의 우선순위를 확인하는 중이에요.</small></span>
            </div>
          ) : null}

          {connectionState === "auth_required" ? (
            <div className="session-expired-callout" role="alert">
              <InfoCircledIcon width={17} height={17} />
              <span><strong>계정 연결이 만료됐어요</strong><small>기록을 안전하게 이어가려면 다시 로그인해 주세요. 다른 workspace로 자동 전환하지 않았어요.</small></span>
              <button type="button" onClick={() => changeSheet("account")}>다시 로그인</button>
            </div>
          ) : null}
          {connectionState === "offline" ? (
            <div className="connection-retry-callout" role="alert">
              <InfoCircledIcon width={17} height={17} />
              <span><strong>서버와 연결되지 않았어요</strong><small>{dashboardStaleAt ? `마지막으로 동기화한 재고(${formatDashboardCacheTime(dashboardStaleAt)})를 보여드려요. 최신 상태를 확인하려면 다시 연결해 주세요.` : "임시 화면을 보여드려요. 최신 재고를 확인하려면 연결을 다시 시도해 주세요."} 오프라인 상태에서 변경 내용을 임의로 전송하지 않아요.</small></span>
              <button type="button" onClick={retryConnection}>다시 연결</button>
            </div>
          ) : null}
          {connectionState === "connected" && receiptSummariesStatus === "ready" && latestPendingReceipt ? (
            <button className="receipt-review-entry-card" type="button" data-testid="pending-receipt-review" onClick={() => pendingReceiptSummaries.length > 1 ? changeSheet("receipt-queue") : openAdd("receipt", latestPendingReceipt.id)}>
              <span className="receipt-review-entry-icon"><ReaderIcon width={17} height={17} /></span>
              <span className="receipt-review-entry-copy">
                <span className="receipt-review-entry-kicker">REVIEW NEEDED</span>
                <strong>검수할 영수증 {pendingReceiptSummaries.length > 1 ? `${pendingReceiptSummaries.length}건` : "1건"}</strong>
                <small>{latestPendingReceipt.merchant_name ? `${latestPendingReceipt.merchant_name} · ` : "저장된 영수증 · "}{formatPurchasedAt(latestPendingReceipt.purchased_at) ?? "구매일 확인 필요"} · 상품 {latestPendingReceipt.line_count}개</small>
              </span>
              <span className="receipt-review-entry-action">{pendingReceiptSummaries.length > 1 ? "모두 보기" : "이어서 확인"} <ChevronRightIcon width={15} height={15} /></span>
            </button>
          ) : null}

          <div className="home-hero-copy">
            <section className="greeting-block" aria-labelledby="greeting-title">
              <div>
                <p className="eyebrow">{todayEyebrow}</p>
                <h1 id="greeting-title">오늘도,<br /><em>남은 재료부터</em></h1>
                <p className="hero-description">버려지지 않을 맛있는 식재료를<br />오늘의 식탁으로 보내요.</p>
              </div>
            <button className="notification-button" type="button" onClick={openNotifications} aria-label={`알림 확인${unreadNotificationCount ? `, 읽지 않은 알림 ${unreadNotificationCount}개` : ""}`}>
              <BellIcon width={18} height={18} />
              {unreadNotificationCount ? <span className="notification-dot" /> : null}
            </button>
            </section>

            <section className="mini-summary" aria-label="냉장고 요약">
              <div className="summary-item">
                <ArchiveIcon width={17} height={17} />
                <span><strong>{foods.length}개</strong> 보관 중</span>
              </div>
              <div className="summary-divider" />
              <div className="summary-item">
                <LightningBoltIcon width={17} height={17} />
                <span><strong>{priorityFoods.length}개</strong> 먼저 먹기</span>
              </div>
            </section>
          </div>

          <section className="priority-section" aria-labelledby="priority-title">
            <div className="rescue-status-card" aria-label={`오늘 먼저 확인할 식품 ${priorityFoods.length}개`}>
              <div className="rescue-status-main">
                <span className="rescue-status-kicker">오늘 먼저 확인할 식품</span>
                <strong>{priorityFoods.length}<small>개</small></strong>
                <span className="rescue-status-description">지금 확인하고, 오늘 먹을 재료를 준비해요.</span>
              </div>
              <div className="rescue-status-legend" aria-label="식품 상태 안내">
                <span><i className="status-dot status-dot-warning" /><b>확인 필요</b><em>{priorityNeedsReviewCount}</em></span>
                <span><i className="status-dot status-dot-action" /><b>먼저 사용</b><em>{Math.max(0, priorityFoods.length - priorityNeedsReviewCount)}</em></span>
                <span><i className="status-dot status-dot-recorded" /><b>기록됨</b><em>{foods.length}</em></span>
              </div>
            </div>
            <div className="section-heading">
              <div>
                <p className="section-kicker">RESCUE QUEUE · TODAY</p>
                <h2 id="priority-title" aria-label={`오늘 먼저 확인할 식품 ${priorityFoods.length}`}><span aria-hidden="true">오늘 먼저 확인할 식품</span><span aria-hidden="true">{priorityFoods.length}</span></h2>
              </div>
              <button className="text-button" type="button" onClick={() => setStorageFilter("전체")}>전체 보기 <ChevronRightIcon width={14} height={14} /></button>
            </div>

            <div className="priority-list">
              {priorityFoods.length ? <div className="priority-list-items">
                {priorityFoods.map((food) => (
                  <button
                    key={food.id}
                    className={`priority-card ${food.priority === 1 ? "priority-card-accent" : ""}`}
                    type="button"
                    onClick={() => openDetail(food)}
                  >
                    <div className="food-image-wrap">
                      <img src={food.image} alt="" className="food-image" draggable={false} />
                    </div>
                    <span className="priority-copy">
                      <span className="food-name-line">
                        <strong>{food.name}</strong>
                        {food.opened ? <span className="opened-dot" title="개봉됨" /> : null}
                      </span>
                      <span className="food-subline">{food.brand} · {food.quantity}</span>
                      <span className="food-meta-line">
                        <span className={`storage-pill ${getStorageClass(food.storage)}`}>{food.storageLocationName ?? food.storage}</span>
                        <span className={`date-source ${dateReviewReason(food, currentDate) ? "date-source-warning" : ""}`}>{dateReviewReason(food, currentDate) ?? getDateBadge(food)}</span>
                      </span>
                    </span>
                    <span className="priority-date">
                      <small>{dateReviewReason(food, currentDate) ? "확인" : food.dateKind === "actual_printed" ? "기한" : "우선"}</small>
                      <strong>{food.dateLabel}</strong>
                      <ChevronRightIcon width={14} height={14} />
                    </span>
                  </button>
                ))}
              </div> : <div className="priority-empty-state">
                <span className="priority-empty-icon"><ArchiveIcon width={19} height={19} /></span>
                <span className="priority-empty-copy">
                  <strong>{foods.length ? "오늘 먼저 확인할 식품이 없어요" : "아직 식품을 등록하지 않았어요"}</strong>
                  <small>{foods.length ? "재고의 날짜와 보관 상태를 확인하면 Rescue Queue가 채워져요." : "영수증·바코드·라벨 중 편한 방법으로 시작해 보세요."}</small>
                </span>
              </div>}
            </div>

            <button className="meal-plan-button" type="button" onClick={() => foods.length ? openMealPlan() : openAdd("receipt")}>
              <span className="meal-plan-icon"><LightningBoltIcon width={17} height={17} /></span>
              <span><strong>{foods.length ? "확인하고 오늘 식단 만들기" : "첫 식품을 추가하고 시작하기"}</strong><small>{currentMealPlanHint}</small></span>
              <ArrowRightIcon width={18} height={18} />
            </button>

            {mealApi.isConfigured && connectionState === "connected" && shoppingListStatus !== "idle" ? (
              <button className="shopping-summary-card" type="button" onClick={openShoppingList}>
                <span className="shopping-summary-icon"><ReaderIcon width={17} height={17} /></span>
                <span className="shopping-summary-copy">
                  <span className="shopping-summary-kicker">SHOPPING LIST</span>
                  <strong>{shoppingListStatus === "loading" && !shoppingList.length ? "장보기 목록을 불러오는 중" : shoppingListStatus === "error" ? "장보기 목록을 다시 확인해요" : shoppingRemainingCount > 0 ? `장보기 ${shoppingRemainingCount}개가 남아 있어요` : shoppingList.length ? "장보기 준비가 끝났어요" : "장보기 목록은 비어 있어요"}</strong>
                  <small>{shoppingListStatus === "error" ? "탭해서 다시 동기화해 주세요." : shoppingList.length ? `${shoppingCompletedCount}개 구매 완료 · ${shoppingOriginLabel}` : "식단을 저장하거나 필요한 물건을 직접 추가해 보세요."}</small>
                </span>
                <ChevronRightIcon width={16} height={16} />
              </button>
            ) : null}

            {foods.length ? <button className="add-food-button" type="button" onClick={() => openAdd("receipt")}>
              <span className="add-food-plus"><PlusIcon width={20} height={20} /></span>
              <span><strong>식품 추가하기</strong><small>영수증·바코드·라벨로 빠르게</small></span>
              <ArrowRightIcon width={18} height={18} />
            </button> : null}
          </section>

          <button className="trust-card" type="button" onClick={() => changeSheet("guidance")}>
            <span className="trust-icon"><InfoCircledIcon width={18} height={18} /></span>
            <span><strong>AI는 소비기한을 확정하지 않아요</strong><small>표시 날짜와 사용자 확인을 가장 먼저 보여드려요.</small></span>
            <ChevronRightIcon width={16} height={16} />
          </button>

          <section className="inventory-section" aria-labelledby="inventory-title">
            <div className="section-heading inventory-heading">
              <div className="inventory-heading-copy">
                <p className="section-kicker">YOUR PANTRY</p>
                <h2 id="inventory-title">내 식품 목록 <span>{inventoryCount}</span></h2>
              </div>
              <label className="filter-select-wrap">
                <span className="sr-only">보관 위치 필터</span>
                <select value={storageFilter} onChange={(event) => setStorageFilter(event.target.value as InventoryStorageFilter)}>
                  <option value="전체">보관위치 전체</option>
                  <option value="냉장">냉장만</option>
                  <option value="냉동">냉동만</option>
                  <option value="실온">실온만</option>
                  {customStorageLocations.length ? <optgroup label="내 보관 위치">{customStorageLocations.map((location) => <option key={location.id} value={`location:${location.id}`}>{location.name}만</option>)}</optgroup> : null}
                </select>
                <ChevronDownIcon width={13} height={13} />
              </label>
            </div>
            <label className="inventory-search">
              <MagnifyingGlassIcon width={15} height={15} aria-hidden="true" />
              <KeyboardInput className="inventory-search-input" type="search" value={inventoryQuery} placeholder="식품·브랜드·카테고리 검색" aria-label="식품·브랜드·카테고리 검색" onChange={(event) => setInventoryQuery(event.target.value)} onBlur={() => keyboard.hide()} />
              {hasInventoryQuery ? <button type="button" aria-label="식품 검색어 지우기" onPointerDown={(event) => event.preventDefault()} onClick={clearInventorySearch}><Cross2Icon width={14} height={14} /></button> : null}
            </label>

            {inventorySearchActive && inventorySearchPending && !filteredFoods.length ? <div className="inventory-search-state inventory-search-loading" role="status"><MagnifyingGlassIcon width={16} height={16} /><span>재고를 찾고 있어요</span></div> : inventorySearchActive && inventorySearchStatus === "error" && !filteredFoods.length ? <div className="inventory-search-state inventory-search-error" role="alert"><span><strong>재고를 찾지 못했어요</strong><small>{inventorySearchError || "잠시 후 다시 시도해 주세요."}</small></span><button type="button" onClick={retryInventorySearch}>다시 시도</button></div> : filteredFoods.length ? <>
              {inventorySearchActive && inventorySearchStatus === "error" ? <div className="inventory-search-inline-error" role="alert"><span>{inventorySearchError || "더 많은 재고를 불러오지 못했어요."}</span><button type="button" onClick={retryInventorySearch}>다시 시도</button></div> : null}
            <div className="inventory-list">
              {filteredFoods.map((food) => (
                <button className="inventory-row" type="button" key={food.id} onClick={() => openDetail(food)}>
                  <div className="inventory-image-wrap"><img src={food.image} alt="" className="inventory-image" draggable={false} /></div>
                  <span className="inventory-copy"><strong>{food.name}</strong><small>{food.brand} · {food.quantity}{food.storageLocationName ? ` · ${food.storageLocationName}` : ""}</small></span>
                  <span className={`inventory-status ${dateReviewReason(food, currentDate) ? "inventory-status-warning" : ""}`}><span className={`storage-dot ${getStorageClass(food.storage)}`} />{dateReviewReason(food, currentDate) ? "확인 필요" : food.dateLabel}</span>
                  <ChevronRightIcon className="row-chevron" width={15} height={15} />
                </button>
              ))}
            </div>
            {inventorySearchOwnsResults && inventorySearchHasMore ? <button className="inventory-load-more" type="button" disabled={inventorySearchPending} onClick={loadMoreInventory}>{inventorySearchPending ? "더 불러오는 중" : `더 보기 · ${Math.max(0, (inventorySearchTotal ?? 0) - filteredFoods.length)}개 남음`}</button> : null}
            </> : <div className="inventory-empty-state">
              <span className="inventory-empty-icon"><ArchiveIcon width={18} height={18} /></span>
              <span className="inventory-empty-copy">
                <strong>{hasInventoryQuery ? `“${inventoryQuery.trim()}” 검색 결과가 없어요` : foods.length ? `${selectedStorageLocation?.name ?? storageFilter} 보관 식품이 없어요` : "아직 등록된 식품이 없어요"}</strong>
                <small>{hasInventoryQuery ? "상품명·브랜드·카테고리를 다시 확인하거나 검색 조건을 지워 보세요." : foods.length ? "다른 보관 위치를 선택하거나 새 식품을 추가해 보세요." : "첫 식품을 기록하면 이곳에서 보관 상태와 날짜를 관리할 수 있어요."}</small>
                {hasInventoryQuery ? <button className="inventory-empty-action" type="button" onClick={clearInventoryFilters}>검색 조건 초기화</button> : storageFilter !== "전체" ? <button className="inventory-empty-action" type="button" onClick={() => setStorageFilter("전체")}>전체 목록 보기</button> : <button className="inventory-empty-action" type="button" onClick={() => openAdd("receipt")}>식품 추가하기</button>}
              </span>
            </div>}
          </section>

          <p className="footer-caption"><ReaderIcon width={14} height={14} /> Rescue Meal은 기록을 돕는 생활 도구예요.</p>
          {reviewMode ? <button className="recipe-review-entry" type="button" onClick={() => changeSheet("recipe-review")}>운영자 recipe review 열기</button> : null}
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
        title={addMode === "receipt" ? "영수증으로 추가" : addMode === "barcode" ? "바코드로 추가" : addMode === "label" ? "라벨로 추가" : "직접 추가"}
        description="구매 기록과 보관 상태를 확인한 뒤 내 식품 목록에 반영해요."
        snap={0.84}
      >
        <AddFoodSheet mode={addMode} onModeChange={setAddMode} onAddManual={addManualFood} onAddReceipt={addReceiptFoods} resumeReceiptId={resumeReceiptId} sessionKey={addSheetSessionKey} receiptLines={RECEIPT_LINES} existingFoods={foods} storageLocations={storageLocations} createFood={createFood} formatApiDate={formatApiDate} storageFromApi={storageFromApi} imageForFoodName={imageForFoodName} formatReceiptLineDetail={formatReceiptLineDetail} receiptLineError={receiptLineError} />
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "receipt-queue"}
        onOpenChange={(open) => changeSheet(open ? "receipt-queue" : null)}
        title="검수할 영수증"
        description="확인이 끝나지 않은 영수증을 골라 이어가요."
        snap={0.72}
      >
        <ReceiptReviewQueue receipts={pendingReceiptSummaries} notice={receiptSummariesNotice} onSelect={(receiptId) => openAdd("receipt", receiptId)} />
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "detail" && Boolean(selectedFood)}
        onOpenChange={(open) => changeSheet(open ? "detail" : null)}
        title={selectedFood?.name ?? "식품 상세"}
        description={selectedFood?.brand ?? "보관 상태와 날짜 출처를 확인해요."}
        snap={detailSheetSnap}
      >
        {selectedFood ? <Suspense fallback={<ProcessingState label="식품 상세를 준비하고 있어요" detail="보관 이력과 날짜 출처를 불러옵니다." />}><FoodDetailSheet food={selectedFood} storageLocations={storageLocations} dateReviewReason={dateReviewReason(selectedFood, currentDate)} remoteRefreshRequired={detailRemoteRefreshRequired} onRefreshRemote={() => void refreshDetailFromRemote()} productInfoError={productInfoRetryAction?.foodId === selectedFood.id ? productInfoRetryAction.message : undefined} onRetryProductInfo={productInfoRetryAction?.foodId === selectedFood.id ? () => updateProductInfo(selectedFood.id, productInfoRetryAction.input) : undefined} productProvenanceError={productProvenanceStatus?.foodId === selectedFood.id ? productProvenanceStatus.message : undefined} onRetryProductProvenance={productProvenanceStatus?.foodId === selectedFood.id && productProvenanceStatus.retryable ? () => removeProductProvenance(selectedFood.id) : undefined} productProvenanceNotice={productProvenanceNotice?.foodId === selectedFood.id ? productProvenanceNotice.message : undefined} onSave={saveFood} onConsume={consumeFood} onDiscard={discardFood} onConfirmDate={confirmFoodDate} onRemoveProductProvenance={removeProductProvenance} onUpdateProductInfo={updateProductInfo} onShowGuidance={() => changeSheet("guidance")} /></Suspense> : null}
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "meal"}
        onOpenChange={(open) => changeSheet(open ? "meal" : null)}
        title="오늘의 Rescue Meal"
        description="먼저 먹을 식품을 기준으로 만든 가벼운 제안이에요."
        snap={0.76}
      >
        <Suspense fallback={<ProcessingState label="식단 화면을 준비하고 있어요" detail="현재 재료와 우선순위를 확인합니다." />}><MealPlanSheet active={sheet === "meal"} foods={foods} workspaceSync={workspaceSync} workspaceTransport={workspaceTransport} onSaved={(kind) => setToast(kind === "multi-day" ? "3일 식단을 저장했어요" : "오늘의 식단을 저장했어요")} onCompleted={handleMealCompleted} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "shopping"}
        onOpenChange={(open) => changeSheet(open ? "shopping" : null)}
        title="장보기 목록"
        description="부족한 재료를 한 곳에서 확인하고 장보며 체크해요."
        snap={0.82}
      >
        <Suspense fallback={<ProcessingState label="장보기 목록을 준비하고 있어요" detail="저장한 식단과 현재 재고를 확인합니다." />}><ShoppingListSheet items={shoppingList} loading={shoppingListStatus === "loading"} mutating={shoppingListMutating} error={shoppingListError} notice={shoppingListNotice} retryAction={shoppingListRetryAction} storageLocations={storageLocations} onRefresh={() => void refreshShoppingList()} onToggle={(item) => void toggleShoppingItem(item)} onDelete={(item) => void removeShoppingItem(item)} onAddManual={addManualShoppingItem} onReceive={receiveShoppingItem} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "guidance"}
        onOpenChange={(open) => changeSheet(open ? "guidance" : null)}
        title="날짜를 읽는 방법"
        description="안전과 편의를 분리해서 기록해요."
        snap={0.68}
      >
        <Suspense fallback={<ProcessingState label="안내를 준비하고 있어요" detail="안전한 날짜 기록 순서를 불러옵니다." />}><GuidanceSheet /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "account"}
        onOpenChange={(open) => changeSheet(open ? "account" : null)}
        title="내 계정"
        description="다른 기기에서도 같은 식품 기록을 이어가요."
        snap={0.8}
      >
        <Suspense fallback={<ProcessingState label="계정 화면을 준비하고 있어요" detail="잠시만 기다려 주세요." />}><AccountSheet initialPasswordResetToken={passwordResetToken} workspaceSync={workspaceSync} workspaceTransport={workspaceTransport} remoteRefreshRequired={accountRemoteRefreshRequired} remoteRefreshing={accountRemoteRefreshing} refreshNonce={accountRefreshNonce} onRefreshRemote={() => void refreshAccountFromRemote()} onAuthenticated={handleAuthenticated} onSignedOut={handleSignedOut} onAccountDeleted={handleAccountDeleted} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "notifications"}
        onOpenChange={(open) => changeSheet(open ? "notifications" : null)}
        title="알림"
        description="확인이 필요한 날짜와 동기화 작업을 모아 보여드려요."
        snap={0.72}
      >
        <Suspense fallback={<ProcessingState label="알림을 준비하고 있어요" detail="확인이 필요한 항목을 불러옵니다." />}><NotificationSheet notifications={visibleNotifications} loading={mealApi.isConfigured && notificationsLoading} error={notificationsError} notice={notificationsNotice} retryAction={notificationRetryAction} onSelect={openNotificationTarget} onReadAll={() => void markAllNotificationsRead()} /></Suspense>
      </DeferredBottomSheet>

      <DeferredBottomSheet
        open={sheet === "recipe-review"}
        onOpenChange={(open) => changeSheet(open ? "recipe-review" : null)}
        title="공개 레시피 검토"
        description="승인된 source만 사용자 planner에 노출해요."
        snap={0.9}
      >
        <Suspense fallback={<ProcessingState label="recipe review를 준비하고 있어요" detail="운영자 검토 도구를 불러옵니다." />}><RecipeReviewPanel workspaceTransport={workspaceTransport} /></Suspense>
      </DeferredBottomSheet>

      {toast ? <div className="toast" role="status"><CheckCircledIcon width={17} height={17} /><span className="toast-message">{toast}</span>{toastAction?.message === toast ? <button className="toast-action" type="button" onClick={() => { const action = toastAction; setToast(null); setToastAction(null); action.onInvoke(); }}>{toastAction.label}</button> : null}</div> : null}
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
