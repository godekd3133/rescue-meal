function hasFinalConsonant(value: string) {
  const lastCodePoint = value.charCodeAt(value.length - 1);
  // Digits and Latin letters are read too many ways to judge; use the vowel form.
  return lastCodePoint >= 0xac00 && lastCodePoint <= 0xd7a3 && (lastCodePoint - 0xac00) % 28 !== 0;
}

function withParticle(value: string, afterConsonant: string, afterVowel: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return `${trimmed}${hasFinalConsonant(trimmed) ? afterConsonant : afterVowel}`;
}

export function withKoreanObjectParticle(value: string) {
  return withParticle(value, "을", "를");
}

export function withKoreanTopicParticle(value: string) {
  return withParticle(value, "은", "는");
}

/** 으로/로: a final ㄹ takes 로 like a vowel. */
export function withKoreanDirectionParticle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  const final = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  return `${trimmed}${final !== 0 && final !== 8 ? "으로" : "로"}`;
}
