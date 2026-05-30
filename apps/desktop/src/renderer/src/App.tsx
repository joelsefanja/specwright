import React, { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { animate } from "motion";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import ThreePanelLayout from "./components/Layout/ThreePanelLayout";
import ConfigPanel from "./components/LeftPanel/ConfigPanel";
import CenterPanel from "./components/CenterPanel/CenterPanel";
import RightPanel from "./components/RightPanel/RightPanel";
import { useConfigStore } from "./store/config.store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null; copied: boolean }> {
  state: { error: string | null; copied: boolean } = { error: null, copied: false };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("Specwright renderer error", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    const error = this.state.error;
    return (
      <div className="specwright-intro specwright-intro-static">
        <div className="specwright-intro-card specwright-intro-card-error">
          <div className="specwright-intro-mark">S</div>
          <div>
            <p className="operator-label operator-danger">Loading error</p>
            <h1 className="specwright-intro-title">Interface recovered</h1>
          </div>
          <p className="operator-text-muted">Specwright hit a renderer error instead of showing the run screen.</p>
          <p className="operator-field-help select-text">{error}</p>
          <div className="flex gap-2">
            <button type="button" className="operator-button-primary" onClick={() => window.location.reload()}>
              Reload interface
            </button>
            <button
              type="button"
              className="operator-button"
              onClick={() => {
                void navigator.clipboard.writeText(error).then(() => this.setState({ copied: true }));
              }}
            >
              {this.state.copied ? "Copied" : "Copy error"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function App(): React.JSX.Element {
  const projectState = useConfigStore((s) => s.projectState);
  const [uiScale, setUiScale] = useState(1);
  const [theme, setTheme] = useState("slate");
  const [motion, setMotion] = useState("operator");
  const [appVersion, setAppVersion] = useState("");
  const [showIntro, setShowIntro] = useState(true);
  const [introExiting, setIntroExiting] = useState(false);
  const introBarRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const barDelay = 220;
    const barDuration = 1100;
    let controls: ReturnType<typeof animate> | null = null;
    const barTimer = window.setTimeout(() => {
      if (!introBarRef.current) return;
      controls = animate(
        introBarRef.current,
        { transform: ["scaleX(0)", "scaleX(1)"] },
        { duration: barDuration / 1000, ease: [0.28, 0.08, 0.12, 1] }
      );
    }, barDelay);
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => document.body.classList.add("app-ready"));
      setIntroExiting(true);
    }, barDelay + barDuration);
    const removeTimer = window.setTimeout(() => setShowIntro(false), barDelay + barDuration + 420);
    return () => {
      window.clearTimeout(barTimer);
      controls?.stop();
      window.clearTimeout(timer);
      window.clearTimeout(removeTimer);
      document.body.classList.remove("app-ready");
    };
  }, []);

  useEffect(() => {
    window.specwright.app.getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  useEffect(() => {
    const storageKey = "specwright.theme";
    const saved = window.localStorage.getItem(storageKey) || "sand";
    document.documentElement.dataset.theme = saved;
    setTheme(saved);
  }, []);

  useEffect(() => {
    const storageKey = "specwright.motion";
    const saved = window.localStorage.getItem(storageKey) || "operator";
    document.documentElement.dataset.motion = saved;
    setMotion(saved);
  }, []);

  const setAppTheme = (nextTheme: string): void => {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("specwright.theme", nextTheme);
    setTheme(nextTheme);
  };

  const setAppMotion = (nextMotion: string): void => {
    document.documentElement.dataset.motion = nextMotion;
    window.localStorage.setItem("specwright.motion", nextMotion);
    setMotion(nextMotion);
  };

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
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Tooltip.Provider delayDuration={450}>
          <ThreePanelLayout
            scalePercent={Math.round(uiScale * 100)}
            theme={theme}
            onThemeChange={setAppTheme}
            motion={motion}
            onMotionChange={setAppMotion}
            appVersion={appVersion}
            left={<ConfigPanel />}
            center={<CenterPanel />}
            right={projectState === "ready" ? <RightPanel /> : undefined}
          />
          {showIntro && (
            <div className="specwright-intro" data-exiting={introExiting}>
              <div className="specwright-intro-card">
                <div className="specwright-intro-brand">
                  <div className="specwright-intro-mark">S</div>
                  <p className="specwright-intro-kicker">Specwright</p>
                  <h1 className="specwright-intro-title">Preparing the workbench</h1>
                </div>
                <div className="specwright-intro-status" aria-label="Loading Specwright workspace">
                  <div className="specwright-intro-status-row">
                    <span>01</span>
                    <span>Project state</span>
                  </div>
                  <div className="specwright-intro-status-row">
                    <span>02</span>
                    <span>Motion system</span>
                  </div>
                  <div className="specwright-intro-status-row">
                    <span>03</span>
                    <span>Workbench panels</span>
                  </div>
                  <div className="specwright-intro-bar" aria-hidden="true">
                    <span ref={introBarRef} />
                  </div>
                  <p className="specwright-intro-note">Loading interface modules and restoring your workspace.</p>
                </div>
              </div>
            </div>
          )}
          <Toaster richColors={false} position="bottom-right" />
        </Tooltip.Provider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
