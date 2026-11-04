import type { ApiFood } from './mealApi';
import type { DateConfirmationKind } from './DateAssertionEditor';

export function confirmedDateReadbackMatches(food: ApiFood | null | undefined, foodId: string, dateValue: string, kind: DateConfirmationKind, sourceDetail: string) {
  const assertion = food?.date_assertion;
  return food?.id === foodId && assertion?.kind === kind && assertion.value === dateValue
    && assertion.source === 'user_input' && assertion.source_detail === sourceDetail && assertion.user_confirmed === true;
}
