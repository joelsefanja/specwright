import React, { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import ThreePanelLayout from "./components/Layout/ThreePanelLayout";
import CenterPanel from "./components/CenterPanel/CenterPanel";
import { DevFeedbackOverlay } from "./devtools/DevFeedbackOverlay";
import { useLanguageStore, useTranslations } from "./i18n/localeStore";
import { WorkflowShell } from "./workflow/WorkflowShell";

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

const UI_SCALE_STORAGE_KEY = "specwright.uiScale.v2";
const DEFAULT_UI_SCALE = 1;
const BASE_MAGNIFICATION = 1.25;

function clampUiScale(value: number): number {
  return Math.min(1.28, Math.max(0.8, value));
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null; copied: boolean }> {
  state: { error: string | null; copied: boolean } = { error: null, copied: false };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("Specwright renderer error", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
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
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const text = useTranslations();
  const [uiScale, setUiScale] = useState(1);
  const [appVersion, setAppVersion] = useState("");
  const applyScale = useCallback((value: number): void => {
    const next = clampUiScale(value);
    document.documentElement.style.setProperty("--sw-ui-scale", String(next * BASE_MAGNIFICATION));
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, String(next));
    setUiScale(next);
  }, []);
  useEffect(() => {
    window.specwright.app.getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = "paper";
    document.documentElement.dataset.motion = "calm";
    window.localStorage.setItem("specwright.theme", "paper");
  }, []);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(UI_SCALE_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      applyScale(saved);
    } else {
      applyScale(DEFAULT_UI_SCALE);
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (!["+", "=", "-", "_", "0"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const current = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--sw-ui-scale") || "1"
      );
      const currentScale = Number.isFinite(current) ? current / BASE_MAGNIFICATION : 1;
      if (event.key === "0") {
        applyScale(DEFAULT_UI_SCALE);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        applyScale(currentScale + 0.05);
        return;
      }

      applyScale(currentScale - 0.05);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyScale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "-") return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      void window.specwright.window.minimize();
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
            onScalePercentChange={(percent) => applyScale(percent / 100)}
            onScaleReset={() => applyScale(DEFAULT_UI_SCALE)}
            theme="paper"
            language={language}
            onLanguageChange={setLanguage}
            languageLabel={text.app.languageLabel}
            productLabel={text.app.product}
            labels={{
              scale: text.app.uiScaleLabel,
              theme: text.app.themeLabel,
              uiScaleHelp: text.app.uiScaleHelp,
              showSetup: text.app.showSetup,
              hideSetup: text.app.hideSetup,
              showPanel: text.app.showPanel,
              hidePanel: text.app.hidePanel,
              minimize: text.app.minimize,
              toggleFullscreen: text.app.toggleFullscreen,
              close: text.app.close,
              themes: text.app.themes,
            }}
            appVersion={appVersion}
            center={(
              <WorkflowShell>
                <CenterPanel headless />
              </WorkflowShell>
            )}
          />
          <DevFeedbackOverlay />
          <Toaster richColors={false} position="bottom-right" />
        </Tooltip.Provider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}
