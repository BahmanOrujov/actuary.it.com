import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { DEMO, ROOT } from "./api";
import App from "./App";
import "./styles.css";

try {
  const saved = localStorage.getItem("pa_theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
} catch {
  /* storage unavailable */
}

// the demo is served as static files from a sub-path: hash routes need no server-side fallback
const Router = DEMO ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router basename={ROOT || undefined}>
      <App />
    </Router>
  </React.StrictMode>,
);
