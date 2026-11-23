import { expect, test } from "@playwright/test";
import { auditPage } from "./design-audit";

/**
 * 公開ページ（LP・ライセンス・利用規約・プライバシーポリシー）と、そこへの導線。
 * 権利表記は /licenses にまとめ、LP・設定・共有ページからリンクする。
 */
const CTHULHU =
  "「株式会社アークライト」及び「株式会社KADOKAWA」が権利を有する『クトゥルフ神話TRPG』シリーズの二次創作物です。";
const SWORD_WORLD = "『ソード・ワールド2.0/2.5』の、二次創作です。";
const EMOKLORE = "ダイスタス・コモンズ";
const PUBLIC_ROUTES = ["/", "/signin", "/licenses", "/terms", "/privacy", "/feedback"];

test("公開ページはログインなしで開け、デザイン検査に通る", async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route);
    await page.locator("main h1").first().waitFor();
    expect(await auditPage(page, { explanationBudget: false }), route).toEqual([]);
    const legal = page.getByRole("navigation", { name: "規約とライセンス" });
    await expect(legal.getByRole("link", { name: "ライセンス・権利表記" })).toBeVisible();
    await expect(legal.getByRole("link", { name: "利用規約" })).toBeVisible();
    await expect(legal.getByRole("link", { name: "プライバシーポリシー" })).toBeVisible();
    await expect(legal.getByRole("link", { name: "ご意見・不具合の報告" })).toBeVisible();
    // 問い合わせはフォームに集め、GitHub には送らない
    await expect(page.locator('a[href*="github.com/cp-20"]')).toHaveCount(0);
  }
});

test("LP はサーバーで描画し、絞った書体を先に読み、Web フォントの分割ファイルを読まない", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/")).text();
  // JS を待たずに本文が出る
  expect(html).toContain("卓が終わったら");
  // 書体の指定も HTML に入っている（CSS を待たずに書体を読み始める）。先読みの link は本番ビルドで head に出る
  expect(html).toMatch(/src:url\(\/fonts\/lp-sans\.[0-9a-f]{8}\.woff2\)/);
  expect(html).toMatch(/src:url\(\/fonts\/lp-display\.[0-9a-f]{8}\.woff2\)/);

  const fonts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fonts.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(500);
  expect(fonts.filter((f) => !f.startsWith("/fonts/lp-"))).toEqual([]);
  expect(new Set(fonts).size).toBe(2);
});

test("ご意見フォームは内容を API に送り、開く前の画面も添える", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/feedback", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/feedback?from=/sessions/s02");
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("内容を書いてください。");
  expect(sent).toBeNull();

  await page.getByRole("radio", { name: "不具合" }).click();
  await page.getByRole("textbox", { name: "内容" }).fill("ログの検索が効かない");
  await page.getByRole("textbox", { name: "連絡先（任意）" }).fill("X: @mikan");
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("heading", { name: "送りました" })).toBeVisible();
  expect(sent).toMatchObject({
    kind: "bug",
    body: "ログの検索が効かない",
    contact: "X: @mikan",
    page: "/sessions/s02",
    website: "",
  });
});

test("LP で選んでいる見た目は、押せる切り替えだけにある", async ({ page }) => {
  await page.goto("/");
  const group = page.getByRole("group", { name: "ログの表示切り替え" });
  await expect(group.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "true");
  const selected = page.locator(".is-active");
  const count = await selected.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(selected.nth(i)).toHaveAttribute("aria-pressed", "true");
  }
  await group.getByRole("button", { name: "ダイスだけ" }).click();
  await expect(group.getByRole("button", { name: "ダイスだけ" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "false");
});

test("権利表記は /licenses にまとまり、設定と共有ページから辿れる", async ({ page }) => {
  await page.goto("/licenses");
  const notices = page.getByRole("region", { name: "権利表記" });
  await expect(notices).toContainText(CTHULHU);
  await expect(notices).toContainText(SWORD_WORLD);
  await expect(notices).toContainText(EMOKLORE);
  await expect(notices.getByRole("img", { name: /ダイスタス・コモンズ/ })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: /サンプルデータをそのまま見る/ }).click({ force: true });
  // サンプルの読み込みは enterDemo と同じく遷移の待ち時間で待つ（全体を並べて走らせると 5 秒を超えることがある）
  await page.waitForURL(/\/home$/);
  await page.getByRole("navigation", { name: "メイン" }).first().waitFor();

  await page.goto("/settings");
  await page
    .getByRole("navigation", { name: "このサービスについて" })
    .getByRole("link", { name: "ライセンス・権利表記" })
    .click();
  await expect(page).toHaveURL(/\/licenses$/);

  const slugHandle = await page.waitForFunction(
    () => {
      const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
      const log = Object.values(st.logs ?? {}).find(
        (l) => (l as { systemId?: string }).systemId === "coc7" && (l as { slug?: string }).slug,
      ) as { slug: string } | undefined;
      return log?.slug ?? null;
    },
    undefined,
    { polling: 250 },
  );
  await page.goto(`/share/l/${(await slugHandle.jsonValue()) as string}`);
  await expect(page.getByText("クトゥルフ神話TRPG 7版 の二次創作物を含みます。")).toBeVisible();
  await page
    .getByRole("navigation", { name: "規約とライセンス" })
    .getByRole("link", { name: "ライセンス・権利表記" })
    .click();
  await expect(page).toHaveURL(/\/licenses$/);
});

test("LP のタイルの帯は流れ、動きを減らす設定では止まる", async ({ browser, page }) => {
  await page.goto("/");
  const track = page.locator(".pst-row-track").first();
  await expect(track).toHaveCSS("animation-name", "pst-marquee");
  await page.getByRole("button", { name: "ダイスだけ" }).click();
  await expect(page.getByText("ファンブル", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "秘匿タブ" }).click();
  await expect(page.getByText("秘匿 HO2 / 許可されたメンバーだけ表示")).toBeVisible();
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const still = await ctx.newPage();
  await still.goto("/");
  await expect(still.locator(".pst-row-track").first()).toHaveCSS("animation-name", "none");
  await ctx.close();
});

test("ログイン前にアプリの画面を開くとログイン画面に送られ、サンプルを始めると元の画面に戻る", async ({
  page,
}) => {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/signin\?next=%2Fsessions$/);
  const google = page.getByRole("button", { name: "Google でログイン" });
  await expect(google).toBeVisible();
  // Google の指定: 白の地・灰の枠・公式の G
  await expect(google).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(google).toHaveCSS("border-top-color", "rgb(116, 119, 117)");
  await expect(google.locator('img[src="/google-g.png"]')).toHaveCount(1);
  await page.getByRole("button", { name: "サンプルデータをそのまま見る" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  // 使い始めたあとにログインの画面を開くと、画面を挟まず行き先へ送られる
  await page.goto("/signin?next=%2Fcalendar");
  await expect(page).toHaveURL(/\/calendar$/);
});

test("共有ページは SNS 向けの題名と OG 画像を head に持ち、読めない記録は中身に触れない札になる", async ({
  request,
}) => {
  for (const [route, title] of [
    ["/share/l/e2e-no-such-log", "共有されたセッションの記録 | 卓譜"],
    ["/share/c/e2e-no-such-character", "共有されたキャラクター | 卓譜"],
  ] as const) {
    // SNS のクローラーには、題名などを流し込まずに head に入れて返す
    const html = await (await request.get(route, { headers: { "User-Agent": "Twitterbot/1.0" } })).text();
    expect(html).toContain(`<meta property="og:title" content="${title}"/>`);
    const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
    expect(image, route).toContain(`${route}/opengraph-image`);
    const res = await request.get(new URL(image!).pathname + new URL(image!).search, { maxRedirects: 0 });
    // 書体を取れない環境では LP の OG 画像に回す
    if (res.status() === 307) expect(res.headers().location).toBe("/opengraph-image.png");
    else {
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
    }
  }
});
