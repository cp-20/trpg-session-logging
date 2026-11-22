import { expect, test } from "@playwright/test";

/**
 * 主要ジャーニーの E2E: セッション作成 → 永続化 → 共有範囲変更 →
 * 別ユーザーで共有ビューを開いて自己申告ゲートが解除されること。
 * (Kimi のテスト戦略相談で最優先とされた 1 本)
 */
test("作成したログは永続化され、passed にすると外部ユーザーが自己申告で読める", async ({ page }) => {
  // サンプルを始める（LP のボタンの行き先。LP からの導線は public-pages で確かめる）
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);

  // 1. セッション作成(ログなし): 統合された /upload フローから入る
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click({ force: true });
  const title = `E2E セッション ${Date.now()}`;
  await page.getByLabel("タイトル", { exact: true }).fill(title);
  // 卓を選ばず、自分だけのセッションにする
  await page.getByRole("combobox", { name: "シナリオ" }).fill("深淵の呼び声");
  await page
    .getByRole("option", { name: /深淵の呼び声/ })
    .first()
    .click({ force: true });
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });

  await expect(page.getByRole("heading", { name: "セッションを記録しました", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "セッションを開く", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/\/sessions\/s_/);
  // localStorage への書き込みはデバウンスされているので、現れるまで待つ
  const slugHandle = await page.waitForFunction(
    () => {
      const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
      const id = Object.keys(st.logs ?? {}).find((k) => st.logs[k]?.title?.startsWith("E2E セッション"));
      return id ? st.logs[id].slug : null;
    },
    undefined,
    { polling: 250 },
  );
  const slug = (await slugHandle.jsonValue()) as string;

  // 2. 共有範囲を「プレイした人」へ変更
  await page.getByRole("button", { name: /^共有/ }).click({ force: true });
  await page.getByRole("radio", { name: "プレイした人" }).click({ force: true });
  await expect(page.getByRole("radio", { name: "プレイした人" })).toBeChecked();
  await page.keyboard.press("Escape");

  // 3. 永続化の確認(リロード)
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  // 4. 別ユーザー(そら)で共有ビューを開く
  await page.goto("/settings");
  await page.getByRole("button", { name: "デモ利用者を切替" }).click({ force: true });
  await page.getByRole("button", { name: /そら/ }).click({ force: true });

  await page.goto(`/share/l/${slug}`);
  const gate = "このログは、このシナリオをプレイした人だけが読めます（自己申告）。";
  await expect(page.getByText(gate)).toBeVisible();

  // 5. 自己申告で解除
  await page.getByRole("button", { name: "このシナリオをプレイした（記録を開く）" }).click({ force: true });
  await expect(page.getByText(gate)).toHaveCount(0);
  await expect(page.getByPlaceholder("本文・発言者で絞り込み…")).toBeVisible();
});

test("共有範囲はシナリオに関係なく、選んだとおりに選べて既定はメンバー限定", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click({ force: true });
  const scope = page.getByRole("radiogroup", { name: "共有範囲" });
  await expect(scope.getByRole("radio", { name: /メンバー限定/ })).toBeChecked();
  for (const name of [/プレイした人/, /公開/]) await expect(scope.getByRole("radio", { name })).toBeEnabled();
  // シナリオを選んでも既定は変わらない
  await page.getByRole("combobox", { name: "シナリオ" }).fill("深淵の呼び声");
  await page
    .getByRole("option", { name: /深淵の呼び声/ })
    .first()
    .click({ force: true });
  await expect(scope.getByRole("radio", { name: /メンバー限定/ })).toBeChecked();
  await scope.getByRole("radio", { name: /公開/ }).check({ force: true });
  await expect(scope.getByRole("radio", { name: /公開/ })).toBeChecked();
});
