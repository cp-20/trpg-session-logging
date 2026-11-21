export type ThemeMode = "dark" | "system" | "light";

export const THEME_STORAGE_KEY = "takufu-theme";
export const THEME_CHANGE_EVENT = "takufu-theme-change";

/** 文字列から安全なテーマ設定値を取り出す（不正値は "system"） */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === "dark" || raw === "light" ? raw : "system";
}

/** テーマ設定値と OS 設定から daisyUI テーマ名を返す */
export function resolveThemeName(mode: ThemeMode, prefersDark: boolean): "takufu" | "takufuDark" {
  return mode === "dark" || (mode === "system" && prefersDark) ? "takufuDark" : "takufu";
}

export function currentThemeMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function resolveTheme(mode: ThemeMode): "takufu" | "takufuDark" {
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveThemeName(mode, prefersDark);
}

export function applyTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Appearance still works without browser storage. */
  }
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
