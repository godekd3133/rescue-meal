import assert from "node:assert/strict";
import test from "node:test";
import { notificationDisplayMessage, notificationDisplayTitle } from "../src/notificationPresentation.ts";
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

  assert.equal(title, "먼저 살펴볼 날짜 범위가 시작돼요");
  assert.doesNotMatch(title, /AI|우선순위/);
});

test("external inventory states explain what happened in plain Korean", () => {
  assert.equal(externalSyncLifecycleLabel("action_required"), "재고 앱에서 살펴봐 주세요");
  assert.equal(externalSyncLifecycleLabel("queued"), "재고 앱에 추가할 예정");
  assert.equal(externalSyncLifecycleLabel("processing"), "재고 앱에 추가하는 중");
  assert.equal(externalSyncLifecycleLabel("applied"), "재고 앱에 추가했어요");
});
