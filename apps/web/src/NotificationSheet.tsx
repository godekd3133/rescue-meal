import { Metadata } from "./Metadata";
import { useEffect, useRef, useState } from "react";
import { CheckCircledIcon, ChevronRightIcon, GearIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import type { ApiNotification } from "./mealApi";
import { orderNotifications } from "./notificationOrdering";
import { externalSyncLifecycleColor, externalSyncLifecycleLabel } from "./externalSyncPresentation";
import { notificationDisplayMessage, notificationDisplayTitle, notificationListState, notificationShowsEventTime } from "./notificationPresentation";

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간을 알 수 없어요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function notificationKindLabel(kind: ApiNotification["kind"]) {
  if (kind === "date_due") return "날짜 알림";
  if (kind === "date_check") return "날짜 확인";
  if (kind === "storage_mismatch") return "보관 상태";
  return "연동 상태";
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
  onOpenSettings,
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
  onOpenSettings?: () => void;
  returnFocusNotificationId?: string | null;
  initialSyncFocus?: "action_required" | "queued" | "processing" | null;
  onSyncFocusHandled?: () => void;
}) {
  const listState = notificationListState(loading, error, notifications.length);
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
  const readNotifications = orderedNotifications.filter((notification) => Boolean(notification.read_at));
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
    const rowDetail = syncStateLabel ?? notificationKindLabel(notification.kind);
    return (
    <button className={`notification-row notification-row-${notification.severity} ${notification.read_at ? "notification-row-read" : ""}`} type="button" key={notification.id} data-notification-id={notification.id} data-notification-sync-state={syncState ?? undefined} data-notification-returned={returnedNotificationId === notification.id ? "true" : undefined} style={returnedNotificationId === notification.id ? { boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--atelier-blue) 62%, transparent)", background: "color-mix(in srgb, var(--atelier-blue) 7%, var(--atelier-surface))" } : undefined} onClick={() => handleSelect(notification)} aria-label={`${accessibleSubject}. ${displayMessage}${syncStateLabel ? `. ${syncStateLabel}` : ""}`} aria-describedby={`notification-status-${notification.id}`}>
      <span className="notification-row-copy">
        <span className="notification-row-title"><strong>{displayTitle}</strong></span>
        {displayMessage ? <small>{displayMessage}</small> : null}
        {notificationShowsEventTime(notification) ? <em><Metadata parts={[rowDetail, formatNotificationTime(notification.created_at)]} /></em> : null}
      </span>
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
    <div ref={notificationSheetRef} className="notification-sheet" data-no-items={notifications.length === 0 ? "true" : undefined} aria-busy={loading}>
      <div ref={sheetHeadingRef} className="notification-sheet-heading" tabIndex={-1}>
        <div>{notifications.length || loading || error ? <h3>{unreadCount ? <>새 알림 <span>{unreadCount}개</span></> : notifications.length ? "읽은 알림" : "알림 목록"}</h3> : null}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {unreadCount ? <button className="notification-read-all" type="button" disabled={readAllBusy} aria-busy={readAllBusy} onClick={handleReadAll}>{readAllBusy ? "읽는 중" : "모두 읽음"}</button> : null}
        {onOpenSettings ? <button className="notification-read-all notification-settings-button" type="button" aria-label="알림 설정" title="알림 설정" style={{ minWidth: 44, minHeight: 44, padding: 10 }} onClick={onOpenSettings}><GearIcon width={17} height={17} aria-hidden="true" /></button> : null}
        </div>
      </div>
      {syncNotifications.length && listState === "rows" ? <section className="notification-sync-overview" aria-label="알림 요약" data-sync-attention-count={syncAttentionCount} data-sync-waiting-count={syncWaitingCount} data-sync-applied-count={syncAppliedCount} style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <small style={{ minWidth: 0, color: "var(--atelier-muted)", fontSize: 12, fontWeight: 550 }}>재고 앱 연동 · 숫자를 누르면 외부 연동의 다음 행동이 필요한 알림으로 이동해요.</small>
          {unreadCount ? <button className="notification-read-all" type="button" aria-label="첫 번째 읽지 않은 알림으로 이동" style={{ flex: "0 0 auto", minHeight: 44 }} onClick={focusFirstUnread}>첫 알림 보기</button> : null}
        </div>
        <div className="notification-sync-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 6 }}>
          {([
            ["action_required", "확인 필요", syncAttentionCount],
            ["queued", "처리 대기", syncWaitingCount],
            ["applied", "반영 완료", syncAppliedCount],
          ] as const).map(([state, label, count]) => {
            const color = externalSyncLifecycleColor(state);
            return <button className="notification-sync-summary-item" type="button" data-notification-sync-summary={state === "queued" ? "waiting" : state} key={state} disabled={count === 0} aria-label={`${label} ${count}건${count ? " · 해당 알림으로 이동" : ""}`} onClick={() => focusSyncState(state)} style={{ display: "flex", minWidth: 0, minHeight: 44, gap: 4, alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: `1px solid color-mix(in srgb, ${color} 25%, var(--sheet-border))`, borderRadius: 11, background: `color-mix(in srgb, ${color} 7%, var(--atelier-surface))`, color, font: "inherit", textAlign: "left", cursor: count ? "pointer" : "default", opacity: count ? 1 : 0.72 }}><small style={{ minWidth: 0, overflow: "hidden", color: "var(--atelier-muted)", fontSize: 12, fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</small><strong style={{ flex: "0 0 auto", color: "currentColor", fontSize: 14, fontWeight: 800 }}>{count}</strong></button>;
          })}
        </div>
      </section> : null}
      {notice ? <div className="notification-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {targetIssue ? <div className="account-error notification-error notification-target-issue" role={targetIssue.loading ? "status" : "alert"} aria-busy={targetIssue.loading}><InfoCircledIcon width={15} height={15} /><span>{targetIssue.loading ? "식품 목록을 다시 불러오고 있어요." : targetIssue.message}</span><button ref={targetIssueActionRef} className="account-error-action" type="button" disabled={targetIssue.loading} onClick={targetIssue.onRefresh}>{targetIssue.loading ? "불러오는 중" : "식품 목록 새로고침"}</button></div> : null}
      {error ? <div className="account-error notification-error" data-readback-state={retryAction ? "stale" : undefined} role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span>{retryAction ? <button ref={notificationRetryRef} className="account-error-action" type="button" disabled={loading || retryBusy} aria-busy={loading || retryBusy} onClick={() => { retryStartRef.current = { error, action: retryAction }; setRetryBusy(true); notificationRetryReadbackRef.current = true; retryAction.onRetry(); }}>{retryAction.label}</button> : null}</div> : null}
      {retryBusy && !retryAction ? <div className="notification-refresh-notice" role="status" aria-live="polite"><InfoCircledIcon width={15} height={15} /><span>알림을 다시 확인하고 있어요.</span></div> : null}
      {listState === "loading" ? <div className="notification-loading" role="status">알림을 불러오는 중이에요.</div> : listState === "rows" ? (
        <div className="notification-list">
          {unreadNotifications.map(renderNotificationRow)}
          {unreadNotifications.length && readNotifications.length ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 2px 0", color: "var(--atelier-muted)", fontSize: 12, fontWeight: 550 }}><span>읽은 알림</span><span>{readNotifications.length}개</span></div> : null}
          {readNotifications.map(renderNotificationRow)}
        </div>
      ) : listState === "failed" ? null : <div ref={emptyStateRef} className="notification-empty" role="status" tabIndex={-1} aria-labelledby="notification-empty-title"><CheckCircledIcon width={22} height={22} /><strong id="notification-empty-title">지금 확인할 알림이 없어요</strong></div>}
      {notifications.some((notification) => notification.kind !== "grocy_sync") ? <p className="notification-footnote"><InfoCircledIcon width={14} height={14} /> 알림만으로 먹어도 되는지는 알 수 없어요. 포장지 날짜와 식품 상태를 확인해 주세요.</p> : null}
    </div>
  );
}
