import { BellIcon, CheckCircledIcon, ChevronRightIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import type { ApiNotification } from "./mealApi";

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

export default function NotificationSheet({
  notifications,
  loading,
  error,
  notice,
  retryAction,
  onSelect,
  onReadAll,
}: {
  notifications: ApiNotification[];
  loading: boolean;
  error: string;
  notice?: string;
  retryAction?: { label: string; onRetry: () => void } | null;
  onSelect: (notification: ApiNotification) => void;
  onReadAll: () => void;
}) {
  const unreadCount = notifications.filter((notification) => notification.read_at === null).length;
  return (
    <div className="notification-sheet">
      <div className="notification-sheet-heading">
        <div><p className="section-kicker">ATTENTION CENTER</p><h3>확인이 필요한 알림 <span>{unreadCount}</span></h3></div>
        {unreadCount ? <button className="notification-read-all" type="button" onClick={onReadAll}>모두 읽음</button> : null}
      </div>
      {notice ? <div className="notification-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? <div className="account-error notification-error" role="alert"><InfoCircledIcon width={15} height={15} /><span>{error}</span>{retryAction ? <button className="account-error-action" type="button" onClick={retryAction.onRetry}>{retryAction.label}</button> : null}</div> : null}
      {loading ? <div className="notification-loading" role="status">알림을 불러오는 중이에요.</div> : notifications.length ? (
        <div className="notification-list">
          {notifications.map((notification) => (
            <button className={`notification-row ${notification.read_at ? "notification-row-read" : ""}`} type="button" key={notification.id} onClick={() => onSelect(notification)} aria-label={`${notification.title}: ${notification.canonical_name}`}>
              <span className={`notification-row-icon notification-severity-${notification.severity}`}><BellIcon width={15} height={15} /></span>
              <span className="notification-row-copy"><strong>{notification.title}</strong><small>{notification.message}</small><em>{notificationSeverityLabel(notification.severity)} · {formatNotificationTime(notification.created_at)}</em></span>
              {!notification.read_at ? <span className="notification-unread-dot" aria-label="읽지 않음" /> : null}
              <ChevronRightIcon width={15} height={15} />
            </button>
          ))}
        </div>
      ) : <div className="notification-empty"><CheckCircledIcon width={22} height={22} /><strong>지금 확인할 알림이 없어요</strong><small>표시 날짜와 보관 상태가 바뀌면 여기에서 알려드릴게요.</small></div>}
      <p className="notification-footnote"><InfoCircledIcon width={14} height={14} /> 날짜 알림은 안전 판정이 아니에요. 포장지 표시와 실제 식품 상태를 먼저 확인하세요.</p>
    </div>
  );
}
