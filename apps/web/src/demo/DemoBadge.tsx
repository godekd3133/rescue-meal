function restart() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(storage).filter((key) => key.startsWith("rescue-meal")).forEach((key) => storage.removeItem(key));
    } catch {
      // Private browsing can reject storage access; a reload still restores the sample data.
    }
  }
  window.location.reload();
}

export default function DemoBadge() {
  return (
    <aside className="demo-badge" aria-label="체험판 안내" data-testid="demo-badge">
      <span>예시 데이터로 체험 중</span>
      <button type="button" onClick={restart}>처음부터 다시 하기</button>
    </aside>
  );
}
