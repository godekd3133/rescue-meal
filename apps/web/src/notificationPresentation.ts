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
