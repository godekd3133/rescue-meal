import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRightIcon, BellIcon, CheckCircledIcon, InfoCircledIcon, ReaderIcon, SewingPinIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { getMobileScrollBehavior } from "./mobile/scroll";
import { externalSyncLifecycleLabel } from "./externalSyncPresentation";
import {
  MEAL_API_WORKSPACE_CONFLICT_MESSAGE,
  isMealApiConflictError,
  isMealApiGrocyLocationMappingPersistenceError,
  isMealApiGrocyMappingPersistenceError,
  isMealApiGrocyOutboxPersistenceError,
  isMealApiGuestTransferPersistenceError,
  isMealApiAccountDeletionPersistenceError,
  isMealApiAuthError,
  isMealApiExportAuditPersistenceError,
  isMealApiExportRateLimitError,
  isMealApiStorageLocationPersistenceError,
  isMealApiWorkspaceConflictError,
  isMealApiNotificationPreferencesPersistenceError,
  isMealApiPushSubscriptionPersistenceError,
  isMealApiReceiptPrivacyPersistenceError,
  mealApi,
  MealApiError,
  type ApiAuthMe,
  type ApiAuthSession,
  type ApiGuestTransfer,
  type ApiGuestTransferPreview,
  type ApiGrocyLocationMapping,
  type ApiGrocyProductMappingAuditEvent,
  type ApiGrocyOutboxRecord,
  type ApiGrocyProductMapping,
  type ApiGrocyStatus,
  type ApiGrocyWorkerHeartbeat,
  type ApiNotificationPreferences,
  type ApiNotificationWorkerHeartbeat,
  type ApiPushSubscriptionSummary,
  type ApiReceiptPrivacyPolicy,
  type ApiReceiptSummary,
  type ApiStorageLocation,
  type ApiStorageType,
} from "./mealApi";
import { WorkspaceSyncCoordinator, type WorkspaceSyncTransport } from "./workspaceSync";
import { clearCompletedOutboxHandoff, readCompletedOutboxHandoff, writeCompletedOutboxHandoff } from "./completedOutboxHandoff";

type AccountMode = "login" | "register";
type AuthenticatedCallback = (session: ApiAuthSession, successMessage?: string) => void | Promise<void>;

type NotificationSettingsRetryAction =
  | { kind: "refresh" | "save" | "subscribe" }
  | { kind: "remove"; subscription: ApiPushSubscriptionSummary };

type GrocyRetryAction =
  | { kind: "refresh" }
  | { kind: "location"; storageType: ApiStorageType }
  | { kind: "product"; canonicalName: string; draftKey: string; fallbackUnit: string }
  | { kind: "reconcile"; record: ApiGrocyOutboxRecord; decision: "already_applied" | "not_applied" }
  | { kind: "retry"; record: ApiGrocyOutboxRecord };

type ReceiptPrivacyRetryAction =
  | { kind: "refresh" }
  | { kind: "erase"; receipt: ApiReceiptSummary };

const STORAGE_OPTIONS: Array<{ value: ApiStorageType; label: string }> = [
  { value: "ambient", label: "실온" },
  { value: "refrigerated", label: "냉장" },
  { value: "frozen", label: "냉동" },
];

const NOTIFICATION_TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Asia/Seoul", label: "한국 표준시 · 서울" },
  { value: "Asia/Tokyo", label: "일본 표준시 · 도쿄" },
  { value: "UTC", label: "협정 세계시 · UTC" },
  { value: "America/Los_Angeles", label: "미국 태평양 시간" },
  { value: "America/New_York", label: "미국 동부 시간" },
  { value: "Europe/London", label: "영국 시간" },
];

function browserTimezone() {
  if (typeof Intl === "undefined") return null;
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
  return value || null;
}

function notificationTimezoneOptions(current: string, detectedTimezone: string | null) {
  const options = [...NOTIFICATION_TIMEZONE_OPTIONS];
  if (detectedTimezone && !options.some((option) => option.value === detectedTimezone)) {
    options.unshift({ value: detectedTimezone, label: `현재 기기 시간 · ${detectedTimezone}` });
  }
  if (!options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: `현재 설정 · ${current}` });
  }
  return options;
}

const OPERATION_LABELS: Record<ApiGrocyOutboxRecord["operation"], string> = {
  receipt_add: "입고",
  consume: "소비·폐기",
  open: "개봉",
  transfer: "보관 이동",
};

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function sameName(left: string, right: string) {
  return normalized(left).replace(/\s+/g, " ") === normalized(right).replace(/\s+/g, " ");
}

function sameUnit(left: string | null | undefined, right: string) {
  return Boolean(left && left.replace(/\s/g, "").toLowerCase() === right.replace(/\s/g, "").toLowerCase());
}

function grocyStatusLabel(status: ApiGrocyStatus["status"] | undefined) {
  if (status === "ok") return "연결됨";
  if (status === "unavailable") return "연결 확인 필요";
  if (status === "disabled") return "서버 설정 필요";
  return "확인 중";
}

function externalInventoryDetail(detail: string | null | undefined, fallback: string) {
  const normalized = detail?.trim() ?? "";
  if (!normalized) return fallback;
  return normalized
    .replace(/system info readback/gi, "연결 상태 확인")
    .replace(/product mapping/gi, "상품 연결")
    .replace(/stock sync/gi, "재고 동기화")
    .replace(/reconciliation\s*확인이 필요합니다/gi, "외부 반영 여부 확인이 필요합니다")
    .replace(/reconciliation/gi, "반영 확인")
    .replace(/Grocy/gi, "외부 재고 서비스")
    .replace(/\boutbox\b/gi, "동기화 대기 작업");
}

function grocyStatusDetail(detail: string | undefined, configured: boolean | undefined) {
  if (configured === false) return "외부 재고 서비스가 아직 연결되지 않았어요.";
  const normalized = detail?.trim() ?? "";
  if (!normalized) return "연결 상태를 확인하지 못했어요.";
  if (/system info readback/i.test(normalized)) return "외부 재고 서비스 연결 상태를 확인했어요.";
  return externalInventoryDetail(normalized, "연결 상태를 확인하지 못했어요.");
}

function formatWorkerTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function productTaskKey(record: ApiGrocyOutboxRecord) {
  return `${record.canonical_name}::${record.unit}`;
}

function productMappingKey(canonicalName: string) {
  return `mapping:${canonicalName}`;
}

function formatMappingTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "변경 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function operationLabel(record: ApiGrocyOutboxRecord) {
  if (record.operation === "consume") return record.spoiled ? "폐기" : "소비";
  return OPERATION_LABELS[record.operation];
}

function outboxStatusLabel(status: ApiGrocyOutboxRecord["status"]) {
  if (status === "blocked") return "외부 연결 확인 필요";
  if (status === "pending") return externalSyncLifecycleLabel("queued");
  if (status === "in_flight") return externalSyncLifecycleLabel("processing");
  if (status === "succeeded") return externalSyncLifecycleLabel("applied");
  if (status === "dead_letter") return "외부 반영 실패";
  return "반영 여부 확인 필요";
}

function statusHistorySourceLabel(source: ApiGrocyOutboxRecord["status_history"][number]["source"]) {
  if (source === "created") return "작업 생성";
  if (source === "mapping") return "연결 상태 갱신";
  if (source === "worker") return "자동 동기화";
  if (source === "retry") return "수동 재시도";
  if (source === "reconciliation") return "운영자 확인";
  return "상태 확인";
}

function outboxFoodId(record: ApiGrocyOutboxRecord) {
  const payloadFoodId = record.payload.food_id;
  return typeof payloadFoodId === "string" && payloadFoodId.trim() ? payloadFoodId : record.aggregate_id.trim() || null;
}

function GrocyOutboxDetail({ record, onOpenFoodFromSync }: { record: ApiGrocyOutboxRecord; onOpenFoodFromSync?: (foodId: string, canonicalName: string, outboxId?: string) => void }) {
  const transactionLabel = record.grocy_transaction_id ? `외부 작업 #${record.grocy_transaction_id}` : "외부 작업 번호 없음";
  const foodId = outboxFoodId(record);
  const statusHistory = record.status_history?.length
    ? record.status_history
    : [{ status: record.status, occurred_at: record.updated_at, source: "system" as const, note: null }];
  const timelineEntries = [
    {
      key: "food-record",
      occurredAt: record.created_at,
      kind: "food-record" as const,
      title: "식품 기록",
      detail: `${operationLabel(record)} · ${record.quantity}${record.unit} · 식품 상세 최근 기록과 연결돼요.`,
      status: null,
      source: null,
      note: null,
    },
    ...statusHistory.map((entry, index) => ({
      key: `status-${entry.occurred_at}-${index}`,
      occurredAt: entry.occurred_at,
      kind: entry.source === "reconciliation" ? "operator-decision" as const : entry.status === record.status ? "external-inventory" as const : "status-history" as const,
      title: entry.source === "reconciliation" ? "운영자 판정" : entry.status === record.status ? "외부 재고" : "상태 변화",
      detail: `${outboxStatusLabel(entry.status)} · ${statusHistorySourceLabel(entry.source)}`,
      status: entry.status,
      source: entry.source,
      note: entry.note || (entry.status === "succeeded" && record.grocy_transaction_id ? transactionLabel : null),
    })),
  ].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  return (
    <details className="grocy-product-history" data-grocy-outbox-details={record.id} style={{ gridColumn: "1 / -1" }}>
      <summary className="grocy-product-history-heading" style={{ cursor: "pointer", listStyle: "none" }}>
        <span className="grocy-product-history-heading-copy"><strong>{record.canonical_name} 외부 작업</strong><small>{record.grocy_transaction_id ? transactionLabel : `작업 ID ${record.id}`}</small><small className="grocy-product-history-heading-time">최근 {formatMappingTime(record.updated_at)}</small></span>
        <span className="grocy-task-state-badge" data-outbox-status={record.status}>{outboxStatusLabel(record.status)}</span>
      </summary>
      <div className="grocy-product-history" data-outbox-status-history={record.id} data-outbox-integrated-timeline={record.id} role="list">
        <div className="grocy-product-history-heading"><strong>작업 타임라인</strong><small>시간순</small></div>
        {timelineEntries.slice(-8).map((entry) => entry.kind === "food-record" ? <div className="grocy-product-history-event" data-outbox-timeline-step={entry.kind} role="listitem" key={`${record.id}:${entry.key}`}>
          <div><strong>{entry.title}</strong><small>{entry.detail} · {formatMappingTime(entry.occurredAt)}</small></div>
          {foodId && onOpenFoodFromSync ? <button className="grocy-refresh-button" type="button" aria-label={`${record.canonical_name} 작업 타임라인의 식품 기록 보기`} onPointerDown={(event) => event.preventDefault()} onClick={() => onOpenFoodFromSync(foodId, record.canonical_name, record.id)}>식품 기록 보기</button> : null}
        </div> : <details className="grocy-product-history-event" data-outbox-timeline-step={entry.kind} data-outbox-status-history-entry={entry.status ?? undefined} role="listitem" key={`${record.id}:${entry.key}`}>
          <summary style={{ cursor: "pointer", listStyle: "none" }}><strong>{entry.title}</strong><small>{entry.detail} · {formatMappingTime(entry.occurredAt)}</small></summary>
          <div className="grocy-product-history-event" data-outbox-evidence-step={entry.kind}>
            {entry.source ? <small>변경 주체 · {statusHistorySourceLabel(entry.source)}</small> : null}
            {entry.note ? <small>{entry.note}</small> : null}
            <small style={{ wordBreak: "break-all" }}>Rescue Meal 작업 ID · {record.id}</small>
            {entry.status === "succeeded" && record.grocy_transaction_id ? <small style={{ wordBreak: "break-all" }}>{transactionLabel}</small> : null}
          </div>
        </details>)}
      </div>
      <div className="grocy-product-history-event" data-outbox-detail-id={record.id} data-outbox-status={record.status}>
        <div><strong>작업</strong><small>{operationLabel(record)} · {record.quantity}{record.unit} · {outboxStatusLabel(record.status)}</small></div>
        <small style={{ wordBreak: "break-all" }}>Rescue Meal 작업 ID · {record.id}</small>
        {record.grocy_transaction_id ? <small style={{ wordBreak: "break-all" }}>{transactionLabel}</small> : null}
        <small>생성 {formatMappingTime(record.created_at)} · 최근 변경 {formatMappingTime(record.updated_at)}</small>
      </div>
    </details>
  );
}

function formatReceiptPurchaseDate(value: string | null) {
  if (!value) return "구매일 확인 필요";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "구매일 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

function receiptStatusLabel(status: ApiReceiptSummary["status"]) {
  if (status === "committed") return "재고 반영됨";
  if (status === "review_required") return "검토 대기";
  if (status === "confirmed") return "확인됨";
  if (status === "rejected") return "반려됨";
  return "처리 중";
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(normalized);
  return Uint8Array.from([...decoded].map((character) => character.charCodeAt(0)));
}

async function pushEndpointFingerprint(endpoint: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function unsubscribeMatchingPush(expectedFingerprint: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  if (!current || await pushEndpointFingerprint(current.endpoint) !== expectedFingerprint) return false;
  return !(await current.unsubscribe());
}

function formatPushSubscriptionTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "등록 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

const configuredVapidPublicKey = (import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? "";
const PENDING_GUEST_TRANSFER_STORAGE_KEY = "rescue-meal.pending-guest-transfer";

type StoredGuestTransfer = {
  guest_access_token: string;
  target_workspace_id: string;
};

function readStoredGuestTransfer() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_GUEST_TRANSFER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGuestTransfer>;
    return typeof parsed.guest_access_token === "string" && parsed.guest_access_token.startsWith("rm1.") && typeof parsed.target_workspace_id === "string" && parsed.target_workspace_id ? parsed as StoredGuestTransfer : null;
  } catch {
    return null;
  }
}

function storeGuestTransfer(guestAccessToken: string, targetWorkspaceId: string) {
  try {
    window.localStorage.setItem(PENDING_GUEST_TRANSFER_STORAGE_KEY, JSON.stringify({ guest_access_token: guestAccessToken, target_workspace_id: targetWorkspaceId } satisfies StoredGuestTransfer));
  } catch {
    // Storage policy can reject persistence; the current registration flow still works.
  }
}

function clearStoredGuestTransfer() {
  try {
    window.localStorage.removeItem(PENDING_GUEST_TRANSFER_STORAGE_KEY);
  } catch {
    // Storage policy can reject removal.
  }
}

function storedAccountSession(authMe: ApiAuthMe): ApiAuthSession | null {
  try {
    const accessToken = window.localStorage.getItem("rescue-meal.guest-token");
    if (!accessToken) return null;
    return { ...authMe, access_token: accessToken, token_type: "bearer", expires_at: "" };
  } catch {
    return null;
  }
}

function hasGuestTransferRecords(preview: ApiGuestTransferPreview | null | undefined) {
  return Boolean(preview && (
    preview.food_count
    || preview.receipt_count
    || preview.storage_event_count
    || preview.meal_plan_count
    || preview.multi_day_plan_count
    || preview.shopping_list_count
    || preview.shopping_receive_operation_count
    || preview.storage_location_count
    || preview.meal_preferences_changed
    || preview.push_subscription_count
    || preview.notification_preferences_changed
  ));
}

function guestTransferMessage(message: string) {
  return message
    .replaceAll("guest workspace", "게스트 기록 공간")
    .replaceAll("account workspace", "계정 기록 공간")
    .replaceAll("workspace", "기록 공간");
}

function guestTransferResultMessage(result: ApiGuestTransfer) {
  if (result.status === "already_transferred") return "게스트 기록은 이미 계정 기록에 연결되어 있어요";
  const scopes = [
    result.imported_food_count ? `식품 ${result.imported_food_count}개` : null,
    result.imported_receipt_count ? `영수증 ${result.imported_receipt_count}개` : null,
    result.imported_storage_event_count ? `보관 기록 ${result.imported_storage_event_count}개` : null,
    result.imported_storage_location_count ? `보관 위치 ${result.imported_storage_location_count}개` : null,
    result.imported_meal_plan_count ? `식단 ${result.imported_meal_plan_count}개` : null,
    result.imported_multi_day_plan_count ? `3일 계획 ${result.imported_multi_day_plan_count}개` : null,
    result.imported_shopping_list_count ? `장보기 ${result.imported_shopping_list_count}개` : null,
    result.imported_shopping_receive_operation_count ? `입고 확인 ${result.imported_shopping_receive_operation_count}개` : null,
    result.imported_meal_preferences ? "식단 조건" : null,
    result.imported_push_subscription_count ? `기기 알림 ${result.imported_push_subscription_count}개` : null,
    result.imported_notification_preferences ? "알림 설정" : null,
  ].filter((item): item is string => Boolean(item));
  if (!scopes.length) return "게스트 기록을 계정으로 옮겼어요";
  const visibleScopes = scopes.slice(0, 2).join(" · ");
  const remaining = scopes.length - 2;
  return `게스트 기록을 계정으로 옮겼어요 · ${visibleScopes}${remaining > 0 ? ` 외 ${remaining}개 기록` : ""}`;
}

function NotificationPreferencesPanel({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const keyboard = useKeyboard();
  const [preferences, setPreferences] = useState<ApiNotificationPreferences | null>(null);
  const [draft, setDraft] = useState<ApiNotificationPreferences>({ in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null, quiet_hours_end: null });
  const [leadDaysText, setLeadDaysText] = useState("2");
  const [subscriptions, setSubscriptions] = useState<ApiPushSubscriptionSummary[]>([]);
  const [workerHeartbeats, setWorkerHeartbeats] = useState<ApiNotificationWorkerHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [removingFingerprint, setRemovingFingerprint] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAction, setRetryAction] = useState<NotificationSettingsRetryAction | null>(null);
  const detectedTimezone = browserTimezone();

  const refresh = async () => {
    setLoading(true);
    setError("");
    setRetryAction(null);
    const result = await workspaceSync.run("account-notification-preferences", async (signal) => {
      const [nextPreferences, nextSubscriptions, nextWorkerHeartbeats] = await Promise.all([
        mealApi.getNotificationPreferences(signal),
        mealApi.getPushSubscriptions(signal),
        mealApi.getNotificationWorkerStatus(signal),
      ]);
      if (!nextPreferences || !nextSubscriptions || !nextWorkerHeartbeats) throw new Error("notification-preferences-empty");
      return { preferences: nextPreferences, subscriptions: nextSubscriptions, workerHeartbeats: nextWorkerHeartbeats };
    });
    if (!result.current) return;
    if (result.error || !result.value) {
      setError("알림 설정을 불러오지 못했어요.");
      setRetryAction({ kind: "refresh" });
      setLoading(false);
      return;
    }
    setPreferences(result.value.preferences);
    setDraft(result.value.preferences);
    setLeadDaysText(String(result.value.preferences.lead_days));
    setSubscriptions(result.value.subscriptions);
    setWorkerHeartbeats(result.value.workerHeartbeats);
    setRetryAction(null);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [refreshNonce]);

  const save = async () => {
    const leadDays = Number(leadDaysText);
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 14) {
      setError("알림 기간은 0일부터 14일 사이의 정수로 입력해 주세요.");
      return;
    }
    if ((draft.quiet_hours_start === null) !== (draft.quiet_hours_end === null)) {
      setError("조용한 시간은 시작·종료 시간을 함께 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setRetryAction(null);
    try {
      const updated = await mealApi.updateNotificationPreferences({ ...draft, lead_days: leadDays });
      if (!updated) throw new Error("notification-preferences-update-empty");
      setPreferences(updated);
      setDraft(updated);
      setLeadDaysText(String(updated.lead_days));
      setNotice("알림 설정을 저장했어요");
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiNotificationPreferencesPersistenceError(reason)
          ? "알림 설정을 저장하지 못했어요. 기존 설정을 유지했어요."
          : "알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setRetryAction({ kind: "save" });
      }
    } finally {
      setSaving(false);
    }
  };

  const subscribePush = async () => {
    if (!configuredVapidPublicKey) {
      setError("푸시 발송 서버 설정이 아직 준비되지 않았어요.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("이 브라우저에서는 기기 알림을 사용할 수 없어요.");
      return;
    }
    setSubscribing(true);
    setError("");
    setRetryAction(null);
    try {
      if (!("Notification" in window)) throw new Error("notification-api-unavailable");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("notification-permission-denied");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(configuredVapidPublicKey) });
      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) throw new Error("push-subscription-incomplete");
      const registered = await mealApi.registerPushSubscription({ endpoint, p256dh, auth });
      if (!registered) throw new Error("push-subscription-empty");
      setSubscriptions((current) => [registered, ...current.filter((item) => item.endpoint_fingerprint !== registered.endpoint_fingerprint)]);
      setDraft((current) => ({ ...current, push_enabled: true }));
      setNotice("이 기기를 푸시 알림 기기로 연결했어요");
    } catch (error) {
      if (isMealApiPushSubscriptionPersistenceError(error)) {
        setError("이 기기의 푸시 연결을 저장하지 못했어요. 기존 연결을 유지했어요.");
        setRetryAction({ kind: "subscribe" });
      } else {
        setError(error instanceof Error && error.message === "notification-permission-denied" ? "알림 권한이 허용되지 않아 연결하지 못했어요. 브라우저 설정에서 허용해 주세요." : "이 기기의 푸시 알림을 연결하지 못했어요.");
      }
    } finally {
      setSubscribing(false);
    }
  };

  const removePushSubscription = async (subscription: ApiPushSubscriptionSummary) => {
    setRemovingFingerprint(subscription.endpoint_fingerprint);
    setError("");
    setRetryAction(null);
    try {
      const result = await mealApi.removePushSubscription(subscription.endpoint_fingerprint);
      if (!result) throw new Error("push-subscription-remove-empty");
      setSubscriptions((current) => current.filter((item) => item.endpoint_fingerprint !== subscription.endpoint_fingerprint));
      let browserUnsubscribeNeedsReview = false;
      try {
        browserUnsubscribeNeedsReview = await unsubscribeMatchingPush(subscription.endpoint_fingerprint);
      } catch {
        browserUnsubscribeNeedsReview = true;
      }
      setNotice(browserUnsubscribeNeedsReview ? "서버 연결은 해지했지만 브라우저 알림 설정을 한 번 더 확인해 주세요" : result.removed ? "푸시 알림 기기 연결을 해지했어요" : "이미 해지된 푸시 알림 기기예요");
      setRetryAction(null);
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiPushSubscriptionPersistenceError(reason)
          ? "이 기기의 푸시 연결을 해지하지 못했어요. 기존 연결을 유지했어요."
          : "푸시 알림 기기 연결을 해지하지 못했어요.");
        setRetryAction({ kind: "remove", subscription });
      }
    } finally {
      setRemovingFingerprint("");
    }
  };

  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const workerHeartbeat = workerHeartbeats[0] ?? null;

  const retry = () => {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "refresh") void refresh();
    else if (action.kind === "save") void save();
    else if (action.kind === "subscribe") void subscribePush();
    else if (action.kind === "remove") void removePushSubscription(action.subscription);
  };

  return (
    <section className="notification-preferences-panel" aria-labelledby="notification-preferences-title">
      <div className="notification-preferences-heading">
        <span className="notification-preferences-icon"><BellIcon width={17} height={17} /></span>
        <div><h3 id="notification-preferences-title">알림 설정</h3><p>확인할 시점과 이 기기 알림을 정해요.</p></div>
        <button className="grocy-refresh-button" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "확인 중" : "새로고침"}</button>
      </div>
      {loading && !preferences ? <div className="account-loading" role="status">알림 설정을 불러오고 있어요</div> : (
        <>
          <div className="notification-preferences-card">
            <div className="notification-preference-toggle-row"><span><strong>앱 내 알림</strong><small>확인할 날짜와 동기화 상태를 앱에서 보여줘요.</small></span><button className={`toggle ${draft.in_app_enabled ? "toggle-on" : ""}`} type="button" role="switch" aria-label="앱 내 알림" aria-checked={draft.in_app_enabled} onClick={() => setDraft((current) => ({ ...current, in_app_enabled: !current.in_app_enabled }))}><span /></button></div>
            <div className="notification-preference-row"><span><strong>미리 확인할 기간</strong><small>표시 날짜·추정 우선순위 알림을 며칠 전부터 볼까요?</small></span><span className="notification-days-input"><KeyboardInput className="grocy-number-input" type="number" inputMode="numeric" min={0} max={14} value={leadDaysText} aria-label="알림 미리 확인 기간" onChange={(event) => setLeadDaysText(event.target.value)} onBlur={() => keyboard.hide()} /><small>일 전</small></span></div>
            <div className="notification-preference-row"><span><strong>알림 시간대</strong><small>날짜와 조용한 시간을 이 시간대 기준으로 계산해요.</small></span><span className="notification-timezone-control"><select className="notification-timezone-select" aria-label="알림 시간대" value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}>{notificationTimezoneOptions(draft.timezone, detectedTimezone).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{detectedTimezone && detectedTimezone !== draft.timezone ? <button className="notification-timezone-device-button" type="button" onClick={() => setDraft((current) => ({ ...current, timezone: detectedTimezone }))}>현재 기기 시간 사용</button> : null}</span></div>
            <div className="notification-preference-row"><span><strong>조용한 시간</strong><small>푸시 알림을 켠 경우 이 시간에는 보내지 않아요.</small></span><span className="notification-time-inputs"><KeyboardInput className="grocy-number-input" type="time" value={draft.quiet_hours_start ?? ""} aria-label="조용한 시간 시작" onChange={(event) => setDraft((current) => ({ ...current, quiet_hours_start: event.target.value || null }))} onBlur={() => keyboard.hide()} /><span>~</span><KeyboardInput className="grocy-number-input" type="time" value={draft.quiet_hours_end ?? ""} aria-label="조용한 시간 종료" onChange={(event) => setDraft((current) => ({ ...current, quiet_hours_end: event.target.value || null }))} onBlur={() => keyboard.hide()} /></span></div>
            <button className="primary-sheet-button notification-preferences-save" type="button" disabled={saving || !preferences} aria-busy={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); void save(); }}>{saving ? "저장 중" : "알림 설정 저장"}<ArrowRightIcon width={15} height={15} /></button>
          </div>
          <div className="push-subscription-card">
            <div className="push-subscription-heading"><span><strong>기기 알림</strong><small>브라우저를 닫아도 확인할 알림을 받을 수 있어요.</small></span><span className={`receipt-privacy-badge ${subscriptions.length ? "receipt-privacy-badge-redacted" : ""}`}>{subscriptions.length ? `연결된 기기 ${subscriptions.length}개` : "연결된 기기 없음"}</span></div>
            <div className="notification-delivery-status"><span><strong>푸시 전달 상태</strong><small>{workerHeartbeat ? workerHeartbeat.push_configured ? workerHeartbeat.last_error ? "확인 필요 · 알림 서버 전달 상태를 확인해 주세요." : `정상 · 마지막 확인 ${formatWorkerTime(workerHeartbeat.last_tick_at)} · ${workerHeartbeat.succeeded}건 전달${workerHeartbeat.cancelled ? ` · ${workerHeartbeat.cancelled}건 읽음 후 취소` : ""}` : "알림 서버가 아직 준비되지 않았어요." : "푸시 알림 서버 상태를 아직 확인하지 못했어요."}</small></span><span className={`notification-delivery-badge ${workerHeartbeat?.push_configured && !workerHeartbeat.last_error ? "notification-delivery-badge-ready" : ""}`}>{workerHeartbeat?.push_configured && !workerHeartbeat.last_error ? "준비됨" : "대기"}</span></div>
            <div className="notification-preference-toggle-row"><span><strong>푸시 알림</strong><small>{subscriptions.length ? "연결된 기기에 날짜·동기화 알림을 보낼 준비가 됐어요." : "먼저 이 기기를 연결해 주세요."}</small></span><button className={`toggle ${draft.push_enabled ? "toggle-on" : ""}`} type="button" role="switch" aria-label="푸시 알림" aria-checked={draft.push_enabled} disabled={!subscriptions.length && !draft.push_enabled} onClick={() => setDraft((current) => ({ ...current, push_enabled: !current.push_enabled }))}><span /></button></div>
            <button className="secondary-sheet-button push-subscribe-button" type="button" disabled={subscribing || !pushSupported || !configuredVapidPublicKey} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); void subscribePush(); }}>{subscribing ? "연결 중" : configuredVapidPublicKey ? "이 기기에서 푸시 연결" : "서버 설정 후 연결 가능"}</button>
            {subscriptions.length ? <div className="push-subscription-list" role="list">{subscriptions.map((subscription) => <div className="push-subscription-row" role="listitem" key={subscription.endpoint_fingerprint}><span><strong>이 기기</strong><small>등록 {formatPushSubscriptionTime(subscription.created_at)} · 이 기기에서 연결됨</small></span><button type="button" disabled={removingFingerprint === subscription.endpoint_fingerprint} onClick={() => void removePushSubscription(subscription)}>{removingFingerprint === subscription.endpoint_fingerprint ? "해지 중" : "연결 해지"}</button></div>)}</div> : null}
            <p className="push-subscription-footnote"><InfoCircledIcon width={14} height={14} /> 푸시 발송은 사용자가 명시적으로 켜고, 알림 서버가 준비된 경우에만 시도합니다.</p>
          </div>
        </>
      )}
      {notice ? <div className="grocy-success notification-settings-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? <div className="account-error notification-settings-error" role="alert" aria-busy={loading || saving}><InfoCircledIcon width={15} height={15} /><span>{loading || saving ? "알림 설정을 다시 저장하는 중이에요." : error}</span>{retryAction ? <button className="account-error-action" type="button" disabled={loading || saving} aria-busy={loading || saving} onClick={retry}>{loading || saving ? "확인 중" : retryAction.kind === "refresh" ? "최신 상태 확인" : "다시 시도"}</button> : null}</div> : null}
    </section>
  );
}

function PasswordChangePanel() {
  const keyboard = useKeyboard();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async () => {
    keyboard.hide();
    setError("");
    setNotice("");
    if (currentPassword.length < 8) {
      setError("현재 비밀번호를 확인해 주세요.");
      return;
    }
    if (newPassword.length < 8) {
      setError("새 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호와 확인 비밀번호가 같지 않아요.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }
    setBusy(true);
    try {
      const session = await mealApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      if (!session) throw new Error("password-change-empty");
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("비밀번호를 변경했어요. 다른 기기의 기존 로그인은 다시 인증이 필요해요.");
    } catch (reason) {
      setError(reason instanceof MealApiError && reason.status === 429
        ? "시도 횟수가 많아요. 잠시 후 다시 비밀번호를 변경해 주세요."
        : reason instanceof MealApiError && reason.status === 401
          ? "현재 비밀번호를 확인해 주세요."
          : "비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="password-change-panel" aria-label="비밀번호 변경">
      {!open ? <button className="account-security-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setError(""); setNotice(""); setOpen(true); }}><span><strong>비밀번호 변경</strong><small>변경하면 다른 기기의 로그인도 다시 확인해야 해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : (
        <>
          <div className="password-change-heading"><div><h3 id="password-change-title">비밀번호 변경</h3><p>새 비밀번호를 저장하면 다른 기기의 로그인도 다시 확인해야 해요.</p></div><button className="grocy-refresh-button" type="button" onClick={() => { keyboard.hide(); setOpen(false); setError(""); }}>닫기</button></div>
          <div className="password-change-form">
            <label className="app-input-label" htmlFor="current-password-input">현재 비밀번호</label>
            <KeyboardInput id="current-password-input" className="app-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            <label className="app-input-label" htmlFor="new-password-input">새 비밀번호</label>
            <KeyboardInput id="new-password-input" className="app-input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            <label className="app-input-label" htmlFor="confirm-password-input">새 비밀번호 확인</label>
            <KeyboardInput id="confirm-password-input" className="app-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            {error ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
            <button className="primary-sheet-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit()}>{busy ? "변경 중" : "비밀번호 변경 저장"}<ArrowRightIcon width={15} height={15} /></button>
          </div>
        </>
      )}
      {error && !open ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
      {notice ? <div className="grocy-success" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
    </section>
  );
}

function AccountDeletionPanel({ onDeleted }: { onDeleted: () => void | Promise<void> }) {
  const keyboard = useKeyboard();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryableFailure, setRetryableFailure] = useState(false);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!retryableFailure || busy) return;
    const frame = window.requestAnimationFrame(() => {
      retryButtonRef.current?.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
      retryButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, retryableFailure]);

  const submit = async () => {
    keyboard.hide();
    setError("");
    setRetryableFailure(false);
    if (currentPassword.length < 8) {
      setError("현재 비밀번호를 확인해 주세요.");
      return;
    }
    if (confirmation.trim() !== "DELETE") {
      setError("확인 문구에 DELETE를 정확히 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await mealApi.deleteAccount({ current_password: currentPassword, confirmation: "DELETE" });
      if (!result || result.status !== "deleted") throw new Error("account-delete-empty");
      clearStoredGuestTransfer();
      await onDeleted();
    } catch (reason) {
      const deletionPersistenceFailure = isMealApiAccountDeletionPersistenceError(reason);
      setError(reason instanceof MealApiError && reason.status === 429
        ? "시도 횟수가 많아요. 잠시 후 계정 삭제를 다시 시도해 주세요."
        : reason instanceof MealApiError && reason.status === 401
          ? "현재 비밀번호를 확인해 주세요."
          : deletionPersistenceFailure || reason instanceof MealApiError && reason.status === 503
            ? "삭제 작업이 아직 끝나지 않았어요. 같은 화면에서 잠시 후 다시 시도해 주세요."
          : "계정과 데이터를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setRetryableFailure(deletionPersistenceFailure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-delete-panel" aria-label="계정 삭제">
      {!open ? <button className="account-danger-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setError(""); setRetryableFailure(false); setOpen(true); }}><span><strong>계정 삭제</strong><small>계정과 이 공간의 기록을 영구적으로 삭제해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : (
        <>
          <div className="account-delete-heading"><div><h3>계정 삭제</h3><p>삭제하면 식품·영수증·식단·알림 설정을 되돌릴 수 없어요.</p></div><button className="grocy-refresh-button" type="button" onClick={() => { keyboard.hide(); setOpen(false); setError(""); setRetryableFailure(false); }}>닫기</button></div>
          <div className="account-delete-form">
            <label className="app-input-label" htmlFor="delete-account-password-input">현재 비밀번호</label>
            <KeyboardInput id="delete-account-password-input" className="app-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            <label className="app-input-label" htmlFor="delete-account-confirmation-input">확인 문구 <small>DELETE 입력</small></label>
            <KeyboardInput id="delete-account-confirmation-input" className="app-input" type="text" autoComplete="off" value={confirmation} placeholder="DELETE" aria-label="계정 삭제 확인 문구" onChange={(event) => setConfirmation(event.target.value)} onBlur={() => keyboard.hide()} />
            {error ? <div className="account-error" role="alert" aria-busy={busy}><InfoCircledIcon width={15} height={15} /><span>{busy ? "계정 삭제를 다시 처리하는 중이에요." : error}</span>{retryableFailure ? <button ref={retryButtonRef} className="account-error-action" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit()}>{busy ? "다시 시도 중" : "다시 시도"}</button> : null}</div> : null}
            <button className="danger-sheet-button account-delete-submit" type="button" disabled={busy || currentPassword.length < 8 || confirmation.trim() !== "DELETE"} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit()}>{busy ? "삭제 중" : "계정과 데이터 영구 삭제"}</button>
          </div>
          <p className="account-delete-warning"><InfoCircledIcon width={14} height={14} /> 서버 백업·외부 재고 연동 서비스의 보존 정책은 별도일 수 있어요. 삭제 요청 후에는 다시 로그인할 수 없습니다.</p>
        </>
      )}
    </section>
  );
}

function PasswordRecoveryPanel({ initialToken, onAuthenticated }: { initialToken?: string; onAuthenticated: AuthenticatedCallback }) {
  const keyboard = useKeyboard();
  const [open, setOpen] = useState(Boolean(initialToken));
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resetEmailRef = useRef<HTMLInputElement | null>(null);
  const resetNewPasswordRef = useRef<HTMLInputElement | null>(null);
  const recoveryFocusHandledRef = useRef(false);

  useEffect(() => {
    if (!open || initialToken) {
      recoveryFocusHandledRef.current = false;
      return;
    }
    if (recoveryFocusHandledRef.current) return;
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        const canTakeFocus = activeElement === document.body
          || activeElement === document.documentElement
          || !activeElement?.isConnected
          || (activeElement instanceof HTMLElement && Boolean(activeElement.closest(".account-security-button, .account-tab, .sheet-close-button")));
        const target = resetEmailRef.current;
        if (!canTakeFocus || !target) return;
        target.scrollIntoView({ behavior: "auto", block: "nearest" });
        target.focus({ preventScroll: true });
        recoveryFocusHandledRef.current = true;
      });
    });
    return () => {
      if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [initialToken, open]);

  useEffect(() => {
    if (!open || !error || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const target = initialToken ? resetNewPasswordRef.current : resetEmailRef.current;
      target?.scrollIntoView({ behavior: "auto", block: "nearest" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, error, initialToken, open]);

  const requestReset = async () => {
    keyboard.hide();
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const response = await mealApi.requestPasswordReset(email.trim());
      if (!response) throw new Error("password-reset-request-empty");
      setNotice(response.message);
      setEmail("");
    } catch {
      setError("비밀번호 재설정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const completeReset = async () => {
    keyboard.hide();
    setError("");
    setNotice("");
    if (!initialToken) {
      setError("재설정 링크를 확인할 수 없어요.");
      return;
    }
    if (newPassword.length < 8) {
      setError("새 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호와 확인 비밀번호가 같지 않아요.");
      return;
    }
    setBusy(true);
    try {
      const session = await mealApi.completePasswordReset(initialToken, newPassword);
      if (!session) throw new Error("password-reset-complete-empty");
      await onAuthenticated(session);
    } catch (reason) {
      setError(reason instanceof MealApiError && reason.status === 400
        ? "재설정 링크가 만료되었거나 이미 사용되었어요."
        : "비밀번호를 재설정하지 못했어요. 링크와 네트워크 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="password-recovery-panel" aria-label="비밀번호 재설정">
      {!open ? <button className="account-security-button" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); setError(""); setNotice(""); setOpen(true); }}><span><strong>비밀번호를 잊으셨나요?</strong><small>등록된 이메일로 재설정 안내를 요청해요.</small></span><ArrowRightIcon width={15} height={15} /></button> : initialToken ? (
        <>
          <div className="password-change-heading"><div><h3>새 비밀번호 설정</h3><p>재설정 링크는 한 번만 사용할 수 있고 30분 뒤 만료돼요.</p></div><button className="grocy-refresh-button" type="button" onClick={() => { keyboard.hide(); setOpen(false); setError(""); }}>닫기</button></div>
          <div className="password-change-form">
            <label className="app-input-label" htmlFor="reset-new-password-input">새 비밀번호</label>
            <KeyboardInput ref={resetNewPasswordRef} id="reset-new-password-input" className="app-input" type="password" autoComplete="new-password" value={newPassword} aria-invalid={Boolean(error)} aria-describedby={error ? "password-recovery-error" : undefined} onChange={(event) => setNewPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            <label className="app-input-label" htmlFor="reset-confirm-password-input">새 비밀번호 확인</label>
            <KeyboardInput id="reset-confirm-password-input" className="app-input" type="password" autoComplete="new-password" value={confirmPassword} aria-invalid={Boolean(error)} aria-describedby={error ? "password-recovery-error" : undefined} onChange={(event) => setConfirmPassword(event.target.value)} onBlur={() => keyboard.hide()} />
            {error ? <div id="password-recovery-error" className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
            <button className="primary-sheet-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void completeReset()}>{busy ? "저장 중" : "새 비밀번호 저장"}<ArrowRightIcon width={15} height={15} /></button>
          </div>
        </>
      ) : (
        <>
          <div className="password-change-heading"><div><h3>비밀번호 재설정 요청</h3><p>계정에 등록된 이메일로 안내를 보내요.</p></div><button className="grocy-refresh-button" type="button" onClick={() => { keyboard.hide(); setOpen(false); setError(""); }}>닫기</button></div>
          <div className="password-change-form">
            <label className="app-input-label" htmlFor="reset-email-input">계정 이메일</label>
            <KeyboardInput ref={resetEmailRef} id="reset-email-input" className="app-input" type="email" autoComplete="email" value={email} aria-invalid={Boolean(error)} aria-describedby={error ? "password-recovery-error" : undefined} onChange={(event) => setEmail(event.target.value)} onBlur={() => keyboard.hide()} />
            {error ? <div id="password-recovery-error" className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
            <button className="primary-sheet-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void requestReset()}>{busy ? "요청 중" : "재설정 안내 요청"}<ArrowRightIcon width={15} height={15} /></button>
          </div>
        </>
      )}
      {error && !open ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
      {notice ? <div className="grocy-success" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
    </section>
  );
}

function GuestTransferPanel({
  preview,
  onImport,
  onSkip,
  onConflict,
}: {
  preview: ApiGuestTransferPreview;
  onImport: () => Promise<void>;
  onSkip: () => Promise<void>;
  onConflict?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      importButtonRef.current?.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
      importButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const submit = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      if (isMealApiConflictError(reason) && onConflict) {
        try {
          await onConflict();
          return;
        } catch {
          setError("계정 기록 공간이 변경됐어요. 최신 게스트 기록을 다시 확인해 주세요.");
          return;
        }
      }
      setError(isMealApiGuestTransferPersistenceError(reason)
        ? "게스트 기록을 저장하지 못했어요. 기존 계정 기록은 유지됐어요. 같은 버튼으로 다시 시도해 주세요."
        : "게스트 기록을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const transferSummaryItems = [
    preview.food_count ? `식품 ${preview.food_count}개` : null,
    preview.receipt_count ? `영수증 ${preview.receipt_count}개` : null,
    preview.storage_event_count ? `보관 기록 ${preview.storage_event_count}개` : null,
    preview.storage_location_count ? `보관 위치 ${preview.storage_location_count}개` : null,
    preview.meal_plan_count ? `식단 ${preview.meal_plan_count}개` : null,
    preview.multi_day_plan_count ? `3일 계획 ${preview.multi_day_plan_count}개` : null,
    preview.shopping_list_count ? `장보기 ${preview.shopping_list_count}개` : null,
    preview.shopping_receive_operation_count ? `입고 확인 ${preview.shopping_receive_operation_count}개` : null,
    preview.meal_preferences_changed ? "식단 조건" : null,
    preview.notification_preferences_changed ? "알림 설정" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="guest-transfer-panel" aria-labelledby="guest-transfer-title">
      <div className="guest-transfer-heading">
        <span className="guest-transfer-icon"><ReaderIcon width={17} height={17} /></span>
        <div><h3 id="guest-transfer-title">게스트 기록을 가져올까요?</h3><p>방금까지 이 기기에서 기록한 내용을 계정 기록으로 복사해요.</p></div>
      </div>
      <div className="guest-transfer-summary" role="status">
        <strong>가져올 기록</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {transferSummaryItems.map((item) => <span key={item} style={{ display: "inline-flex", padding: "4px 6px", borderRadius: 7, background: "color-mix(in srgb, var(--meal-sage-dark) 9%, transparent)" }}>{item}</span>)}
        </div>
      </div>
      <p className="guest-transfer-note"><InfoCircledIcon width={14} height={14} /> 게스트 기록은 삭제하지 않아요. 계정에 이미 기록이 있으면 자동으로 섞지 않고 확인을 요청해요.</p>
      {error ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
      <div className="guest-transfer-actions">
        <button ref={importButtonRef} className="primary-sheet-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit(onImport)}>{busy ? "처리 중이에요" : "게스트 기록 가져오기"}<ArrowRightIcon width={15} height={15} /></button>
        <button className="secondary-sheet-button" type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit(onSkip)}>계정만 사용</button>
      </div>
    </section>
  );
}

function GuestTransferRetryPanel({
  message,
  onRetry,
  onSkip,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let attempts = 0;
    let timer: number | undefined;
    let settleTimer: number | undefined;
    const focusRetry = () => {
      const target = retryButtonRef.current;
      if (target && !target.disabled) {
        target.scrollIntoView({ behavior: getMobileScrollBehavior(), block: "nearest" });
        target.focus({ preventScroll: true });
        let settles = 0;
        const settleFocus = () => {
          target.focus({ preventScroll: true });
          if (++settles >= 12 && settleTimer !== undefined) {
            window.clearInterval(settleTimer);
            settleTimer = undefined;
          }
        };
        settleTimer = window.setInterval(settleFocus, 80);
        return;
      }
      if (attempts++ < 12) timer = window.setTimeout(focusRetry, 80);
    };
    focusRetry();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (settleTimer !== undefined) window.clearInterval(settleTimer);
    };
  }, []);

  const submit = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="guest-transfer-panel guest-transfer-panel-warning" aria-labelledby="guest-transfer-retry-title">
      <div className="guest-transfer-heading">
        <span className="guest-transfer-icon"><InfoCircledIcon width={17} height={17} /></span>
        <div><h3 id="guest-transfer-retry-title">게스트 기록을 아직 확인하지 못했어요</h3><p>{guestTransferMessage(message)}</p></div>
      </div>
      <p className="guest-transfer-note"><InfoCircledIcon width={14} height={14} /> 게스트 기록은 삭제되지 않아요. 지금 건너뛰어도 같은 계정으로 다시 들어오면 이어서 가져올 수 있어요.</p>
      {error ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
      <div className="guest-transfer-actions">
        <button ref={retryButtonRef} className="primary-sheet-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit(onRetry)}>{busy ? "확인 중이에요" : "다시 확인"}<ArrowRightIcon width={15} height={15} /></button>
        <button className="secondary-sheet-button" type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void submit(onSkip)}>계정만 사용</button>
      </div>
    </section>
  );
}

function WorkspaceDataExportPanel({ workspaceSync }: { workspaceSync: WorkspaceSyncCoordinator }) {
  const keyboard = useKeyboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const exportData = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await workspaceSync.run("account-export", (signal) => mealApi.exportWorkspaceData(signal));
      if (!result.current) return;
      if (result.error) throw result.error;
      const payload = result.value;
      if (!payload) throw new Error("workspace-export-empty");
      const exportedDate = payload.exported_at.slice(0, 10) || "latest";
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rescue-meal-export-${exportedDate}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("내 식품 기록을 내보냈어요");
    } catch (reason) {
      setError(isMealApiWorkspaceConflictError(reason)
        ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
        : isMealApiExportRateLimitError(reason)
          ? "데이터 내보내기 요청이 많아요. 잠시 후 다시 시도해 주세요."
        : isMealApiExportAuditPersistenceError(reason)
          ? "데이터 내보내기 감사 기록을 저장하지 못했어요. 파일을 만들지 않고 잠시 후 다시 시도해 주세요."
        : "내 식품 기록을 내보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-export-panel" aria-labelledby="workspace-export-title">
      <div className="workspace-export-heading"><span className="workspace-export-icon"><ReaderIcon width={17} height={17} /></span><div><h3 id="workspace-export-title">내 데이터 내보내기</h3><p>다른 곳에 보관할 수 있는 파일 사본을 만들어요.</p></div></div>
      <div className="workspace-export-note"><InfoCircledIcon width={15} height={15} /><span>재고·사용자 정의 보관 위치·구매 요약·보관 기록·식단·입고 중복 방지 기록·알림 설정을 포함하고, 비밀번호·로그인 정보·원본에서 읽어낸 문자 내용·푸시 연결 주소는 포함하지 않아요.</span></div>
      {error ? <div className="account-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span></div> : null}
      {notice ? <div className="grocy-success" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      <button className="secondary-sheet-button workspace-export-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => { keyboard.hide(); void exportData(); }}>{busy ? "파일을 준비하는 중" : "내 데이터 파일 다운로드"}<ArrowRightIcon width={15} height={15} /></button>
    </section>
  );
}

function StorageLocationPanel({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const keyboard = useKeyboard();
  const [locations, setLocations] = useState<ApiStorageLocation[]>([]);
  const [name, setName] = useState("");
  const [storageType, setStorageType] = useState<ApiStorageType>("refrigerated");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const revisionRef = useRef<number | null>(null);
  const loadingRef = useRef(true);
  const busyRef = useRef(false);
  const pollingInFlightRef = useRef(false);
  const customLocations = locations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));

  const readRevision = async () => {
    const result = await workspaceSync.run("storage-locations", (signal) => mealApi.getStorageLocationRevision(signal));
    if (!result.current || result.error || !result.value) return null;
    const revision = result.value.revision;
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
  };

  const refresh = async (nextNotice?: string) => {
    loadingRef.current = true;
    setLoading(true);
    setError("");
    setNotice("");
    setRetryAction(null);
    const result = await workspaceSync.run("storage-locations", (signal) => mealApi.getStorageLocations(signal));
    if (!result.current) {
      loadingRef.current = false;
      setLoading(false);
      return false;
    }
    try {
      if (result.error) throw result.error;
      if (!result.value) throw new Error("storage-locations-empty");
      setLocations(result.value);
      const revision = await readRevision();
      if (revision !== null) revisionRef.current = revision;
      if (nextNotice) setNotice(nextNotice);
      return true;
    } catch (reason) {
      setError(isMealApiAuthError(reason)
        ? "로그인이 만료됐어요. 다시 로그인해 주세요."
        : isMealApiWorkspaceConflictError(reason)
          ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
          : "보관 위치를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setRetryAction(() => () => { void refresh(); });
      return false;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refreshNonce]);

  const probeRevision = async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (loadingRef.current || busyRef.current || pollingInFlightRef.current) return;
    pollingInFlightRef.current = true;
    try {
      const previousRevision = revisionRef.current;
      const revision = await readRevision();
      if (revision === null) return;
      if (previousRevision !== null && revision !== previousRevision) {
        setEditingId(null);
        setEditingName("");
        setConfirmingDeleteId(null);
        keyboard.hide();
        await refresh("다른 기기에서 보관 위치가 바뀌어 최신 목록을 불러왔어요.");
        return;
      }
      revisionRef.current = revision;
    } finally {
      pollingInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!mealApi.isConfigured || typeof window === "undefined" || typeof document === "undefined") return;
    const interval = window.setInterval(() => { void probeRevision(); }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void probeRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshNonce, workspaceSync]);

  const handleMutationError = (reason: unknown, retry: () => void) => {
    const conflict = reason instanceof MealApiError && reason.status === 409;
    setError(isMealApiAuthError(reason)
      ? "로그인이 만료됐어요. 다시 로그인해 주세요."
      : isMealApiWorkspaceConflictError(reason)
        ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
        : conflict && reason.code === "storage_location_duplicate"
          ? "같은 보관 방식에 같은 이름의 위치가 이미 있어요. 다른 이름을 사용해 주세요."
          : conflict && reason.code === "storage_location_in_use"
            ? "현재 식품이나 과거 보관·입고 기록이 이 위치를 참조해 삭제할 수 없어요. 이름을 바꾸거나 다른 위치를 사용해 주세요."
            : isMealApiStorageLocationPersistenceError(reason)
              ? "보관 위치를 저장하지 못했어요. 기존 위치를 유지했어요."
              : "보관 위치를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.");
    const canRetry = isMealApiAuthError(reason)
      || isMealApiWorkspaceConflictError(reason)
      || isMealApiStorageLocationPersistenceError(reason)
      || (conflict && reason.code !== "storage_location_in_use" && reason.code !== "storage_location_duplicate");
    setRetryAction(canRetry ? () => retry : null);
  };

  const createLocation = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("보관 위치 이름을 입력해 주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setRetryAction(null);
    try {
      const created = await mealApi.createStorageLocation(normalizedName, storageType);
      if (!created) throw new Error("storage-location-create-empty");
      setLocations((current) => [...current.filter((location) => location.id !== created.id), created]);
      setName("");
      setNotice(`보관 위치를 추가했어요: ${created.name}`);
      keyboard.hide();
    } catch (reason) {
      handleMutationError(reason, () => void createLocation());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const beginEdit = (location: ApiStorageLocation) => {
    keyboard.hide();
    setError("");
    setNotice("");
    setConfirmingDeleteId(null);
    setEditingId(location.id);
    setEditingName(location.name);
  };

  const cancelEdit = () => {
    keyboard.hide();
    setEditingId(null);
    setEditingName("");
  };

  const saveLocation = async (location: ApiStorageLocation) => {
    const normalizedName = editingName.trim();
    if (!normalizedName) {
      setError("보관 위치 이름을 입력해 주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setRetryAction(null);
    try {
      const updated = await mealApi.updateStorageLocation(location.id, normalizedName);
      if (!updated) throw new Error("storage-location-update-empty");
      setLocations((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setEditingId(null);
      setEditingName("");
      setNotice(`${updated.name}으로 보관 위치 이름을 바꿨어요`);
      keyboard.hide();
    } catch (reason) {
      handleMutationError(reason, () => void saveLocation(location));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const deleteLocation = async (location: ApiStorageLocation) => {
    if (confirmingDeleteId !== location.id) {
      setConfirmingDeleteId(location.id);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setRetryAction(null);
    try {
      const deleted = await mealApi.deleteStorageLocation(location.id);
      if (!deleted?.deleted) throw new Error("storage-location-delete-empty");
      setLocations((current) => current.filter((candidate) => candidate.id !== location.id));
      setConfirmingDeleteId(null);
      setNotice(`보관 위치를 삭제했어요: ${location.name}`);
    } catch (reason) {
      handleMutationError(reason, () => void deleteLocation(location));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="storage-location-panel" aria-labelledby="storage-location-title">
      <div className="storage-location-heading">
        <span className="storage-location-icon"><SewingPinIcon width={17} height={17} /></span>
        <div><h3 id="storage-location-title">내 보관 위치</h3><p>냉장고 칸이나 김치냉장고처럼 실제 위치를 더 정확히 기록해요.</p></div>
        <button className="grocy-refresh-button" type="button" disabled={loading || busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void refresh(); }} onClick={(event) => { if (event.detail === 0) void refresh(); }}>{loading ? "확인 중" : "새로고침"}</button>
      </div>
      <div className="storage-location-note"><InfoCircledIcon width={15} height={15} /><span>실온·냉장·냉동 분류는 유지하고, 아래 이름은 사용자의 저장 위치로만 추가돼요.</span></div>
      {error ? <div className="account-error storage-location-error" role="alert" aria-busy={busy}><InfoCircledIcon width={15} height={15} /><span>{busy ? "보관 위치를 다시 확인하는 중이에요." : error}</span>{retryAction ? <button className="account-error-action" type="button" disabled={busy} aria-busy={busy} onClick={retryAction}>{busy ? "확인 중" : "다시 시도"}</button> : null}</div> : null}
      {notice ? <div className="grocy-success" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      <form className="storage-location-create-form" onSubmit={(event) => { event.preventDefault(); void createLocation(); }}>
        <label className="storage-location-name-field"><span>새 위치 이름</span><KeyboardInput className="app-input" value={name} maxLength={80} autoComplete="off" placeholder="예: 김치냉장고" aria-label="새 보관 위치 이름" onChange={(event) => { setName(event.target.value); setError(""); }} onBlur={() => keyboard.hide()} /></label>
        <div className="storage-location-type-field"><span>기본 분류</span><div className="storage-location-type-options" role="group" aria-label="새 보관 위치 기본 분류">{STORAGE_OPTIONS.map((option) => <button key={option.value} className={storageType === option.value ? "storage-location-type-option storage-location-type-option-active" : "storage-location-type-option"} type="button" aria-pressed={storageType === option.value} onPointerDown={(event) => event.preventDefault()} onClick={() => setStorageType(option.value)}>{option.label}</button>)}</div></div>
        <button className="primary-sheet-button storage-location-create-button" type="submit" disabled={busy || loading || !name.trim()} onPointerDown={(event) => event.preventDefault()}>{busy ? "저장 중" : "보관 위치 추가"}<ArrowRightIcon width={15} height={15} /></button>
      </form>
      {loading && !locations.length ? <div className="account-loading" role="status">보관 위치를 불러오고 있어요</div> : customLocations.length ? <div className="storage-location-list" role="list" aria-label="사용자 정의 보관 위치 목록">{customLocations.map((location) => <div className="storage-location-row" role="listitem" key={location.id}>{editingId === location.id ? <div className="storage-location-edit"><KeyboardInput className="app-input" value={editingName} maxLength={80} autoComplete="off" aria-label={`${location.name} 보관 위치 이름 수정`} onChange={(event) => { setEditingName(event.target.value); setError(""); }} onBlur={() => keyboard.hide()} /><div><button className="grocy-refresh-button" type="button" disabled={busy || !editingName.trim()} onPointerDown={(event) => event.preventDefault()} onClick={() => void saveLocation(location)}>저장</button><button className="grocy-refresh-button" type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={cancelEdit}>취소</button></div></div> : <><span className="storage-location-row-copy"><strong>{location.name}</strong><small>{location.storage_type === "refrigerated" ? "냉장" : location.storage_type === "frozen" ? "냉동" : "실온"} 분류 · 식품 추가·입고에서 선택할 수 있어요.</small></span><span className="storage-location-row-actions"><button className="grocy-refresh-button" type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => beginEdit(location)}>이름 수정</button><button className="grocy-refresh-button storage-location-delete-button" type="button" disabled={busy} onPointerDown={(event) => event.preventDefault()} onClick={() => void deleteLocation(location)}>{confirmingDeleteId === location.id ? "한 번 더 삭제" : "삭제"}</button></span></>}</div>)}</div> : <div className="storage-location-empty" aria-live="polite"><strong>추가한 위치가 아직 없어요</strong><small>이름을 만들면 식품을 반영할 때 기본 분류와 함께 선택할 수 있어요.</small></div>}
      <p className="storage-location-footnote"><InfoCircledIcon width={14} height={14} />현재 식품이나 과거 보관·입고 기록이 참조하는 위치는 이름을 보존하기 위해 삭제할 수 없어요. 다른 기기 변경은 화면을 다시 볼 때 자동으로 확인해요.</p>
    </section>
  );
}

function ReceiptPrivacyPanel({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const [policy, setPolicy] = useState<ApiReceiptPrivacyPolicy | null>(null);
  const [receipts, setReceipts] = useState<ApiReceiptSummary[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAction, setRetryAction] = useState<ReceiptPrivacyRetryAction | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    setRetryAction(null);
    const result = await workspaceSync.run("account-receipt-privacy", async (signal) => {
      const [nextPolicy, nextReceipts] = await Promise.all([
        mealApi.getReceiptPrivacyPolicy(signal),
        mealApi.getReceiptSummaries(signal),
      ]);
      if (!nextPolicy || !nextReceipts) throw new Error("receipt-privacy-empty");
      return { policy: nextPolicy, receipts: nextReceipts };
    });
    if (!result.current) return;
    if (result.error || !result.value) {
      setError("영수증 개인정보 설정을 불러오지 못했어요.");
      setRetryAction({ kind: "refresh" });
      setLoading(false);
      return;
    }
    setPolicy(result.value.policy);
    setReceipts(result.value.receipts);
    setRetryAction(null);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [refreshNonce]);

  const erase = async (receipt: ApiReceiptSummary) => {
    setBusyId(receipt.id);
    setError("");
    setRetryAction(null);
    try {
      const result = await mealApi.privacyEraseReceipt(receipt.id);
      if (!result) throw new Error("receipt-privacy-erase-empty");
      setConfirmingId(null);
      setNotice(result.status === "deleted_draft"
        ? "검토 중인 영수증 원본 정보를 삭제했어요"
        : "영수증 원본 정보를 삭제했고 재고 기록은 유지했어요");
      await refresh();
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiReceiptPrivacyPersistenceError(reason)
          ? "영수증 원본 정보를 저장하지 못했어요. 기존 영수증 상태를 유지했어요."
          : "영수증 원본 정보를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setRetryAction({ kind: "erase", receipt });
      }
    } finally {
      setBusyId(null);
    }
  };

  const retry = () => {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "refresh") void refresh();
    else void erase(action.receipt);
  };

  return (
    <section className="receipt-privacy-panel" aria-labelledby="receipt-privacy-title">
      <div className="receipt-privacy-heading">
        <span className="receipt-privacy-icon"><ReaderIcon width={17} height={17} /></span>
        <div><h3 id="receipt-privacy-title">영수증 원본 관리</h3><p>원본과 재고 기록을 분리해 관리해요.</p></div>
        <button className="grocy-refresh-button" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "확인 중" : "새로고침"}</button>
      </div>
      {policy ? <div className="privacy-policy-card" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>원본 사진은 저장하지 않아요</strong><small>{policy.message}</small></span></div> : null}
      {error ? <div className="account-error receipt-privacy-error" role="alert" aria-busy={busyId !== null}><InfoCircledIcon width={15} height={15} /><span>{busyId !== null ? "영수증 개인정보 상태를 다시 확인하는 중이에요." : error}</span>{retryAction ? <button className="account-error-action" type="button" onClick={retry} disabled={busyId !== null} aria-busy={busyId !== null}>{busyId !== null ? "확인 중" : retryAction.kind === "refresh" ? "최신 상태 확인" : "다시 시도"}</button> : null}</div> : null}
      {notice ? <div className="grocy-success" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {loading && !receipts.length ? <div className="account-loading" role="status">영수증 기록을 불러오고 있어요</div> : receipts.length ? (
        <div className="receipt-privacy-list">
          {receipts.map((receipt) => {
            const busy = busyId === receipt.id;
            const confirming = confirmingId === receipt.id;
            return (
              <div className="receipt-privacy-row" key={receipt.id}>
                <div className="receipt-privacy-copy"><strong>{receipt.merchant_name ? `${receipt.merchant_name} · ` : ""}{formatReceiptPurchaseDate(receipt.purchased_at)} 영수증</strong><small>{receiptStatusLabel(receipt.status)} · 상품 {receipt.line_count}개{receipt.stock_created ? " · 재고 연결됨" : " · 아직 재고에 반영하지 않음"}</small></div>
                <span className={`receipt-privacy-badge ${receipt.source_redacted ? "receipt-privacy-badge-redacted" : ""}`}>{receipt.source_redacted ? "원본 정보 삭제됨" : "원본 정보 보관 중"}</span>
                {receipt.source_redacted ? null : confirming ? (
                  <div className="receipt-privacy-confirm" role="alert"><small>{receipt.stock_created ? "재고·거래 기록은 유지하고 파일 이름과 읽어낸 문자 내용만 삭제해요." : "아직 재고에 반영하지 않은 영수증 기본 기록 정보를 삭제해요."}</small><div><button className="secondary-sheet-button" type="button" disabled={busy} onClick={() => setConfirmingId(null)}>취소</button><button className="danger-sheet-button" type="button" disabled={busy} onClick={() => void erase(receipt)}>{busy ? "삭제 중" : "삭제 확인"}</button></div></div>
                ) : <button className="receipt-privacy-delete" type="button" onClick={() => setConfirmingId(receipt.id)}>영수증 원본 정보 삭제</button>}
              </div>
            );
          })}
        </div>
      ) : <div className="receipt-privacy-empty"><CheckCircledIcon width={20} height={20} /><strong>등록된 영수증 기록이 없어요</strong><small>영수증을 반영하면 원본 관리 상태를 여기에서 확인할 수 있어요.</small></div>}
      <p className="receipt-privacy-footnote"><InfoCircledIcon width={14} height={14} /> 삭제 후에도 이미 재고에 반영된 식품의 구매 출처와 수량 기록은 보존됩니다. 소비기한이나 식품 안전 판정과는 별도예요.</p>
    </section>
  );
}

function AccountArchiveDisclosure({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="grocy-settings-block account-archive-disclosure" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="grocy-block-heading"><strong>기록 관리</strong><small>데이터 내보내기·영수증 원본 관리</small></summary>
      {open ? <div>
        <WorkspaceDataExportPanel workspaceSync={workspaceSync} />
        <ReceiptPrivacyPanel refreshNonce={refreshNonce} workspaceSync={workspaceSync} />
      </div> : null}
    </details>
  );
}

function AccountNotificationDisclosure({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="grocy-settings-block account-notification-disclosure" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="grocy-block-heading"><strong>알림 설정</strong><small>앱·기기 알림·조용한 시간</small></summary>
      {open ? <NotificationPreferencesPanel refreshNonce={refreshNonce} workspaceSync={workspaceSync} /> : null}
    </details>
  );
}

function AccountStorageDisclosure({ workspaceSync, refreshNonce }: { workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="grocy-settings-block account-storage-disclosure" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="grocy-block-heading"><strong>보관 위치 설정</strong><small>식품 추가·입고에서 선택할 위치를 관리해요.</small></summary>
      {open ? <StorageLocationPanel refreshNonce={refreshNonce} workspaceSync={workspaceSync} /> : null}
    </details>
  );
}

function GrocyIntegrationPanel({ active, workspaceSync, refreshNonce, focusGrocyOutboxId, returnToNotification = false, onReturnToNotification, onOpenFoodFromSync, onRefreshWorkspace }: { active: boolean; workspaceSync: WorkspaceSyncCoordinator; refreshNonce: number; focusGrocyOutboxId?: string | null; returnToNotification?: boolean; onReturnToNotification?: () => void; onOpenFoodFromSync?: (foodId: string, canonicalName: string, outboxId?: string) => void; onRefreshWorkspace?: () => Promise<boolean> }) {
  const keyboard = useKeyboard();
  const [status, setStatus] = useState<ApiGrocyStatus | null>(null);
  const [locationMappings, setLocationMappings] = useState<ApiGrocyLocationMapping[]>([]);
  const [productMappings, setProductMappings] = useState<ApiGrocyProductMapping[]>([]);
  const [workerHeartbeats, setWorkerHeartbeats] = useState<ApiGrocyWorkerHeartbeat[]>([]);
  const [outbox, setOutbox] = useState<ApiGrocyOutboxRecord[]>([]);
  const [locationDrafts, setLocationDrafts] = useState<Record<ApiStorageType, string>>({ ambient: "", refrigerated: "", frozen: "" });
  const [productDrafts, setProductDrafts] = useState<Record<string, { productId: string; unit: string }>>({});
  const [productQuery, setProductQuery] = useState("");
  const [editingProductKey, setEditingProductKey] = useState("");
  const [mappingHistoryKey, setMappingHistoryKey] = useState("");
  const [mappingEvents, setMappingEvents] = useState<Record<string, ApiGrocyProductMappingAuditEvent[]>>({});
  const [mappingEventsLoading, setMappingEventsLoading] = useState("");
  const [reconciliationDrafts, setReconciliationDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAction, setRetryAction] = useState<GrocyRetryAction | null>(null);
  const [workspaceReadbackStale, setWorkspaceReadbackStale] = useState(false);
  const [workspaceReadbackRefreshing, setWorkspaceReadbackRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBlockRef = useRef<HTMLDetailsElement | null>(null);
  const deadLetterBlockRef = useRef<HTMLDivElement | null>(null);
  const reconciliationBlockRef = useRef<HTMLDivElement | null>(null);
  const productTaskBlockRef = useRef<HTMLDivElement | null>(null);
  const processOutboxButtonRef = useRef<HTMLButtonElement | null>(null);
  const grocyPanelRef = useRef<HTMLElement | null>(null);
  const mappingSaveNoticeRef = useRef<string | null>(null);
  const [completedOutboxFocusId, setCompletedOutboxFocusId] = useState<string | null>(null);
  const focusedOutboxRef = useRef<string | null>(null);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    if (!retryAction) return;
    const frame = window.requestAnimationFrame(() => {
      grocyPanelRef.current?.querySelector<HTMLElement>(".grocy-error .account-error-action")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [retryAction]);

  const refresh = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    setRetryAction(null);
    const result = await workspaceSync.run("account-grocy", async (signal) => {
      const [nextStatus, nextLocations, nextProducts, nextOutbox, nextWorkerHeartbeats] = await Promise.all([
        mealApi.getGrocyStatus(signal),
        mealApi.getGrocyLocationMappings(signal),
        mealApi.getGrocyProductMappings(signal),
        mealApi.getGrocyOutbox(undefined, signal),
        mealApi.getGrocyWorkerStatus(signal),
      ]);
      if (!nextStatus || !nextLocations || !nextProducts || !nextOutbox || !nextWorkerHeartbeats) throw new Error("grocy-settings-empty");
      return { status: nextStatus, locations: nextLocations, products: nextProducts, outbox: nextOutbox, workerHeartbeats: nextWorkerHeartbeats };
    });
    if (!result.current) return;
    if (result.error || !result.value) {
      setError("외부 재고 설정을 불러오지 못했어요. 서버 연결 상태를 확인해 주세요.");
      setRetryAction({ kind: "refresh" });
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { status: nextStatus, locations: nextLocations, products: nextProducts, outbox: nextOutbox, workerHeartbeats: nextWorkerHeartbeats } = result.value;
    setStatus(nextStatus);
    setLocationMappings(nextLocations);
    setProductMappings(nextProducts);
    setOutbox(nextOutbox);
    setWorkerHeartbeats(nextWorkerHeartbeats);
    setLocationDrafts((current) => {
        const next = { ...current };
        nextLocations.forEach((mapping) => {
          if (!next[mapping.storage_type]) next[mapping.storage_type] = String(mapping.grocy_location_id);
        });
        return next;
    });
    setProductDrafts((current) => {
        const next = { ...current };
        nextProducts.forEach((mapping) => {
          const key = productMappingKey(mapping.canonical_name);
          if (!next[key]) next[key] = { productId: String(mapping.grocy_product_id), unit: mapping.grocy_unit ?? "" };
        });
        nextOutbox.filter((record) => record.status === "blocked").forEach((record) => {
          const mapping = nextProducts.find((item) => sameName(item.canonical_name, record.canonical_name) && sameUnit(item.grocy_unit, record.unit));
          const key = productTaskKey(record);
          if (!next[key]) {
            next[key] = { productId: mapping ? String(mapping.grocy_product_id) : "", unit: mapping?.grocy_unit ?? record.unit };
          }
        });
        return next;
    });
    setReconciliationDrafts((current) => {
        const next = { ...current };
        nextOutbox.filter((record) => record.status === "reconciliation_required").forEach((record) => {
          if (!next[record.id]) next[record.id] = record.grocy_transaction_id ?? "";
        });
        return next;
    });
    setLoading(false);
    setRefreshing(false);
    setRetryAction(null);
  };

  const refreshParentWorkspace = async () => {
    if (workspaceReadbackRefreshing) return false;
    setWorkspaceReadbackRefreshing(true);
    try {
      const synced = await onRefreshWorkspace?.();
      setWorkspaceReadbackStale(synced === false);
      if (synced) setNotice((current) => current.replace(" 홈·알림 최신 상태는 다시 연결한 뒤 확인해 주세요.", ""));
      return synced;
    } finally {
      setWorkspaceReadbackRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, [refreshNonce]);

  const blockedOutbox = outbox.filter((record) => record.status === "blocked");
  const pendingOutbox = outbox.filter((record) => record.status === "pending");
  const inFlightOutbox = outbox.filter((record) => record.status === "in_flight");
  const reconciliationOutbox = outbox.filter((record) => record.status === "reconciliation_required");
  const deadLetterOutbox = outbox.filter((record) => record.status === "dead_letter");
  const actionableOutbox = [...outbox]
    .filter((record) => record.status !== "succeeded")
    .sort((left, right) => {
      const priority = (status: ApiGrocyOutboxRecord["status"]) => status === "blocked" ? 0 : status === "reconciliation_required" ? 1 : status === "dead_letter" ? 2 : status === "pending" ? 3 : 4;
      return priority(left.status) - priority(right.status);
    });
  const workerHeartbeat = workerHeartbeats[0] ?? null;
  const visibleProductMappings = productMappings.filter((mapping) => !productQuery.trim() || normalized(mapping.canonical_name).includes(normalized(productQuery)));
  const productTasks = Array.from(
    new Map(
      blockedOutbox
        .filter((record) => !productMappings.some((mapping) => sameName(mapping.canonical_name, record.canonical_name) && sameUnit(mapping.grocy_unit, record.unit)))
        .map((record) => [productTaskKey(record), record]),
  ).values(),
  );
  const recentlySucceededOutbox = outbox
    .filter((record) => record.status === "succeeded")
    .sort((left, right) => {
      const leftTime = Date.parse(left.updated_at);
      const rightTime = Date.parse(right.updated_at);
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    })
    .slice(0, 3);
  const outboxCardHeading = blockedOutbox.length || reconciliationOutbox.length || deadLetterOutbox.length || productTasks.length
    ? "확인할 동기화 작업"
    : inFlightOutbox.length
      ? "외부 반영 중"
      : pendingOutbox.length
        ? "외부 반영 대기 중"
      : recentlySucceededOutbox.length
        ? "최근 외부 반영 완료"
        : "동기화 대기 없음";
  const outboxCardSummary = blockedOutbox.length || pendingOutbox.length || inFlightOutbox.length || reconciliationOutbox.length || deadLetterOutbox.length
    ? `${blockedOutbox.length ? `확인 필요 ${blockedOutbox.length}건` : "막힌 작업 없음"} · ${pendingOutbox.length}건 처리 대기${inFlightOutbox.length ? ` · 처리 중 ${inFlightOutbox.length}건` : ""}${reconciliationOutbox.length ? ` · 확인 필요 ${reconciliationOutbox.length}건` : ""}${deadLetterOutbox.length ? ` · 실패 ${deadLetterOutbox.length}건` : ""}`
    : recentlySucceededOutbox.length
      ? `최근 ${recentlySucceededOutbox.length}건 반영 완료 · 추가 처리 대기 없음`
      : "막힌 작업 없음 · 0건 처리 대기";
  const outboxCardState = blockedOutbox.length || reconciliationOutbox.length || deadLetterOutbox.length || productTasks.length
    ? "attention"
    : inFlightOutbox.length
      ? "processing"
      : pendingOutbox.length
        ? "pending"
        : "clear";

  useEffect(() => {
    const attentionCount = deadLetterOutbox.length + reconciliationOutbox.length + productTasks.length;
    if (!attentionCount) return;
    const frame = window.requestAnimationFrame(() => {
      if (settingsBlockRef.current && !settingsBlockRef.current.open) {
        settingsBlockRef.current.open = true;
        setSettingsOpen(true);
      }
      (deadLetterBlockRef.current ?? reconciliationBlockRef.current ?? productTaskBlockRef.current)?.scrollIntoView({ behavior: "auto", block: "center" });
      deadLetterBlockRef.current
        ?.querySelector<HTMLElement>(".grocy-dead-letter-row .grocy-save-button:not([disabled])")
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deadLetterOutbox.length, reconciliationOutbox.length, productTasks.length]);

  useEffect(() => {
    const reopened = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    const reopenedRecord = reopened && !focusGrocyOutboxId
      ? outbox.find((record) => record.id === focusedOutboxRef.current)
      : null;
    const reopenFocusId = reopenedRecord?.status === "succeeded"
      ? actionableOutbox[0]?.id ?? null
      : focusedOutboxRef.current;
    const requestedFocusId = focusGrocyOutboxId ?? (reopened ? reopenFocusId : null);
    if (!active || !requestedFocusId || loading) {
      return;
    }
    if ((focusedOutboxRef.current === requestedFocusId && !reopened) || !outbox.some((record) => record.id === requestedFocusId)) return;
    const frame = window.requestAnimationFrame(() => {
      if (settingsBlockRef.current && !settingsBlockRef.current.open) {
        settingsBlockRef.current.open = true;
        setSettingsOpen(true);
      }
      const target = Array.from(grocyPanelRef.current?.querySelectorAll<HTMLElement>("[data-grocy-outbox-details]") ?? [])
        .find((element) => element.dataset.grocyOutboxDetails === requestedFocusId);
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        target.scrollIntoView({ behavior: "auto", block: "center" });
        target.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      } else {
        const productTask = Array.from(grocyPanelRef.current?.querySelectorAll<HTMLElement>("[data-grocy-outbox-task]") ?? [])
          .find((element) => element.dataset.grocyOutboxTask === requestedFocusId);
        if (productTask) {
          productTask.scrollIntoView({ behavior: "auto", block: "center" });
          productTask.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
          if (document.activeElement !== productTask && !productTask.contains(document.activeElement)) productTask.focus({ preventScroll: true });
        }
      }
      focusedOutboxRef.current = requestedFocusId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, focusGrocyOutboxId, loading, outbox]);

  useEffect(() => {
    const persistedCompletedOutboxId = readCompletedOutboxHandoff(workspaceSync.currentWorkspaceKey)?.outboxId ?? null;
    const completedOutboxId = completedOutboxFocusId ?? persistedCompletedOutboxId;
    if (!completedOutboxId || refreshing) return;
    const target = Array.from(grocyPanelRef.current?.querySelectorAll<HTMLElement>("[data-grocy-outbox-details]") ?? [])
      .find((element) => element.dataset.grocyOutboxDetails === completedOutboxId);
    if (!(target instanceof HTMLDetailsElement)) return;
    const frame = window.requestAnimationFrame(() => {
      target.open = true;
      target.scrollIntoView({ behavior: "auto", block: "center" });
      target.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      setCompletedOutboxFocusId(null);
      clearCompletedOutboxHandoff();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, completedOutboxFocusId, outbox, refreshing]);

  useEffect(() => {
    const canonicalName = mappingSaveNoticeRef.current;
    if (!canonicalName || loading || error) return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingOutbox.length) {
        setNotice(`${canonicalName} 상품 매핑을 저장했어요. 외부 재고 ${pendingOutbox.length}건이 처리 대기 중이에요.`);
        processOutboxButtonRef.current?.focus({ preventScroll: true });
      } else {
        setNotice(`${canonicalName} 상품 매핑을 저장했어요.`);
      }
      mappingSaveNoticeRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, loading, pendingOutbox.length]);

  const saveLocation = async (storageType: ApiStorageType) => {
    const value = Number.parseInt(locationDrafts[storageType] ?? "", 10);
    if (!Number.isInteger(value) || value <= 0) {
      setError("외부 재고 위치 번호는 1 이상의 숫자로 입력해 주세요.");
      return;
    }
    setSavingKey(`location:${storageType}`);
    setError("");
    setRetryAction(null);
    try {
      await mealApi.upsertGrocyLocationMapping(storageType, value);
      setNotice(`${STORAGE_OPTIONS.find((item) => item.value === storageType)?.label} 보관 위치를 저장했어요.`);
      await refresh();
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiGrocyLocationMappingPersistenceError(reason)
          ? "보관 위치 매핑을 저장하지 못했어요. 기존 매핑과 동기화 대기 상태를 유지했어요."
          : "보관 위치 매핑을 저장하지 못했어요.");
        setRetryAction({ kind: "location", storageType });
      }
    } finally {
      setSavingKey("");
    }
  };

  const saveProductMapping = async (canonicalName: string, draftKey: string, fallbackUnit: string) => {
    const draft = productDrafts[draftKey];
    const productId = Number.parseInt(draft?.productId ?? "", 10);
    const unit = draft?.unit.trim() || fallbackUnit.trim();
    if (!Number.isInteger(productId) || productId <= 0 || !unit) {
      setError("외부 상품 번호와 Rescue Meal 단위를 모두 입력해 주세요.");
      return;
    }
    setSavingKey(`product:${draftKey}`);
    setError("");
    setRetryAction(null);
    try {
      await mealApi.upsertGrocyProductMapping(canonicalName, { grocy_product_id: productId, grocy_unit: unit });
      mappingSaveNoticeRef.current = canonicalName;
      setNotice(`${canonicalName} 상품 매핑을 저장했어요.`);
      setEditingProductKey("");
      await refresh();
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiGrocyMappingPersistenceError(reason)
          ? "상품 매핑을 저장하지 못했어요. 기존 매핑과 동기화 대기 상태를 유지했어요."
          : "상품 매핑을 저장하지 못했어요.");
        setRetryAction({ kind: "product", canonicalName, draftKey, fallbackUnit });
      }
    } finally {
      setSavingKey("");
    }
  };

  const saveProduct = async (record: ApiGrocyOutboxRecord) => {
    await saveProductMapping(record.canonical_name, productTaskKey(record), record.unit);
  };

  const toggleProductHistory = async (mapping: ApiGrocyProductMapping) => {
    const key = productMappingKey(mapping.canonical_name);
    if (mappingHistoryKey === key) {
      setMappingHistoryKey("");
      return;
    }
    setMappingHistoryKey(key);
    setMappingEventsLoading(key);
    setError("");
    try {
      const events = await mealApi.getGrocyProductMappingEvents(mapping.canonical_name);
      if (!events) throw new Error("grocy-mapping-events-empty");
      setMappingEvents((current) => ({ ...current, [key]: events }));
    } catch {
      setMappingHistoryKey("");
      setError("상품 매핑 변경 이력을 불러오지 못했어요.");
    } finally {
      setMappingEventsLoading("");
    }
  };

  const processOutbox = async () => {
    if (!pendingOutbox.length || processing) return;
    setProcessing(true);
    setError("");
    try {
      const result = await mealApi.processGrocyOutbox(100);
      if (!result) throw new Error("grocy-process-empty");
      const completedOutboxId = result.records.find((record) => record.status === "succeeded")?.id ?? null;
      setCompletedOutboxFocusId(completedOutboxId);
      if (completedOutboxId) writeCompletedOutboxHandoff(completedOutboxId, workspaceSync.currentWorkspaceKey);
      setNotice(`외부 재고 동기화 ${result.succeeded}건을 완료하고 ${result.retried}건을 재시도 대기했어요.`);
      await refresh();
      const workspaceSynced = await refreshParentWorkspace();
      if (workspaceSynced === false) setNotice((current) => `${current} 홈·알림 최신 상태는 다시 연결한 뒤 확인해 주세요.`);
    } catch (reason) {
      setError(isMealApiWorkspaceConflictError(reason)
        ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
        : "외부 재고 동기화를 실행하지 못했어요. 연결 상태와 상품 연결을 확인해 주세요.");
    } finally {
      setProcessing(false);
    }
  };

  const scanReconciliation = async () => {
    if (!inFlightOutbox.length || scanning) return;
    setScanning(true);
    setError("");
    try {
      const result = await mealApi.scanGrocyOutboxReconciliation();
      if (!result) throw new Error("grocy-reconciliation-scan-empty");
      setNotice(result.marked ? `외부 반영 확인이 필요한 작업 ${result.marked}건을 찾았어요.` : "오래된 외부 처리 작업이 없어요.");
      await refresh();
      const workspaceSynced = await refreshParentWorkspace();
      if (workspaceSynced === false) setNotice((current) => `${current} 홈·알림 최신 상태는 다시 연결한 뒤 확인해 주세요.`);
    } catch (reason) {
      setError(isMealApiWorkspaceConflictError(reason)
        ? MEAL_API_WORKSPACE_CONFLICT_MESSAGE
        : "외부 반영 확인 작업을 찾지 못했어요.");
    } finally {
      setScanning(false);
    }
  };

  const reconcileOutbox = async (record: ApiGrocyOutboxRecord, decision: "already_applied" | "not_applied") => {
    if (savingKey) return;
    const transactionId = reconciliationDrafts[record.id]?.trim() ?? "";
    if (decision === "already_applied" && !transactionId) {
      setError("반영됨으로 처리하려면 외부 작업 번호를 입력해 주세요.");
      return;
    }
    const key = `reconcile:${record.id}`;
    setSavingKey(key);
    setError("");
    setRetryAction(null);
    try {
      await mealApi.reconcileGrocyOutbox(record.id, {
        decision,
        grocy_transaction_id: decision === "already_applied" ? transactionId : undefined,
        operator_note: decision === "already_applied" ? "운영자가 외부 재고 반영을 확인" : "운영자가 미반영을 확인",
      });
      setNotice(decision === "already_applied" ? `${record.canonical_name} 작업을 반영 완료로 확인했어요.` : `${record.canonical_name} 작업을 재시도 대기로 돌렸어요.`);
      await refresh();
      const workspaceSynced = await refreshParentWorkspace();
      if (workspaceSynced === false) setNotice((current) => `${current} 홈·알림 최신 상태는 다시 연결한 뒤 확인해 주세요.`);
      if (decision === "not_applied") window.requestAnimationFrame(() => processOutboxButtonRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiGrocyOutboxPersistenceError(reason)
          ? "외부 반영 상태를 저장하지 못했어요. 기존 상태를 유지했어요."
          : "외부 반영 상태를 저장하지 못했어요.");
        setRetryAction({ kind: "reconcile", record, decision });
      }
    } finally {
      setSavingKey("");
    }
  };

  const retryOutbox = async (record: ApiGrocyOutboxRecord) => {
    if (savingKey) return;
    setSavingKey(`retry:${record.id}`);
    setError("");
    setRetryAction(null);
    try {
      await mealApi.retryGrocyOutbox(record.id, "사용자가 설정 화면에서 재시도");
      setNotice(`${record.canonical_name} ${operationLabel(record)} 작업을 재시도 대기로 돌렸어요.`);
      await refresh();
      const workspaceSynced = await refreshParentWorkspace();
      if (workspaceSynced === false) setNotice((current) => `${current} 홈·알림 최신 상태는 다시 연결한 뒤 확인해 주세요.`);
      window.requestAnimationFrame(() => processOutboxButtonRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      if (isMealApiWorkspaceConflictError(reason)) {
        setError(MEAL_API_WORKSPACE_CONFLICT_MESSAGE);
        setRetryAction({ kind: "refresh" });
      } else {
        setError(isMealApiGrocyOutboxPersistenceError(reason)
          ? "실패한 외부 재고 작업을 재시도 대기로 돌리지 못했어요. 기존 상태를 유지했어요."
          : "실패한 외부 재고 작업을 재시도 대기로 돌리지 못했어요.");
        setRetryAction({ kind: "retry", record });
      }
    } finally {
      setSavingKey("");
    }
  };

  const retry = () => {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "refresh") void refresh();
    else if (action.kind === "location") void saveLocation(action.storageType);
    else if (action.kind === "product") void saveProductMapping(action.canonicalName, action.draftKey, action.fallbackUnit);
    else if (action.kind === "reconcile") void reconcileOutbox(action.record, action.decision);
    else void retryOutbox(action.record);
  };

  return (
    <section ref={grocyPanelRef} className="grocy-integration" aria-labelledby="grocy-integration-title">
      <div className="grocy-integration-heading">
        <span className="grocy-integration-icon"><SewingPinIcon width={17} height={17} /></span>
        <div>
          <h3 id="grocy-integration-title">외부 재고 연동</h3>
          <p>입고·먹음·폐기·보관 이동을 연결한 재고 서비스와 함께 관리해요.</p>
        </div>
        <button className="grocy-refresh-button" type="button" aria-label="외부 재고 연동 설정 새로고침" disabled={loading || refreshing} aria-busy={loading || refreshing} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void refresh(); }} onClick={(event) => { if (event.detail === 0) void refresh(); }}>
          {refreshing ? "확인 중" : "새로고침"}
        </button>
      </div>

      <div className={`grocy-status-card grocy-status-${status?.status ?? "loading"}`} data-status={status?.status ?? "loading"}>
        <span className="grocy-status-dot" />
        <div><strong>{grocyStatusLabel(status?.status)}{status?.version ? ` · v${status.version}` : ""}</strong><small>{status ? grocyStatusDetail(status.detail, status.configured) : (loading ? "서버 설정을 확인하고 있어요." : "상태를 읽지 못했어요.")}</small></div>
      </div>

      <div className={`grocy-worker-card ${workerHeartbeat?.last_error ? "grocy-worker-error" : ""}`} data-worker-state={workerHeartbeat ? workerHeartbeat.last_error ? "error" : "ready" : "unknown"}>
        <div><strong>자동 동기화 상태</strong><small>{status?.configured !== true ? "외부 재고 서비스 연결 후 자동 처리가 시작됩니다." : workerHeartbeat ? workerHeartbeat.last_error ? `마지막 실행 오류: ${externalInventoryDetail(workerHeartbeat.last_error, "자동 동기화 오류를 확인해 주세요.")}` : `마지막 확인 ${formatWorkerTime(workerHeartbeat.last_tick_at)} · ${workerHeartbeat.processed}건 처리` : "자동 동기화 확인을 아직 받지 못했어요."}</small></div>
        <span>{workerHeartbeat?.last_error ? "확인 필요" : workerHeartbeat ? "정상" : "대기 중"}</span>
      </div>

      {recentlySucceededOutbox.length ? (
        <div className="grocy-settings-block" data-testid="grocy-sync-history">
          <div className="grocy-block-heading"><strong>최근 반영 완료</strong><small>최근 외부 재고에 반영된 작업부터 보여드려요.</small></div>
          <div className="grocy-product-history" role="list" aria-label="최근 외부 재고 반영 이력">
            <div className="grocy-product-history-heading"><strong>{recentlySucceededOutbox.length}건 반영 완료</strong><small>최근 작업부터</small></div>
            {recentlySucceededOutbox.map((record) => {
              const foodId = outboxFoodId(record);
              return <div className="grocy-product-history-event" data-history-action="created" data-sync-history-state="applied" role="listitem" key={`sync-history:${record.id}`}>
                <div><strong>{record.canonical_name}</strong><small>{operationLabel(record)} · {formatMappingTime(record.updated_at)}</small></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}><small>{record.quantity}{record.unit} · 외부 작업 {record.grocy_transaction_id ? `#${record.grocy_transaction_id}` : "번호 기록 없음"}</small>{foodId && onOpenFoodFromSync ? <button className="grocy-refresh-button" type="button" aria-label={`${record.canonical_name} 반영 작업의 식품 기록 보기`} onPointerDown={(event) => event.preventDefault()} onClick={() => onOpenFoodFromSync(foodId, record.canonical_name, record.id)}>식품 기록 보기</button> : null}</div>
                <GrocyOutboxDetail record={record} onOpenFoodFromSync={onOpenFoodFromSync} />
              </div>;
            })}
          </div>
        </div>
      ) : null}

      {error ? <div className="account-error grocy-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span>{retryAction ? <button className="account-error-action" type="button" disabled={refreshing} aria-busy={refreshing} onClick={retry}>{retryAction.kind === "refresh" ? "최신 상태 확인" : "다시 시도"}</button> : null}</div> : null}
      {notice ? <div className={`grocy-success${workspaceReadbackStale ? " grocy-success-stale" : ""}`} data-readback-state={workspaceReadbackStale ? "stale" : "confirmed"} role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span>{workspaceReadbackStale && onRefreshWorkspace ? <button className="account-error-action" type="button" disabled={workspaceReadbackRefreshing} aria-busy={workspaceReadbackRefreshing} onClick={() => void refreshParentWorkspace()}>{workspaceReadbackRefreshing ? "최신 상태 확인 중" : "최신 상태 확인"}</button> : null}</div> : null}

      <details ref={settingsBlockRef} className="grocy-settings-block" onToggle={(event) => setSettingsOpen(event.currentTarget.open)}>
        <summary className="grocy-block-heading"><strong>상세 연결 설정</strong><small>{blockedOutbox.length + reconciliationOutbox.length + deadLetterOutbox.length + productTasks.length ? `확인이 필요한 작업 ${blockedOutbox.length + reconciliationOutbox.length + deadLetterOutbox.length + productTasks.length}건이 있어요.` : "보관 위치·상품 매핑·실패 작업을 직접 관리해요."}</small></summary>
        <div>
      <div className="grocy-settings-block">
        <div className="grocy-block-heading"><strong>보관 위치 연결</strong><small>외부 재고 서비스에서 사용하는 위치 번호를 연결해요.</small></div>
        <div className="grocy-location-list">
          {STORAGE_OPTIONS.map((option) => {
            const mapping = locationMappings.find((item) => item.storage_type === option.value);
            const value = locationDrafts[option.value] || (mapping ? String(mapping.grocy_location_id) : "");
            const disabled = status?.configured !== true || savingKey === `location:${option.value}`;
            return (
              <div className="grocy-location-row" key={option.value}>
                <div><strong>{option.label}</strong><small>{option.value}</small></div>
                <KeyboardInput className="grocy-number-input" type="number" inputMode="numeric" min={1} value={value} placeholder="예: 20" aria-label={`${option.label} 외부 재고 위치 번호`} disabled={status?.configured !== true} onChange={(event) => setLocationDrafts((current) => ({ ...current, [option.value]: event.target.value }))} onBlur={() => keyboard.hide()} />
                <button className="grocy-save-button" type="button" disabled={disabled} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void saveLocation(option.value); }} onClick={(event) => { if (event.detail === 0) void saveLocation(option.value); }}>{savingKey === `location:${option.value}` ? "저장 중" : "저장"}</button>
              </div>
            );
          })}
        </div>
        {status?.configured !== true ? <p className="grocy-inline-note"><InfoCircledIcon width={14} height={14} />외부 재고 서비스 주소와 연결 키는 서버 운영자가 설정해야 이 화면에서 매핑을 저장할 수 있어요.</p> : null}
      </div>

      {productTasks.length ? (
        <div className="grocy-settings-block" ref={productTaskBlockRef}>
          <div className="grocy-block-heading"><strong>확인이 필요한 상품</strong><small>외부 재고에 상품 연결이 필요한 항목만 보여요.</small></div>
          <div className="grocy-product-task-list">
            {productTasks.map((record) => {
              const key = productTaskKey(record);
              const draft = productDrafts[key] ?? { productId: "", unit: record.unit };
              const busy = savingKey === `product:${key}`;
              return (
                <div className="grocy-product-task" key={key} data-grocy-outbox-task={record.id} role="group" aria-label={`${record.canonical_name} 외부 상품 연결 작업`} tabIndex={-1}>
                  <div className="grocy-product-task-copy"><strong>{record.canonical_name}</strong><small>{operationLabel(record)} · {record.quantity}{record.unit}</small></div>
                  <div className="grocy-product-task-fields">
                    <KeyboardInput className="grocy-number-input" type="number" inputMode="numeric" min={1} value={draft.productId} placeholder="상품 번호" aria-label={`${record.canonical_name} 외부 상품 번호`} disabled={status?.configured !== true || busy} onChange={(event) => setProductDrafts((current) => ({ ...current, [key]: { ...draft, productId: event.target.value } }))} onBlur={() => keyboard.hide()} />
                    <KeyboardInput className="grocy-unit-input" value={draft.unit} placeholder={record.unit} aria-label={`${record.canonical_name} 외부 상품 단위`} disabled={status?.configured !== true || busy} onChange={(event) => setProductDrafts((current) => ({ ...current, [key]: { ...draft, unit: event.target.value } }))} onBlur={() => keyboard.hide()} />
                    <button className="grocy-save-button" type="button" disabled={status?.configured !== true || busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void saveProduct(record); }} onClick={(event) => { if (event.detail === 0) void saveProduct(record); }}>{busy ? "저장 중" : "연결"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {productMappings.length ? (
        <div className="grocy-settings-block">
          <div className="grocy-block-heading"><strong>등록된 상품 연결</strong><small>저장된 외부 상품 번호와 단위를 검토하거나 수정해요.</small></div>
          <KeyboardInput className="grocy-mapping-search" value={productQuery} placeholder="상품명 검색" aria-label="등록된 외부 상품 매핑 검색" onChange={(event) => setProductQuery(event.target.value)} onBlur={() => keyboard.hide()} />
          <div className="grocy-product-catalog">
            {visibleProductMappings.length ? visibleProductMappings.map((mapping) => {
              const key = productMappingKey(mapping.canonical_name);
              const draft = productDrafts[key] ?? { productId: String(mapping.grocy_product_id), unit: mapping.grocy_unit ?? "" };
              const editing = editingProductKey === key;
              const busy = savingKey === `product:${key}`;
              return (
                <div className="grocy-product-catalog-item" key={key}>
                  <div className={`grocy-product-catalog-row ${editing ? "grocy-product-catalog-editing" : ""}`}>
                    {editing ? (
                      <>
                        <div className="grocy-product-task-fields">
                          <KeyboardInput className="grocy-number-input" type="number" inputMode="numeric" min={1} value={draft.productId} aria-label={`${mapping.canonical_name} 기존 외부 상품 번호`} disabled={busy} onChange={(event) => setProductDrafts((current) => ({ ...current, [key]: { ...draft, productId: event.target.value } }))} onBlur={() => keyboard.hide()} />
                          <KeyboardInput className="grocy-unit-input" value={draft.unit} aria-label={`${mapping.canonical_name} 기존 외부 상품 단위`} disabled={busy} onChange={(event) => setProductDrafts((current) => ({ ...current, [key]: { ...draft, unit: event.target.value } }))} onBlur={() => keyboard.hide()} />
                          <button className="grocy-save-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void saveProductMapping(mapping.canonical_name, key, mapping.grocy_unit ?? ""); }} onClick={(event) => { if (event.detail === 0) void saveProductMapping(mapping.canonical_name, key, mapping.grocy_unit ?? ""); }}>{busy ? "저장 중" : "저장"}</button>
                        </div>
                        <button className="grocy-cancel-button" type="button" disabled={busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); setEditingProductKey(""); }} onClick={(event) => { if (event.detail === 0) setEditingProductKey(""); }}>취소</button>
                      </>
                    ) : (
                      <>
                        <div className="grocy-product-catalog-copy"><strong>{mapping.canonical_name}</strong><small>외부 상품 #{mapping.grocy_product_id} · {mapping.grocy_unit ?? "단위 미확인"} · {mapping.updated_by_email ?? mapping.updated_by ?? "변경 주체 기록 없음"} · {formatMappingTime(mapping.updated_at)}</small></div>
                        <div className="grocy-product-catalog-actions">
                          <button className="grocy-refresh-button" type="button" aria-label={`${mapping.canonical_name} 매핑 수정`} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); setProductDrafts((current) => ({ ...current, [key]: { productId: String(mapping.grocy_product_id), unit: mapping.grocy_unit ?? "" } })); setEditingProductKey(key); }} onClick={(event) => { if (event.detail === 0) { setProductDrafts((current) => ({ ...current, [key]: { productId: String(mapping.grocy_product_id), unit: mapping.grocy_unit ?? "" } })); setEditingProductKey(key); } }}>수정</button>
                          <button className="grocy-refresh-button" type="button" aria-label={`${mapping.canonical_name} 매핑 이력 보기`} aria-expanded={mappingHistoryKey === key} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void toggleProductHistory(mapping); }} onClick={(event) => { if (event.detail === 0) void toggleProductHistory(mapping); }}>{mappingHistoryKey === key ? "닫기" : "이력"}</button>
                        </div>
                      </>
                    )}
                  </div>
                  {mappingHistoryKey === key ? (
                    <div className="grocy-product-history" role="region" aria-label={`${mapping.canonical_name} 매핑 변경 이력`}>
                      <div className="grocy-product-history-heading"><strong>변경 이력</strong><small>최근 변경부터 표시해요.</small></div>
                      {mappingEventsLoading === key ? <p className="grocy-inline-note">이력을 불러오는 중이에요.</p> : mappingEvents[key]?.length ? mappingEvents[key].map((event) => {
                        const actor = event.actor_email ?? event.actor_id;
                        const beforeProduct = event.before ? `외부 상품 #${event.before.grocy_product_id}` : "처음 연결";
                        const beforeUnit = event.before?.grocy_unit ?? "단위 미설정";
                        return (
                          <div className="grocy-product-history-event" key={event.id} data-history-action={event.action}>
                            <div><strong>{event.action === "created" ? "최초 연결" : "매핑 수정"}</strong><small>{actor} · {formatMappingTime(event.occurred_at)}</small></div>
                            <small>{beforeProduct} · {beforeUnit} → 외부 상품 #{event.after.grocy_product_id} · {event.after.grocy_unit ?? "단위 미설정"}</small>
                          </div>
                        );
                      }) : <p className="grocy-inline-note">아직 저장된 변경 이력이 없어요.</p>}
                    </div>
                  ) : null}
                </div>
              );
            }) : <p className="grocy-inline-note">검색어와 일치하는 상품 매핑이 없어요.</p>}
          </div>
        </div>
      ) : null}

      {reconciliationOutbox.length ? (
        <div className="grocy-settings-block" ref={reconciliationBlockRef}>
          <div className="grocy-block-heading"><strong>외부 반영 여부 확인</strong><small>호출 중 앱이 종료되어 자동 재시도하지 않는 작업이에요.</small></div>
          <div className="grocy-reconciliation-list">
            {reconciliationOutbox.map((record) => {
              const busy = savingKey === `reconcile:${record.id}`;
              return (
                <div className="grocy-reconciliation-row" key={record.id}>
                  <div className="grocy-reconciliation-copy"><div className="grocy-task-state-line"><strong>{record.canonical_name}</strong><span className="grocy-task-state-badge grocy-task-state-review">확인 필요</span></div><small>{operationLabel(record)} · {externalInventoryDetail(record.last_error, "외부 반영 여부 확인 필요")}</small></div>
                  <div className="grocy-reconciliation-actions" role="group" aria-label={`${record.canonical_name} 반영 여부 확인 행동`}>
                    <KeyboardInput className="grocy-transaction-input" value={reconciliationDrafts[record.id] ?? ""} placeholder="외부 작업 번호" aria-label={`${record.canonical_name} 외부 작업 번호`} disabled={busy} onChange={(event) => setReconciliationDrafts((current) => ({ ...current, [record.id]: event.target.value }))} onBlur={() => keyboard.hide()} />
                    <button className="grocy-save-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void reconcileOutbox(record, "already_applied"); }} onClick={(event) => { if (event.detail === 0) void reconcileOutbox(record, "already_applied"); }}>{busy ? "저장 중" : "반영됨"}</button>
                    <button className="grocy-retry-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void reconcileOutbox(record, "not_applied"); }} onClick={(event) => { if (event.detail === 0) void reconcileOutbox(record, "not_applied"); }}>미반영·재시도</button>
                  </div>
                  <GrocyOutboxDetail record={record} onOpenFoodFromSync={onOpenFoodFromSync} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {deadLetterOutbox.length ? (
        <div className="grocy-settings-block" ref={deadLetterBlockRef}>
          <div className="grocy-block-heading"><strong>재확인이 필요한 실패 작업</strong><small>외부 서버에 반영되지 않아 재시도를 기다리고 있어요.</small></div>
          <div className="grocy-dead-letter-list">
            {deadLetterOutbox.map((record) => {
              const busy = savingKey === `retry:${record.id}`;
              return (
                <div className="grocy-dead-letter-row" key={record.id}>
                  <div><div className="grocy-task-state-line"><strong>{record.canonical_name}</strong><span className="grocy-task-state-badge grocy-task-state-retry">재시도 대기</span></div><small>{operationLabel(record)} · {externalInventoryDetail(record.last_error ?? record.last_dead_letter_error, "외부 동기화 실패")}</small></div>
                  <button className="grocy-save-button" type="button" disabled={busy} aria-busy={busy} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void retryOutbox(record); }} onClick={(event) => { if (event.detail === 0) void retryOutbox(record); }}>{busy ? "재시도 중" : "재시도"}</button>
                <GrocyOutboxDetail record={record} onOpenFoodFromSync={onOpenFoodFromSync} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={`grocy-outbox-card grocy-outbox-card-${outboxCardState}`} data-outbox-overall-state={outboxCardState} data-sync-state={outboxCardState === "pending" ? "queued" : outboxCardState === "processing" ? "processing" : outboxCardState === "clear" ? "applied" : "action_required"} data-outbox-attention-count={blockedOutbox.length + reconciliationOutbox.length + deadLetterOutbox.length} data-outbox-pending-count={pendingOutbox.length} data-outbox-processing-count={inFlightOutbox.length} data-outbox-applied-count={recentlySucceededOutbox.length} role="group" aria-live="polite" aria-atomic="true" aria-relevant="text" aria-busy={processing || inFlightOutbox.length > 0} aria-label={`외부 동기화 작업 상태 · ${outboxCardHeading} · ${outboxCardSummary}`}>
        <div><strong>{outboxCardHeading}</strong><small>{outboxCardSummary}</small></div>
        {inFlightOutbox.length ? <button className="grocy-refresh-button" type="button" disabled={scanning} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void scanReconciliation(); }} onClick={(event) => { if (event.detail === 0) void scanReconciliation(); }}>{scanning ? "확인 중" : "오래된 작업 확인"}</button> : null}
          <button ref={processOutboxButtonRef} className="secondary-sheet-button grocy-process-button" type="button" disabled={status?.configured !== true || !pendingOutbox.length || processing} aria-busy={processing} onPointerDown={(event) => { event.preventDefault(); keyboard.hide(); void processOutbox(); }} onClick={(event) => { if (event.detail === 0) void processOutbox(); }}>{processing ? "동기화 중" : inFlightOutbox.length ? "반영 중" : pendingOutbox.length ? "지금 동기화" : recentlySucceededOutbox.length ? "반영 완료" : "지금 동기화"}{pendingOutbox.length ? <ArrowRightIcon width={15} height={15} /> : <CheckCircledIcon width={15} height={15} />}</button>
      </div>
        </div>
      </details>
    </section>
  );
}

export default function AccountSheet({
  active = false,
  initialPasswordResetToken,
  workspaceSync,
  workspaceTransport,
  remoteRefreshRequired = false,
  remoteRefreshing = false,
  refreshNonce = 0,
  onRefreshRemote,
  onRefreshWorkspace,
  focusGrocyOutboxId,
  returnToNotification = false,
  onReturnToNotification,
  onOpenFoodFromSync,
  onAuthenticated,
  onSignedOut,
  onAccountDeleted,
}: {
  active?: boolean;
  initialPasswordResetToken?: string;
  workspaceSync: WorkspaceSyncCoordinator;
  workspaceTransport: WorkspaceSyncTransport | null;
  remoteRefreshRequired?: boolean;
  remoteRefreshing?: boolean;
  refreshNonce?: number;
  onRefreshRemote?: () => void;
  focusGrocyOutboxId?: string | null;
  returnToNotification?: boolean;
  onReturnToNotification?: () => void;
  onOpenFoodFromSync?: (foodId: string, canonicalName: string, outboxId?: string) => void;
  onRefreshWorkspace?: () => Promise<boolean>;
  onAuthenticated: AuthenticatedCallback;
  onSignedOut: () => void | Promise<void>;
  onAccountDeleted?: () => void | Promise<void>;
}) {
  const keyboard = useKeyboard();
  const [authMe, setAuthMe] = useState<ApiAuthMe | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AccountMode>("login");
  const accountTabRefs = useRef<Record<AccountMode, HTMLButtonElement | null>>({ login: null, register: null });
  const accountEmailRef = useRef<HTMLInputElement | null>(null);
  const accountPasswordRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingGuestTransfer, setPendingGuestTransfer] = useState<{ session: ApiAuthSession; preview: ApiGuestTransferPreview | null; guestAccessToken: string; message: string } | null>(null);
  const guestTransferPreviewInFlightRef = useRef(false);
  const initialAuthFocusHandledRef = useRef(false);
  const [passwordResetToken] = useState(() => initialPasswordResetToken?.trim() || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset_token")?.trim() ?? "" : ""));
  const [externalRefreshNonce, setExternalRefreshNonce] = useState(0);
  const panelRefreshNonce = externalRefreshNonce + refreshNonce;
  const remoteRefreshNotice = remoteRefreshRequired ? <div className="account-error account-remote-refresh" role="alert" aria-busy={remoteRefreshing}><InfoCircledIcon width={16} height={16} /><span><strong>다른 기기에서 계정 설정이 변경됐어요</strong><small>현재 입력 중인 설정은 유지하고 있어요. 최신 상태를 확인하면 저장하지 않은 설정 draft가 최신 값으로 바뀔 수 있어요.</small></span><button className="account-error-action" type="button" disabled={remoteRefreshing} aria-busy={remoteRefreshing} onClick={() => onRefreshRemote?.()}>{remoteRefreshing ? "최신 상태 확인 중" : "최신 계정 설정 확인"}</button></div> : null;

  useEffect(() => {
    if (!active || !remoteRefreshRequired || focusGrocyOutboxId) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".account-remote-refresh .account-error-action")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, focusGrocyOutboxId, remoteRefreshRequired]);

  useEffect(() => {
    if (!mealApi.isConfigured) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void mealApi.getAuthMe().then((session) => {
      if (active) {
        setAuthMe(session);
        setCheckingSession(false);
      }
    }).catch(() => {
      if (active) {
        mealApi.clearSession();
        setAuthMe(null);
        setCheckingSession(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      initialAuthFocusHandledRef.current = false;
      return;
    }
    if (checkingSession || authMe?.mode === "account" || passwordResetToken) {
      if (authMe?.mode === "account") initialAuthFocusHandledRef.current = false;
      return;
    }
    if (initialAuthFocusHandledRef.current) return;
    const timer = window.setTimeout(() => {
      accountTabRefs.current[mode]?.focus({ preventScroll: true });
      initialAuthFocusHandledRef.current = true;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [active, authMe, checkingSession, mode, passwordResetToken]);

  useEffect(() => {
    if (!error || busy || checkingSession || authMe?.mode === "account" || passwordResetToken) return;
    const frame = window.requestAnimationFrame(() => {
      const target = mode === "register" && error.includes("이미 가입된 이메일")
        ? accountEmailRef.current
        : accountPasswordRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authMe, busy, checkingSession, error, mode, passwordResetToken]);

  useEffect(() => {
    if (!workspaceTransport) return;
    return workspaceTransport.subscribe((message) => {
      if (message.workspaceKey !== workspaceSync.currentWorkspaceKey) return;
      const refreshAccountPanel = message.channels === "all" || message.channels.some((channel) => (
        channel === "account-notification-preferences"
        || channel === "account-receipt-privacy"
        || channel === "account-grocy"
        || channel === "storage-locations"
        || channel === "receipt-summaries"
      ));
      if (refreshAccountPanel) setExternalRefreshNonce((current) => current + 1);
    });
  }, [workspaceSync, workspaceTransport]);

  const hasWorkspaceSession = Boolean(authMe?.workspace_id);

  useEffect(() => {
    if (passwordResetToken || authMe?.mode !== "account" || pendingGuestTransfer || guestTransferPreviewInFlightRef.current) return;
    const storedTransfer = readStoredGuestTransfer();
    if (!storedTransfer || storedTransfer.target_workspace_id !== authMe.workspace_id) return;
    const session = storedAccountSession(authMe);
    if (!session) return;
    let active = true;
    const controller = new AbortController();
    void mealApi.previewGuestTransfer(session, storedTransfer.guest_access_token, controller.signal).then((preview) => {
      if (!active) return;
      const hasGuestRecords = hasGuestTransferRecords(preview);
      if (preview.status === "ready" && hasGuestRecords) {
        setPendingGuestTransfer({ session, preview, guestAccessToken: storedTransfer.guest_access_token, message: preview.message });
      } else {
        clearStoredGuestTransfer();
      }
    }).catch(() => {
      if (active) setPendingGuestTransfer({ session, preview: null, guestAccessToken: storedTransfer.guest_access_token, message: "보류한 게스트 기록을 아직 확인하지 못했어요. 다시 확인하거나 계정만 사용할 수 있어요." });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [authMe, passwordResetToken, pendingGuestTransfer]);

  const submit = async () => {
    keyboard.hide();
    setError("");
    if (!mealApi.isConfigured) {
      setError("계정 기능을 사용하려면 API 연결이 필요해요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const guestAccessToken = mode === "register" ? mealApi.guestToken : null;
      const session = mode === "login"
        ? await mealApi.loginAccount({ email, password })
        : await mealApi.registerAccount({ email, password });
      if (!session) throw new Error("account-session-missing");
      setAuthMe({ mode: "account", user_id: session.user_id, email: session.email, workspace_id: session.workspace_id, role: session.role });
      if (mode === "register" && guestAccessToken) {
        storeGuestTransfer(guestAccessToken, session.workspace_id);
        guestTransferPreviewInFlightRef.current = true;
        let preview: ApiGuestTransferPreview;
        try {
          preview = await mealApi.previewGuestTransfer(session, guestAccessToken);
        } catch {
          setPendingGuestTransfer({ session, preview: null, guestAccessToken, message: "네트워크를 확인한 뒤 다시 시도하거나 계정만 먼저 사용할 수 있어요." });
          return;
        } finally {
          guestTransferPreviewInFlightRef.current = false;
        }
      const hasGuestRecords = hasGuestTransferRecords(preview);
        if (preview?.status === "ready" && hasGuestRecords) {
          setPendingGuestTransfer({ session, preview, guestAccessToken, message: preview.message });
          return;
        }
        if (preview?.status === "conflict" && hasGuestRecords) {
          setPendingGuestTransfer({ session, preview: null, guestAccessToken, message: preview.message });
          return;
        }
      }
      await onAuthenticated(session);
    } catch (reason) {
      setError(reason instanceof MealApiError && reason.status === 409
        ? "이미 가입된 이메일이에요."
        : mode === "login"
          ? "이메일 또는 비밀번호를 확인해 주세요."
          : "계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const accountTabOrder: AccountMode[] = ["login", "register"];
  const focusAccountTab = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError("");
    window.requestAnimationFrame(() => accountTabRefs.current[nextMode]?.focus());
  };
  const handleAccountTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = accountTabOrder.indexOf(mode);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % accountTabOrder.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + accountTabOrder.length) % accountTabOrder.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = accountTabOrder.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    focusAccountTab(accountTabOrder[nextIndex]);
  };

  const signOut = async () => {
    keyboard.hide();
    setBusy(true);
    try {
      await onSignedOut();
      setAuthMe(null);
      setMode("login");
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return <div className="account-loading" role="status">현재 식품 기록을 확인하고 있어요</div>;
  }

  if (passwordResetToken) {
    return <div className="account-sheet-content"><div className="account-lead"><div className="capture-visual compact"><ReaderIcon width={23} height={23} /></div><div><h3>계정 비밀번호 재설정</h3><p>메일 링크를 확인하고 새 비밀번호를 설정해 주세요.</p></div></div><PasswordRecoveryPanel initialToken={passwordResetToken} onAuthenticated={onAuthenticated} /></div>;
  }

  if (authMe?.mode === "account" && authMe.email) {
    const finishAuthentication = async (successMessage?: string) => {
      if (!pendingGuestTransfer) return;
      const session = pendingGuestTransfer.session;
      setPendingGuestTransfer(null);
      await onAuthenticated(session, successMessage);
    };

    const retryGuestTransferPreview = async () => {
      if (!pendingGuestTransfer) return;
      let preview: ApiGuestTransferPreview;
      try {
        preview = await mealApi.previewGuestTransfer(pendingGuestTransfer.session, pendingGuestTransfer.guestAccessToken);
      } catch {
        setPendingGuestTransfer((current) => current ? { ...current, preview: null, message: "아직 서버에서 게스트 기록을 확인하지 못했어요." } : current);
        return;
      }
      const hasGuestRecords = hasGuestTransferRecords(preview);
      if (preview.status === "ready" && hasGuestRecords) {
        setPendingGuestTransfer((current) => current ? { ...current, preview, message: preview.message } : current);
        return;
      }
      if (preview.status === "conflict" && hasGuestRecords) {
        setPendingGuestTransfer((current) => current ? { ...current, preview: null, message: preview.message } : current);
        return;
      }
      clearStoredGuestTransfer();
      await finishAuthentication();
    };

    const importGuestWorkspace = async () => {
      if (!pendingGuestTransfer) throw new Error("guest-transfer-missing");
      const result = await mealApi.transferGuestWorkspace(pendingGuestTransfer.session, pendingGuestTransfer.guestAccessToken);
      if (!result) throw new Error("guest-transfer-empty");
      clearStoredGuestTransfer();
      await finishAuthentication(guestTransferResultMessage(result));
    };

    const skipGuestWorkspace = async () => {
      await finishAuthentication();
    };

    const deleteAccountAndSignOut = async () => {
      await onSignedOut();
      setAuthMe(null);
      setMode("login");
    };

    return (
      <div className="account-sheet-content" aria-busy={checkingSession || busy || remoteRefreshing}>
        <div className="account-lead"><div className="capture-visual compact"><CheckCircledIcon width={23} height={23} /></div><div><h3>계정에 연결됨</h3><p>{authMe.email}의 식품 기록을 이어가고 있어요.</p></div></div>
        <div className="account-profile"><span className="account-profile-icon"><ReaderIcon width={18} height={18} /></span><span><strong>{authMe.email}</strong><small>{authMe.role === "recipe_admin" ? "레시피 운영자 권한이 있어요." : "다른 기기에서도 같은 식품 기록을 볼 수 있어요."}</small></span></div>
        {remoteRefreshNotice}
        {returnToNotification ? <div className="account-remote-refresh" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>알림에서 이어서 확인 중이에요</strong><small>작업 상세를 닫으면 원래 알림으로 돌아가요.</small></span>{onReturnToNotification ? <button className="grocy-refresh-button" type="button" onClick={onReturnToNotification}>알림으로 돌아가기</button> : null}</div> : null}
        {authMe.account_status === "deleting" ? <div className="account-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>이 계정의 삭제 작업이 아직 끝나지 않았어요. 아래 계정 삭제에서 같은 비밀번호와 DELETE를 입력해 다시 시도해 주세요.</span></div> : null}
        {pendingGuestTransfer ? pendingGuestTransfer.preview ? <GuestTransferPanel preview={pendingGuestTransfer.preview} onImport={importGuestWorkspace} onSkip={skipGuestWorkspace} onConflict={retryGuestTransferPreview} /> : <GuestTransferRetryPanel message={pendingGuestTransfer.message} onRetry={retryGuestTransferPreview} onSkip={skipGuestWorkspace} /> : null}
        <p className="section-kicker">계정 보안</p>
        <PasswordChangePanel />
        <AccountDeletionPanel onDeleted={onAccountDeleted ?? deleteAccountAndSignOut} />
        <p className="section-kicker">식품 기록 설정</p>
        {mealApi.isConfigured ? <AccountStorageDisclosure key={`storage-locations:${authMe.workspace_id}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
        {mealApi.isConfigured ? <AccountNotificationDisclosure key={`notification-preferences:${authMe.workspace_id}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
        {mealApi.isConfigured ? <AccountArchiveDisclosure key={`account-archive:${authMe.workspace_id}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
        <p className="section-kicker">외부 연동</p>
        {mealApi.isConfigured ? <GrocyIntegrationPanel key={`grocy:${authMe.workspace_id}`} active={active} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} focusGrocyOutboxId={focusGrocyOutboxId} returnToNotification={returnToNotification} onReturnToNotification={onReturnToNotification} onOpenFoodFromSync={onOpenFoodFromSync} onRefreshWorkspace={onRefreshWorkspace} /> : null}
        <button className="secondary-sheet-button" type="button" disabled={busy} onClick={() => void signOut()}>로그아웃</button>
        <div className="account-note"><InfoCircledIcon width={15} height={15} /><span>로그아웃하면 새 게스트 기록 공간으로 전환됩니다. 현재 계정 기록은 삭제되지 않아요.</span></div>
      </div>
    );
  }

  const authErrorField = error
    ? mode === "register" && error.includes("이미 가입된 이메일")
      ? "email"
      : error.includes("이메일 또는 비밀번호")
        ? "credentials"
        : "password"
    : null;

  return (
    <div className="account-sheet-content" aria-busy={checkingSession || busy || remoteRefreshing}>
        <div className="account-lead"><div className="capture-visual compact"><ReaderIcon width={23} height={23} /></div><div><h3>내 식품을 안전하게 이어가기</h3><p>{mode === "login" ? "계정에 로그인하면 다른 기기에서도 이어가요." : "계정을 만들면 다른 기기에서도 이어가요."}</p></div></div>
      {remoteRefreshNotice}
      {returnToNotification ? <div className="account-remote-refresh" role="note"><InfoCircledIcon width={15} height={15} /><span><strong>알림에서 이어서 확인 중이에요</strong><small>작업 상세를 닫으면 원래 알림으로 돌아가요.</small></span>{onReturnToNotification ? <button className="grocy-refresh-button" type="button" onClick={onReturnToNotification}>알림으로 돌아가기</button> : null}</div> : null}
      {mealApi.isConfigured && hasWorkspaceSession ? <AccountStorageDisclosure key={`storage-locations:${authMe?.workspace_id ?? "anonymous"}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
      {mealApi.isConfigured && hasWorkspaceSession ? <AccountNotificationDisclosure key={`notification-preferences:${authMe?.workspace_id ?? "anonymous"}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
      {mealApi.isConfigured && hasWorkspaceSession ? <AccountArchiveDisclosure key={`account-archive:${authMe?.workspace_id ?? "anonymous"}`} workspaceSync={workspaceSync} refreshNonce={panelRefreshNonce} /> : null}
      <div className="account-tabs" role="tablist" aria-label="계정 방법" aria-orientation="horizontal"><button ref={(element) => { accountTabRefs.current.login = element; }} id="account-tab-login" type="button" role="tab" aria-selected={mode === "login"} aria-controls="account-panel-login" tabIndex={mode === "login" ? 0 : -1} className={`account-tab ${mode === "login" ? "account-tab-active" : ""}`} onKeyDown={handleAccountTabKeyDown} onClick={() => focusAccountTab("login")}>로그인</button><button ref={(element) => { accountTabRefs.current.register = element; }} id="account-tab-register" type="button" role="tab" aria-selected={mode === "register"} aria-controls="account-panel-register" tabIndex={mode === "register" ? 0 : -1} className={`account-tab ${mode === "register" ? "account-tab-active" : ""}`} onKeyDown={handleAccountTabKeyDown} onClick={() => focusAccountTab("register")}>회원가입</button></div>
      <div className="account-tabpanel" id={`account-panel-${mode}`} role="tabpanel" aria-labelledby={`account-tab-${mode}`} tabIndex={0}><form className="account-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className="app-input-label" htmlFor="account-email-input">이메일</label><KeyboardInput ref={accountEmailRef} id="account-email-input" className="app-input" type="email" autoComplete="email" value={email} placeholder="name@example.com" aria-invalid={authErrorField === "email" || authErrorField === "credentials"} aria-describedby={error ? "account-auth-error" : undefined} style={authErrorField === "email" || authErrorField === "credentials" ? { borderColor: "var(--atelier-coral)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--atelier-coral) 12%, transparent)" } : undefined} onChange={(event) => setEmail(event.target.value)} onBlur={() => keyboard.hide()} /><label className="app-input-label" htmlFor="account-password-input">비밀번호</label><KeyboardInput ref={accountPasswordRef} id="account-password-input" className="app-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} placeholder="8자 이상" aria-invalid={authErrorField === "password" || authErrorField === "credentials"} aria-describedby={error ? "account-auth-error" : undefined} style={authErrorField === "password" || authErrorField === "credentials" ? { borderColor: "var(--atelier-coral)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--atelier-coral) 12%, transparent)" } : undefined} onChange={(event) => setPassword(event.target.value)} onBlur={() => keyboard.hide()} />{error ? <div id="account-auth-error" className="account-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span></div> : null}<button className="primary-sheet-button" type="submit" disabled={busy || !email.trim() || !password} onPointerDown={(event) => event.preventDefault()}>{busy ? "확인하는 중이에요" : mode === "login" ? "로그인" : "계정 만들기"}<ArrowRightIcon width={17} height={17} /></button></form></div>
      {mode === "login" ? <PasswordRecoveryPanel onAuthenticated={onAuthenticated} /> : null}
      <div className="account-note"><CheckCircledIcon width={15} height={15} /><span style={{ display: "grid", minWidth: 0, gap: 2 }}><strong style={{ color: "var(--atelier-ink)", fontSize: 10, fontWeight: 820 }}>게스트 기록은 지금 그대로 남아요</strong><small style={{ color: "var(--atelier-muted)", fontSize: 10, lineHeight: 1.4 }}>계정에 연결해도 자동으로 합치지 않아요. 먼저 확인하고 이어갈 수 있어요.</small></span></div>
    </div>
  );
}
