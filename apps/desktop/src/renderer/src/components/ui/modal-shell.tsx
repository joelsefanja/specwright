import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "./utils";

const modalBackdropTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

const modalShellTransition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1] as const,
};

export interface ModalShellProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeLabel?: string;
  closeHelp?: string;
  closeOnInteractOutside?: boolean;
  className?: string;
}

export function ModalShell({
  open = true,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
  closeHelp,
  closeOnInteractOutside = false,
  className,
}: ModalShellProps): React.JSX.Element {
  const fallbackCloseHelp = closeHelp ?? (closeLabel === "Sluiten" ? "Sluit met de X of Esc." : "Close with X or Esc.");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <Dialog.Overlay forceMount asChild>
              <motion.div
                className="operator-settings-modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={modalBackdropTransition}
              />
            </Dialog.Overlay>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {open && (
            <Dialog.Content
              forceMount
              asChild
              onInteractOutside={(event) => {
                if (!closeOnInteractOutside) event.preventDefault();
              }}
            >
              <motion.div
                className={cn("operator-modal-shell", `operator-modal-shell-${size}`, className)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={modalShellTransition}
              >
                <div className="operator-modal-shell-head">
                  {icon && <span className="operator-modal-shell-icon" aria-hidden="true">{icon}</span>}
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="operator-settings-modal-title">{title}</Dialog.Title>
                    {description && <Dialog.Description className="operator-settings-modal-description">{description}</Dialog.Description>}
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" className="operator-icon-button" aria-label={closeLabel}>
                      <X size={16} weight="bold" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="operator-modal-shell-body">{children}</div>
                <div className="operator-modal-shell-footer">
                  {footer ?? <p className="operator-field-help m-0">{fallbackCloseHelp}</p>}
                </div>
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
