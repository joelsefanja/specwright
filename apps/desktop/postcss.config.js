const path = require("path");

module.exports = {
  plugins: {
    "postcss-mixins": {
      mixinsDir: path.join(__dirname, "src/renderer/src/styles/mixins"),
    },
    "postcss-nesting": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
