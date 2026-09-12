import { MobileRuntime } from "./mobile";
import Prototype from "./Prototype";

const appShell = ((import.meta.env.VITE_APP_SHELL as string | undefined)?.trim().toLowerCase() ?? "") === "native"
  ? "native"
  : "preview";

export default function App() {
  return <div className={`app-shell app-shell-${appShell}`} data-app-shell={appShell} data-testid={`${appShell}-app-shell`}>
    <MobileRuntime>
      <Prototype />
    </MobileRuntime>
  </div>;
}
