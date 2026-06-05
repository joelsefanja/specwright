import React, { useState, useCallback, useEffect, useRef } from "react";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Eraser, PencilLine, Plus, X } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore, type InstructionCard as ICard } from "@renderer/store/instruction.store";
import { useLanguageStore } from "@renderer/i18n/localeStore";
import { collapsePresenceVariants, presenceTransition } from "@renderer/motion/presets";
import gitlabLogo from "../../../assets/gitlab-logo.png";
import { Button, ModalShell, StatusPill } from "../../ui";
import { GenerationOptions, type GenerationOptionKey } from "./GenerationOptions";
import { InstructionCardHeader } from "./InstructionCardHeader";
import { InstructionTags } from "./InstructionTags";
import { SelectedSourcePanel } from "./SelectedSourcePanel";
import { SourceOptionPicker } from "./SourceOptionPicker";

interface Props {
  card: ICard;
  index: number;
}

type SourcePreviewResult = { markdown: string; images: string[]; missing?: boolean };
type GitLabItemMode = "assigned" | "project";

const gitlabIssueViewTransition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};
const gitlabIssueViewVariants = {
  initial: { opacity: 0, y: -6, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -4, height: 0 },
};

const CATEGORY_OPTIONS = [
  { value: "@Modules", label: "@Modules" },
  { value: "@Workflows", label: "@Workflows" },
] as const;

const gitlabItemsCache = new Map<string, { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] }>();
const gitlabIssueFileCache = new Map<string, { filePath: string; title: string; updatedAt: string; changed: boolean }>();
const gitlabIssueFetchCache = new Map<string, Promise<{ filePath: string; title: string; updatedAt: string; changed: boolean }>>();
const sourcePreviewCache = new Map<string, SourcePreviewResult>();

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

function gitlabItemsStorageKey(projectPath: string, mode: GitLabItemMode): string {
  return `specwright.gitlab.items.${mode}.${projectPath}`;
}

function readCachedGitLabItems(projectPath: string, mode: GitLabItemMode): { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] } | null {
  try {
    const raw = window.localStorage.getItem(gitlabItemsStorageKey(projectPath, mode));
    return raw ? JSON.parse(raw) as { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] } : null;
  } catch {
    return null;
  }
}

function gitlabItemsMemoryKey(projectPath: string, mode: GitLabItemMode, repo?: string): string {
  return `${repo ?? projectPath}:${mode}`;
}

function writeCachedGitLabItems(projectPath: string, mode: GitLabItemMode, result: { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] }): void {
  gitlabItemsCache.set(gitlabItemsMemoryKey(projectPath, mode, result.repo), result);
  void idbSet(gitlabItemsStorageKey(projectPath, mode), result);
  try {
    window.localStorage.setItem(gitlabItemsStorageKey(projectPath, mode), JSON.stringify(result));
  } catch {
    // localStorage can be full or disabled; in-memory cache still works for this session.
  }
}

function prefetchGitLabIssue(projectPath: string, item: GitLabItem, preloadingRefs: React.MutableRefObject<Set<string>>): void {
  if (preloadingRefs.current.has(item.ref)) return;
  preloadingRefs.current.add(item.ref);
  void fetchGitLabSourcePreviewCached(projectPath, item.ref).finally(() => preloadingRefs.current.delete(item.ref));
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

async function fetchGitLabSourcePreviewCached(projectPath: string, ref: string): Promise<{ issue: { filePath: string; title: string; updatedAt: string; changed: boolean }; preview: SourcePreviewResult }> {
  const issue = await fetchGitLabIssueCached(projectPath, ref);
  const cacheKey = `${projectPath}:${ref}:${issue.filePath}`;
  const cached = sourcePreviewCache.get(cacheKey);
  if (cached) return { issue, preview: cached };
  const preview = await window.specwright.project.readGitLabSource(projectPath, issue.filePath);
  sourcePreviewCache.set(cacheKey, preview);
  return { issue, preview };
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

function createGitLabSource(item: GitLabItem, issue: { filePath: string; title: string; updatedAt: string }, repo?: string): ICard["gitlabSource"] {
  return {
    filePath: issue.filePath,
    iid: item.iid,
    ref: item.ref,
    repo,
    title: item.title || issue.title,
    updatedAt: item.updatedAt || issue.updatedAt,
  };
}

function gitlabRecovery(status: string, copy: InstructionCopy): { message: string; actions: Array<{ label: string; url: string }> } | null {
  const lower = cleanErrorMessage(status).toLowerCase();
  if (lower.includes("glab was not found") || lower.includes("not recognized")) {
    return {
      message: copy.gitlabCliRequired,
      actions: [{ label: copy.installGlab, url: "https://gitlab.com/gitlab-org/cli#installation" }],
    };
  }
  if (lower.includes("authentication") || lower.includes("not authenticated") || lower.includes("401") || lower.includes("403")) {
    return {
      message: copy.gitlabAuthRequired,
      actions: [{ label: "glab auth login", url: "https://gitlab.com/gitlab-org/cli#authenticate" }],
    };
  }
  if (lower.includes("could not detect gitlab project path") || lower.includes("no repo")) {
    return {
      message: copy.gitlabRepoMissing,
      actions: [{ label: "GitLab issue URLs", url: "https://docs.gitlab.com/user/project/issues/" }],
    };
  }
  if (lower.includes("404")) {
    return {
      message: copy.gitlabItemNotFound,
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
  const language = useLanguageStore((state) => state.language);
  const copy = language === "nl" ? instructionCopy.nl : instructionCopy.en;
  const { updateCard, removeCard, addStep, removeStep, updateStep, addSubModule, removeSubModule } =
    useInstructionStore();
  const projectPath = useConfigStore((s) => s.projectPath);
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [loadingGitlabItems, setLoadingGitlabItems] = useState(false);
  const [allGitlabItems, setAllGitlabItems] = useState<GitLabItem[]>([]);
  const [selectedGitlabItem, setSelectedGitlabItem] = useState<GitLabItem | null>(card.gitlabSource ? {
    kind: "issue",
    iid: card.gitlabSource.iid,
    title: card.gitlabSource.title,
    updatedAt: card.gitlabSource.updatedAt,
    ref: card.gitlabSource.ref,
  } : null);
  const [selectingGitlabItem, setSelectingGitlabItem] = useState(false);
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<SourcePreviewResult | null>(null);
  const [copiedError, setCopiedError] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const preloadingGitlabRefs = useRef(new Set<string>());
  const [gitlabConnection, setGitlabConnection] = useState<{ hasGlab: boolean; authenticated: boolean; repo?: string; username?: string | null; error?: string } | null>(null);
  const [gitlabFilter, setGitlabFilter] = useState("");
  const [gitlabPickerOpen, setGitlabPickerOpen] = useState(false);
  const [gitlabItemMode, setGitlabItemMode] = useState<GitLabItemMode>("assigned");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"brief" | "file" | "gitlab">(card.gitlabSource ? "gitlab" : card.filePath ? "file" : "gitlab");
  const selectedSourceRef = useRef<HTMLDivElement | null>(null);
  const sourcePreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectPath || allGitlabItems.length > 0) return;
    const cached = readCachedGitLabItems(projectPath, gitlabItemMode);
    if (cached) {
      setGitlabConnection((current) => current ?? { hasGlab: true, authenticated: true, repo: cached.repo, username: cached.username });
      setAllGitlabItems(cached.items);
      if (cached.items.length > 0) setGitlabPickerOpen(true);
      queryClient.setQueryData(["gitlab-items", projectPath, gitlabItemMode], cached);
      return;
    }
    void idbGet(gitlabItemsStorageKey(projectPath, gitlabItemMode)).then((persisted) => {
      if (!persisted || allGitlabItems.length > 0) return;
      const items = persisted as { repo: string; username?: string | null; items: GitLabItem[]; errors: string[] };
      setGitlabConnection((current) => current ?? { hasGlab: true, authenticated: true, repo: items.repo, username: items.username });
      setAllGitlabItems(items.items);
      if (items.items.length > 0) setGitlabPickerOpen(true);
      queryClient.setQueryData(["gitlab-items", projectPath, gitlabItemMode], items);
    });
  }, [allGitlabItems.length, gitlabItemMode, projectPath, queryClient]);

  useEffect(() => {
    if (projectPath) {
      window.specwright.project.gitLabStatus(projectPath).then(setGitlabConnection).catch(() => null);
    }
  }, [projectPath]);

  const [subModuleInput, setSubModuleInput] = useState("");

  const update = (patch: Partial<ICard>): void => updateCard(card.id, patch);

  const onRemoveCard = (): void => {
    removeCard(card.id);
  };

  const onToggleGenerationOption = (key: GenerationOptionKey, active: boolean): void => {
    update({ [key]: !active });
  };

  const onAddSubModule = (): void => {
    const raw = subModuleInput.trim().replace(/^@+/, "");
    if (raw) {
      const tag = raw.startsWith("@") ? raw : `@${raw}`;
      addSubModule(card.id, tag);
      setSubModuleInput("");
    }
  };

  const hasFile = Boolean(card.filePath?.trim());
  const assignedGitLabItems = sortGitLabItems(allGitlabItems.filter((item) => item.assignedToMe));
  const otherGitLabItems = sortGitLabItems(allGitlabItems.filter((item) => !item.assignedToMe));
  const visibleGitLabItems = [...assignedGitLabItems, ...otherGitLabItems].filter((item) => {
    const query = gitlabFilter.trim().toLowerCase();
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || item.iid.includes(query) || item.updatedAt?.toLowerCase().includes(query);
  });
  const showGitLabFilter = allGitlabItems.length > 3;
  const hasContext = hasFile || card.steps.some((step) => step.trim());
  const gitlabRepoLabel = gitlabConnection?.repo ?? "repository";
  const gitlabCanLoadIssues = Boolean(gitlabConnection?.hasGlab && gitlabConnection.authenticated);
  const gitlabFlowStep = selectedGitlabItem ? 3 : allGitlabItems.length > 0 ? 2 : gitlabCanLoadIssues ? 1 : 0;
  const visibleGitLabGroups = [
    { label: copy.assignedGitlabIssues, items: visibleGitLabItems.filter((item) => item.assignedToMe) },
    { label: copy.backlogGitlabIssues, items: visibleGitLabItems.filter((item) => !item.assignedToMe) },
  ].filter((group) => group.items.length > 0);
  const suggestedTags = buildSuggestedTags(card).filter((tag) => !card.subModules.includes(tag));
  const fetchedSourceStatus = `${copy.fetchedSourcePrefix}:`;

  useEffect(() => {
    const automaticTags = buildAutomaticTags(card).filter((tag) => !card.subModules.includes(tag));
    if (automaticTags.length === 0) return;
    update({ subModules: [...card.subModules, ...automaticTags] });
  }, [card.category, card.subModules]);

  const onAddSuggestedTag = (tag: string): void => {
    addSubModule(card.id, tag);
  };

  const handleUploadFile = useCallback(async () => {
    const selected = await window.specwright.project.pickFiles();
    if (selected.length > 0) {
      const relativePath = await window.specwright.project.uploadTestFile(selected[0]);
      setSelectedGitlabItem(null);
      update({ filePath: relativePath, gitlabSource: undefined });
    }
  }, [update]);

  const handleSelectSourceMode = (mode: "brief" | "file" | "gitlab"): void => {
    setSourceMode(mode);
    if (mode === "brief") {
      setSelectedGitlabItem(null);
      setSourcePreview(null);
      setShowSourcePreview(false);
      update({ filePath: "", gitlabSource: undefined });
      return;
    }
    if (mode === "file") {
      void handleUploadFile();
      return;
    }
    setSelectedGitlabItem(null);
    setSourcePreview(null);
    setShowSourcePreview(false);
    update({ filePath: "", gitlabSource: undefined });
    setGitlabPickerOpen(true);
    if (gitlabCanLoadIssues && allGitlabItems.length === 0 && !loadingGitlabItems) void handleLoadGitLabItems();
  };

  const handleLoadGitLabItems = useCallback(async (mode: GitLabItemMode = gitlabItemMode) => {
    if (!projectPath) return;
    const cacheKey = gitlabItemsMemoryKey(projectPath, mode, gitlabConnection?.repo);
    const cached = gitlabItemsCache.get(cacheKey);
    if (cached) {
      setAllGitlabItems(cached.items);
      setGitlabStatus(null);
      setGitlabItemMode(mode);
      return;
    }
    setGitlabItemMode(mode);
    setLoadingGitlabItems(true);
      setGitlabStatus(copy.loadingIssuesStatus);
    try {
      const items = await window.specwright.project.listGitLabItems(projectPath, mode);
      gitlabItemsCache.set(cacheKey, items);
      writeCachedGitLabItems(projectPath, mode, items);
      queryClient.setQueryData(["gitlab-items", projectPath, mode], items);
      setAllGitlabItems(items.items);
      if (items.items.length > 0) setGitlabPickerOpen(true);
      window.setTimeout(() => {
        sortGitLabItems(items.items).slice(0, 2).forEach((item) => prefetchGitLabIssue(projectPath, item, preloadingGitlabRefs));
      }, 250);
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
  }, [copy.loadingIssuesStatus, gitlabConnection?.repo, gitlabItemMode, projectPath, queryClient]);

  const handleShowProjectGitLabItems = (): void => {
    setAllGitlabItems([]);
    setGitlabFilter("");
    void handleLoadGitLabItems("project");
  };

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
      const { issue: result, preview: cachedPreview } = await fetchGitLabSourcePreviewCached(projectPath, item.ref);
      queryClient.setQueryData(["gitlab-issue", projectPath, item.ref], result);
      update({ filePath: result.filePath, gitlabSource: createGitLabSource(item, result, gitlabConnection?.repo) });
      let preview = cachedPreview;
      if (preview.missing) {
        const refreshed = await window.specwright.project.fetchGitLabIssue(projectPath, item.ref);
        writeCachedGitLabIssue(item.ref, refreshed);
        queryClient.setQueryData(["gitlab-issue", projectPath, item.ref], refreshed);
        update({ filePath: refreshed.filePath, gitlabSource: createGitLabSource(item, refreshed, gitlabConnection?.repo) });
        preview = await window.specwright.project.readGitLabSource(projectPath, refreshed.filePath);
        sourcePreviewCache.set(`${projectPath}:${item.ref}:${refreshed.filePath}`, preview);
      }
      if (preview.missing) {
        setShowSourcePreview(false);
        setGitlabStatus(copy.sourceMissing);
        return;
      }
      setSourcePreview(preview);
      setShowSourcePreview(true);
      setGitlabStatus(null);
      window.setTimeout(() => selectedSourceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (error) {
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSelectingGitlabItem(false);
    }
  }, [copy.sourceMissing, gitlabConnection?.repo, projectPath, queryClient, update]);

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
      const gitlabRef = selectedGitlabItem?.ref ?? card.gitlabSource?.ref;
      const preview = gitlabRef ? (await fetchGitLabSourcePreviewCached(projectPath, gitlabRef)).preview : await window.specwright.project.readGitLabSource(projectPath, card.filePath);
      if (preview.missing) {
        setShowSourcePreview(false);
        setGitlabStatus(copy.sourceMissing);
        return;
      }
      setSourcePreview(preview);
      return;
    } catch (error) {
      const gitlabRef = selectedGitlabItem?.ref ?? card.gitlabSource?.ref;
      if (!isMissingFileError(error) || !gitlabRef) {
        setShowSourcePreview(false);
        setGitlabStatus(isMissingFileError(error)
          ? copy.sourceMissing
          : cleanErrorMessage(error instanceof Error ? error.message : String(error)));
        return;
      }
    }

    try {
      const gitlabRef = selectedGitlabItem?.ref ?? card.gitlabSource?.ref;
      if (!gitlabRef) return;
      const result = await window.specwright.project.fetchGitLabIssue(projectPath, gitlabRef);
      writeCachedGitLabIssue(gitlabRef, result);
      queryClient.setQueryData(["gitlab-issue", projectPath, gitlabRef], result);
      update({ filePath: result.filePath, gitlabSource: card.gitlabSource ? { ...card.gitlabSource, filePath: result.filePath, title: card.gitlabSource.title || result.title, updatedAt: card.gitlabSource.updatedAt || result.updatedAt } : undefined });
      const preview = await window.specwright.project.readGitLabSource(projectPath, result.filePath);
      if (preview.missing) {
        setShowSourcePreview(false);
        setGitlabStatus(copy.sourceMissing);
        return;
      }
      setSourcePreview(preview);
      setGitlabStatus(`${fetchedSourceStatus} ${result.title}`);
    } catch (error) {
      setShowSourcePreview(false);
      setGitlabStatus(cleanErrorMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [card.filePath, card.gitlabSource, copy.sourceMissing, fetchedSourceStatus, projectPath, queryClient, selectedGitlabItem, showSourcePreview, sourcePreview, update]);

  useEffect(() => {
    if (!showSourcePreview || !sourcePreview) return;
    window.setTimeout(() => sourcePreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [showSourcePreview, sourcePreview]);

  return (
    <div className="operator-card operator-form operator-instruction-card">
      {/* Header */}
      <InstructionCardHeader
        briefNumber={index + 1}
        hasContext={hasContext}
        onRemove={onRemoveCard}
        labels={{ title: copy.headerTitle, ready: copy.headerReady, missing: copy.headerMissing, remove: copy.removeBrief }}
      />

      <div className="operator-config-section operator-brief-intro text-sm leading-6 text-operator-muted">
        <p className="operator-section-title mb-2">{copy.briefTitle}</p>
        <p>{copy.briefHelp}</p>
      </div>

      <div className="operator-config-section operator-guided-panel">
        <div className="flex items-center justify-between mb-1">
          <label className="operator-control-label">
            {copy.stepsLabel}
          </label>
          <button
            onClick={() => addStep(card.id)}
            className="operator-button gap-2 px-2 py-1 text-xs"
          >
            <Plus size={13} weight="bold" />
            {copy.addStep}
          </button>
        </div>
        <p className="operator-field-help mb-2">
          {copy.stepsHelp}
        </p>
        <div className="operator-step-list">
          {card.steps.map((step, i) => (
            <div key={i} className="operator-step-input-row">
              <span className="operator-step-input-index">{i + 1}</span>
              <div className="operator-step-input-body">
                <label className="operator-step-input-label" htmlFor={`step-${card.id}-${i}`}>{copy.stepLabel(i + 1)}</label>
                <textarea
                  id={`step-${card.id}-${i}`}
                  value={step}
                  onChange={(e) => updateStep(card.id, i, e.target.value)}
                  placeholder={copy.stepPlaceholder(i + 1)}
                  className="operator-field operator-step-input resize-y px-3 py-3"
                  rows={2}
                />
              </div>
              {card.steps.length > 1 && (
                <button
                  onClick={() => removeStep(card.id, i)}
                  className="operator-button operator-step-remove gap-1 px-2 py-1 text-xs flex-shrink-0"
                >
                  <X size={12} weight="bold" />
                  {copy.removeStep}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <details className="operator-config-section operator-advanced-disclosure">
        <summary className="cursor-pointer list-none operator-section-title">{copy.advancedTestDetails}</summary>
        <p className="operator-field-help operator-advanced-disclosure-intro">{copy.advancedTestDetailsHelp}</p>

        <div className="operator-advanced-group">
          <p className="operator-advanced-group-title">{copy.storageGroupTitle}</p>
          <div className="operator-fieldset">
            <div>
              <label className="operator-control-label" htmlFor={`area-${card.id}`}>{copy.areaLabel}</label>
              <div className="operator-prefixed-field">
                <span className="operator-field-prefix">@</span>
                <input
                  id={`area-${card.id}`}
                  aria-label={copy.areaLabel}
                  type="text"
                  value={card.moduleName.replace(/^@+/, "")}
                  onChange={(e) => update({ moduleName: e.target.value.replace(/^@+/, "") })}
                  placeholder={copy.areaPlaceholder}
                  className="operator-field operator-field-prefixed flex-1 px-2 py-2"
                />
              </div>
              <p className="operator-field-help">{copy.areaHelp}</p>
            </div>
            <div>
              <label className="operator-control-label" htmlFor={`start-route-${card.id}`}>{copy.startRouteLabel}</label>
              <div className="operator-prefixed-field">
                <span className="operator-field-prefix">/</span>
                <input
                  id={`start-route-${card.id}`}
                  aria-label={copy.startRouteLabel}
                  type="text"
                  value={displayStartRoute(card.pageURL ?? "")}
                  onChange={(e) => update({ pageURL: normalizeStartRoute(e.target.value) })}
                  placeholder={copy.startRoutePlaceholder}
                  className="operator-field operator-field-prefixed flex-1 px-2 py-2"
                />
              </div>
              <p className="operator-field-help">{copy.startRouteHelp}</p>
            </div>
          </div>
        </div>

        <div className="operator-advanced-group">
          <p className="operator-advanced-group-title">{copy.structureGroupTitle}</p>
          <div className="operator-fieldset">
            <div>
              <label className="operator-control-label">{copy.testTypeLabel}</label>
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
                  {categoryLabel(card.category, copy)}
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
                          {categoryLabel(option.value, copy)}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <p className="operator-field-help">{card.category === "@Modules" ? copy.moduleHelp : copy.workflowHelp}</p>
            </div>
            <div>
              <label className="operator-control-label">{copy.fileNameLabel}</label>
              <input
                type="text"
                value={card.fileName}
                onChange={(e) => update({ fileName: e.target.value })}
                placeholder={copy.fileNamePlaceholder}
                className="operator-field w-full px-2 py-2"
              />
              <p className="operator-field-help">{copy.fileNameHelp} <span className="operator-extension-pill">.feature</span></p>
            </div>
          </div>
        </div>

        <div className="operator-advanced-group">
          <p className="operator-advanced-group-title">{copy.labelsGroupTitle}</p>
          <InstructionTags
            inputValue={subModuleInput}
            tags={card.subModules}
            suggestions={suggestedTags}
            onInputChange={setSubModuleInput}
            onAddTag={onAddSubModule}
            onAddSuggestedTag={onAddSuggestedTag}
            onRemoveTag={(tagIndex) => removeSubModule(card.id, tagIndex)}
            labels={{ title: copy.tagsLabel, help: copy.tagsHelp, placeholder: copy.tagsPlaceholder, add: copy.addTag, enter: "ENTER", suggestions: copy.suggestedTags }}
            guidance={copy.tagsGuidance}
            explanations={card.category === "@Workflows" ? [
              { tag: "@0-Precondition", text: copy.preconditionTagHelp },
              { tag: "@1-Verify", text: copy.verifyTagHelp },
            ] : []}
          />
        </div>
      </details>

      {/* Test Cases Source File */}
      <div className="operator-config-section operator-source-choice-section">
        <label className="operator-control-label">
          {copy.sourceLabel}
        </label>
        <p className="operator-field-help mt-1 mb-2">
          {copy.sourceHelp}
        </p>
        <SourceOptionPicker
          active={selectedGitlabItem || card.gitlabSource ? "gitlab" : hasFile ? "file" : sourceMode}
          labels={{ ownTitle: copy.ownBriefTitle, ownHelp: copy.ownBriefHelp, ownAction: copy.ownBriefAction, fileTitle: copy.fileSourceTitle, fileHelp: copy.fileSourceHelp, fileAction: copy.fileSourceAction, gitlabTitle: copy.gitlabSourceTitle, gitlabHelp: copy.gitlabSourceHelp, gitlabAction: copy.gitlabSourceAction }}
          onSelect={handleSelectSourceMode}
        />
        {card.filePath || selectedGitlabItem || card.gitlabSource ? (
          <div ref={selectedSourceRef}>
            <SelectedSourcePanel
              filePath={card.filePath}
              fetchingLabel={copy.fetchingSource}
              fileLabel={copy.fileLabel}
              clearLabel={copy.clearSource}
              hidePreviewLabel={copy.hidePreview}
              previewLabel={copy.previewSource}
              previewUnavailableLabel={copy.previewUnavailable}
              repoLabel={gitlabRepoLabel}
              selectedIssue={selectedGitlabItem ?? card.gitlabSource ?? null}
              showPreview={showSourcePreview}
              updatedLabel={copy.updatedLabel}
              formatDate={formatGitLabDate}
              onClear={() => { setSourceMode("brief"); setSelectedGitlabItem(null); setSourcePreview(null); setShowSourcePreview(false); update({ filePath: "", gitlabSource: undefined }); }}
              onTogglePreview={handleToggleSourcePreview}
            >
            <AnimatePresence initial={false}>
            {showSourcePreview && sourcePreview && (
              <motion.div ref={sourcePreviewRef} className="operator-source-preview" variants={collapsePresenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
                <SourcePreview markdown={sourcePreview.markdown} images={sourcePreview.images} onOpenImage={setPreviewImage} onEditImage={setEditingImage} copy={copy} />
              </motion.div>
            )}
            </AnimatePresence>
            </SelectedSourcePanel>
          </div>
        ) : sourceMode === "file" ? (
          <button
            onClick={handleUploadFile}
            className="operator-button w-full justify-center border-dashed py-2"
          >
            {copy.uploadFile}
          </button>
        ) : null}
        {sourceMode === "gitlab" && !hasFile && (
          <div className="mt-3 space-y-3">
              <div className="operator-source-panel operator-stack-md" data-gitlab-step={gitlabFlowStep}>
                <div className="operator-gitlab-picker-head">
                  <div className="min-w-0">
                    <p className="operator-gitlab-picker-title">
                      <img src={gitlabLogo} alt="GitLab" className="operator-gitlab-logo" />
                      {copy.gitlabFlowTitle}
                    </p>
                    <p className="operator-text-subtle mt-1">
                      {selectedGitlabItem
                        ? copy.gitlabFlowSelected(selectedGitlabItem.iid)
                        : allGitlabItems.length > 0
                          ? copy.gitlabFlowChoose(allGitlabItems.length, gitlabRepoLabel)
                          : gitlabCanLoadIssues
                            ? copy.gitlabFlowReady(gitlabRepoLabel)
                            : copy.gitlabFlowConnect}
                    </p>
                  </div>
                <div className="operator-gitlab-actions">
                  {showGitLabFilter && (
                    <input
                      type="text"
                      value={gitlabFilter}
                      onChange={(e) => setGitlabFilter(e.target.value)}
                      placeholder={copy.filterIssues}
                      className="operator-field operator-gitlab-filter px-2 py-2"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setGitlabPickerOpen((open) => !open)}
                    disabled={loadingGitlabItems || allGitlabItems.length === 0}
                    className="operator-button px-2 py-2"
                  >
                    {gitlabPickerOpen ? copy.closeIssues : loadingGitlabItems ? copy.loadingIssues : copy.chooseIssue}
                  </button>
                  {gitlabItemMode === "assigned" && gitlabCanLoadIssues && (
                    <button
                      type="button"
                      onClick={handleShowProjectGitLabItems}
                      disabled={loadingGitlabItems}
                      className="operator-button px-2 py-2"
                    >
                      {copy.viewAllGitlabIssues}
                    </button>
                  )}
                </div>
                </div>
                {!loadingGitlabItems && allGitlabItems.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="operator-field-help m-0">{gitlabCanLoadIssues ? (gitlabItemMode === "assigned" ? copy.noAssignedGitlabIssues : copy.noGitlabIssuesLoaded) : copy.gitlabFlowConnect}</p>
                    {gitlabCanLoadIssues && (
                      <button type="button" className="operator-button px-2 py-1 text-[10px]" onClick={() => void handleLoadGitLabItems()}>
                        {copy.refreshIssues}
                      </button>
                    )}
                  </div>
                )}

                <div className="operator-gitlab-flow" aria-label={copy.gitlabFlowTitle}>
                  <span data-state={gitlabCanLoadIssues ? "done" : "active"}><strong>1</strong>{copy.gitlabFlowConnectStep}</span>
                  <span data-state={allGitlabItems.length > 0 ? "done" : gitlabCanLoadIssues ? "active" : "waiting"}><strong>2</strong>{copy.gitlabFlowChooseStep}</span>
                  <span data-state={selectedGitlabItem ? "done" : allGitlabItems.length > 0 ? "active" : "waiting"}><strong>3</strong>{copy.gitlabFlowPreviewStep}</span>
                </div>

                <div className="operator-gitlab-connection-row" aria-label="GitLab connection">
                  <StatusPill status={gitlabConnection?.hasGlab ? "success" : "warning"} size="xs" dot>
                    {gitlabConnection?.hasGlab ? copy.gitlabCliReady : copy.gitlabCliMissingShort}
                  </StatusPill>
                  <StatusPill status={gitlabConnection?.authenticated ? "success" : "warning"} size="xs" dot>
                    {gitlabConnection?.authenticated ? copy.gitlabAuthReady : copy.gitlabAuthMissingShort}
                  </StatusPill>
                  {gitlabConnection?.repo && <StatusPill status="muted" size="xs">{gitlabConnection.repo}</StatusPill>}
                </div>

              {(!gitlabConnection?.hasGlab || !gitlabConnection.authenticated) && (
                <p className="operator-text-subtle">{copy.gitlabHelp}</p>
              )}

              {gitlabConnection && (!gitlabConnection.hasGlab || !gitlabConnection.authenticated) && (
                <div className="operator-warning-panel flex items-center justify-between gap-3">
                  <p className="operator-danger">
                    {!gitlabConnection.hasGlab ? copy.gitlabCliMissing : copy.gitlabAuthMissing}
                  </p>
                  {!gitlabConnection.hasGlab && (
                    <button type="button" className="operator-button operator-button-compact" onClick={() => window.specwright.shell.openUrl("https://gitlab.com/gitlab-org/cli#installation")}>{copy.installGlab}</button>
                  )}
                  {gitlabConnection.hasGlab && !gitlabConnection.authenticated && (
                    <button type="button" className="operator-button px-2 py-1" onClick={() => window.specwright.shell.openUrl("https://gitlab.com/gitlab-org/cli#authenticate")}>glab auth login</button>
                  )}
                </div>
              )}

              {gitlabStatus && !loadingGitlabItems && !gitlabStatus.startsWith(fetchedSourceStatus) && (() => {
                const recovery = gitlabRecovery(gitlabStatus, copy);
                if (recovery) {
                  const cleanStatus = cleanErrorMessage(gitlabStatus);
                  return (
                    <div className="operator-warning-panel operator-stack-sm">
                      <p className="operator-danger">{recovery.message}</p>
                      <p className="operator-text-subtle select-text">{cleanStatus}</p>
                      {(recovery.actions.length > 0 || cleanStatus) && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => copyError(cleanStatus)} className="operator-button px-2 py-1 text-[10px]">
                            {copiedError ? copy.copied : copy.copyDetails}
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
                      {copiedError ? copy.copied : copy.copyDetails}
                    </button>
                  </div>
                );
              })()}

              {loadingGitlabItems && (
                <p className="operator-text-subtle">{copy.loadingGitlabFor(gitlabRepoLabel)}</p>
              )}

              <AnimatePresence initial={false}>
              {gitlabPickerOpen && allGitlabItems.length > 0 && (
                <motion.div
                  className="max-h-80 overflow-y-auto scrollable operator-list"
                  variants={gitlabIssueViewVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={gitlabIssueViewTransition}
                >
                  {visibleGitLabItems.length === 0 ? (
                    <p className="operator-text-subtle px-3 py-3">{copy.noMatchingIssues}</p>
                  ) : visibleGitLabGroups.map((group) => {
                    const isAssignedGroup = group.label === copy.assignedGitlabIssues;
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
                            <span className="operator-text truncate text-left font-normal">
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
              if (suppressStaleGlabError || !gitlabStatus.startsWith(fetchedSourceStatus)) return null;
              const recovery = gitlabRecovery(gitlabStatus, copy);
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
                        {copiedError ? copy.copied : copy.copyDetails}
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
        {previewImage && (
          <ModalShell
            open={Boolean(previewImage)}
            onOpenChange={(open) => { if (!open) setPreviewImage(null); }}
            title={copy.imagePreview}
            description={copy.imagePreviewHelp}
            size="xl"
            className="operator-image-preview-shell"
            closeLabel={copy.close}
            closeOnInteractOutside
          >
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
                    <div className="operator-image-modal-toolbar">
                      <span className="operator-field-help">{copy.imagePreviewHelp}</span>
                      <span className="operator-image-modal-actions" aria-label={copy.imagePreview}>
                        <button type="button" className="operator-button px-2 py-1" onClick={() => zoomOut()}>-</button>
                        <button type="button" className="operator-button operator-button-compact" onClick={() => setEditingImage(previewImage)}>{copy.editImage}</button>
                        <button type="button" className="operator-button operator-button-compact" onClick={() => resetTransform()}>{copy.resetZoom}</button>
                        <button type="button" className="operator-button px-2 py-1" onClick={() => zoomIn()}>+</button>
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
          </ModalShell>
        )}
        {editingImage && (
          <ImageEditorModal
            src={editingImage}
            copy={copy}
            onApply={(src) => {
              setPreviewImage(src);
              setEditingImage(null);
            }}
            onClose={() => setEditingImage(null)}
          />
        )}
      </div>

      {/* Toggles */}
      <div className="operator-generation-options-section">
        <GenerationOptions card={card} onToggleOption={onToggleGenerationOption} />
      </div>
    </div>
  );
}

type InstructionCopy = typeof instructionCopy.nl;

function categoryLabel(category: ICard["category"], copy: InstructionCopy): string {
  return category === "@Modules" ? copy.moduleType : copy.workflowType;
}

function displayStartRoute(value: string): string {
  return /^https?:\/\//i.test(value) ? value : value.replace(/^\/+/, "");
}

function normalizeStartRoute(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function buildAutomaticTags(card: ICard): string[] {
  const tags = new Set<string>();
  if (card.category === "@Workflows") {
    tags.add("@0-Precondition");
    tags.add("@1-Verify");
  }
  return Array.from(tags);
}

function buildSuggestedTags(card: ICard): string[] {
  const tags = new Set<string>();
  if (card.category === "@Workflows") {
    tags.add("@0-Precondition");
    tags.add("@1-Verify");
  }
  if (card.steps.some((step) => /create|maak|toevoeg|add|save|opslaan/i.test(step))) tags.add("@creates-data");
  return Array.from(tags).slice(0, 5);
}

function SourcePreview({ markdown, images, onOpenImage, onEditImage, copy }: { markdown: string; images: string[]; onOpenImage: (src: string) => void; onEditImage: (src: string) => void; copy: InstructionCopy }): React.JSX.Element {
  const renderedMarkdown = normalizeMarkdownImages(markdown, images);
  const components: Components = {
    a: ({ href, children }) => (
      <a href={safeHref(href)} onClick={(event) => handlePreviewLinkClick(event, href)}>
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const imageSrc = typeof src === "string" ? src : "";
      return <ImageAttachment src={imageSrc} alt={cleanImageAlt(alt)} copy={copy} onOpen={onOpenImage} onEdit={onEditImage} />;
    },
  };
  return (
    <div className="operator-source-preview-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml urlTransform={sourcePreviewUrlTransform}>
        {renderedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function ImageAttachment({ src, alt, copy, onOpen, onEdit }: { src: string; alt: string; copy: InstructionCopy; onOpen: (src: string) => void; onEdit: (src: string) => void }): React.JSX.Element | null {
  if (!src) return null;
  const imageAlt = alt || "GitLab issue attachment";
  return (
    <figure className="operator-source-inline-image">
      <button type="button" className="operator-source-image-button" onClick={() => onOpen(src)}>
        <img src={src} alt={imageAlt} />
      </button>
      <figcaption className="operator-source-image-actions">
        <button type="button" className="operator-selected-action" onClick={() => onOpen(src)}>{copy.openImage}</button>
        <button type="button" className="operator-selected-action" onClick={() => onEdit(src)}>{copy.editImage}</button>
      </figcaption>
    </figure>
  );
}

function normalizeMarkdownImages(markdown: string, images: string[]): string {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let imageIndex = 0;
  const normalized = markdown.replace(imagePattern, (_fullMatch, rawAlt: string, rawSrc: string) => {
    const src = images[imageIndex] ?? rawSrc.trim() ?? "";
    imageIndex += 1;
    const safeSrc = src || rawSrc.trim();
    return `![${cleanImageAlt(rawAlt)}](${safeSrc})`;
  });
  const withoutDimensions = normalized.replace(/(!\[[^\]]*\]\([^)]+\))\s*\{[^}]*\b(?:width|height)\s*[:=][^}]*\}/gi, "$1");
  const remainingImages = images.slice(imageIndex);
  if (remainingImages.length === 0) return withoutDimensions;
  const attachments = remainingImages.map((src, index) => `![Attachment ${index + 1}](${src})`).join("\n\n");
  return `${withoutDimensions.trim()}\n\n${attachments}`.trim();
}

function sourcePreviewUrlTransform(url: string): string {
  if (/^data:image\//i.test(url)) return url;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[./#]/.test(url)) return url;
  return "";
}

function cleanImageAlt(value: unknown): string {
  return String(value ?? "")
    .replace(/\b\d{2,5}\s*[x×]\s*\d{2,5}\b/gi, "")
    .replace(/\b(width|height)\s*[:=]\s*\d{2,5}\b/gi, "")
    .replace(/[()[\]{}|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function safeHref(href: string | undefined): string {
  if (!href) return "#";
  return /^(https?:|mailto:)/i.test(href) ? href : "#";
}

function handlePreviewLinkClick(event: React.MouseEvent<HTMLAnchorElement>, href: string | undefined): void {
  if (!href || !/^https?:/i.test(href)) return;
  event.preventDefault();
  void window.specwright.shell.openUrl(href);
}

function ImageEditorModal({ src, copy, onApply, onClose }: { src: string; copy: InstructionCopy; onApply: (src: string) => void; onClose: () => void }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxWidth = 980;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = src;
  }, [src]);

  const draw = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    context.lineTo(x, y);
    context.strokeStyle = "#ef4444";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const reset = (): void => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  };

  const apply = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onApply(canvas.toDataURL("image/png"));
  };

  return (
    <ModalShell open onOpenChange={(open) => { if (!open) onClose(); }} title={copy.imageEditorTitle} description={copy.imageEditorHelp} size="xl" closeLabel={copy.close} className="operator-image-preview-shell" closeOnInteractOutside>
      <div className="operator-image-editor">
        <div className="operator-image-modal-toolbar">
          <span className="operator-field-help">{copy.imageEditorHelp}</span>
          <span className="operator-image-modal-actions">
            <button type="button" className="operator-button operator-button-compact" onClick={reset}><Eraser size={13} weight="bold" />{copy.resetImageEdit}</button>
            <button type="button" className="operator-button-primary operator-button-compact" onClick={apply}><PencilLine size={13} weight="bold" />{copy.applyImageEdit}</button>
          </span>
        </div>
        <canvas
          ref={canvasRef}
          className="operator-image-editor-canvas"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={(event) => { drawingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drawingRef.current = false; }}
        />
      </div>
    </ModalShell>
  );
}

const instructionCopy = {
  nl: {
    headerTitle: "Scenario",
    headerReady: "Klaar om uit te werken",
    headerMissing: "Beschrijf eerst wat moet kloppen",
    removeBrief: "Verwijderen",
    briefTitle: "Kies eerst de bron",
    briefHelp: "Meestal is het GitLab issue genoeg. Voeg eigen tekst alleen toe als Specwright extra richting nodig heeft.",
    advancedTestDetails: "Waar komt deze test te staan?",
    advancedTestDetailsHelp: "Deze namen helpen je de test later terug te vinden. Meestal hoef je hier niets te veranderen.",
    storageGroupTitle: "Plek en start",
    structureGroupTitle: "Soort test",
    labelsGroupTitle: "Zoeken en filteren",
    areaLabel: "App-deel",
    areaPlaceholder: "Afrekenen",
    areaHelp: "Bijvoorbeeld Afrekenen of Dashboard. Specwright gebruikt dit als map en tag.",
    startRouteLabel: "Startpunt in de app",
    startRoutePlaceholder: "checkout",
    startRouteHelp: "Alleen nodig als deze test op een specifieke pagina begint.",
    testTypeLabel: "Module of Workflow",
    moduleType: "Module",
    workflowType: "Workflow",
    moduleHelp: "Module = één losse test die direct kan starten.",
    workflowHelp: "Workflow = stappen die op elkaar bouwen, bijvoorbeeld eerst iets maken en daarna controleren.",
    fileNameLabel: "Bestandsnaam",
    fileNamePlaceholder: "afrekenen",
    fileNameHelp: "Wordt opgeslagen als",
    tagsLabel: "Labels",
    tagsHelp: "Extra woorden om deze test later terug te vinden of apart te draaien.",
    tagsGuidance: "Alleen nodig als je later wilt filteren. Workflow-labels vult Specwright zelf in.",
    preconditionTagHelp: "Specwright zet hier de setup-stap neer, zoals data maken of voorbereiden.",
    verifyTagHelp: "Specwright zet hier de controle-stap neer, dus wat zichtbaar moet kloppen.",
    tagsPlaceholder: "checkout",
    addTag: "Label toevoegen",
    suggestedTags: "Suggesties",
    stepsLabel: "Extra richting voor Specwright",
    stepsHelp: "Optioneel. Gebruik dit alleen als het GitLab issue niet duidelijk genoeg is.",
    addStep: "Regel toevoegen",
    removeStep: "Regel verwijderen",
    stepLabel: (index: number) => `Stap ${index}`,
    stepPlaceholder: (index: number) => index === 1 ? "Bijv. gebruiker vult adres in en ziet de juiste totaalprijs" : "Extra actie of zichtbaar resultaat",
    sourceLabel: "Startpunt voor deze test",
    optional: "optioneel",
    sourceHelp: "Kies bij voorkeur een GitLab issue. Specwright gebruikt issue-tekst en attachments als basis voor de test.",
    ownBriefTitle: "Zelf schrijven",
    ownBriefHelp: "Alleen als er geen bruikbaar GitLab issue of bestand is.",
    ownBriefAction: "Tekst gebruiken",
    fileSourceTitle: "Bestand",
    fileSourceHelp: "Gebruik een document alleen als het werk niet in GitLab staat.",
    fileSourceAction: "Bestand kiezen",
    gitlabSourceTitle: "GitLab issue",
    gitlabSourceHelp: "Aanbevolen. Kies jouw issue; tekst en attachments gaan direct mee als testcontext.",
    gitlabSourceAction: "GitLab issues kiezen",
    ticketSourceTitle: "Ticket",
    ticketSourceHelp: "Gebruik GitLab als het werk al in een issue staat.",
    updatedLabel: "Bijgewerkt",
    fileLabel: "Bronbestand",
    fetchingSource: "Bron wordt opgehaald...",
    clearSource: "Wissen",
    hidePreview: "Verberg",
    previewSource: "Bekijk bron",
    previewUnavailable: "De bron is nog niet klaar. Kies of herstel eerst een bestand of issue.",
    uploadFile: "Bestand uploaden",
    gitlabIssuesTitle: "GitLab issues",
    gitlabIssueCount: (count: number, repo: string) => `${count} GitLab issues uit ${repo}`,
    gitlabFlowTitle: "GitLab-bron kiezen",
    gitlabFlowConnect: "Verbind GitLab om issues uit deze projectmap te laden.",
    gitlabFlowReady: (repo: string) => `GitLab is klaar. Laad issues uit ${repo} en kies de bron voor deze test.`,
    gitlabFlowChoose: (count: number, repo: string) => `${count} issues uit ${repo}. Kies het issue dat beschrijft wat moet slagen.`,
    gitlabFlowSelected: (iid: string) => `Issue #${iid} is gekozen. Bekijk de bron of ga verder met je eigen testregels.`,
    gitlabFlowConnectStep: "Verbinden",
    gitlabFlowChooseStep: "Issue kiezen",
    gitlabFlowPreviewStep: "Bron bekijken",
    filterIssues: "Zoek issues...",
    closeIssues: "Lijst sluiten",
    loadingIssues: "Issues laden",
    chooseIssue: "Kies GitLab issue",
    loading: "Laden...",
    refreshIssues: "Vernieuwen",
    loadingIssuesStatus: "GitLab issues laden...",
    fetchedSourcePrefix: "Opgehaald",
    sourceMissing: "Bronbestand ontbreekt. Haal het GitLab issue opnieuw op om het bestand te herstellen.",
    copied: "Gekopieerd",
    copyError: "Details kopiëren",
    copyDetails: "Details kopiëren",
    imagePreview: "Afbeelding bekijken",
    imagePreviewHelp: "Ctrl + muiswiel om te zoomen. Sleep om te verplaatsen.",
    openImage: "Openen",
    editImage: "Bewerken",
    imageEditorTitle: "Afbeelding bewerken",
    imageEditorHelp: "Teken op de afbeelding om iets aan te wijzen. Gebruik herstellen om opnieuw te beginnen.",
    resetImageEdit: "Herstellen",
    applyImageEdit: "Toepassen",
    resetZoom: "Herstellen",
    close: "Sluiten",
    installGlab: "glab installeren",
    gitlabCliRequired: "GitLab CLI (glab) is nodig om GitLab issues op te halen.",
    gitlabAuthRequired: "GitLab CLI is gevonden, maar nog niet ingelogd voor deze GitLab-host.",
    gitlabRepoMissing: "Open een map met een GitLab remote of kies een issue via een volledige GitLab-link.",
    gitlabItemNotFound: "GitLab kan dit issue of work item niet vinden. Controleer projectpad en nummer.",
    gitlabHelp: "Specwright gebruikt de GitLab remote van deze projectmap. Log in met glab, dan ziet Specwright dezelfde issues als jij.",
    gitlabCliReady: "glab gevonden",
    gitlabCliMissingShort: "glab ontbreekt",
    gitlabAuthReady: "Ingelogd",
    gitlabAuthMissingShort: "Login ontbreekt",
    gitlabCliMissing: "GitLab CLI is niet geïnstalleerd.",
    gitlabAuthMissing: "Log eerst in met GitLab CLI om issues op te halen.",
    loadingGitlabFor: (repo: string) => `GitLab issues laden voor ${repo}...`,
    noMatchingIssues: "Geen passende issues gevonden.",
    noGitlabIssuesLoaded: "Er zijn nog geen issues geladen. Probeer opnieuw of controleer of deze repository open issues heeft.",
    noAssignedGitlabIssues: "Geen aan jou toegewezen issues gevonden. Bekijk alle projectissues als je een backlog-issue wilt gebruiken.",
    assignedGitlabIssues: "Mijn GitLab-issues",
    backlogGitlabIssues: "Project backlog",
    viewAllGitlabIssues: "Alle projectissues",
  },
  en: {
    headerTitle: "Scenario",
    headerReady: "Ready to work out",
    headerMissing: "Describe what should pass first",
    removeBrief: "Remove",
    briefTitle: "Choose the source first",
    briefHelp: "Usually the GitLab issue is enough. Add your own text only when Specwright needs extra direction.",
    advancedTestDetails: "Where will this test live?",
    advancedTestDetailsHelp: "These names help you find the test later. Usually, you do not need to change them.",
    storageGroupTitle: "Place and start",
    structureGroupTitle: "Test type",
    labelsGroupTitle: "Search and filter",
    areaLabel: "App area",
    areaPlaceholder: "Checkout",
    areaHelp: "For example Checkout or Dashboard. Specwright uses this as folder and tag.",
    startRouteLabel: "Starting point in the app",
    startRoutePlaceholder: "checkout",
    startRouteHelp: "Only needed when this test starts on a specific page.",
    testTypeLabel: "Module or Workflow",
    moduleType: "Module",
    workflowType: "Workflow",
    moduleHelp: "Module = one standalone test that can start directly.",
    workflowHelp: "Workflow = steps that build on each other, for example creating something and checking it later.",
    fileNameLabel: "File name",
    fileNamePlaceholder: "checkout",
    fileNameHelp: "Saved as",
    tagsLabel: "Labels",
    tagsHelp: "Extra words to find this test later or run it separately.",
    tagsGuidance: "Only needed when you want to filter later. Specwright adds Workflow labels itself.",
    preconditionTagHelp: "Specwright puts the setup step here, like creating or preparing data.",
    verifyTagHelp: "Specwright puts the check step here: what should visibly be true.",
    tagsPlaceholder: "checkout",
    addTag: "Add label",
    suggestedTags: "Suggested",
    stepsLabel: "Extra direction for Specwright",
    stepsHelp: "Optional. Use this only when the GitLab issue is not clear enough.",
    addStep: "Add line",
    removeStep: "Remove line",
    stepLabel: (index: number) => `Step ${index}`,
    stepPlaceholder: (index: number) => index === 1 ? "E.g. user enters address and sees the correct total price" : "Extra action or visible result",
    sourceLabel: "Starting point for this test",
    optional: "optional",
    sourceHelp: "Prefer choosing a GitLab issue. Specwright uses issue text and attachments as the basis for the test.",
    ownBriefTitle: "Write it yourself",
    ownBriefHelp: "Use this only when there is no useful GitLab issue or file.",
    ownBriefAction: "Use text",
    fileSourceTitle: "File",
    fileSourceHelp: "Use a document only when the work is not in GitLab.",
    fileSourceAction: "Choose file",
    gitlabSourceTitle: "GitLab issue",
    gitlabSourceHelp: "Recommended. Choose your issue; text and attachments become test context.",
    gitlabSourceAction: "Choose GitLab issues",
    ticketSourceTitle: "Ticket",
    ticketSourceHelp: "Use GitLab when the work already lives in an issue.",
    updatedLabel: "Updated",
    fileLabel: "Source file",
    fetchingSource: "Fetching source...",
    clearSource: "Clear",
    hidePreview: "Hide",
    previewSource: "Preview source",
    previewUnavailable: "The source is not ready yet. Choose or restore a file or issue first.",
    uploadFile: "Upload file",
    gitlabIssuesTitle: "GitLab issues",
    gitlabIssueCount: (count: number, repo: string) => `${count} GitLab issues from ${repo}`,
    gitlabFlowTitle: "Choose GitLab source",
    gitlabFlowConnect: "Connect GitLab to load issues from this project folder.",
    gitlabFlowReady: (repo: string) => `GitLab is ready. Load issues from ${repo} and choose the source for this test.`,
    gitlabFlowChoose: (count: number, repo: string) => `${count} issues from ${repo}. Choose the issue that describes what should pass.`,
    gitlabFlowSelected: (iid: string) => `Issue #${iid} is selected. Preview the source or continue with your own test lines.`,
    gitlabFlowConnectStep: "Connect",
    gitlabFlowChooseStep: "Choose issue",
    gitlabFlowPreviewStep: "Preview source",
    filterIssues: "Search issues...",
    closeIssues: "Close list",
    loadingIssues: "Loading issues",
    chooseIssue: "Choose GitLab issue",
    loading: "Loading...",
    refreshIssues: "Refresh",
    loadingIssuesStatus: "Loading GitLab issues...",
    fetchedSourcePrefix: "Fetched",
    sourceMissing: "Source file is missing. Fetch or select the GitLab issue again to recreate it.",
    copied: "Copied",
    copyError: "Copy details",
    copyDetails: "Copy details",
    imagePreview: "Image preview",
    imagePreviewHelp: "Ctrl + wheel to zoom. Drag to pan.",
    openImage: "Open",
    editImage: "Edit",
    imageEditorTitle: "Edit image",
    imageEditorHelp: "Draw on the image to point something out. Use reset to start again.",
    resetImageEdit: "Reset",
    applyImageEdit: "Apply",
    resetZoom: "Reset",
    close: "Close",
    installGlab: "Install glab",
    gitlabCliRequired: "GitLab CLI (glab) is required to list or fetch GitLab issues.",
    gitlabAuthRequired: "GitLab CLI is installed, but you need to authenticate it for this GitLab host.",
    gitlabRepoMissing: "Open a folder with a GitLab remote, or choose an issue with a full GitLab link.",
    gitlabItemNotFound: "GitLab could not find that issue or work item. Check the project path and issue number.",
    gitlabHelp: "Specwright uses the GitLab remote from this project folder. Sign in with glab so Specwright sees the same issues you do.",
    gitlabCliReady: "glab found",
    gitlabCliMissingShort: "glab missing",
    gitlabAuthReady: "Signed in",
    gitlabAuthMissingShort: "Login missing",
    gitlabCliMissing: "GitLab CLI is not installed.",
    gitlabAuthMissing: "Sign in with GitLab CLI before loading issues.",
    loadingGitlabFor: (repo: string) => `Loading GitLab issues for ${repo}...`,
    noMatchingIssues: "No matching issues found.",
    noGitlabIssuesLoaded: "No issues are loaded yet. Try again or check whether this repository has open issues.",
    noAssignedGitlabIssues: "No issues assigned to you were found. View all project issues if you want to use a backlog issue.",
    assignedGitlabIssues: "My GitLab issues",
    backlogGitlabIssues: "Project backlog",
    viewAllGitlabIssues: "All project issues",
  },
};
