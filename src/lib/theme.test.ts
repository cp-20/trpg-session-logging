// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  currentThemeMode,
  parseThemeMode,
  resolveTheme,
  resolveThemeName,
} from "./theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("theme helpers", () => {
  it("ストレージキーとイベント名の定数を保持し parseThemeMode を判定する", () => {
    expect(THEME_STORAGE_KEY).toBe("takufu-theme");
    expect(THEME_CHANGE_EVENT).toBe("takufu-theme-change");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("invalid")).toBe("system");
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode(undefined)).toBe("system");
  });

  it("resolveThemeName はモードと OS ダーク設定の組み合わせを正しく解決する", () => {
    expect(resolveThemeName("dark", false)).toBe("takufuDark");
    expect(resolveThemeName("dark", true)).toBe("takufuDark");
    expect(resolveThemeName("light", false)).toBe("takufu");
    expect(resolveThemeName("light", true)).toBe("takufu");
    expect(resolveThemeName("system", true)).toBe("takufuDark");
    expect(resolveThemeName("system", false)).toBe("takufu");
  });

  it("currentThemeMode / resolveTheme / applyTheme とストレージ例外フォールバックを検証する", () => {
    expect(currentThemeMode()).toBe("system");

    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(currentThemeMode()).toBe("system");
    getItemSpy.mockRestore();

    const mmSpy = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    window.matchMedia = mmSpy;
    expect(resolveTheme("system")).toBe("takufuDark");
    expect(mmSpy).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(resolveTheme("light")).toBe("takufu");

    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(resolveTheme("system")).toBe("takufu");

    const listener = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, listener);
    applyTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(currentThemeMode()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("takufuDark");
    expect(listener).toHaveBeenCalledTimes(1);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("takufu");
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  });
});
