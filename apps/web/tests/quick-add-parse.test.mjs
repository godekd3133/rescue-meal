import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuickAddChips,
  changeQuickAddAmount,
  defaultQuickAddUnit,
  formatQuickAddQuantity,
  mergeQuickAddRecent,
  nextQuickAddStorage,
  parseQuickAddLine,
  quickAddStorageFromName,
  readQuickAddRecent,
  stageQuickAddFood,
  writeQuickAddRecent,
} from "../src/quickAddParse.ts";
import { foodMatchesStaple, userFoodForStaple } from "../src/quickAddStaples.ts";

const pick = (foods) => foods.map(({ name, amount, unit }) => `${name}:${amount}${unit}`);

test("one line stages several foods and attaches a trailing quantity to the food before it", () => {
  assert.deepEqual(pick(parseQuickAddLine("우유 두부 대파 계란 10개")), ["우유:1개", "두부:1모", "대파:1단", "계란:10개"]);
  assert.equal(parseQuickAddLine("우유 두부 대파 계란 10개")[3].amountGiven, true);
  assert.equal(parseQuickAddLine("우유 두부")[0].amountGiven, false);
});

test("glued, spaced, bare and native-Korean quantities are understood", () => {
  assert.deepEqual(pick(parseQuickAddLine("계란10개 우유 2 두부 두 모 사과 세개")), ["계란:10개", "우유:2개", "두부:2모", "사과:3개"]);
  assert.deepEqual(pick(parseQuickAddLine("우유1L 돼지고기 600g")), ["우유:1L", "돼지고기:600g"]);
  assert.deepEqual(pick(parseQuickAddLine("감자 1.5 kg")), ["감자:1.5kg"]);
});

test("commas keep multi-word names together", () => {
  assert.deepEqual(pick(parseQuickAddLine("닭 가슴살 2팩, 우유, 방울 토마토 1 팩")), ["닭 가슴살:2팩", "우유:1개", "방울 토마토:1팩"]);
  assert.deepEqual(pick(parseQuickAddLine("두부\n김치 1통")), ["두부:1모", "김치:1통"]);
});

test("names that end in digits without a unit stay names, stray quantities are dropped", () => {
  assert.deepEqual(pick(parseQuickAddLine("비타500")), ["비타500:1개"]);
  assert.deepEqual(pick(parseQuickAddLine("10개 우유")), ["우유:1개"]);
  assert.deepEqual(parseQuickAddLine("   "), []);
  assert.deepEqual(parseQuickAddLine("0개"), []);
});

test("repeated names merge instead of duplicating", () => {
  assert.deepEqual(pick(parseQuickAddLine("우유 우유 계란 2개 계란 3개")), ["우유:2개", "계란:5개"]);
});

test("default units and storage guesses come from the name", () => {
  assert.equal(defaultQuickAddUnit("두부"), "모");
  assert.equal(defaultQuickAddUnit("시금치"), "단");
  assert.equal(defaultQuickAddUnit("우유"), "개");
  assert.equal(quickAddStorageFromName("냉동만두"), "냉동");
  assert.equal(quickAddStorageFromName("양파"), "실온");
  assert.equal(quickAddStorageFromName("우유"), "냉장");
});

test("staging bumps an already staged food and stepping to zero removes it", () => {
  let id = 0;
  const createId = () => `q${++id}`;
  let staged = stageQuickAddFood([], { name: "우유" }, createId);
  staged = stageQuickAddFood(staged, { name: " 우유 " }, createId);
  staged = stageQuickAddFood(staged, { name: "계란", amount: 10, unit: "개" }, createId);
  staged = stageQuickAddFood(staged, { name: "계란", amount: 6, unit: "개" }, createId);
  assert.deepEqual(staged.map((food) => `${food.name}:${formatQuickAddQuantity(food)}:${food.storage}`), ["우유:2개:냉장", "계란:16개:냉장"]);
  staged = changeQuickAddAmount(staged, "q1", -1);
  staged = changeQuickAddAmount(staged, "q1", -1);
  assert.deepEqual(staged.map((food) => food.name), ["계란"]);
  assert.equal(nextQuickAddStorage("냉장"), "냉동");
  assert.equal(nextQuickAddStorage("실온"), "냉장");
});

test("chips list recent, then frequent inventory foods, then starters without duplicates", () => {
  const chips = buildQuickAddChips({
    recent: [
      { name: "두부", unit: "모", storage: "냉장", count: 3, lastUsedAt: 2 },
      { name: "콜라", unit: "개", storage: "실온", count: 1, lastUsedAt: 5 },
    ],
    inventoryNames: ["시금치", "닭가슴살", "닭가슴살", "두부"],
    limit: 6,
  });
  assert.deepEqual(chips.map((chip) => `${chip.source}:${chip.name}`), ["recent:콜라", "recent:두부", "frequent:닭가슴살", "frequent:시금치", "starter:우유", "starter:계란"]);
  assert.equal(buildQuickAddChips({ recent: [], inventoryNames: [] }).every((chip) => chip.source === "starter"), true);
});

test("a staple matches the person's fuller or synonym name, not a different food", () => {
  assert.equal(foodMatchesStaple("저지방 우유", "우유"), true);
  assert.equal(foodMatchesStaple("서울우유 1L", "우유"), true);
  assert.equal(foodMatchesStaple("국산콩 두부", "두부"), true);
  assert.equal(foodMatchesStaple("동물복지 달걀", "계란"), true);
  assert.equal(foodMatchesStaple("유정란", "계란"), true);
  assert.equal(foodMatchesStaple("맛타리버섯", "버섯"), true);
  assert.equal(foodMatchesStaple("요구르트", "요거트"), true);
  assert.equal(foodMatchesStaple("우유식빵", "우유"), false);
  assert.equal(foodMatchesStaple("두부조림", "두부"), false);
  assert.equal(foodMatchesStaple("두유", "우유"), false);
  assert.equal(foodMatchesStaple("대추방울토마토", "양파"), false);
  assert.equal(userFoodForStaple("계란", ["시금치", "동물복지 달걀"]), "동물복지 달걀");
  assert.equal(userFoodForStaple("대파", ["시금치", "동물복지 달걀"]), undefined);
});

test("starters the person already keeps under their own name are merged into one chip", () => {
  const chips = buildQuickAddChips({
    recent: [],
    inventoryNames: ["시금치", "국산콩 두부", "닭가슴살", "맛타리버섯", "동물복지 달걀", "저지방 우유", "대추방울토마토"],
  });
  assert.deepEqual(chips.map((chip) => chip.name), [
    "시금치", "국산콩 두부", "닭가슴살", "맛타리버섯", "동물복지 달걀", "저지방 우유", "대추방울토마토", "대파", "양파", "감자",
  ]);
  for (const staple of ["우유", "계란", "두부", "버섯"]) assert.equal(chips.some((chip) => chip.name === staple), false);
  assert.equal(chips.length <= 10, true);
  // A recent food counts as the person's own name too.
  const recentChips = buildQuickAddChips({ recent: [{ name: "달걀", unit: "개", storage: "냉장", count: 1, lastUsedAt: 1 }], inventoryNames: [] });
  assert.deepEqual(recentChips.slice(0, 3).map((chip) => `${chip.source}:${chip.name}`), ["recent:달걀", "starter:우유", "starter:두부"]);
});

test("the recent list is scoped, capped and survives a blocked store", () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const merged = mergeQuickAddRecent([], [{ name: "우유", unit: "개", storage: "냉장" }, { name: "두부", unit: "모", storage: "냉장" }], 100);
  writeQuickAddRecent("workspace-a", merged, storage);
  assert.deepEqual(readQuickAddRecent("workspace-a", storage).map((entry) => entry.name), ["두부", "우유"]);
  assert.deepEqual(readQuickAddRecent("workspace-b", storage), []);
  const again = mergeQuickAddRecent(readQuickAddRecent("workspace-a", storage), [{ name: "우유", unit: "개", storage: "냉장" }], 200);
  assert.equal(again.find((entry) => entry.name === "우유").count, 2);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readQuickAddRecent("x", throwing), []);
  assert.doesNotThrow(() => writeQuickAddRecent("x", merged, throwing));
  store.set("rescue-meal.quick-add.recent.v1:bad", "{not json");
  assert.deepEqual(readQuickAddRecent("bad", storage), []);
});
