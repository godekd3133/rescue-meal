import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CheckCircledIcon, CrossCircledIcon, ReaderIcon, SewingPinIcon, TrashIcon } from "@radix-ui/react-icons";
import { mealApi, type ApiGrocyOutboxStatus, type ApiGrocyOutboxStatusHistory, type ApiGrocySyncStatus, type ApiStorageEvent, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";

function storageLabel(storage: ApiStorageType | null, locationId: string | null | undefined, locations: ApiStorageLocation[]) {
  const locationName = locationId ? locations.find((location) => location.id === locationId)?.name : undefined;
  if (locationName) return locationName;
  if (!storage) return "보관 위치 확인 필요";
  return storage === "frozen" ? "냉동" : storage === "ambient" ? "실온" : "냉장";
}

function eventLabel(event: ApiStorageEvent) {
  if (event.event_type === "moved") return "보관 위치 변경";
  if (event.event_type === "opened") return "개봉 기록";
  if (event.event_type === "consumed") return "먹은 기록";
  if (event.event_type === "discarded") return "폐기 기록";
  if (event.event_type === "frozen") return "냉동 기록";
  return "해동 기록";
}

function eventDetail(event: ApiStorageEvent, unit: string, locations: ApiStorageLocation[]) {
  if (event.event_type === "moved") {
    return `${storageLabel(event.from_storage_type, event.from_storage_location_id, locations)} → ${storageLabel(event.to_storage_type, event.to_storage_location_id, locations)}`;
  }
  if (event.event_type === "opened") return "개봉 상태로 기록했어요";
  if (event.event_type === "consumed") return `${event.quantity ?? 0}${unit} 먹었어요`;
  if (event.event_type === "discarded") return `${event.quantity ?? 0}${unit} 폐기했어요`;
  return "보관 상태를 기록했어요";
}

function syncStatusLabel(status?: ApiGrocySyncStatus) {
  if (!status) return null;
  if (status === "not_configured") return "로컬 기록";
  if (status === "queued" || status === "in_flight") return "외부 반영 대기";
  if (status === "succeeded") return "외부 반영 완료";
  if (status === "dead_letter") return "외부 반영 실패";
  if (status === "needs_reconciliation") return "반영 여부 확인";
  return "외부 연결 확인";
}

function syncStatusTone(status?: ApiGrocySyncStatus) {
  if (status === "succeeded") return { background: "color-mix(in srgb, var(--atelier-pistachio) 12%, transparent)", color: "var(--atelier-pistachio)" };
  if (status === "queued" || status === "in_flight") return { background: "color-mix(in srgb, var(--atelier-blue) 12%, transparent)", color: "var(--atelier-blue)" };
  if (status === "dead_letter" || status === "needs_reconciliation" || status === "needs_mapping") return { background: "color-mix(in srgb, var(--atelier-coral) 12%, transparent)", color: "var(--atelier-coral)" };
  return { background: "color-mix(in srgb, var(--atelier-ink) 8%, transparent)", color: "var(--atelier-muted)" };
}

function outboxHistoryStatusLabel(status: ApiGrocyOutboxStatus) {
  if (status === "blocked") return "외부 연결 확인";
  if (status === "pending" || status === "in_flight") return "외부 반영 대기";
  if (status === "succeeded") return "외부 반영 완료";
  if (status === "dead_letter") return "외부 반영 실패";
  return "반영 여부 확인";
}

function statusHistorySourceLabel(source: ApiGrocyOutboxStatusHistory["source"]) {
  if (source === "created") return "작업 생성";
  if (source === "mapping") return "연결 상태 갱신";
  if (source === "worker") return "자동 동기화";
  if (source === "retry") return "수동 재시도";
  if (source === "reconciliation") return "운영자 확인";
  return "상태 확인";
}

function eventIcon(eventType: ApiStorageEvent["event_type"]) {
  if (eventType === "moved") return <SewingPinIcon width={13} height={13} />;
  if (eventType === "consumed") return <CheckCircledIcon width={13} height={13} />;
  if (eventType === "discarded") return <TrashIcon width={13} height={13} />;
  if (eventType === "opened") return <ArchiveIcon width={13} height={13} />;
  if (eventType === "frozen" || eventType === "thawed") return <ArchiveIcon width={13} height={13} />;
  return <CrossCircledIcon width={13} height={13} />;
}

function eventTone(eventType: ApiStorageEvent["event_type"]) {
  if (eventType === "discarded") return { background: "color-mix(in srgb, var(--atelier-coral) 14%, transparent)", color: "var(--atelier-coral)" };
  if (eventType === "consumed") return { background: "color-mix(in srgb, var(--atelier-blue) 16%, transparent)", color: "var(--atelier-blue)" };
  if (eventType === "moved" || eventType === "opened") return { background: "color-mix(in srgb, var(--atelier-pistachio) 14%, transparent)", color: "var(--atelier-pistachio)" };
  return { background: "color-mix(in srgb, var(--atelier-amber) 14%, transparent)", color: "var(--atelier-amber)" };
}

export default function FoodHistory({ foodId, unit, storageLocations = [], historyRefreshKey = 0, highlightSyncOutboxId, onOpenSyncRecord, onOpenSyncNotification }: { foodId: string; unit: string; storageLocations?: ApiStorageLocation[]; historyRefreshKey?: number; highlightSyncOutboxId?: string | null; onOpenSyncRecord?: (outboxId: string, foodId: string) => void; onOpenSyncNotification?: (outboxId: string) => void }) {
  const [history, setHistory] = useState<ApiStorageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSyncEvidenceId, setOpenSyncEvidenceId] = useState<string | null>(null);
  const [syncStatusNotice, setSyncStatusNotice] = useState("");
  const historyRootRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRestoreFrameRef = useRef<number | null>(null);
  const syncStatusSnapshotRef = useRef(new Map<string, ApiGrocySyncStatus>());
  const focusedEvidenceKeyRef = useRef<string | null>(null);
  const focusedEvidenceStatusRef = useRef<{ eventId: string; status: ApiGrocyOutboxStatus } | null>(null);
  const manualEvidenceChoiceRef = useRef<{ id: string; open: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const scrollContainer = historyRootRef.current?.closest<HTMLElement>(".sheet-content");
    const previousScrollTop = scrollContainer?.scrollTop ?? null;
    const shouldRestoreScroll = historyRefreshKey > 0 && previousScrollTop !== null && !highlightSyncOutboxId;
    setLoading(true);
    void mealApi.getStorageEvents(foodId).then((events) => {
      if (active) {
        setHistory(events ?? []);
        setLoading(false);
        if (shouldRestoreScroll && scrollContainer) {
          historyScrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
            if (active) scrollContainer.scrollTo({ top: previousScrollTop, behavior: "auto" });
            historyScrollRestoreFrameRef.current = null;
          });
        }
      }
    }).catch(() => {
      if (active) {
        setHistory([]);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      if (historyScrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(historyScrollRestoreFrameRef.current);
        historyScrollRestoreFrameRef.current = null;
      }
    };
  }, [foodId, highlightSyncOutboxId, historyRefreshKey]);

  useEffect(() => {
    if (!highlightSyncOutboxId || loading) return;
    const manualChoice = manualEvidenceChoiceRef.current;
    if (manualChoice?.id === highlightSyncOutboxId && !manualChoice.open) return;
    const frame = window.requestAnimationFrame(() => {
      historyRootRef.current?.querySelector<HTMLElement>('[data-history-sync-highlighted="true"]')?.scrollIntoView({ behavior: "auto", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightSyncOutboxId, history, loading]);

  useEffect(() => {
    if (loading) return;
    let changedStatus: ApiGrocySyncStatus | null = null;
    const nextSnapshot = new Map<string, ApiGrocySyncStatus>();
    history.forEach((event) => {
      if (!event.grocy_sync_status) return;
      const previous = syncStatusSnapshotRef.current.get(event.id);
      if (previous && previous !== event.grocy_sync_status) changedStatus = event.grocy_sync_status;
      nextSnapshot.set(event.id, event.grocy_sync_status);
    });
    syncStatusSnapshotRef.current = nextSnapshot;
    if (changedStatus) setSyncStatusNotice(`${syncStatusLabel(changedStatus)} 상태로 업데이트됐어요.`);
  }, [history, loading]);

  useEffect(() => {
    if (!highlightSyncOutboxId) {
      setOpenSyncEvidenceId(null);
      return;
    }
    const linkedEvent = history.find((event) => event.grocy_outbox_id === highlightSyncOutboxId);
    if (linkedEvent) {
      const manualChoice = manualEvidenceChoiceRef.current;
      if (manualChoice?.id === linkedEvent.id) setOpenSyncEvidenceId(manualChoice.open ? linkedEvent.id : null);
      else setOpenSyncEvidenceId(linkedEvent.id);
    }
  }, [highlightSyncOutboxId, history]);

  useEffect(() => {
    const root = historyRootRef.current;
    if (!root) return;
    const entries = Array.from(root.querySelectorAll<HTMLElement>("[data-history-sync-evidence-status]"));
    entries.forEach((entry) => {
      entry.tabIndex = 0;
      entry.setAttribute("aria-label", `${outboxHistoryStatusLabel(entry.dataset.historySyncEvidenceStatus as ApiGrocyOutboxStatus)} 상태 근거`);
    });
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-history-sync-evidence-status]")
        : null;
      const details = target?.closest<HTMLElement>("[data-history-sync-evidence]");
      const status = target?.dataset.historySyncEvidenceStatus as ApiGrocyOutboxStatus | undefined;
      const eventId = details?.dataset.historySyncEvidence;
      if (status && eventId) focusedEvidenceStatusRef.current = { eventId, status };
    };
    root.addEventListener("focusin", handleFocusIn);
    return () => root.removeEventListener("focusin", handleFocusIn);
  }, [history, loading]);

  useEffect(() => {
    const focused = focusedEvidenceStatusRef.current;
    if (!focused || loading) return;
    const frame = window.requestAnimationFrame(() => {
      const details = historyRootRef.current?.querySelector<HTMLElement>(`[data-history-sync-evidence="${focused.eventId}"]`);
      const target = details?.querySelector<HTMLElement>(`[data-history-sync-evidence-status="${focused.status}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "nearest" });
        target.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [history, loading]);

  useEffect(() => {
    const root = historyRootRef.current;
    if (!root) return;
    const handleSummaryClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-history-sync-evidence] > summary")
        : null;
      const details = target?.parentElement;
      const id = details?.dataset.historySyncEvidence;
      if (!id || !(details instanceof HTMLDetailsElement)) return;
      manualEvidenceChoiceRef.current = { id, open: !details.open };
    };
    root.addEventListener("click", handleSummaryClick, true);
    return () => root.removeEventListener("click", handleSummaryClick, true);
  }, []);

  useEffect(() => {
    if (!highlightSyncOutboxId || loading) return;
    const linkedEvent = history.find((event) => event.grocy_outbox_id === highlightSyncOutboxId);
    if (!linkedEvent) return;
    focusedEvidenceKeyRef.current = linkedEvent.id;
    const frame = window.requestAnimationFrame(() => {
      historyRootRef.current?.querySelector<HTMLElement>(`[data-history-sync-evidence="${focusedEvidenceKeyRef.current}"] summary`)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightSyncOutboxId, history, loading]);

  const groups = groupHistoryByDay(sortHistoryNewest(history).slice(0, 4));
  return <div ref={historyRootRef} className="detail-history"><span className="sr-only" role="status" aria-live="polite">{syncStatusNotice}</span><div className="detail-section-heading"><span><ReaderIcon width={16} height={16} /> 최근 기록</span><small>{loading ? "불러오는 중" : history.length ? `최신순 · ${history.length}건` : "0건"}</small></div>{groups.length ? <div className="history-list" role="list">{groups.map((group, groupIndex) => <div key={group.key} role="group" aria-label={`${group.label} 기록`} style={{ display: "grid", gap: 6 }}><div className="detail-section-heading" style={{ padding: "0 2px 3px", borderBottom: "1px solid color-mix(in srgb, var(--atelier-ink) 12%, transparent)" }}><span>{group.label}</span><small>{group.items.length}건</small></div>{group.items.map((event, itemIndex) => { const latest = groupIndex === 0 && itemIndex === 0; const highlighted = Boolean(highlightSyncOutboxId && event.grocy_outbox_id === highlightSyncOutboxId); const statusLabel = syncStatusLabel(event.grocy_sync_status); const syncReferenceLabel = event.grocy_transaction_id ? `외부 작업 #${event.grocy_transaction_id}` : event.grocy_outbox_id ? "동기화 작업 연결됨" : null; const syncHistorySummary = event.grocy_status_history?.length ? `외부 상태 이력 · ${event.grocy_status_history.slice(-4).map((entry) => outboxHistoryStatusLabel(entry.status)).join(" → ")}` : null; return <div className={`history-row history-row-${event.event_type}${latest ? " history-row-latest" : ""}`} data-history-sync-highlighted={highlighted ? "true" : undefined} role="listitem" key={event.id} style={highlighted ? { boxShadow: "inset 0 0 0 2px var(--atelier-pistachio)", background: "color-mix(in srgb, var(--atelier-pistachio) 8%, var(--atelier-surface))" } : latest ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--atelier-pistachio) 30%, transparent)" } : undefined}><span className="history-icon" style={eventTone(event.event_type)}>{eventIcon(event.event_type)}</span><span><strong>{eventLabel(event)}</strong><small>{eventDetail(event, unit, storageLocations)}</small>{statusLabel ? <small data-history-sync-status={event.grocy_sync_status} style={{ ...syncStatusTone(event.grocy_sync_status), display: "inline-flex", width: "fit-content", padding: "2px 5px", borderRadius: 999, fontSize: 8, fontWeight: 800 }}>{statusLabel}</small> : null}{syncHistorySummary ? <small data-history-sync-timeline={event.id} style={{ color: "var(--atelier-muted)", fontSize: 8, fontWeight: 750 }}>{syncHistorySummary}</small> : null}{syncReferenceLabel ? <small data-history-sync-reference={event.grocy_outbox_id ?? undefined} title={event.grocy_outbox_id ?? undefined} style={{ color: "var(--atelier-muted)", fontSize: 8, fontWeight: 750 }}>{syncReferenceLabel}</small> : null}<time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time></span>{event.grocy_status_history?.length ? <details open={openSyncEvidenceId === event.id} onToggle={(toggleEvent) => setOpenSyncEvidenceId(toggleEvent.currentTarget.open ? event.id : null)} className="history-sync-disclosure" data-history-sync-evidence={event.id} style={{ gridColumn: "2 / -1" }}><summary style={{ cursor: "pointer", color: "var(--atelier-muted)", fontSize: 8, fontWeight: 800 }}>외부 상태 근거 보기</summary><div role="list" style={{ display: "grid", gap: 3, paddingTop: 4 }}>{event.grocy_status_history.slice(-6).reverse().map((entry, entryIndex) => <div role="listitem" data-history-sync-evidence-status={entry.status} key={`${event.id}:evidence:${entry.occurred_at}:${entryIndex}`} style={{ display: "grid", gap: 2, padding: "4px 6px", borderRadius: 8, background: "color-mix(in srgb, var(--atelier-ink) 5%, transparent)" }}><strong style={{ color: "var(--atelier-ink)", fontSize: 8 }}>{outboxHistoryStatusLabel(entry.status)}</strong><small style={{ color: "var(--atelier-muted)", fontSize: 8 }}>{statusHistorySourceLabel(entry.source)} · {formatHistoryTime(entry.occurred_at)}</small>{entry.note ? <small style={{ color: "var(--atelier-muted)", fontSize: 8 }}>{entry.note}</small> : null}{entry.status === "succeeded" && event.grocy_transaction_id ? <small style={{ color: "var(--atelier-muted)", fontSize: 8 }}>외부 작업 #{event.grocy_transaction_id}</small> : null}</div>)}</div><div style={{ display: "flex", gap: 6, paddingTop: 5 }}>{event.grocy_outbox_id && onOpenSyncRecord ? <button className="grocy-refresh-button" type="button" onPointerDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => onOpenSyncRecord(event.grocy_outbox_id!, event.food_id)}>작업 상세 보기</button> : null}{event.grocy_outbox_id && onOpenSyncNotification ? <button className="grocy-refresh-button" type="button" onPointerDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => onOpenSyncNotification(event.grocy_outbox_id!)}>알림에서 보기</button> : null}</div></details> : null}</div>; })}</div>)}</div> : <p className="history-empty">아직 이 식품에 기록된 변경이 없어요.</p>}</div>;
}
