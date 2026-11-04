import assert from "node:assert/strict";
import test from "node:test";
import { withKoreanObjectParticle, withKoreanTopicParticle } from "../src/koreanParticles.ts";

test("topic particle follows the final syllable of a relative date", () => {
  assert.equal(withKoreanTopicParticle("모레"), "모레는");
  assert.equal(withKoreanTopicParticle("내일"), "내일은");
  assert.equal(withKoreanTopicParticle("11월 5일"), "11월 5일은");
});

test("object particle follows the final syllable of a food list or unit", () => {
  assert.equal(withKoreanObjectParticle("시금치·저지방 우유"), "시금치·저지방 우유를");
  assert.equal(withKoreanObjectParticle("두부 외 2개"), "두부 외 2개를");
  assert.equal(withKoreanObjectParticle("1팩"), "1팩을");
  assert.equal(withKoreanObjectParticle("500ml"), "500ml를");
});
