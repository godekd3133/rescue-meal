import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/latin-500.css";
import App from "../App";
import "../styles.css";
import "../prototype.css";
import DemoBadge from "./DemoBadge";
import "./demo.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoBadge />
    <App />
  </React.StrictMode>,
);
