import { useEffect, useState } from "react";
import { CheckIcon, ReaderIcon } from "@radix-ui/react-icons";
import { mealApi, type ApiStorageEvent, type ApiStorageType } from "./mealApi";

function storageLabel(storage: ApiStorageType) {
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

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 확인 필요";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function eventDetail(event: ApiStorageEvent, unit: string) {
  if (event.event_type === "moved" && event.from_storage_type && event.to_storage_type) {
    return `${storageLabel(event.from_storage_type)} → ${storageLabel(event.to_storage_type)}`;
  }
  if (event.event_type === "opened") return "개봉 상태로 기록했어요";
  if (event.event_type === "consumed") return `${event.quantity ?? 0}${unit} 먹었어요`;
  if (event.event_type === "discarded") return `${event.quantity ?? 0}${unit} 폐기했어요`;
  return "보관 상태를 기록했어요";
}

export default function FoodHistory({ foodId, unit }: { foodId: string; unit: string }) {
  const [history, setHistory] = useState<ApiStorageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void mealApi.getStorageEvents(foodId).then((events) => {
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
  }, [foodId]);

  return <div className="detail-history"><div className="detail-section-heading"><span><ReaderIcon width={16} height={16} /> 최근 기록</span><small>{loading ? "불러오는 중" : `${history.length}건`}</small></div>{history.length ? <div className="history-list" role="list">{history.slice(-4).reverse().map((event) => <div className="history-row" role="listitem" key={event.id}><span className="history-icon"><CheckIcon width={13} height={13} /></span><span><strong>{eventLabel(event)}</strong><small>{eventDetail(event, unit)} · {formatEventTime(event.occurred_at)}</small></span></div>)}</div> : <p className="history-empty">아직 이 식품에 기록된 변경이 없어요.</p>}</div>;
}
