import { MetadataText } from "./Metadata";
import { ChevronRightIcon, PersonIcon } from "@radix-ui/react-icons";

type ConnectionState = "fixture" | "checking" | "connected" | "offline" | "auth_required";
type CachedAtFreshness = "recent" | "stale" | "old" | "unknown";

const labels: Record<ConnectionState, string> = {
  fixture: "체험 중",
  checking: "연결 중",
  connected: "계정",
  offline: "연결 안 됨",
  auth_required: "다시 로그인해 주세요",
};

export default function ConnectionStatus({ state, hasCachedData = false, cachedAtLabel, cachedAtFreshness, onOpenAccount }: { state: ConnectionState; hasCachedData?: boolean; cachedAtLabel?: string; cachedAtFreshness?: CachedAtFreshness; onOpenAccount: () => void }) {
  const label = state === "offline" && hasCachedData
    ? `최근 기록 · ${cachedAtLabel ?? "최근 화면"}`
    : labels[state];
  const freshnessClass = state === "offline" && hasCachedData ? ` connection-offline-${cachedAtFreshness ?? "unknown"}` : "";
  const actionLabel = state === "fixture" ? "체험 안내 열기" : state === "auth_required" ? "로그인 화면 열기" : "계정 열기";
  const accessibleLabel = state === "connected" ? actionLabel : state === "fixture"
    ? `예시 식품으로 체험 중. 변경 내용은 새로고침하면 사라져요. ${actionLabel}`
    : state === "offline"
    ? hasCachedData
      ? `기록을 새로 불러오지 못했어요. 마지막으로 불러온 식품 목록을 보여드려요. ${actionLabel}`
      : `식품 목록을 불러오지 못했어요. ${actionLabel}`
    : state === "checking"
      ? `식품 목록에 연결하고 있어요. ${actionLabel}`
      : `${label}. ${actionLabel}`;
  return <button className={`connection-pill connection-${state}${freshnessClass}`} type="button" onClick={onOpenAccount} aria-label={accessibleLabel} title={accessibleLabel}>{state === "connected" ? <PersonIcon className="connection-compact-icon connection-account-icon" aria-hidden="true" width={15} height={15} /> : <span className="connection-dot" />}<span className="connection-label"><MetadataText text={label} /></span>{state !== "connected" ? <PersonIcon className="connection-compact-icon" aria-hidden="true" width={15} height={15} /> : null}<ChevronRightIcon aria-hidden="true" width={11} height={11} style={{ flex: "0 0 auto", opacity: 0.72 }} /></button>;
}
