import { MoonIcon, SunIcon } from "@radix-ui/react-icons";

/** 나 › 화면: the one place to switch light/dark (it used to sit in every header). */
export function MeThemeRow({ themeMode, onToggle }: { themeMode: "light" | "dark"; onToggle: () => void }) {
  return (
    <section className="me-section me-theme" aria-labelledby="me-theme-title">
      <div className="me-row">
        <span className="me-row-copy">
          <strong id="me-theme-title">화면 테마</strong>
          <small>{themeMode === "light" ? "라이트 모드" : "다크 모드"}</small>
        </span>
        <button
          className="me-theme-toggle theme-toggle-button"
          type="button"
          data-testid="theme-toggle"
          aria-label={themeMode === "light" ? "현재 라이트모드, 다크모드로 전환" : "현재 다크모드, 라이트모드로 전환"}
          aria-pressed={themeMode === "dark"}
          title={themeMode === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}
          onClick={onToggle}
        >
          {themeMode === "light" ? <MoonIcon width={17} height={17} aria-hidden="true" /> : <SunIcon width={17} height={17} aria-hidden="true" />}
          <span>{themeMode === "light" ? "다크 모드" : "라이트 모드"}</span>
        </button>
      </div>
    </section>
  );
}
