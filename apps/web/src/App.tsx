import { MobileRuntime } from "./mobile";
import Prototype from "./Prototype";
import { WebRuntime } from "./WebRuntime";

const configuredShell = (import.meta.env.VITE_APP_SHELL as string | undefined)?.trim().toLowerCase() ?? "web";
const appShell = configuredShell === "native" || configuredShell === "preview" ? configuredShell : "web";

export default function App() {
  const content = appShell === "web"
    ? <WebRuntime><Prototype /></WebRuntime>
    : <MobileRuntime><Prototype /></MobileRuntime>;

  return <div className={`app-shell app-shell-${appShell}`} data-app-shell={appShell} data-testid={`${appShell}-app-shell`}>
    {content}
  </div>;
}
