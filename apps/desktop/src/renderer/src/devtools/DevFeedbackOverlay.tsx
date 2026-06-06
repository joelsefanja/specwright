import React, { useEffect, useMemo, useRef, useState } from "react";
import { Browsers, CaretDown, ChatCircleText, CheckCircle, Copy, CursorClick, MagicWand, PaperPlaneTilt, Stop, TerminalWindow, WarningCircle, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusPill, type StatusPillProps } from "../components/ui";
import { useTranslations } from "../i18n/localeStore";
import type { ElementContext, FeedbackJob, ContextScope, MagicWrightPreset, MenuState, PersistedFeedbackState, HighlightState } from "./devFeedbackTypes";
import {
  isEditableTarget,
  getElementContext,
  summarizeVisibleText,
  splitReadableText,
  describeElement,
  getAnchoredMenuPosition,
  captureElementScreenshot,
  capturePageScreenshot,
  buildPrompt,
  statusLabel,
  statusPillTone,
  appendLog,
  appendRawLine,
  activityFromLog,
  isPatchConflictOutput,
  applyFailedMessage,
  needsReviewLabel,
  compactProgressLogs,
  displayActivity,
  displayCardDetail,
  displayPrimaryOutput,
  shouldShowRawOutputInline,
  decisionText,
  agentOutputTitle,
  normalizeRestoredJob,
  buildRetryPromptFromJob,
} from "./devFeedbackContext";

const STORAGE_KEY = "specwright.devFeedback.state";

export function DevFeedbackOverlay(): React.JSX.Element | null {
  const text = useTranslations().devFeedback;
  const isEnglish = text.close === "Close";
  const feedbackCommentRequired = isEnglish ? "Describe what should improve before you can start." : "Beschrijf eerst wat beter moet voordat je kunt starten.";
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<MenuState | null>(null);
  const [selectionHighlight, setSelectionHighlight] = useState<HighlightState | null>(null);
  const [comment, setComment] = useState("");
  const [contextScope, setContextScope] = useState<ContextScope>("element");
  const [copied, setCopied] = useState(false);
  const [jobs, setJobs] = useState<FeedbackJob[]>([]);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMagicWright, setIsMagicWright] = useState(false);
  const draftOutputRef = useRef<Record<string, string>>({});
  const jobsRef = useRef<FeedbackJob[]>([]);

  useEffect(() => {
    const restored = readPersistedState();
    if (!restored) return;
    setJobs(restored.jobs.map((job) => normalizeRestoredJob(job, text)));
  }, [text.jobCancelled]);

  useEffect(() => {
    persistState({ jobs });
  }, [jobs]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const context = getElementContext(event.target);
      setSelectionHighlight({ rect: context.captureRect, mode: "selected" });
      void captureElementScreenshot(context).then((screenshot) => {
        setMenu({ x: event.clientX, y: event.clientY, context, screenshot });
      });
    };
    const onPointerMove = (event: MouseEvent): void => {
      if (!event.ctrlKey || isEditableTarget(event.target)) {
        setSelectionHighlight((current) => current?.mode === "hover" ? null : current);
        return;
      }
      const context = getElementContext(event.target);
      setSelectionHighlight({ rect: context.captureRect, mode: "hover" });
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== "Control") return;
      setSelectionHighlight((current) => current?.mode === "hover" ? null : current);
    };
    const onPointerDown = (): void => setMenu(null);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    const api = window.specwright.devFeedback;
    if (!api) return;
    const offToken = api.onToken(({ id, token }) => {
      if (!id) return;
      draftOutputRef.current[id] = `${draftOutputRef.current[id] ?? ""}${token}`;
      updateJob(id, (job) => job.status === "running" ? { ...job, rawOutput: `${job.rawOutput}${token}` } : job);
    });
    const offLog = api.onLog(({ id, line }) => {
      if (!id) return;
      updateJob(id, (job) => {
        if (job.status !== "running") return job;
        const activity = activityFromLog(line, text);
        return {
          ...job,
          activity: activity ?? job.activity,
          logs: activity ? appendLog(job.logs, activity) : job.logs,
          output: job.output || text.running,
        };
      });
    });
    const offDone = api.onDone(async ({ id, fullText, worktreePath }) => {
      if (!id) return;
      if (jobsRef.current.find((item) => item.id === id)?.status === "cancelled") return;
      const job = jobsRef.current.find((item) => item.id === id);
      const rawOutput = fullText || draftOutputRef.current[id] || "";
      let afterImage: string | null = null;
      if (job) {
        const screenshot = await api.captureScreenshot(job.context.captureRect);
        afterImage = screenshot.ok && screenshot.dataUrl ? screenshot.dataUrl : null;
      }
      updateJob(id, (item) => ({ ...item, status: "done", activity: text.jobDone, logs: appendLog(item.logs, text.jobDone), output: rawOutput || item.rawOutput || text.jobDone, rawOutput: rawOutput || item.rawOutput, afterImage: afterImage ?? item.afterImage, worktreePath: worktreePath ?? item.worktreePath }));
      setNotice(text.jobDone);
    });
    const offError = api.onError(({ id, error }) => {
      if (!id) return;
      if (jobsRef.current.find((item) => item.id === id)?.status === "cancelled") return;
      updateJob(id, (job) => ({ ...job, status: "error", activity: text.jobError, logs: appendLog(job.logs, text.jobError), output: `${job.output}\n[error] ${error}`.trim(), rawOutput: appendRawLine(job.rawOutput, `[error] ${error}`) }));
      setNotice(text.jobError);
    });
    return () => {
      offToken();
      offLog();
      offDone();
      offError();
    };
  }, [text.applying, text.finishing, text.jobCancelled, text.jobDone, text.jobError, text.preparing, text.running]);

  const focusedJob = focusedJobId ? jobs.find((job) => job.id === focusedJobId) ?? null : null;
  const prompt = useMemo(() => {
    if (!dialog) return "";
    return buildPrompt(dialog.context, comment, contextScope);
  }, [comment, contextScope, dialog]);
  const runningCount = jobs.filter((job) => job.status === "running").length;
  const menuPosition = menu ? getAnchoredMenuPosition(menu.context.captureRect) : { left: 0, top: 0, placement: "below" as const };

  if (!import.meta.env.DEV && !window.specwright.devFeedback?.isE2E) return null;

  const openDialog = async (): Promise<void> => {
    if (!menu) return;
    setFocusedJobId(null);
    setDialog(menu);
    setComment("");
    setContextScope("element");
    setIsMagicWright(false);
    setCopied(false);
    setSelectionHighlight(null);
    setMenu(null);
  };

  const openMagicWright = async (preset: MagicWrightPreset): Promise<void> => {
    if (!menu) return;
    const nextDialog = menu;
    setFocusedJobId(null);
    setDialog(nextDialog);
    setComment(buildMagicWrightComment(preset, isEnglish, nextDialog.context));
    setContextScope("page");
    setIsMagicWright(true);
    setCopied(false);
    setSelectionHighlight(null);
    setMenu(null);
    const screenshot = await capturePageScreenshot();
    if (screenshot) setDialog((current) => current ? { ...current, screenshot } : current);
  };

  const closeDialog = (): void => {
    setDialog(null);
    setFocusedJobId(null);
    setSelectionHighlight(null);
    setIsMagicWright(false);
    if (runningCount > 0) setNotice(text.close === "Close" ? "The improvement continues in the bottom-right panel." : "De verbetering loopt rechtsonder verder.");
  };

  const copyPrompt = async (): Promise<void> => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  };

  const chooseContextScope = (scope: ContextScope): void => {
    setContextScope(scope);
    if (!dialog) return;
    const screenshotPromise = scope === "page" ? capturePageScreenshot() : captureElementScreenshot(dialog.context);
    void screenshotPromise.then((screenshot) => {
      if (!screenshot) return;
      setDialog((current) => current ? { ...current, screenshot } : current);
    });
  };

  const runAgent = async (): Promise<void> => {
    if (!prompt.trim() || !dialog) return;
    const beforeImage = contextScope === "page" ? await capturePageScreenshot() : dialog.screenshot;
    await startFeedbackJob({
      context: dialog.context,
      contextScope,
      comment,
      prompt,
      beforeImage,
    });
  };

  const startFeedbackJob = async (input: { context: ElementContext; contextScope: ContextScope; comment: string; prompt: string; beforeImage: string | null }): Promise<void> => {
    const api = window.specwright.devFeedback;
    if (!api) return;

    const id = crypto.randomUUID();
    const job: FeedbackJob = {
      id,
      context: input.context,
      comment: input.comment,
      contextScope: input.contextScope,
      output: text.running,
      rawOutput: "",
      activity: text.starting,
      logs: [text.starting],
      status: "running",
      beforeImage: input.beforeImage,
      afterImage: null,
    };
    draftOutputRef.current[id] = "";
    setJobs((current) => [job, ...current]);
    setFocusedJobId(id);

    const result = await api.run({ id, prompt: input.prompt });
    if (jobsRef.current.find((item) => item.id === id)?.status === "cancelled") return;
    if (!result.ok) {
      updateJob(id, (item) => ({ ...item, status: "error", activity: text.jobError, logs: appendLog(item.logs, text.jobError), output: result.error ?? "Unknown error", rawOutput: appendRawLine(item.rawOutput, result.error ?? "Unknown error") }));
      return;
    }
    updateJob(id, (item) => ({ ...item, worktreePath: result.worktreePath ?? item.worktreePath }));
    if (!result.worktreePath) {
      updateJob(id, (item) => item.status === "running" ? { ...item, status: "done", activity: text.jobDone, logs: appendLog(item.logs, text.jobDone), output: item.output || text.jobDone } : item);
      return;
    }

    updateJob(id, (item) => ({ ...item, activity: text.takingOver, logs: appendLog(item.logs, text.takingOver) }));
    const applyResult = await api.applyWorktree({ worktreePath: result.worktreePath });
    if (!applyResult.ok) {
      const needsReview = needsReviewLabel(text);
      updateJob(id, (item) => ({ ...item, status: "done", activity: needsReview, logs: appendLog(item.logs, needsReview), output: applyFailedMessage(text), rawOutput: appendRawLine(item.rawOutput, applyResult.error ?? text.jobError), worktreePath: result.worktreePath }));
      return;
    }
    updateJob(id, (item) => ({ ...item, status: "applied", activity: applyResult.applied ? text.takenOver : text.takeOverEmpty, logs: appendLog(item.logs, applyResult.applied ? text.takenOver : text.takeOverEmpty), output: item.output || item.rawOutput || (applyResult.applied ? text.takenOver : text.takeOverEmpty) }));
    setNotice(applyResult.applied ? text.takenOver : text.takeOverEmpty);
  };

  const continueJob = (job: FeedbackJob, nextComment: string): void => {
    setDialog({ x: 0, y: 0, context: job.context, screenshot: job.afterImage ?? job.beforeImage });
    setComment(`${job.comment}\n\nVervolg:\n${nextComment}`);
    setIsMagicWright(false);
    setContextScope(job.contextScope ?? "page");
    setCopied(false);
    setFocusedJobId(null);
  };

  const onCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void runAgent();
  };

  const applyJob = async (id: string): Promise<void> => {
    const api = window.specwright.devFeedback;
    const job = jobsRef.current.find((item) => item.id === id);
    if (!api || !job?.worktreePath) return;
    updateJob(id, (item) => ({ ...item, activity: text.takingOver, logs: appendLog(item.logs, text.takingOver) }));
    const result = await api.applyWorktree({ worktreePath: job.worktreePath });
    if (!result.ok) {
      const needsReview = needsReviewLabel(text);
      updateJob(id, (item) => ({ ...item, status: "done", activity: needsReview, logs: appendLog(item.logs, needsReview), output: applyFailedMessage(text), rawOutput: appendRawLine(item.rawOutput, result.error ?? text.jobError) }));
      return;
    }
    updateJob(id, (item) => ({ ...item, status: "applied", activity: result.applied ? text.takenOver : text.takeOverEmpty, logs: appendLog(item.logs, result.applied ? text.takenOver : text.takeOverEmpty), output: item.output || item.rawOutput || (result.applied ? text.takenOver : text.takeOverEmpty) }));
    setNotice(result.applied ? text.takenOver : text.takeOverEmpty);
  };

  const cancelJob = async (id: string): Promise<void> => {
    const api = window.specwright.devFeedback;
    updateJob(id, (job) => ({ ...job, status: "cancelled", activity: text.jobCancelled, logs: appendLog(job.logs, text.jobCancelled), output: text.jobCancelled }));
    if (!api) return;
    const result = await api.cancel({ id });
    if (!result.ok) updateJob(id, (job) => ({ ...job, status: "error", activity: text.jobError, output: result.error ?? text.jobError, rawOutput: appendRawLine(job.rawOutput, result.error ?? text.jobError) }));
  };

  const retryJob = (job: FeedbackJob): void => {
    setIsMagicWright(false);
    setCopied(false);
    setFocusedJobId(null);
    void startFeedbackJob({
      context: job.context,
      contextScope: job.contextScope ?? "page",
      comment: job.comment,
      prompt: buildRetryPromptFromJob(job),
      beforeImage: job.afterImage ?? job.beforeImage,
    });
  };

  const sendToBackground = (): void => {
    closeDialog();
  };

  return (
    <>
      {selectionHighlight && <SelectionHighlightOverlay highlight={selectionHighlight} />}
      {menu && (
        <motion.div
          className="operator-feedback-context-menu"
          data-testid="feedback-context-menu"
          data-placement={menuPosition.placement}
          style={{ left: menuPosition.left, top: menuPosition.top }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" className="operator-feedback-context-action" data-testid="design-feedback-button" onClick={() => void openDialog()}>
            <span className="operator-feedback-context-icon"><ChatCircleText size={20} weight="duotone" /></span>
            <span className="min-w-0">
              <span className="operator-feedback-context-kicker">{text.close === "Close" ? "Design feedback" : "Ontwerp-feedback"}</span>
              <span className="operator-feedback-context-title">{text.menuAction}</span>
              <span className="operator-feedback-context-copy">{text.close === "Close" ? "Ask OpenCode to improve this UI with the selected screen context." : "Laat OpenCode dit onderdeel verbeteren met de geselecteerde schermcontext."}</span>
              <span className="operator-feedback-context-target">{describeElement(menu.context, text)}</span>
            </span>
          </button>
          <div className="operator-magic-wright-panel" data-testid="magic-wright-panel">
            <div className="operator-magic-wright-head">
              <span className="operator-feedback-context-icon operator-magic-wright-icon"><MagicWand size={18} weight="duotone" /></span>
              <span>
                <span className="operator-feedback-context-kicker">Magic Wright</span>
                <span className="operator-feedback-context-copy">{isEnglish ? "Use the whole page and UX writing best practices." : "Gebruikt de hele pagina en UX-writing best practices."}</span>
              </span>
            </div>
            <div className="operator-magic-wright-options">
              {magicWrightOptions(isEnglish).map((option) => (
                <button key={option.preset} type="button" data-testid={`magic-wright-${option.preset}`} onClick={() => void openMagicWright(option.preset)}>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <FeedbackJobsPanel jobs={jobs} runningCount={runningCount} text={text} onOpen={(id) => setFocusedJobId(id)} onCancel={(id) => void cancelJob(id)} onRetry={retryJob} />
      <AnimatePresence>{notice && <Toast message={notice} />}</AnimatePresence>

      <AnimatePresence>
        {(dialog || focusedJob) && (
          <motion.div
            className="operator-feedback-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={sendToBackground}
          >
            <motion.div
              className="operator-panel operator-feedback-dialog pointer-events-auto border shadow-2xl"
              role="dialog"
              aria-modal="true"
              data-testid="feedback-dialog"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="operator-feedback-dialog-head">
                <div className="flex-shrink-0">
                  <p className="operator-label">{isEnglish ? "Screenshot context" : "Screenshot-context"}</p>
                  <h2 className="text-sm font-semibold text-operator-ink">{isEnglish ? "Improve this UI" : "Verbeter deze UI"}</h2>
                </div>
                <div>
                  <button type="button" className="operator-icon-button" data-testid="dialog-close" onClick={sendToBackground} aria-label={text.close}>
                    <X size={15} weight="bold" />
                  </button>
                </div>
              </div>

              {focusedJob ? (
                <JobDetails job={focusedJob} text={text} onApply={() => void applyJob(focusedJob.id)} onCancel={() => void cancelJob(focusedJob.id)} onRetry={() => retryJob(focusedJob)} onContinue={(nextComment) => continueJob(focusedJob, nextComment)} />
              ) : dialog ? (
                <div className="operator-feedback-body operator-feedback-compose-body flex flex-col gap-3 px-3 py-3">
                  <ElementDetails context={dialog.context} text={text} />
                  <div className="operator-feedback-preview-card">
                    <ScreenshotPreview title={contextScope === "page" ? (isEnglish ? "Before: whole page" : "Voor: hele pagina") : text.element} src={dialog.screenshot} fallback={text.screenshotUnavailable} />
                  </div>
                  {isMagicWright ? (
                    <div className="operator-magic-wright-locked-context" data-testid="magic-wright-locked-context">
                      <Browsers size={15} weight="bold" />
                      <span>{isEnglish ? "Magic Wright always uses the whole page as context." : "Magic Wright gebruikt altijd de hele pagina als context."}</span>
                    </div>
                  ) : (
                    <div className="operator-feedback-scope-grid grid gap-2 sm:grid-cols-2">
                      <button type="button" className={contextScope === "element" ? "operator-feedback-scope operator-feedback-scope-active" : "operator-feedback-scope"} data-testid="scope-element" onClick={() => chooseContextScope("element")}>
                        <CursorClick size={15} weight="bold" className="mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="block font-semibold">{text.close === "Close" ? "Element only" : "Alleen element"}</span>
                          <span className="block text-[11px] opacity-75">{text.close === "Close" ? "Screenshot of the selected element." : "Screenshot van het gekozen element."}</span>
                        </span>
                      </button>
                      <button type="button" className={contextScope === "page" ? "operator-feedback-scope operator-feedback-scope-active" : "operator-feedback-scope"} data-testid="scope-page" onClick={() => chooseContextScope("page")}>
                        <Browsers size={15} weight="bold" className="mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="block font-semibold">{text.close === "Close" ? "Whole page" : "Hele pagina"}</span>
                          <span className="block text-[11px] opacity-75">{text.close === "Close" ? "Full-screen screenshot plus page text." : "Volledig screenshot plus paginatekst."}</span>
                        </span>
                      </button>
                    </div>
                  )}
                  <div className="operator-feedback-request-field">
                    <label className="operator-control-label" htmlFor="operator-feedback-comment">{isEnglish ? "What should improve?" : "Wat moet beter?"}</label>
                    <textarea
                      id="operator-feedback-comment"
                      className={isMagicWright ? "operator-field min-h-44 w-full resize-y px-3 py-2" : "operator-field min-h-28 w-full flex-1 resize-none px-3 py-2"}
                      rows={isMagicWright ? 8 : undefined}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      onKeyDown={onCommentKeyDown}
                      placeholder={isEnglish ? "Example: make the buttons clearer and reduce spacing." : "Bijvoorbeeld: maak de knoppen duidelijker en verklein de witruimte."}
                    />
                  </div>
                  <div className="operator-feedback-actions">
                    <p className="operator-field-help m-0">{comment.trim() ? (isEnglish ? "Ready to send to OpenCode." : "Klaar om naar OpenCode te sturen.") : feedbackCommentRequired}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="operator-button gap-2" data-testid="copy-prompt" onClick={() => void copyPrompt()} disabled={!comment.trim()}>
                        <Copy size={14} weight="bold" />
                        {copied ? text.copied : text.copyPrompt}
                      </button>
                      <button type="button" className="operator-button-primary gap-2" data-testid="start-improvement" onClick={() => void runAgent()} disabled={!comment.trim()}>
                        <PaperPlaneTilt size={14} weight="bold" />
                        {text.close === "Close" ? "Start improvement" : "Verbetering starten"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  function updateJob(id: string, update: (job: FeedbackJob) => FeedbackJob): void {
    setJobs((current) => current.map((job) => job.id === id ? update(job) : job));
  }
}

function FeedbackJobsPanel({ jobs, runningCount, text, onOpen, onCancel, onRetry }: { jobs: FeedbackJob[]; runningCount: number; text: any; onOpen: (id: string) => void; onCancel: (id: string) => void; onRetry: (job: FeedbackJob) => void }): React.JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (jobs.length === 0) return null;
  const isEnglish = text.close === "Close";
  return (
    <motion.aside className={isCollapsed ? "operator-feedback-jobs operator-feedback-jobs-collapsed operator-panel border shadow-2xl" : "operator-feedback-jobs operator-panel border shadow-2xl"} data-testid="feedback-jobs-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="operator-agent-panel-head">
        <button type="button" className="flex min-w-0 items-center gap-2 text-left" data-testid="jobs-toggle" onClick={() => setIsCollapsed((value) => !value)}>
          <CaretDown size={13} weight="bold" className={isCollapsed ? "-rotate-90 transition" : "transition"} />
          <span className="operator-agent-mark"><TerminalWindow size={14} weight="duotone" /></span>
          <span className="min-w-0">
            <p className="operator-section-title truncate">{isCollapsed ? (runningCount > 0 ? `${runningCount} ${isEnglish ? "busy" : "bezig"}` : `${jobs.length} ${isEnglish ? "ready" : "klaar"}`) : (isEnglish ? "Design drafts" : "Ontwerpvoorstellen")}</p>
            {!isCollapsed && <p className="operator-text-subtle mt-0.5">{isEnglish ? "Review or apply UI improvements" : "Bekijk of gebruik UI-verbeteringen"}</p>}
          </span>
        </button>
        {!isCollapsed && <div className="flex items-center gap-2">
          {runningCount > 0 && <StatusPill status="running" size="xs">{runningCount} {isEnglish ? "busy" : "bezig"}</StatusPill>}
          <span className="operator-label">{jobs.length}</span>
        </div>}
      </div>
      {isCollapsed ? null : (
      <div className="operator-feedback-jobs-list space-y-2 overflow-auto p-3">
        {jobs.map((job) => (
          <div key={job.id} className="operator-agent-run-card" data-testid="agent-run-card">
            <span className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 truncate text-left text-sm font-medium text-operator-ink" data-testid="job-title" onClick={() => onOpen(job.id)}>{describeElement(job.context, text)}</button>
              <StatusPill status={statusPillTone(job.status)} size="xs">{statusLabel(job.status, text)}</StatusPill>
            </span>
            <button type="button" className="mt-1 block max-w-full truncate text-left text-xs text-operator-muted" onClick={() => onOpen(job.id)}>{job.comment || (isEnglish ? "No written request" : "Geen geschreven vraag")}</button>
            <div className="operator-agent-run-meta">
              {job.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sw-accent)]" />}
              <span className="truncate">{displayActivity(job.activity || statusLabel(job.status, text), text)}</span>
            </div>
            <button type="button" className="operator-agent-output-peek" onClick={() => onOpen(job.id)}>{displayCardDetail(job, text)}</button>
            {job.status === "running" && (
              <button type="button" className="operator-button mt-2 gap-1 py-1 text-[10px]" onClick={() => onCancel(job.id)}>
                <Stop size={12} weight="bold" />
                {text.cancel}
              </button>
            )}
            {(job.status === "cancelled" || job.status === "error") && (
              <button type="button" className="operator-button mt-2 py-1 text-[10px]" onClick={() => onRetry(job)}>{text.retry}</button>
            )}
          </div>
        ))}
      </div>
      )}
    </motion.aside>
  );
}

function JobDetails({ job, text, onApply, onCancel, onRetry, onContinue }: { job: FeedbackJob; text: any; onApply: () => void; onCancel: () => void; onRetry: () => void; onContinue: (comment: string) => void }): React.JSX.Element {
  const [nextComment, setNextComment] = useState("");
  const canContinue = job.status === "done" || job.status === "applied";
  const visibleLogs = compactProgressLogs(job.logs, job.activity || statusLabel(job.status, text), text);
  const isEnglish = text.close === "Close";
  const elementLabel = describeElement(job.context, text);
  const scopeLabel = job.contextScope === "page" ? (isEnglish ? "page context" : "pagina-context") : (isEnglish ? "selected element" : "geselecteerd onderdeel");
  const summaryMeta = elementLabel.toLowerCase() === scopeLabel.toLowerCase() ? elementLabel : `${elementLabel} · ${scopeLabel}`;
  const canApply = job.status === "done" && Boolean(job.worktreePath);
  const sendContinue = (): void => {
    if (!nextComment.trim()) return;
    onContinue(nextComment.trim());
    setNextComment("");
  };
  const onNextCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendContinue();
  };
  return (
    <div className="operator-feedback-body operator-feedback-job-body flex flex-col gap-3 px-4 py-4">
      <div className="operator-agent-summary" data-state={job.status}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="operator-label">{isEnglish ? "Suggested improvement" : "Voorgestelde verbetering"}</p>
            <h3 className="mt-1 text-base font-semibold leading-5 text-operator-ink">{job.comment || (isEnglish ? "Improve selected UI" : "Verbeter geselecteerde UI")}</h3>
            <p className="mt-2 text-xs text-operator-muted">{summaryMeta}</p>
          </div>
          <StatusPill status={statusPillTone(job.status)} size="xs">{statusLabel(job.status, text)}</StatusPill>
        </div>
        <div className="operator-feedback-decision-strip">
          <span>{decisionText(job, text)}</span>
          {canApply && <strong>{isEnglish ? "Review, then apply" : "Controleer en gebruik"}</strong>}
        </div>
      </div>
      {(job.status === "done" && job.worktreePath) || job.status === "running" || job.status === "cancelled" || job.status === "error" ? (
        <div className="operator-agent-actions">
          {job.status === "running" && <button type="button" className="operator-button gap-2" onClick={onCancel}><Stop size={14} weight="bold" />{text.cancel}</button>}
          {(job.status === "cancelled" || job.status === "error") && <button type="button" className="operator-button" onClick={onRetry}>{text.retry}</button>}
          {canApply && (
          <button type="button" className="operator-button-primary" onClick={onApply}><CheckCircle size={14} weight="bold" />{text.takeOver}</button>
          )}
        </div>
      ) : null}
      <div className="operator-agent-main-grid">
        <div className="operator-agent-rail">
          <p className="operator-control-label">{text.agentProgress}</p>
          <div className="mt-3 space-y-2">
            {visibleLogs.map((line, index) => (
              <div key={`${index}-${line}`} className="operator-agent-rail-step">
                <span className={`h-1.5 w-1.5 rounded-full ${index === visibleLogs.length - 1 && job.status === "running" ? "animate-pulse bg-[var(--sw-accent)]" : "bg-operator-line"}`} />
                <span>{displayActivity(line, text)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-operator-muted">{isEnglish ? "This is the human-readable trail. OpenCode details stay available below." : "Dit is het leesbare spoor. OpenCode-details blijven hieronder beschikbaar."}</p>
        </div>
        <div className="operator-config-section operator-feedback-result operator-agent-transcript text-sm text-operator-muted">
          <div className="operator-agent-transcript-head">
            <span className="operator-label flex items-center gap-2"><TerminalWindow size={13} weight="duotone" />{agentOutputTitle(text)}</span>
            <span className="operator-label">{job.status === "running" ? (isEnglish ? "Live" : "Live") : (isEnglish ? "Inspect" : "Controle")}</span>
          </div>
          {job.status === "running" && job.rawOutput.trim() ? (
            <pre className="operator-agent-live-terminal">{job.rawOutput}</pre>
          ) : (
            <div className="operator-agent-readable-output">{displayPrimaryOutput(job, text)}</div>
          )}
          {job.rawOutput.trim() && !shouldShowRawOutputInline(job) && (
            <details className="operator-agent-technical-output">
              <summary>{text.technicalDetails}</summary>
              <pre className="mt-3 whitespace-pre-wrap leading-5">{job.rawOutput}</pre>
            </details>
          )}
        </div>
      </div>
      {(job.beforeImage || job.afterImage) && (
        <div className="operator-agent-detail-box">
          <p className="operator-control-label">{isEnglish ? "Preview" : "Voorbeeld"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {job.beforeImage && <ScreenshotPreview title={text.element} src={job.beforeImage} fallback={text.screenshotUnavailable} />}
            {job.afterImage && <ScreenshotPreview title={text.after} src={job.afterImage} fallback={text.screenshotUnavailable} />}
          </div>
        </div>
      )}
      {canContinue && (
        <div className="operator-config-section flex-shrink-0 space-y-2">
          <p className="operator-control-label">{text.continueSession}</p>
          <textarea className="operator-field min-h-20 w-full resize-y px-3 py-2" value={nextComment} onChange={(event) => setNextComment(event.target.value)} onKeyDown={onNextCommentKeyDown} placeholder={text.continuePlaceholder} />
          <div className="flex justify-end">
            <button type="button" className="operator-button-primary gap-2" onClick={sendContinue} disabled={!nextComment.trim()}>
              <PaperPlaneTilt size={14} weight="bold" />
              {text.close === "Close" ? "Send follow-up" : "Vervolgvraag sturen"}
            </button>
          </div>
          {!nextComment.trim() && <p className="operator-field-help m-0 text-right">{isEnglish ? "Write a follow-up before sending." : "Schrijf eerst je vervolgvraag voordat je stuurt."}</p>}
        </div>
      )}
    </div>
  );
}

function ElementDetails({ context, text }: { context: ElementContext; text: any }): React.JSX.Element {
  const visibleText = summarizeVisibleText(context.text);
  const elementName = describeElement(context, text);
  const textChunks = splitReadableText(visibleText);
  const isEnglish = text.close === "Close";

  return (
    <div className="operator-config-section operator-feedback-context-card text-sm text-operator-muted">
      <p className="operator-label mb-2">{isEnglish ? "Selected context" : "Gekozen context"}</p>
      <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
        <div>
          <p className="operator-control-label">{isEnglish ? "Target" : "Onderdeel"}</p>
          <p className="mt-1 text-sm font-semibold text-operator-ink">{elementName}</p>
        </div>
        <div>
          <p className="operator-control-label">{isEnglish ? "Visible text" : "Zichtbare tekst"}</p>
          {textChunks.length > 0 ? (
            <div className="mt-1.5 flex max-h-20 flex-wrap gap-1.5 overflow-hidden">
              {textChunks.map((chunk) => <span key={chunk} className="operator-feedback-copy-chip border border-operator-line bg-operator-panel px-2 py-1 text-xs text-operator-ink">{chunk}</span>)}
            </div>
          ) : (
            <p className="mt-1 leading-6 text-operator-ink">{text.noReadableText}</p>
          )}
        </div>
      </div>
      <details className="mt-2 border-t border-operator-line pt-2 font-mono text-[11px]">
        <summary className="cursor-pointer font-sans text-xs font-semibold text-operator-muted">{text.technicalDetails}</summary>
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
          <MetaLine label={text.elementType} value={context.tag} />
          <MetaLine label={text.screenArea} value={context.rect} />
          <MetaLine label="aria-label" value={context.ariaLabel || "-"} />
          <MetaLine label="class" value={context.className || "-"} />
          <MetaLine label="path" value={context.domPath} wide />
          <MetaLine label={text.selectedText} value={context.text || "-"} wide />
        </div>
      </details>
    </div>
  );
}

function MetaLine({ label, value, wide = false }: { label: string; value: string; wide?: boolean }): React.JSX.Element {
  return (
    <div className={`border border-operator-line bg-operator-panel px-2 py-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mr-2 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-operator-muted">{label}</span>
      <span className="break-all text-operator-ink">{value}</span>
    </div>
  );
}

function Toast({ message }: { message: string }): React.JSX.Element {
  return (
    <motion.div className="operator-toast" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
      {message}
    </motion.div>
  );
}

function SelectionHighlightOverlay({ highlight }: { highlight: HighlightState }): React.JSX.Element {
  return (
    <div
      className="operator-feedback-selection-outline"
      data-mode={highlight.mode}
      data-testid="selection-outline"
      style={{
        left: highlight.rect.x,
        top: highlight.rect.y,
        width: highlight.rect.width,
        height: highlight.rect.height,
      }}
    />
  );
}

function magicWrightOptions(isEnglish: boolean): Array<{ preset: MagicWrightPreset; label: string; description: string }> {
  return isEnglish ? [
    { preset: "selected-copy", label: "Improve selected copy", description: "Rewrite this area in context." },
    { preset: "page-copy", label: "Improve page text", description: "Make the whole screen clearer." },
    { preset: "buttons-labels", label: "Improve actions", description: "Sharpen buttons, labels, and help text." },
  ] : [
    { preset: "selected-copy", label: "Verbeter deze tekst", description: "Herschrijf dit onderdeel in context." },
    { preset: "page-copy", label: "Verbeter paginacopy", description: "Maak het hele scherm duidelijker." },
    { preset: "buttons-labels", label: "Verbeter acties", description: "Verscherp knoppen, labels en helptekst." },
  ];
}

function buildMagicWrightComment(preset: MagicWrightPreset, isEnglish: boolean, context: ElementContext): string {
  const target = describeElement(context);
  const visibleText = context.text.trim() || (isEnglish ? "No readable selected text" : "Geen leesbare geselecteerde tekst");

  const commonEnglish = [
    "Magic Wright: improve UI copy using the whole page as context.",
    "Apply UX writing best practices: clear, human, action-oriented, consistent terms, no jargon, short button labels, helpful help text.",
    `Selected area: ${target}`,
    `Visible selected text: ${visibleText}`,
  ];
  const commonDutch = [
    "Magic Wright: verbeter UI-copy met de hele pagina als context.",
    "Gebruik UX-writing best practices: helder, menselijk, actiegericht, consistente termen, geen jargon, korte knoplabels en nuttige helptekst.",
    `Gekozen onderdeel: ${target}`,
    `Zichtbare geselecteerde tekst: ${visibleText}`,
  ];

  const instruction = isEnglish ? magicWrightInstructionEn(preset) : magicWrightInstructionNl(preset);
  return [...(isEnglish ? commonEnglish : commonDutch), instruction].join("\n");
}

function magicWrightInstructionEn(preset: MagicWrightPreset): string {
  if (preset === "selected-copy") return "Focus on rewriting the selected element copy, but keep it consistent with the rest of the page.";
  if (preset === "buttons-labels") return "Focus on buttons, labels, placeholders, helper text, empty states, and action wording across the page.";
  return "Review and improve all visible copy on the page so the flow feels logical and easy to understand.";
}

function magicWrightInstructionNl(preset: MagicWrightPreset): string {
  if (preset === "selected-copy") return "Focus op het herschrijven van de geselecteerde tekst, maar houd die consistent met de rest van de pagina.";
  if (preset === "buttons-labels") return "Focus op knoppen, labels, placeholders, helptekst, lege states en actieteksten op de hele pagina.";
  return "Bekijk en verbeter alle zichtbare copy op de pagina zodat de flow logisch en makkelijk te begrijpen voelt.";
}

function ScreenshotPreview({ title, src, fallback }: { title: string; src: string | null; fallback: string }): React.JSX.Element {
  return (
    <div className="operator-config-section">
      <p className="operator-label mb-2">{title}</p>
      {src ? <img src={src} alt={title} className="operator-screenshot-preview" /> : <p className="text-xs text-operator-muted">{fallback}</p>}
    </div>
  );
}

function readPersistedState(): PersistedFeedbackState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedFeedbackState : null;
  } catch {
    return null;
  }
}

function persistState(state: PersistedFeedbackState): void {
  try {
    if (state.jobs.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or privacy mode failures.
  }
}
