import { comparableFoodName, guessStorageFromName } from "./foodStorageGuess.ts";

export type QuickAddStorage = "냉장" | "냉동" | "실온";

export type QuickAddParsedFood = {
  name: string;
  amount: number;
  unit: string;
  /** True when the person typed a quantity for this food. */
  amountGiven: boolean;
};

export type QuickAddStagedFood = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  storage: QuickAddStorage;
};

export type QuickAddRecentEntry = {
  name: string;
  unit: string;
  storage: QuickAddStorage;
  count: number;
  lastUsedAt: number;
};

export type QuickAddChip = {
  name: string;
  source: "recent" | "frequent" | "starter";
};

/** Common Korean groceries shown when the person has little history yet. */
export const QUICK_ADD_STARTER_FOODS = [
  "우유",
  "계란",
  "두부",
  "대파",
  "양파",
  "감자",
  "당근",
  "애호박",
  "콩나물",
  "김치",
  "돼지고기",
  "닭가슴살",
  "버섯",
  "사과",
  "요거트",
  "시금치",
] as const;

const QUICK_ADD_UNITS = [
  "킬로그램", "그램", "리터", "봉지", "박스", "묶음", "포기", "송이", "마리",
  "kg", "ml", "mL", "g", "l", "L",
  "개", "팩", "모", "봉", "병", "캔", "통", "단", "망", "판", "줄", "근", "컵", "장", "알", "인분",
] as const;
const UNIT_ALIASES: Record<string, string> = { 킬로그램: "kg", 그램: "g", 리터: "L", l: "L", mL: "ml" };
const UNIT_PATTERN = QUICK_ADD_UNITS.map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const NATIVE_NUMBERS: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 석: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};
const NATIVE_PATTERN = Object.keys(NATIVE_NUMBERS).sort((left, right) => right.length - left.length).join("|");
const MAX_NAME_LENGTH = 40;
const MAX_AMOUNT = 9999;

const DEFAULT_UNIT_RULES: Array<[RegExp, string]> = [
  [/두부/, "모"],
  [/(대파|쪽파|시금치|부추|깻잎|미나리|열무|얼갈이|청경채)/, "단"],
  [/(배추)$/, "포기"],
  [/(돼지고기|소고기|닭고기|삼겹살|목살|다짐육|닭가슴살|불고기|베이컨|소시지|어묵|콩나물|숙주|버섯|딸기|방울토마토)/, "팩"],
  [/김치/, "통"],
  [/(라면|국수)/, "봉"],
];

/** A sensible counting unit for a food name when the person did not type one. */
export function defaultQuickAddUnit(name: string) {
  const normalized = comparableFoodName(name);
  for (const [pattern, unit] of DEFAULT_UNIT_RULES) {
    if (pattern.test(normalized)) return unit;
  }
  return "개";
}

export function quickAddStorageFromName(name: string): QuickAddStorage {
  const guess = guessStorageFromName(name);
  return guess === "frozen" ? "냉동" : guess === "ambient" ? "실온" : "냉장";
}

function normalizeUnit(unit: string) {
  return UNIT_ALIASES[unit] ?? unit;
}

function validAmount(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT;
}

/** Reads a standalone quantity token such as `10개`, `2`, `1.5kg`, `두개`. */
function parseQuantityToken(token: string): { amount: number; unit: string | null } | null {
  const numeric = token.match(new RegExp(`^(\\d+(?:\\.\\d+)?)(${UNIT_PATTERN})?$`, "u"));
  if (numeric) {
    const amount = Number(numeric[1]);
    return validAmount(amount) ? { amount, unit: numeric[2] ? normalizeUnit(numeric[2]) : null } : null;
  }
  const native = token.match(new RegExp(`^(${NATIVE_PATTERN})(${UNIT_PATTERN})$`, "u"));
  if (native) return { amount: NATIVE_NUMBERS[native[1]], unit: normalizeUnit(native[2]) };
  return null;
}

function isUnitToken(token: string) {
  return new RegExp(`^(${UNIT_PATTERN})$`, "u").test(token);
}

/** Splits `계란10개` into a name and a trailing quantity that is glued to it. */
function splitGluedQuantity(segment: string): { name: string; amount: number; unit: string } | null {
  const glued = segment.match(new RegExp(`^(.*\\D)(\\d+(?:\\.\\d+)?)(${UNIT_PATTERN})$`, "u"));
  if (!glued || !glued[1].trim()) return null;
  const amount = Number(glued[2]);
  if (!validAmount(amount)) return null;
  return { name: glued[1].trim(), amount, unit: normalizeUnit(glued[3]) };
}

function cleanName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

type Draft = { name: string; amount: number | null; unit: string | null };

function draftsFromTokens(tokens: string[]): Draft[] {
  const drafts: Draft[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = drafts[drafts.length - 1];
    const next = tokens[index + 1];
    // `한 개`, `10 개`: a number word followed by a separate unit token.
    if (previous && previous.amount === null && next && isUnitToken(next)) {
      const joined = parseQuantityToken(`${token}${next}`);
      if (joined) {
        previous.amount = joined.amount;
        previous.unit = joined.unit;
        index += 1;
        continue;
      }
    }
    const quantity = parseQuantityToken(token);
    if (quantity) {
      if (previous && previous.amount === null) {
        previous.amount = quantity.amount;
        previous.unit = quantity.unit;
      }
      continue;
    }
    const glued = splitGluedQuantity(token);
    if (glued) {
      drafts.push({ name: glued.name, amount: glued.amount, unit: glued.unit });
      continue;
    }
    drafts.push({ name: token, amount: null, unit: null });
  }
  return drafts;
}

function draftFromSegment(segment: string): Draft | null {
  const words = segment.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  // Peel a trailing quantity (`계란 10개`, `닭 가슴살 2 팩`, `우유 두 개`) off a comma-separated segment.
  let amount: number | null = null;
  let unit: string | null = null;
  if (words.length >= 2) {
    const lastTwo = parseQuantityToken(`${words[words.length - 2]}${words[words.length - 1]}`);
    if (words.length >= 3 && lastTwo && isUnitToken(words[words.length - 1])) {
      amount = lastTwo.amount;
      unit = lastTwo.unit;
      words.splice(-2, 2);
    } else {
      const last = parseQuantityToken(words[words.length - 1]);
      if (last) {
        amount = last.amount;
        unit = last.unit;
        words.pop();
      }
    }
  }
  if (amount === null) {
    const glued = splitGluedQuantity(words.join(" "));
    if (glued) return { name: glued.name, amount: glued.amount, unit: glued.unit };
  }
  return { name: words.join(" "), amount, unit };
}

/**
 * Parses one line such as `우유 두부 대파 계란 10개` into several foods.
 * Commas (or line breaks) separate foods whose names contain spaces: `닭 가슴살 2팩, 우유`.
 * Without commas every word is a food, and a quantity attaches to the food before it.
 */
export function parseQuickAddLine(input: string): QuickAddParsedFood[] {
  const text = input.normalize("NFKC").trim();
  if (!text) return [];
  const drafts = /[,，、;\n]/.test(text)
    ? text.split(/[,，、;\n]+/).map((segment) => draftFromSegment(segment.trim())).filter((draft): draft is Draft => draft !== null)
    : draftsFromTokens(text.split(/\s+/).filter(Boolean));
  const parsed: QuickAddParsedFood[] = [];
  for (const draft of drafts) {
    const name = cleanName(draft.name);
    if (!name || new RegExp(`^[\\d.]+(${UNIT_PATTERN})?$`, "u").test(name)) continue;
    const unit = draft.unit ?? defaultQuickAddUnit(name);
    const amount = draft.amount ?? 1;
    const existing = parsed.find((food) => comparableFoodName(food.name) === comparableFoodName(name));
    if (existing) {
      if (existing.unit === unit) {
        existing.amount = Math.min(MAX_AMOUNT, roundAmount(existing.amount + amount));
        existing.amountGiven = existing.amountGiven || draft.amount !== null;
      } else if (draft.amount !== null) {
        existing.amount = amount;
        existing.unit = unit;
        existing.amountGiven = true;
      }
      continue;
    }
    parsed.push({ name, amount, unit, amountGiven: draft.amount !== null });
  }
  return parsed;
}

function roundAmount(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function formatQuickAddQuantity(food: Pick<QuickAddStagedFood, "amount" | "unit">) {
  return `${roundAmount(food.amount)}${food.unit}`;
}

/**
 * Adds a food to the staged list. A food that is already staged is bumped instead of
 * duplicated: by the typed amount when units match, otherwise by one of its own unit.
 */
export function stageQuickAddFood(
  staged: QuickAddStagedFood[],
  input: { name: string; amount?: number; unit?: string; storage?: QuickAddStorage },
  createId: () => string,
): QuickAddStagedFood[] {
  const name = cleanName(input.name);
  if (!name) return staged;
  const key = comparableFoodName(name);
  const index = staged.findIndex((food) => comparableFoodName(food.name) === key);
  if (index >= 0) {
    const current = staged[index];
    const step = input.amount !== undefined && (input.unit === undefined || input.unit === current.unit) ? input.amount : 1;
    const bumped = { ...current, amount: Math.min(MAX_AMOUNT, roundAmount(current.amount + step)) };
    return staged.map((food, foodIndex) => foodIndex === index ? bumped : food);
  }
  return [...staged, {
    id: createId(),
    name,
    amount: input.amount !== undefined && validAmount(input.amount) ? input.amount : 1,
    unit: input.unit ?? defaultQuickAddUnit(name),
    storage: input.storage ?? quickAddStorageFromName(name),
  }];
}

export function changeQuickAddAmount(staged: QuickAddStagedFood[], id: string, delta: number) {
  return staged.flatMap((food) => {
    if (food.id !== id) return [food];
    const next = roundAmount(food.amount + delta);
    if (next <= 0) return [];
    return [{ ...food, amount: Math.min(MAX_AMOUNT, next) }];
  });
}

export function nextQuickAddStorage(storage: QuickAddStorage): QuickAddStorage {
  return storage === "냉장" ? "냉동" : storage === "냉동" ? "실온" : "냉장";
}

/**
 * Chips in tap order: foods used recently on this device, then foods the person keeps
 * (inventory names, most frequent first), then a starter set so an empty space still
 * offers one-tap choices.
 */
export function buildQuickAddChips({
  recent,
  inventoryNames,
  limit = 12,
}: {
  recent: ReadonlyArray<QuickAddRecentEntry>;
  inventoryNames: ReadonlyArray<string>;
  limit?: number;
}): QuickAddChip[] {
  const chips: QuickAddChip[] = [];
  const seen = new Set<string>();
  const push = (name: string, source: QuickAddChip["source"]) => {
    const clean = cleanName(name);
    const key = comparableFoodName(clean);
    if (!clean || seen.has(key) || chips.length >= limit) return;
    seen.add(key);
    chips.push({ name: clean, source });
  };
  [...recent].sort((left, right) => right.lastUsedAt - left.lastUsedAt).slice(0, 6).forEach((entry) => push(entry.name, "recent"));
  const frequency = new Map<string, { name: string; count: number; first: number }>();
  inventoryNames.forEach((name, index) => {
    const clean = cleanName(name);
    const key = comparableFoodName(clean);
    if (!clean) return;
    const current = frequency.get(key);
    frequency.set(key, current ? { ...current, count: current.count + 1 } : { name: clean, count: 1, first: index });
  });
  recent.forEach((entry) => {
    const key = comparableFoodName(entry.name);
    const current = frequency.get(key);
    if (current) frequency.set(key, { ...current, count: current.count + entry.count });
  });
  [...frequency.values()]
    .sort((left, right) => right.count - left.count || left.first - right.first)
    .forEach((entry) => push(entry.name, "frequent"));
  QUICK_ADD_STARTER_FOODS.forEach((name) => push(name, "starter"));
  return chips;
}

const RECENT_LIMIT = 20;
const RECENT_KEY_PREFIX = "rescue-meal.quick-add.recent.v1";

function recentStorageKey(scope: string) {
  return `${RECENT_KEY_PREFIX}:${scope || "local"}`;
}

function isRecentEntry(value: unknown): value is QuickAddRecentEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && typeof entry.unit === "string"
    && (entry.storage === "냉장" || entry.storage === "냉동" || entry.storage === "실온")
    && typeof entry.count === "number" && typeof entry.lastUsedAt === "number";
}

export function readQuickAddRecent(scope: string, storage: Pick<Storage, "getItem"> | null = safeLocalStorage()): QuickAddRecentEntry[] {
  try {
    const raw = storage?.getItem(recentStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentEntry).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function mergeQuickAddRecent(current: ReadonlyArray<QuickAddRecentEntry>, saved: ReadonlyArray<Pick<QuickAddStagedFood, "name" | "unit" | "storage">>, now: number) {
  const next = [...current];
  saved.forEach((food, index) => {
    const key = comparableFoodName(food.name);
    const existingIndex = next.findIndex((entry) => comparableFoodName(entry.name) === key);
    const usedAt = now + index;
    if (existingIndex >= 0) {
      next[existingIndex] = { ...next[existingIndex], name: food.name, unit: food.unit, storage: food.storage, count: next[existingIndex].count + 1, lastUsedAt: usedAt };
    } else {
      next.push({ name: food.name, unit: food.unit, storage: food.storage, count: 1, lastUsedAt: usedAt });
    }
  });
  return next.sort((left, right) => right.lastUsedAt - left.lastUsedAt).slice(0, RECENT_LIMIT);
}

export function writeQuickAddRecent(scope: string, entries: ReadonlyArray<QuickAddRecentEntry>, storage: Pick<Storage, "setItem"> | null = safeLocalStorage()) {
  try {
    storage?.setItem(recentStorageKey(scope), JSON.stringify(entries.slice(0, RECENT_LIMIT)));
  } catch {
    // Recent chips are a convenience; a blocked store just means no recent list.
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
