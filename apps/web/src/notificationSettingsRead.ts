import type { ApiNotificationPreferences, ApiPushSubscriptionSummary, ApiNotificationWorkerHeartbeat } from "./mealApi";
export async function readNotificationSettings(preferences: Promise<ApiNotificationPreferences | null>, subscriptions: Promise<ApiPushSubscriptionSummary[] | null>, workers: Promise<ApiNotificationWorkerHeartbeat[] | null>) {
  const [prefs, devices, delivery] = await Promise.allSettled([preferences, subscriptions, workers]);
  if (prefs.status === "rejected") throw prefs.reason;
  if (!prefs.value) throw new Error("notification-preferences-empty");
  return {
    preferences: prefs.value,
    subscriptions: devices.status === "fulfilled" ? devices.value : null,
    workerHeartbeats: delivery.status === "fulfilled" ? delivery.value : null,
  };
}
