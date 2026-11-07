import { comparableFoodName } from "./foodStorageGuess.ts";

/**
 * Other names people use for a starter staple. A staple chip is dropped when one of the
 * person's own foods already goes by the staple or one of these names.
 */
export const QUICK_ADD_STAPLE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  계란: ["달걀", "유정란"],
  돼지고기: ["삼겹살", "목살", "앞다리살"],
  요거트: ["요구르트", "요플레"],
};

function stapleTerms(staple: string) {
  return [staple, ...(QUICK_ADD_STAPLE_SYNONYMS[staple] ?? [])].map((term) => comparableFoodName(term).replace(/\s+/g, ""));
}

/**
 * True when `foodName` is the staple under a fuller or different name: one of its words
 * ends with the staple or a synonym (`저지방 우유`, `국산콩 두부`, `동물복지 달걀`,
 * `맛타리버섯`). Korean food names put the food last, so `우유식빵` or `두부조림`
 * do not count as 우유 or 두부.
 */
export function foodMatchesStaple(foodName: string, staple: string) {
  const words = comparableFoodName(foodName).split(" ").filter(Boolean);
  const terms = stapleTerms(staple);
  return words.some((word) => terms.some((term) => term && word.endsWith(term)));
}

/** The person's food that already stands for this staple, if any. */
export function userFoodForStaple(staple: string, userFoodNames: readonly string[]) {
  return userFoodNames.find((name) => foodMatchesStaple(name, staple));
}
