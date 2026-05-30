export type MotionPreset = "calm" | "operator" | "expressive";

export const panelVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const modalVariants = {
  initial: { opacity: 0, scale: 0.985 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.985 },
};

export const paletteVariants = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.99 },
};

export const presenceVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const collapsePresenceVariants = {
  initial: { opacity: 0, y: -10, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -8, height: 0 },
};

export const motionTransition = {
  duration: 0.7,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const presenceTransition = {
  duration: 0.52,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const sidebarIntroTransition = {
  duration: 0.82,
  delay: 4.22,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const sidebarTransition = {
  duration: 0.28,
  ease: [0.2, 0, 0.2, 1] as const,
};

export const appRevealTransition = {
  duration: 0.92,
  delay: 4.12,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const buttonTap = { scale: 0.985 };
