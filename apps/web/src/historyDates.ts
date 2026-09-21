export type TimestampedHistory = { occurred_at: string };

function localDayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function safeTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortHistoryNewest<T extends TimestampedHistory>(events: T[]) {
  return [...events].sort((left, right) => safeTimestamp(right.occurred_at) - safeTimestamp(left.occurred_at));
}

export function historyDayLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  const day = localDayStart(date);
  const today = localDayStart(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (day === today) return "오늘";
  if (day === yesterday) return "어제";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function groupHistoryByDay<T extends TimestampedHistory>(events: T[]) {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const event of events) {
    const date = new Date(event.occurred_at);
    const key = Number.isNaN(date.getTime())
      ? "unknown"
      : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.items.push(event);
    } else {
      groups.push({ key, label: historyDayLabel(event.occurred_at), items: [event] });
    }
  }
  return groups;
}

export function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 확인 필요";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
