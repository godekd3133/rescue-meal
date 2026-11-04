export default function HistoryReadError({ message, busy, onRetry }: { message: string; busy: boolean; onRetry: () => void }) {
  return <div className="history-read-error" role={busy ? "status" : "alert"} aria-busy={busy}><span>{busy ? "기록을 다시 불러오고 있어요." : message}</span><button type="button" disabled={busy} onClick={onRetry}>{busy ? "불러오는 중" : "다시 시도"}</button></div>;
}
