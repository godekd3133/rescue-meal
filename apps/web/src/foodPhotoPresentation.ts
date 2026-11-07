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

/** Muted placeholder tint shown until a photo paints (and when none is available). */
export type FoodPhotoTone = 'greens' | 'protein' | 'dairy' | 'grain' | 'frozen' | 'neutral';

const TONE_KEYWORDS: ReadonlyArray<readonly [FoodPhotoTone, readonly string[]]> = [
  ['greens', ['채소', '과일', '나물', '김치', '시금치', '대파', '쪽파', '양파', '버섯', '토마토', '감자', '상추', '배추', '오이', '당근']],
  ['protein', ['육류', '고기', '닭', '돼지', '소고기', '생선', '수산', '해산물', '햄', '소시지']],
  ['dairy', ['유제품', '우유', '치즈', '요거트', '버터', '달걀', '계란']],
  ['grain', ['두부', '콩', '곡물', '쌀', '면', '빵', '떡', '가공', '소스', '양념']],
];

/** Category first, then the food's name; frozen storage wins only when nothing else matches. */
export function foodPhotoTone({ category, storage, foodName }: { category?: string | null; storage?: string | null; foodName?: string | null }): FoodPhotoTone {
  for (const source of [category, foodName]) {
    if (!source) continue;
    const match = TONE_KEYWORDS.find(([, words]) => words.some((word) => source.includes(word)));
    if (match) return match[0];
  }
  return storage === '냉동' ? 'frozen' : 'neutral';
}
