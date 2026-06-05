import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChartBar, Play, Plus } from "@phosphor-icons/react";
import WelcomeScreen from "./WelcomeScreen";
import InstructionsBuilder from "./InstructionsBuilder";
import HealerPanel from "./HealerPanel";
import { AgentOutputPanel } from "./agent-output";
import { RunTestsPalette } from "./run-tests-palette";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore } from "@renderer/store/instruction.store";
import { useReportAvailability } from "@renderer/hooks/useReportAvailability";
import { detectPhaseFromTool, detectPhaseFromText } from "@renderer/hooks/usePhaseDetection";
import { motionTransition, panelVariants } from "@renderer/motion/presets";

export default function CenterPanel({ headless = false }: { headless?: boolean }): React.JSX.Element | null {
  const { appendToken, appendLog, finishRun, setError, abortRun, setActivePhase, setPhaseStatus, splitForPhase, status, setMcpStatus, updateDirectRun } = usePipelineStore();
  const { projectState, loaded, hydrate, activeTab, setActiveTab, projectPath } = useConfigStore();
  const addInstruction = useInstructionStore((s) => s.addCard);
  const lastPhaseRef = React.useRef<number>(0);
  const runId = usePipelineStore((s) => s.runId);

  // Reset per-run phase tracking on every fresh run
  useEffect(() => {
    lastPhaseRef.current = 0;
  }, [runId]);

  // ── Run Tests picker state ───────────────────────────────────────────────────
  const [showRunPicker, setShowRunPicker] = useState(false);
  const [testScripts, setTestScripts] = useState<Record<string, string>>({});
  const [featureModules, setFeatureModules] = useState<{ modules: string[]; workflows: string[] }>({ modules: [], workflows: [] });
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectPath) return;
    window.specwright.project.readFeatureModules(projectPath).then(setFeatureModules);
  }, [projectPath]);

  const hasTests = featureModules.modules.length > 0 || featureModules.workflows.length > 0;

  // ── Reports ──────────────────────────────────────────────────────────────────
  const { reportAvailability, showReportMenu, setShowReportMenu, reportMenuRef, checkReportAvailability } = useReportAvailability();

  const openRunPicker = useCallback(async () => {
    if (projectPath) {
      const [scripts, modules] = await Promise.all([
        window.specwright.project.readTestScripts(projectPath),
        window.specwright.project.readFeatureModules(projectPath),
      ]);
      setTestScripts(scripts);
      setFeatureModules(modules);
    }
    setShowRunPicker(true);
    setTimeout(() => customInputRef.current?.focus(), 80);
  }, [projectPath]);

  const closeRunPicker = useCallback(() => {
    setShowRunPicker(false);
  }, []);

  const handleRunTests = useCallback(async (arg: string, options?: { headed?: boolean; integrated?: boolean }) => {
    closeRunPicker();
    const { startRun, appendLog, appendToken, setError } = usePipelineStore.getState();
    const browserFlag = options?.integrated ? " --integrated-browser" : options?.headed ? " --headed" : "";
    const userMessage = `/e2e-run ${arg}${browserFlag}`.trim();
    startRun(userMessage);
    const browserLabel = options?.integrated ? " (integrated browser)" : options?.headed ? " (visible browser)" : "";
    appendLog(`[runner] Starting direct test run: ${arg || "all tests"}${browserLabel}`);
    appendToken(`Starting direct test run: ${arg || "all tests"}${options?.integrated ? "\nBrowser: Desktop integrated browser via CDP" : options?.headed ? "\nBrowser: visible Playwright window" : ""}\n\nWaiting for command resolution...\n`);
    const { skipPermissions } = useConfigStore.getState();
    try {
      await window.specwright.pipeline.start({ userMessage, mode: "claude-code", skipPermissions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`[runner] Failed to start direct test run: ${message}`);
      setError(message);
    }
  }, [closeRunPicker]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const { showPermission } = usePipelineStore();

  const advanceToPhase = useCallback((phaseId: number) => {
    if (!phaseId || phaseId === lastPhaseRef.current) return;
    if (phaseId < lastPhaseRef.current) return;

    if (lastPhaseRef.current > 0) {
      setPhaseStatus(lastPhaseRef.current, "done");
    }

    for (let i = lastPhaseRef.current + 1; i < phaseId; i++) {
      setPhaseStatus(i, "done");
    }

    setActivePhase(phaseId);
    splitForPhase(phaseId);
    lastPhaseRef.current = phaseId;
  }, [setActivePhase, setPhaseStatus, splitForPhase]);

  const handleToken = useCallback((token: string) => {
    appendToken(token);

    for (let i = 0; i < 10; i++) {
      const { messages } = usePipelineStore.getState();
      const lastMsg = messages[messages.length - 1];
      if (!(lastMsg?.role === "assistant" && lastMsg.content)) break;

      const detected = detectPhaseFromText(lastMsg.content.slice(-2000), lastPhaseRef.current);
      if (!detected || detected <= lastPhaseRef.current) break;
      advanceToPhase(detected);
    }
  }, [appendToken, advanceToPhase]);

  // Wire IPC events
  useEffect(() => {
    const offToken = window.specwright.pipeline.onToken(({ token }) => handleToken(token));
    const offDone  = window.specwright.pipeline.onDone(({ fullText, sessionId, userMessage }) => {
      if (lastPhaseRef.current > 0) {
        setPhaseStatus(lastPhaseRef.current, "done");
      }
      finishRun(fullText, sessionId, userMessage);
      checkReportAvailability();
    });
    const offError = window.specwright.pipeline.onError(({ error }) => setError(error));
    const offAborted = window.specwright.pipeline.onAborted(({ fullText }) => abortRun(fullText || "Aborted by user"));
    const offLog   = window.specwright.pipeline.onLog(({ line }) => {
      appendLog(line);

      if (line.startsWith("[tool]")) {
        if (lastPhaseRef.current === 0) advanceToPhase(1);

        if (line.startsWith("[tool] Skill:")) {
          const skillName = line.replace("[tool] Skill:", "").trim();
          const phase = detectPhaseFromTool("Skill", skillName);
          if (phase) advanceToPhase(phase);
        }

        if (line.startsWith("[tool] Agent:")) {
          const agentDetail = line.replace("[tool] Agent:", "").trim();
          const phase = detectPhaseFromTool("Agent", agentDetail);
          if (phase) advanceToPhase(phase);
        }
      }
    });
    const offDirectRunUpdate = window.specwright.pipeline.onDirectRunUpdate((patch) => {
      updateDirectRun(patch);
    });
    const offPerm  = window.specwright.pipeline.onPermissionRequest((request) => {
      showPermission({ ...request, timestamp: Date.now() });
    });
    const offToolStart = window.specwright.pipeline.onToolStart(({ toolName }) => {
      if (toolName === "Skill" || toolName === "Agent") {
        // detail handled via log line
      }
      if (lastPhaseRef.current === 0) advanceToPhase(1);
    });
    const offToolEnd = window.specwright.pipeline.onToolEnd(() => {});
    const offMcpStatus = window.specwright.pipeline.onMcpStatus(({ server, status: mcpSt }) => {
      setMcpStatus(server, mcpSt);
    });
    return () => {
      offToken(); offDone(); offError(); offAborted(); offLog();
      offPerm(); offToolStart(); offToolEnd(); offMcpStatus(); offDirectRunUpdate();
    };
  }, [handleToken, appendLog, finishRun, setError, abortRun, setPhaseStatus, showPermission, advanceToPhase, setMcpStatus, updateDirectRun, checkReportAvailability]);

  if (headless) {
    return null;
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    );
  }

  if (projectState === "none" || projectState === "bootstrapping" || projectState === "error") {
    return <WelcomeScreen />;
  }

  const showOutput = status === "running" || status === "done" || status === "error" || status === "aborted";
  const hasReports = reportAvailability.playwright || reportAvailability.bdd || reportAvailability.allure;

  const reportDropdown = (
    <div className="relative" ref={reportMenuRef}>
      <button
        onClick={() => setShowReportMenu((v) => !v)}
        className="operator-button gap-1 py-1"
      >
        <ChartBar className="operator-icon" weight="bold" /> Reports <span className="opacity-60">▾</span>
      </button>
      {showReportMenu && (
        <div className="operator-menu absolute right-0 top-full mt-1 z-50 min-w-[170px] py-1">
          {!hasReports && <p className="operator-field-help m-0 px-3 py-2">Run tests first to create a report.</p>}
          <button
            disabled={!reportAvailability.allure}
            onClick={() => { setShowReportMenu(false); window.specwright.report.openAllure(projectPath!); }}
            className="operator-menu-item"
          >
            Allure Report
          </button>
          <button
            disabled={!reportAvailability.playwright}
            onClick={() => { setShowReportMenu(false); window.specwright.report.openPlaywright(projectPath!); }}
            className="operator-menu-item"
          >
            Playwright Report
          </button>
          <button
            disabled={!reportAvailability.bdd}
            onClick={() => { setShowReportMenu(false); window.specwright.report.openBdd(projectPath!); }}
            className="operator-menu-item"
          >
            BDD Report
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar — shown when pipeline is NOT running */}
      {!showOutput && (
        <div className="operator-toolbar-top flex items-center justify-between">
          <div className="operator-tabs">
            <button
              onClick={() => setActiveTab("explorer")}
              className="operator-tab"
              data-active={activeTab === "explorer"}
            >
              {activeTab === "explorer" && (
                <motion.span className="operator-tab-indicator" layoutId="operator-tab-indicator" transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} />
              )}
              <span className="operator-tab-label">
              Create Tests
              </span>
            </button>
            <button
              onClick={() => setActiveTab("healer")}
              className="operator-tab"
              data-active={activeTab === "healer"}
            >
              {activeTab === "healer" && (
                <motion.span className="operator-tab-indicator" layoutId="operator-tab-indicator" transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} />
              )}
              <span className="operator-tab-label">
              Repair Tests
              </span>
            </button>
          </div>
          <div className="operator-toolbar-actions">
            {activeTab === "explorer" && (
              <button onClick={addInstruction} className="operator-button-primary gap-2">
                <Plus className="operator-icon" weight="bold" /> Add instruction
              </button>
            )}
            {hasTests && (
              <button
                onClick={openRunPicker}
                className="operator-button-primary operator-toolbar-action-primary"
              >
                <Play className="operator-icon" weight="fill" /> Run Tests
              </button>
            )}
            {hasReports && reportDropdown}
          </div>
        </div>
      )}

      {/* Reports bar — shown after run completes */}
      {showOutput && status === "done" && hasReports && (
        <div className="operator-toolbar-compact flex items-center justify-end">
          {reportDropdown}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={showOutput ? "output" : activeTab}
            className="flex-1 min-h-0 flex flex-col"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={motionTransition}
          >
            {showOutput ? (
              <AgentOutputPanel onOpenRunPicker={openRunPicker} />
            ) : activeTab === "healer" ? (
              <HealerPanel />
            ) : (
              <InstructionsBuilder />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showRunPicker && (
          <RunTestsPalette
            testScripts={testScripts}
            featureModules={featureModules}
            onRun={handleRunTests}
            onClose={closeRunPicker}
            inputRef={customInputRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
