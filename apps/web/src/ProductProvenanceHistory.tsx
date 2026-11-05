import HistoryWindowToggle from "./HistoryWindowToggle";
import { useHistoryWindow } from "./historyWindow";
import HistoryReadError from "./HistoryReadError";
import "./detailHistory.css";
import { historyActorLabel as actorLabel } from "./historyActorLabel";
import { MetadataText } from "./Metadata";
import { CheckCircledIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { mealApi, type ApiProductProvenance, type ApiProductProvenanceAuditEvent } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";

function sourceLabel(source: ApiProductProvenance["source"]) {
  if (source === "open_food_facts") return "공개 상품 정보";
  if (source === "mfds_c005" || source === "mfds_i1250") return "식품안전나라";
  if (source === "user_confirmed_alias") return "내가 확인한 영수증 상품명";
  if (source === "local_rule") return "영수증에서 찾은 상품명";
  if (source === "parser") return "영수증에서 읽은 상품명";
  return "서비스 제공 상품 정보";
}

function actionLabel(action: ApiProductProvenanceAuditEvent["action"]) {
  if (action === "applied") return "상품 정보 출처 저장";
  if (action === "replaced") return "상품 정보 출처 변경";
  return "상품 정보 출처 삭제";
}


function reasonLabel(reason: string) {
  const normalized = reason
    .replace(/Open Food Facts/gi, "공개 상품 정보")
    .replace(/식품안전나라 C005/gi, "식품안전나라")
    .replace(/식품안전나라 I1250/gi, "식품안전나라")
    .replace(/Grocy/gi, "재고 앱")
    .replace(/workspace/gi, "내 기록")
    .replace(/recipe_admin/gi, "레시피 관리");
  return /\b(?:workspace|canonical|candidate|confidence|provenance|source|snapshot|provider|fixture|parser)\b/i.test(normalized)
    ? "상품 정보를 확인한 기록"
    : normalized;
}

function eventDetail(event: ApiProductProvenanceAuditEvent) {
  if (!event.after) return "참고 상품 정보를 지웠어요. 상품명은 그대로예요.";
  if (event.action !== "replaced" || !event.before) return `${sourceLabel(event.after.source)}에서 가져왔어요.`;
  return `출처를 ${sourceLabel(event.before.source)}에서 ${sourceLabel(event.after.source)}로 바꿨어요.`;
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
    void mealApi.getProductProvenanceEvents(foodId).then((events) => {
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
  return <div ref={historyRootRef} tabIndex={-1} aria-busy={loading} className="detail-history product-provenance-history" role="group" aria-label="상품 정보 변경 기록"><div className="detail-section-heading"><span>상품 정보 변경</span><small>{history.length ? `${historyWindow.events.length}개` : readError ? "확인 필요" : "기록 없음"}</small></div>{readError ? <HistoryReadError message="상품 정보 출처 기록을 불러오지 못했어요." busy={loading} onRetry={retryHistoryRead} /> : null}<div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 상품 정보 변경`}><div className="detail-section-heading"><span>{group.label}</span><small>{group.items.length}개</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; return <div className={`history-row history-row-provenance history-row-${event.action}${latest ? " history-row-latest" : ""}`} role="listitem" key={event.id} ><span className="history-icon" style={eventTone(event.action)}>{eventIcon(event.action)}</span><span><strong>{actionLabel(event.action)}</strong><small><MetadataText text={eventDetail(event)} /></small><small><MetadataText text={<>{reasonLabel(event.reason)} · {actorLabel(event.actor_role)}</>} /></small><time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span></div>; })}</div>)}</div><HistoryWindowToggle remaining={historyWindow.remaining} expanded={historyWindow.expanded} onToggle={historyWindow.toggle} /></div>;
}
