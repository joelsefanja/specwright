import { useState } from "react";

type ThemeSelectOption = {
  value: string;
  label: string;
};

type ThemeSelectProps = {
  value: string;
  options: ThemeSelectOption[];
  onChange: (value: string) => void;
  className?: string;
};

export function ThemeSelect({
  value,
  options,
  onChange,
  className = "",
}: ThemeSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const onBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  const onTriggerClick = (): void => {
    setOpen((nextOpen) => !nextOpen);
  };

  const onOptionMouseDown = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
  };

  const onOptionClick = (optionValue: string): void => {
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div className={`operator-dropdown ${className}`} onBlur={onBlur}>
      <button
        type="button"
        className="operator-dropdown-trigger"
        data-open={open}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onTriggerClick}
      >
        {selectedOption?.label ?? value}
      </button>
      {open && (
        <div className="operator-dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="operator-dropdown-option"
              data-selected={option.value === value}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={onOptionMouseDown}
              onClick={() => onOptionClick(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
