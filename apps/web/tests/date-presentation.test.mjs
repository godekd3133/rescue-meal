import assert from "node:assert/strict";
import test from "node:test";
import { dateSourceLabel, displayedDateSource, getDateBadge, getInventoryDateOriginLabel } from "../src/datePresentation.ts";

test("estimated food stays an ordering hint and not an expiry date", () => {
  const food = { dateKind: "estimated_use_first", dateAssertionKind: "unknown", dateSource: "상품 유형 + 보관 방식" };

  assert.equal(getDateBadge(food), "먼저 살펴볼 시점");
  assert.equal(getInventoryDateOriginLabel(food), "먼저 살펴볼 시점");
  assert.equal(dateSourceLabel(food.dateSource, food.dateKind), "식품 종류와 보관 방법");
});

test("receipt and storage evidence is shown with consumer-friendly labels", () => {
  assert.equal(
    dateSourceLabel("영수증 + 상품 유형 · refrigerated 보관 기준", "estimated_use_first"),
    "구매 기록과 식품 종류 · 냉장 보관 기준",
  );
});

test("internal inference provenance is replaced with neutral copy", () => {
  assert.equal(
    dateSourceLabel("rule-assisted-backend-inference provider priority-rules-v1 input_sha256", "estimated_use_first"),
    "날짜 정보를 확인할 수 없어요",
  );
});


test("a generated use-first estimate does not claim the user entered its date", () => {
  assert.equal(dateSourceLabel("user_input", "estimated_use_first"), "식품 종류와 보관 방법");
  assert.equal(dateSourceLabel("사용자 입력", "estimated_use_first"), "식품 종류와 보관 방법");
  assert.equal(dateSourceLabel("user_input", "actual_printed"), "포장지에서 직접 확인");
  assert.equal(dateSourceLabel("user_input", "user_confirmed"), "내가 정한 날짜");
});

test('manual priority basis uses its actual storage label',()=>assert.equal(dateSourceLabel('상품 유형 + 보관 방식 · ambient 보관 기준','estimated_use_first'),'식품 종류와 보관 방법 · 실온 보관 기준'));
test('legacy pending source is not presented as a priority evidence label',()=>assert.equal(dateSourceLabel('사용자 입력 대기','estimated_use_first'),'참고 기준 미확인'));

test('the visible generated date selects estimate evidence, not printed-date placeholder',()=>assert.equal(displayedDateSource('estimated_use_first','사용자 입력 대기','상품 유형 + 보관 방식'),'상품 유형 + 보관 방식'));
test('printed date retains its printed evidence',()=>assert.equal(displayedDateSource('actual_printed','포장지 직접 확인','상품 유형 + 보관 방식'),'포장지 직접 확인'));
test('a missing estimate basis stays unknown rather than borrowing printed-date evidence',()=>assert.equal(displayedDateSource('estimated_use_first','포장지 직접 확인',null),'unknown'));

for (const [storage,label] of [['refrigerated','냉장'],['frozen','냉동'],['ambient','실온']]) test(`priority rule source shows ${label} meaning instead of internal identifiers`,()=>{
 const labelText=dateSourceLabel(`priority.fresh-produce.v1 · ${storage}`,'estimated_use_first');
 assert.equal(labelText,`식품 종류와 ${label} 보관 정보 참고`);assert.doesNotMatch(labelText,/priority\.|v1|refrigerated|frozen|ambient|·/);
});
test('a priority rule without storage only describes the reference basis',()=>assert.equal(dateSourceLabel('priority.fresh-produce.v1','estimated_use_first'),'식품 종류와 보관 방법 참고'));
test('a priority rule is not presented as a printed-date source',()=>assert.equal(dateSourceLabel('priority.fresh-produce.v1 · refrigerated','actual_printed'),'날짜 출처 미확인'));

test('placeholder detail defers to the recorded assertion source instead of showing pending input',()=>assert.equal(displayedDateSource('actual_printed','사용자 입력 대기',null,'user_input'),'user_input'));
test('a meaningful source description is kept instead of replaced by a generic source type',()=>assert.equal(displayedDateSource('actual_printed','포장지에서 직접 확인',null,'user_input'),'포장지에서 직접 확인'));
test('unknown assertion source is not inferred from the existence of a date',()=>assert.equal(displayedDateSource('actual_printed','사용자 입력 대기',null,'unknown'),'unknown'));

test('personal reminders retain their meaning on home, inventory and detail',()=>{
 const food={dateKind:'user_confirmed',dateAssertionKind:'user_reminder',dateSource:'사용자가 확인한 날짜'};
 assert.equal(getDateBadge(food),'내 알림일');assert.equal(getInventoryDateOriginLabel(food),'내 알림일');assert.equal(dateSourceLabel(food.dateSource,food.dateKind),'내가 정한 날짜');
});
test('a manually confirmed printed expiry is still a package date',()=>{
 const food={dateKind:'actual_printed',dateAssertionKind:'use_by',dateSource:'user_input'};
 assert.equal(getDateBadge(food),'포장 소비기한');assert.equal(getInventoryDateOriginLabel(food),'포장지 표시');assert.equal(dateSourceLabel(food.dateSource,food.dateKind),'포장지에서 직접 확인');
});
