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
        className="operator-panel operator-modal-md border shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleModalKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-operator-line">
          <div>
            <h2 className="text-stone-200 text-sm font-semibold">Select Plugin</h2>
            <p className="operator-muted text-xs mt-1">Plugins configure your test framework for your app</p>
          </div>
          <button onClick={onClose} className="operator-muted hover:text-stone-300 text-xs">Close</button>
        </div>

        <div className="flex border-b border-operator-line">
          {(["local", "npm"] as PluginTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs py-2 transition-colors ${tab === t ? "text-brand-400 border-b border-brand-400" : "operator-muted hover:text-stone-300"}`}
            >
              {t === "local" ? "Local" : "npm"}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 space-y-3">
          {tab === "local" && (
            <>
              <p className="operator-muted text-xs">Browse to your org's plugin directory. It must contain a <span className="font-mono text-stone-400">specwright.plugin.json</span> file.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => { setLocalPath(e.target.value); validateDir(e.target.value); }}
                  placeholder="/path/to/plugin-directory"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={handleBrowseLocal}
                  className="operator-button flex-shrink-0"
                >
                  Browse
                </button>
              </div>
              {validating && <p className="operator-muted text-xs">Validating…</p>}
              {!validating && localValidation && (
                localValidation.valid ? (
                  <p className="text-[var(--sw-success)] text-xs"><span className="font-mono">{localValidation.pluginName}</span></p>
                ) : (
                  <p className="operator-danger text-xs">{localValidation.error}</p>
                )
              )}
            </>
          )}

          {tab === "npm" && (
            <>
              <p className="operator-muted text-xs">Install a plugin from npm. Use your org's private registry if the plugin is not public.</p>
              <div>
                <label className="operator-control-label">Package name</label>
                <input
                  type="text"
                  value={npmPackage}
                  onChange={(e) => setNpmPackage(e.target.value)}
                  placeholder="@specwright/plugin-mui"
                  className={inputCls}
                />
                <p className="operator-muted text-xs mt-1">Convention: <span className="font-mono">@specwright/plugin-*</span></p>
              </div>
              <div>
                <label className="operator-control-label">Registry <span className="operator-muted">(optional)</span></label>
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
            className="operator-muted hover:text-stone-300 text-xs transition-colors"
          >
            Use default
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
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
