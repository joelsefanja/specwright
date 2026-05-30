import React, { useState, useRef } from "react";
import type { PluginSource } from "@renderer/store/config.store";

type PluginTab = "local" | "npm";

export function PluginPickerModal({
  onClose,
  onApply,
  onReset,
}: {
  onClose: () => void;
  onApply: (source: PluginSource) => void;
  onReset: () => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<PluginTab>("local");
  const [localPath, setLocalPath] = useState("");
  const [localValidation, setLocalValidation] = useState<{ valid: boolean; pluginName?: string; error?: string } | null>(null);
  const [npmPackage, setNpmPackage] = useState("@specwright/plugin-");
  const [npmRegistry, setNpmRegistry] = useState("");
  const [validating, setValidating] = useState(false);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputCls = "operator-field w-full px-2 py-2";

  const handleBrowseLocal = async (): Promise<void> => {
    const picked = await window.specwright.project.pickFolder();
    if (picked) {
      setLocalPath(picked);
      setLocalValidation(null);
      validateDir(picked);
    }
  };

  const validateDir = (dirPath: string): void => {
    if (!dirPath.trim()) { setLocalValidation(null); return; }
    if (validationTimeoutRef.current) clearTimeout(validationTimeoutRef.current);
    setValidating(true);
    validationTimeoutRef.current = setTimeout(async () => {
      const result = await window.specwright.project.validatePlugin(dirPath);
      setLocalValidation(result);
      setValidating(false);
    }, 400);
  };

  const canApply =
    (tab === "local" && localValidation?.valid) ||
    (tab === "npm" && npmPackage.trim().length > 3 && npmPackage.trim() !== "@specwright/plugin-");

  const handleApply = (): void => {
    if (!canApply) return;
    if (tab === "local") {
      onApply({ type: "local", dirPath: localPath });
    } else {
      onApply({ type: "npm", packageName: npmPackage.trim(), registry: npmRegistry.trim() || undefined });
    }
  };

  // Only close on backdrop CLICK (not mousedown / mouseup / drag-release).
  // Prevents accidental dismissal when a click started inside the modal
  // but the mouse drifted onto the backdrop before release.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  // Stop keyboard events (Backspace, Delete, etc.) from bubbling out of the
  // modal — defensive guard against any parent / global key handlers that
  // might interpret unhandled keystrokes as a close action.
  // Escape inside the modal closes it explicitly.
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdropClick}
    >
      <div
        className="operator-panel operator-plugin-modal operator-modal-md border shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleModalKeyDown}
      >
        <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-operator-line">
          <div className="min-w-0">
            <h2 className="operator-plugin-title">Choose test framework plugin</h2>
            <p className="operator-plugin-description">A plugin is the project adapter: it installs Playwright BDD files, agents, skills, and app-specific helper code.</p>
          </div>
          <button onClick={onClose} className="operator-button-quiet px-2 py-1 shrink-0">Close</button>
        </div>

        <div className="flex border-b border-operator-line">
          {(["local", "npm"] as PluginTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`operator-plugin-tab ${tab === t ? "operator-plugin-tab-active" : ""}`}
            >
              {t === "local" ? "Local folder" : "npm package"}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 space-y-3">
          {tab === "local" && (
            <>
              <p className="operator-plugin-description">Use this when your team has a custom project adapter in another repo. Select the folder that contains <span className="font-mono">specwright.plugin.json</span>.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => { setLocalPath(e.target.value); validateDir(e.target.value); }}
                  placeholder="Path to plugin folder"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={handleBrowseLocal}
                  className="operator-button flex-shrink-0"
                >
                  Browse
                </button>
              </div>
              {validating && <p className="operator-plugin-description">Checking plugin folder...</p>}
              {!validating && localValidation && (
                localValidation.valid ? (
                   <p className="text-[var(--sw-success)] text-xs">Valid plugin: <span className="font-mono">{localValidation.pluginName}</span></p>
                ) : (
                  <p className="operator-danger text-xs">{localValidation.error}</p>
                )
              )}
            </>
          )}

          {tab === "npm" && (
            <>
               <p className="operator-plugin-description">Use this when your project adapter is published as an npm package. Private packages can use your team registry.</p>
              <div>
                <label className="operator-control-label">npm package</label>
                <input
                  type="text"
                  value={npmPackage}
                  onChange={(e) => setNpmPackage(e.target.value)}
                  placeholder="@specwright/plugin-mui"
                  className={inputCls}
                />
                <p className="operator-plugin-description mt-1">Usually named <span className="font-mono">@specwright/plugin-*</span>.</p>
              </div>
              <div>
                <label className="operator-control-label">Private registry <span className="operator-muted">— optional</span></label>
                <input
                  type="text"
                  value={npmRegistry}
                  onChange={(e) => setNpmRegistry(e.target.value)}
                  placeholder="https://npm.your-org.com"
                  className={inputCls}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-operator-line">
              <button
                onClick={() => { onReset(); onClose(); }}
                className="operator-button-quiet px-2 py-1"
              >
            Use Specwright default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="operator-button">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className="operator-button-primary disabled:opacity-40"
            >
              Use plugin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
