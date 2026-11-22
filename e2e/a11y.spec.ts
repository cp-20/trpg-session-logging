import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { enterDemo } from "./design-audit";

const A11Y_ROUTES = [
  "/home",
  "/sessions",
  "/calendar",
  "/tables",
  "/characters",
  "/scenarios",
  "/scenarios/new",
  "/upload",
  "/settings",
] as const;

test("スキップリンクでメインコンテンツへ直接移動でき、キーボード操作とフォーカス表示が全カスタムUIで機能する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterDemo(page);

  // Skip link -> #main-content
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("Tab");
  const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains("skip-link"));
  expect(skipFocused).toBe(true);
  await page.keyboard.press("Enter");
  const mainFocused = await page.evaluate(() => document.activeElement?.id === "main-content");
  expect(mainFocused).toBe(true);

  // Visible :focus-visible outline check on keyboard-focused navigation link
  await page.keyboard.press("Tab");
  const focusMetrics = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      outlineStyle: cs.outlineStyle,
      outlineWidth: parseFloat(cs.outlineWidth || "0"),
      boxShadow: cs.boxShadow,
    };
  });
  expect(focusMetrics).not.toBeNull();
  expect(focusMetrics!.outlineStyle).not.toBe("none");
  expect(focusMetrics!.outlineWidth >= 2 || focusMetrics!.boxShadow !== "none").toBe(true);

  // Seg ArrowLeft/ArrowRight on /sessions (立場の絞り込み)
  await page.goto("/sessions");
  const roleAll = page.getByRole("radiogroup", { name: "立場" }).getByRole("radio", { name: "すべて" });
  const roleGm = page.getByRole("radiogroup", { name: "立場" }).getByRole("radio", { name: "GM" });
  await roleAll.focus();
  await page.keyboard.press("ArrowRight");
  await expect(roleGm).toBeFocused();
  await expect(roleGm).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(roleAll).toHaveAttribute("aria-checked", "true");

  // Modal focus trap + Escape focus restoration on /characters
  await page.goto("/characters");
  const importBtn = page.getByRole("button", { name: "キャラシから取り込む" });
  await importBtn.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  // 主の入力（キャラシの URL）に最初からフォーカスがある
  await expect(dialog.getByRole("textbox", { name: "キャラシの URL" })).toBeFocused();

  // Trap check: Tab / Shift+Tab stays inside dialog
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(importBtn).toBeFocused();

  // Combobox keyboard navigation on /scenarios/new（システムは BCDice の全システムから探して選ぶ）
  await page.goto("/scenarios/new");
  // URL 読み込みが主。手入力の欄は「手で入力する」で開く
  await page.getByRole("button", { name: "手で入力する" }).click();
  const systemBox = page.getByRole("combobox", { name: "システム" });
  await expect(systemBox).toHaveValue("クトゥルフ神話TRPG 7版");
  await systemBox.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(systemBox).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(systemBox).toBeFocused();
  await expect(systemBox).not.toHaveValue("クトゥルフ神話TRPG 7版");
  // 読みで探せる
  await systemBox.fill("だぶるくろす");
  await expect(page.getByRole("option", { name: "ダブルクロス2nd,3rd" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(systemBox).toHaveValue("ダブルクロス2nd,3rd");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(systemBox).toBeFocused();
  await expect(systemBox).toHaveValue("ダブルクロス2nd,3rd");

  // MonthCalendar roving focus & arrow key navigation on /calendar
  await page.goto("/calendar");
  const activeDayBtn = page.locator('[data-calendar-day][tabindex="0"]').first();
  const initialDay = await activeDayBtn.getAttribute("data-calendar-day");
  expect(initialDay).toBeTruthy();
  await activeDayBtn.focus();
  // フォーカス移動は再描画後に起きるので、移り終わるまで待ってから読む
  const focusedDay = () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-calendar-day") ?? null);
  const addDays = (d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  await page.keyboard.press("ArrowRight");
  await expect.poll(focusedDay).toBe(addDays(initialDay!, 1));
  await page.keyboard.press("ArrowDown");
  await expect.poll(focusedDay).toBe(addDays(initialDay!, 8));
});

test("200% 拡大相当（640x400）でもモーダルの見出しと操作が画面内に収まる", async ({ page }) => {
  await enterDemo(page);

  // 2. 640x400 (effective 200% browser zoom on 1280x800): modal header/footer fit in viewport
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("/characters");
  await page.getByRole("button", { name: "キャラシから取り込む" }).click();
  const charDialog = page.getByRole("dialog");
  await expect(charDialog).toBeVisible();
  const charBox = await charDialog.boundingBox();
  expect(charBox).not.toBeNull();
  expect(charBox!.y).toBeGreaterThanOrEqual(0);
  expect(charBox!.y + charBox!.height).toBeLessThanOrEqual(402);
  await expect(charDialog.getByRole("button", { name: "閉じる" })).toBeVisible();
  await page.keyboard.press("Escape");
});

// 画面ごとに分けて並列に流す（1 画面の axe 解析は負荷時 2〜3 秒かかる）
for (const scheme of ["light", "dark"] as const) {
  for (const route of A11Y_ROUTES) {
    test(`axe-core WCAG 2.1 AA 検査で重大な違反がない (${scheme} ${route})`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      await enterDemo(page);
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const seriousViolations = results.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => {
          const targets = v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join("; ");
          return `${route} [${v.impact}] ${v.id}: ${v.help} (${targets})`;
        });
      await ctx.close();
      expect(seriousViolations, seriousViolations.join("\n")).toEqual([]);
    });
  }
}

// 画面ごとに分けて並列に流す
for (const route of A11Y_ROUTES) {
  test(`320px 幅と 200% 文字拡大で横にはみ出さない (${route})`, async ({ page }) => {
    await enterDemo(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(narrow, `${route} at 320px overflowed by ${narrow}px`).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const zoomed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(zoomed, `${route} at 200% text zoom overflowed by ${zoomed}px`).toBeLessThanOrEqual(1);
  });
}
