export type HomePriorityFood = {
  id: string;
  priority: number;
  dateKind: string;
  dateAssertionKind?: string;
  dateDetail: string;
  priorityDate?: string;
};

function calendarDate(value: string | undefined): number | null {
  const match = value?.match(/(?:^|\D)(\d{4})[.-](\d{2})[.-](\d{2})(?:$|\D)/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? timestamp : null;
}

/** Dates order review hints; they do not establish whether food is safe to eat. */
export function homePriorityDate(food: HomePriorityFood): number | null {
  if (food.dateAssertionKind === 'production_date' || food.dateAssertionKind === 'packaging_date') return null;
  if (food.dateKind === 'estimated_use_first') return calendarDate(food.priorityDate) ?? calendarDate(food.dateDetail);
  if (food.dateKind === 'user_confirmed' || food.dateKind === 'actual_printed') {
    return calendarDate(food.dateDetail) ?? calendarDate(food.priorityDate);
  }
  return null;
}

export function selectHomePriorityFoods<T extends HomePriorityFood>(foods: readonly T[], limit = 3): T[] {
  return [...foods].sort((a, b) => {
    const aDate = homePriorityDate(a), bDate = homePriorityDate(b);
    if (aDate !== null && bDate !== null && aDate !== bDate) return aDate - bDate;
    if (aDate !== null && bDate === null) return -1;
    if (aDate === null && bDate !== null) return 1;
    return a.priority - b.priority || a.id.localeCompare(b.id);
  }).slice(0, Math.max(0, limit));
}
