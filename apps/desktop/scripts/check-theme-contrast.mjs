import wcagContrast from "wcag-contrast";

const ratio = wcagContrast.hex;

const MIN_NORMAL_TEXT = 4.5;
const MIN_UI_COMPONENT = 3;
const MIN_BACKGROUND_LAYER = 1.1;

const themes = {
  slate: {
    bg: "#0b0d10",
    surface: "#151a1f",
    surface2: "#1f252d",
    field: "#080a0c",
    text: "#f4f7fb",
    muted: "#d4dce6",
    subtle: "#adb8c5",
    accent: "#e6bc4d",
    accentStrong: "#f3d07c",
    success: "#79c998",
    danger: "#ef8078",
    onAccent: "#111418",
  },
  graphite: {
    bg: "#090a0b",
    surface: "#151719",
    surface2: "#23262a",
    field: "#070708",
    text: "#f4f5f6",
    muted: "#d2d5d9",
    subtle: "#b2b7bf",
    accent: "#e7b34a",
    accentStrong: "#f3cc7c",
    success: "#79c998",
    danger: "#ef8078",
    onAccent: "#111317",
  },
  paper: {
    bg: "#eef2f6",
    surface: "#ffffff",
    surface2: "#dfe5eb",
    field: "#edf1f5",
    text: "#121821",
    muted: "#333e4d",
    subtle: "#4f5c6b",
    accent: "#8f5c12",
    accentStrong: "#784d0c",
    success: "#327b50",
    danger: "#d83c2f",
    onAccent: "#f7f9fb",
  },
  sand: {
    bg: "#f1eadc",
    surface: "#fbf7ef",
    surface2: "#e7dcc8",
    field: "#ede1cf",
    text: "#241d13",
    muted: "#4a3d2b",
    subtle: "#68583f",
    accent: "#844914",
    accentStrong: "#6e3b0c",
    success: "#327b50",
    danger: "#ca3a2b",
    onAccent: "#fbf8f2",
  },
};

const textChecks = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface2"],
  ["text", "field"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface2"],
  ["muted", "field"],
  ["subtle", "bg"],
  ["subtle", "surface"],
  ["subtle", "surface2"],
  ["subtle", "field"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "field"],
];

const uiComponentChecks = [
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "field"],
  ["accentStrong", "bg"],
  ["accentStrong", "surface"],
  ["success", "bg"],
  ["success", "surface"],
  ["danger", "bg"],
  ["danger", "surface"],
  ["onAccent", "accent"],
];

const backgroundLayerChecks = [
  ["surface", "bg"],
  ["surface2", "bg"],
  ["surface2", "surface"],
  ["field", "surface"],
];

const failures = [];

for (const [themeName, theme] of Object.entries(themes)) {
  for (const [fg, bg] of textChecks) {
    const value = ratio(theme[fg], theme[bg]);
    if (value < MIN_NORMAL_TEXT) {
      failures.push(`${themeName}: text ${fg} on ${bg} = ${value.toFixed(2)}:1`);
    }
  }

  for (const [fg, bg] of uiComponentChecks) {
    const value = ratio(theme[fg], theme[bg]);
    if (value < MIN_UI_COMPONENT) {
      failures.push(`${themeName}: UI ${fg} against ${bg} = ${value.toFixed(2)}:1`);
    }
  }

  for (const [fg, bg] of backgroundLayerChecks) {
    const value = ratio(theme[fg], theme[bg]);
    if (value < MIN_BACKGROUND_LAYER) {
      failures.push(`${themeName}: background ${fg} against ${bg} = ${value.toFixed(2)}:1`);
    }
  }
}

if (failures.length) {
  console.error("Theme contrast failed.");
  console.error(`Text tokens require ${MIN_NORMAL_TEXT}:1, UI components require ${MIN_UI_COMPONENT}:1, background layers require ${MIN_BACKGROUND_LAYER}:1.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Theme contrast passed.");
console.log(`Text tokens >= ${MIN_NORMAL_TEXT}:1, UI components >= ${MIN_UI_COMPONENT}:1, background layers >= ${MIN_BACKGROUND_LAYER}:1.`);
