export function historyActorLabel(role: "guest" | "user" | "recipe_admin") {
  if (role === "recipe_admin") return "관리자 기록";
  return role === "guest" ? "게스트 기록" : "계정 기록";
}
