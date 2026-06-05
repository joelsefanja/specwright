import React, { useState } from "react";
import { motion } from "framer-motion";
import { CaretDown, Minus, Square, X } from "@phosphor-icons/react";
import { sidebarTransition } from "@renderer/motion/presets";
import type { Locale } from "@renderer/i18n/localeStore";

interface Props {
  left?: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
  scalePercent?: number;
  onScalePercentChange?: (percent: number) => void;
  onScaleReset?: () => void;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  language?: Locale;
  onLanguageChange?: (language: Locale) => void;
  languageLabel?: string;
  productLabel?: string;
  labels?: {
    scale: string;
    theme: string;
    uiScaleHelp: string;
    showSetup: string;
    hideSetup: string;
    showPanel: string;
    hidePanel: string;
    minimize: string;
    toggleFullscreen: string;
    close: string;
    themes: Record<string, string>;
  };
  appVersion?: string;
}

const THEME_VALUES = ["slate", "graphite", "paper", "sand"] as const;

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
  "flex min-h-[var(--sw-control-height-sm)] min-w-[var(--sw-control-height-sm)] items-center justify-center rounded-[var(--sw-radius-control)] " +
  "text-[var(--sw-text-subtle)] hover:text-[var(--sw-text)] hover:bg-[var(--sw-field)] " +
  "transition-colors duration-[var(--sw-motion)]";

// Horizontal inset from window edge for the toggle buttons.
// Left side needs extra room for macOS traffic lights (~78 px).
const LEFT_BTN_INSET = 86; // px from left edge of center panel when left panel is collapsed
const RIGHT_BTN_INSET = 10; // px from right edge of window

export default function ThreePanelLayout({ left, center, right, scalePercent = 100, onScalePercentChange, onScaleReset, theme = "slate", onThemeChange, language = "nl", onLanguageChange, languageLabel = "Taal", productLabel = "Begeleide testmaker", labels, appVersion }: Props): React.JSX.Element {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col bg-operator-canvas text-operator-ink overflow-hidden">
      {/* App-wide titlebar */}
        <div
          className="operator-titlebar"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="operator-titlebar-left" style={{ WebkitAppRegion: left ? "no-drag" : "drag" } as React.CSSProperties}>
            {left && (
              <button
                onClick={() => setLeftCollapsed((v) => !v)}
                title={leftCollapsed ? labels?.showSetup : labels?.hideSetup}
                className={ICON_BTN}
              >
                <LayoutIcon highlight={leftCollapsed ? "right" : "left"} />
              </button>
            )}
          </div>

          {/* App identity — centered in title bar */}
          <div className="operator-titlebar-brand">
            <span className="operator-titlebar-name">Specwright</span>
            {appVersion && <span className="operator-titlebar-version">v{appVersion}</span>}
            <span className="operator-titlebar-product">{productLabel}</span>
          </div>

          <div
            className="operator-titlebar-right"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {right && (
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                title={rightCollapsed ? labels?.showPanel : labels?.hidePanel}
                className={ICON_BTN}
              >
                <LayoutIcon highlight={rightCollapsed ? "left" : "right"} />
              </button>
            )}

            <div className="operator-titlebar-settings">
              <TitlebarScaleControl
                label={labels?.scale ?? "Scale"}
                help={labels?.uiScaleHelp ?? ""}
                value={scalePercent}
                onChange={onScalePercentChange}
                onReset={onScaleReset}
              />

              {onThemeChange && (
                <TitlebarSelect
                  label={labels?.theme ?? "Theme"}
                  value={theme}
                  options={THEME_VALUES.map((value) => ({ value, label: labels?.themes[value] ?? value }))}
                  onChange={onThemeChange}
                />
              )}

              {onLanguageChange && (
                <TitlebarSelect
                  label={languageLabel}
                  value={language}
                  options={[{ value: "nl", label: "NL" }, { value: "en", label: "EN" }]}
                  onChange={(value) => onLanguageChange(value as Locale)}
                />
              )}
            </div>

            <div className="operator-window-controls">
              <button
                type="button"
                className="operator-window-button"
                title={labels?.minimize}
                onClick={() => window.specwright.window.minimize()}
              >
                <Minus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className="operator-window-button"
                title={labels?.toggleFullscreen}
                onClick={() => window.specwright.window.toggleFullscreen()}
              >
                <Square size={10} weight="bold" />
              </button>
              <button
                type="button"
                className="operator-window-button"
                data-danger="true"
                title={labels?.close}
                onClick={() => window.specwright.window.close()}
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          </div>
        </div>

      <div className="app-stagger-root grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: `${left ? "auto " : ""}minmax(0,1fr)${right ? " auto" : ""}` }}>
        {left && (
          <motion.div
            className="operator-layout-sidebar operator-layout-sidebar-left flex flex-col bg-operator-panel border-r border-operator-line flex-shrink-0 overflow-hidden"
            animate={{ width: leftCollapsed ? 0 : "var(--sw-sidebar-width)" }}
            transition={sidebarTransition}
            style={{ paddingTop: 0, minWidth: 0 }}
          >
            {left}
          </motion.div>
        )}

        {/* ── Center ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Main content */}
        <div className="flex-1 min-h-0 overflow-hidden">{center}</div>
      </div>

      {/* ── Right panel ── */}
      {right && (
        <motion.div
          className="operator-layout-sidebar operator-layout-sidebar-right flex flex-col bg-operator-panel border-l border-operator-line flex-shrink-0 overflow-hidden"
          animate={{ width: rightCollapsed ? 0 : "var(--sw-right-sidebar-width)" }}
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

function TitlebarScaleControl({ label, help, value, onChange, onReset }: { label: string; help: string; value: number; onChange?: (percent: number) => void; onReset?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const min = 80;
  const max = 128;
  const clampedValue = Math.min(max, Math.max(min, value));
  const position = ((clampedValue - min) / (max - min)) * 100;
  const changeBy = (delta: number): void => onChange?.(Math.min(max, Math.max(min, clampedValue + delta)));

  return (
    <div className="operator-titlebar-control operator-titlebar-scale" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        type="button"
        className="operator-titlebar-scale-trigger"
        title={help}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="operator-titlebar-control-label">{label}</span>
        <span className="operator-titlebar-scale-value">{clampedValue}%</span>
      </button>
      {open && (
        <div className="operator-titlebar-scale-popover" role="dialog" aria-label={label}>
          <div className="operator-titlebar-scale-popover-head">
            <span>{label}</span>
            <button type="button" className="operator-titlebar-scale-reset" onClick={onReset}>100%</button>
          </div>
          <div className="operator-titlebar-scale-row">
            <button type="button" className="operator-titlebar-scale-step" onClick={() => changeBy(-2)} aria-label="Zoom out">-</button>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={clampedValue}
              aria-label={label}
              className="operator-titlebar-scale-range"
              style={{ "--scale-position": `${position}%` } as React.CSSProperties}
              onChange={(event) => onChange?.(Number(event.currentTarget.value))}
            />
            <button type="button" className="operator-titlebar-scale-step" onClick={() => changeBy(2)} aria-label="Zoom in">+</button>
          </div>
          <div className="operator-titlebar-scale-marks">
            <span>80%</span>
            <strong>{clampedValue}%</strong>
            <span>128%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TitlebarSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="operator-titlebar-control operator-titlebar-select" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <span className="operator-titlebar-control-label">{label}</span>
      <button
        type="button"
        className="operator-titlebar-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label ?? value}</span>
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div className="operator-titlebar-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="operator-titlebar-select-option"
              data-selected={option.value === value}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
