import { FOOD_IMAGES, imageForKnownFoodName } from './foodPhotos.ts';

export type FoodPhotoFailure = { source: string; fallbackFailed: boolean; fallback: string | null } | null;

export function foodPhotoPresentation(src: string, foodName: string, failure: FoodPhotoFailure) {
  const fallback = imageForKnownFoodName(foodName);
  const primary = src === FOOD_IMAGES.groceries ? fallback : src || fallback;
  const failed = failure?.source === src;
  const fallbackUnavailable = failed && failure?.fallbackFailed && failure.fallback === fallback;
  if (!primary || (failed && (!fallback || fallbackUnavailable))) return { kind: 'placeholder' as const };
  return {
    kind: 'image' as const,
    source: failed ? fallback! : primary,
    fallback,
  };
}
