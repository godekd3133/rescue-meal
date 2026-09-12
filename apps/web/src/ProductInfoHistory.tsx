import { Pencil1Icon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { mealApi, type ApiFoodProductInfoAuditEvent } from "./mealApi";

function actorLabel(role: ApiFoodProductInfoAuditEvent["actor_role"]) {
  return role === "guest" ? "게스트 기록" : "내 계정 기록";
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 확인 필요";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function eventDetail(event: ApiFoodProductInfoAuditEvent) {
  const nameChanged = event.before.canonical_name !== event.after.canonical_name;
  const brandChanged = event.before.brand !== event.after.brand;
  const categoryChanged = event.before.category !== event.after.category;
  const changes = [
    nameChanged ? `상품명 ${event.before.canonical_name} → ${event.after.canonical_name}` : null,
    brandChanged ? `브랜드 ${event.before.brand} → ${event.after.brand}` : null,
    categoryChanged ? `분류 ${event.before.category} → ${event.after.category}` : null,
  ].filter((value): value is string => Boolean(value));
  return changes.join(" · ") || "상품 정보를 확인해 저장했어요";
}

export default function ProductInfoHistory({ foodId, refreshKey }: { foodId: string; refreshKey: string }) {
  const [history, setHistory] = useState<ApiFoodProductInfoAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void mealApi.getProductInfoEvents(foodId).then((events) => {
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

  return <div className="detail-history product-info-history" role="group" aria-label="상품 정보 수정 기록"><div className="detail-section-heading"><span><Pencil1Icon width={16} height={16} /> 상품 정보 수정</span><small>{history.length}건</small></div><div className="history-list" role="list">{history.slice(0, 4).map((event) => <div className="history-row" role="listitem" key={event.id}><span className="history-icon"><Pencil1Icon width={13} height={13} /></span><span><strong>상품 정보 수정</strong><small>{eventDetail(event)}</small><small>{event.reason} · {actorLabel(event.actor_role)} · {formatEventTime(event.occurred_at)}</small></span></div>)}</div></div>;
}
