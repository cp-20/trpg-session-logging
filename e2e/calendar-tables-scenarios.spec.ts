import { expect, test } from "@playwright/test";
import { auditPage, enterDemo } from "./design-audit";

test("卓の作成 → 日程調整の作成と確定 → カレンダー購読エンドポイントまで連動する", async ({ page }) => {
  await enterDemo(page);

  // 1. Create table (/tables)
  await page.goto("/tables");
  await page.getByRole("button", { name: "卓を作成" }).click();
  const tableDialog = page.getByRole("dialog");
  // メンバーは名前で探して足さない（P14）。作成後に招待リンクで招く
  await expect(tableDialog.getByLabel("参加者を検索")).toHaveCount(0);
  await tableDialog.getByLabel("卓名", { exact: true }).fill("週末ミステリ部");
  await tableDialog.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/tables\/t_/);
  await expect(page.getByRole("heading", { level: 1, name: "週末ミステリ部" })).toBeVisible();

  // 2. Create poll & confirm candidate (/calendar)
  await page.goto("/calendar");
  await page.getByRole("button", { name: /日程調整をはじめる/ }).click();
  const pollDialog = page.getByRole("dialog");
  await pollDialog.getByLabel("タイトル", { exact: true }).fill("ミステリ部・次回日程");
  await pollDialog.getByRole("button", { name: "日程調整を作成" }).click();

  // 「調整中の日程」の行（名前が卓名・候補日の要約まで続く）を開く
  const pollRow = page.getByRole("button", { name: /^ミステリ部・次回日程 / });
  await expect(pollRow).toBeVisible();
  await pollRow.click();
  const detailDialog = page.getByRole("dialog");
  await detailDialog
    .getByRole("button", { name: /で確定/ })
    .first()
    .click();
  await detailDialog.getByRole("button", { name: "確定する" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("takufu-state-v4");
        if (!raw) return null;
        const state = JSON.parse(raw);
        const ev = Object.values(state.events ?? {}).find(
          (e: any) => e.title === "ミステリ部・次回日程",
        ) as any;
        return ev?.status ?? null;
      }),
    )
    .toBe("confirmed");

  // 3. Verify live ICS subscription endpoint
  const icsRes = await page.request.get("/api/calendar/demo.ics");
  expect(icsRes.status()).toBe(200);
  expect(icsRes.headers()["content-type"]).toContain("text/calendar");
  const icsBody = await icsRes.text();
  expect(icsBody).toContain("BEGIN:VCALENDAR");
  expect(icsBody).toContain("END:VCALENDAR");
});

test("プロフィール編集モーダルで表示名と自己紹介を更新し、リロード後も維持される", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/users/u_mikan");

  await page.getByRole("button", { name: /プロフィールを編集/ }).click();
  const dialog = page.getByRole("dialog", { name: "プロフィールを編集" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("表示名", { exact: true }).fill("みかん（E2E検証）");
  await dialog.getByLabel("自己紹介", { exact: true }).fill("CoC・エモクロア中心に遊んでいます。");
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "みかん（E2E検証）" })).toBeVisible();
  await expect(page.getByText("CoC・エモクロア中心に遊んでいます。")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("takufu-state-v4");
        return raw ? JSON.parse(raw)?.users?.u_mikan?.name : null;
      }),
    )
    .toBe("みかん（E2E検証）");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "みかん（E2E検証）" })).toBeVisible();
});

test("日程調整は閲覧が既定で、回答と編集は別の画面。自分の予定は時間が重なる候補だけに出る", async ({
  page,
}) => {
  await enterDemo(page);
  // 本人が設定で許可した状態を再現する（11/29 夜は重なる・12/5 の昼は夜の候補と重ならない）
  await page.evaluate(() => {
    const key = "takufu-state-v4";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.prefs.googleBusy = {
      consentedAt: "2026-11-20T00:00:00.000Z",
      calendars: [{ id: "main", name: "自分", on: true }],
      countAllDay: false,
      ranges: [
        { calendarId: "main", start: "2026-11-29T13:00:00.000Z", end: "2026-11-29T14:00:00.000Z" },
        { calendarId: "main", start: "2026-12-05T03:00:00.000Z", end: "2026-12-05T04:00:00.000Z" },
        { calendarId: "main", start: "2026-12-05T15:00:00.000Z", end: "2026-12-06T15:00:00.000Z" },
      ],
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto("/tables/t_keizoku");
  await page.getByRole("button", { name: /継続探索者の間 定例卓/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radiogroup")).toHaveCount(0);
  await expect(dialog.getByText("長さ 3時間")).toBeVisible();
  await expect(dialog.getByText("21:30–24:30")).toHaveCount(0);
  // 重なるのは 11/29 21:30 開始の候補だけ（昼の予定・終日の予定では出さない）
  await expect(dialog.getByText("自分の予定あり")).toHaveCount(1);

  await dialog.getByRole("button", { name: /回答/ }).click();
  await expect(dialog.getByRole("radiogroup")).toHaveCount(3);
  await dialog.getByRole("radiogroup").first().getByRole("radio", { name: "× 不可" }).click();
  await dialog.getByRole("button", { name: "回答を保存" }).click();
  await expect(dialog.getByRole("radiogroup")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("takufu-state-v4")!).events.ev_keizoku_1.candidates[0].responses
            .u_mikan,
      ),
    )
    .toBe("ng");

  await dialog.getByRole("button", { name: "編集" }).click();
  await expect(page.getByRole("dialog", { name: "日程調整を編集" })).toBeVisible();
  await expect(page.getByLabel("候補開始時刻 1")).toHaveValue("21:30");
});

test("シナリオの追加は検索で見つからなかったときに出し、追加画面は URL 読み込みが先", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/scenarios");
  await expect(page.getByRole("button", { name: /シナリオを追加/ })).toHaveCount(0);
  await page.getByLabel("シナリオを検索").fill("まだ登録されていない作品");
  await page.getByRole("button", { name: /シナリオを追加/ }).click();
  await expect(page).toHaveURL(/\/scenarios\/new\?title=/);
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue("まだ登録されていない作品");

  await page.goto("/scenarios/new");
  await expect(page.getByRole("button", { name: "URLから読み込む" })).toHaveClass(/btn-primary/);
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "手で入力する" }).click();
  await expect(page.getByLabel("タイトル", { exact: true })).toBeVisible();
});

test("Google カレンダーの照らし合わせは設定で本人がオンにするまで使わない", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/settings");
  const toggle = page.getByRole("checkbox", { name: "Google カレンダーの空き時間を使う" });
  await expect(toggle).not.toBeChecked();
  expect(await auditPage(page)).toEqual([]);

  // カレンダー連携からも同じ設定を直接変えられる（設定へ行かせない）。予定のある日を手で入れる欄はない
  await page.goto("/calendar");
  await page.getByRole("button", { name: "カレンダー連携" }).click();
  const dialog = page.getByRole("dialog", { name: "カレンダー連携" });
  await expect(dialog.getByRole("checkbox", { name: "Google カレンダーの空き時間を使う" })).not.toBeChecked();
  await expect(dialog.getByRole("link", { name: "設定で変える" })).toHaveCount(0);
  await expect(dialog.getByText("予定のある日")).toHaveCount(0);
  expect(await auditPage(page)).toEqual([]);

  // アプリごとの登録のしかたは、要る人が開くガイド
  await dialog.getByRole("button", { name: "登録のしかた" }).click();
  const guide = page.getByRole("dialog", { name: "登録のしかた" });
  await expect(guide.locator("[data-guide]")).toContainText("Apple カレンダー");
  expect(await auditPage(page)).toEqual([]);
  // 上に重なったガイドだけが Esc で閉じる
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test("月の暦は凡例なしで種類が分かる（印の横に「候補」「記録」）", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/calendar");
  const month = page.locator("section[aria-labelledby=sec-month]");
  await expect(month.getByText("日程調整の候補", { exact: true })).toHaveCount(0);
  const cells = month.locator("[data-calendar-day]");
  // 予定の印は描画のあとに入るので、出そろうまで待つ
  await expect
    .poll(async () =>
      (await cells.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""))).some((l) =>
        /、(?:候補|記録) /.test(l),
      ),
    )
    .toBe(true);
});
