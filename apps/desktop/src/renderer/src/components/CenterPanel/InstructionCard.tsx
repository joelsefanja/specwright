import React, { useState, useCallback, useEffect, useRef } from "react";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore, type InstructionCard as ICard } from "@renderer/store/instruction.store";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import { collapsePresenceVariants, modalVariants, motionTransition, presenceTransition, presenceVariants } from "@renderer/motion/presets";
import gitlabLogo from "../../assets/gitlab-logo.png";

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
const gitlabIssueFetchCache = new Map<string, Promise<{ filePath: string; title: string; updatedAt: string; changed: boolean }>>();

function gitlabIssueStorageKey(ref: string): string {
  return `specwright.gitlab.issue.${ref}`;
}

function readCachedGitLabIssue(ref: string): { filePath: string; title: string; updatedAt: string; changed: boolean } | null {
  try {
    const raw = window.localStorage.getItem(gitlabIssueStorageKey(ref));
    return raw ? JSON.parse(raw) as { filePath: string; title: string; updatedAt: string; changed: boolean } : null;
  } catch {
    return null;
  }
}

function writeCachedGitLabIssue(ref: string, result: { filePath: string; title: string; updatedAt: string; changed: boolean }): void {
  gitlabIssueFileCache.set(ref, result);
  void idbSet(gitlabIssueStorageKey(ref), result);
  try {
    window.localStorage.setItem(gitlabIssueStorageKey(ref), JSON.stringify(result));
  } catch {
    // localStorage can be full or disabled; in-memory cache still works for this session.
  }
}

function gitlabItemsStorageKey(projectPath: string): string {
  return `specwright.gitlab.items.${projectPath}`;
}

function readCachedGitLabItems(projectPath: string): { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] } | null {
  try {
    const raw = window.localStorage.getItem(gitlabItemsStorageKey(projectPath));
    return raw ? JSON.parse(raw) as { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] } : null;
  } catch {
    return null;
  }
}

function writeCachedGitLabItems(projectPath: string, result: { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] }): void {
  gitlabItemsCache.set(result.repo ?? projectPath, result);
  void idbSet(gitlabItemsStorageKey(projectPath), result);
  try {
    window.localStorage.setItem(gitlabItemsStorageKey(projectPath), JSON.stringify(result));
  } catch {
    // localStorage can be full or disabled; in-memory cache still works for this session.
  }
}

function prefetchGitLabIssue(projectPath: string, item: GitLabItem, preloadingRefs: React.MutableRefObject<Set<string>>): void {
  if (gitlabIssueFileCache.has(item.ref) || readCachedGitLabIssue(item.ref) || preloadingRefs.current.has(item.ref)) return;
  preloadingRefs.current.add(item.ref);
  void fetchGitLabIssueCached(projectPath, item.ref).finally(() => preloadingRefs.current.delete(item.ref));
}

function fetchGitLabIssueCached(projectPath: string, ref: string): Promise<{ filePath: string; title: string; updatedAt: string; changed: boolean }> {
  const memory = gitlabIssueFileCache.get(ref);
  if (memory) return Promise.resolve(memory);
  const persisted = readCachedGitLabIssue(ref);
  if (persisted) {
    gitlabIssueFileCache.set(ref, persisted);
    return Promise.resolve(persisted);
  }
  const inflight = gitlabIssueFetchCache.get(ref);
  if (inflight) return inflight;
  const request = window.specwright.project.fetchGitLabIssue(projectPath, ref)
    .then((result) => {
      writeCachedGitLabIssue(ref, result);
      return result;
    })
    .finally(() => gitlabIssueFetchCache.delete(ref));
  gitlabIssueFetchCache.set(ref, request);
  return request;
}

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
  const lower = cleanErrorMessage(status).toLowerCase();
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

function cleanErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ENOENT") || message.toLowerCase().includes("no such file or directory");
}

export default function InstructionCard({ card, index }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const { updateCard, removeCard, addStep, removeStep, updateStep, addSubModule, removeSubModule } =
    useInstructionStore();
  const atlassianStatus = usePipelineStore((s) => s.atlassianStatus);
  const setMcpStatus = usePipelineStore((s) => s.setMcpStatus);
  const projectPath = useConfigStore((s) => s.projectPath);
  const showJiraSource = useConfigStore((s) => s.envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true");
  const [connecting, setConnecting] = useState(false);
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [loadingGitlabItems, setLoadingGitlabItems] = useState(false);
  const [allGitlabItems, setAllGitlabItems] = useState<GitLabItem[]>([]);
  const [selectedGitlabItem, setSelectedGitlabItem] = useState<GitLabItem | null>(null);
  const [selectingGitlabItem, setSelectingGitlabItem] = useState(false);
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{ markdown: string; images: string[] } | null>(null);
  const [copiedError, setCopiedError] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const preloadingGitlabRefs = useRef(new Set<string>());
  const [gitlabConnection, setGitlabConnection] = useState<{ hasGlab: boolean; authenticated: boolean; repo?: string; username?: string | null; error?: string } | null>(null);
  const [gitlabFilter, setGitlabFilter] = useState("");
  const [gitlabManualRef, setGitlabManualRef] = useState("");
  const [gitlabPickerOpen, setGitlabPickerOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const selectedSourceRef = useRef<HTMLDivElement | null>(null);
  const sourcePreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectPath || allGitlabItems.length > 0) return;
    const cached = readCachedGitLabItems(projectPath);
    if (cached) {
      setGitlabConnection((current) => current ?? { hasGlab: true, authenticated: true, repo: cached.repo, username: cached.username });
      setAllGitlabItems(cached.items);
      if (cached.items.length > 0) setGitlabPickerOpen(true);
      queryClient.setQueryData(["gitlab-items", projectPath], cached);
      return;
    }
    void idbGet(gitlabItemsStorageKey(projectPath)).then((persisted) => {
      if (!persisted || allGitlabItems.length > 0) return;
      const items = persisted as { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] };
      setGitlabConnection((current) => current ?? { hasGlab: true, authenticated: true, repo: items.repo, username: items.username });
      setAllGitlabItems(items.items);
      if (items.items.length > 0) setGitlabPickerOpen(true);
      queryClient.setQueryData(["gitlab-items", projectPath], items);
    });
  }, [allGitlabItems.length, projectPath, queryClient]);

  useEffect(() => {
    window.specwright.atlassian.status().then(({ status }) => {
      setMcpStatus("atlassian", status);
    });
    if (projectPath) {
      window.specwright.project.gitLabStatus(projectPath).then(setGitlabConnection).catch(() => null);
    }
  }, [projectPath, setMcpStatus]);

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
  const hasContext = hasFile || hasJira || card.steps.some((step) => step.trim());
  const gitlabRepoLabel = gitlabConnection?.repo ?? "repository";
  const visibleGitLabGroups = [
    { label: "My issues", items: visibleGitLabItems.filter((item) => item.assignedToMe) },
    { label: "Backlog", items: visibleGitLabItems.filter((item) => !item.assignedToMe) },
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
      writeCachedGitLabItems(projectPath, items);
      queryClient.setQueryData(["gitlab-items", projectPath], items);
      setAllGitlabItems(items.items);
      if (items.items.length > 0) setGitlabPickerOpen(true);
      items.items.forEach((item) => prefetchGitLabIssue(projectPath, item, preloadingGitlabRefs));
      const suffix = items.errors.length ? ` (${items.errors.join("; ")})` : "";
      if (items.errors.length && items.items.length === 0) {
        setGitlabStatus(items.errors.join("; "));
      } else {
        setGitlabStatus(suffix || null);
      }
    } catch (error) {
      setAllGitlabItems([]);
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoadingGitlabItems(false);
    }
  }, [gitlabConnection?.repo, projectPath]);

  useEffect(() => {
    if (!gitlabConnection?.hasGlab || !gitlabConnection.authenticated || allGitlabItems.length > 0 || loadingGitlabItems) return;
    void handleLoadGitLabItems();
  }, [gitlabConnection, allGitlabItems.length, loadingGitlabItems, handleLoadGitLabItems]);

  const handleSelectGitLabItem = useCallback(async (item: GitLabItem) => {
    if (!projectPath) return;
    setSelectedGitlabItem(item);
    setGitlabPickerOpen(false);
    setSourcePreview(null);
    setShowSourcePreview(false);
    setSelectingGitlabItem(true);
    setGitlabStatus(null);
    setCopiedError(false);
    try {
      const result = await fetchGitLabIssueCached(projectPath, item.ref);
      queryClient.setQueryData(["gitlab-issue", projectPath, item.ref], result);
      update({ filePath: result.filePath, jiraURL: "" });
      const preview = await window.specwright.project.readGitLabSource(projectPath, result.filePath);
      setSourcePreview(preview);
      setShowSourcePreview(true);
      setGitlabStatus(null);
      window.setTimeout(() => selectedSourceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (error) {
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSelectingGitlabItem(false);
    }
  }, [projectPath, queryClient, update]);

  const handleFetchGitLabRef = useCallback(async () => {
    if (!projectPath) return;
    const ref = gitlabManualRef.trim();
    if (!ref) {
      setGitlabStatus("Paste a GitLab issue URL, project#issue, or issue number first.");
      return;
    }
    setSelectedGitlabItem(null);
    setGitlabPickerOpen(false);
    setSourcePreview(null);
    setShowSourcePreview(false);
    setSelectingGitlabItem(true);
    setGitlabStatus("Fetching GitLab issue...");
    setCopiedError(false);
    try {
      const result = await fetchGitLabIssueCached(projectPath, ref);
      queryClient.setQueryData(["gitlab-issue", projectPath, ref], result);
      update({ filePath: result.filePath, jiraURL: "" });
      const preview = await window.specwright.project.readGitLabSource(projectPath, result.filePath);
      setSourcePreview(preview);
      setShowSourcePreview(true);
      setGitlabManualRef("");
      setGitlabStatus(null);
      window.setTimeout(() => selectedSourceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (error) {
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSelectingGitlabItem(false);
    }
  }, [gitlabManualRef, projectPath, queryClient, update]);

  const copyError = useCallback((message: string) => {
    void navigator.clipboard.writeText(message).then(() => {
      setCopiedError(true);
      window.setTimeout(() => setCopiedError(false), 2000);
    });
  }, []);

  const handleToggleSourcePreview = useCallback(async () => {
    if (!card.filePath) return;
    const next = !showSourcePreview;
    setShowSourcePreview(next);
    if (!next || sourcePreview) return;
    if (!projectPath) return;
    try {
      const preview = await window.specwright.project.readGitLabSource(projectPath, card.filePath);
      setSourcePreview(preview);
      return;
    } catch (error) {
      if (!isMissingFileError(error) || !selectedGitlabItem) {
        setShowSourcePreview(false);
        setGitlabStatus(isMissingFileError(error)
          ? "Source file is missing. Fetch or select the GitLab issue again to recreate it."
          : cleanErrorMessage(error instanceof Error ? error.message : String(error)));
        return;
      }
    }

    try {
      const result = await fetchGitLabIssueCached(projectPath, selectedGitlabItem.ref);
      queryClient.setQueryData(["gitlab-issue", projectPath, selectedGitlabItem.ref], result);
      update({ filePath: result.filePath, jiraURL: "" });
      const preview = await window.specwright.project.readGitLabSource(projectPath, result.filePath);
      setSourcePreview(preview);
      setGitlabStatus(`Fetched: ${result.title}`);
    } catch (error) {
      setShowSourcePreview(false);
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [card.filePath, projectPath, queryClient, selectedGitlabItem, showSourcePreview, sourcePreview, update]);

  useEffect(() => {
    if (!showSourcePreview || !sourcePreview) return;
    window.setTimeout(() => sourcePreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [showSourcePreview, sourcePreview]);

  return (
    <div className="operator-card operator-form operator-instruction-card">
      {/* Header */}
      <div className="operator-card-header-compact">
        <span>
          <span className="operator-label operator-text-accent block">Brief {index + 1}</span>
          <span className={hasContext ? "operator-brief-status-ready" : "operator-brief-status-missing"}>
            {hasContext ? "Context added" : "Add one context source"}
          </span>
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
          <div className="operator-prefixed-select operator-dropdown" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCategoryOpen(false);
          }}>
            <span className="operator-field-prefix">@</span>
            <button
              type="button"
              className="operator-dropdown-trigger operator-dropdown-trigger-prefixed"
              data-open={categoryOpen}
              onClick={() => setCategoryOpen((next) => !next)}
            >
              {(CATEGORY_OPTIONS.find((option) => option.value === card.category)?.label ?? card.category).replace(/^@+/, "")}
            </button>
            <AnimatePresence initial={false}>
            {categoryOpen && (
              <motion.div className="operator-dropdown-menu" variants={collapsePresenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
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
                    {option.label.replace(/^@+/, "")}
                  </button>
                ))}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Row: File name + Page URL */}
      <div className="operator-fieldset">
        <div>
          <label className="operator-control-label">Output file</label>
          <input
            type="text"
            value={card.fileName}
            onChange={(e) => update({ fileName: e.target.value })}
            placeholder="my-feature"
            className="operator-field w-full px-2 py-2"
          />
          <p className="operator-field-help">Saved as <span className="operator-extension-pill">.feature</span>; step definitions are generated next to it.</p>
        </div>
        <div>
          <label className="operator-control-label">App route</label>
          <div className="operator-prefixed-field">
            <span className="operator-field-prefix">/</span>
            <input
              type="text"
              value={(card.pageURL ?? "").replace(/^\/+/, "")}
              onChange={(e) => update({ pageURL: `/${e.target.value.replace(/^\/+/, "")}` })}
              placeholder="dashboard"
              className="operator-field operator-field-prefixed flex-1 px-2 py-2"
            />
          </div>
          <p className="operator-field-help">Relative to Website to test / BASE_URL. Use only the route Specwright should open first.</p>
        </div>
      </div>

      {/* Sub-modules */}
      <div>
        <label className="operator-control-label">Tags</label>
        <div className="flex gap-2">
          <div className="operator-prefixed-field flex-1">
            <span className="operator-field-prefix">@</span>
            <input
              type="text"
              value={subModuleInput}
              onChange={(e) => setSubModuleInput(e.target.value.replace(/^@+/, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubModule(); } }}
              placeholder="SubModule"
              className="operator-field operator-field-prefixed flex-1 px-2 py-2"
            />
            <span className="operator-field-suffix">ENTER</span>
          </div>
          <button
            onClick={handleAddSubModule}
            className="operator-button operator-button-quiet px-2 py-2"
          >
            Add tag
          </button>
        </div>
        <AnimatePresence initial={false}>
        {card.subModules.length > 0 && (
          <motion.div className="flex flex-wrap gap-1 mt-2" variants={presenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
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
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Test Cases Source File */}
      <div>
        <label className="operator-control-label">
          Context source{" "}
          <span className="text-stone-600">
            ({SUPPORTED_FILE_EXTENSIONS.split(",").map(e => e.replace(".", "")).join(", ")})
          </span>
          <span className="text-stone-600 ml-1">— optional</span>
        </label>
        <p className="operator-field-help mt-1 mb-2">
          Upload a file or select a GitLab issue with the requirements, notes, or acceptance criteria Specwright should turn into test scenarios.
        </p>
        {card.filePath || selectedGitlabItem ? (
          <div ref={selectedSourceRef} className="operator-selected-source">
            {selectedGitlabItem && (
              <div className="operator-selected-issue">
                <p className="operator-text font-semibold truncate" title={selectedGitlabItem.title}>{selectedGitlabItem.title}</p>
                <div className="operator-selected-meta">
                  <span>#{selectedGitlabItem.iid}</span>
                  <span>Updated {formatGitLabDate(selectedGitlabItem.updatedAt) ?? "-"}</span>
                </div>
              </div>
            )}
            <div className="operator-selected-file-row">
              <span className="operator-label">File</span>
              <span className="operator-selected-file-name operator-text-muted font-mono truncate" title={card.filePath}>
                {card.filePath ? card.filePath.split("/").pop() : "Fetching issue content..."}
              </span>
              <span className="operator-selected-actions">
                <button
                  onClick={() => { setSelectedGitlabItem(null); update({ filePath: "" }); }}
                  disabled={hasJira}
                  className="operator-selected-action operator-selected-action-danger"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleToggleSourcePreview}
                  disabled={!card.filePath}
                  className="operator-selected-action operator-selected-action-primary"
                >
                  {showSourcePreview ? "Hide" : "Preview"}
                </button>
              </span>
            </div>
            <AnimatePresence initial={false}>
            {showSourcePreview && sourcePreview && (
              <motion.div ref={sourcePreviewRef} className="operator-source-preview" variants={collapsePresenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
                <pre>{sourcePreview.markdown.slice(0, 2400)}</pre>
                {sourcePreview.images.length > 0 && (
                  <div className="operator-source-images">
                    {sourcePreview.images.map((src) => (
                      <button key={src} type="button" onClick={() => setPreviewImage(src)}>
                        <img src={src} alt="GitLab issue attachment" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
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
          <p className="operator-field-help mt-1">Disabled because Jira URL is set. Clear Jira URL to use a file.</p>
        )}
        {!hasJira && !hasFile && (
          <div className="mt-3 space-y-3">
            <div className="operator-source-panel operator-stack-md">
              <div className="operator-gitlab-picker-head">
                  <p className="operator-gitlab-picker-title">
                    <img src={gitlabLogo} alt="GitLab" className="operator-gitlab-logo" />
                    {allGitlabItems.length > 0
                    ? `${allGitlabItems.length} open GitLab issues · ${gitlabRepoLabel}`
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
                    type="button"
                    onClick={() => setGitlabPickerOpen((open) => !open)}
                    disabled={loadingGitlabItems || allGitlabItems.length === 0}
                    className="operator-button px-2 py-2"
                  >
                    {gitlabPickerOpen ? "Close issues" : loadingGitlabItems ? "Loading issues" : "Choose issue"}
                  </button>
                  <button
                    onClick={() => handleLoadGitLabItems()}
                    disabled={loadingGitlabItems}
                    className="operator-button-secondary px-2 py-2"
                  >
                    {loadingGitlabItems ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              {(!gitlabConnection?.hasGlab || !gitlabConnection.authenticated) && (
                <p className="operator-text-subtle">Select the work item Specwright should turn into tests.</p>
              )}

              <div className="operator-gitlab-manual-row">
                <input
                  type="text"
                  value={gitlabManualRef}
                  onChange={(e) => setGitlabManualRef(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleFetchGitLabRef(); } }}
                  placeholder="Paste GitLab issue URL, project#123, or 123"
                  className="operator-field px-2 py-2"
                  disabled={selectingGitlabItem}
                />
                <button
                  type="button"
                  onClick={() => void handleFetchGitLabRef()}
                  disabled={selectingGitlabItem || !projectPath}
                  className="operator-button px-2 py-2"
                >
                  {selectingGitlabItem ? "Fetching..." : "Fetch issue"}
                </button>
              </div>

              {gitlabConnection && (!gitlabConnection.hasGlab || !gitlabConnection.authenticated) && (
                <div className="operator-warning-panel flex items-center justify-between gap-3">
                  <p className="operator-danger">
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

              {gitlabStatus && !loadingGitlabItems && !gitlabStatus.toLowerCase().includes("fetched:") && (() => {
                const recovery = gitlabRecovery(gitlabStatus);
                if (recovery) {
                  const cleanStatus = cleanErrorMessage(gitlabStatus);
                  return (
                    <div className="operator-warning-panel operator-stack-sm">
                      <p className="operator-danger">{recovery.message}</p>
                      <p className="operator-text-subtle select-text">{cleanStatus}</p>
                      {(recovery.actions.length > 0 || cleanStatus) && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => copyError(cleanStatus)} className="operator-button px-2 py-1 text-[10px]">
                            {copiedError ? "Copied" : "Copy error"}
                          </button>
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
                return (
                  <div className="operator-stack-sm">
                    <p className="operator-text-subtle select-text">{cleanErrorMessage(gitlabStatus)}</p>
                    <button type="button" onClick={() => copyError(cleanErrorMessage(gitlabStatus))} className="operator-button px-2 py-1 text-[10px] self-start">
                      {copiedError ? "Copied" : "Copy error"}
                    </button>
                  </div>
                );
              })()}

              {loadingGitlabItems && (
                <p className="operator-text-subtle">Loading GitLab issues for {gitlabRepoLabel}...</p>
              )}

              <AnimatePresence initial={false}>
              {gitlabPickerOpen && allGitlabItems.length > 0 && (
                <motion.div
                  className="max-h-80 overflow-y-auto scrollable operator-list"
                  variants={collapsePresenceVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={presenceTransition}
                >
                  {visibleGitLabItems.length === 0 ? (
                    <p className="operator-text-subtle px-3 py-3">No matching issues. Try Project backlog.</p>
                  ) : visibleGitLabGroups.map((group) => {
                    const isAssignedGroup = group.label === "My issues";
                    return (
                    <div key={group.label} className="operator-gitlab-group">
                      <div className={`operator-list-header operator-gitlab-group-header ${isAssignedGroup ? "operator-list-header-accent" : ""}`}>
                        <span>{group.label} · {group.items.length}</span>
                      </div>
                      {group.items.map((item) => (
                        <button
                          key={`${item.kind}-${item.iid}`}
                          onClick={() => handleSelectGitLabItem(item)}
                          onMouseEnter={() => projectPath && prefetchGitLabIssue(projectPath, item, preloadingGitlabRefs)}
                          disabled={selectingGitlabItem}
                          className={`operator-list-item operator-gitlab-item ${isAssignedGroup ? "operator-list-item-accent" : ""}`}
                        >
                          <span className="operator-gitlab-row-main">
                            <span className="operator-text truncate font-semibold text-left">
                              <span className="operator-gitlab-id">#{item.iid}</span>
                              <span className="operator-gitlab-separator"> · </span>
                              {item.title}
                            </span>
                            <span className="operator-text-subtle text-right">{formatGitLabDate(item.updatedAt) ?? "-"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    );
                  })}
                </motion.div>
              )}
              </AnimatePresence>
            </div>

            {gitlabStatus && (() => {
              const suppressStaleGlabError = gitlabConnection?.hasGlab && gitlabConnection.authenticated && gitlabStatus.toLowerCase().includes("glab was not found");
              if (suppressStaleGlabError || !gitlabStatus.toLowerCase().includes("fetched:")) return null;
              const recovery = gitlabRecovery(gitlabStatus);
              if (!recovery) return <p className="operator-muted text-[10px] select-text">{cleanErrorMessage(gitlabStatus)}</p>;
              const cleanStatus = cleanErrorMessage(gitlabStatus);
              return (
                <div className="operator-inline-card operator-stack-sm">
                  <p className="operator-danger text-xs">{recovery.message}</p>
                  <p className="operator-muted text-[10px] select-text">{cleanStatus}</p>
                  {(recovery.actions.length > 0 || cleanStatus) && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyError(cleanStatus)}
                        className="operator-button px-2 py-1 text-[10px]"
                      >
                        {copiedError ? "Copied" : "Copy error"}
                      </button>
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
        <Dialog.Root open={Boolean(previewImage)} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="operator-image-modal-backdrop" />
            <Dialog.Content className="operator-image-modal">
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={motionTransition}
            >
              <Dialog.Title className="sr-only">GitLab image preview</Dialog.Title>
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={5}
                wheel={{ disabled: true }}
                doubleClick={{ mode: "zoomIn" }}
                centerOnInit
              >
                {({ zoomIn, zoomOut, resetTransform }) => (
                  <>
                    <div className="operator-image-modal-header">
                      <span>
                        <span className="operator-label operator-text-accent block">Image preview</span>
                        <span className="operator-field-help">Ctrl + wheel to zoom. Drag to pan.</span>
                      </span>
                      <span className="operator-image-modal-actions">
                        <button type="button" className="operator-button px-2 py-1" onClick={() => zoomOut()}>-</button>
                        <button type="button" className="operator-button px-2 py-1" onClick={() => resetTransform()}>Reset</button>
                        <button type="button" className="operator-button px-2 py-1" onClick={() => zoomIn()}>+</button>
                        <Dialog.Close asChild>
                          <button type="button" className="operator-button px-2 py-1">Close</button>
                        </Dialog.Close>
                      </span>
                    </div>
                    <div
                      className="operator-image-transform-shell"
                      onWheel={(event) => {
                        if (!(event.ctrlKey || event.metaKey)) return;
                        event.preventDefault();
                        if (event.deltaY < 0) zoomIn(0.25);
                        else zoomOut(0.25);
                      }}
                    >
                      <TransformComponent wrapperClass="operator-image-transform" contentClass="operator-image-transform-content">
                        <img src={previewImage} alt="GitLab issue attachment preview" />
                      </TransformComponent>
                    </div>
                  </>
                )}
              </TransformWrapper>
            </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
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
          <p className="operator-field-help mt-1">Disabled because file path is set. Clear file path to use Jira.</p>
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
            Extra guidance instructions <span className="operator-muted">— optional</span>
          </label>
          <button
            onClick={() => addStep(card.id)}
            className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
          >
            + add step
          </button>
        </div>
        <p className="operator-field-help mb-2">
          Optional because Specwright can generate from the selected GitLab issue or source file. Add steps only when you need to clarify scope, data, constraints, or expected behavior.
        </p>
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
      <div className="operator-option-group">
        <div>
          <p className="operator-control-label">Generation options</p>
          <p className="operator-text-subtle">Control what Specwright does after reading this instruction.</p>
        </div>
        {(
          [
            { key: "explore", label: "Explore app first", description: "Open the page and inspect selectors before generating tests." },
            ...(card.explore ? [{ key: "runExploredCases", label: "Run exploration checks", description: "Execute the temporary checks created during exploration." }] : []),
            { key: "runGeneratedCases", label: "Run generated tests", description: "Execute the final Playwright BDD tests after generation." },
            { key: "autoApprove", label: "Auto-approve this instruction", description: "Let the agent proceed without asking for each step." },
          ] as { key: keyof typeof card; label: string; description: string }[]
        ).map(({ key, label, description }) => {
          const active = card[key] as boolean;
          return (
            <label key={key} className="operator-option-row cursor-pointer select-none">
              <span className="min-w-0">
                <span className="operator-text block font-medium">{label}</span>
                <span className="operator-text-subtle block">{description}</span>
              </span>
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
            </label>
          );
        })}
      </div>
    </div>
  );
}
