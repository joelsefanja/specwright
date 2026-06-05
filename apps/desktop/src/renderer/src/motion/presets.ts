export const panelVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export const paletteVariants = {
  initial: { opacity: 0, y: -2 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
};

export const presenceVariants = {
  initial: { opacity: 0, y: 2 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
};

export const collapsePresenceVariants = {
  initial: { opacity: 0, y: -2, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -2, height: 0 },
};

export const motionTransition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const presenceTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const sidebarIntroTransition = {
  duration: 0.36,
  delay: 4.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const sidebarTransition = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const appRevealTransition = {
  duration: 0.36,
  delay: 4.12,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const workflowStepTransition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const workflowStepVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
