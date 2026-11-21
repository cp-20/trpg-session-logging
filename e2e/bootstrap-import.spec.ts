import { expect, test } from "@playwright/test";
import { enterDemo } from "./design-audit";

test("キャラエノ URL 取り込み → 更新 → リロード復元まで動作する", async ({ page }) => {
  let iacharaCalls = 0;
  const baseFetchedAt = new Date().toISOString();

  await page.route("**/api/import/external", async (route) => {
    const req = route.request();
    const body = req.postDataJSON() as { url?: string };
    const targetUrl = body?.url ?? "";
    if (targetUrl.includes("charaeno.com")) {
      iacharaCalls++;
      const san = iacharaCalls === 1 ? 68 : 61;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          kind: "character",
          provider: "charaeno",
          providerLabel: "キャラエノ",
          url: "https://charaeno.com/7th/e2eSampleCharaeno0001",
          fetchedAt: iacharaCalls === 1 ? baseFetchedAt : new Date(Date.now() + 60_000).toISOString(),
          contentHash: `e2e_hash_${iacharaCalls}`,
          character: {
            name: "七瀬 律",
            systemId: "coc7",
            memo: "職業: 救急医\n冷静な医師。",
            stats: { san, hp: 12, mp: 14 },
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await enterDemo(page);
  await page.goto("/characters");
  await page.getByRole("button", { name: "キャラシから取り込む" }).first().click();
  await page
    .getByPlaceholder("https://charaeno.com/7th/…")
    .fill("https://charaeno.com/7th/e2eSampleCharaeno0001");
  await page.getByRole("button", { name: "読み込む", exact: true }).click();

  await expect(page.getByRole("heading", { name: "七瀬 律" })).toBeVisible();
  await page.getByRole("button", { name: "取り込む", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/ch_/);

  await expect(page.getByRole("button", { name: "更新", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  // 更新の結果は状態表示（role=status）で知らせる。同じ文言は能力値の増減欄にも出るので、状態表示に絞る
  await expect(page.getByRole("status").filter({ hasText: "SAN 68→61" })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("takufu-state-v4");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ch = Object.values(parsed.characters ?? {}).find((c: any) => c.name === "七瀬 律") as any;
        return ch
          ? { san: ch.stats?.san, hash: ch.externalSync?.contentHash, growthLen: ch.growth?.length }
          : null;
      }),
    )
    .toEqual({ san: 61, hash: "e2e_hash_2", growthLen: 1 });

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "七瀬 律" })).toBeVisible();
});

test("ゆとシートⅡ JSON やエモクロアのテキスト貼り付けからキャラクターを取り込める", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/characters");

  await page.getByRole("button", { name: "キャラシから取り込む" }).first().click();
  await page.getByRole("button", { name: /ファイル・コマから読む/ }).click();

  await page.getByLabel(/コマ・キャラシの内容を貼り付け/).fill(
    JSON.stringify([
      {
        characterName: "リリア",
        race: "ルーンフォーク",
        job: "グラップラー",
        hpTotal: 42,
        mpTotal: 18,
      },
      {
        system: "emoklore",
        name: "久遠 透",
        von: 4,
        taisyo: 7,
      },
    ]),
  );

  await page.getByRole("button", { name: "内容を確認", exact: true }).click();
  await expect(page.getByText(/2件のキャラクターを読み取りました/)).toBeVisible();
  await page.getByRole("button", { name: "2件を取り込む" }).click();

  await expect(page.getByText("リリア")).toBeVisible();
  await expect(page.getByText("久遠 透")).toBeVisible();
});

test("通過履歴の CSV 一括取り込みと BOOTH URL からのシナリオ自動補完が永続化される", async ({ page }) => {
  await page.route("**/api/import/external", async (route) => {
    const body = route.request().postDataJSON() as { url?: string };
    if (body?.url?.includes("booth.pm")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          kind: "scenario",
          provider: "booth",
          providerLabel: "BOOTH",
          url: "https://booth.pm/ja/items/881122",
          contentHash: "booth_hash_1",
          fetchedAt: new Date().toISOString(),
          scenario: {
            title: "硝子細工の天文台",
            author: "星見亭",
            systemId: "coc7",
            source: "booth",
            sourceUrl: "https://booth.pm/ja/items/881122",
            tags: ["ソロ", "謎解き"],
            description: "星を観測する天文台を舞台にした作品。",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await enterDemo(page);

  // 1. Upload 通過履歴一括取り込み
  await page.goto("/upload");
  await page.getByRole("button", { name: /通過履歴を取り込む/ }).click();
  await page.getByLabel(/表データ/).fill(`日付,シナリオ,システム,キャラ,時間,メモ
2026-07-05,海も枯れるまで,CoC7,相葉 陽向,5時間,生還
2026-08-19,カタシロ,CoC7,相葉 陽向,2時間,対話`);
  await page.getByRole("button", { name: "内容を確認", exact: true }).click();
  await expect(page.getByText(/2件の通過記録を読み取りました/)).toBeVisible();
  await page.getByRole("button", { name: "2件を取り込む" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByText("カタシロ")).toBeVisible();

  // 2. ScenarioNew BOOTH URL 自動補完
  await page.goto("/scenarios/new");
  await page.getByLabel(/配布ページのURL/).fill("https://booth.pm/ja/items/881122");
  await page.getByRole("button", { name: "URLから読み込む" }).click();
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue("硝子細工の天文台");
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page).toHaveURL(/\/scenarios\/sc_/);
  await expect(page.getByRole("heading", { level: 1, name: "硝子細工の天文台" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "硝子細工の天文台" })).toBeVisible();
});
