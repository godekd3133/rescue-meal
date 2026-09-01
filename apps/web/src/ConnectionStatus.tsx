type ConnectionState = "fixture" | "checking" | "connected" | "offline";

const labels: Record<ConnectionState, string> = {
  fixture: "데모 모드",
  checking: "서버 확인 중",
  connected: "서버 연결됨",
  offline: "오프라인 · 임시 화면",
};

export default function ConnectionStatus({ state, onOpenAccount }: { state: ConnectionState; onOpenAccount: () => void }) {
  return <button className={`connection-pill connection-${state}`} type="button" onClick={onOpenAccount} aria-label={`연결 상태: ${labels[state]} · 계정 열기`}><span className="connection-dot" />{labels[state]}</button>;
}
