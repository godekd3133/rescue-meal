import { useEffect, useRef, useState } from "react";
import { CheckCircledIcon, ChevronRightIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import type { ApiNotification } from "./mealApi";
import { orderNotifications } from "./notificationOrdering";
import { externalSyncLifecycleColor, externalSyncLifecycleLabel } from "./externalSyncPresentation";

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간을 알 수 없어요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function notificationSeverityLabel(severity: ApiNotification["severity"]) {
  if (severity === "urgent") return "지금 확인";
  if (severity === "attention") return "살펴봐 주세요";
  return "안내";
}

function notificationKindLabel(kind: ApiNotification["kind"]) {
  if (kind === "date_due") return "날짜 알림";
  if (kind === "date_check") return "날짜 확인";
  if (kind === "storage_mismatch") return "보관 상태";
  return "연동 상태";
}

function notificationDisplayTitle(notification: ApiNotification) {
  if (notification.kind !== "grocy_sync" && notification.title === "확인할 식품이 있어요" && notification.canonical_name) {
    return `${notification.canonical_name} 날짜를 살펴봐 주세요`;
  }
  const title = notification.title
    .replaceAll("AI 소비 우선순위 범위", "먼저 살펴볼 날짜 범위")
    .replaceAll("AI 소비 우선순위", "먼저 먹을 순서")
    .replaceAll("오늘 먼저 확인할 식품이에요", "오늘 먼저 살펴볼 식품이에요");
  if (notification.kind !== "grocy_sync" && notification.canonical_name) {
    return title.replace(`${notification.canonical_name} 확인이 필요해요`, `${notification.canonical_name} 날짜를 살펴봐 주세요`);
  }
  return title;
}

function notificationDisplayMessage(notification: ApiNotification) {
  return notification.message
    .replaceAll("AI 소비 우선순위 범위", "먼저 살펴볼 날짜 범위")
    .replaceAll("AI 소비 우선순위", "먼저 먹을 순서")
    .replaceAll("먼저 확인해 보세요", "날짜를 확인해 주세요")
    .replace(/(.+): 직접 확인해 기록한 날짜는 (.+)예요\. 포장지에 표시된 소비기한과는 별개이니, 포장지 날짜와 보관 상태도 확인해 주세요\./, "내가 기록한 날짜는 $2예요. 포장지 날짜와 보관 방법도 확인해 주세요.")
    .replace(/(.+): (.+은) 먼저 살펴볼 참고 날짜예요\. 소비기한이나 안전 판정이 아니니 포장지 날짜와 식품 상태를 확인해 주세요\./, "$2 먼저 살펴볼 날짜예요. 소비기한과는 다르니 포장지 날짜를 확인해 주세요.");
}

type NotificationSyncState = NonNullable<ApiNotification["sync_state"]>;

function notificationSyncState(notification: ApiNotification): NotificationSyncState | null {
  if (notification.kind !== "grocy_sync") return null;
  // Older connected fixtures and persisted clients may not send the additive
  // lifecycle field yet. Their Grocy rows are still actionable by contract.
  return notification.sync_state ?? "action_required";
}

function notificationSyncStateLabel(state: NotificationSyncState) {
  return externalSyncLifecycleLabel(state);
}

function notificationSyncTone(state: NotificationSyncState) {
  const color = externalSyncLifecycleColor(state);
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 25%, var(--sheet-border))`,
    background: `color-mix(in srgb, ${color} 7%, var(--atelier-surface))`,
  };
}

function notificationTone(severity: ApiNotification["severity"]) {
  if (severity === "urgent") return { background: "color-mix(in srgb, var(--atelier-coral) 14%, transparent)", color: "var(--atelier-coral)" };
  if (severity === "attention") return { background: "color-mix(in srgb, var(--atelier-amber) 16%, transparent)", color: "var(--atelier-amber)" };
  return { background: "color-mix(in srgb, var(--atelier-blue) 15%, transparent)", color: "var(--atelier-blue)" };
}

export default function NotificationSheet({
  notifications,
  loading,
  error,
  notice,
  retryAction,
  onSelect,
  onReadAll,
  returnFocusNotificationId,
  initialSyncFocus,
  onSyncFocusHandled,
}: {
  notifications: ApiNotification[];
  loading: boolean;
  error: string;
  notice?: string;
  retryAction?: { label: string; onRetry: () => void } | null;
  onSelect: (notification: ApiNotification) => void;
  onReadAll: () => void;
  returnFocusNotificationId?: string | null;
  initialSyncFocus?: "action_required" | "queued" | "processing" | null;
  onSyncFocusHandled?: () => void;
}) {
  const unreadCount = notifications.filter((notification) => notification.read_at === null).length;
  const notificationSheetRef = useRef<HTMLDivElement | null>(null);
  const sheetHeadingRef = useRef<HTMLDivElement | null>(null);
  const notificationRetryRef = useRef<HTMLButtonElement | null>(null);
  const previousErrorRef = useRef(error);
  const notificationRetryReadbackRef = useRef(false);
  const focusHeadingAfterReadAllRef = useRef(false);
  const [returnedNotificationId, setReturnedNotificationId] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [readAllBusy, setReadAllBusy] = useState(false);
  const orderedNotifications = orderNotifications(notifications);
  const unreadNotifications = orderedNotifications.filter((notification) => !notification.read_at);
  const readNotifications = orderedNotifications.filter((notification) => Boolean(notification.read_at));
  const syncNotificationTarget = (state: "action_required" | "queued" | "processing" | "applied") => {
    const candidates = orderedNotifications
      .filter((notification) => {
        const current = notificationSyncState(notification);
        return state === "queued" ? current === "queued" : current === state;
      })
      .sort((left, right) => {
        if (state !== "queued") return 0;
        const rank = (current: NotificationSyncState | null) => current === "queued" ? 0 : current === "processing" ? 1 : 2;
        return rank(notificationSyncState(left)) - rank(notificationSyncState(right));
      });
    const targetId = candidates[0]?.id;
    if (!targetId) return null;
    return Array.from(notificationSheetRef.current?.querySelectorAll<HTMLElement>("[data-notification-id]") ?? [])
      .find((element) => element.dataset.notificationId === targetId) ?? null;
  };
  useEffect(() => {
    if (!initialSyncFocus || loading) return;
    const frame = window.requestAnimationFrame(() => {
      const target = syncNotificationTarget(initialSyncFocus);
      if (!target) return;
      target.focus({ preventScroll: true });
      onSyncFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialSyncFocus, loading, notifications.length, onSyncFocusHandled]);

  const renderNotificationRow = (notification: ApiNotification) => {
    const syncState = notificationSyncState(notification);
    const syncStateLabel = syncState ? notificationSyncStateLabel(syncState) : null;
    const displayTitle = notificationDisplayTitle(notification);
    const displayMessage = notificationDisplayMessage(notification);
    return (
    <button className={`notification-row notification-row-${notification.severity} ${notification.read_at ? "notification-row-read" : ""}`} type="button" key={notification.id} data-notification-id={notification.id} data-notification-returned={returnedNotificationId === notification.id ? "true" : undefined} style={returnedNotificationId === notification.id ? { boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--atelier-blue) 62%, transparent)", background: "color-mix(in srgb, var(--atelier-blue) 7%, var(--atelier-surface))" } : undefined} onClick={() => handleSelect(notification)} aria-label={`${displayTitle}: ${notification.canonical_name}. ${displayMessage}`} aria-describedby={`notification-status-${notification.id}`}>
      <span className="notification-row-copy"><span className="notification-row-title" style={{ display: "flex", minWidth: 0, gap: 6, alignItems: "flex-start" }}><strong style={{ display: "-webkit-box", minWidth: 0, flex: "1 1 auto", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, whiteSpace: "normal" }}>{displayTitle}</strong>{syncState ? <span className="notification-state" data-notification-sync-state={syncState} style={{ ...notificationSyncTone(syncState), flex: "0 0 auto", padding: "3px 6px", border: "1px solid currentColor", borderRadius: 999, fontSize: 9, fontWeight: 820, lineHeight: 1.2, whiteSpace: "nowrap" }}>{syncStateLabel}</span> : null}</span><small>{displayMessage}</small><em style={{ color: notificationTone(notification.severity).color }}>{notificationKindLabel(notification.kind)} · {syncStateLabel ?? notificationSeverityLabel(notification.severity)} · {formatNotificationTime(notification.created_at)}</em></span>
      <span id={`notification-status-${notification.id}`} className="sr-only">{notification.read_at ? "읽음" : "읽지 않음"}</span>
      <ChevronRightIcon width={15} height={15} />
    </button>
    );
  };

  useEffect(() => {
    if (!focusHeadingAfterReadAllRef.current || unreadCount !== 0) return;
    focusHeadingAfterReadAllRef.current = false;
    const frame = window.requestAnimationFrame(() => sheetHeadingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [unreadCount]);

  const handleReadAll = () => {
    if (readAllBusy) return;
    focusHeadingAfterReadAllRef.current = true;
    setReadAllBusy(true);
    onReadAll();
  };

  const handleSelect = (notification: ApiNotification) => {
    focusHeadingAfterReadAllRef.current = false;
    onSelect(notification);
  };

  useEffect(() => {
    if (!returnFocusNotificationId) return;
    setReturnedNotificationId(returnFocusNotificationId);
    const timer = window.setTimeout(() => setReturnedNotificationId(null), 1_600);
    return () => window.clearTimeout(timer);
  }, [returnFocusNotificationId]);

  useEffect(() => {
    if (!error || !retryAction) return;
    const frame = window.requestAnimationFrame(() => notificationRetryRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [error, retryAction]);

  useEffect(() => {
    if (!retryBusy) return;
    if (error || notifications.some((notification) => Boolean(notification.read_at))) setRetryBusy(false);
  }, [error, notifications, retryBusy]);

  useEffect(() => {
    if (!readAllBusy) return;
    if (error || unreadCount === 0) setReadAllBusy(false);
  }, [error, readAllBusy, unreadCount]);

  useEffect(() => {
    const previousError = previousErrorRef.current;
    previousErrorRef.current = error;
    if (!previousError || error || loading) return;
    const frame = window.requestAnimationFrame(() => {
      const target = notificationSheetRef.current?.querySelector<HTMLElement>(".notification-row")
        ?? sheetHeadingRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, loading, notifications]);

  useEffect(() => {
    if (!notificationRetryReadbackRef.current || loading || error) return;
    let elapsed = 0;
    const settle = window.setInterval(() => {
      const target = notificationSheetRef.current?.querySelector<HTMLElement>(".notification-row")
        ?? sheetHeadingRef.current;
      target?.focus({ preventScroll: true });
      elapsed += 80;
      if (elapsed >= 1_200) {
        notificationRetryReadbackRef.current = false;
        window.clearInterval(settle);
      }
    }, 80);
    return () => window.clearInterval(settle);
  }, [error, loading, notifications]);

  return (
    <div ref={notificationSheetRef} className="notification-sheet" aria-busy={loading}>
      <div ref={sheetHeadingRef} className="notification-sheet-heading" tabIndex={-1}>
        <div><h3>{unreadCount ? <>새 알림 <span>{unreadCount}개</span></> : "지난 알림"}</h3></div>
        {unreadCount ? <button className="notification-read-all" type="button" disabled={readAllBusy} aria-busy={readAllBusy} onClick={handleReadAll}>{readAllBusy ? "읽는 중" : "모두 읽음"}</button> : null}
      </div>
      {notice ? <div className="notification-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? <div className="account-error notification-error" data-readback-state={retryAction ? "stale" : undefined} role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span>{retryAction ? <button ref={notificationRetryRef} className="account-error-action" type="button" disabled={loading || retryBusy} aria-busy={loading || retryBusy} onClick={() => { setRetryBusy(true); notificationRetryReadbackRef.current = true; retryAction.onRetry(); }}>{retryAction.label}</button> : null}</div> : null}
      {retryBusy && !retryAction ? <div className="notification-refresh-notice" role="status" aria-live="polite"><InfoCircledIcon width={15} height={15} /><span>알림 읽음 상태를 저장하는 중이에요.</span></div> : null}
      {loading ? <div className="notification-loading" role="status">알림을 불러오는 중이에요.</div> : notifications.length ? (
        <div className="notification-list">
          {unreadNotifications.length && readNotifications.length ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0", color: "var(--atelier-muted)", fontSize: 12, fontWeight: 550 }}><span>새 알림</span><span>{unreadNotifications.length}개</span></div> : null}
          {unreadNotifications.map(renderNotificationRow)}
          {unreadNotifications.length && readNotifications.length ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 2px 0", color: "var(--atelier-muted)", fontSize: 12, fontWeight: 550 }}><span>지난 알림</span><span>{readNotifications.length}개</span></div> : null}
          {readNotifications.map(renderNotificationRow)}
        </div>
      ) : <div className="notification-empty"><CheckCircledIcon width={22} height={22} /><strong>지금 확인할 알림이 없어요</strong><small>확인이 필요한 날짜나 보관 상태가 생기면 여기에서 알려드릴게요.</small></div>}
      <p className="notification-footnote"><InfoCircledIcon width={14} height={14} /> 날짜 알림만으로는 먹어도 되는지 알 수 없어요. 포장지 날짜와 식품 상태를 확인해 주세요.</p>
    </div>
  );
}
