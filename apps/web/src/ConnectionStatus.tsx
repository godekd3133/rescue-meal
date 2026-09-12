type ConnectionState = "fixture" | "checking" | "connected" | "offline" | "auth_required";

const labels: Record<ConnectionState, string> = {
  fixture: "데모 모드",
  checking: "서버 확인 중",
  connected: "서버 연결됨",
  offline: "오프라인 · 임시 화면",
  auth_required: "로그인 다시 필요",
};

export default function ConnectionStatus({ state, hasCachedData = false, onOpenAccount }: { state: ConnectionState; hasCachedData?: boolean; onOpenAccount: () => void }) {
  const label = state === "offline" && hasCachedData ? "오프라인 · 최근 화면" : labels[state];
  return <button className={`connection-pill connection-${state}`} type="button" onClick={onOpenAccount} aria-label={`연결 상태: ${label} · 계정 열기`}><span className="connection-dot" />{label}</button>;
}
