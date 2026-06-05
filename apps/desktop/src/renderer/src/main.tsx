import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/operator.css";
import "./styles/intro.css";
import "./styles/motion.css";
import "./styles/terminal.css";
import "./styles/titlebar.css";
import "./styles/workflow.css";
import "./styles/access.css";
import "./styles/modals.css";
import "./styles/ui-globals.css";
import App from "./App";
import { installDevBrowserSpecwright } from "./devBrowserSpecwright";

// Production runs inside Electron; development may load the Vite renderer in a browser for UI work.
if (!installDevBrowserSpecwright()) {
  document.body.innerHTML =
    '<div style="color:#aaa294;font-family:monospace;padding:32px;background:#11100e;height:100vh">Specwright must be opened inside the Electron app.</div>';
  throw new Error("window.specwright not available - not running inside Electron");
}

document.body.classList.add("app-ready");
document.documentElement.dataset.theme = "paper";
document.documentElement.dataset.motion = "calm";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
