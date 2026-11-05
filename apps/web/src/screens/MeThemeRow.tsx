/** 나 › 다크 모드: the one place to switch light/dark, as a plain settings row with a switch. */
export function MeThemeRow({ themeMode, onToggle }: { themeMode: "light" | "dark"; onToggle: () => void }) {
  const dark = themeMode === "dark";
  return (
    <button
      className="set-row set-theme"
      type="button"
      data-testid="theme-toggle"
      aria-label={dark ? "현재 다크모드, 라이트모드로 전환" : "현재 라이트모드, 다크모드로 전환"}
      aria-pressed={dark}
      onClick={onToggle}
    >
      <span className="set-row-title">다크 모드</span>
      <span className="set-switch" aria-hidden="true" data-on={dark || undefined}><span /></span>
    </button>
  );
}
