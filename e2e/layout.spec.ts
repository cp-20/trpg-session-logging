import { expect, test } from "@playwright/test";
import { AUDIT_ROUTES, auditPage, enterDemo } from "./design-audit";

const MODES = [
  { name: "mobile", viewport: { width: 390, height: 844 }, dark: false },
  { name: "desktop", viewport: { width: 1440, height: 900 }, dark: false },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, dark: true },
] as const;

for (const mode of MODES) {
  test(`デザイン検査: ${mode.name}`, async ({ browser }) => {
    // 1 つのテストで全画面を巡回するので、画面の数に応じて時間を取る（並列実行で負荷が高いときも落ちないように）
    test.setTimeout(30_000 + AUDIT_ROUTES.length * 5_000);
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
  await expect(side.locator(":scope > div > a")).toHaveText([
    "ホーム",
    "セッション",
    "カレンダー",
    "卓",
    "キャラクター",
    "シナリオ",
  ]);
  await expect(page.getByRole("link", { name: "セッションを記録" })).toBeVisible();
});

test("Combobox の候補はホバーで面の色だけが変わり、枠や影を出さない", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterDemo(page);
  // 成長を手で記録するのはキャラシのないキャラクターだけ（P3）
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    delete state.characters.ch_towa.externalSync;
    delete state.characters.ch_towa.sheet;
    localStorage.setItem("takufu-state-v4", JSON.stringify(state));
  });
  await page.goto("/characters/ch_towa");
  await page.getByRole("button", { name: /成長ロールを記録/ }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "技能" }).click();
  const option = page.getByRole("option").nth(1);
  await option.hover();
  const style = await option.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      shadow: cs.boxShadow,
      bg: cs.backgroundColor,
      outline: cs.outlineStyle,
      duration: cs.transitionDuration,
    };
  });
  expect(style.shadow).toBe("none");
  expect(style.bg).not.toBe("rgba(0, 0, 0, 0)");
  // 枠や太さが動いて見えないよう、選択肢には遷移アニメーションを付けない
  expect(style.outline).toBe("none");
  expect(style.duration).toBe("0s");
});

test("キャラクターのカードはホバーしても影を落とさない", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterDemo(page);
  await page.goto("/characters");
  const card = page.locator(".card-interactive").first();
  await card.hover();
  expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
});

test("日付入力は YYYY/MM/DD で見せて打て、暦からも選べる（端末の言語設定に左右されない）", async ({
  browser,
}) => {
  for (const device of [
    { viewport: { width: 1440, height: 900 } },
    { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "en-US" },
  ]) {
    const ctx = await browser.newContext(device);
    const page = await ctx.newPage();
    await enterDemo(page);
    // 成長の記録は日付を尋ねなくなった（セッションの日付。P2）ので、予定の追加で確かめる
    await page.goto("/calendar");
    await page.getByRole("button", { name: "予定を追加" }).first().click();
    const dialog = page.getByRole("dialog", { name: "予定を追加" });
    const input = dialog.locator('input[placeholder="YYYY/MM/DD"]');
    await expect(input).toHaveValue(/^\d{4}\/\d{2}\/\d{2}$/);
    await dialog.getByRole("button", { name: "カレンダーから選ぶ" }).click();
    const picker = page.getByRole("dialog", { name: "日付を選ぶ" });
    await expect(picker).toBeVisible();
    // 暦の中はキーボードで動かせる。Escape では暦だけが閉じる
    const before = await input.inputValue();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(picker).toBeHidden();
    expect(await input.inputValue()).not.toBe(before);
    await dialog.getByRole("button", { name: "カレンダーから選ぶ" }).click();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(dialog).toBeVisible();
    // 区切りの違う書き方も受け、欄を離れると YYYY/MM/DD にそろう
    await input.fill("2026-10-17");
    await input.blur();
    await expect(input).toHaveValue("2026/10/17");
    await ctx.close();
  }
});
