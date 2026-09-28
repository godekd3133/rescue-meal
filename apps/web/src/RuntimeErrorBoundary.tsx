import { Component, type ErrorInfo, type ReactNode } from "react";
import { mealApi, type ClientErrorKind } from "./mealApi";

type RuntimeErrorBoundaryProps = {
  children: ReactNode;
};

type RuntimeErrorBoundaryState = {
  hasError: boolean;
};

function classifyClientError(error: Error): ClientErrorKind {
  const name = error?.name;
  if (name === "TypeError") return "type_error";
  if (name === "RangeError") return "range_error";
  if (name === "ReferenceError") return "reference_error";
  if (name === "SyntaxError") return "syntax_error";
  if (name === "ChunkLoadError") return "chunk_load_error";
  if (name === "Error") return "error";
  return "unknown";
}

function clientRelease() {
  const release = (import.meta.env.VITE_APP_VERSION ?? "").trim();
  return /^[A-Za-z0-9._+-]{1,80}$/.test(release) ? release : "web-unknown";
}

/**
 * Keeps a render-time failure inside the phone from becoming a blank screen.
 * The UI intentionally avoids showing an exception message because it can
 * contain implementation details or user data.
 */
export default class RuntimeErrorBoundary extends Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = { hasError: false };
  private clientErrorReported = false;

  static getDerivedStateFromError(): RuntimeErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Rescue Meal render error", error, errorInfo);
    }
    if (this.clientErrorReported) return;
    this.clientErrorReported = true;
    void mealApi.reportClientError({
      surface: "prototype",
      error_kind: classifyClientError(error),
      release: clientRelease(),
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="runtime-error-screen" aria-label="Rescue Meal 화면 오류">
        <div className="runtime-error-mark" aria-hidden="true">!</div>
        <span className="runtime-error-kicker">RESCUE MEAL</span>
        <h1>화면을<br /><em>다시 열어 주세요</em></h1>
        <p>저장한 기록은 그대로 있어요. 화면을 다시 열면 이어서 볼 수 있어요.</p>
        <div className="runtime-error-note" role="alert">
          <strong>잠시 멈췄어요</strong>
          <span>같은 문제가 계속되면 잠시 후 다시 시도해 주세요.</span>
        </div>
        <button className="primary-sheet-button runtime-error-reload" type="button" onClick={this.handleReload}>화면 다시 열기</button>
      </main>
    );
  }
}
