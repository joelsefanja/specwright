import React, { useState, useCallback } from "react";
import { useConfigStore } from "@renderer/store/config.store";
import { usePipelineStore } from "@renderer/store/pipeline.store";

export default function HealerPanel(): React.JSX.Element {
  const { projectPath } = useConfigStore();
  const { status, startRun, setError } = usePipelineStore();
  const [paths, setPaths] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRunning = isSubmitting || status === "running";

  const handleBrowse = useCallback(async () => {
    const selected = await window.specwright.project.pickFiles();
    if (selected.length > 0) {
      setPaths((prev) => {
        const existing = new Set(prev);
        return [...prev, ...selected.filter((p) => !existing.has(p))];
      });
    }
  }, []);

  const removePath = useCallback((index: number) => {
    setPaths((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleHeal = useCallback(async () => {
    if (isRunning || !projectPath) return;
    setIsSubmitting(true);
    try {
      // Build the heal command
      const pathArgs = paths.length > 0 ? paths.join(" ") : "";
      let userMessage = `Run the /e2e-heal skill to diagnose and fix failing E2E tests.`;
      if (pathArgs) {
        userMessage += `\n\nTarget files/directories:\n${paths.map((p) => `- ${p}`).join("\n")}`;
      } else {
        userMessage += `\n\nHeal all failing tests in the project.`;
      }
      if (instructions.trim()) {
        userMessage += `\n\nAdditional instructions:\n${instructions.trim()}`;
      }

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
  }, [isRunning, projectPath, paths, instructions, startRun, setError]);

  // Shorten path for display — show relative to project
  const displayPath = (fullPath: string): string => {
    if (projectPath && fullPath.startsWith(projectPath)) {
      return fullPath.slice(projectPath.length + 1);
    }
    return fullPath.split("/").slice(-3).join("/");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Content — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollable px-5 pt-5 pb-4 space-y-4 bg-operator-canvas">
        {/* Files to heal */}
        <div>
          <label className="text-stone-300 text-[13.5px] font-semibold mb-2 block">
            Files to Heal
          </label>
          <p className="operator-muted text-xs mb-3">
            Select test files or directories with failing tests. Leave empty to heal all failures.
          </p>

          {/* Path chips */}
          {paths.length > 0 && (
            <div className="space-y-2 mb-3">
              {paths.map((p, i) => {
                const basename = p.split("/").pop() ?? "";
                const isDir = !basename.includes(".");
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-operator-field border border-operator-line px-3 py-2"
                  >
                    <span className="operator-label text-brand-400">{isDir ? "DIR" : "FILE"}</span>
                    <span className="flex-1 text-stone-300 text-xs font-mono truncate" title={p}>
                      {displayPath(p)}
                    </span>
                    <button
                      onClick={() => removePath(i)}
                      disabled={isRunning}
                      className="operator-muted hover:text-[var(--sw-danger)] text-xs transition-colors flex-shrink-0 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={handleBrowse}
            disabled={isRunning}
            className="operator-button w-full justify-center border-dashed py-2"
          >
            Add file or directory
          </button>
        </div>

        {/* Instructions */}
        <div>
          <label className="text-stone-300 text-[13.5px] font-semibold mb-2 block">
            Instructions <span className="operator-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={isRunning}
            placeholder="Describe what's failing or what to fix…&#10;e.g., &quot;The year tab selectors changed from buttons to links&quot;"
            rows={4}
            className="operator-field w-full px-3 py-2 text-[13.5px] placeholder-stone-600 resize-none disabled:opacity-40"
          />
        </div>

        {/* Info */}
        <div className="operator-panel border px-4 py-3">
          <p className="text-stone-400 text-xs leading-relaxed">
            The healer agent will run the tests, diagnose failures (selector, timeout, assertion, data issues),
            and auto-fix step definitions. It loops up to 3 times until tests pass.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="operator-toolbar flex items-center justify-end">
        <button
          onClick={handleHeal}
          disabled={isRunning || !projectPath}
          className="operator-button-primary disabled:opacity-40"
        >
          {isRunning ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent animate-spin" />
              Healing
            </>
          ) : (
            <>
              Heal
            </>
          )}
        </button>
      </div>
    </div>
  );
}
