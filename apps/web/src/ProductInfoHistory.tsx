import HistoryWindowToggle from "./HistoryWindowToggle";
import { useHistoryWindow } from "./historyWindow";
import HistoryReadError from "./HistoryReadError";
import "./detailHistory.css";
import { productInfoHistoryChanges as eventDetail } from "./productInfoHistoryPresentation";
import { historyActorLabel as actorLabel } from "./historyActorLabel";
import { Metadata, MetadataText } from "./Metadata";
import { Pencil1Icon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { mealApi, type ApiFoodProductInfoAuditEvent } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";


function reasonLabel(reason: string) {
  if (["사용자가 상품명·브랜드·카테고리를 수정했습니다.", "사용자가 한 단위의 중량·용량을 입력했습니다.", "사용자가 한 단위의 내용량을 입력했습니다.", "사용자가 입력한 내용량을 지웠습니다."].includes(reason)) return "";
  const normalized = reason
    .replace(/workspace/gi, "기록 공간")
    .replace(/recipe_admin/gi, "관리자")
    .replace(/Open Food Facts/gi, "공개 상품 정보")
    .replace(/Grocy/gi, "재고 앱");
  return /\b(?:workspace|canonical|candidate|confidence|provenance|source|snapshot|provider|fixture|parser)\b/i.test(normalized)
    ? "상품 정보를 확인한 기록"
    : normalized;
}


export default function ProductInfoHistory({ foodId, refreshKey }: { foodId: string; refreshKey: string }) {
  const [history, setHistory] = useState<ApiFoodProductInfoAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const historyOwnerRef = useRef(foodId);
  const retryFocusRef = useRef(false);
  const retryReturnRef = useRef<HTMLElement | null>(null);
  const historyRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    if (historyOwnerRef.current !== foodId) { setHistory([]); setReadError(false); historyOwnerRef.current = foodId; retryFocusRef.current = false; }
    setLoading(true);
    void mealApi.getProductInfoEvents(foodId).then((events) => {
      if (!events) throw new Error("history-read-missing");
      if (active) {
        setHistory(events);
        setReadError(false);
        setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setReadError(true);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [foodId, refreshKey, retryNonce]);

  useEffect(() => {
    if (loading || !retryFocusRef.current) return;
    retryFocusRef.current = false;
    const target = historyRootRef.current ?? retryReturnRef.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [loading, readError]);

  const retryHistoryRead = () => {
    retryFocusRef.current = true;
    retryReturnRef.current = historyRootRef.current?.closest("details")?.querySelector<HTMLElement>("summary") ?? null;
    setRetryNonce((value) => value + 1);
  };


  const historyWindow = useHistoryWindow(sortHistoryNewest(history), foodId);
  const groups = groupHistoryByDay(historyWindow.events);
  if (!history.length && !readError) return null;
  return <div ref={historyRootRef} tabIndex={-1} aria-busy={loading} className="detail-history product-info-history" role="group" aria-label="상품 정보 수정 기록"><div className="detail-section-heading"><span><Pencil1Icon width={16} height={16} /> 상품 정보 수정</span><small>{history.length ? `${historyWindow.events.length}개` : readError ? "확인 필요" : "기록 없음"}</small></div>{readError ? <HistoryReadError message="상품 정보 수정 기록을 불러오지 못했어요." busy={loading} onRetry={retryHistoryRead} /> : null}<div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 상품 정보 수정`} style={{ display: "grid", gap: 6 }}><div className="detail-section-heading" style={{ padding: "0 2px 3px", borderBottom: "1px solid color-mix(in srgb, var(--atelier-ink) 12%, transparent)" }}><span>{group.label}</span><small>{group.items.length}개</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; return <div className={`history-row history-row-product-info${latest ? " history-row-latest" : ""}`} role="listitem" key={event.id} ><span className="history-icon" style={{ background: "color-mix(in srgb, var(--atelier-pistachio) 14%, transparent)", color: "var(--atelier-pistachio)" }}><Pencil1Icon width={13} height={13} /></span><span><small><Metadata parts={eventDetail(event)} /></small><small><MetadataText text={<>{reasonLabel(event.reason)} · {actorLabel(event.actor_role)}</>} /></small><time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span></div>; })}</div>)}</div><HistoryWindowToggle remaining={historyWindow.remaining} expanded={historyWindow.expanded} onToggle={historyWindow.toggle} /></div>;
}
