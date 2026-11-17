import { expect, test } from "@playwright/test";

test("手入力の日付を変更でき、戻っても入力を失わず、不正な日時を保存しない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click({ force: true });
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click({ force: true });
  await page.getByLabel("タイトル", { exact: true }).fill("二日間のセッション");
  await page.getByLabel("実施日 1", { exact: true }).fill("2026-10-10");
  await page.getByRole("button", { name: "日を追加", exact: true }).click({ force: true });
  await expect(page.getByLabel("実施日 2", { exact: true })).toHaveValue("2026-10-11");
  await page.getByRole("button", { name: "内容と参加者の確認へ進む" }).click({ force: true });
  await page.getByRole("button", { name: "日時入力に戻る", exact: true }).first().click({ force: true });
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue("二日間のセッション");
  await expect(page.getByLabel("実施日 1", { exact: true })).toHaveValue("2026-10-10");
  await expect(page.getByLabel("実施日 2", { exact: true })).toHaveValue("2026-10-11");
  await page.getByLabel("実施日 2", { exact: true }).fill("2026-10-10");
  await page.getByRole("button", { name: "内容と参加者の確認へ進む" }).click({ force: true });
  await expect(page.getByRole("alert").filter({ hasText: "実施日を重複しない日付で入力" })).toBeVisible();
  await expect(page.getByRole("button", { name: "記録する", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByLabel("実施日 2", { exact: true }).fill("2026-10-11");
  await page.getByRole("button", { name: "内容と参加者の確認へ進む" }).click({ force: true });
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "セッションを開く", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "編集", exact: true }).click({ force: true });
  await page.getByLabel("実施日 1", { exact: true }).fill("2026-10-09");
  await page.getByRole("button", { name: "保存", exact: true }).click({ force: true });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
        const log = Object.values(state.logs ?? {}).find(
          (value: any) => value.title === "二日間のセッション",
        ) as any;
        return log?.dates;
      }),
    )
    .toEqual(["2026-10-09", "2026-10-11"]);
});
