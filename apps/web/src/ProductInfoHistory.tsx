import { Pencil1Icon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { mealApi, type ApiFoodProductInfoAuditEvent } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";

function actorLabel(role: ApiFoodProductInfoAuditEvent["actor_role"]) {
  return role === "guest" ? "게스트 기록" : "내 계정 기록";
}

function reasonLabel(reason: string) {
  return reason
    .replace(/workspace/gi, "기록 공간")
    .replace(/recipe_admin/gi, "레시피 운영자")
    .replace(/Open Food Facts/gi, "공개 상품 DB")
    .replace(/Grocy/gi, "외부 재고 서비스");
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

  const groups = groupHistoryByDay(sortHistoryNewest(history).slice(0, 4));
  return <div className="detail-history product-info-history" role="group" aria-label="상품 정보 수정 기록"><div className="detail-section-heading"><span><Pencil1Icon width={16} height={16} /> 상품 정보 수정</span><small>{history.length ? `최신순 · ${history.length}건` : "0건"}</small></div><div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 상품 정보 수정`} style={{ display: "grid", gap: 6 }}><div className="detail-section-heading" style={{ padding: "0 2px 3px", borderBottom: "1px solid color-mix(in srgb, var(--atelier-ink) 12%, transparent)" }}><span>{group.label}</span><small>{group.items.length}건</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; return <div className={`history-row history-row-product-info${latest ? " history-row-latest" : ""}`} role="listitem" key={event.id} style={latest ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--atelier-pistachio) 30%, transparent)" } : undefined}><span className="history-icon" style={{ background: "color-mix(in srgb, var(--atelier-pistachio) 14%, transparent)", color: "var(--atelier-pistachio)" }}><Pencil1Icon width={13} height={13} /></span><span><strong>상품 정보 수정</strong><small>{eventDetail(event)}</small><small>{reasonLabel(event.reason)} · {actorLabel(event.actor_role)}</small><time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span></div>; })}</div>)}</div></div>;
}
