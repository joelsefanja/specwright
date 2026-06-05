import React from "react";
import type { InstructionCard as ICard } from "@renderer/store/instruction.store";
import { useLanguageStore } from "@renderer/i18n/localeStore";

export type GenerationOptionKey = "explore" | "runExploredCases" | "runGeneratedCases" | "autoApprove";

interface GenerationOption {
  key: GenerationOptionKey;
  label: string;
  description: string;
}

interface Props {
  card: Pick<ICard, GenerationOptionKey>;
  onToggleOption: (key: GenerationOptionKey, active: boolean) => void;
}

export function GenerationOptions({ card, onToggleOption }: Props): React.JSX.Element {
  const language = useLanguageStore((state) => state.language);
  const copy = language === "nl" ? generationOptionsCopy.nl : generationOptionsCopy.en;
  const options: GenerationOption[] = [
    { key: "explore", label: copy.exploreLabel, description: copy.exploreDescription },
    { key: "runGeneratedCases", label: copy.runGeneratedLabel, description: copy.runGeneratedDescription },
    { key: "autoApprove", label: copy.autoApproveLabel, description: copy.autoApproveDescription },
  ];

  if (card.explore) {
    options.splice(1, 0, {
      key: "runExploredCases",
      label: copy.runExploredLabel,
      description: copy.runExploredDescription,
    });
  }

  return (
    <div className="operator-option-group">
      <div>
        <p className="operator-control-label">{copy.title}</p>
        <p className="operator-text-subtle">{copy.description}</p>
      </div>
      {options.map(({ key, label, description }) => {
        const active = card[key];

        return (
          <label key={key} className="operator-option-row cursor-pointer select-none">
            <span className="min-w-0">
              <span className="operator-text block font-medium">{label}</span>
              <span className="operator-text-subtle block">{description}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => onToggleOption(key, active)}
              className="operator-toggle"
              data-active={active}
            >
              <span className="operator-toggle-knob" />
            </button>
          </label>
        );
      })}
    </div>
  );
}

const generationOptionsCopy = {
  nl: {
    title: "Opties voor testaanmaak",
    description: "Kies hoeveel Specwright controleert voor en na het maken van de test.",
    exploreLabel: "App eerst inspecteren",
    exploreDescription: "Open de pagina en leer welke knoppen, velden en teksten de test moet gebruiken.",
    runGeneratedLabel: "Test direct draaien",
    runGeneratedDescription: "Controleer of de gemaakte automatische test slaagt.",
    autoApproveLabel: "Plangoedkeuring overslaan",
    autoApproveDescription: "Alleen gevorderd: sla fase 6 over. Anders pauzeert Specwright zodat je het plan kunt goedkeuren voordat bestanden worden geschreven.",
    runExploredLabel: "Gevonden acties controleren",
    runExploredDescription: "Voer snelle controles uit op wat Specwright vond voordat de definitieve test wordt geschreven.",
  },
  en: {
    title: "Test creation options",
    description: "Choose how much Specwright should verify before and after writing the test.",
    exploreLabel: "Inspect the app first",
    exploreDescription: "Open the page and learn which buttons, fields, and text the test should use.",
    runGeneratedLabel: "Run the test after creating it",
    runGeneratedDescription: "Check whether the finished automated test passes.",
    autoApproveLabel: "Skip plan approval",
    autoApproveDescription: "Advanced only: skip Phase 6. Otherwise Specwright pauses so you can approve the plan before files are written.",
    runExploredLabel: "Check discovered app actions",
    runExploredDescription: "Run quick checks against what Specwright found before it writes the final test.",
  },
};
