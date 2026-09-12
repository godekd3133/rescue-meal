import { useEffect, useRef, useState } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";

function canRegisterServiceWorker() {
  return import.meta.env.PROD && "serviceWorker" in navigator;
}

export default function ServiceWorkerUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (!canRegisterServiceWorker()) return;

    let active = true;
    let currentRegistration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;
    let installingStateChange: (() => void) | null = null;

    const showUpdate = () => {
      if (!active || !navigator.serviceWorker.controller) return;
      setUpdateReady(true);
      setDismissed(false);
    };

    const observeInstallingWorker = (worker: ServiceWorker | null) => {
      if (installingWorker && installingStateChange) {
        installingWorker.removeEventListener("statechange", installingStateChange);
      }
      installingWorker = worker;
      installingStateChange = null;
      if (!worker) return;

      const handleStateChange = () => {
        if (worker.state === "installed") showUpdate();
      };
      installingStateChange = handleStateChange;
      worker.addEventListener("statechange", handleStateChange);
      if (worker.state === "installed") handleStateChange();
    };

    const handleUpdateFound = () => {
      observeInstallingWorker(currentRegistration?.installing ?? null);
    };

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((nextRegistration) => {
        if (!active) return;
        currentRegistration = nextRegistration;
        setRegistration(nextRegistration);
        nextRegistration.addEventListener("updatefound", handleUpdateFound);
        observeInstallingWorker(nextRegistration.installing);
        if (nextRegistration.waiting) showUpdate();
        void nextRegistration.update().catch(() => {
          // A temporarily unavailable update must not make the app unusable.
        });
      })
      .catch(() => {
        // The app remains usable without an installable service worker.
      });

    return () => {
      active = false;
      currentRegistration?.removeEventListener("updatefound", handleUpdateFound);
      if (installingWorker && installingStateChange) {
        installingWorker.removeEventListener("statechange", installingStateChange);
      }
    };
  }, []);

  const applyUpdate = () => {
    if (!registration || applying || reloadRequested.current) return;
    reloadRequested.current = true;
    setApplying(true);

    const waitingWorker = registration.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    let reloadTimer: number | undefined;
    const reload = () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    reloadTimer = window.setTimeout(reload, 5000);
    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      reload();
    }
  };

  if (!updateReady || dismissed) return null;

  return (
    <section className="update-prompt" data-testid="service-worker-update-prompt" role="status" aria-live="polite" aria-label="Rescue Meal 업데이트 안내">
      <div className="update-prompt-main">
        <span className="update-prompt-icon" aria-hidden="true">
          <ReloadIcon width={16} height={16} />
        </span>
        <span className="update-prompt-copy">
          <strong>새 버전이 준비됐어요</strong>
          <small>최신 식품 기록과 기능을 적용하려면 새로고침해 주세요.</small>
        </span>
        <button className="update-prompt-action" type="button" onClick={applyUpdate} disabled={applying}>
          {applying ? "적용 중…" : "새로고침"}
        </button>
        <button className="update-prompt-later" type="button" onClick={() => setDismissed(true)} disabled={applying}>
          나중에
        </button>
      </div>
    </section>
  );
}
