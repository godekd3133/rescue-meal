import assert from "node:assert/strict";
import test from "node:test";
import { getMealPlanErrorPresentation, mealPlanDisplayCopy, hasMeaningfulMealReason } from "../src/mealPlanPresentation.ts";

test("meal plan authentication errors ask for account recovery rather than retrying the recipe", () => {
  assert.deepEqual(getMealPlanErrorPresentation("authentication", "fallback", "conflict"), {
    message: "로그인 정보가 만료됐어요. 계정에 다시 연결해 주세요.",
    recovery: "account",
  });
});

test("meal plan conflict and transient errors keep their appropriate recovery copy", () => {
  assert.deepEqual(getMealPlanErrorPresentation("workspace-conflict", "fallback", "다른 기기에서 바뀌었어요. 다시 불러와 주세요."), {
    message: "다른 기기에서 바뀌었어요. 다시 불러와 주세요.",
    recovery: "refresh",
  });
  assert.deepEqual(getMealPlanErrorPresentation("other", "메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "conflict"), {
    message: "메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    recovery: "retry",
  });
});

test("older planner safety copy still hides internal recipe wording", () => {
  assert.equal(mealPlanDisplayCopy("레시피 후보를 만들려면 식품을 먼저 추가해 주세요."), "메뉴를 찾으려면 식품을 먼저 추가해 주세요.");
  assert.equal(mealPlanDisplayCopy("이 안내는 소비기한을 새로 판정하지 않습니다."), "먹어도 되는지는 앱에서 판단할 수 없어요.");
});

for (const reason of [null,'','식품 목록에 있는 재료를 활용한 메뉴예요.','현재 식품만으로 만들 수 있고, 먼저 먹기 순서가 높은 재료를 우선했어요.','재료 1/3개가 있고, 먼저 먹기 순서가 높은 식품을 우선했어요.']) test(`generic or old meal explanation is omitted: ${reason}`,()=>assert.equal(hasMeaningfulMealReason(reason),false));
for (const reason of ['현재 재료에 맞는 메뉴는 있지만 10분보다 오래 걸려요.','설정한 알레르기 조건을 적용해 제외했어요.','날짜와 보관 방법을 다시 확인해 주세요.']) test(`material meal reason stays visible: ${reason}`,()=>assert.equal(hasMeaningfulMealReason(reason),true));

test('printed-date review copy does not redefine the date as a non-expiry estimate',()=>{
 const text=mealPlanDisplayCopy('표시 날짜와 보관 상태를 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다.');
 assert.equal(text,'표시 날짜와 보관 상태를 확인하세요. 먹어도 되는지는 앱에서 판단할 수 없어요.');
 assert.doesNotMatch(text,/소비기한.*뜻하지/);
});

const {mealDateReviewCopy}=await import('../src/mealPlanPresentation.ts');
test('standard meal date warning leaves food targets to the separate buttons',()=>{
 assert.equal(mealDateReviewCopy('시금치·감자의 표시 날짜·보관 상태를 다시 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다.',['시금치','감자']),'보관 상태도 확인해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.');
});
test('custom meal caution remains intact',()=>{
 const note='시금치는 해동한 기록이 있어요. 보관 상태를 다시 살펴봐 주세요.';
 assert.equal(mealDateReviewCopy(note,['시금치']),note);
});
test('targets without a note retain the date and safety boundary',()=>{
 assert.equal(mealDateReviewCopy(null,['시금치']),'포장지 날짜와 보관 상태를 확인해 주세요. 먹어도 되는지는 앱에서 판단할 수 없어요.');
});
