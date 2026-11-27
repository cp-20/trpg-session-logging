import { expect, test, type Page } from "@playwright/test";

/**
 * ログと録画の紐づけ（src/lib/recording-sync.ts・src/components/recording-dock.tsx）。
 * サンプルの「深淵の呼び声」（s02）は 3 夜に分けて遊び、夜ごとに 1 本ずつ録画がある（開始時刻はログと合わせてある）。
 * 埋め込みの再生面（YouTube）は外へ出さず、iframe の src で再生位置を確かめる。
 */

async function demoState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}"));
}

test.beforeEach(async ({ page }) => {
  await page.route(/youtube(-nocookie)?\.com|ytimg\.com/, (route) => route.abort());
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);
});

test("ログの時刻から録画のその位置で再生し、場面の見出しから目次ができる", async ({ page }) => {
  await page.goto("/sessions/s02?tab=log");
  const dock = page.locator("[data-recording-dock]");
  await expect(dock).toBeVisible();
  // 3 夜の録画は、録った日で呼ぶ
  await expect(dock.getByRole("radio")).toHaveCount(3);
  // 目次はログの場面の見出しから
  await expect(dock.getByRole("list", { name: "目次" })).toContainText("シーン1 終了");

  // 1 本目は最初の発言の 5 分前から（seed.ts）。最初の発言の時刻を押すと、その位置から再生する
  const first = page.locator("[data-ts]").first();
  const ts = Number(await first.getAttribute("data-ts"));
  const state = await demoState(page);
  const startedAt = state.logs.s02.media.find((m: { id: string }) => m.id === "md_s02_rec").startedAt;
  const at = ts - startedAt;
  await first.getByRole("button", { name: /^録画の .+ から再生$/ }).click();
  const frame = dock.locator("iframe");
  await expect(frame).toHaveAttribute("src", new RegExp(`/embed/takufuDemo1\\?.*start=${at}(&|$)`));
  await expect(frame).toHaveAttribute("src", /enablejsapi=1/);

  // 再生中の発言をログで示す。手でスクロールすると追うのをやめ、「いまの発言へ」で戻る
  await expect(first).toHaveAttribute("data-now", "");
  await page.mouse.move(600, 600);
  await page.mouse.wheel(0, 2000);
  await page.evaluate(() => window.scrollBy(0, 3000));
  const back = dock.getByRole("button", { name: "いまの発言へ" });
  await expect(back).toBeVisible();
  await expect(first).not.toBeInViewport();
  await back.click();
  await expect(back).toBeHidden();
  await expect(first).toBeInViewport();

  // 2 夜目の見出しを目次から選ぶと、2 本目に替わる
  await dock
    .getByRole("radio", { name: /\d+\/\d+/ })
    .nth(1)
    .click();
  await dock.getByRole("list", { name: "目次" }).getByRole("button").first().click();
  await expect(dock.locator("iframe")).toHaveAttribute("src", /\/embed\/takufuDemo2\?/);
});

test("開始時刻の分からない録画は、発言を 1 つ選んで録画の位置を入れれば合う", async ({ page }) => {
  await page.goto("/sessions/s02?tab=log");
  // 1 本目の開始時刻を消して、合っていない録画にする
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    const m = state.logs.s02.media.find((x: { id: string }) => x.id === "md_s02_rec");
    delete m.startedAt;
    localStorage.setItem("takufu-state-v4", JSON.stringify(state));
  });
  await page.reload();
  const dock = page.locator("[data-recording-dock]");
  // 合っていない録画は日付で呼べない。はじめに選ばれているのは合っている録画（2 夜目）
  await expect(dock.getByRole("radio").first()).toHaveText("Part1");
  await expect(dock.getByRole("radio").nth(1)).toBeChecked();
  await dock.getByRole("radio", { name: "Part1" }).click();
  // 合っていないので、1 本目の夜の発言は再生できない
  const row = page.locator("[data-ts]").nth(2);
  await expect(row.getByRole("button", { name: /から再生$/ })).toHaveCount(0);

  await dock.getByRole("button", { name: "ログと合わせる" }).click();
  await expect(dock).toContainText("合わせる発言を選んでいます");
  const ts = Number(await row.getAttribute("data-ts"));
  await row.getByRole("button", { name: /の発言に録画を合わせる$/ }).click();
  const modal = page.getByRole("dialog", { name: "録画を合わせる" });
  await modal.getByLabel("この発言の録画での位置").fill("時間");
  await modal.getByRole("button", { name: "合わせる", exact: true }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await modal.getByLabel("この発言の録画での位置").fill("12:34");
  await modal.getByRole("button", { name: "合わせる", exact: true }).click();
  await expect(modal).toBeHidden();

  // 開始時刻 = 発言の時刻 − 12:34 が保存され、その発言は録画の 12:34
  await expect
    .poll(async () => {
      const s = await demoState(page);
      return s.logs.s02.media.find((m: { id: string }) => m.id === "md_s02_rec").startedAt;
    })
    .toBe(ts - (12 * 60 + 34));
  await expect(row.getByRole("button", { name: "録画の 12:34 から再生" })).toBeVisible();
  // 合わせると日付で呼べる
  await expect(dock.getByRole("radio").first()).toHaveText(/^\d+\/\d+$/);
});

test("共有ページでもログの横で録画を再生でき、合わせる操作は出ない", async ({ page }) => {
  await page.goto("/sessions/s02");
  const state = await demoState(page);
  await page.goto(`/share/l/${state.logs.s02.slug}`);
  const dock = page.locator("[data-recording-dock]");
  await expect(dock).toBeVisible();
  // 同じ録画を上の一覧にも並べない
  await expect(page.locator('article[data-media-kind="recording"]')).toHaveCount(0);
  await expect(dock.getByRole("button", { name: /合わせ/ })).toHaveCount(0);
  const first = page.locator("[data-ts]").first();
  await first.getByRole("button", { name: /^録画の .+ から再生$/ }).click();
  await expect(dock.locator("iframe")).toHaveAttribute("src", /\/embed\/takufuDemo1\?/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("モバイルでは再生中の再生面が右下に浮き、ログを読みながら見られる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sessions/s02?tab=log");
  const first = page.locator("[data-ts]").first();
  await first.getByRole("button", { name: /^録画の .+ から再生$/ }).click();
  const player = page.locator("[data-recording-player]");
  await expect(player).toHaveCSS("position", "fixed");
  await page.mouse.wheel(0, 1500);
  await expect(player).toBeInViewport();
  await page.getByRole("button", { name: "再生を閉じる" }).click();
  await expect(page.locator("[data-recording-dock] iframe")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
