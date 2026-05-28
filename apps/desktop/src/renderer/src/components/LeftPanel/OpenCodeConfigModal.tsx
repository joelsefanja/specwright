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
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[360px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-slate-200 text-sm font-semibold">OpenCode Model</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:18789"
                className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
              />
              <button
                onClick={handleDetect}
                disabled={status === "detecting"}
                className="px-3 py-1.5 text-xs bg-slate-700 text-slate-200 border border-slate-600 hover:border-brand-500 rounded transition-colors disabled:opacity-50"
              >
                {status === "detecting" ? "..." : "Detect"}
              </button>
            </div>
          </div>

          {status === "error" && message && (
            <p className="text-red-400 text-xs">{message}</p>
          )}

          {models.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Models</p>
              {models.map((m) => (
                <label
                  key={m.providerId}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedModel === m.modelId
                      ? "bg-slate-700 border-brand-500"
                      : "bg-slate-750 border-slate-700 hover:border-slate-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="oc-model"
                    checked={selectedModel === m.modelId}
                    onChange={() => setSelectedModel(m.modelId)}
                    className="w-3.5 h-3.5 text-brand-500 bg-slate-700 border-slate-600"
                  />
                  <div className="min-w-0">
                    <p className="text-slate-200 text-xs font-medium">{label(m.providerId)}</p>
                    <p className="text-slate-500 text-xxs font-mono truncate">{m.modelId}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {status === "connected" && selectedModel && (
            <p className="text-green-400/80 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              Connected — {selectedModel} / {variant}
            </p>
          )}

          <div>
            <label className="block text-slate-400 text-xs mb-1">Variant</label>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
            >
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-700">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(url, selectedModel, variant)}
            disabled={!selectedModel}
            className="text-xs px-4 py-1.5 rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-brand-600 hover:bg-brand-500 text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
