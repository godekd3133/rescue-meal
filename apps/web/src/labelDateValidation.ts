/** A printed candidate must be a real calendar date before it can be saved. */
export function isCompleteLabelDate(value: string) {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('.').map(Number);
  if (year < 1) return false;
  const date = new Date(`${value.replaceAll('.', '-')}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
