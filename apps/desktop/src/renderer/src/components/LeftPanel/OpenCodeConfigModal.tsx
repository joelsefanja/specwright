import React, { useEffect, useMemo, useState } from "react";
import { Cpu } from "@phosphor-icons/react";
import { ModalShell, SettingsRow, StatusPill } from "../ui";

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
    if (a.modelId === "gpt-5.5-fast") return -1;
    if (b.modelId === "gpt-5.5-fast") return 1;
    return a.modelId.localeCompare(b.modelId);
  });
}

function isAllowedModel(model: ModelOption): boolean {
  return model.modelId !== "big-pickle";
}

function normalizeModel(model: string): string {
  return !model || model === "big-pickle" || model === "gpt-5.5" ? "gpt-5.5-fast" : model;
}

function groupModels(models: ModelOption[]): Map<string, ModelOption[]> {
  const groups = new Map<string, ModelOption[]>();
  for (const model of models) {
    const items = groups.get(model.providerId) ?? [];
    items.push(model);
    groups.set(model.providerId, items);
  }
  return groups;
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
  const [selectedModel, setSelectedModel] = useState(normalizeModel(initialModel));
  const [variant, setVariant] = useState(initialVariant || "low");
  const [status, setStatus] = useState<"idle" | "detecting" | "connected" | "error">("idle");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleDetect = async (): Promise<void> => {
    setStatus("detecting");
    setMessage(null);
    setModels([]);
    try {
      const data = await window.specwright.opencode.listProviders(url);
      if (!data) {
        setStatus("error");
        setMessage("Could not refresh models. Using the default OpenCode model.");
        setModels([{ providerId: "openai", modelId: "gpt-5.5-fast" }]);
        setSelectedModel("gpt-5.5-fast");
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
        optsByKey.set("openai/gpt-5.5-fast", { providerId: "openai", modelId: "gpt-5.5-fast" });
      }
      const opts = sortModels(Array.from(optsByKey.values()).filter(isAllowedModel));
      if (opts.length === 0) {
        setStatus("connected");
        setMessage("Using the default OpenCode model.");
        setModels([{ providerId: "openai", modelId: "gpt-5.5-fast" }]);
        setSelectedModel("gpt-5.5-fast");
        return;
      }
      setModels(opts);
      if (!selectedModel || !opts.some((m) => m.modelId === selectedModel)) {
        setSelectedModel(opts.find((m) => m.modelId === "gpt-5.5-fast")?.modelId ?? opts[0].modelId);
      }
      setStatus("connected");
    } catch {
      setStatus("error");
      setMessage("Could not refresh models. Using the default OpenCode model.");
      setModels([{ providerId: "openai", modelId: "gpt-5.5-fast" }]);
      setSelectedModel("gpt-5.5-fast");
    }
  };

  useEffect(() => {
    void handleDetect();
  }, []);

  const label = (pid: string): string => {
    const names: Record<string, string> = { opencode: "OpenCode", anthropic: "Anthropic", openai: "OpenAI", ollama: "Ollama" };
    return names[pid] || pid;
  };

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return models;
    return models.filter((model) =>
      model.modelId.toLowerCase().includes(query) || model.providerId.toLowerCase().includes(query)
    );
  }, [models, modelSearch]);
  const groupedModels = groupModels(filteredModels);

  const footer = (
    <>
      <button type="button" onClick={onClose} className="operator-button">
        Cancel
      </button>
      <button
        type="button"
        onClick={() => onSave(url, normalizeModel(selectedModel), variant)}
        disabled={!selectedModel}
        className="operator-button-primary disabled:opacity-40"
      >
        Save model
      </button>
    </>
  );

  return (
    <ModalShell
      title="OpenCode model"
      description="Choose the local AI model Specwright uses for test generation. The recommended setup is already selected."
      icon={<Cpu size={18} weight="duotone" />}
      size="md"
      footer={footer}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
          <div className="space-y-2">
            <label className="operator-control-label">Model</label>
            <input
              type="search"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder="Search models..."
              className="operator-field w-full px-2 py-2"
            />
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="operator-select w-full">
              {filteredModels.length === 0 ? (
                <option value={selectedModel}>{selectedModel || "No matching models"}</option>
              ) : (
                Array.from(groupedModels.entries()).map(([providerId, options]) => (
                  <optgroup key={providerId} label={label(providerId)}>
                    {options.map((model) => (
                      <option key={`${model.providerId}-${model.modelId}`} value={model.modelId}>{model.modelId}</option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
            <div className="flex items-center justify-between gap-2">
              <p className="operator-field-help">
                {status === "detecting" ? "Refreshing available models..." : message ?? "Default: gpt-5.5-fast"}
              </p>
              <button type="button" onClick={handleDetect} disabled={status === "detecting"} className="operator-button-quiet px-2 py-1 disabled:opacity-50">
                Refresh
              </button>
            </div>
          </div>

          <SettingsRow
            title="Selected setup"
            description={`${selectedModel || "No model selected"} / ${variantLabel(variant)}`}
            control={<StatusPill status={status === "connected" ? "success" : status === "error" ? "warning" : "muted"} dot>{statusLabel(status)}</StatusPill>}
          />

          <details className="operator-inline-panel">
            <summary className="operator-control-label cursor-pointer">Connection</summary>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:18789"
              className="operator-field mt-2 w-full px-2 py-2"
            />
            <p className="operator-field-help">Specwright manages this local OpenCode endpoint automatically.</p>
          </details>

          <div>
            <label className="operator-control-label">Reasoning depth</label>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="operator-select w-full"
            >
              <option value="minimal">Quick</option>
              <option value="low">Balanced</option>
              <option value="medium">Careful</option>
              <option value="high">Thorough</option>
              <option value="xhigh">Maximum</option>
            </select>
            <p className="operator-field-help">Higher depth gives Specwright more time to reason before editing tests.</p>
          </div>
    </ModalShell>
  );
}

function statusLabel(status: "idle" | "detecting" | "connected" | "error"): string {
  if (status === "connected") return "Connected";
  if (status === "detecting") return "Checking";
  if (status === "error") return "Using fallback";
  return "Not checked";
}

function variantLabel(variant: string): string {
  const labels: Record<string, string> = {
    minimal: "Quick",
    low: "Balanced",
    medium: "Careful",
    high: "Thorough",
    xhigh: "Maximum",
  };
  return labels[variant] ?? variant;
}
