/**
 * 卓譜デザインシステム（DESIGN.md §6）のネイティブカラートークン。
 * ライト・ダークとも暖色の紙と墨で色相をそろえ、純白（#ffffff）を長文に使わない。
 */
export interface ThemeTokens {
  mode: "light" | "dark";
  ground: string;
  surface: string;
  surfaceHover: string;
  border: string;
  ink: string;
  ink2: string;
  ink3: string;
  primary: string;
  primaryContent: string;
  primaryTint: string;
  info: string;
  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  error: string;
  errorTint: string;
  backdrop: string;
}

export const LIGHT_TOKENS: ThemeTokens = {
  mode: "light",
  ground: "#f2ebe0",
  surface: "#fcf7f0",
  surfaceHover: "#ebe3d6",
  border: "#e2d7c5",
  ink: "#221c17",
  ink2: "#68594c",
  ink3: "#857566",
  primary: "#ab4120",
  primaryContent: "#fffaf5",
  primaryTint: "rgba(171, 65, 32, 0.11)",
  info: "#2c6b7f",
  success: "#2d6f4e",
  successTint: "rgba(45, 111, 78, 0.12)",
  warning: "#b86b14",
  warningTint: "rgba(184, 107, 20, 0.12)",
  error: "#b8332a",
  errorTint: "rgba(184, 51, 42, 0.11)",
  backdrop: "rgba(34, 28, 23, 0.45)",
};

export const DARK_TOKENS: ThemeTokens = {
  mode: "dark",
  ground: "#161311",
  surface: "#221d19",
  surfaceHover: "#2b2520",
  border: "#383029",
  ink: "#dcd2c7",
  ink2: "#aba094",
  ink3: "#8a7c6e",
  primary: "#e5845f",
  primaryContent: "#1a100b",
  primaryTint: "rgba(229, 132, 95, 0.15)",
  info: "#72b8ce",
  success: "#66be90",
  successTint: "rgba(102, 190, 144, 0.15)",
  warning: "#eaa93b",
  warningTint: "rgba(234, 169, 59, 0.14)",
  error: "#eb6d61",
  errorTint: "rgba(235, 109, 97, 0.14)",
  backdrop: "rgba(10, 8, 6, 0.68)",
};

export const RADII = {
  sm: 8,
  md: 12,
  lg: 18,
  full: 9999,
} as const;

export const DEFAULT_ENTITY_COLOR = "#0e7490";
export const DEFAULT_SCENARIO_BG = "#e6e6f0";
export const REPORT_CARD_ACCENT = "#b84724";
