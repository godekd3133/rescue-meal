import { Pencil1Icon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { mealApi, type ApiFoodProductInfoAuditEvent } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";

function actorLabel(role: ApiFoodProductInfoAuditEvent["actor_role"]) {
  return role === "guest" ? "게스트 기록" : "계정 기록";
}

function reasonLabel(reason: string) {
  const normalized = reason
    .replace(/workspace/gi, "기록 공간")
    .replace(/recipe_admin/gi, "관리자")
    .replace(/Open Food Facts/gi, "공개 상품 정보")
    .replace(/Grocy/gi, "재고 앱");
  return /\b(?:workspace|canonical|candidate|confidence|provenance|source|snapshot|provider|fixture|parser)\b/i.test(normalized)
    ? "상품 정보를 확인한 기록"
    : normalized;
}

function eventDetail(event: ApiFoodProductInfoAuditEvent) {
  const nameChanged = event.before.canonical_name !== event.after.canonical_name;
  const brandChanged = event.before.brand !== event.after.brand;
  const categoryChanged = event.before.category !== event.after.category;
  const changes = [
    nameChanged ? `상품명을 ${event.after.canonical_name}로 바꿨어요` : null,
    brandChanged ? event.after.brand ? `브랜드를 ${event.after.brand}로 바꿨어요` : "브랜드 정보를 지웠어요" : null,
    categoryChanged ? event.after.category ? `분류를 ${event.after.category}로 바꿨어요` : "분류를 지웠어요" : null,
  ].filter((value): value is string => Boolean(value));
  return changes.join(" · ") || "상품 정보를 살펴보고 저장했어요.";
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
  return <div className="detail-history product-info-history" role="group" aria-label="상품 정보 수정 기록"><div className="detail-section-heading"><span><Pencil1Icon width={16} height={16} /> 상품 정보 수정</span><small>{history.length ? `최근 변경 ${history.length}개` : "기록 없음"}</small></div><div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 상품 정보 수정`} style={{ display: "grid", gap: 6 }}><div className="detail-section-heading" style={{ padding: "0 2px 3px", borderBottom: "1px solid color-mix(in srgb, var(--atelier-ink) 12%, transparent)" }}><span>{group.label}</span><small>{group.items.length}개</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; return <div className={`history-row history-row-product-info${latest ? " history-row-latest" : ""}`} role="listitem" key={event.id} ><span className="history-icon" style={{ background: "color-mix(in srgb, var(--atelier-pistachio) 14%, transparent)", color: "var(--atelier-pistachio)" }}><Pencil1Icon width={13} height={13} /></span><span><strong>상품 정보 수정</strong><small>{eventDetail(event)}</small><small>{reasonLabel(event.reason)} · {actorLabel(event.actor_role)}</small><time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span></div>; })}</div>)}</div></div>;
}
