import React, { useState, useCallback, useEffect, useRef } from "react";
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

const gitlabItemsCache = new Map<string, { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] }>();
const gitlabIssueFileCache = new Map<string, { filePath: string; title: string; updatedAt: string; changed: boolean }>();

function formatGitLabDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sortGitLabItems(items: GitLabItem[]): GitLabItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime || Number(b.iid) - Number(a.iid);
  });
}

function gitlabRecovery(status: string): { message: string; actions: Array<{ label: string; url: string }> } | null {
  const lower = status.toLowerCase();
  if (lower.includes("glab was not found") || lower.includes("not recognized")) {
    return {
      message: "GitLab CLI (glab) is required to list or fetch GitLab issues.",
      actions: [{ label: "Install glab", url: "https://gitlab.com/gitlab-org/cli#installation" }],
    };
  }
  if (lower.includes("authentication") || lower.includes("not authenticated") || lower.includes("401") || lower.includes("403")) {
    return {
      message: "GitLab CLI is installed, but you need to authenticate it for this repo.",
      actions: [{ label: "glab auth login", url: "https://gitlab.com/gitlab-org/cli#authenticate" }],
    };
  }
  if (lower.includes("could not detect gitlab project path") || lower.includes("no repo")) {
    return {
      message: "Open a folder with a GitLab remote, or paste a full GitLab issue URL.",
      actions: [{ label: "GitLab issue URLs", url: "https://docs.gitlab.com/user/project/issues/" }],
    };
  }
  if (lower.includes("404")) {
    return {
      message: "GitLab could not find that issue/work item. Check the project path and issue number.",
      actions: [],
    };
  }
  return null;
}

export default function InstructionCard({ card, index }: Props): React.JSX.Element {
  const { updateCard, removeCard, addStep, removeStep, updateStep, addSubModule, removeSubModule } =
    useInstructionStore();
  const atlassianStatus = usePipelineStore((s) => s.atlassianStatus);
  const setMcpStatus = usePipelineStore((s) => s.setMcpStatus);
  const showJiraSource = useConfigStore((s) => s.envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true");
  const [connecting, setConnecting] = useState(false);
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [loadingGitlabItems, setLoadingGitlabItems] = useState(false);
  const [allGitlabItems, setAllGitlabItems] = useState<GitLabItem[]>([]);
  const [selectedGitlabItem, setSelectedGitlabItem] = useState<GitLabItem | null>(null);
  const [selectingGitlabItem, setSelectingGitlabItem] = useState(false);
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{ markdown: string; images: string[] } | null>(null);
  const preloadingGitlabRefs = useRef(new Set<string>());
  const [gitlabConnection, setGitlabConnection] = useState<{ hasGlab: boolean; authenticated: boolean; repo?: string; username?: string | null; error?: string } | null>(null);
  const [gitlabFilter, setGitlabFilter] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    window.specwright.atlassian.status().then(({ status }) => {
      setMcpStatus("atlassian", status);
    });
    window.specwright.project.getPath().then((projectPath) => {
      if (!projectPath) return;
      window.specwright.project.gitLabStatus(projectPath).then(setGitlabConnection).catch(() => null);
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
    const raw = subModuleInput.trim().replace(/^@+/, "");
    if (raw) {
      const tag = raw.startsWith("@") ? raw : `@${raw}`;
      addSubModule(card.id, tag);
      setSubModuleInput("");
    }
  };

  const hasJira = Boolean(card.jiraURL?.trim());
  const hasFile = Boolean(card.filePath?.trim());
  const assignedGitLabItems = sortGitLabItems(allGitlabItems.filter((item) => item.assignedToMe));
  const otherGitLabItems = sortGitLabItems(allGitlabItems.filter((item) => !item.assignedToMe));
  const visibleGitLabItems = [...assignedGitLabItems, ...otherGitLabItems].filter((item) => {
    const query = gitlabFilter.trim().toLowerCase();
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || item.iid.includes(query) || item.updatedAt?.toLowerCase().includes(query);
  });
  const showGitLabFilter = allGitlabItems.length > 3;
  const visibleGitLabGroups = [
    { label: "Assigned to me", items: visibleGitLabItems.filter((item) => item.assignedToMe) },
    { label: "Project backlog", items: visibleGitLabItems.filter((item) => !item.assignedToMe) },
  ].filter((group) => group.items.length > 0);

  const handleUploadFile = useCallback(async () => {
    const selected = await window.specwright.project.pickFiles();
    if (selected.length > 0) {
      const relativePath = await window.specwright.project.uploadTestFile(selected[0]);
      setSelectedGitlabItem(null);
      update({ filePath: relativePath, jiraURL: "" });
    }
  }, [update]);

  const handleLoadGitLabItems = useCallback(async () => {
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) return;
    const cacheKey = gitlabConnection?.repo ?? projectPath;
    const cached = gitlabItemsCache.get(cacheKey);
    if (cached) {
      setAllGitlabItems(cached.items);
      setGitlabStatus(null);
      return;
    }
    setLoadingGitlabItems(true);
    setGitlabStatus("Loading GitLab issues...");
    try {
      const items = await window.specwright.project.listGitLabItems(projectPath, "project");
      gitlabItemsCache.set(cacheKey, items);
      setAllGitlabItems(items.items);
      const assignedItems = items.items.filter((item) => item.assignedToMe);
      void Promise.allSettled(assignedItems.map(async (item) => {
        if (gitlabIssueFileCache.has(item.ref) || preloadingGitlabRefs.current.has(item.ref)) return;
        preloadingGitlabRefs.current.add(item.ref);
        try {
          const result = await window.specwright.project.fetchGitLabIssue(projectPath, item.ref);
          gitlabIssueFileCache.set(item.ref, result);
        } finally {
          preloadingGitlabRefs.current.delete(item.ref);
        }
      }));
      const suffix = items.errors.length ? ` (${items.errors.join("; ")})` : "";
      if (items.errors.length && items.items.length === 0) {
        setGitlabStatus(items.errors.join("; "));
      } else {
        setGitlabStatus(suffix || null);
      }
    } catch (error) {
      setAllGitlabItems([]);
      setGitlabStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingGitlabItems(false);
    }
  }, [gitlabConnection?.repo]);

  useEffect(() => {
    if (!gitlabConnection?.hasGlab || !gitlabConnection.authenticated || allGitlabItems.length > 0 || loadingGitlabItems) return;
    void handleLoadGitLabItems();
  }, [gitlabConnection, allGitlabItems.length, loadingGitlabItems, handleLoadGitLabItems]);

  const handleSelectGitLabItem = useCallback(async (item: GitLabItem) => {
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) return;
    setSelectingGitlabItem(true);
    setGitlabStatus(null);
    try {
      const cachedResult = gitlabIssueFileCache.get(item.ref);
      const result = cachedResult ?? await window.specwright.project.fetchGitLabIssue(projectPath, item.ref);
      gitlabIssueFileCache.set(item.ref, result);
      setSelectedGitlabItem(item);
      setSourcePreview(null);
      setShowSourcePreview(false);
      update({ filePath: result.filePath, jiraURL: "" });
      setGitlabStatus(result.changed ? "Issue updated since last fetch" : `Fetched: ${result.title}`);
    } catch (error) {
      setGitlabStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSelectingGitlabItem(false);
    }
  }, [update]);

  const handleToggleSourcePreview = useCallback(async () => {
    if (!card.filePath) return;
    const next = !showSourcePreview;
    setShowSourcePreview(next);
    if (!next || sourcePreview) return;
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) return;
    const preview = await window.specwright.project.readGitLabSource(projectPath, card.filePath);
    setSourcePreview(preview);
  }, [card.filePath, showSourcePreview, sourcePreview]);

  return (
    <div className="operator-card operator-form">
      {/* Header */}
      <div className="operator-card-header-compact">
        <span className="operator-label operator-text-accent">
          Instruction {index + 1}
        </span>
        <button
          onClick={() => removeCard(card.id)}
          className="operator-remove-action"
          title="Remove instruction"
        >
          Remove
        </button>
      </div>

      {/* Row: Module name + Category */}
      <div className="operator-fieldset">
        <div>
          <label className="operator-control-label">Module name</label>
          <div className="operator-prefixed-field">
            <span className="operator-field-prefix">@</span>
            <input
              type="text"
              value={card.moduleName.replace(/^@+/, "")}
              onChange={(e) => update({ moduleName: e.target.value.replace(/^@+/, "") })}
              placeholder="MyModule"
              className="operator-field operator-field-prefixed flex-1 px-2 py-2"
            />
          </div>
        </div>
        <div>
          <label className="operator-control-label">Category</label>
          <div className="operator-dropdown" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCategoryOpen(false);
          }}>
            <button
              type="button"
              className="operator-dropdown-trigger"
              data-open={categoryOpen}
              onClick={() => setCategoryOpen((next) => !next)}
            >
              {CATEGORY_OPTIONS.find((option) => option.value === card.category)?.label ?? card.category}
            </button>
            {categoryOpen && (
              <div className="operator-dropdown-menu">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="operator-dropdown-option"
                    data-selected={option.value === card.category}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      update({ category: option.value as ICard["category"] });
                      setCategoryOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row: File name + Page URL */}
      <div className="operator-fieldset">
        <div>
          <label className="operator-control-label">File name</label>
          <input
            type="text"
            value={card.fileName}
            onChange={(e) => update({ fileName: e.target.value })}
            placeholder="my-feature"
            className="operator-field w-full px-2 py-2"
          />
        </div>
        <div>
          <label className="operator-control-label">Page URL</label>
          <input
            type="text"
            value={card.pageURL}
            onChange={(e) => update({ pageURL: e.target.value })}
            placeholder="/dashboard"
            className="operator-field w-full px-2 py-2"
          />
        </div>
      </div>

      {/* Sub-modules */}
      <div>
        <label className="operator-control-label">Sub-modules</label>
        <div className="flex gap-2">
          <div className="operator-prefixed-field flex-1">
            <span className="operator-field-prefix">@</span>
            <input
              type="text"
              value={subModuleInput}
              onChange={(e) => setSubModuleInput(e.target.value.replace(/^@+/, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubModule(); } }}
              placeholder="SubModule (press Enter)"
              className="operator-field operator-field-prefixed flex-1 px-2 py-2"
            />
          </div>
          <button
            onClick={handleAddSubModule}
            className="operator-button operator-button-quiet px-2 py-2"
          >
            Add tag
          </button>
        </div>
        {card.subModules.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {card.subModules.map((tag, i) => (
              <span
                key={i}
                className="operator-badge"
              >
                {tag}
                <button
                  onClick={() => removeSubModule(card.id, i)}
                  className="operator-text-accent hover:text-[var(--sw-danger)] ml-0.5"
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
        <label className="operator-control-label">
          Source file{" "}
          <span className="text-stone-600">
            ({SUPPORTED_FILE_EXTENSIONS.split(",").map(e => e.replace(".", "")).join(", ")})
          </span>
          <span className="text-stone-600 ml-1">— optional</span>
        </label>
        {card.filePath ? (
          <div className="operator-selected-source operator-stack-sm">
            {selectedGitlabItem && (
              <div className="operator-selected-issue">
                <p className="operator-text font-semibold truncate" title={selectedGitlabItem.title}>{selectedGitlabItem.title}</p>
                <div className="operator-selected-meta">
                  <span>Issue {selectedGitlabItem.iid}</span>
                  <span>{selectedGitlabItem.assignedToMe ? "Assigned to me" : "Project backlog"}</span>
                  <span>Updated {formatGitLabDate(selectedGitlabItem.updatedAt) ?? "-"}</span>
                </div>
              </div>
            )}
            <div className="operator-selected-file-row">
              <span className="operator-label">File</span>
              <span className="flex-1 operator-text-muted font-mono truncate" title={card.filePath}>
                {card.filePath.split("/").pop()}
              </span>
              <button
                onClick={() => { setSelectedGitlabItem(null); update({ filePath: "" }); }}
                disabled={hasJira}
                className="operator-selected-remove"
              >
                Clear source
              </button>
              <button
                type="button"
                onClick={handleToggleSourcePreview}
                className="operator-selected-remove"
              >
                {showSourcePreview ? "Hide preview" : "Preview"}
              </button>
            </div>
            {showSourcePreview && sourcePreview && (
              <div className="operator-source-preview">
                <pre>{sourcePreview.markdown.slice(0, 2400)}</pre>
                {sourcePreview.images.length > 0 && (
                  <div className="operator-source-images">
                    {sourcePreview.images.map((src) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer">{src}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleUploadFile}
            disabled={hasJira}
            className="operator-button w-full justify-center border-dashed py-2"
          >
            Upload file
          </button>
        )}
        {hasJira && (
          <p className="operator-text-warning mt-1">Disabled — Jira URL is set. Clear Jira URL to use a file.</p>
        )}
        {!hasJira && !hasFile && (
          <div className="mt-3 space-y-3">
            <div className="operator-source-panel operator-stack-md">
              <div className="operator-gitlab-picker-head">
                <p className="operator-gitlab-picker-title">
                  {allGitlabItems.length > 0
                    ? `${allGitlabItems.length} open GitLab issues in ${gitlabConnection?.repo?.split("/").pop() ?? "repository"}`
                    : "GitLab issues"}
                </p>
                <div className="operator-gitlab-actions">
                  {showGitLabFilter && (
                    <input
                      type="text"
                      value={gitlabFilter}
                      onChange={(e) => setGitlabFilter(e.target.value)}
                      placeholder="Filter issues..."
                      className="operator-field operator-gitlab-filter px-2 py-2"
                    />
                  )}
                  <button
                    onClick={() => handleLoadGitLabItems()}
                    disabled={loadingGitlabItems}
                    className="operator-button px-2 py-2"
                  >
                    {loadingGitlabItems ? "Loading..." : allGitlabItems.length ? "Refresh issue list" : "Load issue list"}
                  </button>
                </div>
              </div>

              <div className="operator-gitlab-context-row">
                <span className="operator-text-subtle truncate">
                  {gitlabConnection?.hasGlab && gitlabConnection.authenticated
                    ? `@${gitlabConnection.username ?? "authenticated"} · ${gitlabConnection.repo ?? "repository"}`
                    : "Select the work item Specwright should turn into tests."}
                </span>
              </div>

              {gitlabConnection && (!gitlabConnection.hasGlab || !gitlabConnection.authenticated) && (
                <div className="operator-warning-panel flex items-center justify-between gap-3">
                  <p className="operator-text-warning">
                    {!gitlabConnection.hasGlab ? "GitLab CLI is not installed." : "GitLab CLI needs authentication."}
                  </p>
                  {!gitlabConnection.hasGlab && (
                    <button type="button" className="operator-button px-2 py-1" onClick={() => window.specwright.shell.openUrl("https://gitlab.com/gitlab-org/cli#installation")}>Install glab</button>
                  )}
                  {gitlabConnection.hasGlab && !gitlabConnection.authenticated && (
                    <button type="button" className="operator-button px-2 py-1" onClick={() => window.specwright.shell.openUrl("https://gitlab.com/gitlab-org/cli#authenticate")}>glab auth login</button>
                  )}
                </div>
              )}

              {gitlabStatus && !gitlabStatus.toLowerCase().includes("fetched:") && (() => {
                const recovery = gitlabRecovery(gitlabStatus);
                if (recovery) {
                  return (
                    <div className="operator-warning-panel operator-stack-sm">
                      <p className="operator-text-warning">{recovery.message}</p>
                      <p className="operator-text-subtle">{gitlabStatus}</p>
                      {recovery.actions.length > 0 && (
                        <div className="flex gap-2">
                          {recovery.actions.map((action) => (
                            <button key={action.label} type="button" onClick={() => window.specwright.shell.openUrl(action.url)} className="operator-button px-2 py-1 text-[10px]">
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                if (gitlabStatus.startsWith("Loaded ")) return null;
                return <p className="operator-text-subtle">{gitlabStatus}</p>;
              })()}

              {allGitlabItems.length > 0 && (
                <div className="max-h-80 overflow-y-auto scrollable operator-list">
                  {visibleGitLabItems.length === 0 ? (
                    <p className="operator-text-subtle px-3 py-3">No matching issues. Try Project backlog.</p>
                  ) : visibleGitLabGroups.map((group) => {
                    const isAssignedGroup = group.label === "Assigned to me";
                    return (
                    <div key={group.label} className="operator-gitlab-group">
                      <div className={`operator-list-header operator-gitlab-group-header ${isAssignedGroup ? "operator-list-header-accent" : ""}`}>
                        <span>{group.label} · {group.items.length}</span>
                      </div>
                      {group.items.map((item) => (
                        <button
                          key={`${item.kind}-${item.iid}`}
                          onClick={() => handleSelectGitLabItem(item)}
                          disabled={selectingGitlabItem}
                          className={`operator-list-item operator-gitlab-item ${isAssignedGroup ? "operator-list-item-accent" : ""}`}
                        >
                          <span className="operator-gitlab-id">#{item.iid}</span>
                          <span className="operator-gitlab-row-main">
                            <span className="operator-text truncate font-semibold text-left">{item.title}</span>
                            <span className="operator-text-subtle text-right">{formatGitLabDate(item.updatedAt) ?? "-"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {gitlabStatus && (() => {
              const suppressStaleGlabError = gitlabConnection?.hasGlab && gitlabConnection.authenticated && gitlabStatus.toLowerCase().includes("glab was not found");
              if (suppressStaleGlabError || !gitlabStatus.toLowerCase().includes("fetched:")) return null;
              const recovery = gitlabRecovery(gitlabStatus);
              if (!recovery) return <p className="operator-muted text-[10px]">{gitlabStatus}</p>;
              return (
                <div className="operator-inline-card operator-stack-sm">
                  <p className="text-[var(--sw-warning)] text-xs">{recovery.message}</p>
                  <p className="operator-muted text-[10px]">{gitlabStatus}</p>
                  {recovery.actions.length > 0 && (
                    <div className="flex gap-2">
                      {recovery.actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => window.specwright.shell.openUrl(action.url)}
                          className="operator-button px-2 py-1 text-[10px]"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Jira URL */}
      {showJiraSource && <div>
        <label className="operator-control-label">
          Jira URL <span className="operator-muted">— optional</span>
        </label>
        <input
          type="text"
          value={card.jiraURL}
          onChange={(e) => update({ jiraURL: e.target.value, filePath: "" })}
          placeholder="https://jira.example.com/browse/PROJ-123"
          disabled={hasFile}
          className="operator-field w-full px-2 py-2 disabled:opacity-40"
        />
        {hasFile && (
          <p className="text-amber-500 text-[10px] mt-1">Disabled — file path is set. Clear file path to use Jira.</p>
        )}
        {hasJira && !hasFile && (
          <div className="flex items-center gap-2 mt-1.5">
            {atlassianStatus === "connected" && (
              <>
                <span className="flex items-center gap-1 text-[var(--sw-success)] text-[10px]">
                  <span className="operator-status-dot bg-[var(--sw-success)]" />
                  Atlassian connected
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="operator-muted hover:text-[var(--sw-accent)] disabled:opacity-40 text-[10px] transition-colors"
                >
                  {connecting ? "Connecting…" : "Reconnect"}
                </button>
              </>
            )}
            {atlassianStatus === "failed" && (
              <>
                <span className="flex items-center gap-1 operator-danger text-[10px]">
                  <span className="operator-status-dot bg-[var(--sw-danger)]" />
                  Connection failed
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="operator-button px-2 py-1 text-[10px]"
                >
                  {connecting ? "Connecting…" : "Retry"}
                </button>
              </>
            )}
            {(atlassianStatus === "idle" || atlassianStatus === "needs-auth") && (
              <>
                <span className="flex items-center gap-1 operator-danger text-[10px]">
                  <span className="operator-status-dot bg-[var(--sw-danger)]" />
                  {atlassianStatus === "needs-auth" ? "Auth required" : "Not connected"}
                </span>
                <button
                  onClick={handleAtlassianConnect}
                  disabled={connecting}
                  className="operator-button px-2 py-1 text-[10px]"
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
          <label className="operator-control-label">
            Instructions <span className="operator-muted">— optional, supplements file or Jira input</span>
          </label>
          <button
            onClick={() => addStep(card.id)}
            className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
          >
            + add step
          </button>
        </div>
        <div className="space-y-2">
          {card.steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-slate-600 text-xs w-4 text-right flex-shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(card.id, i, e.target.value)}
                placeholder={`Step ${i + 1} description…`}
                className="operator-field flex-1 px-2 py-2"
              />
              {card.steps.length > 1 && (
                <button
                  onClick={() => removeStep(card.id, i)}
                  className="operator-muted hover:text-[var(--sw-danger)] text-xs transition-colors flex-shrink-0"
                >
                  Remove
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
                className="operator-toggle"
                data-active={active}
              >
                <span className="operator-toggle-knob" />
              </button>
              <span className="text-stone-300 text-[13px]">{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
