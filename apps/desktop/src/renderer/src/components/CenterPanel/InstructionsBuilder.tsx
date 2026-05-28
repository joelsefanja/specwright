import React, { useEffect, useState } from "react";
import { Play, Plus } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore } from "@renderer/store/instruction.store";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import InstructionCard from "./InstructionCard";

export default function InstructionsBuilder(): React.JSX.Element {
  const { projectPath, envVars } = useConfigStore();
  const { cards, addCard, clearAll, serialize, loadCards } = useInstructionStore();
  const { status, startRun, setError, atlassianStatus } = usePipelineStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showJiraSource = envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true";

  // isRunning is true while submitting OR while the pipeline store says running
  const isRunning = isSubmitting || status === "running";

  // Generate requires at least one card with a module name and at least one non-empty step or a Jira URL
  const hasValidCard = cards.some(
    (c) => c.moduleName.trim() && (c.steps.some((s) => s.trim()) || c.jiraURL?.trim() || c.filePath?.trim())
  );

  // If any card uses a Jira URL, Atlassian must be connected
  const hasJiraCard = showJiraSource && cards.some((c) => c.jiraURL?.trim());
  const jiraNeedsAuth = hasJiraCard && atlassianStatus !== "connected";

  // If auth is oauth and required, email must be filled
  const authStrategy = (envVars.AUTH_STRATEGY || "none") as string;
  const authNeedsEmail = authStrategy === "oauth" && !envVars.TEST_USER_EMAIL?.trim();
  const canGenerate = hasValidCard && !authNeedsEmail && !jiraNeedsAuth;

  // Load existing instructions from disk on mount
  useEffect(() => {
    if (!projectPath) return;
    window.specwright.project.readInstructions(projectPath).then((loaded) => {
      if (loaded.length > 0) loadCards(loaded);
    });
  }, [projectPath, loadCards]);

  const [saveError, setSaveError] = useState<string | null>(null);

  /** Validate and normalize pageURLs before saving */
  const validateAndNormalizeInstructions = (
    instructions: Array<Record<string, unknown>>,
    baseUrl: string
  ): string | null => {
    for (let i = 0; i < instructions.length; i++) {
      const card = instructions[i];
      const pageURL = (card.pageURL as string) ?? "";

      if (!pageURL) continue; // empty is OK — exploration won't run

      // Relative path → prepend BASE_URL
      if (pageURL.startsWith("/")) {
        if (!baseUrl) {
          return `Instruction ${i + 1}: Page URL "${pageURL}" is a relative path but no App URL is configured in Settings.`;
        }
        card.pageURL = `${baseUrl}${pageURL}`;
        continue;
      }

      // Full URL → validate format
      try {
        const parsed = new URL(pageURL);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return `Instruction ${i + 1}: Page URL "${pageURL}" must use http:// or https:// protocol.`;
        }
      } catch {
        return `Instruction ${i + 1}: Page URL "${pageURL}" is not a valid URL. Use a full URL (http://...) or a relative path (/path).`;
      }
    }
    return null; // no errors
  };

  /** Save instructions to disk. Returns true if successful, false if validation failed. */
  const handleSave = async (): Promise<boolean> => {
    if (!projectPath) return false;
    setSaveError(null);

    const instructions = serialize();
    const baseUrl = (envVars.BASE_URL || "").replace(/\/$/, "");

    const error = validateAndNormalizeInstructions(
      instructions as Array<Record<string, unknown>>,
      baseUrl
    );
    if (error) {
      setSaveError(error);
      return false;
    }

    await window.specwright.project.writeInstructions(projectPath, instructions);
    return true;
  };

  const handleGenerate = async (): Promise<void> => {
    if (isRunning) return;
    setIsSubmitting(true);
    setSaveError(null);
    try {
      const saved = await handleSave();
      if (!saved) { setIsSubmitting(false); return; }
      const userMessage = `Run the /e2e-automate skill to execute the full E2E test automation pipeline. The instructions.js file has been saved and is ready. Read it from e2e-tests/instructions.js and execute all phases.`;
      startRun(userMessage);
      const { skipPermissions } = useConfigStore.getState();
      await window.specwright.pipeline.start({
        userMessage,
        mode: "claude-code",
        skipPermissions,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Instruction cards — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollable px-5 pt-5 pb-4 space-y-3 bg-operator-canvas">
        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="operator-label mb-3">No Instructions</p>
            <p className="text-stone-600 text-xs max-w-xs leading-relaxed">
              Define a module, source, and expected workflow before starting generation. Templates remain available in the inspection rail.
            </p>
          </div>
        )}
        {cards.map((card, i) => (
          <InstructionCard key={card.id} card={card} index={i} />
        ))}
      </div>

      {/* Validation error banner */}
      {saveError && (
        <div className="flex-shrink-0 px-4 py-2 border-t" style={{ background: "rgba(217,120,104,0.1)", borderColor: "rgba(217,120,104,0.45)" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="operator-danger text-xs flex items-center gap-1">
              <span className="operator-label operator-danger">Error</span> {saveError}
            </p>
            <button
              onClick={() => setSaveError(null)}
              className="operator-danger text-xs flex-shrink-0 opacity-70 hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="operator-toolbar flex items-center justify-between gap-3">
        <button
          onClick={addCard}
          className="operator-button gap-2"
        >
          <Plus className="operator-icon" weight="bold" />
          Instruction
        </button>

        <div className="flex items-center gap-2">
          {authNeedsEmail && (
            <span className="text-amber-400 text-xs">OAuth email required</span>
          )}
          <button
            onClick={clearAll}
            disabled={isRunning || cards.length === 0}
            className="operator-button hover:border-[var(--sw-danger)] hover:text-[var(--sw-danger)]"
          >
            Discard
          </button>
          <button
            onClick={handleGenerate}
            disabled={isRunning || !projectPath || !canGenerate}
            title={jiraNeedsAuth ? "Connect Atlassian to use Jira URL" : undefined}
            className="operator-button-primary gap-2"
          >
            {isRunning ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent animate-spin" />
                Running
              </>
            ) : (
              <>
                <Play className="operator-icon" weight="fill" /> Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
