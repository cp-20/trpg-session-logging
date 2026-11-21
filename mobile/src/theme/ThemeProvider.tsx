import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import Storage from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import { DARK_TOKENS, LIGHT_TOKENS, type ThemeTokens } from "./tokens";

export type ThemeMode = "light" | "system" | "dark";

const THEME_KEY = "takufu-mobile-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  tokens: ThemeTokens;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>(null!);

function readStoredMode(): ThemeMode {
  try {
    const val = Storage.getItemSync(THEME_KEY);
    return val === "light" || val === "dark" ? val : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const tokens = isDark ? DARK_TOKENS : LIGHT_TOKENS;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(tokens.ground).catch(() => {});
  }, [tokens.ground]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      Storage.setItemSync(THEME_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, tokens, isDark }),
    [mode, setMode, tokens, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
