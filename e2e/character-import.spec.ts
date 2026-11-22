import { expect, test } from "@playwright/test";
import { auditPage, enterDemo } from "./design-audit";

/**
 * キャラクターはキャラシの URL からだけ取り込む（P6）。ファイル・コマ出力の入口はない。
 * 取り込み・キャラシと結び付いたキャラの編集・キャラシのないキャラの成長の記録の各段をデザイン検査にかける。
 */
test("キャラシの URL からだけ取り込み、編集と成長の記録はキャラシを正にする", async ({ page }) => {
  await page.route("**/api/import/external", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        kind: "character",
        provider: "iachara",
        providerLabel: "いあきゃら",
        url: "https://iachara.com/view/3000000",
        fetchedAt: new Date().toISOString(),
        contentHash: "h1",
        character: { name: "実データの探索者", systemId: "coc7", memo: "職業: 天文学者", stats: { san: 60 } },
      }),
    });
  });
  const report: string[] = [];
  const audit = async (step: string) => {
    for (const issue of await auditPage(page)) report.push(`${step} [${issue.rule}] ${issue.detail}`);
  };

  await enterDemo(page);
  await page.goto("/characters");
  await page.getByRole("button", { name: "キャラシから取り込む" }).first().click();
  const dialog = page.getByRole("dialog");
  const sites = dialog.getByRole("list", { name: "対応しているキャラシサイト" });
  await expect(sites).toBeVisible();
  await expect(sites.getByRole("listitem").filter({ hasText: "いあきゃら" })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /ファイル|コマ/ })).toHaveCount(0);
  await audit("取り込み");

  // キャラクターの個別ページ以外は例を添えて断る。いあきゃらも閲覧 URL から読む
  const urlBox = dialog.getByPlaceholder("https://charaeno.com/7th/…");
  await urlBox.fill("https://iachara.com/mypage");
  await expect(dialog.getByRole("alert")).toHaveText(
    "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
  );
  await urlBox.fill("https://iachara.com/view/3000000");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByText("いあきゃら", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "実データの探索者" })).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await audit("取り込みの確認");
  await dialog.getByRole("button", { name: "取り込む", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/ch_/);

  // キャラシと結び付いたキャラの編集: 名前・能力値の欄はなく、キャラシで直す入口だけ
  await page.getByRole("button", { name: "編集" }).click();
  await expect(page.getByRole("dialog").getByLabel("名前")).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("link", { name: /で直す/ })).toBeVisible();
  await audit("キャラシと結び付いたキャラの編集");
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("button", { name: /を記録/ })).toHaveCount(0);

  // キャラシのないキャラの成長: セッション・技能・新しい値だけ
  await page.goto("/characters");
  await page.getByRole("button", { name: "キャラシから取り込む" }).first().click();
  await page.getByRole("button", { name: "キャラシなしで作る" }).click();
  await page.getByRole("dialog").getByLabel("名前").fill("手入力の探索者");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/characters\/ch_/);
  const id = page.url().split("/").pop()!;
  await page.evaluate((cid) => {
    const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    state.characters[cid].sessions.push({
      logId: "s02",
      date: "2026-09-27",
      title: "深淵の呼び声",
      delta: {},
      rolls: [],
      memo: "",
    });
    localStorage.setItem("takufu-state-v4", JSON.stringify(state));
  }, id);
  await page.reload();
  await page.getByRole("button", { name: "成長ロールを記録" }).click();
  const growth = page.getByRole("dialog");
  await expect(growth).not.toContainText("セッションに紐付けない");
  await expect(growth.getByLabel("日付")).toHaveCount(0);
  await expect(growth.getByLabel("補足")).toHaveCount(0);
  await audit("成長の記録");

  expect(report).toEqual([]);
});
