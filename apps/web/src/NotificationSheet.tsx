import { useEffect, useRef, useState } from "react";
import { BellIcon, CheckCircledIcon, ChevronRightIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import type { ApiNotification } from "./mealApi";
import { orderNotifications } from "./notificationOrdering";

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function notificationSeverityLabel(severity: ApiNotification["severity"]) {
  if (severity === "urgent") return "지금 확인";
  if (severity === "attention") return "확인 필요";
  return "안내";
}

function notificationKindLabel(kind: ApiNotification["kind"]) {
  if (kind === "date_due") return "소비 전 확인";
  if (kind === "date_check") return "날짜 확인";
  if (kind === "storage_mismatch") return "보관 상태";
  return "연동 상태";
}

function notificationDisplayTitle(notification: ApiNotification) {
  if (notification.kind !== "grocy_sync" && notification.title === "확인할 식품이 있어요" && notification.canonical_name) {
    return `${notification.canonical_name} 확인이 필요해요`;
  }
  return notification.title;
}

type NotificationSyncState = NonNullable<ApiNotification["sync_state"]>;

function notificationSyncState(notification: ApiNotification): NotificationSyncState | null {
  if (notification.kind !== "grocy_sync") return null;
  // Older connected fixtures and persisted clients may not send the additive
  // lifecycle field yet. Their Grocy rows are still actionable by contract.
  return notification.sync_state ?? "action_required";
}

function notificationSyncStateLabel(state: NotificationSyncState) {
  if (state === "queued") return "처리 대기";
  if (state === "processing") return "반영 중";
  if (state === "applied") return "반영 완료";
  return "확인 필요";
}

function notificationSyncTone(state: NotificationSyncState) {
  const color = state === "action_required"
    ? "var(--atelier-coral)"
    : state === "applied"
      ? "var(--atelier-pistachio)"
      : "var(--atelier-blue)";
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
  initialSyncFocus?: "action_required" | "queued" | null;
  onSyncFocusHandled?: () => void;
}) {
  const unreadCount = notifications.filter((notification) => notification.read_at === null).length;
  const unreadUrgentCount = notifications.filter((notification) => notification.read_at === null && notification.severity === "urgent").length;
  const hasUnreadExternalSyncNotifications = notifications.some((notification) => notification.kind === "grocy_sync" && notification.read_at === null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const focusSummaryAfterReadAllRef = useRef(false);
  const [returnedNotificationId, setReturnedNotificationId] = useState<string | null>(null);
  const summaryTitle = loading
    ? "알림을 확인하고 있어요"
    : unreadUrgentCount
      ? `먼저 확인할 알림 ${unreadUrgentCount}개`
      : unreadCount
        ? `확인할 알림 ${unreadCount}개`
        : "모든 알림을 확인했어요";
  const summaryDetail = loading
    ? "최근 날짜와 동기화 상태를 불러옵니다."
    : unreadCount
      ? hasUnreadExternalSyncNotifications
        ? "알림을 열어 식품 확인이나 외부 연동의 다음 행동을 이어가요."
        : "알림을 열면 해당 식품과 확인할 내용을 바로 볼 수 있어요."
      : "새로운 날짜나 동기화 이슈가 생기면 여기에서 알려드릴게요.";
  const summaryCountLabel = loading
    ? "확인 중"
    : unreadCount
      ? unreadCount === notifications.length
        ? `전체 ${notifications.length}개`
        : `읽지 않음 ${unreadCount}개 · 전체 ${notifications.length}개`
      : "확인 완료";
  const summaryCleared = !loading && unreadCount === 0;
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
  const focusSyncState = (state: "action_required" | "queued" | "applied") => {
    const stateSelector = state === "queued"
      ? '[data-notification-sync-state="queued"], [data-notification-sync-state="processing"]'
      : `[data-notification-sync-state="${state}"]`;
    const target = document.querySelector<HTMLElement>(stateSelector)?.closest<HTMLElement>("[data-notification-id]");
    if (!target) return;
    target.scrollIntoView({ behavior: "auto", block: "center" });
    target.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!initialSyncFocus || loading) return;
    const frame = window.requestAnimationFrame(() => {
      const stateSelector = initialSyncFocus === "queued"
        ? '[data-notification-sync-state="queued"], [data-notification-sync-state="processing"]'
        : `[data-notification-sync-state="${initialSyncFocus}"]`;
      const target = document.querySelector<HTMLElement>(stateSelector)?.closest<HTMLElement>("[data-notification-id]");
      if (!target) return;
      target.scrollIntoView({ behavior: "auto", block: "center" });
      target.focus({ preventScroll: true });
      onSyncFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialSyncFocus, loading, notifications.length, onSyncFocusHandled]);

  const renderNotificationRow = (notification: ApiNotification) => {
    const syncState = notificationSyncState(notification);
    const syncStateLabel = syncState ? notificationSyncStateLabel(syncState) : null;
    const displayTitle = notificationDisplayTitle(notification);
    return (
    <button className={`notification-row ${notification.read_at ? "notification-row-read" : ""}`} type="button" key={notification.id} data-notification-id={notification.id} data-notification-returned={returnedNotificationId === notification.id ? "true" : undefined} style={returnedNotificationId === notification.id ? { boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--atelier-pistachio) 62%, transparent)", background: "color-mix(in srgb, var(--atelier-pistachio) 7%, var(--atelier-surface))" } : undefined} onClick={() => handleSelect(notification)} aria-label={`${displayTitle}: ${notification.canonical_name}`} aria-describedby={`notification-status-${notification.id}`}>
      <span className={`notification-row-icon notification-severity-${notification.severity}`} style={notificationTone(notification.severity)}><BellIcon width={15} height={15} /></span>
      <span className="notification-row-copy"><span className="notification-row-title" style={{ display: "flex", minWidth: 0, gap: 6, alignItems: "flex-start" }}><strong style={{ display: "-webkit-box", minWidth: 0, flex: "1 1 auto", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, whiteSpace: "normal" }}>{displayTitle}</strong>{syncState ? <span className="notification-state" data-notification-sync-state={syncState} style={{ ...notificationSyncTone(syncState), flex: "0 0 auto", padding: "3px 6px", border: "1px solid currentColor", borderRadius: 999, fontSize: 8, fontWeight: 820, lineHeight: 1.2, whiteSpace: "nowrap" }}>{syncStateLabel}</span> : null}</span><small>{notification.message}</small><em style={{ color: notificationTone(notification.severity).color }}>{notificationKindLabel(notification.kind)} · {syncStateLabel ?? notificationSeverityLabel(notification.severity)} · {formatNotificationTime(notification.created_at)}</em></span>
      <span id={`notification-status-${notification.id}`} className="sr-only">{notification.read_at ? "읽음" : "읽지 않음"}</span>
      {!notification.read_at ? <span className="notification-unread-dot" aria-hidden="true" /> : null}
      <ChevronRightIcon width={15} height={15} />
    </button>
    );
  };

  useEffect(() => {
    if (!focusSummaryAfterReadAllRef.current || unreadCount !== 0) return;
    focusSummaryAfterReadAllRef.current = false;
    const frame = window.requestAnimationFrame(() => summaryRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [unreadCount]);

  const handleReadAll = () => {
    focusSummaryAfterReadAllRef.current = true;
    onReadAll();
  };

  const handleSelect = (notification: ApiNotification) => {
    focusSummaryAfterReadAllRef.current = false;
    onSelect(notification);
  };

  useEffect(() => {
    if (!returnFocusNotificationId) return;
    setReturnedNotificationId(returnFocusNotificationId);
    const timer = window.setTimeout(() => setReturnedNotificationId(null), 1_600);
    return () => window.clearTimeout(timer);
  }, [returnFocusNotificationId]);

  return (
    <div className="notification-sheet">
      <div className="notification-sheet-heading">
        <div><p className="section-kicker">알림 센터</p><h3>{unreadCount ? <>확인이 필요한 알림 <span>{unreadCount}</span></> : "알림 기록"}</h3></div>
        {unreadCount ? <button className="notification-read-all" type="button" onClick={handleReadAll}>모두 읽음</button> : null}
      </div>
      <section ref={summaryRef} className={`notification-summary${unreadCount ? " notification-summary-action" : " notification-summary-clear"}`} style={summaryCleared ? { borderColor: "color-mix(in srgb, var(--atelier-pistachio) 30%, var(--sheet-border))", background: "color-mix(in srgb, var(--atelier-pistachio) 8%, var(--atelier-surface))" } : undefined} tabIndex={-1} aria-label="알림 요약" aria-live="polite" aria-atomic="true">
        <span className="notification-summary-icon">{summaryCleared ? <CheckCircledIcon width={16} height={16} /> : <BellIcon width={16} height={16} />}</span>
        <span><strong>{summaryTitle}</strong><small>{summaryDetail}</small></span>
        <em>{summaryCountLabel}</em>
      </section>
      {syncNotifications.length ? <div className="notification-sync-summary" role="status" aria-label="외부 재고 연동 상태" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {([
          ["action_required", "확인 필요", syncAttentionCount],
          ["queued", "처리 대기", syncWaitingCount],
          ["applied", "반영 완료", syncAppliedCount],
        ] as const).map(([state, label, count]) => <button className="notification-sync-summary-item" type="button" data-notification-sync-summary={state === "queued" ? "waiting" : state} key={state} disabled={count === 0} aria-label={`${label} ${count}건${count ? " · 해당 알림으로 이동" : ""}`} onClick={() => focusSyncState(state)} style={{ ...notificationSyncTone(state), display: "flex", minWidth: 0, gap: 4, alignItems: "center", justifyContent: "space-between", padding: "8px 9px", border: "1px solid currentColor", borderRadius: 11, font: "inherit", textAlign: "left", cursor: count ? "pointer" : "default", opacity: count ? 1 : 0.55 }}><small style={{ minWidth: 0, overflow: "hidden", color: "var(--atelier-muted)", fontSize: 8, fontWeight: 760, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</small><strong style={{ flex: "0 0 auto", color: "currentColor", fontSize: 13, fontWeight: 850 }}>{count}</strong></button>)}
      </div> : null}
      {notice ? <div className="notification-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? <div className="account-error notification-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span>{retryAction ? <button className="account-error-action" type="button" onClick={retryAction.onRetry}>{retryAction.label}</button> : null}</div> : null}
      {loading ? <div className="notification-loading" role="status">알림을 불러오는 중이에요.</div> : notifications.length ? (
        <div className="notification-list">
          {unreadNotifications.length && readNotifications.length ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0", color: "var(--atelier-muted)", fontSize: 9, fontWeight: 820 }}><span>확인할 알림</span><span>{unreadNotifications.length}개</span></div> : null}
          {unreadNotifications.map(renderNotificationRow)}
          {unreadNotifications.length && readNotifications.length ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 2px 0", color: "var(--atelier-muted)", fontSize: 9, fontWeight: 820 }}><span>확인한 알림</span><span>{readNotifications.length}개</span></div> : null}
          {readNotifications.map(renderNotificationRow)}
        </div>
      ) : <div className="notification-empty"><CheckCircledIcon width={22} height={22} /><strong>지금 확인할 알림이 없어요</strong><small>표시 날짜와 보관 상태가 바뀌면 여기에서 알려드릴게요.</small></div>}
      <p className="notification-footnote"><InfoCircledIcon width={14} height={14} /> 날짜 알림은 안전 판정이 아니에요. 포장지 표시와 실제 식품 상태를 먼저 확인하세요.</p>
    </div>
  );
}
