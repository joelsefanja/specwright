import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { motionTransition, paletteVariants } from "@renderer/motion/presets";

type PaletteItem =
  | { kind: "module";   label: string; arg: string }
  | { kind: "workflow"; label: string; arg: string }
  | { kind: "script";  label: string; arg: string }
  | { kind: "custom";  label: string; arg: string };

const kindMeta: Record<PaletteItem["kind"], { code: string }> = {
  module: { code: "Module" },
  workflow: { code: "Workflow" },
  script: { code: "Script" },
  custom: { code: "Custom" },
};

export function RunTestsPalette({
  testScripts,
  featureModules,
  onRun,
  onClose,
  inputRef,
}: {
  testScripts: Record<string, string>;
  featureModules: { modules: string[]; workflows: string[] };
  onRun: (arg: string, options?: { headed?: boolean; integrated?: boolean }) => void | Promise<void>;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [launchingArg, setLaunchingArg] = useState<string | null>(null);
  const [headed, setHeaded] = useState(false);
  const [integrated, setIntegrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = React.useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = [];
    const allScript = Object.keys(testScripts).find((k) => k === "test:bdd" || k === "test:e2e") ?? "test:e2e";
    const workflowScript = Object.keys(testScripts).find((k) => k === "test:bdd:workflows" || k === "test:e2e:workflows") ?? allScript;
    items.push({ kind: "script", label: "All Tests", arg: allScript });
    for (const dir of featureModules.modules) {
      const label = dir.replace(/^@/, "");
      items.push({ kind: "module", label, arg: `${allScript} --grep @${label}` });
    }
    for (const dir of featureModules.workflows) {
      const label = dir.replace(/^@/, "");
      items.push({ kind: "workflow", label, arg: `${workflowScript} --grep @${label}` });
    }
    for (const [name, cmd] of Object.entries(testScripts)) {
      if (name === "test:bdd") continue;
      if (cmd.includes("--grep")) {
        items.push({ kind: "script", label: name, arg: name });
      }
    }
    return items;
  }, [featureModules, testScripts]);

  const filtered = React.useMemo((): PaletteItem[] => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (it) => it.label.toLowerCase().includes(q) || it.arg.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  const items = React.useMemo((): PaletteItem[] => {
    const q = query.trim();
    if (!q) return filtered;
    const isFilter = q.startsWith("@") || q.startsWith("--");
    if (!isFilter) return filtered;
    const exactMatch = filtered.some((it) => it.arg === q);
    if (exactMatch) return filtered;
    return [...filtered, { kind: "custom", label: `Run "${q}"`, arg: q }];
  }, [filtered, query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const launchRun = useCallback((arg: string): void => {
    if (launchingArg) return;
    setLaunchingArg(arg);
    window.setTimeout(() => {
      void onRun(arg, { headed, integrated });
    }, 360);
  }, [headed, integrated, launchingArg, onRun]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[activeIdx]) launchRun(items[activeIdx].arg); }
    else if (e.key === "Escape" && !launchingArg) { onClose(); }
  }, [items, activeIdx, launchRun, onClose, launchingArg]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none">
        <motion.div
          variants={paletteVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={motionTransition}
        >
          <div className="operator-panel operator-command pointer-events-auto border shadow-2xl flex flex-col overflow-hidden">
          <div className="operator-command-head">
            <span className="operator-label">Run</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search modules, workflows, scripts…"
              className="operator-command-input"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery("")} disabled={Boolean(launchingArg)} className="operator-command-clear">Clear</button>
            )}
            <kbd className="operator-command-kbd">esc</kbd>
          </div>

          <div ref={listRef} className="operator-command-list scrollable">
            {items.length === 0 ? (
              <p className="px-4 py-6 operator-muted text-xs text-center">No matches — type a tag like @auth or a script name</p>
            ) : (
              items.map((item, idx) => {
                const meta = kindMeta[item.kind];
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={`${item.kind}-${item.arg}`}
                    data-idx={idx}
                    onClick={() => launchRun(item.arg)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className="operator-command-item"
                    data-active={isActive}
                    data-launching={launchingArg === item.arg}
                    disabled={Boolean(launchingArg)}
                  >
                    <span className="operator-command-kind">
                      {meta.code}
                    </span>
                    <span className="operator-command-name">
                      {item.label}
                    </span>
                    <span className="operator-command-arg">
                      {item.arg}
                    </span>
                    {launchingArg === item.arg ? (
                      <span className="operator-command-launching"><span /> Preparing</span>
                    ) : isActive && (
                      <kbd className="operator-command-enter">Enter</kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="operator-command-footer">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> run</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
            <label className="operator-command-headed">
              <input
                type="checkbox"
                checked={headed}
                onChange={(event) => {
                  setHeaded(event.currentTarget.checked);
                  if (event.currentTarget.checked) setIntegrated(false);
                }}
                disabled={Boolean(launchingArg) || integrated}
              />
              visible browser
            </label>
            <label className="operator-command-headed" title="Run through the Desktop integrated browser via CDP. Forces one worker.">
              <input
                type="checkbox"
                checked={integrated}
                onChange={(event) => {
                  setIntegrated(event.currentTarget.checked);
                  if (event.currentTarget.checked) setHeaded(false);
                }}
                disabled={Boolean(launchingArg)}
              />
              integrated browser
            </label>
            <span className="ml-auto">{launchingArg ? "Preparing run view..." : "or type a custom filter: @tag · --grep · --project"}</span>
          </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
