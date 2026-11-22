/**
 * はじめの設定（/welcome）の流れとデザイン検査（P15）。ユーザー ID は飛ばせず、表示名とアイコンは飛ばせる。
 * サンプルの記録から自分の ID を外して、初めてログインした人の状態を作る
 */
import { expect, test, type Page } from "@playwright/test";
import { auditPage, enterDemo } from "./design-audit";

const MODES = [
  { name: "mobile", viewport: { width: 390, height: 844 }, dark: false },
  { name: "desktop", viewport: { width: 1440, height: 900 }, dark: false },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, dark: true },
] as const;

async function forgetHandle(page: Page) {
  // サンプルを始めた直後の保存（遅らせて書く）が済んでから書き換える
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const key = "takufu-state-v4";
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!s) throw new Error("サンプルの記録がありません");
    delete s.users[s.me].handle;
    s.prefs.onboardingDone = false;
    localStorage.setItem(key, JSON.stringify(s));
  });
}

for (const mode of MODES) {
  test(`はじめの設定: ${mode.name}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({
      viewport: mode.viewport,
      colorScheme: mode.dark ? "dark" : "light",
    });
    const page = await ctx.newPage();
    await enterDemo(page);
    await forgetHandle(page);
    await page.goto("/welcome?next=/tables");
    const report: string[] = [];
    const audit = async (step: string) => {
      for (const issue of await auditPage(page, { dark: mode.dark }))
        report.push(`${step} [${issue.rule}] ${issue.detail}`);
    };

    await expect(page.getByRole("heading", { level: 1, name: "ユーザー ID を決めましょう" })).toBeVisible();
    await expect(page.getByRole("button", { name: "スキップ" })).toHaveCount(0);
    await audit("id");
    const id = page.getByRole("textbox", { name: "ユーザー ID" });
    await id.fill("sora");
    await expect(page.locator("#welcome-handle-status")).toContainText("ほかの人が使っています");
    await expect(page.getByRole("button", { name: "この ID にする" })).toBeDisabled();
    await id.fill("mikan_e2e");
    await page.getByRole("button", { name: "この ID にする" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "表示名を決めましょう" })).toBeVisible();
    await audit("name");
    await page.getByRole("button", { name: "次へ" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "アイコンを選びましょう" })).toBeVisible();
    await audit("icon");
    await page.getByRole("button", { name: "はじめる" }).click();

    const done = page.getByRole("dialog");
    await expect(done).toContainText("@mikan_e2e");
    await page.waitForTimeout(700); // 印を押す動きが落ち着いてから測る
    await audit("done");
    await done.getByRole("link", { name: "続きを開く" }).click();
    await page.waitForURL(/\/tables$/);
    // 常設の「卓譜へようこそ」は出さない
    await expect(page.getByText("卓譜へようこそ")).toHaveCount(0);
    await page.goto("/users/mikan_e2e");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("@mikan_e2e")).toBeVisible();
    await ctx.close();
    expect(report, report.join("\n")).toEqual([]);
  });
}

test("サンプルではアプリの画面がそのまま開き、はじめの設定に送られない", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/tables");
  await expect(page.getByRole("heading", { level: 1, name: "卓" })).toBeVisible();
  await expect(page).toHaveURL(/\/tables$/);
});

test("卓の招待リンクを作り、無効にできる。名前で人を探す欄はない", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterDemo(page);
  await page.goto("/tables/t_shiosai");
  await expect(page.getByLabel("参加者を検索")).toHaveCount(0);
  const panel = page.getByRole("group", { name: "メンバーを招待" });
  await panel.getByRole("radio", { name: "無期限" }).click();
  await panel.getByRole("button", { name: "招待リンクを作る" }).click();
  await expect(panel.locator("code")).toContainText("/join/");
  await expect(panel).toContainText("無期限");
  const url = (await panel.locator("code").textContent())!;
  expect(await auditPage(page)).toEqual([]);
  await panel.getByRole("button", { name: "無効にする" }).click();
  await expect(panel.getByRole("button", { name: "招待リンクを作る" })).toBeVisible();
  await page.goto(new URL(url).pathname);
  await expect(page.getByRole("heading", { level: 1, name: "招待を開けませんでした" })).toBeVisible();
});
