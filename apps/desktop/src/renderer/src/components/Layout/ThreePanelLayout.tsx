import React, { useState } from "react";
import { motion } from "framer-motion";
import { Minus, Square, X } from "@phosphor-icons/react";
import { sidebarTransition } from "@renderer/motion/presets";

interface Props {
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
  scalePercent?: number;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  motion?: string;
  onMotionChange?: (motion: string) => void;
  appVersion?: string;
}

const THEMES = [
  { value: "slate", label: "Dark Slate" },
  { value: "graphite", label: "Dark Graphite" },
  { value: "paper", label: "Light Paper" },
  { value: "sand", label: "Light Sand" },
] as const;

const MOTIONS = [
  { value: "calm", label: "Calm" },
  { value: "operator", label: "Motion" },
  { value: "expressive", label: "Expressive" },
] as const;

/** Sidebar / panel layout icon — rectangle split into two columns, one highlighted */
function LayoutIcon({ highlight }: { highlight: "left" | "right" }): React.JSX.Element {
  return (
    <svg width="15" height="12" viewBox="0 0 15 12" fill="none">
      {/* outer border */}
      <rect x="0.5" y="0.5" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1" />
      {/* divider */}
      <line x1="5" y1="1" x2="5" y2="11" stroke="currentColor" strokeWidth="1" />
      {/* highlighted pane */}
      {highlight === "left" ? (
        <rect x="1" y="1" width="4" height="10" fill="currentColor" rx="1" />
      ) : (
        <rect x="6" y="1" width="8" height="10" fill="currentColor" rx="1" />
      )}
    </svg>
  );
}

const ICON_BTN =
  "flex items-center justify-center w-7 h-7 " +
  "text-stone-500 hover:text-stone-100 hover:bg-stone-800/70 " +
  "transition-colors duration-100";

// Horizontal inset from window edge for the toggle buttons.
// Left side needs extra room for macOS traffic lights (~78 px).
const LEFT_BTN_INSET = 86; // px from left edge of center panel when left panel is collapsed
const RIGHT_BTN_INSET = 10; // px from right edge of window

export default function ThreePanelLayout({ left, center, right, scalePercent = 100, theme = "slate", onThemeChange, motion: motionPreset = "operator", onMotionChange, appVersion }: Props): React.JSX.Element {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col bg-operator-canvas text-operator-ink overflow-hidden">
      {/* App-wide titlebar */}
        <div
          className="operator-titlebar"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {/* Left panel toggle
              When left panel is visible, center panel starts at x=280, so inset=10 is fine.
              When collapsed, center panel starts at x=0, so we need LEFT_BTN_INSET to clear traffic lights.
              Use CSS transition so it slides with the panel. */}
          <button
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? "Show sidebar" : "Hide sidebar"}
            className={ICON_BTN}
            style={{
              position: "absolute",
              left: 10,
              transition: "left 200ms",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            <LayoutIcon highlight={leftCollapsed ? "right" : "left"} />
          </button>

          {/* App identity — centered in title bar */}
          <div className="operator-titlebar-brand">
            <span className="operator-titlebar-mark">S</span>
            <span className="operator-titlebar-name">Specwright</span>
            {appVersion && <span className="operator-titlebar-version">v{appVersion}</span>}
            <span className="operator-titlebar-product">E2E Automation Workbench</span>
          </div>

          <div
            className="operator-titlebar-right"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <div
              className="text-[10px] font-mono text-stone-600 pointer-events-none"
              title="UI scale. Use Ctrl/Cmd +, Ctrl/Cmd -, Ctrl/Cmd 0."
            >
              {scalePercent}%
            </div>

            {onThemeChange && (
              <select
                value={theme}
                onChange={(event) => onThemeChange(event.target.value)}
                className="operator-theme-select"
                title="Theme"
              >
                {THEMES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            )}

            {onMotionChange && (
              <select
                value={motionPreset}
                onChange={(event) => onMotionChange(event.target.value)}
                className="operator-theme-select"
                title="Motion"
              >
                {MOTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            )}

            {right && (
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                title={rightCollapsed ? "Show panel" : "Hide panel"}
                className={ICON_BTN}
              >
                <LayoutIcon highlight={rightCollapsed ? "left" : "right"} />
              </button>
            )}

            <div className="operator-window-controls">
              <button
                type="button"
                className="operator-window-button"
                title="Minimize"
                onClick={() => window.specwright.window.minimize()}
              >
                <Minus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className="operator-window-button"
                title="Toggle fullscreen"
                onClick={() => window.specwright.window.toggleFullscreen()}
              >
                <Square size={10} weight="bold" />
              </button>
              <button
                type="button"
                className="operator-window-button"
                data-danger="true"
                title="Close"
                onClick={() => window.specwright.window.close()}
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          </div>
        </div>

      <div className="app-stagger-root grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] overflow-hidden">
        {/* ── Left panel ── */}
        <motion.div
          className="flex flex-col bg-operator-panel border-r border-operator-line flex-shrink-0 overflow-hidden"
          animate={{ width: leftCollapsed ? 0 : "var(--sw-sidebar-width)" }}
          transition={sidebarTransition}
          style={{ paddingTop: 0, minWidth: 0 }}
        >
          {left}
        </motion.div>

        {/* ── Center ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Main content */}
        <div className="flex-1 min-h-0 overflow-hidden">{center}</div>
      </div>

      {/* ── Right panel ── */}
      {right && (
        <motion.div
          className="flex flex-col bg-operator-panel border-l border-operator-line flex-shrink-0 overflow-hidden"
          animate={{ width: rightCollapsed ? 0 : 360 }}
          transition={sidebarTransition}
          style={{ minWidth: 0 }}
        >
          {right}
        </motion.div>
      )}
      </div>
    </div>
  );
}
