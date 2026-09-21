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
        <span className="runtime-error-kicker">RESCUE MEAL · 복구 안내</span>
        <h1>잠시<br /><em>문제가 생겼어요</em></h1>
        <p>기록은 지워지지 않았어요. 화면을 다시 시작하면 이어서 확인할 수 있어요.</p>
        <div className="runtime-error-note" role="alert">
          <strong>앱 화면을 복구할 준비가 됐어요</strong>
          <span>계속 같은 문제가 생기면 잠시 후 다시 시도해 주세요.</span>
        </div>
        <button className="primary-sheet-button runtime-error-reload" type="button" onClick={this.handleReload}>다시 시작하기</button>
        <small className="runtime-error-footnote">Rescue Meal은 저장된 식품 기록을 보호하고 있어요.</small>
      </main>
    );
  }
}
