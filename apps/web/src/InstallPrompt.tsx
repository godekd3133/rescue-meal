import { useEffect, useState } from "react";
import { Cross2Icon, DownloadIcon, HomeIcon } from "@radix-ui/react-icons";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

const DISMISS_KEY = "rescue-meal.install-prompt-dismissed-until";
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isStandaloneDisplay() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || standaloneNavigator.standalone);
}

function isAppleMobile() {
  const userAgent = navigator.userAgent.toLowerCase();
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/.test(userAgent) || touchMac;
}

function readDismissedUntil() {
  try {
    const value = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(value) && value > Date.now();
  } catch {
    return false;
  }
}

function persistDismissedUntil() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_WINDOW_MS));
  } catch {
    // Private browsing or storage restrictions should not block the app.
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosStepsOpen, setIosStepsOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setIos(isAppleMobile());
    setDismissed(readDismissedUntil());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
      setError("");
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setError("");
    };
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setInstalled(event.matches || isStandaloneDisplay());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const usesModernMediaListener = Boolean(displayMode?.addEventListener);
    if (usesModernMediaListener) {
      displayMode?.addEventListener("change", handleDisplayModeChange);
    } else {
      displayMode?.addListener?.(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      if (usesModernMediaListener) {
        displayMode?.removeEventListener("change", handleDisplayModeChange);
      } else {
        displayMode?.removeListener?.(handleDisplayModeChange);
      }
    };
  }, []);

  const close = () => {
    setDismissed(true);
    persistDismissedUntil();
  };

  const install = async () => {
    if (!deferredPrompt) return;
    const pending = deferredPrompt;
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else {
        close();
      }
    } catch {
      setError("설치를 시작하지 못했어요. 브라우저 메뉴에서 홈 화면에 추가해 주세요.");
    }
  };

  if (installed || dismissed || (!deferredPrompt && !ios)) return null;

  return (
    <section className="install-prompt" data-testid="install-prompt" role="status" aria-label="Rescue Meal 앱 설치 안내">
      <div className="install-prompt-main">
        <span className="install-prompt-icon" aria-hidden="true">
          {ios ? <HomeIcon width={17} height={17} /> : <DownloadIcon width={17} height={17} />}
        </span>
        <span className="install-prompt-copy">
          <strong>{ios ? "홈 화면에 저장해요" : "앱처럼 더 편하게 써요"}</strong>
          <small>{ios ? "Safari에서 바로 열 수 있게 저장해 두세요." : "장보기 직후에도 빠르게 열고 기록을 이어가요."}</small>
        </span>
        <button
          className="install-prompt-action"
          type="button"
          aria-expanded={ios ? iosStepsOpen : undefined}
          aria-controls={ios ? "install-prompt-steps" : undefined}
          onClick={ios ? () => setIosStepsOpen((current) => !current) : () => void install()}
        >
          {ios ? (iosStepsOpen ? "닫기" : "설치 방법") : "설치하기"}
        </button>
        <button className="install-prompt-close" type="button" onClick={close} aria-label="앱 설치 안내 닫기">
          <Cross2Icon width={14} height={14} />
        </button>
      </div>
      {ios && iosStepsOpen ? <p className="install-prompt-steps" id="install-prompt-steps" role="note">Safari 하단의 공유 버튼을 누른 뒤 <strong>홈 화면에 추가</strong>를 선택해 주세요.</p> : null}
      {error ? <p className="install-prompt-error" role="alert">{error}</p> : null}
    </section>
  );
}
