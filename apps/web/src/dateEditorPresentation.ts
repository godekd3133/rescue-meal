import type { DateConfirmationKind } from "./DateAssertionEditor";

export function dateEditorPresentation(kind: DateConfirmationKind | null, value: string, title: string, description: string, initialKind: DateConfirmationKind | null) {
  const reminder = kind === "user_reminder";
  const existingReminder = initialKind === "user_reminder";
  return {
    title: reminder ? "다시 살펴볼 날짜" : initialKind === "user_reminder" ? "포장지에서 확인한 날짜" : title,
    description: reminder ? existingReminder ? "" : "포장지 표시와 구분해 내가 정한 날짜로 기록해요." : existingReminder ? "" : description,
    saveHint: !kind || !value ? ""
      : reminder ? existingReminder ? "" : "내가 정한 날짜로 저장돼요."
        : existingReminder ? "내 알림일을 포장지 날짜로 바꿔 저장해요. 날짜와 표시 이름을 확인해 주세요." : "날짜는 직접 확인한 내용으로 저장돼요.",
    saveLabel: !kind || !value ? "날짜 저장" : reminder ? "알림 날짜 저장" : "확인 후 저장",
  };
}
