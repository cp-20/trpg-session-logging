/**
 * Discord 連携の通し確認（pnpm run test:e2e:discord）。本物の Discord もブラウザ操作も要らない。
 * 偽の Discord（e2e/support/fake-discord.ts）が REST の呼び出しを記録し、署名つき Interaction はテスト鍵で自分で送る。
 * 流れ: ログイン → 卓 → /卓譜 つなぐ → チャンネルと卓をつなぐ → Discord の利用者をつなぐ（OAuth）→ 日程調整
 *  → Discord のボタンで回答 → 確定（予定とお知らせは 1 つずつ）→ 記録を Discord に投稿。
 */
import { expect, test, type Page } from "@playwright/test";
import { signInWithFakeGoogle } from "./support/emulator-auth";
import {
  buttonPress,
  FAKE_CHANNEL_ID,
  FAKE_DISCORD_USER,
  sendInteraction,
  slashCommand,
  startFakeDiscord,
  type FakeDiscord,
} from "./support/fake-discord";

test.setTimeout(90_000);
test.skip(process.env.DISCORD_E2E !== "1", "pnpm run test:e2e:discord で実行する");

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/takufu-app/databases/takufu/documents";

let discord: FakeDiscord;
test.beforeAll(async () => {
  discord = await startFakeDiscord();
});
test.afterAll(async () => {
  await discord?.close();
});

/** エミュレータの Firestore をルールなし（owner）で読む。ここで読むのは確かめるためだけ */
async function readDoc(path: string): Promise<any | null> {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  return decodeFields((await res.json()).fields ?? {});
}

function decodeValue(v: any): any {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return v;
}
function decodeFields(fields: Record<string, any>): any {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

async function finishOnboarding(page: Page) {
  await page.goto("/welcome?next=/tables");
  await page.getByRole("button", { name: "この ID にする" }).click();
  await page.getByRole("button", { name: "スキップ" }).click();
  await page.getByRole("button", { name: "スキップ" }).click();
  await page.getByRole("link", { name: "続きを開く" }).click();
  await expect(page).toHaveURL(/\/tables$/);
}

test("Discord 連携: つなぐ → 日程調整 → ボタンで回答 → 確定 → 記録の投稿", async ({ page, baseURL }) => {
  const stamp = Date.now().toString(36);
  const tableName = `E2E卓 ${stamp}`;
  await signInWithFakeGoogle(page, {
    sub: `g-${stamp}`,
    email: `gm-${stamp}@example.com`,
    name: "E2E GM",
  });
  await finishOnboarding(page);

  // 1. 卓を作る
  await page.getByRole("button", { name: "卓を作成" }).first().click();
  const tableDialog = page.getByRole("dialog");
  await tableDialog.getByLabel("卓名", { exact: true }).fill(tableName);
  await tableDialog.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/tables\/t_/);

  // 2. /卓譜 つなぐ（署名つき）→ 返事を書き換える先に出るリンクを取る
  discord.reset();
  const link = await sendInteraction(baseURL!, slashCommand("つなぐ"));
  expect(link.status).toBe(200);
  expect(link.body.type).toBe(5); // 遅らせた返事
  await expect
    .poll(() => discord.find("PATCH", /\/webhooks\/.+\/messages\/@original$/).length)
    .toBeGreaterThan(0);
  const original = JSON.stringify(discord.find("PATCH", /@original$/)[0]!.body);
  const code = /\/tables\/discord\?code=([\w-]+)/.exec(original)?.[1];
  expect(code, "つなぐリンクのコード").toBeTruthy();

  // 3. リンクを開いて、卓とチャンネルをつなぐ
  await page.goto(`/tables/discord?code=${code}`);
  await expect(page.getByText(`#e2e-channel`).first()).toBeVisible();
  await page.getByRole("button", { name: "つなぐ", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "チャンネルとつなぎました" })).toBeVisible();
  await page.getByRole("link", { name: "卓を開く" }).click();
  await expect(page.getByRole("group", { name: "Discord" }).getByText("#e2e-channel")).toBeVisible();

  // 4. Discord の利用者をつなぐ（OAuth。認可画面は偽物に差し替え、戻りは本物の route を通す）
  await page.route("https://discord.com/oauth2/authorize*", (route) => {
    const state = new URL(route.request().url()).searchParams.get("state")!;
    return route.fulfill({
      status: 302,
      headers: { Location: `${baseURL}/api/discord/oauth/callback?code=fake-code&state=${state}` },
    });
  });
  await page.goto("/settings");
  const startOAuth = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/discord/oauth"),
  );
  // 認証の確かめが終わる前に押すと取りこぼすので、始まるまで押し直す
  await expect(async () => {
    await page.getByRole("button", { name: "連携する" }).click({ timeout: 2000 });
    await Promise.race([
      startOAuth,
      page.waitForTimeout(2500).then(() => Promise.reject(new Error("oauth not started"))),
    ]);
  }).toPass({ timeout: 20_000 });
  await expect(
    page.getByText(`${FAKE_DISCORD_USER.global_name}（${FAKE_DISCORD_USER.username}）`),
  ).toBeVisible();
  expect(discord.find("POST", /^\/oauth2\/token$/)).toHaveLength(1);
  expect(discord.find("POST", /^\/oauth2\/token\/revoke$/)).toHaveLength(1);

  // 5. 日程調整を候補 2 つで作る → Discord に回答数とボタンつきで届く
  discord.reset();
  await page.goto("/calendar");
  await page.getByRole("button", { name: /日程調整をはじめる/ }).click();
  const pollDialog = page.getByRole("dialog");
  const pollTitle = `次回日程 ${stamp}`;
  await pollDialog.getByLabel("タイトル", { exact: true }).fill(pollTitle);
  await pollDialog.getByRole("button", { name: "今週土曜" }).click();
  await pollDialog.getByRole("button", { name: "今週日曜" }).click();
  await pollDialog.getByRole("button", { name: "日程調整を作成" }).click();
  await expect
    .poll(() => discord.find("POST", /\/channels\/\d+\/messages$/).length, { timeout: 20_000 })
    .toBe(1);
  const pollPost = discord.find("POST", /\/channels\/\d+\/messages$/)[0]!;
  expect(pollPost.path).toContain(FAKE_CHANNEL_ID);
  const pollBody = pollPost.body as any;
  const pollText = JSON.stringify(pollBody);
  expect(pollText).toContain(pollTitle);
  expect(pollText).toMatch(/○ 1　△ 0　× 0/); /* 作った人は全候補に ○ から始まる */
  const openId: string = pollBody.components[0].components[0].custom_id; // po:<eventId>:0
  expect(openId).toMatch(/^po:/);
  const eventId = openId.split(":")[1]!;

  // 6. Discord のボタンで、2 つ目の候補に × と答える（署名つき）
  const poll = await readDoc(`tablePolls/${eventId}`);
  expect(poll, "tablePolls に日程調整がある").toBeTruthy();
  expect(poll.candidates).toHaveLength(2);
  const ownerUid: string = poll.ownerId;
  const [, c2] = poll.candidates.map((c: any) => c.id as string);
  const answer = await sendInteraction(baseURL!, buttonPress(`pa:${eventId}:${c2}:ng:0`, true));
  expect(answer.status).toBe(200);
  await expect
    .poll(async () => (await readDoc(`tablePolls/${eventId}`))?.responses?.[ownerUid]?.[c2])
    .toBe("ng");
  await expect.poll(() => discord.find("PATCH", /\/channels\/\d+\/messages\/\d+$/).length).toBeGreaterThan(0);
  const edited = JSON.stringify(discord.find("PATCH", /\/channels\/\d+\/messages\/\d+$/).at(-1)!.body);
  expect(edited).toMatch(/○ 0　△ 0　× 1/);

  // 7. 卓譜で 1 つ目の候補を確定 → 予定とお知らせは 1 つずつ（競合の再発防止）
  discord.reset();
  await page.getByRole("button", { name: new RegExp(`^${pollTitle}`) }).click();
  const detail = page.getByRole("dialog");
  await detail
    .getByRole("button", { name: /で確定/ })
    .first()
    .click();
  await detail.getByRole("button", { name: "確定する" }).click();
  await expect
    .poll(() => discord.find("POST", /\/guilds\/\d+\/scheduled-events$/).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  // 続けて余計な呼び出しがないことを確かめるため、少し待つ
  await page.waitForTimeout(6000);
  expect(discord.find("POST", /\/guilds\/\d+\/scheduled-events$/)).toHaveLength(1);
  const confirmations = discord
    .find("POST", /\/channels\/\d+\/messages$/)
    .filter((c) => JSON.stringify(c.body).includes("予定が決まりました"));
  expect(confirmations).toHaveLength(1);

  // 8. 記録して「Discord に投稿」（メンバー限定の共有 → リンクだけ、題名は載せない）
  discord.reset();
  const sessionTitle = `秘密のセッション ${stamp}`;
  await page.goto("/upload");
  await page.getByRole("button", { name: "ログなしで記録する" }).click();
  await page.getByLabel("タイトル", { exact: true }).fill(sessionTitle);
  await page.getByRole("combobox", { name: "卓", exact: true }).click();
  await page.getByRole("option", { name: tableName }).click();
  await page.getByRole("button", { name: "記録する", exact: true }).click();
  await page.getByRole("button", { name: "Discord に投稿" }).click();
  await expect
    .poll(() => discord.find("POST", /\/channels\/\d+\/messages$/).length, { timeout: 30_000 })
    .toBe(1);
  const posted = JSON.stringify(discord.find("POST", /\/channels\/\d+\/messages$/)[0]!.body);
  expect(posted).toContain("/share/l/");
  expect(posted).toContain("メンバーだけ");
  expect(posted).not.toContain(sessionTitle);
});
