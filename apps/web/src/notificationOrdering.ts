import type { ApiNotification } from "./mealApi";

const severityRank: Record<ApiNotification["severity"], number> = {
  urgent: 0,
  attention: 1,
  info: 2,
};

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderNotifications(notifications: ApiNotification[]) {
  return [...notifications].sort((left, right) => {
    const leftUnread = left.read_at ? 1 : 0;
    const rightUnread = right.read_at ? 1 : 0;
    if (leftUnread !== rightUnread) return leftUnread - rightUnread;
    if (leftUnread === 0) {
      const severityDifference = severityRank[left.severity] - severityRank[right.severity];
      if (severityDifference !== 0) return severityDifference;
    }
    const createdDifference = timestamp(right.created_at) - timestamp(left.created_at);
    return createdDifference || left.id.localeCompare(right.id);
  });
}
