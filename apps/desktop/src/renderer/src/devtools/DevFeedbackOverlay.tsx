import React, { useEffect, useMemo, useRef, useState } from "react";
import { Browsers, CaretDown, ChatCircleText, CheckCircle, Copy, CursorClick, PaperPlaneTilt, Stop, TerminalWindow, WarningCircle, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusPill, type StatusPillProps } from "../components/ui";
import { useTranslations } from "../i18n/localeStore";

interface ElementContext {
  tag: string;
  text: string;
  ariaLabel: string;
  className: string;
  domPath: string;
  rect: string;
  captureRect: { x: number; y: number; width: number; height: number };
}

interface MenuState {
  x: number;
  y: number;
  context: ElementContext;
  screenshot: string | null;
}

interface HighlightState {
  rect: { x: number; y: number; width: number; height: number };
  mode: "hover" | "selected";
}

interface FeedbackJob {
  id: string;
  context: ElementContext;
  comment: string;
  contextScope?: ContextScope;
  output: string;
  rawOutput: string;
  activity: string;
  logs: string[];
  status: "running" | "done" | "error" | "applied" | "cancelled";
  beforeImage: string | null;
  afterImage: string | null;
  worktreePath?: string;
}

type ContextScope = "element" | "page";

interface PersistedFeedbackState {
  jobs: FeedbackJob[];
}

const STORAGE_KEY = "specwright.devFeedback.state";
const APPLY_FAILED_MESSAGE_NL = "De verbetering is gemaakt, maar kon niet automatisch worden overgenomen omdat bestanden ondertussen zijn gewijzigd. Je werk is bewaard. Probeer opnieuw of open de OpenCode-output voor details.";
const APPLY_FAILED_MESSAGE_EN = "The improvement was created, but could not be applied automatically because files changed in the meantime. Your work is saved. Try again or open the OpenCode output for details.";

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
  const draftOutputRef = useRef<Record<string, string>>({});

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

  const jobsRef = useRef<FeedbackJob[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const focusedJob = focusedJobId ? jobs.find((job) => job.id === focusedJobId) ?? null : null;
  const prompt = useMemo(() => {
    if (!dialog) return "";
    return buildPrompt(dialog.context, comment, contextScope);
  }, [comment, contextScope, dialog]);
  const runningCount = jobs.filter((job) => job.status === "running").length;
  const menuLeft = menu ? Math.min(menu.x, Math.max(12, window.innerWidth - 380)) : 0;
  const menuTop = menu ? Math.min(menu.y, Math.max(12, window.innerHeight - 188)) : 0;

  if (!import.meta.env.DEV && !window.specwright.devFeedback?.isE2E) return null;

  const openDialog = async (): Promise<void> => {
    if (!menu) return;
    setFocusedJobId(null);
    setDialog(menu);
    setComment("");
    setContextScope("element");
    setCopied(false);
    setSelectionHighlight(null);
    setMenu(null);
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
    setCopied(false);
    setFocusedJobId(null);
    void startFeedbackJob({
      context: job.context,
      contextScope: job.contextScope ?? "page",
      comment: job.comment,
      prompt: buildRetryPrompt(job),
      beforeImage: job.afterImage ?? job.beforeImage,
    });
  };

  const sendToBackground = (): void => {
    setDialog(null);
    setFocusedJobId(null);
    setSelectionHighlight(null);
    if (runningCount > 0) setNotice(text.close === "Close" ? "The improvement continues in the bottom-right panel." : "De verbetering loopt rechtsonder verder.");
  };

  return (
    <>
      {selectionHighlight && <SelectionHighlightOverlay highlight={selectionHighlight} />}
      {menu && (
        <motion.div
          className="operator-feedback-context-menu"
          style={{ left: menuLeft, top: menuTop }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" className="operator-feedback-context-action" onClick={() => void openDialog()}>
            <span className="operator-feedback-context-icon"><ChatCircleText size={20} weight="duotone" /></span>
            <span className="min-w-0">
              <span className="operator-feedback-context-kicker">{text.close === "Close" ? "Design feedback" : "Ontwerp-feedback"}</span>
              <span className="operator-feedback-context-title">{text.menuAction}</span>
              <span className="operator-feedback-context-copy">{text.close === "Close" ? "Ask OpenCode to improve this UI with the selected screen context." : "Laat OpenCode dit onderdeel verbeteren met de geselecteerde schermcontext."}</span>
              <span className="operator-feedback-context-target">{describeElement(menu.context, text)}</span>
            </span>
          </button>
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
                  <button type="button" className="operator-icon-button" onClick={sendToBackground} aria-label={text.close}>
                    <X size={15} weight="bold" />
                  </button>
                </div>
              </div>

              {focusedJob ? (
                <JobDetails job={focusedJob} text={text} onApply={() => void applyJob(focusedJob.id)} onCancel={() => void cancelJob(focusedJob.id)} onRetry={() => retryJob(focusedJob)} onContinue={(nextComment) => continueJob(focusedJob, nextComment)} />
              ) : dialog ? (
                <div className="operator-feedback-body operator-feedback-compose-body flex flex-col gap-3 px-3 py-3">
                  <ElementDetails context={dialog.context} text={text} />
                  {dialog.screenshot && (
                    <details className="operator-feedback-preview-disclosure border border-operator-line bg-operator-panel px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-operator-muted">{contextScope === "page" ? (isEnglish ? "Before: whole page" : "Voor: hele pagina") : text.element}</summary>
                      <div className="mt-3">
                        <ScreenshotPreview title={contextScope === "page" ? (isEnglish ? "Whole page" : "Hele pagina") : text.element} src={dialog.screenshot} fallback={text.screenshotUnavailable} />
                      </div>
                    </details>
                  )}
                  <div className="operator-feedback-scope-grid grid gap-2 sm:grid-cols-2">
                    <button type="button" className={contextScope === "element" ? "operator-feedback-scope operator-feedback-scope-active" : "operator-feedback-scope"} onClick={() => chooseContextScope("element")}>
                      <CursorClick size={15} weight="bold" className="mt-0.5 flex-shrink-0" />
                      <span>
                        <span className="block font-semibold">{text.close === "Close" ? "Element only" : "Alleen element"}</span>
                        <span className="block text-[11px] opacity-75">{text.close === "Close" ? "Screenshot of the selected element." : "Screenshot van het gekozen element."}</span>
                      </span>
                    </button>
                    <button type="button" className={contextScope === "page" ? "operator-feedback-scope operator-feedback-scope-active" : "operator-feedback-scope"} onClick={() => chooseContextScope("page")}>
                      <Browsers size={15} weight="bold" className="mt-0.5 flex-shrink-0" />
                      <span>
                        <span className="block font-semibold">{text.close === "Close" ? "Whole page" : "Hele pagina"}</span>
                        <span className="block text-[11px] opacity-75">{text.close === "Close" ? "Full-screen screenshot plus page text." : "Volledig screenshot plus paginatekst."}</span>
                      </span>
                    </button>
                  </div>
                  <div className="operator-feedback-request-field">
                    <label className="operator-control-label" htmlFor="operator-feedback-comment">{isEnglish ? "What should improve?" : "Wat moet beter?"}</label>
                    <textarea
                      id="operator-feedback-comment"
                      className="operator-field min-h-28 w-full flex-1 resize-none px-3 py-2"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      onKeyDown={onCommentKeyDown}
                      placeholder={isEnglish ? "Example: make the buttons clearer and reduce spacing." : "Bijvoorbeeld: maak de knoppen duidelijker en verklein de witruimte."}
                    />
                  </div>
                  <div className="operator-feedback-actions">
                    <p className="operator-field-help m-0">{comment.trim() ? (isEnglish ? "Ready to send to OpenCode." : "Klaar om naar OpenCode te sturen.") : feedbackCommentRequired}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="operator-button gap-2" onClick={() => void copyPrompt()} disabled={!comment.trim()}>
                        <Copy size={14} weight="bold" />
                        {copied ? text.copied : text.copyPrompt}
                      </button>
                      <button type="button" className="operator-button-primary gap-2" onClick={() => void runAgent()} disabled={!comment.trim()}>
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

function FeedbackJobsPanel({ jobs, runningCount, text, onOpen, onCancel, onRetry }: { jobs: FeedbackJob[]; runningCount: number; text: ReturnType<typeof useTranslations>["devFeedback"]; onOpen: (id: string) => void; onCancel: (id: string) => void; onRetry: (job: FeedbackJob) => void }): React.JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (jobs.length === 0) return null;
  const isEnglish = text.close === "Close";
  return (
    <motion.aside className={isCollapsed ? "operator-feedback-jobs operator-feedback-jobs-collapsed operator-panel border shadow-2xl" : "operator-feedback-jobs operator-panel border shadow-2xl"} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="operator-agent-panel-head">
        <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setIsCollapsed((value) => !value)}>
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
          <div key={job.id} className="operator-agent-run-card">
            <span className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 truncate text-left text-sm font-medium text-operator-ink" onClick={() => onOpen(job.id)}>{describeElement(job.context, text)}</button>
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

function JobDetails({ job, text, onApply, onCancel, onRetry, onContinue }: { job: FeedbackJob; text: ReturnType<typeof useTranslations>["devFeedback"]; onApply: () => void; onCancel: () => void; onRetry: () => void; onContinue: (comment: string) => void }): React.JSX.Element {
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
            <span className="operator-label">{isEnglish ? "Inspect" : "Controle"}</span>
          </div>
          <div className="operator-agent-readable-output">{displayPrimaryOutput(job, text)}</div>
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

function ElementDetails({ context, text }: { context: ElementContext; text: ReturnType<typeof useTranslations>["devFeedback"] }): React.JSX.Element {
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
      style={{
        left: highlight.rect.x,
        top: highlight.rect.y,
        width: highlight.rect.width,
        height: highlight.rect.height,
      }}
    />
  );
}

function ScreenshotPreview({ title, src, fallback }: { title: string; src: string | null; fallback: string }): React.JSX.Element {
  return (
    <div className="operator-config-section">
      <p className="operator-label mb-2">{title}</p>
      {src ? <img src={src} alt={title} className="operator-screenshot-preview" /> : <p className="text-xs text-operator-muted">{fallback}</p>}
    </div>
  );
}

function statusLabel(status: FeedbackJob["status"], text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  const isEnglish = text.close === "Close";
  if (status === "applied") return text.takenOver;
  if (status === "done") return text.jobDone;
  if (status === "error") return text.jobError;
  if (status === "cancelled") return text.jobCancelled;
  return isEnglish ? "Improving" : "Wordt verbeterd";
}

function displayActivity(activity: string, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  const isEnglish = text.close === "Close";
  if (activity === text.starting) return isEnglish ? "Starting the agent" : "Agent wordt gestart";
  if (activity === text.running) return isEnglish ? "Agent is writing live output" : "Agent schrijft live output";
  if (activity === text.preparing) return isEnglish ? "Workspace is ready" : "Werkruimte staat klaar";
  if (activity === text.applying) return isEnglish ? "Change is being applied" : "Wijziging wordt overgenomen";
  if (activity === text.finishing) return isEnglish ? "Build and result are being checked" : "Build en resultaat worden gecontroleerd";
  return activity;
}

function agentOutputTitle(text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  return text.close === "Close" ? "What OpenCode changed" : "Wat OpenCode aanpaste";
}

function decisionText(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  const isEnglish = text.close === "Close";
  if (job.status === "running") return isEnglish ? "OpenCode is drafting an improvement. You can keep working while it runs." : "OpenCode maakt een voorstel. Je kunt ondertussen doorwerken.";
  if (job.status === "done" && job.worktreePath) return isEnglish ? "A change is ready in a safe worktree. Review it before applying." : "Er staat een wijziging klaar in een veilige worktree. Controleer die voor je hem gebruikt.";
  if (job.status === "applied") return isEnglish ? "The improvement has been applied to this app." : "De verbetering is toegepast in deze app.";
  if (job.status === "error") return isEnglish ? "This attempt failed. The request is saved so you can retry." : "Deze poging lukte niet. De vraag is bewaard zodat je opnieuw kunt proberen.";
  if (job.status === "cancelled") return isEnglish ? "This attempt was stopped. Retry when you want OpenCode to continue." : "Deze poging is gestopt. Probeer opnieuw als OpenCode verder mag.";
  return isEnglish ? "Review the result and decide what to do next." : "Bekijk het resultaat en kies wat je daarna doet.";
}

function needsReviewLabel(text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  return text.close === "Close" ? "Needs review" : "Controle nodig";
}

function normalizeRestoredJob(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): FeedbackJob {
  const rawOutput = job.rawOutput ?? job.output ?? "";
  if (job.status === "running") {
    return { ...job, status: "cancelled", output: text.jobCancelled, rawOutput, activity: text.jobCancelled, logs: job.logs ?? [] };
  }
  if (job.status === "error" && isPatchConflictOutput(rawOutput || job.output)) {
    const needsReview = needsReviewLabel(text);
    return { ...job, status: "done", output: applyFailedMessage(text), rawOutput, activity: needsReview, logs: appendLog(job.logs ?? [], needsReview) };
  }
  return { ...job, rawOutput, activity: job.activity ?? statusLabel(job.status, text), logs: job.logs ?? [] };
}

function displayCardDetail(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  if (isPatchConflictOutput(job.rawOutput || job.output)) return applyFailedMessage(text);
  if (job.status === "running") return displayActivity(job.activity || text.running, text);
  return (job.output || job.activity || statusLabel(job.status, text)).trim();
}

function displayPrimaryOutput(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  if (isPatchConflictOutput(job.rawOutput || job.output)) return applyFailedMessage(text);
  return displayLiveOutput(job, text);
}

function shouldShowRawOutputInline(job: FeedbackJob): boolean {
  return job.status === "running";
}

function displayJobOutput(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  if (job.status === "running" && job.output === text.running) {
    return displayActivity(job.output, text);
  }
  return job.output;
}

function displayLiveOutput(job: FeedbackJob, text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  if (job.status === "running" && job.rawOutput.trim()) {
    return job.rawOutput;
  }
  return job.rawOutput.trim() ? job.rawOutput : displayJobOutput(job, text);
}

function compactProgressLogs(logs: string[], fallback: string, text: ReturnType<typeof useTranslations>["devFeedback"]): string[] {
  const visible = logs.filter((line) => !isTechnicalFeedbackLog(line));
  const compact = Array.from(new Set(visible.map((line) => displayActivity(line, text))));
  return (compact.length > 0 ? compact : [fallback]).slice(-4);
}

function isTechnicalFeedbackLog(line: string): boolean {
  const normalized = line.toLowerCase();
  return normalized.startsWith("worktree:")
    || normalized.includes("tool_call")
    || normalized.startsWith("[opencode]");
}

function applyFailedMessage(text: ReturnType<typeof useTranslations>["devFeedback"]): string {
  return text.close === "Close" ? APPLY_FAILED_MESSAGE_EN : APPLY_FAILED_MESSAGE_NL;
}

function isPatchConflictOutput(output: string | undefined): boolean {
  const normalized = (output ?? "").toLowerCase();
  return normalized.includes("patch does not apply") || normalized.includes("patch failed") || normalized.includes("does not match index");
}

function statusPillTone(status: FeedbackJob["status"]): StatusPillProps["status"] {
  if (status === "done" || status === "applied") return "success";
  if (status === "error" || status === "cancelled") return "warning";
  return "running";
}

function appendLog(logs: string[] | undefined, next: string): string[] {
  const current = logs ?? [];
  if (current.at(-1) === next) return current;
  return [...current, next].slice(-12);
}

function appendRawLine(current: string | undefined, next: string): string {
  if (!next.trim()) return current ?? "";
  return `${current ?? ""}${current ? "\n" : ""}${next}`;
}

function activityFromLog(line: string, text: ReturnType<typeof useTranslations>["devFeedback"]): string | null {
  const normalized = line.toLowerCase();
  if (normalized.includes("worktree") || normalized.includes("workspace")) return text.preparing;
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function getElementContext(target: EventTarget | null): ElementContext {
  const element = target instanceof Element ? target : document.body;
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    text: collectReadableText(element).slice(0, 700),
    ariaLabel: element.getAttribute("aria-label") ?? "",
    className: typeof element.className === "string" ? element.className : "",
    domPath: getDomPath(element),
    rect: `${Math.round(rect.width)}x${Math.round(rect.height)} @ ${Math.round(rect.left)},${Math.round(rect.top)}`,
    captureRect: padRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, 8),
  };
}

function collectReadableText(element: Element): string {
  const chunks: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const value = node.textContent?.trim().replace(/\s+/g, " ") ?? "";
      if (!value) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode() && chunks.length < 24) {
    const value = walker.currentNode.textContent?.trim().replace(/\s+/g, " ") ?? "";
    if (value && !chunks.includes(value)) chunks.push(value);
  }

  return chunks.join(" · ");
}

function summarizeVisibleText(value: string): string {
  if (!value) return "";
  return value.length > 240 ? `${value.slice(0, 240).trim()}...` : value;
}

function splitReadableText(value: string): string[] {
  return value
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function describeElement(context: ElementContext, text?: ReturnType<typeof useTranslations>["devFeedback"]): string {
  const isEnglish = text?.close === "Close";
  const className = context.className;
  if (className.includes("operator-titlebar")) return isEnglish ? "Top bar item" : "Onderdeel in de bovenbalk";
  if (context.tag === "textarea") return isEnglish ? "Text area" : "Tekstveld";
  if (context.tag === "select") return isEnglish ? "Select menu" : "Keuzelijst";
  if (className.includes("operator-field") || context.tag === "input") return isEnglish ? "Input field" : "Invoerveld";
  if (className.includes("operator-button-primary")) return isEnglish ? "Primary button" : "Primaire knop";
  if (className.includes("operator-button") || context.tag === "button") return isEnglish ? "Button" : "Knop";
  if (context.ariaLabel) return context.ariaLabel;
  return isEnglish ? "Selected element" : "Geselecteerd onderdeel";
}

function padRect(rect: { x: number; y: number; width: number; height: number }, padding: number): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

async function captureElementScreenshot(context: ElementContext): Promise<string | null> {
  const screenshot = await window.specwright.devFeedback?.captureScreenshot(context.captureRect);
  return screenshot?.ok && screenshot.dataUrl ? screenshot.dataUrl : null;
}

async function capturePageScreenshot(): Promise<string | null> {
  const screenshot = await window.specwright.devFeedback?.captureScreenshot({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return screenshot?.ok && screenshot.dataUrl ? screenshot.dataUrl : null;
}

function getDomPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 6) {
    const id = current.id ? `#${current.id}` : "";
    const className = typeof current.className === "string" && current.className
      ? `.${current.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    parts.unshift(`${current.tagName.toLowerCase()}${id}${className}`);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function buildPrompt(context: ElementContext, comment: string, scope: ContextScope): string {
  const pageText = scope === "page" ? collectReadableText(document.body).slice(0, 1600) : "";
  return [
    "Dev UI feedback from Specwright Desktop.",
    "",
    "User feedback:",
    comment,
    "",
    "Clicked element context:",
    `- friendly element: ${describeElement(context)}`,
    `- tag: ${context.tag}`,
    `- dom path: ${context.domPath}`,
    `- text: ${context.text || "-"}`,
    `- aria-label: ${context.ariaLabel || "-"}`,
    `- class: ${context.className || "-"}`,
    `- rect: ${context.rect}`,
    ...(scope === "page" ? ["", "Full page context:", pageText || "-"] : []),
    "",
    "Please locate the relevant React/component/source files, apply the requested UI improvement, keep the change minimal, and report compactly in the same language as the feedback. Do not narrate tool usage or plans.",
  ].join("\n");
}

function buildRetryPrompt(job: FeedbackJob): string {
  return [
    buildPrompt(job.context, job.comment, job.contextScope ?? "page"),
    "",
    "Retry context:",
    "The previous attempt did not make it into the real app successfully. Do not start from scratch; use the same requested UI change and the context below to fix or re-apply the change with the smallest safe edit.",
    `Previous status: ${job.status}`,
    `Previous visible result: ${job.output || "-"}`,
    `Previous OpenCode output: ${(job.rawOutput || "-").slice(-3000)}`,
    "If the previous patch conflicted, inspect the current files and re-create the intended change against the current source instead of applying the old patch blindly.",
  ].join("\n");
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
