/** Demo dates follow the viewer's calendar; never use this for saved food dates. */
export function demoCalendarDate(referenceDate: Date, dayOffset: number): string {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + dayOffset, 12);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
