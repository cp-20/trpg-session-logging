import { expect, test } from "@playwright/test";
import { AUDIT_ROUTES, auditPage, enterDemo } from "./design-audit";

const MODES = [
  { name: "mobile", viewport: { width: 390, height: 844 }, dark: false },
  { name: "desktop", viewport: { width: 1440, height: 900 }, dark: false },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, dark: true },
] as const;

for (const mode of MODES) {
  test(`デザイン検査: ${mode.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: mode.viewport,
      colorScheme: mode.dark ? "dark" : "light",
    });
    const page = await ctx.newPage();
    await enterDemo(page);
    const report: string[] = [];
    for (const route of AUDIT_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      for (const issue of await auditPage(page, { dark: mode.dark })) {
        report.push(`${route} [${issue.rule}] ${issue.detail}`);
      }
    }
    await ctx.close();
    expect(report, report.join("\n")).toEqual([]);
  });
}

test("モバイルでは下部タブ、デスクトップではサイドバーで同じ 6 か所へ移動できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemo(page);
  const tabs = page.getByRole("navigation", { name: "メイン" });
  await tabs.getByRole("link", { name: "予定" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(tabs.getByRole("link", { name: "予定" })).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sessions");
  const side = page.getByRole("navigation", { name: "メイン" });
  await expect(side.getByRole("link")).toHaveText([
    "ホーム",
    "セッション",
    "カレンダー",
    "卓",
    "キャラクター",
    "シナリオ",
  ]);
  await expect(page.getByRole("link", { name: "セッションを記録" })).toBeVisible();
});
