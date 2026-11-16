import { expect, test } from "@playwright/test";

/**
 * 招待フローの E2E:
 * 1. KPがログなしセッションを作成 → 招待リンクURLを実取得
 * 2. 別ユーザー(そら)が招待URLから「発言者なしで参加」
 * 3. セッション参加者に反映され、永続化されている
 */
test("招待リンクから別ユーザーが自己紐付けでき、参加者に反映される", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click({ force: true });

  // KP(みかん)がログなしセッションを作成(統合された /upload フローから)
  await page.goto("/#/upload");
  await page.getByRole("button", { name: "日時と参加者を直接入力する" }).click({ force: true });
  await page.getByLabel("タイトル").fill("招待E2Eの卓");
  await page.getByLabel(/卓（参加者を自動で入れます）/).selectOption("", { force: true });
  await page.getByRole("button", { name: "シナリオと参加者へ進む" }).click({ force: true });
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/#\/sessions\/s_/);

  const logId = await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    const id = Object.keys(st.logs ?? {}).find((k) => st.logs[k]?.title === "招待E2Eの卓");
    return id ?? null;  }, undefined, { polling: 250 });
  const id = (await logId.jsonValue()) as string;

  // そらとして入り直す
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "サインアウト" }).click({ force: true });
  await page.getByRole("button", { name: "Google でサインイン", exact: true }).click({ force: true });
  await page.getByRole("button", { name: /sora@example\.com/ }).click({ force: true });

  // 招待URL着地 → 発言者なしで参加
  await page.goto(`/#/invite/${id}`);
  await expect(page.getByRole("heading", { name: "この卓への参加" })).toBeVisible();
  await page.getByRole("button", { name: "この卓に参加する" }).click({ force: true });
  await expect(page.getByText("この卓に参加しました。").first()).toBeVisible();

  // セッション参加者に反映(ログなしセッションはタブなしで参加者が直表示される)
  await page.goto(`/#/sessions/${id}`);
  await expect(page.getByText("参加者").first()).toBeVisible();
  await expect(page.getByText("そら").first()).toBeVisible();

  // 永続化(リロード後も保持)
  await page.reload();
  await expect(page.getByText("参加者").first()).toBeVisible();
  await expect(page.getByText("そら").first()).toBeVisible();
});
