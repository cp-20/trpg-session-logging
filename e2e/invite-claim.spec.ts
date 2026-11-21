import { expect, test } from "@playwright/test";

/**
 * 招待フローの E2E:
 * 1. KPがログなしセッションを作成 → 招待リンクURLを実取得
 * 2. 別ユーザー(そら)が招待URLから「発言者なしで参加」
 * 3. セッション参加者に反映され、永続化されている
 */
test("招待リンクから別ユーザーが自己紐付けでき、参加者に反映される", async ({ page }) => {
  // サンプルを始める（LP のボタンの行き先。LP からの導線は public-pages で確かめる）
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);

  // KP(みかん)がログなしセッションを作成(統合された /upload フローから)
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click({ force: true });
  await page.getByLabel("タイトル").fill("招待E2Eの卓");
  await page.getByRole("button", { name: "内容と参加者の確認へ進む" }).click({ force: true });
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await expect(page.getByRole("heading", { name: "セッションを記録しました", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "セッションを開く", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/\/sessions\/s_/);

  const logId = await page.waitForFunction(
    () => {
      const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
      const id = Object.keys(st.logs ?? {}).find((k) => st.logs[k]?.title === "招待E2Eの卓");
      return id ?? null;
    },
    undefined,
    { polling: 250 },
  );
  const id = (await logId.jsonValue()) as string;

  // そらとして入り直す
  await page.goto("/settings");
  await page.getByRole("button", { name: "デモ利用者を切替" }).click({ force: true });
  await page.getByRole("button", { name: /そら/ }).click({ force: true });

  // 招待URL着地 → 発言者なしで参加
  await page.goto(`/invite/${id}`);
  await expect(page.getByRole("heading", { name: "招待E2Eの卓", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "このセッションに参加する" }).click({ force: true });
  await expect(page.getByRole("region", { name: "参加者" }).getByText("参加中")).toBeVisible();

  // セッション参加者に反映(ログなしセッションはタブなしで参加者が直表示される)
  await page.goto(`/sessions/${id}`);
  await expect(page.getByText("参加者").first()).toBeVisible();
  await expect(page.getByText("そら").first()).toBeVisible();

  // 永続化(リロード後も保持)
  await page.reload();
  await expect(page.getByText("参加者").first()).toBeVisible();
  await expect(page.getByText("そら").first()).toBeVisible();
});
