import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Plus } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore } from "@renderer/store/instruction.store";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import InstructionCard from "./instruction-card";
import { ContextHeader, EmptyState } from "../common/Discoverability";

const instructionsCache = new Map<string, object[]>();
const instructionsInflight = new Map<string, Promise<object[]>>();

export default function InstructionsBuilder(): React.JSX.Element {
  const { projectPath, envVars } = useConfigStore();
  const { cards, addCard, clearAll, serialize, loadCards } = useInstructionStore();
  const { status, startRun, setError } = usePipelineStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suppressCardMotion, setSuppressCardMotion] = useState(false);

  // isRunning is true while submitting OR while the pipeline store says running
  const isRunning = isSubmitting || status === "running";

  // Generate requires at least one card with a module name and content.
  const hasValidCard = cards.some(
    (c) => c.moduleName.trim() && (c.steps.some((s) => s.trim()) || c.filePath?.trim())
  );

  // If auth is oauth and required, email must be filled
  const authStrategy = (envVars.AUTH_STRATEGY || "none") as string;
  const authNeedsEmail = authStrategy === "oauth" && !envVars.TEST_USER_EMAIL?.trim();
  const canGenerate = hasValidCard && !authNeedsEmail;
  const generateBlockedReason = isRunning
    ? "Wacht tot de huidige run klaar is."
    : !projectPath
      ? "Kies eerst een projectmap."
      : authNeedsEmail
        ? "Vul eerst het OAuth e-mailadres in."
        : !hasValidCard
          ? "Beschrijf eerst minimaal één scenario met app-deel en stappen of bron."
          : "";

  const handleDiscard = (): void => {
    setSuppressCardMotion(true);
    clearAll();
    requestAnimationFrame(() => setSuppressCardMotion(false));
  };

  // Load existing instructions from disk on mount
  useEffect(() => {
    if (!projectPath) return;
    const cached = instructionsCache.get(projectPath);
    if (cached) {
      if (cached.length > 0) loadCards(cached as Parameters<typeof loadCards>[0]);
      return;
    }
    const request = instructionsInflight.get(projectPath) ?? window.specwright.project.readInstructions(projectPath).then((loaded) => {
      instructionsCache.set(projectPath, loaded);
      instructionsInflight.delete(projectPath);
      return loaded;
    });
    instructionsInflight.set(projectPath, request);
    request.then((loaded) => {
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
      const userMessage = `Run the /e2e-automate skill to execute the full E2E test automation pipeline. The instructions.js file has been saved. Read it from e2e-tests/instructions.js and execute all phases.`;
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
        <ContextHeader
          eyebrow="Test maken"
          title="Beschrijf een test"
          description="Geef aan wat de gebruiker moet kunnen doen. Voeg daarna een ticket, bestand of eigen beschrijving toe."
        />
        {cards.length === 0 && (
          <EmptyState
            title="Nog geen test beschreven"
            description="Begin met één scenario. Je kunt later extra tests toevoegen."
            action={<button onClick={addCard} className="operator-button-primary gap-2"><Plus className="operator-icon" weight="bold" /> Scenario toevoegen</button>}
          />
        )}
        {suppressCardMotion ? (
          cards.map((card, i) => <InstructionCard key={card.id} card={card} index={i} />)
        ) : (
          <AnimatePresence initial={false}>
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <InstructionCard card={card} index={i} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Validation error banner */}
      {saveError && (
        <div className="flex-shrink-0 px-4 py-2 border-t" style={{ background: "rgba(217,120,104,0.1)", borderColor: "rgba(217,120,104,0.45)" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="operator-danger text-xs flex items-center gap-1">
              <span className="operator-label operator-danger">Niet gelukt</span> {saveError}
            </p>
            <button
              onClick={() => setSaveError(null)}
              className="operator-danger text-xs flex-shrink-0 opacity-70 hover:opacity-100"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="operator-toolbar flex items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {authNeedsEmail && (
            <span className="operator-danger text-xs">OAuth e-mailadres nodig</span>
          )}
          <button
            onClick={handleDiscard}
            disabled={isRunning || cards.length === 0}
            className="operator-button operator-button-secondary hover:border-[var(--sw-danger)] hover:text-[var(--sw-danger)]"
          >
            Wissen
          </button>
          <button
            onClick={handleGenerate}
            disabled={isRunning || !projectPath || !canGenerate}
            className="operator-button-primary gap-2"
          >
            {isRunning ? (
              <>
                <span className="operator-loading-spinner h-3.5 w-3.5" />
                Bezig
              </>
            ) : (
              <>
                <Play className="operator-icon" weight="fill" /> Test maken
              </>
            )}
          </button>
        </div>
        {cards.length === 0 && !isRunning && <p className="operator-field-help m-0">Voeg eerst een scenario toe voordat je kunt wissen.</p>}
        {generateBlockedReason && <p className="operator-field-help m-0">{generateBlockedReason}</p>}
      </div>
    </div>
  );
}
