import { ChevronRightIcon } from "@radix-ui/react-icons";

type ConnectionState = "fixture" | "checking" | "connected" | "offline" | "auth_required";
type CachedAtFreshness = "recent" | "stale" | "old" | "unknown";

const labels: Record<ConnectionState, string> = {
  fixture: "게스트 기록",
  checking: "서버 확인 중",
  connected: "서버 연결됨",
  offline: "오프라인 · 임시 화면",
  auth_required: "로그인 다시 필요",
};

export default function ConnectionStatus({ state, hasCachedData = false, cachedAtLabel, cachedAtFreshness, onOpenAccount }: { state: ConnectionState; hasCachedData?: boolean; cachedAtLabel?: string; cachedAtFreshness?: CachedAtFreshness; onOpenAccount: () => void }) {
  const label = state === "offline" && hasCachedData
    ? `오프라인 · ${cachedAtLabel ?? "최근 화면"}`
    : labels[state];
  const freshnessClass = state === "offline" && hasCachedData ? ` connection-offline-${cachedAtFreshness ?? "unknown"}` : "";
  const actionLabel = state === "auth_required" ? "로그인 화면 열기" : "계정 열기";
  const accessibleLabel = state === "offline"
    ? hasCachedData
      ? `연결 상태: ${label} · 읽기 전용 · ${actionLabel}`
      : `연결 상태: ${label} · 최신 기록을 사용할 수 없음 · ${actionLabel}`
    : `연결 상태: ${label} · ${actionLabel}`;
  return <button className={`connection-pill connection-${state}${freshnessClass}`} type="button" onClick={onOpenAccount} aria-label={accessibleLabel} title={accessibleLabel}><span className="connection-dot" />{label}<ChevronRightIcon aria-hidden="true" width={11} height={11} style={{ flex: "0 0 auto", opacity: 0.72 }} /></button>;
}
