import { createRoot } from "react-dom/client";
import RuntimeErrorBoundary from "../src/RuntimeErrorBoundary";
import "../src/prototype.css";

function BrokenFixtureChild() {
  throw new Error("fixture-only render failure");
}

createRoot(document.getElementById("root")!).render(
  <RuntimeErrorBoundary>
    <BrokenFixtureChild />
  </RuntimeErrorBoundary>,
);
