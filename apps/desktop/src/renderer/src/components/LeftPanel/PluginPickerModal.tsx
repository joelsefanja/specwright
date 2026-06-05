import React, { useState, useRef } from "react";
import { PuzzlePiece } from "@phosphor-icons/react";
import type { PluginSource } from "@renderer/store/config.store";
import { ModalShell, StatusPill } from "../ui";

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

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => { onReset(); onClose(); }}
        className="operator-button-quiet px-2 py-1"
      >
        Use Specwright default
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="operator-button">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="operator-button-primary disabled:opacity-40"
        >
          Use plugin
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title="Choose test framework plugin"
      description="A plugin installs the Playwright BDD files, agents, skills, and app-specific helper code for this project."
      icon={<PuzzlePiece size={18} weight="duotone" />}
      size="lg"
      footer={footer}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
        <div className="operator-plugin-tabs" role="tablist" aria-label="Plugin source">
          {(["local", "npm"] as PluginTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`operator-plugin-tab ${tab === t ? "operator-plugin-tab-active" : ""}`}
            >
              {t === "local" ? "Local folder" : "npm package"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tab === "local" && (
            <>
              <p className="operator-plugin-description">Use this when your team has its own test setup. Choose the folder that contains <span className="font-mono">specwright.plugin.json</span>.</p>
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
                   <StatusPill status="success" dot>Valid plugin: {localValidation.pluginName}</StatusPill>
                ) : (
                  <StatusPill status="danger" dot>{localValidation.error}</StatusPill>
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
    </ModalShell>
  );
}
