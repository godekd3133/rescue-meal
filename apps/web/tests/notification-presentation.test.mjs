import assert from "node:assert/strict";
import test from "node:test";
import { notificationDisplayMessage, notificationDisplayTitle, notificationListState, notificationShowsEventTime } from "../src/notificationPresentation.ts";
import { externalSyncLifecycleLabel } from "../src/externalSyncPresentation.ts";

test("estimated use-first windows read as references, not date-confirmation prompts", () => {
  const message = notificationDisplayMessage({
    kind: "date_due",
    message: "시금치: 2026년 9월 29일~2026년 10월 2일 사이에 먼저 확인해 보세요. 이 기간은 참고용이며 소비기한이나 식품 안전을 판정한 안내가 아니니 포장지 날짜와 식품 상태를 확인해 주세요.",
  });

  assert.equal(
    message,
    "시금치: 먼저 살펴볼 시점은 2026년 9월 29일~2026년 10월 2일 사이예요. 소비기한이나 먹어도 되는지를 판단하는 기준은 아니니, 포장지 날짜와 식품 상태를 확인해 주세요.",
  );
});

test("notification titles replace internal priority terminology with plain Korean", () => {
  const title = notificationDisplayTitle({
    kind: "date_due",
    title: "AI 소비 우선순위 범위가 시작돼요",
    canonical_name: "시금치",
  });

  assert.equal(title, "시금치 먼저 살펴볼 날짜 범위가 시작돼요");
  assert.doesNotMatch(title, /AI|우선순위/);
});

test("external inventory states explain what happened in plain Korean", () => {
  assert.equal(externalSyncLifecycleLabel("action_required"), "재고 앱에서 살펴봐 주세요");
  assert.equal(externalSyncLifecycleLabel("queued"), "재고 앱에 추가할 예정");
  assert.equal(externalSyncLifecycleLabel("processing"), "재고 앱에 추가하는 중");
  assert.equal(externalSyncLifecycleLabel("applied"), "재고 앱에 추가했어요");
});

test("generic food titles identify the food and correct review task", () => {
  assert.equal(notificationDisplayTitle({kind:"date_check",title:"오늘 먼저 확인할 식품이에요",canonical_name:"시금치"}),"시금치 날짜를 살펴봐 주세요");
  assert.equal(notificationDisplayTitle({kind:"storage_mismatch",title:"확인할 식품이 있어요",canonical_name:"두부"}),"두부 보관 방법을 살펴봐 주세요");
});

test("food message keeps its date meaning while removing a repeated subject", () => {
  assert.equal(notificationDisplayMessage({kind:"date_due",canonical_name:"두부",message:"두부: 내일은 참고로 표시한 날짜예요. 소비기한과는 다르니 포장지 날짜를 확인해 주세요."}),"내일은 참고로 표시한 날짜예요. 소비기한과는 다르니 포장지 날짜를 확인해 주세요.");
});

test("external sync messages retain their operation subject", () => {
  assert.equal(notificationDisplayMessage({kind:"grocy_sync",canonical_name:"두부",message:"두부: 재고 앱에서 확인해 주세요."}),"두부: 재고 앱에서 확인해 주세요.");
});


test("a date-check message repeating the title adds no second instruction", () => {
  assert.equal(notificationDisplayMessage({kind:"date_check",canonical_name:"시금치",message:"시금치 날짜를 확인해 주세요."}), "");
});


test("failed empty reads never claim there are no alerts", () => {
  assert.equal(notificationListState(false, "read unavailable", 0), "failed");
  assert.equal(notificationListState(true, "", 0), "loading");
  assert.equal(notificationListState(false, "", 0), "empty");
});

test("existing rows remain distinguishable from an unavailable empty read", () => {
  assert.equal(notificationListState(false, "refresh unavailable", 2), "rows");
});


test('legacy consumption priority remains an inspection order instead of eating advice',()=>{
 const input={kind:'date_due',canonical_name:'시금치',title:'AI 소비 우선순위를 확인해 주세요',message:'AI 소비 우선순위를 참고해 주세요. 포장지 날짜를 확인해 주세요.'};
 assert.equal(notificationDisplayTitle(input),'시금치 먼저 살펴볼 순서를 확인해 주세요');
 assert.equal(notificationDisplayMessage(input),'먼저 살펴볼 순서를 참고해 주세요. 포장지 날짜를 확인해 주세요.');
});

test("derived food reminder read times are not displayed as event times",()=>{
 for(const kind of ['date_due','date_check','storage_mismatch']) assert.equal(notificationShowsEventTime({kind}),false);
 assert.equal(notificationShowsEventTime({kind:'grocy_sync'}),true);
});

test("food notification subjects are visible in otherwise generic titles", () => {
  assert.equal(notificationDisplayTitle({ kind: "date_check", title: "표시 날짜를 확인해 주세요", canonical_name: "우유" }), "우유 표시 날짜를 확인해 주세요");
});
test("an existing food subject is not repeated in the notification title", () => {
  assert.equal(notificationDisplayTitle({ kind: "date_due", title: "양배추 내 알림일이 다가와요", canonical_name: "양배추" }), "양배추 내 알림일이 다가와요");
});
test("the body removes a repeated subject without dropping the reason or action", () => {
  assert.equal(notificationDisplayMessage({ kind: "date_check", canonical_name: "우유", message: "우유의 날짜를 확인하지 못했어요. 포장지 날짜를 입력해 주세요." }), "날짜를 확인하지 못했어요. 포장지 날짜를 입력해 주세요.");
});
test("subject trimming treats names containing punctuation as literal text", () => {
  assert.equal(notificationDisplayMessage({ kind: "date_check", canonical_name: "우유(저지방)", message: "우유(저지방)의 날짜를 확인해 주세요." }), "날짜를 확인해 주세요.");
});
test("external sync notification titles retain their own workflow subject", () => {
  assert.equal(notificationDisplayTitle({ kind: "grocy_sync", canonical_name: "우유", title: "재고 앱에 반영했어요" }), "재고 앱에 반영했어요");
});
