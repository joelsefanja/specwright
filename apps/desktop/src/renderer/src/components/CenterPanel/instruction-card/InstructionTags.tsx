import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { presenceTransition, presenceVariants } from "@renderer/motion/presets";

interface Props {
  inputValue: string;
  tags: string[];
  suggestions?: string[];
  onInputChange: (value: string) => void;
  onAddTag: () => void;
  onAddSuggestedTag?: (tag: string) => void;
  onRemoveTag: (index: number) => void;
  guidance?: string;
  explanations?: Array<{ tag: string; text: string }>;
  labels?: {
    title: string;
    help: string;
    placeholder: string;
    add: string;
    enter: string;
    suggestions: string;
  };
}

export function InstructionTags({ inputValue, tags, suggestions = [], onInputChange, onAddTag, onAddSuggestedTag, onRemoveTag, labels, guidance, explanations = [] }: Props): React.JSX.Element {
  const onSubModuleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onInputChange(event.target.value.replace(/^@+/, ""));
  };

  const onSubModuleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onAddTag();
  };

  return (
    <div>
      <label className="operator-control-label">{labels?.title ?? "Tags"}</label>
      <p className="operator-field-help mb-2 mt-1">{labels?.help ?? "Add labels so you can find and run this test later."}</p>
      {guidance && <p className="operator-tag-guidance mb-2">{guidance}</p>}
      {explanations.length > 0 && (
        <div className="operator-auto-label-explainer mb-2">
          {explanations.map((item, index) => (
            <motion.div
              key={item.tag}
              className="operator-auto-label-row"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: Math.min(index * 0.06, 0.18), ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="operator-auto-label-tag">{item.tag}</span>
              <span>{item.text}</span>
            </motion.div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <div className="operator-prefixed-field flex-1">
          <span className="operator-field-prefix">@</span>
          <input
            type="text"
            value={inputValue}
            onChange={onSubModuleInputChange}
            onKeyDown={onSubModuleKeyDown}
            placeholder={labels?.placeholder ?? "SubModule"}
            className="operator-field operator-field-prefixed flex-1 px-2 py-2"
          />
          <span className="operator-field-suffix">{labels?.enter ?? "ENTER"}</span>
        </div>
        <button
          onClick={onAddTag}
          className="operator-button operator-button-quiet px-2 py-2"
        >
          {labels?.add ?? "Add tag"}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="operator-field-help mr-1">{labels?.suggestions ?? "Suggested"}</span>
          {suggestions.map((tag) => (
            <button key={tag} type="button" className="operator-badge hover:border-[var(--sw-accent)]" onClick={() => onAddSuggestedTag?.(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {tags.length > 0 && (
          <motion.div className="flex flex-wrap gap-1 mt-2" variants={presenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
            {tags.map((tag, index) => (
              <motion.span
                key={tag}
                className="operator-badge"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => onRemoveTag(index)}
                  className="operator-text-accent hover:text-[var(--sw-danger)] ml-0.5"
                >
                  ×
                </button>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
