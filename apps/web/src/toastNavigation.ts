const recoveryActions = new Set(["다시 시도", "목록 새로고침", "재고 앱 설정 보기"]);

export function isRecoveryToastAction(actionLabel?: string) {
  return recoveryActions.has(actionLabel ?? "");
}

export function dismissToastForNavigation(currentSheet: string | null, nextSheet: string | null, actionLabel?: string) {
  return nextSheet !== null && nextSheet !== currentSheet && !isRecoveryToastAction(actionLabel);
}

export function toastFeedbackState(phase: "pending" | "notice", actionLabel?: string) {
  return isRecoveryToastAction(actionLabel) ? "recovery" : phase;
}
