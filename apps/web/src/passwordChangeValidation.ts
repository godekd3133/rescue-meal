export type PasswordChangeField = "current" | "new" | "confirm";
export type PasswordChangeIssue = { field: PasswordChangeField | null; message: string };

export function validatePasswordChange(current: string, next: string, confirm: string): PasswordChangeIssue | null {
  if (current.length < 8) return { field: "current", message: "현재 비밀번호를 확인해 주세요." };
  if (next.length < 8) return { field: "new", message: "새 비밀번호는 8자 이상 입력해 주세요." };
  if (next !== confirm) return { field: "confirm", message: "새 비밀번호와 확인 비밀번호가 같지 않아요." };
  if (current === next) return { field: "new", message: "새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요." };
  return null;
}
