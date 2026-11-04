import type { ApiNotificationPreferences } from "./mealApi";
export function notificationSettingsDraftChanged(saved: ApiNotificationPreferences | null, draft: ApiNotificationPreferences, leadDaysText: string) {
  if (!saved) return false;
  if (!leadDaysText.trim() || Number(leadDaysText) !== saved.lead_days) return true;
  const fields = ["in_app_enabled", "push_enabled", "timezone", "quiet_hours_start", "quiet_hours_end", "push_mode", "daily_summary_time"] as const;
  return fields.some((field) => draft[field] !== saved[field]);
}

export type NotificationSettingsDraft = {
  preferences: ApiNotificationPreferences;
  leadDaysText: string;
  savedPreferences?: ApiNotificationPreferences;
  remoteFields?: NotificationSettingsField[];
};

export const notificationSettingsFields = ["in_app_enabled", "push_enabled", "lead_days", "timezone", "quiet_hours_start", "quiet_hours_end", "push_mode", "daily_summary_time"] as const;
export type NotificationSettingsField = typeof notificationSettingsFields[number];

export function notificationSettingsRemoteFields(saved: ApiNotificationPreferences, incoming: ApiNotificationPreferences) {
  return notificationSettingsFields.filter((field) => saved[field] !== incoming[field]);
}

export function mergeNotificationSettingsDraft(saved: ApiNotificationPreferences, draft: ApiNotificationPreferences, leadDaysText: string, incoming: ApiNotificationPreferences) {
  const retained = Object.fromEntries(notificationSettingsFields
    .filter((field) => field !== "lead_days")
    .map((field) => [field, draft[field] === saved[field] ? incoming[field] : draft[field]]));
  return {
    preferences: { ...incoming, ...retained },
    leadDaysText: leadDaysText.trim() && Number(leadDaysText) === saved.lead_days ? String(incoming.lead_days) : leadDaysText,
  };
}

export function stepNotificationLeadDays(text: string, direction: -1 | 1): string | null {
  const value = Number(text);
  if (!text.trim() || !Number.isInteger(value) || value < 0 || value > 14) return null;
  const next = value + direction;
  return next >= 0 && next <= 14 ? String(next) : null;
}

export function notificationQuietHoursVisible(
  pushControlsAvailable: boolean,
  saved: Pick<ApiNotificationPreferences, 'quiet_hours_start' | 'quiet_hours_end'> | null,
  draft: Pick<ApiNotificationPreferences, 'quiet_hours_start' | 'quiet_hours_end'>,
) {
  return pushControlsAvailable || Boolean(saved?.quiet_hours_start || saved?.quiet_hours_end || draft.quiet_hours_start || draft.quiet_hours_end);
}
