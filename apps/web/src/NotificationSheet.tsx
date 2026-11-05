import { useEffect, useRef, useState } from "react";
import { BellIcon, ChevronRightIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import type { ApiNotification } from "./mealApi";
import { orderNotifications } from "./notificationOrdering";
import { externalSyncLifecycleLabel } from "./externalSyncPresentation";
import { groupNotificationsByDay, notificationDisplayMessage, notificationDisplayTitle, notificationListState, notificationShowsEventTime, notificationUrgency } from "./notificationPresentation";
import "./notificationScreen.css";

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간을 알 수 없어요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
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

export default function NotificationSheet({
  notifications,
  targetIssue,
  loading,
  error,
  notice,
  retryAction,
  onSelect,
  onReadAll,
  today,
  returnFocusNotificationId,
  initialSyncFocus,
  onSyncFocusHandled,
}: {
  notifications: ApiNotification[];
  targetIssue?: { id: string; message: string; loading: boolean; onRefresh: () => void } | null;
  loading: boolean;
  error: string;
  notice?: string;
  retryAction?: { label: string; onRetry: () => void } | null;
  onSelect: (notification: ApiNotification) => void;
  onReadAll: () => void;
  /** The app's current day; food reminders are grouped and coloured by their date relative to it. */
  today?: Date;
  returnFocusNotificationId?: string | null;
  initialSyncFocus?: "action_required" | "queued" | "processing" | null;
  onSyncFocusHandled?: () => void;
}) {
  const listState = notificationListState(loading, error, notifications.length);
  const [fallbackToday] = useState(() => new Date());
  const day = today ?? fallbackToday;
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const notificationSheetRef = useRef<HTMLDivElement | null>(null);
  const sheetHeadingRef = useRef<HTMLDivElement | null>(null);
  const emptyStateRef = useRef<HTMLDivElement | null>(null);
  const notificationRetryRef = useRef<HTMLButtonElement | null>(null);
  const targetIssueActionRef = useRef<HTMLButtonElement | null>(null);
  const previousErrorRef = useRef(error);
  const notificationRetryReadbackRef = useRef(false);
  const focusHeadingAfterReadAllRef = useRef(false);
  const [returnedNotificationId, setReturnedNotificationId] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  // The parent keeps the failed message and retry action visible while a retry runs; remember them so the
  // busy state ends only on success or on a new failure, not because the old message is still shown.
  const retryStartRef = useRef<{ error: string; action: typeof retryAction } | null>(null);
  const [readAllBusy, setReadAllBusy] = useState(false);
  const orderedNotifications = orderNotifications(notifications);
  const unreadNotifications = orderedNotifications.filter((notification) => !notification.read_at);
  const dayGroups = groupNotificationsByDay(orderedNotifications, day);
  const syncNotifications = notifications.filter((notification) => notification.kind === "grocy_sync");
  const syncAttentionCount = syncNotifications.filter((notification) => notificationSyncState(notification) === "action_required").length;
  const syncWaitingCount = syncNotifications.filter((notification) => {
    const state = notificationSyncState(notification);
    return state === "queued" || state === "processing";
  }).length;
  const syncAppliedCount = syncNotifications.filter((notification) => notificationSyncState(notification) === "applied").length;
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
  const focusSyncState = (state: "action_required" | "queued" | "applied") => {
    const target = syncNotificationTarget(state);
    if (!target) return;
    target.scrollIntoView({ behavior: "auto", block: "center" });
    target.focus({ preventScroll: true });
  };
  const focusFirstUnread = () => {
    const targetId = unreadNotifications[0]?.id;
    const target = Array.from(notificationSheetRef.current?.querySelectorAll<HTMLElement>("[data-notification-id]") ?? [])
      .find((element) => element.dataset.notificationId === targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "auto", block: "center" });
    target.focus({ preventScroll: true });
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
    const accessibleSubject = notification.canonical_name && !displayTitle.includes(notification.canonical_name) ? `${displayTitle}: ${notification.canonical_name}` : displayTitle;
    return (
    <li key={notification.id}>
      <button className={`notification-row${notification.read_at ? " notification-row-read" : ""}`} type="button" data-urgency={notificationUrgency(notification, day)} data-notification-id={notification.id} data-notification-sync-state={syncState ?? undefined} data-notification-returned={returnedNotificationId === notification.id ? "true" : undefined} onClick={() => handleSelect(notification)} aria-label={`${accessibleSubject}. ${displayMessage}${syncStateLabel ? `. ${syncStateLabel}` : ""}`} aria-describedby={`notification-status-${notification.id}`}>
        <span className="notification-row-copy">
          <strong>{displayTitle}</strong>
          {displayMessage ? <small>{displayMessage}</small> : null}
          {syncStateLabel || notificationShowsEventTime(notification) ? <span className="notification-row-meta">{syncStateLabel ? <span>{syncStateLabel}</span> : null}{notificationShowsEventTime(notification) ? <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time> : null}</span> : null}
        </span>
        {notification.read_at ? null : <span className="notification-unread-dot" aria-hidden="true" />}
        <span id={`notification-status-${notification.id}`} className="sr-only">{notification.read_at ? "읽음" : "읽지 않음"}</span>
        <ChevronRightIcon className="notification-row-chevron" width={16} height={16} aria-hidden="true" />
      </button>
    </li>
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
    const started = retryStartRef.current;
    const newFailure = Boolean(error) && (error !== started?.error || Boolean(retryAction && retryAction !== started?.action));
    if (newFailure || notifications.some((notification) => Boolean(notification.read_at)) || (!loading && !retryAction && notifications.length === 0)) setRetryBusy(false);
  }, [error, loading, notifications, retryAction, retryBusy]);

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
        ?? emptyStateRef.current ?? sheetHeadingRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, loading, notifications]);

  useEffect(() => {
    if (!notificationRetryReadbackRef.current || loading || error) return;
    let elapsed = 0;
    const settle = window.setInterval(() => {
      const target = notificationSheetRef.current?.querySelector<HTMLElement>(".notification-row")
        ?? emptyStateRef.current ?? sheetHeadingRef.current;
      target?.focus({ preventScroll: true });
      elapsed += 80;
      if (elapsed >= 1_200) {
        notificationRetryReadbackRef.current = false;
        window.clearInterval(settle);
      }
    }, 80);
    return () => window.clearInterval(settle);
  }, [error, loading, notifications]);

  useEffect(() => {
    if (!targetIssue || targetIssue.loading) return;
    const frame = window.requestAnimationFrame(() => targetIssueActionRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [targetIssue?.id, targetIssue?.loading]);

  return (
    <div ref={notificationSheetRef} className="notification-sheet inbox" data-no-items={notifications.length === 0 ? "true" : undefined} aria-busy={loading}>
      <div ref={sheetHeadingRef} className="notification-sheet-heading inbox-heading" tabIndex={-1}>
        {notifications.length || loading || error ? <h3>{unreadCount ? `새 알림 ${unreadCount}개` : notifications.length ? "읽은 알림" : "알림"}</h3> : <h3 className="sr-only">알림</h3>}
        {unreadCount ? <button className="notification-read-all inbox-quiet" type="button" disabled={readAllBusy} aria-busy={readAllBusy} onClick={handleReadAll}>{readAllBusy ? "읽는 중" : "모두 읽음"}</button> : null}
      </div>
      {syncNotifications.length && listState === "rows" ? <section className="notification-sync-overview inbox-sync" aria-label="재고 앱 연동 요약" data-sync-attention-count={syncAttentionCount} data-sync-waiting-count={syncWaitingCount} data-sync-applied-count={syncAppliedCount}>
        <div className="notification-sync-summary inbox-sync-counts">
          {([
            ["action_required", "확인 필요", syncAttentionCount],
            ["queued", "처리 대기", syncWaitingCount],
            ["applied", "반영 완료", syncAppliedCount],
          ] as const).map(([state, label, count]) => <button className="notification-sync-summary-item" type="button" data-notification-sync-summary={state === "queued" ? "waiting" : state} key={state} disabled={count === 0} aria-label={`${label} ${count}건${count ? ", 해당 알림으로 이동" : ""}`} onClick={() => focusSyncState(state)}><strong>{count}</strong><small>{label}</small></button>)}
        </div>
        {unreadCount ? <button className="inbox-quiet" type="button" aria-label="첫 번째 읽지 않은 알림으로 이동" onClick={focusFirstUnread}>첫 알림 보기</button> : null}
      </section> : null}
      {notice ? <p className="notification-refresh-notice inbox-status" role="status">{notice}</p> : null}
      {targetIssue ? <div className="account-error notification-error notification-target-issue" role={targetIssue.loading ? "status" : "alert"} aria-busy={targetIssue.loading}><InfoCircledIcon width={15} height={15} /><span>{targetIssue.loading ? "식품 목록을 다시 불러오고 있어요." : targetIssue.message}</span><button ref={targetIssueActionRef} className="account-error-action" type="button" disabled={targetIssue.loading} onClick={targetIssue.onRefresh}>{targetIssue.loading ? "불러오는 중" : "식품 목록 새로고침"}</button></div> : null}
      {error ? <div className="account-error notification-error" data-readback-state={retryAction ? "stale" : undefined} role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span>{retryAction ? <button ref={notificationRetryRef} className="account-error-action" type="button" disabled={loading || retryBusy} aria-busy={loading || retryBusy} onClick={() => { retryStartRef.current = { error, action: retryAction }; setRetryBusy(true); notificationRetryReadbackRef.current = true; retryAction.onRetry(); }}>{retryAction.label}</button> : null}</div> : null}
      {retryBusy && !retryAction ? <p className="notification-refresh-notice inbox-status" role="status" aria-live="polite">알림을 다시 확인하고 있어요.</p> : null}
      {listState === "loading" ? <div className="notification-loading inbox-loading" role="status"><span className="sr-only">알림을 불러오는 중이에요.</span>{[0, 1, 2].map((index) => <span className="inbox-skeleton" aria-hidden="true" key={index}><b /><i /></span>)}</div> : listState === "rows" ? (
        <div className="notification-list inbox-days">
          {dayGroups.map((group) => (
            <section className="inbox-day" key={group.key} aria-labelledby={`notification-day-${group.key}`}>
              <h4 id={`notification-day-${group.key}`}>{group.label}</h4>
              <ul>{group.items.map(renderNotificationRow)}</ul>
            </section>
          ))}
        </div>
      ) : listState === "failed" ? null : <div ref={emptyStateRef} className="notification-empty inbox-empty" role="status" tabIndex={-1} aria-labelledby="notification-empty-title"><span className="inbox-empty-icon" aria-hidden="true"><BellIcon width={22} height={22} /></span><strong id="notification-empty-title">새 알림이 없어요</strong><small>날짜가 다가오거나 지난 식품이 생기면 여기에 알려 드려요.</small></div>}
      {notifications.some((notification) => notification.kind !== "grocy_sync") ? <p className="notification-footnote inbox-footnote">알림만으로 먹어도 되는지는 알 수 없어요. 포장지 날짜와 식품 상태를 확인해 주세요.</p> : null}
    </div>
  );
}
