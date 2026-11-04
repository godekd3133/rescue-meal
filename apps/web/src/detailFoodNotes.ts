import type { DatePresentationKind } from "./datePresentation";

const estimatedNotes = new Set([
  "실제 소비기한이 아닌 먼저 먹을 순서예요.",
  "실제 소비기한이 아니라 먼저 먹기 위한 추정 순서예요.",
  "신선식품은 날짜가 없을 수 있어 먼저 살펴볼 순서만 알려드려요.",
  "신선식품은 날짜가 인쇄되지 않을 수 있어 우선순위로만 안내해요.",
]);
const printedEvidenceNotes = new Set([
  "포장지에서 유효년월일을 확인했어요.",
  "달걀 포장지에 있는 표시 날짜를 기록했어요.",
  "예시 포장지의 소비기한을 기록했어요.",
  "포장지에서 날짜를 확인했어요.",
]);

export function detailFoodNote(note: string, kind: DatePresentationKind, dateReviewShown: boolean, purchaseDetailsShown = false): string | null {
  const value = note.trim();
  if (!value || value === "날짜와 보관 방법을 확인해 주세요.") return null;
  if (kind === "user_confirmed" && ["직접 확인한 날짜를 기준으로 보여드려요.", "사용자가 확인한 날짜를 우선 사용하고 있어요.", "내가 정한 알림 날짜예요.", "알림으로 설정한 날짜예요."].includes(value)) return null;
  if (purchaseDetailsShown && value === "구매일과 보관 위치를 기록했어요. 소비기한은 포장지에서 확인해 주세요.") return null;
  if (purchaseDetailsShown && kind === "estimated_use_first"
    && value === "구매일을 기록했어요. 소비기한은 포장지에서 확인해 주세요. 먼저 볼 순서는 참고용이며, 먹어도 되는지를 판단하지 않아요.") return null;
  if (kind === "actual_printed" && /^(제조일|포장일|유통기한|소비기한|품질유지기한)[을를] 포장지에서 확인했어요\.$/.test(value)) return null;
  if (kind === "estimated_use_first" && estimatedNotes.has(value)) return null;
  if (dateReviewShown && printedEvidenceNotes.has(value)) return null;
  if (value === "소비기한은 포장지에서 확인해 주세요. 구매일과 AI 소비 우선순위만 기록했어요.") {
    return "구매일은 기록했어요. 소비기한은 포장지에서 확인해 주세요. 먼저 살펴볼 순서는 참고용이에요.";
  }
  return value;
}
