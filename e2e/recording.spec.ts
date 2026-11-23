import { expect, test } from "@playwright/test";
import { addScenario } from "./support/scenario";

test("ログなしの記録: 遊んだ日時は日付と時刻で入れ、重なりは保存せず、翌日に終わる回も残せる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // サンプルを始める（LP のボタンの行き先。LP からの導線は public-pages で確かめる）
  await page.goto("/demo");
  await page.waitForURL(/\/home$/);
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click({ force: true });
  await addScenario(page, "二日間のセッション");
  await page.getByLabel("日付", { exact: true }).fill("2026/10/10");
  await page.getByLabel("開始時刻", { exact: true }).fill("21:00");
  await page.getByLabel(/^終了時刻/).fill("1:30");
  // 終了が開始より前なら翌日に終わる回。欄を離れると 24 を足した書き方（25:30）にそろう
  await page.getByLabel(/^終了時刻/).blur();
  await expect(page.getByLabel("終了時刻", { exact: true })).toHaveValue("25:30");
  await page.getByRole("button", { name: "日時を追加", exact: true }).click({ force: true });
  await expect(page.getByLabel("2回目の日付", { exact: true })).toHaveValue("2026/10/11");
  // 1 回目と重なる時間帯は保存しない
  await page.getByLabel("2回目の日付", { exact: true }).fill("2026/10/11");
  await page.getByLabel("2回目の開始時刻", { exact: true }).fill("01:00");
  await page.getByLabel(/^2回目の終了時刻/).fill("03:00");
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await expect(page.getByRole("alert").filter({ hasText: "時間帯が重なっています" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByLabel("2回目の開始時刻", { exact: true }).fill("20:00");
  await page.getByLabel(/^2回目の終了時刻/).fill("23:00");
  await page.getByRole("button", { name: "記録する", exact: true }).click({ force: true });
  await page.getByRole("link", { name: "セッションを開く", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "編集", exact: true }).click({ force: true });
  await page.getByLabel("1回目の日付", { exact: true }).fill("2026/10/09");
  await page.getByRole("button", { name: "保存", exact: true }).click({ force: true });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
        const log = Object.values(state.logs ?? {}).find(
          (value: any) => state.scenarios?.[value.scenarioId]?.title === "二日間のセッション",
        ) as any;
        // JST の日付・時刻で見る
        const fmt = (ts: number) => new Date((ts + 9 * 3600) * 1000).toISOString().slice(0, 16);
        return log?.sittings?.map((s: { start: number; end: number }) => [fmt(s.start), fmt(s.end)]);
      }),
    )
    .toEqual([
      ["2026-10-09T21:00", "2026-10-10T01:30"],
      ["2026-10-11T20:00", "2026-10-11T23:00"],
    ]);
});
