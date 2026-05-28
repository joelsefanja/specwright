import React, { useState, useCallback, useEffect } from "react";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore, type InstructionCard as ICard } from "@renderer/store/instruction.store";
import { usePipelineStore } from "@renderer/store/pipeline.store";

interface Props {
  card: ICard;
  index: number;
}

const SUPPORTED_FILE_EXTENSIONS = ".xlsx,.xls,.csv,.doc,.docx,.pdf,.txt,.md,.json";

const CATEGORY_OPTIONS = [
  { value: "@Modules", label: "@Modules" },
  { value: "@Workflows", label: "@Workflows" },
] as const;

export default function InstructionCard({ card, index }: Props): React.JSX.Element {
  const { updateCard, removeCard, addStep, removeStep, updateStep, addSubModule, removeSubModule } =
    useInstructionStore();
  const atlassianStatus = usePipelineStore((s) => s.atlassianStatus);
  const setMcpStatus = usePipelineStore((s) => s.setMcpStatus);
  const showJiraSource = useConfigStore((s) => s.envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true");
  const [connecting, setConnecting] = useState(false);
  const [gitlabIssueRef, setGitlabIssueRef] = useState("");
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [fetchingGitlab, setFetchingGitlab] = useState(false);
  const [loadingGitlabItems, setLoadingGitlabItems] = useState(false);
  const [gitlabItems, setGitlabItems] = useState<GitLabItem[]>([]);

  useEffect(() => {
    window.specwright.atlassian.status().then(({ status }) => {
      setMcpStatus("atlassian", status);
    });
  }, [setMcpStatus]);

  const handleAtlassianConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await window.specwright.atlassian.connect();
      setMcpStatus("atlassian", result.success ? "connected" : "failed");
    } catch {
      setMcpStatus("atlassian", "failed");
    } finally {
      setConnecting(false);
    }
  }, [setMcpStatus]);

  const [subModuleInput, setSubModuleInput] = useState("");

  const update = (patch: Partial<ICard>): void => updateCard(card.id, patch);

  const handleAddSubModule = (): void => {
    const raw = subModuleInput.trim();
    if (raw) {
      const tag = raw.startsWith("@") ? raw : `@${raw}`;
      addSubModule(card.id, tag);
      setSubModuleInput("");
    }
  };

  const hasJira = Boolean(card.jiraURL?.trim());
  const hasFile = Boolean(card.filePath?.trim());
  const assignedGitLabItems = gitlabItems.filter((item) => item.assignedToMe);
  const otherGitLabItems = gitlabItems.filter((item) => !item.assignedToMe);

  const handleUploadFile = useCallback(async () => {
    const selected = await window.specwright.project.pickFiles();
    if (selected.length > 0) {
      const relativePath = await window.specwright.project.uploadTestFile(selected[0]);
      update({ filePath: relativePath, jiraURL: "" });
    }
  }, [update]);

  const handleFetchGitLabIssue = useCallback(async () => {
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath || !gitlabIssueRef.trim()) return;
    setFetchingGitlab(true);
    setGitlabStatus(null);
    try {
      const result = await window.specwright.project.fetchGitLabIssue(projectPath, gitlabIssueRef.trim());
      update({ filePath: result.filePath, jiraURL: "" });
      setGitlabStatus(result.changed ? "Issue updated since last fetch" : `Fetched: ${result.title}`);
    } catch (error) {
      setGitlabStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingGitlab(false);
    }
  }, [gitlabIssueRef, update]);

  const handleLoadGitLabItems = useCallback(async () => {
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) return;
    setLoadingGitlabItems(true);
    setGitlabStatus(null);
    try {
      const items = await window.specwright.project.listGitLabItems(projectPath);
      setGitlabItems(items.items);
      const suffix = items.errors.length ? ` (${items.errors.join("; ")})` : "";
      const userLabel = items.username ? ` for @${items.username}` : "";
      setGitlabStatus(items.items.length ? `Loaded ${items.items.length} GitLab items from ${items.repo}${userLabel}${suffix}` : `No GitLab items found for ${items.repo}${suffix}`);
    } catch (error) {
      setGitlabStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingGitlabItems(false);
    }
  }, []);

  const handleSelectGitLabItem = useCallback(async (item: GitLabItem) => {
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) return;
    setFetchingGitlab(true);
    setGitlabStatus(null);
    try {
      const result = await window.specwright.project.fetchGitLabIssue(projectPath, item.ref);
      update({ filePath: result.filePath, jiraURL: "" });
      setGitlabStatus(result.changed ? "Issue updated since last fetch" : `Fetched: ${result.title}`);
    } catch (error) {
      setGitlabStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setFetchingGitlab(false);
    }
  }, [update]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-brand-400 text-xs font-semibold uppercase tracking-wider">
          Instruction {index + 1}
        </span>
        <button
          onClick={() => removeCard(card.id)}
          className="text-slate-600 hover:text-red-400 transition-colors text-base leading-none"
          title="Remove instruction"
        >
          ✕
        </button>
      </div>

      {/* Row: Module name + Category */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-slate-400 text-xs mb-1">Module name</label>
          <div className="flex items-center">
            <span className="text-slate-500 text-xs pr-1">@</span>
            <input
              type="text"
              value={card.moduleName}
              onChange={(e) => update({ moduleName: e.target.value })}
              placeholder="MyModule"
              className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Category</label>
          <select
            value={card.category}
            onChange={(e) => update({ category: e.target.value as ICard["category"] })}
            className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row: File name + Page URL */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-slate-400 text-xs mb-1">File name</label>
          <input
            type="text"
            value={card.fileName}
            onChange={(e) => update({ fileName: e.target.value })}
            placeholder="my-feature"
            className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Page URL</label>
          <input
            type="text"
            value={card.pageURL}
            onChange={(e) => update({ pageURL: e.target.value })}
            placeholder="/dashboard"
            className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
          />
        </div>
      </div>

      {/* Sub-modules */}
      <div>
        <label className="block text-slate-400 text-xs mb-1">Sub-modules</label>
        <div className="flex gap-2">
          <div className="flex items-center flex-1">
            <span className="text-slate-500 text-xs pr-1">@</span>
            <input
              type="text"
              value={subModuleInput}
              onChange={(e) => setSubModuleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubModule(); } }}
              placeholder="SubModule (press Enter)"
              className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
            />
          </div>
          <button
            onClick={handleAddSubModule}
            className="bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded px-2 py-1.5 transition-colors"
          >
            + tag
          </button>
        </div>
        {card.subModules.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {card.subModules.map((tag, i) => (
              <span
                key={i}
                className="flex items-center gap-1 bg-brand-900/40 text-brand-300 text-xs rounded px-2 py-0.5 border border-brand-800"
              >
                {tag}
                <button
                  onClick={() => removeSubModule(card.id, i)}
                  className="text-brand-500 hover:text-red-400 ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Test Cases Source File */}
      <div>
        <label className="block text-slate-400 text-xs mb-1">
          Source file{" "}
          <span className="text-slate-600">
            ({SUPPORTED_FILE_EXTENSIONS.split(",").map(e => e.replace(".", "")).join(", ")})
          </span>
          <span className="text-slate-600 ml-1">— optional</span>
        </label>
        {card.filePath ? (
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <span className="text-slate-500 text-xs">📄</span>
            <span className="flex-1 text-slate-300 text-xs font-mono truncate" title={card.filePath}>
              {card.filePath.split("/").pop()}
            </span>
            <button
              onClick={() => update({ filePath: "" })}
              disabled={hasJira}
              className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={handleUploadFile}
            disabled={hasJira}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm border border-dashed border-slate-600 hover:border-slate-500 disabled:opacity-40 rounded-lg px-3 py-2 w-full justify-center transition-colors"
          >
            <span className="text-base leading-none">📁</span>
            Upload file
          </button>
        )}
        {hasJira && (
          <p className="text-amber-500 text-[10px] mt-1">Disabled — Jira URL is set. Clear Jira URL to use a file.</p>
        )}
        {!hasJira && !hasFile && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={gitlabIssueRef}
                onChange={(e) => setGitlabIssueRef(e.target.value)}
                placeholder="GitLab issue URL, group/project#123, or 123"
                className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
              />
              <button
                onClick={handleFetchGitLabIssue}
                disabled={fetchingGitlab || !gitlabIssueRef.trim()}
                className="text-xs px-2 py-1.5 rounded bg-slate-700 border border-slate-600 hover:border-brand-500 text-slate-300 disabled:opacity-40"
              >
                {fetchingGitlab ? "..." : "Fetch GitLab"}
              </button>
              <button
                onClick={handleLoadGitLabItems}
                disabled={loadingGitlabItems}
                className="text-xs px-2 py-1.5 rounded bg-slate-700 border border-slate-600 hover:border-brand-500 text-slate-300 disabled:opacity-40"
              >
                {loadingGitlabItems ? "..." : "List"}
              </button>
            </div>
            {gitlabItems.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded border border-slate-700 bg-slate-900/60">
                {assignedGitLabItems.length > 0 && (
                  <div>
                    <div className="px-2 py-1 bg-brand-950/70 border-b border-brand-800 text-brand-300 text-[10px] font-semibold uppercase tracking-wide">
                      My assigned items
                    </div>
                    {assignedGitLabItems.map((item) => (
                      <button
                        key={`${item.kind}-${item.iid}`}
                        onClick={() => handleSelectGitLabItem(item)}
                        className="block w-full text-left px-2 py-1.5 hover:bg-brand-950/50 border-b border-slate-800 border-l-2 border-l-brand-500"
                      >
                        <span className="text-brand-300 text-[10px] uppercase mr-1">{item.kind === "work_item" ? "WI" : "ISS"} #{item.iid}</span>
                        <span className="text-slate-100 text-xs">{item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {otherGitLabItems.length > 0 && (
                  <div>
                    <div className="px-2 py-1 bg-slate-800/80 border-b border-slate-700 text-slate-400 text-[10px] font-semibold uppercase tracking-wide">
                      Other project items
                    </div>
                    {otherGitLabItems.map((item) => (
                      <button
                        key={`${item.kind}-${item.iid}`}
                        onClick={() => handleSelectGitLabItem(item)}
                        className="block w-full text-left px-2 py-1.5 hover:bg-slate-800 border-b border-slate-800 last:border-b-0"
                      >
                        <span className="text-slate-400 text-[10px] uppercase mr-1">{item.kind === "work_item" ? "WI" : "ISS"} #{item.iid}</span>
                        <span className="text-slate-200 text-xs">{item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {gitlabStatus && <p className="text-slate-500 text-[10px]">{gitlabStatus}</p>}
          </div>
        )}
      </div>

      {/* Jira URL */}
      {showJiraSource && <div>
        <label className="block text-slate-400 text-xs mb-1">
          Jira URL <span className="text-slate-600">— optional</span>
        </label>
        <input
          type="text"
          value={card.jiraURL}
          onChange={(e) => update({ jiraURL: e.target.value, filePath: "" })}
          placeholder="https://jira.example.com/browse/PROJ-123"
          disabled={hasFile}
          className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600 disabled:opacity-40"
        />
        {hasFile && (
          <p className="text-amber-500 text-[10px] mt-1">Disabled — file path is set. Clear file path to use Jira.</p>
        )}
        {hasJira && !hasFile && (
          <div className="flex items-center gap-2 mt-1.5">
            {atlassianStatus === "connected" && (
              <>
                <span className="flex items-center gap-1 text-green-400 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Atlassian connected
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="text-slate-500 hover:text-blue-400 disabled:text-slate-700 text-[10px] transition-colors"
                >
                  {connecting ? "Connecting…" : "Reconnect"}
                </button>
              </>
            )}
            {atlassianStatus === "failed" && (
              <>
                <span className="flex items-center gap-1 text-red-400 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  Connection failed
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="text-blue-400 hover:text-blue-300 disabled:text-slate-600 text-[10px] border border-blue-800 hover:border-blue-600 disabled:border-slate-700 rounded px-1.5 py-0.5 transition-colors"
                >
                  {connecting ? "Connecting…" : "Retry"}
                </button>
              </>
            )}
            {(atlassianStatus === "idle" || atlassianStatus === "needs-auth") && (
              <>
                <span className="flex items-center gap-1 text-red-400 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  {atlassianStatus === "needs-auth" ? "Auth required" : "Not connected"}
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="text-blue-400 hover:text-blue-300 disabled:text-slate-600 text-[10px] border border-blue-800 hover:border-blue-600 disabled:border-slate-700 rounded px-1.5 py-0.5 transition-colors"
                >
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              </>
            )}
          </div>
        )}
      </div>}

      {/* Steps / Instructions */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-slate-400 text-xs">
            Instructions <span className="text-slate-600">— optional, supplements file or Jira input</span>
          </label>
          <button
            onClick={() => addStep(card.id)}
            className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
          >
            + add step
          </button>
        </div>
        <div className="space-y-1.5">
          {card.steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-slate-600 text-xs w-4 text-right flex-shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(card.id, i, e.target.value)}
                placeholder={`Step ${i + 1} description…`}
                className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
              />
              {card.steps.length > 1 && (
                <button
                  onClick={() => removeStep(card.id, i)}
                  className="text-slate-600 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {(
          [
            { key: "explore", label: "Explore" },
            ...(card.explore ? [{ key: "runExploredCases", label: "Validate Exploration" }] : []),
            { key: "runGeneratedCases", label: "Validate Generated" },
            { key: "autoApprove", label: "Auto Approve" },
          ] as { key: keyof typeof card; label: string }[]
        ).map(({ key, label }) => {
          const active = card[key] as boolean;
          return (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => update({ [key]: !active })}
                className={`relative inline-flex w-8 h-4 flex-shrink-0 rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                  active ? "bg-brand-500 border-brand-500" : "bg-slate-600 border-slate-600"
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 rounded-full bg-white shadow transform transition-transform duration-200 ${
                    active ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-slate-300 text-xs">{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
