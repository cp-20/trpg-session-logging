import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * 実ファイルのアップロード E2E:
 * CCFOLIA形式のフィクスチャを投入 → 実パーサーで解析 → 実データで保存 →
 * タイムラインに実内容が表示され、共有ビューでは本文・シークレットが除外される。
 */
test("実ログファイルを解析して保存し、共有ビューでは本文・シークレットが除外される", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click({ force: true });

  await page.goto("/#/upload");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "e2e/fixtures/ccfolia-sample.json"));
  await expect(page.getByText(/読み取り完了/)).toBeVisible({ timeout: 15_000 });

  // 分類の確認: 実データの発言・シークレット行が見える
  await page.getByRole("button", { name: "分類の確認へ進む" }).click({ force: true });
  await expect(page.getByText("教室の黒板、まだ新しい。")).toBeVisible();
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toBeVisible();

  // Step2 で自動解析の結果を確認してから進む
  await page.getByRole("button", { name: "シナリオと参加者へ進む" }).click({ force: true });
  await expect(page.getByRole("textbox", { name: "参加者を検索" })).toBeVisible();
  await page.getByLabel("タイトル", { exact: true }).fill("CCFOLIA 実ファイル取り込み");
  await page.getByRole("button", { name: "アップロードする" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "ログをアップロードしました", exact: true })).toBeVisible();

  const slugHandle = await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    const id = Object.keys(st.logs ?? {}).find((k) => st.logs[k].importedFrom?.includes("ccfolia-sample"));
    return id ? st.logs[id].slug as string : null;
  }, undefined, { polling: 250 });
  const slug = await slugHandle.jsonValue();

  // 自分のビュー: 実内容・取込元・シークレット表示
  await page.getByRole("button", { name: "セッションを開く" }).click({ force: true });
  await expect(page.getByText("取込: ccfolia-sample.json")).toBeVisible();
  await page.getByRole("tab", { name: /タイムライン/ }).click({ force: true });
  await expect(page.getByText("——1972年、廃講義棟。始まりの鐘が鳴る。")).toBeVisible();
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toBeVisible();

  // 共有ビュー: 本文(note)とシークレットは除外される
  await page.goto(`/#/share/l/${slug}`);
  await expect(page.getByText("——1972年、廃講義棟。始まりの鐘が鳴る。")).toBeVisible();
  await expect(page.getByText("◆ シーン終了。廊下へ移動。")).toHaveCount(0);
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toHaveCount(0);
});
