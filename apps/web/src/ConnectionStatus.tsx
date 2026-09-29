import { ChevronRightIcon, PersonIcon } from "@radix-ui/react-icons";

type ConnectionState = "fixture" | "checking" | "connected" | "offline" | "auth_required";
type CachedAtFreshness = "recent" | "stale" | "old" | "unknown";

const labels: Record<ConnectionState, string> = {
  fixture: "게스트",
  checking: "연결 중",
  connected: "연결됨",
  offline: "오프라인",
  auth_required: "다시 로그인해 주세요",
};

export default function ConnectionStatus({ state, hasCachedData = false, cachedAtLabel, cachedAtFreshness, onOpenAccount }: { state: ConnectionState; hasCachedData?: boolean; cachedAtLabel?: string; cachedAtFreshness?: CachedAtFreshness; onOpenAccount: () => void }) {
  const label = state === "offline" && hasCachedData
    ? `오프라인 · ${cachedAtLabel ?? "최근 화면"}`
    : labels[state];
  const freshnessClass = state === "offline" && hasCachedData ? ` connection-offline-${cachedAtFreshness ?? "unknown"}` : "";
  const actionLabel = state === "auth_required" ? "로그인 화면 열기" : "계정 열기";
  const accessibleLabel = state === "offline"
    ? hasCachedData
      ? `인터넷에 연결되지 않았어요. 마지막으로 불러온 식품 목록을 보여드려요. ${actionLabel}`
      : `인터넷에 연결되지 않아 식품 목록을 불러올 수 없어요. ${actionLabel}`
    : state === "checking"
      ? `식품 목록에 연결하고 있어요. ${actionLabel}`
      : `${label}. ${actionLabel}`;
  return <button className={`connection-pill connection-${state}${freshnessClass}`} type="button" onClick={onOpenAccount} aria-label={accessibleLabel} title={accessibleLabel}><span className="connection-dot" /><span className="connection-label">{label}</span><PersonIcon className="connection-compact-icon" aria-hidden="true" width={15} height={15} /><ChevronRightIcon aria-hidden="true" width={11} height={11} style={{ flex: "0 0 auto", opacity: 0.72 }} /></button>;
}
