import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { motionTransition, paletteVariants } from "@renderer/motion/presets";
import { RunTestsPaletteItem } from "./RunTestsPaletteItem";
import {
  addCustomRunTestsPaletteItem,
  buildRunTestsPaletteItems,
  filterRunTestsPaletteItems,
  type RunTestsFeatureModules,
  type RunTestsPaletteItem as RunTestsPaletteItemData,
} from "./runTestsPaletteItems";
import {
  getNextRunTestsPaletteIndex,
  getPreviousRunTestsPaletteIndex,
  getRunTestsPaletteKeyboardAction,
} from "./runTestsPaletteKeyboard";

export function RunTestsPalette({
  testScripts,
  featureModules,
  onRun,
  onClose,
  inputRef,
}: {
  testScripts: Record<string, string>;
  featureModules: RunTestsFeatureModules;
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

  const allItems = React.useMemo(
    (): RunTestsPaletteItemData[] => buildRunTestsPaletteItems({ testScripts, featureModules }),
    [featureModules, testScripts]
  );

  const filtered = React.useMemo(
    (): RunTestsPaletteItemData[] => filterRunTestsPaletteItems(allItems, query),
    [allItems, query]
  );

  const items = React.useMemo(
    (): RunTestsPaletteItemData[] => addCustomRunTestsPaletteItem(filtered, query),
    [filtered, query]
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const launchRun = useCallback((arg: string): void => {
    if (launchingArg) {
      return;
    }

    setLaunchingArg(arg);
    window.setTimeout(() => {
      void onRun(arg, { headed, integrated });
    }, 360);
  }, [headed, integrated, launchingArg, onRun]);

  const onInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>): void => {
    const action = getRunTestsPaletteKeyboardAction(event.key, !launchingArg);

    if (action === "next") {
      event.preventDefault();
      setActiveIdx((index) => getNextRunTestsPaletteIndex(index, items.length));
      return;
    }

    if (action === "previous") {
      event.preventDefault();
      setActiveIdx((index) => getPreviousRunTestsPaletteIndex(index));
      return;
    }

    if (action === "run") {
      event.preventDefault();

      if (items[activeIdx]) {
        launchRun(items[activeIdx].arg);
      }

      return;
    }

    if (action === "close") {
      onClose();
    }
  }, [items, activeIdx, launchRun, onClose, launchingArg]);

  function onQueryChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
  }

  function onClearQueryClick(): void {
    setQuery("");
  }

  function onHeadedChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const isChecked = event.currentTarget.checked;
    setHeaded(isChecked);

    if (isChecked) {
      setIntegrated(false);
    }
  }

  function onIntegratedChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const isChecked = event.currentTarget.checked;
    setIntegrated(isChecked);

    if (isChecked) {
      setHeaded(false);
    }
  }

  return (
    <>
      <div className="operator-command-backdrop" onClick={onClose} />
      <div className="operator-command-overlay pointer-events-none">
        <motion.div
          variants={paletteVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={motionTransition}
        >
          <div className="operator-panel operator-command pointer-events-auto border shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Test starten">
          <div className="operator-command-head">
            <span className="operator-label">Test starten</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={onQueryChange}
              onKeyDown={onInputKeyDown}
              placeholder="Zoek een test of opdracht..."
              className="operator-command-input"
              autoFocus
            />
            {query && (
              <button onClick={onClearQueryClick} disabled={Boolean(launchingArg)} className="operator-command-clear">Wissen</button>
            )}
            <kbd className="operator-command-kbd">esc</kbd>
          </div>

          <div ref={listRef} className="operator-command-list scrollable">
            {items.length === 0 ? (
              <p className="px-4 py-6 operator-muted text-xs text-center">No matches — type a tag like @auth or a script name</p>
            ) : (
              items.map((item, index) => {
                const isActive = index === activeIdx;
                return (
                  <RunTestsPaletteItem
                    key={`${item.kind}-${item.arg}`}
                    item={item}
                    index={index}
                    isActive={isActive}
                    isLaunching={launchingArg === item.arg}
                    isDisabled={Boolean(launchingArg)}
                    onRunItem={launchRun}
                    onActivateItem={setActiveIdx}
                  />
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
                onChange={onHeadedChange}
                disabled={Boolean(launchingArg) || integrated}
              />
              visible browser
            </label>
            <label className="operator-command-headed" title="Run through the Desktop integrated browser via CDP. Forces one worker.">
              <input
                type="checkbox"
                checked={integrated}
                onChange={onIntegratedChange}
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
