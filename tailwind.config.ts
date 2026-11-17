import daisyui from "daisyui";
import type { Config } from "tailwindcss";

const config: Config & { daisyui?: Record<string, unknown> } = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "sans-serif"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    logs: false,
    themes: [
      {
        takufu: {
          primary: "#b84724",
          "primary-content": "#fffaf5",
          secondary: "#68594c",
          "secondary-content": "#fffdf9",
          accent: "#8c5e28",
          "accent-content": "#fffaf5",
          neutral: "#221c17",
          "neutral-content": "#f3ece2",
          "base-100": "#fffdf9",
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
          primary: "#d9734c",
          "primary-content": "#1c120d",
          secondary: "#a8998a",
          "secondary-content": "#14110f",
          accent: "#dfa84e",
          "accent-content": "#18120e",
          neutral: "#2d2621",
          "neutral-content": "#d6cbc0",
          "base-100": "#231e1a",
          "base-200": "#1a1613",
          "base-300": "#362e28",
          "base-content": "#d6cbc0",
          info: "#6bb2c8",
          "info-content": "#121d21",
          success: "#62ba8c",
          "success-content": "#101f17",
          warning: "#e8a93a",
          "warning-content": "#1f1708",
          error: "#e86a5e",
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
