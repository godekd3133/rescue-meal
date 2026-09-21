import { CheckCircledIcon, CrossCircledIcon, ReaderIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { mealApi, type ApiProductProvenance, type ApiProductProvenanceAuditEvent } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";

function sourceLabel(source: ApiProductProvenance["source"]) {
  if (source === "open_food_facts") return "공개 상품 DB";
  if (source === "mfds_c005" || source === "mfds_i1250") return "식품안전나라 상품 기준";
  if (source === "user_confirmed_alias") return "사용자 확인 영수증 별칭";
  if (source === "local_rule") return "검토된 영수증 상품명 규칙";
  if (source === "parser") return "영수증 분석 후보";
  return "서비스 상품 기준";
}

function actionLabel(action: ApiProductProvenanceAuditEvent["action"]) {
  if (action === "applied") return "상품 출처 적용";
  if (action === "replaced") return "상품 출처 교체";
  return "상품 출처 제거";
}

function actorLabel(role: ApiProductProvenanceAuditEvent["actor_role"]) {
  return role === "guest" ? "게스트 기록" : "내 계정 기록";
}

function reasonLabel(reason: string) {
  return reason
    .replace(/Open Food Facts/gi, "공개 상품 DB")
    .replace(/식품안전나라 C005/gi, "식품안전나라 상품 기준")
    .replace(/식품안전나라 I1250/gi, "식품안전나라 상품 기준")
    .replace(/Grocy/gi, "외부 재고 서비스")
    .replace(/workspace/gi, "기록 공간")
    .replace(/recipe_admin/gi, "레시피 운영자");
}

function eventDetail(event: ApiProductProvenanceAuditEvent) {
  if (!event.after) return "상품 후보 없이 직접 입력 상태로 남겼어요";
  const source = `${sourceLabel(event.after.source)} · 신뢰도 ${Math.round(event.after.confidence * 100)}%`;
  if (event.action !== "replaced" || !event.before) return source;
  return `${sourceLabel(event.before.source)} → ${source}`;
}

function eventIcon(action: ApiProductProvenanceAuditEvent["action"]) {
  return action === "removed" ? <CrossCircledIcon width={13} height={13} /> : <CheckCircledIcon width={13} height={13} />;
}

function eventTone(action: ApiProductProvenanceAuditEvent["action"]) {
  return action === "removed"
    ? { background: "color-mix(in srgb, var(--atelier-coral) 14%, transparent)", color: "var(--atelier-coral)" }
    : action === "replaced"
      ? { background: "color-mix(in srgb, var(--atelier-amber) 14%, transparent)", color: "var(--atelier-amber)" }
      : { background: "color-mix(in srgb, var(--atelier-blue) 16%, transparent)", color: "var(--atelier-blue)" };
}

export default function ProductProvenanceHistory({ foodId, refreshKey }: { foodId: string; refreshKey: string }) {
  const [history, setHistory] = useState<ApiProductProvenanceAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void mealApi.getProductProvenanceEvents(foodId).then((events) => {
      if (active) {
        setHistory(events ?? []);
        setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setHistory([]);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [foodId, refreshKey]);

  if (loading || !history.length) return null;

  const groups = groupHistoryByDay(sortHistoryNewest(history).slice(0, 4));
  return <div className="detail-history product-provenance-history" role="group" aria-label="상품 정보 변경 기록"><div className="detail-section-heading"><span><ReaderIcon width={16} height={16} /> 상품 정보 변경</span><small>{history.length ? `최신순 · ${history.length}건` : "0건"}</small></div><div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 상품 정보 변경`} style={{ display: "grid", gap: 6 }}><div className="detail-section-heading" style={{ padding: "0 2px 3px", borderBottom: "1px solid color-mix(in srgb, var(--atelier-ink) 12%, transparent)" }}><span>{group.label}</span><small>{group.items.length}건</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; return <div className={`history-row history-row-provenance history-row-${event.action}${latest ? " history-row-latest" : ""}`} role="listitem" key={event.id} style={latest ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--atelier-pistachio) 30%, transparent)" } : undefined}><span className="history-icon" style={eventTone(event.action)}>{eventIcon(event.action)}</span><span><strong>{actionLabel(event.action)}</strong><small>{eventDetail(event)}</small><small>{reasonLabel(event.reason)} · {actorLabel(event.actor_role)}</small><time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span></div>; })}</div>)}</div></div>;
}
