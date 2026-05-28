/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fbf5e4",
          100: "#f7e9bd",
          300: "#e8cd78",
          400: "#d8b35a",
          500: "#b9903d",
          600: "#927033",
          700: "#6f552b",
          800: "#4e3b21",
          900: "#302414",
          950: "#1b140b",
        },
        operator: {
          ink: "var(--sw-text)",
          muted: "var(--sw-text-muted)",
          line: "var(--sw-line)",
          panel: "var(--sw-surface)",
          field: "var(--sw-field)",
          canvas: "var(--sw-bg)",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [],
};
