const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** `2026-11-09` (or `2026.11.09`) → `2026년 11월 9일 (월)`; anything else → "". */
export function formatKoreanDate(value: string) {
  const match = value.trim().match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}년 ${month}월 ${day}일 (${KOREAN_WEEKDAYS[date.getUTCDay()]})`;
}

/** Rewrites every calendar date inside a sentence (`소비기한 2026.09.02`) in the app's Korean style. */
export function withKoreanDates(text: string) {
  return text.replace(/\b\d{4}[-.]\d{2}[-.]\d{2}\b/g, (date) => formatKoreanDate(date) || date);
}
