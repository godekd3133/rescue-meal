import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CheckCircledIcon, CrossCircledIcon, ReaderIcon, SewingPinIcon, TrashIcon } from "@radix-ui/react-icons";
import { mealApi, type ApiGrocyOutboxStatus, type ApiGrocyOutboxStatusHistory, type ApiGrocySyncStatus, type ApiStorageEvent, type ApiStorageLocation, type ApiStorageType } from "./mealApi";
import { formatHistoryTime, groupHistoryByDay, sortHistoryNewest } from "./historyDates";
import { scrollTargetWithinNearestContainer } from "./appScroll";

function storageLabel(storage: ApiStorageType | null, locationId: string | null | undefined, locations: ApiStorageLocation[]) {
  const locationName = locationId ? locations.find((location) => location.id === locationId)?.name : undefined;
  if (locationName) return locationName;
  if (!storage) return "보관 위치를 확인해 주세요";
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
  if (status === "not_configured") return "재고 앱 연결 전";
  if (status === "queued") return "재고 앱에 추가할 예정";
  if (status === "in_flight") return "재고 앱에 추가하는 중";
  if (status === "succeeded") return "재고 앱에 추가했어요";
  if (status === "dead_letter") return "재고 앱에 추가하지 못했어요";
  if (status === "needs_reconciliation") return "재고 앱에서 추가됐는지 확인해 주세요";
  return "재고 앱 연결을 살펴봐 주세요";
}

function outboxHistoryStatusLabel(status: ApiGrocyOutboxStatus) {
  if (status === "blocked") return "재고 앱 연결을 살펴봐 주세요";
  if (status === "pending") return "재고 앱에 추가할 예정이에요";
  if (status === "in_flight") return "재고 앱에 추가하고 있어요";
  if (status === "succeeded") return "재고 앱에 추가했어요";
  if (status === "dead_letter") return "재고 앱에 추가하지 못했어요";
  return "재고 앱에서 추가됐는지 살펴봐 주세요";
}

function statusHistorySourceLabel(source: ApiGrocyOutboxStatusHistory["source"]) {
  if (source === "created") return "추가를 요청했어요";
  if (source === "mapping") return "상품 연결을 바꿨어요";
  if (source === "worker") return "자동으로 추가했어요";
  if (source === "retry") return "다시 보냈어요";
  if (source === "reconciliation") return "재고 앱에서 확인했어요";
  return "처리 내용을 확인했어요";
}

function outboxHistoryNote(note: string) {
  if (/Grocy product mapping|PRODUCT_MAPPING_REQUIRED/i.test(note)) return "재고 앱에 등록된 상품과 단위를 연결해 주세요.";
  if (/Grocy 외부 반영 여부|RECONCILIATION_REQUIRED/i.test(note)) return "재고 앱에서 식품이 추가됐는지 확인해 주세요.";
  if (/외부 작업 #(\d+)/i.test(note)) return note.replace(/외부 작업 #(\d+)/i, "재고 앱 기록 번호 $1");
  if (/운영자가 외부 반영을 확인/.test(note)) return "재고 앱에서 추가된 것을 확인했어요.";
  if (/운영자가 미반영/.test(note)) return "재고 앱에서 찾지 못해 다시 추가할게요.";
  if (/수동 재시도|외부 반영을 다시 시도/.test(note)) return "재고 앱에 다시 추가할게요.";
  if (/재시도 한도/.test(note)) return "여러 번 시도했지만 재고 앱에 추가하지 못했어요.";
  return /\b(?:Grocy|outbox|workspace|payload|status|reconciliation|provider|source|retry|worker)\b/i.test(note)
    ? "재고 앱에서 처리한 기록이에요."
    : note;
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
  if (eventType === "discarded") return { color: "var(--atelier-coral)" };
  if (eventType === "consumed") return { color: "var(--atelier-blue)" };
  if (eventType === "moved" || eventType === "opened") return { color: "var(--atelier-muted)" };
  return { color: "var(--atelier-amber)" };
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
      scrollTargetWithinNearestContainer(historyRootRef.current?.querySelector<HTMLElement>('[data-history-sync-highlighted="true"]') ?? null, "nearest", "auto");
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
    if (changedStatus) setSyncStatusNotice(`${syncStatusLabel(changedStatus)}.`);
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
      entry.setAttribute("aria-label", `${outboxHistoryStatusLabel(entry.dataset.historySyncEvidenceStatus as ApiGrocyOutboxStatus)} 재고 앱 기록`);
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
        scrollTargetWithinNearestContainer(target, "nearest", "auto");
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
  return (
    <div ref={historyRootRef} className="detail-history">
      <span className="sr-only" role="status" aria-live="polite">{syncStatusNotice}</span>
      <div className="detail-section-heading">
        <span><ReaderIcon width={16} height={16} /> 최근 기록</span>
        <small>{loading ? "불러오는 중" : history.length ? "최근 기록 " + history.length + "개" : "기록 없음"}</small>
      </div>
      {groups.length ? (
        <div className="history-list" role="list">
          {groups.map((group) => (
            <div key={group.key} role="group" aria-label={group.label + " 기록"} className="history-day-group">
              <div className="detail-section-heading">
                <span>{group.label}</span><small>{group.items.length}개</small>
              </div>
              {group.items.map((event) => {
                const highlighted = Boolean(highlightSyncOutboxId && event.grocy_outbox_id === highlightSyncOutboxId);
                const statusLabel = syncStatusLabel(event.grocy_sync_status);
                const transactionLabel = event.grocy_transaction_id ? "재고 앱 기록 번호 " + event.grocy_transaction_id : null;
                return (
                  <div className={"history-row history-row-" + event.event_type + (highlighted ? " history-row-highlighted" : "")} data-history-sync-highlighted={highlighted ? "true" : undefined} role="listitem" key={event.id}>
                    <span className="history-icon" style={eventTone(event.event_type)}>{eventIcon(event.event_type)}</span>
                    <span className="history-row-copy">
                      <strong>{eventLabel(event)}</strong>
                      <small>{eventDetail(event, unit, storageLocations)}</small>
                      {statusLabel ? <small className="history-sync-status" data-history-sync-status={event.grocy_sync_status}>{statusLabel}</small> : null}
                      {transactionLabel ? <small data-history-sync-reference={event.grocy_outbox_id ?? undefined}>{transactionLabel}</small> : null}
                      <time className="history-row-time" dateTime={event.occurred_at}>{formatHistoryTime(event.occurred_at)}</time>
                    </span>
                    {event.grocy_status_history?.length ? (
                      <details open={openSyncEvidenceId === event.id} onToggle={(toggleEvent) => setOpenSyncEvidenceId(toggleEvent.currentTarget.open ? event.id : null)} className="history-sync-disclosure" data-history-sync-evidence={event.id}>
                        <summary>재고 앱 추가 내역 보기</summary>
                        <div className="history-sync-list" role="list">
                          {event.grocy_status_history.slice(-6).reverse().map((entry, entryIndex) => (
                            <div className="history-sync-item" role="listitem" data-history-sync-evidence-status={entry.status} key={event.id + ":history:" + entryIndex}>
                              <strong>{outboxHistoryStatusLabel(entry.status)}</strong>
                              <small>{statusHistorySourceLabel(entry.source)} · {formatHistoryTime(entry.occurred_at)}</small>
                              {entry.note ? <small>{outboxHistoryNote(entry.note)}</small> : null}
                              {entry.status === "succeeded" && transactionLabel ? <small>{transactionLabel}</small> : null}
                            </div>
                          ))}
                        </div>
                        <div className="history-sync-actions">
                          {event.grocy_outbox_id && onOpenSyncRecord ? <button className="grocy-refresh-button" type="button" onPointerDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => onOpenSyncRecord(event.grocy_outbox_id!, event.food_id)}>추가 기록 열기</button> : null}
                          {event.grocy_outbox_id && onOpenSyncNotification ? <button className="grocy-refresh-button" type="button" onPointerDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => onOpenSyncNotification(event.grocy_outbox_id!)}>알림 열기</button> : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : <p className="history-empty">아직 이 식품에 기록된 변경이 없어요.</p>}
    </div>
  );
}
