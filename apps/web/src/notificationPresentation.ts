import type { ApiNotification } from "./mealApi";

export function notificationDisplayTitle(notification: ApiNotification) {
  const reviewTitle = notification.kind === "storage_mismatch"
    ? `${notification.canonical_name} 보관 방법을 살펴봐 주세요`
    : `${notification.canonical_name} 날짜를 살펴봐 주세요`;
  const title = notification.title
    .replaceAll("AI 소비 우선순위 범위", "먼저 살펴볼 날짜 범위")
    .replaceAll("AI 소비 우선순위", "먼저 살펴볼 순서")
    .replaceAll("오늘 먼저 확인할 식품이에요", "오늘 먼저 살펴볼 식품이에요");
  if (notification.kind !== "grocy_sync" && notification.canonical_name) {
    if (["확인할 식품이 있어요", "오늘 먼저 살펴볼 식품이에요"].includes(title)) return reviewTitle;
    const namedTitle = title.replace(`${notification.canonical_name} 확인이 필요해요`, reviewTitle);
    return namedTitle.includes(notification.canonical_name) ? namedTitle : `${notification.canonical_name} ${namedTitle}`;
  }
  return title;
}

export function notificationDisplayMessage(notification: ApiNotification) {
  const message = notification.message
    .replaceAll("AI 소비 우선순위 범위", "먼저 살펴볼 날짜 범위")
    .replaceAll("AI 소비 우선순위", "먼저 살펴볼 순서")
    .replace(/(.+): (.+) 사이에 먼저 확인해 보세요\. 이 기간은 참고용이며 소비기한이나 식품 안전을 판정한 안내가 아니니 포장지 날짜와 식품 상태를 확인해 주세요\./, "$1: 먼저 살펴볼 시점은 $2 사이예요. 소비기한이나 먹어도 되는지를 판단하는 기준은 아니니, 포장지 날짜와 식품 상태를 확인해 주세요.")
    .replace(/(.+): 직접 확인해 기록한 날짜는 (.+)예요\. 포장지에 표시된 소비기한과는 별개이니, 포장지 날짜와 보관 상태도 확인해 주세요\./, "내가 기록한 날짜는 $2예요. 포장지 날짜와 보관 방법도 확인해 주세요.")
    .replace(/(.+): (.+은) 먼저 살펴볼 참고 날짜예요\. 소비기한이나 안전 판정이 아니니 포장지 날짜와 식품 상태를 확인해 주세요\./, "$2 먼저 살펴볼 날짜예요. 소비기한과는 다르니 포장지 날짜를 확인해 주세요.");
  if (notification.kind !== "grocy_sync" && notification.canonical_name) {
    if (notification.kind === "date_check" && message === `${notification.canonical_name} 날짜를 확인해 주세요.`) return "";
    const prefix = `${notification.canonical_name}: `;
    if (message.startsWith(prefix)) return message.slice(prefix.length);
    const subjectPrefix = `${notification.canonical_name}의 `;
    return message.startsWith(subjectPrefix) ? message.slice(subjectPrefix.length) : message;
  }
  return message;
}


export function notificationListState(loading: boolean, error: string, itemCount: number): "loading" | "rows" | "failed" | "empty" {
  if (loading) return "loading";
  if (itemCount > 0) return "rows";
  return error ? "failed" : "empty";
}

// Food reminders are rebuilt from current inventory; created_at is a read time.
export function notificationShowsEventTime(notification: Pick<ApiNotification, "kind">) {
  return notification.kind === "grocy_sync";
}

export type NotificationUrgency = "past" | "today" | "soon" | "neutral" | "caution";

function localDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function dueDayNumber(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000) : null;
}

/** Days from today to the notification's date (negative once it has passed), or null without one. */
export function notificationDueOffset(notification: Pick<ApiNotification, "kind" | "due_date">, today: Date) {
  if (notification.kind === "grocy_sync") return null;
  const due = dueDayNumber(notification.due_date);
  return due === null ? null : due - localDayNumber(today);
}

/** The colour bar: urgency colours only say how soon; sync rows that need a decision use caution. */
export function notificationUrgency(notification: Pick<ApiNotification, "kind" | "due_date" | "sync_state">, today: Date): NotificationUrgency {
  if (notification.kind === "grocy_sync") return (notification.sync_state ?? "action_required") === "action_required" ? "caution" : "neutral";
  const offset = notificationDueOffset(notification, today);
  if (offset === null) return "neutral";
  if (offset < 0) return "past";
  if (offset === 0) return "today";
  return offset <= 3 ? "soon" : "neutral";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export type NotificationDayGroup<T> = { key: string; label: string; items: T[] };

/**
 * Groups already-ordered notifications by the day they are about: food reminders by their
 * date (passed, today, tomorrow, then each later day), then reminders without a date, then
 * inventory-app sync events. Food reminders are rebuilt on read, so created_at is not a day.
 */
export function groupNotificationsByDay<T extends Pick<ApiNotification, "kind" | "due_date">>(notifications: readonly T[], today: Date): NotificationDayGroup<T>[] {
  const groups = new Map<string, { rank: number; label: string; items: T[] }>();
  const base = localDayNumber(today);
  for (const notification of notifications) {
    let key: string;
    let rank: number;
    let label: string;
    if (notification.kind === "grocy_sync") {
      key = "sync"; rank = Number.MAX_SAFE_INTEGER; label = "재고 앱 연동";
    } else {
      const offset = notificationDueOffset(notification, today);
      if (offset === null) {
        key = "undated"; rank = Number.MAX_SAFE_INTEGER - 1; label = "날짜 없는 알림";
      } else if (offset < 0) {
        key = "past"; rank = -1; label = "날짜 지남";
      } else if (offset === 0) {
        key = "today"; rank = 0; label = "오늘";
      } else if (offset === 1) {
        key = "tomorrow"; rank = 1; label = "내일";
      } else {
        const day = new Date((base + offset) * 86_400_000);
        key = `day-${offset}`; rank = offset; label = `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 ${WEEKDAYS[day.getUTCDay()]}요일`;
      }
    }
    const group = groups.get(key) ?? { rank, label, items: [] };
    group.items.push(notification);
    groups.set(key, group);
  }
  return [...groups.entries()].sort((left, right) => left[1].rank - right[1].rank).map(([key, group]) => ({ key, label: group.label, items: group.items }));
}
