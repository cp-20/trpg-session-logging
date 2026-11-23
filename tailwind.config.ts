import daisyui from "daisyui";
import type { Config } from "tailwindcss";

const config: Config & { daisyui?: Record<string, unknown> } = {
  content: ["./src/**/*.{ts,tsx}", "!./src/**/*.test.{ts,tsx}", "!./src/test/**"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans JP Variable", "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "sans-serif"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    logs: false,
    themes: [
      {
        takufu: {
          primary: "#ab4120",
          "primary-content": "#fffaf5",
          secondary: "#68594c",
          "secondary-content": "#fffdf9",
          accent: "#8c5e28",
          "accent-content": "#fffaf5",
          neutral: "#221c17",
          "neutral-content": "#f3ece2",
          "base-100": "#fcf7f0",
          "base-200": "#f2ebe0",
          "base-300": "#e2d7c5",
          "base-content": "#221c17",
          info: "#2c6b7f",
          "info-content": "#f4fbfd",
          success: "#2d6f4e",
          "success-content": "#f2fbf6",
          warning: "#b86b14",
          "warning-content": "#fffbeb",
          error: "#b8332a",
          "error-content": "#fef2f2",
          "--rounded-box": "0.75rem",
          "--rounded-btn": "0.5rem",
          "--rounded-badge": "9999px",
          "--border-btn": "1px",
        },
      },
      {
        takufuDark: {
          primary: "#e5845f",
          "primary-content": "#1a100b",
          secondary: "#aba094",
          "secondary-content": "#14110f",
          accent: "#dfa84e",
          "accent-content": "#18120e",
          neutral: "#2b2520",
          "neutral-content": "#dcd2c7",
          "base-100": "#221d19",
          "base-200": "#161311",
          "base-300": "#383029",
          "base-content": "#dcd2c7",
          info: "#72b8ce",
          "info-content": "#121d21",
          success: "#66be90",
          "success-content": "#101f17",
          warning: "#eaa93b",
          "warning-content": "#1f1708",
          error: "#eb6d61",
          "error-content": "#211110",
          "--rounded-box": "0.75rem",
          "--rounded-btn": "0.5rem",
          "--rounded-badge": "9999px",
          "--border-btn": "1px",
        },
      },
    ],
  },
};

export default config;
