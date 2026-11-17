import { expect, test } from "@playwright/test";

test("ココフォリアの実データを画像付きで取り込み、失敗時は架空のキャラクターを作らない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click({ force: true });
  await page.goto("/#/characters");
  await page.getByRole("button", { name: "キャラシートを取り込む" }).click({ force: true });
  await page.getByLabel("キャラクターJSON").fill("not-json");
  await page.getByRole("button", { name: "内容を確認", exact: true }).click({ force: true });
  await expect(page.getByRole("alert")).toContainText("キャラクターを読み取れませんでした");
  await expect(page.getByRole("button", { name: "取り込む", exact: true })).toHaveCount(0);
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=";
  await page.getByLabel("キャラクターJSON").fill(JSON.stringify({ kind: "character", data: { name: "実データの探索者", iconUrl: image, memo: "観測所で働く天文学者", commands: "CC<=70 目星", status: [{ label: "SAN", value: 0 }, { label: "HP", value: 12 }] } }));
  await page.getByRole("button", { name: "内容を確認", exact: true }).click({ force: true });
  await expect(page.getByRole("img", { name: "取り込んだキャラクター画像" })).toHaveAttribute("src", image);
  await expect(page.getByLabel("名前", { exact: true })).toHaveValue("実データの探索者");
  await page.getByRole("button", { name: "取り込む", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/#\/characters\/ch_/);
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
    const character = Object.values(state.characters ?? {}).find((value: any) => value.name === "実データの探索者") as any;
    return character && { image: character.image, stats: character.stats, bio: character.bio };
  })).toEqual({ image, stats: { san: 0, hp: 12 }, bio: "観測所で働く天文学者" });
});
