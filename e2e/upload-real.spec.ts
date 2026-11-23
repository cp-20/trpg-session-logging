import { expect, test } from "@playwright/test";
import { addScenario } from "./support/scenario";
import path from "node:path";

/**
 * 実ファイルのアップロード E2E:
 * CCFOLIA形式のフィクスチャを投入 → 実パーサーで解析 → 実データで保存 →
 * タイムラインに実内容が表示され、共有ビューでも全文（進行メモ・シークレット含む）が読める。
 */
test("実ログファイルを解析して保存し、共有ビューでも全ログが読める", async ({ page }) => {
  // サンプルを始める（LP のボタンの行き先。LP からの導線は public-pages で確かめる）
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);

  await page.goto("/upload");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "e2e/fixtures/ccfolia-sample.json"));
  // 内容の確認へ直行（選んだファイル・実データの発言・シークレット行 + メタ編集が見える）
  await expect(page.getByText("ccfolia-sample.json")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("教室の黒板、まだ新しい。")).toBeVisible();
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toBeVisible();
  await addScenario(page, "CCFOLIA 実ファイル取り込み");
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await expect(page.getByRole("heading", { name: "セッションを記録しました", exact: true })).toBeVisible();

  const slugHandle = await page.waitForFunction(
    () => {
      const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
      const id = Object.keys(st.logs ?? {}).find((k) => st.logs[k].importedFrom?.includes("ccfolia-sample"));
      return id ? (st.logs[id].slug as string) : null;
    },
    undefined,
    { polling: 250 },
  );
  const slug = await slugHandle.jsonValue();

  // 自分のビュー: 実内容・取込元・シークレット表示
  await page.getByRole("link", { name: "セッションを開く" }).click({ force: true });
  await page.getByRole("tab", { name: /ログ/ }).click({ force: true });
  await expect(page).toHaveURL(/tab=log/);
  await expect(page.getByText("取り込んだファイル: ccfolia-sample.json")).toBeVisible();
  await expect(page.getByText("——1972年、廃講義棟。始まりの鐘が鳴る。")).toBeVisible();
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toBeVisible();

  // 共有ビュー: マスク機能廃止により進行メモ(note)とシークレットもそのまま表示される
  await page.goto(`/share/l/${slug}`);
  await expect(page.getByText("——1972年、廃講義棟。始まりの鐘が鳴る。")).toBeVisible();
  await expect(page.getByText("◆ シーン終了。廊下へ移動。")).toBeVisible();
  await expect(page.getByText("【シークレット】黒板に文字を書いたのは")).toBeVisible();
});
