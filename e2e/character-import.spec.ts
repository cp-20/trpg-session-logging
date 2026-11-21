import { expect, test } from "@playwright/test";

test("ココフォリアの実データを画像付きで取り込み、失敗時は架空のキャラクターを作らない", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click({ force: true });
  await page.goto("/characters");
  await page.getByRole("button", { name: "キャラシから取り込む" }).first().click({ force: true });
  await page.getByRole("button", { name: /ファイル・コマから読む/ }).click({ force: true });
  await page.getByLabel(/コマ・キャラシの内容を貼り付け/).fill("not-json");
  await page.getByRole("button", { name: "内容を確認", exact: true }).click({ force: true });
  await expect(
    page.getByRole("alert").filter({ hasText: "キャラクターを読み取れませんでした" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "取り込む", exact: true })).toHaveCount(0);
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=";
  await page.getByLabel(/コマ・キャラシの内容を貼り付け/).fill(
    JSON.stringify({
      kind: "character",
      data: {
        name: "実データの探索者",
        iconUrl: image,
        memo: "観測所で働く天文学者",
        commands: "CC<=70 目星",
        status: [
          { label: "SAN", value: 0 },
          { label: "HP", value: 12 },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "内容を確認", exact: true }).click({ force: true });
  await expect(page.getByRole("img", { name: "取り込んだキャラクター画像" })).toHaveAttribute("src", image);
  // 名前・技能はキャラシのまま見せる（入力欄にしない）
  await expect(page.getByRole("heading", { name: "実データの探索者" })).toBeVisible();
  await expect(page.getByText("目星")).toBeVisible();
  await page.getByRole("button", { name: "取り込む", exact: true }).click({ force: true });
  await expect(page).toHaveURL(/\/characters\/ch_/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
        const character = Object.values(state.characters ?? {}).find(
          (value: any) => value.name === "実データの探索者",
        ) as any;
        return (
          character && {
            image: character.image,
            stats: character.stats,
            bio: character.bio,
            skill: character.sheet?.sections?.find((x: any) => x.id === "skills")?.entries?.[0],
          }
        );
      }),
    )
    .toEqual({
      image,
      stats: { san: 0, hp: 12 },
      bio: "観測所で働く天文学者",
      skill: { label: "目星", value: 70, group: "探索技能" },
    });
});
