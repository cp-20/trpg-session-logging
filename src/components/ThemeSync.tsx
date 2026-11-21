"use client";

import { useEffect } from "react";
import { THEME_CHANGE_EVENT, currentThemeMode, resolveTheme } from "../lib/theme";

export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.setAttribute("data-theme", resolveTheme(currentThemeMode()));
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    window.addEventListener(THEME_CHANGE_EVENT, update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
      window.removeEventListener(THEME_CHANGE_EVENT, update);
    };
  }, []);
  return null;
}
