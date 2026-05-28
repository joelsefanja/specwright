import React, { useState } from "react";

interface ModelOption {
  providerId: string;
  modelId: string;
}

function isPreferredGptProvider(providerId: string): boolean {
  const id = providerId.toLowerCase();
  return id.includes("opencode") || id.includes("openai") || id.includes("chatgpt");
}

function sortModels(models: ModelOption[]): ModelOption[] {
  return [...models].sort((a, b) => {
    const aPreferred = isPreferredGptProvider(a.providerId) ? 0 : 1;
    const bPreferred = isPreferredGptProvider(b.providerId) ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    if (a.modelId === "gpt-5.5") return -1;
    if (b.modelId === "gpt-5.5") return 1;
    return a.modelId.localeCompare(b.modelId);
  });
}

export function OpenCodeConfigModal({
  initialUrl,
  initialModel,
  initialVariant,
  onSave,
  onClose,
}: {
  initialUrl: string;
  initialModel: string;
  initialVariant: string;
  onSave: (url: string, model: string, variant: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [url, setUrl] = useState(initialUrl || "http://127.0.0.1:18789");
  const [selectedModel, setSelectedModel] = useState(initialModel || "");
  const [variant, setVariant] = useState(initialVariant || "low");
  const [status, setStatus] = useState<"idle" | "detecting" | "connected" | "error">("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const handleDetect = async (): Promise<void> => {
    setStatus("detecting");
    setMessage(null);
    setModels([]);
    try {
      const data = await window.specwright.opencode.listProviders(url);
      if (!data) {
        setStatus("error");
        setMessage("Server not reachable — run: opencode serve --port 18789");
        return;
      }
      const optsByKey = new Map<string, ModelOption>();
      for (const pid of data.connected) {
        if (data.default[pid]) {
          optsByKey.set(`${pid}/${data.default[pid]}`, { providerId: pid, modelId: data.default[pid] });
        }
      }
      for (const provider of data.all ?? []) {
        if (!data.connected.includes(provider.id)) continue;
        for (const modelId of Object.keys(provider.models ?? {})) {
          optsByKey.set(`${provider.id}/${modelId}`, { providerId: provider.id, modelId });
        }
      }
      if (data.connected.includes("opencode")) {
        optsByKey.set("opencode/gpt-5.5", { providerId: "opencode", modelId: "gpt-5.5" });
      }
      const opts = sortModels(Array.from(optsByKey.values()));
      if (opts.length === 0) {
        setStatus("error");
        setMessage("No connected providers found");
        return;
      }
      setModels(opts);
      if (!selectedModel || !opts.some((m) => m.modelId === selectedModel)) {
        setSelectedModel(opts.find((m) => m.modelId === "gpt-5.5")?.modelId ?? opts[0].modelId);
      }
      setStatus("connected");
    } catch {
      setStatus("error");
      setMessage("Server not reachable");
    }
  };

  const label = (pid: string): string => {
    const names: Record<string, string> = { opencode: "OpenCode", anthropic: "Anthropic", openai: "OpenAI", ollama: "Ollama" };
    return names[pid] || pid;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="operator-panel operator-modal-sm border shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-operator-line">
          <h2 className="text-stone-200 text-sm font-semibold">OpenCode Model</h2>
          <button onClick={onClose} className="operator-muted hover:text-stone-300 text-xs">Close</button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div>
            <label className="operator-control-label">Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:18789"
                className="operator-field flex-1 px-2 py-2"
              />
              <button
                onClick={handleDetect}
                disabled={status === "detecting"}
                className="operator-button disabled:opacity-50"
              >
                {status === "detecting" ? "..." : "Detect"}
              </button>
            </div>
          </div>

          {status === "error" && message && (
            <p className="operator-danger text-xs">{message}</p>
          )}

          {models.length > 0 && (
            <div className="space-y-2">
              <p className="operator-section-title">Models</p>
              {models.map((m) => (
                <label
                  key={m.providerId}
                  className={`flex items-center gap-3 px-3 py-2 border cursor-pointer transition-colors ${
                    selectedModel === m.modelId
                      ? "bg-brand-950/30 border-brand-500"
                      : "bg-operator-field border-operator-line hover:border-stone-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="oc-model"
                    checked={selectedModel === m.modelId}
                    onChange={() => setSelectedModel(m.modelId)}
                    className="w-3.5 h-3.5 text-brand-500 bg-operator-field border-operator-line"
                  />
                  <div className="min-w-0">
                    <p className="text-stone-200 text-[13px] font-medium">{label(m.providerId)}</p>
                    <p className="operator-muted text-xs font-mono truncate">{m.modelId}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {status === "connected" && selectedModel && (
            <p className="text-[var(--sw-success)] text-xs flex items-center gap-1">
              <span className="operator-status-dot bg-[var(--sw-success)]" />
              Connected — {selectedModel} / {variant}
            </p>
          )}

          <div>
            <label className="operator-control-label">Variant</label>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="operator-select w-full"
            >
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-operator-line">
          <button
            onClick={onClose}
            className="operator-button"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(url, selectedModel, variant)}
            disabled={!selectedModel}
            className="operator-button-primary disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
