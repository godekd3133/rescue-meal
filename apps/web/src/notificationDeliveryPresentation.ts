export function notificationDeliveryBadge(heartbeat: { push_configured: boolean; last_error: string | null } | null) {
  if (!heartbeat) return "전송 기록 없음";
  if (!heartbeat.push_configured) return "설정이 필요해요";
  return heartbeat.last_error ? "문제가 있어요" : "최근 처리";
}
export function showNotificationDeliveryHistory(hasHeartbeat: boolean, subscriptionCount: number) {
  return hasHeartbeat || subscriptionCount > 0;
}
