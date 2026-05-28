import React, { useEffect, useState } from "react";
import ThreePanelLayout from "./components/Layout/ThreePanelLayout";
import ConfigPanel from "./components/LeftPanel/ConfigPanel";
import CenterPanel from "./components/CenterPanel/CenterPanel";
import RightPanel from "./components/RightPanel/RightPanel";
import { useConfigStore } from "./store/config.store";

export default function App(): React.JSX.Element {
  const projectState = useConfigStore((s) => s.projectState);
  const [uiScale, setUiScale] = useState(1);

  useEffect(() => {
    requestAnimationFrame(() => document.body.classList.add("app-ready"));
    return () => document.body.classList.remove("app-ready");
  }, []);

  useEffect(() => {
    const storageKey = "specwright.uiScale";
    const clamp = (value: number): number => Math.min(1.35, Math.max(0.9, value));
    const applyScale = (value: number): void => {
      const next = clamp(value);
      document.documentElement.style.setProperty("--sw-ui-scale", String(next));
      window.localStorage.setItem(storageKey, String(next));
      setUiScale(next);
    };

    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved > 0) applyScale(saved);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!["+", "=", "-", "_", "0"].includes(event.key)) return;

      event.preventDefault();
      const current = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--sw-ui-scale") || "1"
      );
      if (event.key === "0") applyScale(1);
      else if (event.key === "+" || event.key === "=") applyScale((Number.isFinite(current) ? current : 1) + 0.05);
      else applyScale((Number.isFinite(current) ? current : 1) - 0.05);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ThreePanelLayout
      scalePercent={Math.round(uiScale * 100)}
      left={<ConfigPanel />}
      center={<CenterPanel />}
      right={projectState === "ready" ? <RightPanel /> : undefined}
    />
  );
}
