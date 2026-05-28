import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Specwright only runs inside Electron (preload injects window.specwright).
// Guard against loading in a plain browser during Playwright testing.
if (!window.specwright) {
  document.body.innerHTML =
    '<div style="color:#aaa294;font-family:monospace;padding:32px;background:#11100e;height:100vh">Specwright must be opened inside the Electron app.</div>';
  throw new Error("window.specwright not available — not running inside Electron");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
