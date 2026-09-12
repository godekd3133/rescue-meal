import { ReaderIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { mealApi, type ApiProductProvenance, type ApiProductProvenanceAuditEvent } from "./mealApi";

function sourceLabel(source: ApiProductProvenance["source"]) {
  if (source === "open_food_facts") return "Open Food Facts";
  if (source === "mfds_c005") return "식품안전나라 C005";
  if (source === "mfds_i1250") return "식품안전나라 I1250";
  if (source === "user_confirmed_alias") return "사용자 확인 영수증 별칭";
  if (source === "local_rule") return "검토된 영수증 상품명 규칙";
  if (source === "parser") return "영수증 parser 후보";
  return "검증 상품 fixture";
}

function actionLabel(action: ApiProductProvenanceAuditEvent["action"]) {
  if (action === "applied") return "상품 출처 적용";
  if (action === "replaced") return "상품 출처 교체";
  return "상품 출처 제거";
}

function actorLabel(role: ApiProductProvenanceAuditEvent["actor_role"]) {
  return role === "guest" ? "게스트 기록" : "내 계정 기록";
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 확인 필요";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function eventDetail(event: ApiProductProvenanceAuditEvent) {
  if (!event.after) return "상품 후보 없이 직접 입력 상태로 남겼어요";
  const source = `${sourceLabel(event.after.source)} · 신뢰도 ${Math.round(event.after.confidence * 100)}%`;
  if (event.action !== "replaced" || !event.before) return source;
  return `${sourceLabel(event.before.source)} → ${source}`;
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

  return <div className="detail-history product-provenance-history" role="group" aria-label="상품 정보 변경 기록"><div className="detail-section-heading"><span><ReaderIcon width={16} height={16} /> 상품 정보 변경</span><small>{history.length}건</small></div><div className="history-list" role="list">{history.slice(0, 4).map((event) => <div className="history-row" role="listitem" key={event.id}><span className="history-icon"><ReaderIcon width={13} height={13} /></span><span><strong>{actionLabel(event.action)}</strong><small>{eventDetail(event)}</small><small>{event.reason} · {actorLabel(event.actor_role)} · {formatEventTime(event.occurred_at)}</small></span></div>)}</div></div>;
}
