export type AccountAuthMode = "login" | "register";
export type AccountAuthErrorField = "email" | "password" | "credentials" | null;

export function accountAuthErrorAffectedByEdit(errorField: AccountAuthErrorField, editedField: "email" | "password") {
  return errorField === "credentials" || errorField === editedField;
}

export function accountAuthErrorPresentation(mode: AccountAuthMode, status: number | null): { message: string; field: AccountAuthErrorField } {
  if (mode === "login" && status === 401) return { message: "이메일 또는 비밀번호를 확인해 주세요.", field: "credentials" };
  if (mode === "register" && status === 409) return { message: "이미 가입된 이메일이에요.", field: "email" };
  if (status === 429) return { message: "시도 횟수가 많아요. 잠시 후 다시 시도해 주세요.", field: null };
  if (status === 400 || status === 422) return { message: "입력한 내용을 확인해 주세요.", field: null };
  return { message: mode === "login" ? "로그인하지 못했어요. 잠시 후 다시 시도해 주세요." : "계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", field: null };
}
