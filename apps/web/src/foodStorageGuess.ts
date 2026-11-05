import type { ApiStorageType } from "./mealApi";

const FROZEN_HINT = /(냉동|아이스|만두|얼음)/;
const AMBIENT_HINT = /(쌀|라면|국수|파스타|감자|고구마|양파|마늘|통조림|캔|과자|식빵|빵|설탕|소금|간장|식용유|올리브유|밀가루|김$|참치)/;

export function comparableFoodName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

/**
 * A conservative storage guess from a food name alone (refrigerated by default).
 * Shared by shopping receive and quick add; the person can always change it before saving.
 */
export function guessStorageFromName(name: string): ApiStorageType {
  const normalized = comparableFoodName(name);
  if (FROZEN_HINT.test(normalized)) return "frozen";
  if (AMBIENT_HINT.test(normalized)) return "ambient";
  return "refrigerated";
}
