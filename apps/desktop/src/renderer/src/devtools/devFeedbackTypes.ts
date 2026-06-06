export interface FeedbackRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementContext {
  tag: string;
  text: string;
  ariaLabel: string;
  className: string;
  domPath: string;
  rect: string;
  captureRect: FeedbackRect;
}

export interface MenuState {
  x: number;
  y: number;
  context: ElementContext;
  screenshot: string | null;
}

export interface HighlightState {
  rect: FeedbackRect;
  mode: "hover" | "selected";
}

export type ContextScope = "element" | "page";
export type MagicWrightPreset = "selected-copy" | "page-copy" | "buttons-labels";

export interface FeedbackJob {
  id: string;
  context: ElementContext;
  comment: string;
  contextScope?: ContextScope;
  output: string;
  rawOutput: string;
  activity: string;
  logs: string[];
  status: "running" | "done" | "error" | "applied" | "cancelled";
  beforeImage: string | null;
  afterImage: string | null;
  worktreePath?: string;
}

export interface PersistedFeedbackState {
  jobs: FeedbackJob[];
}
