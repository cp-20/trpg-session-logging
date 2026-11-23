import { expect, test, type Page } from "@playwright/test";
import { auditPage, enterDemo } from "./design-audit";
import { addScenario } from "./support/scenario";

/**
 * 記録の流れの各段（ログを選ぶ・ログを読んだあと・ログなし・記録した）を、デスクトップ・モバイル・ダークで描画後の検査にかける。
 * 段は画面遷移を伴わないので、全画面の巡回（layout.spec）だけでは届かない
 */
const MODES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, dark: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, dark: false },
  { name: "tablet", viewport: { width: 820, height: 1000 }, dark: false },
  { name: "dark", viewport: { width: 1440, height: 900 }, dark: true },
] as const;

async function audit(page: Page, step: string, report: string[], dark: boolean) {
  for (const issue of await auditPage(page, { dark })) report.push(`${step} [${issue.rule}] ${issue.detail}`);
  // 右端に白い領域（横にはみ出した要素）を作らない
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 0) report.push(`${step} [no-horizontal-overflow] ${overflow}px`);
}

for (const mode of MODES) {
  test(`記録の流れの各段がデザイン規約を守る (${mode.name})`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: mode.viewport,
      colorScheme: mode.dark ? "dark" : "light",
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const report: string[] = [];
    await enterDemo(page);

    await page.goto("/upload");
    await expect(page.getByText("ログファイルをここにドロップ")).toBeVisible();
    await audit(page, "ログを選ぶ", report, mode.dark);

    await page.getByRole("button", { name: "サンプルログで試す" }).click();
    await expect(page.getByRole("heading", { name: "ログの発言者" })).toBeVisible();
    await expect(page.getByText("サンプルログ", { exact: true })).toBeVisible();
    await audit(page, "ログを読んだあと", report, mode.dark);

    await addScenario(page, "流れの検査");
    await page.getByRole("button", { name: "記録する", exact: true }).first().click();
    const done = page.getByRole("dialog", { name: "セッションを記録しました" });
    await expect(done).toBeVisible();
    await expect(done.getByRole("link", { name: "セッションを開く" })).toBeFocused();
    await audit(page, "記録した", report, mode.dark);
    await done.getByRole("button", { name: "共有リンクをコピー" }).click();
    await expect(done.getByRole("button", { name: "コピーしました" })).toBeVisible();

    await page.goto("/upload?manual=1");
    await expect(page.getByLabel("日付", { exact: true })).toBeVisible();
    await audit(page, "ログなし", report, mode.dark);

    await ctx.close();
    expect(report, report.join("\n")).toEqual([]);
  });
}

test("卓を選ぶとメンバーから参加者を選べ、全員を 1 回で入れられる", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/upload?manual=1");
  const table = page.getByRole("combobox", { name: "卓" });
  await table.click();
  await page.getByRole("option").nth(1).click();
  const list = page.getByRole("list", { name: "参加者" });
  await expect(list).toBeVisible();
  // 記録する本人は外せない先頭の行。役割はシステムの言葉、人の代わりに記録するときだけ外す
  await expect(
    page.getByRole("combobox", { name: "あなたの役割" }).or(page.getByLabel("あなたの役割")),
  ).toBeVisible();
  await page.getByRole("button", { name: /^遊んでいない/ }).click();
  await expect(list.getByText(/（遊んでいない）/)).toBeVisible();
  await page.getByRole("button", { name: "遊んだ", exact: true }).click();
  const boxes = list.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  // 卓を選んだら（ログがないので）全員が参加者に入る。1 回で外し、1 回で戻せる
  for (let i = 0; i < count; i++) await expect(boxes.nth(i)).toBeChecked();
  if (count > 1) {
    await page.getByRole("button", { name: "全員を外す" }).click();
    for (let i = 0; i < count; i++) await expect(boxes.nth(i)).not.toBeChecked();
    await page.getByRole("button", { name: "全員が参加" }).click();
    for (let i = 0; i < count; i++) await expect(boxes.nth(i)).toBeChecked();
  }
});

test("シナリオは共有シナリオ一覧からサーバーで探して選べ、見つからなければその名前で追加できる", async ({
  page,
}) => {
  await enterDemo(page);
  // 共有シナリオ一覧は取り直すたびに変わるので、探す作品はサーバーに聞く（体験版の手元にはない TALTO の作品）
  const res = await page.request.get("/api/scenarios?limit=1&offset=100");
  const { items } = (await res.json()) as { items: { id: string; title: string }[] };
  const target = items[0]!;
  await page.goto("/upload?manual=1");
  const sc = page.getByRole("combobox", { name: "シナリオ" });
  await sc.click();
  await sc.fill(target.title);
  // 答えが届くまでは「追加」を出さない（同じ作品を二重に足させない）。届いたら共有シナリオ一覧の作品を選ぶ
  await page
    .getByRole("option")
    .filter({ hasText: target.title })
    .filter({ hasNotText: "追加" })
    .first()
    .click();
  await expect(sc).toHaveValue(target.title);
  await sc.click();
  await sc.fill("まだ誰も書いていないシナリオ名");
  await page.getByRole("option", { name: /追加/ }).click();
  await expect(page.getByLabel("シナリオのタイトル")).toHaveValue("まだ誰も書いていないシナリオ名");
});
